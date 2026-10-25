package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionETag;
import org.citizen.formdefinition.application.StaleRevisionException;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceLifecycleService;
import org.citizen.formdefinition.governance.GovernanceCapability;
import org.citizen.formdefinition.governance.GovernancePrincipal;
import org.citizen.formdefinition.governance.GovernancePrincipalProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-E1 MockMvc + PostgreSQL integration for the secured governance boundary. Uses a test {@link
 * GovernancePrincipalProvider} bean — not the production fail-closed default (covered separately).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
@Import(FormDefinitionGovernanceEndpointIT.GovernanceTestPrincipalConfig.class)
class FormDefinitionGovernanceEndpointIT {

    static final Instant FIXED_INSTANT = Instant.parse("2026-07-26T12:00:00Z");

    static final ThreadLocal<GovernancePrincipal> CURRENT = new ThreadLocal<>();

    @TestConfiguration
    static class GovernanceTestPrincipalConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
        }

        @Bean
        @Primary
        GovernancePrincipalProvider testGovernancePrincipalProvider() {
            return () -> Optional.ofNullable(CURRENT.get());
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
    private static final String TECH_LIFECYCLE = "/api/v1/form-definitions/lifecycle-transitions";
    private static final String GOV_QUEUE = "/api/v1/form-definitions/governance/queue";
    private static final String GOV_DETAIL = "/api/v1/form-definitions/governance/detail";
    private static final String GOV_LIFECYCLE =
            "/api/v1/form-definitions/governance/lifecycle-transitions";
    private static final String PUBLISHED = "/api/v1/form-definitions/published/latest";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionGovernanceLifecycleService governanceLifecycleService;

    private final ObjectMapper mapper = new ObjectMapper();

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

    private String createDraft(String serviceId, int version) throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(CREATE_PATH)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(validDraft(serviceId, version))))
                        .andExpect(status().isCreated())
                        .andReturn();
        return result.getResponse().getHeader(HttpHeaders.ETAG);
    }

    private String techTransition(String serviceId, int version, String etag, String target, String actor)
            throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", target);
        body.put("actorId", actor);
        MvcResult result =
                mockMvc.perform(
                                post(TECH_LIFECYCLE)
                                        .param("serviceId", serviceId)
                                        .param("version", String.valueOf(version))
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(body)))
                        .andExpect(status().isOk())
                        .andReturn();
        return result.getResponse().getHeader(HttpHeaders.ETAG);
    }

    private void withPrincipal(GovernancePrincipal principal, ThrowingRunnable action) throws Exception {
        CURRENT.set(principal);
        try {
            action.run();
        } finally {
            CURRENT.remove();
        }
    }

    private GovernancePrincipal fullPrincipal(String actor) {
        return GovernancePrincipal.of(
                actor,
                EnumSet.of(
                        GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE,
                        GovernanceCapability.APPROVE_FORM_DEFINITION,
                        GovernanceCapability.PUBLISH_FORM_DEFINITION));
    }

    private GovernancePrincipal readOnly(String actor) {
        return GovernancePrincipal.of(
                actor, EnumSet.of(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE));
    }

    private GovernancePrincipal approveOnly(String actor) {
        return GovernancePrincipal.of(
                actor, EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
    }

    private GovernancePrincipal publishOnly(String actor) {
        return GovernancePrincipal.of(
                actor, EnumSet.of(GovernanceCapability.PUBLISH_FORM_DEFINITION));
    }

    @FunctionalInterface
    interface ThrowingRunnable {
        void run() throws Exception;
    }

    @Test
    void failClosedWithoutPrincipalReturns401() throws Exception {
        CURRENT.remove();
        mockMvc.perform(get(GOV_QUEUE))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("governance_unauthenticated"));
    }

    @Test
    void forbiddenWithoutReadCapability() throws Exception {
        withPrincipal(
                approveOnly("approver-only"),
                () ->
                        mockMvc.perform(get(GOV_QUEUE))
                                .andExpect(status().isForbidden())
                                .andExpect(jsonPath("$.code").value("governance_forbidden")));
    }

    @Test
    void authorizedQueueReturnsOkWithItemsArray() throws Exception {
        withPrincipal(
                fullPrincipal("gov-empty"),
                () ->
                        mockMvc.perform(get(GOV_QUEUE).param("limit", "10"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.items").isArray())
                                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store")));
    }

    @Test
    void queueIncludesSubmittedAndApprovedExcludesOthersAndIsMetadataOnly() throws Exception {
        String sid = "e1-queue-mix";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech-submitter");

        createDraft("e1-queue-draft-only", 1);

        String pubSid = "e1-queue-published";
        String pubEtag = createDraft(pubSid, 1);
        pubEtag = techTransition(pubSid, 1, pubEtag, "submitted", "tech");
        pubEtag = techTransition(pubSid, 1, pubEtag, "approved", "tech");
        techTransition(pubSid, 1, pubEtag, "published", "tech");

        String approvedSid = "e1-queue-approved";
        String aEtag = createDraft(approvedSid, 1);
        aEtag = techTransition(approvedSid, 1, aEtag, "submitted", "tech");
        techTransition(approvedSid, 1, aEtag, "approved", "tech");

        withPrincipal(
                fullPrincipal("gov-reader"),
                () -> {
                    MvcResult result =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "50"))
                                    .andExpect(status().isOk())
                                    .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                                    .andReturn();
                    JsonNode body = mapper.readTree(result.getResponse().getContentAsByteArray());
                    assertThat(body.has("items")).isTrue();
                    assertThat(body.path("items").isArray()).isTrue();
                    boolean sawSubmitted = false;
                    boolean sawApproved = false;
                    for (JsonNode item : body.path("items")) {
                        assertThat(item.path("serviceId").isTextual()).isTrue();
                        assertThat(item.path("version").isIntegralNumber()).isTrue();
                        assertThat(item.path("status").isTextual()).isTrue();
                        assertThat(item.size()).isEqualTo(3);
                        String status = item.path("status").asText();
                        assertThat(status).isIn("submitted", "approved");
                        assertThat(item.has("audit")).isFalse();
                        assertThat(item.has("definition")).isFalse();
                        if (sid.equals(item.path("serviceId").asText())) {
                            sawSubmitted = true;
                            assertThat(status).isEqualTo("submitted");
                        }
                        if (approvedSid.equals(item.path("serviceId").asText())) {
                            sawApproved = true;
                            assertThat(status).isEqualTo("approved");
                        }
                        assertThat(item.path("serviceId").asText()).isNotEqualTo(pubSid);
                        assertThat(item.path("serviceId").asText()).isNotEqualTo("e1-queue-draft-only");
                    }
                    assertThat(sawSubmitted).isTrue();
                    assertThat(sawApproved).isTrue();
                    String text = result.getResponse().getContentAsString();
                    assertThat(text).doesNotContain("gov-reader");
                    assertThat(text).doesNotContain("APPROVE_FORM_DEFINITION");
                    assertThat(text).doesNotContain("ETag");
                });
    }

    @Test
    void keysetPaginationAndInvalidPairedCursorAndLimitBounds() throws Exception {
        for (int i = 1; i <= 3; i++) {
            String sid = "e1-page-a" + i;
            String etag = createDraft(sid, 1);
            techTransition(sid, 1, etag, "submitted", "tech");
        }

        withPrincipal(
                fullPrincipal("gov-page"),
                () -> {
                    MvcResult first =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "2"))
                                    .andExpect(status().isOk())
                                    .andExpect(jsonPath("$.items.length()").value(2))
                                    .andExpect(jsonPath("$.nextCursor.serviceId").exists())
                                    .andExpect(jsonPath("$.nextCursor.version").exists())
                                    .andReturn();
                    JsonNode cursor =
                            mapper.readTree(first.getResponse().getContentAsByteArray())
                                    .path("nextCursor");

                    mockMvc.perform(
                                    get(GOV_QUEUE)
                                            .param("afterServiceId", cursor.path("serviceId").asText())
                                            .param("afterVersion", cursor.path("version").asText())
                                            .param("limit", "2"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.items").isArray());

                    mockMvc.perform(get(GOV_QUEUE).param("afterServiceId", "svc-only"))
                            .andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.code").value("invalid_pagination"));

                    mockMvc.perform(get(GOV_QUEUE).param("limit", "101"))
                            .andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.code").value("invalid_pagination"));
                });
    }

    @Test
    void detailReturnsEtagForEligibleAndHidesContentWhenUnauthorized() throws Exception {
        String sid = "e1-detail-1";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech");

        CURRENT.remove();
        mockMvc.perform(get(GOV_DETAIL).param("serviceId", sid).param("version", "1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.serviceId").doesNotExist())
                .andExpect(jsonPath("$.jsonSchema").doesNotExist());

        withPrincipal(
                approveOnly("no-read"),
                () ->
                        mockMvc.perform(get(GOV_DETAIL).param("serviceId", sid).param("version", "1"))
                                .andExpect(status().isForbidden())
                                .andExpect(jsonPath("$.jsonSchema").doesNotExist()));

        String finalEtag = etag;
        withPrincipal(
                fullPrincipal("detail-reader"),
                () ->
                        mockMvc.perform(get(GOV_DETAIL).param("serviceId", sid).param("version", "1"))
                                .andExpect(status().isOk())
                                .andExpect(header().string(HttpHeaders.ETAG, finalEtag))
                                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                                .andExpect(jsonPath("$.status").value("submitted"))
                                .andExpect(jsonPath("$.serviceId").value(sid)));

        withPrincipal(
                fullPrincipal("detail-reader"),
                () ->
                        mockMvc.perform(
                                        get(GOV_DETAIL)
                                                .param("serviceId", sid)
                                                .param("version", "99"))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("governance_definition_not_found")));
    }

    @Test
    void detailRejectsIneligibleStatusesAndCorruptStoredRows() throws Exception {
        String draftSid = "e1-detail-draft";
        createDraft(draftSid, 1);
        withPrincipal(
                fullPrincipal("reader"),
                () ->
                        mockMvc.perform(
                                        get(GOV_DETAIL)
                                                .param("serviceId", draftSid)
                                                .param("version", "1"))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("governance_definition_not_found")));

        String corruptSid = "e1-detail-corrupt";
        String etag = createDraft(corruptSid, 1);
        techTransition(corruptSid, 1, etag, "submitted", "tech");
        jdbcTemplate.update(
                """
                UPDATE form_definition.form_definitions
                SET definition = jsonb_set(definition, '{status}', '"draft"', false)
                WHERE service_id = ? AND version = 1
                """,
                corruptSid);
        withPrincipal(
                fullPrincipal("reader"),
                () ->
                        mockMvc.perform(
                                        get(GOV_DETAIL)
                                                .param("serviceId", corruptSid)
                                                .param("version", "1"))
                                .andExpect(status().isInternalServerError())
                                .andExpect(jsonPath("$.code").value("stored_definition_corrupt")));
    }

    @Test
    void approvePublishFlowRemovesFromQueueAndAppearsInLatestPublished() throws Exception {
        String sid = "e1-flow-1";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech-submitter");

        String etagSubmitted = etag;
        withPrincipal(
                fullPrincipal("gov-officer"),
                () -> {
                    mockMvc.perform(get(GOV_QUEUE).param("limit", "100"))
                            .andExpect(status().isOk());

                    MvcResult queued =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "100")).andReturn();
                    assertThat(
                                    mapper
                                            .readTree(queued.getResponse().getContentAsByteArray())
                                            .path("items")
                                            .toString())
                            .contains(sid)
                            .contains("submitted");

                    ObjectNode approveBody = mapper.createObjectNode();
                    approveBody.put("targetStatus", "approved");
                    MvcResult approved =
                            mockMvc.perform(
                                            post(GOV_LIFECYCLE)
                                                    .param("serviceId", sid)
                                                    .param("version", "1")
                                                    .header(HttpHeaders.IF_MATCH, etagSubmitted)
                                                    .contentType(MediaType.APPLICATION_JSON)
                                                    .content(mapper.writeValueAsBytes(approveBody)))
                                    .andExpect(status().isOk())
                                    .andExpect(jsonPath("$.status").value("approved"))
                                    .andExpect(jsonPath("$.audit.approvedBy").value("gov-officer"))
                                    .andReturn();
                    String etagApproved = approved.getResponse().getHeader(HttpHeaders.ETAG);
                    assertThat(approved.getResponse().getContentAsString())
                            .doesNotContain("APPROVE_FORM_DEFINITION");

                    MvcResult queuedApproved =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "100")).andReturn();
                    assertThat(
                                    mapper
                                            .readTree(
                                                    queuedApproved
                                                            .getResponse()
                                                            .getContentAsByteArray())
                                            .path("items")
                                            .toString())
                            .contains(sid)
                            .contains("approved");

                    ObjectNode publishBody = mapper.createObjectNode();
                    publishBody.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, etagApproved)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publishBody)))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.status").value("published"));

                    MvcResult queueAfter =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "100")).andReturn();
                    JsonNode items =
                            mapper.readTree(queueAfter.getResponse().getContentAsByteArray())
                                    .path("items");
                    for (JsonNode item : items) {
                        assertThat(item.path("serviceId").asText()).isNotEqualTo(sid);
                    }

                    mockMvc.perform(get(PUBLISHED).param("serviceId", sid))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.status").value("published"));
                });

        Integer eventCount =
                jdbcTemplate.queryForObject(
                        """
                        SELECT COUNT(*) FROM form_definition.form_definition_lifecycle_events
                        WHERE service_id = ? AND version = 1
                        """,
                        Integer.class,
                        sid);
        assertThat(eventCount).isGreaterThanOrEqualTo(3);
    }

    @Test
    void authenticatedMissingIfMatchReturns428AndApproveCannotPublish() throws Exception {
        String sid = "e1-1-auth-order";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech");
        String submittedEtag = etag;

        withPrincipal(
                fullPrincipal("gov"),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(approve)))
                            .andExpect(status().isPreconditionRequired())
                            .andExpect(jsonPath("$.code").value("if_match_required"))
                            .andExpect(jsonPath("$.actorId").doesNotExist());
                });

        withPrincipal(
                approveOnly("approver-only"),
                () -> {
                    ObjectNode publish = mapper.createObjectNode();
                    publish.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publish)))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("governance_forbidden"))
                            .andExpect(jsonPath("$.capabilities").doesNotExist());
                });
    }

    @Test
    void requestBodyActorIdRejectedWrongCapabilityAndWrongTargetAndStaleEtag() throws Exception {
        String sid = "e1-negatives";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech");

        String submittedEtag = etag;
        withPrincipal(
                fullPrincipal("gov"),
                () -> {
                    ObjectNode withActor = mapper.createObjectNode();
                    withActor.put("targetStatus", "approved");
                    withActor.put("actorId", "spoofed");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(withActor)))
                            .andExpect(status().isBadRequest())
                            .andExpect(
                                    jsonPath("$.code")
                                            .value("invalid_governance_transition_request"));

                    ObjectNode submittedTarget = mapper.createObjectNode();
                    submittedTarget.put("targetStatus", "submitted");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(submittedTarget)))
                            .andExpect(status().isBadRequest())
                            .andExpect(
                                    jsonPath("$.code")
                                            .value("invalid_governance_transition_request"));

                    ObjectNode publishEarly = mapper.createObjectNode();
                    publishEarly.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publishEarly)))
                            .andExpect(status().isConflict())
                            .andExpect(jsonPath("$.code").value("lifecycle_transition_not_allowed"));
                });

        withPrincipal(
                publishOnly("publisher-only"),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(approve)))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("governance_forbidden"));
                });

        withPrincipal(
                fullPrincipal("gov"),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, FormDefinitionETag.format(0L))
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(approve)))
                            .andExpect(status().isPreconditionFailed())
                            .andExpect(jsonPath("$.code").value("stale_revision"));
                });
    }

    @Test
    void concurrentApproveOneSuccessOneStale() throws Exception {
        String sid = "e1-race-approve";
        String etag = createDraft(sid, 1);
        etag = techTransition(sid, 1, etag, "submitted", "tech");
        String submittedEtag = etag;

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger stales = new AtomicInteger();
        AtomicReference<Exception> failure = new AtomicReference<>();

        Runnable race =
                () -> {
                    try {
                        start.await(10, TimeUnit.SECONDS);
                        CURRENT.set(fullPrincipal("race-actor"));
                        ObjectNode body = mapper.createObjectNode();
                        body.put("targetStatus", "approved");
                        try {
                            governanceLifecycleService.transition(
                                    sid, "1", submittedEtag, body);
                            successes.incrementAndGet();
                        } catch (StaleRevisionException ex) {
                            stales.incrementAndGet();
                        }
                    } catch (Exception ex) {
                        failure.compareAndSet(null, ex);
                    } finally {
                        CURRENT.remove();
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(race);
        Thread t2 = new Thread(race);
        t1.start();
        t2.start();
        start.countDown();
        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        if (failure.get() != null) {
            throw failure.get();
        }
        assertThat(successes.get()).isEqualTo(1);
        assertThat(stales.get()).isEqualTo(1);
    }

    @Test
    void technicalLifecycleEndpointStillAcceptsActorIdBody() throws Exception {
        String sid = "e1-tech-compat";
        String etag = createDraft(sid, 1);
        techTransition(sid, 1, etag, "submitted", "legacy-actor");
        // Unrelated to governance principal
        CURRENT.remove();
        mockMvc.perform(get(GOV_QUEUE)).andExpect(status().isUnauthorized());
    }
}
