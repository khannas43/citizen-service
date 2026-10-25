package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mockingDetails;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionLifecycleService;
import org.citizen.formdefinition.application.FormDefinitionNewDraftService;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.application.FormDefinitionStore;
import org.citizen.formdefinition.application.StaleRevisionException;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.mockito.invocation.Invocation;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C4.1 integration tests proving the shared PostgreSQL service mutation advisory lock
 * ({@code pg_advisory_xact_lock(hashtextextended(serviceId, 0))}) genuinely serializes a
 * concurrent clone ({@link FormDefinitionNewDraftService#createFromVersion}) against a concurrent
 * lifecycle transition ({@link FormDefinitionLifecycleService#transition}) on the same service,
 * in both possible wins-the-race orders, and that neither operation ever loads the source
 * definition before the lock is held.
 *
 * <p>Determinism is achieved via {@link CountDownLatch}-gated {@code doAnswer} instrumentation on
 * a {@link SpyBean} of {@link FormDefinitionStore} (never {@code Thread.sleep} for correctness);
 * polling of the contending thread's {@link Thread.State} is used only as a non-blocking
 * readiness check.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionCloneLifecycleRaceIT {

    static final Instant FIXED_INSTANT = Instant.parse("2026-07-24T12:00:00Z");

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
        }
    }

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("egov_db")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    private static final String CREATE_PATH = "/api/v1/form-definitions";
    private static final String LIFECYCLE_PATH = "/api/v1/form-definitions/lifecycle-transitions";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @SpyBean
    private FormDefinitionStore store;

    @Autowired
    private FormDefinitionNewDraftService newDraftService;

    @Autowired
    private FormDefinitionLifecycleService lifecycleService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private final ObjectMapper mapper = new ObjectMapper();

    // ---------------------------------------------------------------- fixtures / helpers

    private ObjectNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/validation/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Missing test fixture: " + name);
            }
            return (ObjectNode) mapper.readTree(in);
        }
    }

    private ObjectNode validDraft(String serviceId, int version) throws IOException {
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", version);
        doc.put("status", "draft");
        return doc;
    }

    private static ObjectNode cloneBody(String createdBy) {
        ObjectNode body = new ObjectMapper().createObjectNode();
        body.put("createdBy", createdBy);
        return body;
    }

    private static ObjectNode transitionBody(String targetStatus, String actorId) {
        ObjectNode body = new ObjectMapper().createObjectNode();
        body.put("targetStatus", targetStatus);
        body.put("actorId", actorId);
        return body;
    }

    private String etagOf(MvcResult result) {
        return result.getResponse().getHeader(HttpHeaders.ETAG);
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private MvcResult transitionViaHttp(String serviceId, int version, String ifMatch, String body)
            throws Exception {
        return mockMvc
                .perform(
                        post(LIFECYCLE_PATH)
                                .param("serviceId", serviceId)
                                .param("version", String.valueOf(version))
                                .header(HttpHeaders.IF_MATCH, ifMatch)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andReturn();
    }

    /** Immutable snapshot of a freshly-published (version 1) definition, for race setup. */
    private record PublishedFixture(String serviceId, int version, String etag, JsonNode definition) {}

    /**
     * Publishes a brand-new service to {@code published} via the real HTTP surface (create draft
     * -> submitted -> approved -> published), returning the resulting ETag and definition.
     */
    private PublishedFixture publishDefinition(String serviceId) throws Exception {
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult =
                mockMvc
                        .perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isCreated())
                        .andReturn();
        String etag = etagOf(createResult);

        MvcResult submitResult =
                transitionViaHttp(serviceId, 1, etag, transitionBody("submitted", "alice").toString());
        assertThat(submitResult.getResponse().getStatus()).isEqualTo(200);

        MvcResult approveResult =
                transitionViaHttp(serviceId, 1, etagOf(submitResult), transitionBody("approved", "bob").toString());
        assertThat(approveResult.getResponse().getStatus()).isEqualTo(200);

        MvcResult publishResult =
                transitionViaHttp(
                        serviceId, 1, etagOf(approveResult), transitionBody("published", "carol").toString());
        assertThat(publishResult.getResponse().getStatus()).isEqualTo(200);

        return new PublishedFixture(serviceId, 1, etagOf(publishResult), bodyOf(publishResult).deepCopy());
    }

    private long countRowsForService(String serviceId) {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definitions WHERE service_id = ?",
                        Long.class,
                        serviceId);
        return count == null ? 0L : count;
    }

    private long countEventRows(String serviceId, int version) {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definition_lifecycle_events"
                                + " WHERE service_id = ? AND version = ?",
                        Long.class,
                        serviceId,
                        version);
        return count == null ? 0L : count;
    }

    private List<Map<String, Object>> selectEventsOrdered(String serviceId, int version) {
        return jdbcTemplate.queryForList(
                "SELECT from_status, to_status, actor_id"
                        + " FROM form_definition.form_definition_lifecycle_events"
                        + " WHERE service_id = ? AND version = ? ORDER BY event_id ASC",
                serviceId,
                version);
    }

    /** Reads a snapshot in a brand-new, independently-committed transaction (post-commit view). */
    private FormDefinitionSnapshot freshSnapshot(String serviceId, int version) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        FormDefinitionSnapshot result =
                tx.execute(status -> store.findSnapshot(serviceId, version).orElseThrow());
        return result;
    }

    /**
     * Asserts that, among all recorded invocations on the {@code store} spy, the FIRST
     * {@code acquireServiceMutationLock(serviceId)} call happened strictly before the FIRST
     * {@code findSnapshot(serviceId, version)} call (FB-C4.1: no pre-lock source load).
     *
     * <p>Plain {@code times(1)} {@code InOrder} verification is unsuitable here because the real
     * store legitimately re-acquires the same held advisory lock multiple times per operation
     * (from {@code allocateNextVersion}/{@code create}/{@code applyLifecycleTransition}), and two
     * racing threads both call {@code findSnapshot} with identical arguments.
     */
    private void assertLockPrecedesFind(String serviceId, int version) {
        List<Invocation> invocations = new ArrayList<>(mockingDetails(store).getInvocations());
        invocations.sort(Comparator.comparingInt(Invocation::getSequenceNumber));

        Integer lockSeq = null;
        Integer findSeq = null;
        for (Invocation invocation : invocations) {
            String methodName = invocation.getMethod().getName();
            if (lockSeq == null
                    && "acquireServiceMutationLock".equals(methodName)
                    && serviceId.equals(invocation.getArgument(0))) {
                lockSeq = invocation.getSequenceNumber();
            }
            if (findSeq == null
                    && "findSnapshot".equals(methodName)
                    && serviceId.equals(invocation.getArgument(0))
                    && Integer.valueOf(version).equals(invocation.getArgument(1))) {
                findSeq = invocation.getSequenceNumber();
            }
        }

        assertThat(lockSeq).as("acquireServiceMutationLock(%s) was never invoked", serviceId).isNotNull();
        assertThat(findSeq).as("findSnapshot(%s, %d) was never invoked", serviceId, version).isNotNull();
        assertThat(lockSeq)
                .as("service mutation lock must be acquired strictly before the source is loaded")
                .isLessThan(findSeq);
    }

    /**
     * Polls (never sleeps blindly for "correctness") until {@code thread} is observably blocked
     * ({@link Thread.State#BLOCKED}, {@link Thread.State#WAITING}, or {@link
     * Thread.State#TIMED_WAITING}) or the timeout elapses. A blocking native JDBC socket read
     * waiting on the real PostgreSQL advisory lock commonly reports as {@code RUNNABLE} rather
     * than {@code BLOCKED}/{@code WAITING} (JVM native-call thread-state semantics), so the only
     * failure condition we treat as a genuine bug is the contending thread completing (racing
     * ahead) before the deadline — which would mean the advisory lock failed to serialize it.
     */
    private void awaitContenderBlockedOrStillPending(Thread thread, Duration timeout) throws InterruptedException {
        long deadlineNanos = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadlineNanos) {
            Thread.State state = thread.getState();
            if (state == Thread.State.TERMINATED) {
                throw new AssertionError(
                        "Thread " + thread.getName() + " completed before lock contention was expected");
            }
            if (state == Thread.State.BLOCKED
                    || state == Thread.State.WAITING
                    || state == Thread.State.TIMED_WAITING) {
                return;
            }
            Thread.sleep(20);
        }
        if (thread.getState() == Thread.State.TERMINATED) {
            throw new AssertionError(
                    "Thread " + thread.getName() + " completed before lock contention was expected");
        }
    }

    // ================================================================== Test A: clone wins

    @Test
    void cloneWinsRaceRetireBlocksThenAppliesAfterCloneCommits() throws Exception {
        String serviceId = "c41-race-clone-wins";
        PublishedFixture published = publishDefinition(serviceId);

        CountDownLatch cloneLocked = new CountDownLatch(1);
        CountDownLatch allowCloneContinue = new CountDownLatch(1);

        doAnswer(
                        invocation -> {
                            Object result = invocation.callRealMethod();
                            if ("c41-clone".equals(Thread.currentThread().getName())) {
                                cloneLocked.countDown();
                                allowCloneContinue.await();
                            }
                            return result;
                        })
                .when(store)
                .acquireServiceMutationLock(anyString());

        clearInvocations(store);

        AtomicReference<FormDefinitionSnapshot> cloneResult = new AtomicReference<>();
        AtomicReference<Throwable> cloneError = new AtomicReference<>();
        Thread cloneThread =
                new Thread(
                        () -> {
                            try {
                                cloneResult.set(
                                        newDraftService.createFromVersion(
                                                serviceId,
                                                String.valueOf(published.version()),
                                                published.etag(),
                                                cloneBody("dana")));
                            } catch (Throwable t) {
                                cloneError.set(t);
                            }
                        },
                        "c41-clone");
        cloneThread.start();

        assertThat(cloneLocked.await(10, TimeUnit.SECONDS)).isTrue();

        AtomicReference<FormDefinitionSnapshot> retireResult = new AtomicReference<>();
        AtomicReference<Throwable> retireError = new AtomicReference<>();
        Thread retireThread =
                new Thread(
                        () -> {
                            try {
                                retireResult.set(
                                        lifecycleService.transition(
                                                serviceId,
                                                String.valueOf(published.version()),
                                                published.etag(),
                                                transitionBody("retired", "dave")));
                            } catch (Throwable t) {
                                retireError.set(t);
                            }
                        },
                        "c41-retire");
        retireThread.start();

        // Deterministic readiness check (no Thread.sleep-for-correctness): retire must not be
        // able to complete while clone still holds the advisory lock.
        awaitContenderBlockedOrStillPending(retireThread, Duration.ofSeconds(10));

        allowCloneContinue.countDown();

        cloneThread.join(TimeUnit.SECONDS.toMillis(30));
        retireThread.join(TimeUnit.SECONDS.toMillis(30));

        assertThat(cloneThread.isAlive()).isFalse();
        assertThat(retireThread.isAlive()).isFalse();
        assertThat(cloneError.get()).isNull();
        assertThat(retireError.get()).isNull();

        FormDefinitionSnapshot clonedDraft = cloneResult.get();
        assertThat(clonedDraft).isNotNull();
        assertThat(clonedDraft.status()).isEqualTo(FormDefinitionStatus.draft);
        int newVersion = clonedDraft.definition().get("version").asInt();
        assertThat(newVersion).isEqualTo(published.version() + 1);

        FormDefinitionSnapshot retiredResult = retireResult.get();
        assertThat(retiredResult).isNotNull();
        assertThat(retiredResult.status()).isEqualTo(FormDefinitionStatus.retired);

        // ---- post-commit reads in a brand-new transaction
        FormDefinitionSnapshot freshDraft = freshSnapshot(serviceId, newVersion);
        assertThat(freshDraft.status()).isEqualTo(FormDefinitionStatus.draft);

        FormDefinitionSnapshot freshSource = freshSnapshot(serviceId, published.version());
        assertThat(freshSource.status()).isEqualTo(FormDefinitionStatus.retired);
        assertThat(freshSource.definition().get("jsonSchema"))
                .isEqualTo(published.definition().get("jsonSchema"));
        assertThat(freshSource.definition().get("uiSchema")).isEqualTo(published.definition().get("uiSchema"));
        assertThat(freshSource.definition().get("meta")).isEqualTo(published.definition().get("meta"));

        // ---- no duplicate versions; event log has the retire event
        assertThat(countRowsForService(serviceId)).isEqualTo(2);
        assertThat(countEventRows(serviceId, published.version())).isEqualTo(4);
        List<Map<String, Object>> events = selectEventsOrdered(serviceId, published.version());
        assertThat(events).hasSize(4);
        assertThat(events.get(3).get("to_status")).isEqualTo("retired");
        assertThat(events.get(3).get("actor_id")).isEqualTo("dave");

        // ---- FB-C4.1 persistence-context regression: clone path locks before it loads the source.
        assertLockPrecedesFind(serviceId, published.version());
    }

    @Test
    void cloneAcquiresLockBeforeLoadingSourceStandalone() throws Exception {
        String serviceId = "c41-persistence-context-regression";
        PublishedFixture published = publishDefinition(serviceId);

        clearInvocations(store);

        FormDefinitionSnapshot cloned =
                newDraftService.createFromVersion(
                        serviceId, String.valueOf(published.version()), published.etag(), cloneBody("dana"));

        assertThat(cloned.status()).isEqualTo(FormDefinitionStatus.draft);

        assertLockPrecedesFind(serviceId, published.version());
    }

    // ================================================================== Test B: retirement wins

    @Test
    void retirementWinsRaceCloneBlocksThenThrowsStaleRevision() throws Exception {
        String serviceId = "c41-race-retire-wins";
        PublishedFixture published = publishDefinition(serviceId);

        CountDownLatch retireLocked = new CountDownLatch(1);
        CountDownLatch allowRetireContinue = new CountDownLatch(1);

        doAnswer(
                        invocation -> {
                            Object result = invocation.callRealMethod();
                            if ("c41-retire".equals(Thread.currentThread().getName())) {
                                retireLocked.countDown();
                                allowRetireContinue.await();
                            }
                            return result;
                        })
                .when(store)
                .acquireServiceMutationLock(anyString());

        clearInvocations(store);

        AtomicReference<FormDefinitionSnapshot> retireResult = new AtomicReference<>();
        AtomicReference<Throwable> retireError = new AtomicReference<>();
        Thread retireThread =
                new Thread(
                        () -> {
                            try {
                                retireResult.set(
                                        lifecycleService.transition(
                                                serviceId,
                                                String.valueOf(published.version()),
                                                published.etag(),
                                                transitionBody("retired", "dave")));
                            } catch (Throwable t) {
                                retireError.set(t);
                            }
                        },
                        "c41-retire");
        retireThread.start();

        assertThat(retireLocked.await(10, TimeUnit.SECONDS)).isTrue();

        AtomicReference<FormDefinitionSnapshot> cloneResult = new AtomicReference<>();
        AtomicReference<Throwable> cloneError = new AtomicReference<>();
        Thread cloneThread =
                new Thread(
                        () -> {
                            try {
                                cloneResult.set(
                                        newDraftService.createFromVersion(
                                                serviceId,
                                                String.valueOf(published.version()),
                                                published.etag(),
                                                cloneBody("dana")));
                            } catch (Throwable t) {
                                cloneError.set(t);
                            }
                        },
                        "c41-clone");
        cloneThread.start();

        awaitContenderBlockedOrStillPending(cloneThread, Duration.ofSeconds(10));

        allowRetireContinue.countDown();

        retireThread.join(TimeUnit.SECONDS.toMillis(30));
        cloneThread.join(TimeUnit.SECONDS.toMillis(30));

        assertThat(retireThread.isAlive()).isFalse();
        assertThat(cloneThread.isAlive()).isFalse();
        assertThat(retireError.get()).isNull();
        assertThat(retireResult.get()).isNotNull();
        assertThat(retireResult.get().status()).isEqualTo(FormDefinitionStatus.retired);

        assertThat(cloneResult.get()).isNull();
        assertThat(cloneError.get()).isInstanceOf(StaleRevisionException.class);

        // No new draft row was ever created for this serviceId beyond the (now retired) published version.
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    // ================================================================== Test C: distinct hash keys

    @Test
    void hashtextextendedProducesDistinctKeysForDistinctServiceIds() {
        String serviceIdA = "c41-hash-key-service-a";
        String serviceIdB = "c41-hash-key-service-b";

        Map<String, Object> row =
                jdbcTemplate.queryForMap(
                        "SELECT hashtextextended(?, 0) AS hash_a, hashtextextended(?, 0) AS hash_b",
                        serviceIdA,
                        serviceIdB);

        assertThat(row.get("hash_a")).isNotNull();
        assertThat(row.get("hash_b")).isNotNull();
        assertThat(row.get("hash_a")).isNotEqualTo(row.get("hash_b"));
    }
}
