package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionETag;
import org.citizen.formdefinition.application.FormDefinitionNewDraftService;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.application.FormDefinitionStore;
import org.citizen.formdefinition.application.VersionExhaustedException;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
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
 * FB-C4 MockMvc + PostgreSQL integration tests for
 * {@code POST /api/v1/form-definitions/drafts/from-version}: immutable new-draft cloning from a
 * published/retired source, version allocation under the service advisory lock, and source
 * immutability guarantees.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionNewDraftEndpointIT {

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
    private static final String NEW_DRAFT_PATH = "/api/v1/form-definitions/drafts/from-version";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionStore store;

    @Autowired
    private FormDefinitionNewDraftService newDraftService;

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

    /** Seeds a row directly at the given status with a C1-compliant audit trail for that status. */
    private FormDefinitionSnapshot seedAtStatus(String serviceId, int version, FormDefinitionStatus status)
            throws IOException {
        ObjectNode doc = validDraft(serviceId, version);
        doc.put("status", status.name());
        ObjectNode audit = (ObjectNode) doc.get("audit");
        int ordinal = status.ordinal();
        if (ordinal >= FormDefinitionStatus.submitted.ordinal()) {
            audit.put("submittedBy", "seed-submitter");
        }
        if (ordinal >= FormDefinitionStatus.approved.ordinal()) {
            audit.put("approvedBy", "seed-approver");
        }
        if (ordinal >= FormDefinitionStatus.published.ordinal()) {
            audit.put("publishedAt", FIXED_INSTANT.toString());
        }
        return store.create(doc);
    }

    private static ObjectNode cloneBody(String createdBy) {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("createdBy", createdBy);
        return body;
    }

    private MvcResult cloneFromVersion(String serviceId, int sourceVersion, String ifMatch, String body)
            throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder requestBuilder =
                post(NEW_DRAFT_PATH)
                        .param("serviceId", serviceId)
                        .param("sourceVersion", String.valueOf(sourceVersion))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body);
        if (ifMatch != null) {
            requestBuilder = requestBuilder.header(HttpHeaders.IF_MATCH, ifMatch);
        }
        return mockMvc.perform(requestBuilder).andReturn();
    }

    private String etagOf(MvcResult result) {
        return result.getResponse().getHeader(HttpHeaders.ETAG);
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String rawBodyOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private JsonNode selectDefinition(String serviceId, int version) {
        String json =
                jdbcTemplate.queryForObject(
                        "SELECT definition::text FROM form_definition.form_definitions"
                                + " WHERE service_id = ? AND version = ?",
                        String.class,
                        serviceId,
                        version);
        try {
            return mapper.readTree(json);
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private long countRowsForService(String serviceId) {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definitions WHERE service_id = ?",
                        Long.class,
                        serviceId);
        return count == null ? 0L : count;
    }

    private void insertRawRow(String serviceId, int version, String status, JsonNode definition) {
        jdbcTemplate.update(
                "INSERT INTO form_definition.form_definitions"
                        + " (service_id, version, status, definition, created_at, updated_at, lock_version)"
                        + " VALUES (?, ?, ?, ?::jsonb, now(), now(), 0)",
                serviceId,
                version,
                status,
                definition.toString());
    }

    // ================================================================== happy path cloning

    @Test
    void publishedSourceClonesTo201WithLocationAndETag() throws Exception {
        String serviceId = "c4-nd-published-clone";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result =
                cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        assertThat(result.getResponse().getHeader(HttpHeaders.LOCATION)).isNotNull();
        assertThat(etagOf(result)).isNotBlank();

        URI location = URI.create(result.getResponse().getHeader(HttpHeaders.LOCATION));
        assertThat(location.getQuery()).contains("serviceId=" + serviceId).contains("version=2");

        JsonNode body = bodyOf(result);
        assertThat(body.get("status").asText()).isEqualTo("draft");
        assertThat(body.get("version").asInt()).isEqualTo(2);
        assertThat(body.get("serviceId").asText()).isEqualTo(serviceId);

        MvcResult getResult = mockMvc.perform(get(location)).andExpect(status().isOk()).andReturn();
        assertThat(bodyOf(getResult)).isEqualTo(body);
    }

    @Test
    void retiredSourceClonesSuccessfully() throws Exception {
        String serviceId = "c4-nd-retired-clone";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.retired);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        assertThat(bodyOf(result).get("status").asText()).isEqualTo("draft");
    }

    @Test
    void newDraftCopiesJsonSchemaUiSchemaMetaVerbatimFromSource() throws Exception {
        String serviceId = "c4-nd-copies-schema";
        ObjectNode sourceDoc = validDraft(serviceId, 1);
        sourceDoc.put("status", FormDefinitionStatus.published.name());
        ObjectNode audit = (ObjectNode) sourceDoc.get("audit");
        audit.put("submittedBy", "s");
        audit.put("approvedBy", "a");
        audit.put("publishedAt", FIXED_INSTANT.toString());
        FormDefinitionSnapshot source = store.create(sourceDoc);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());
        JsonNode created = bodyOf(result);

        assertThat(created.get("jsonSchema")).isEqualTo(sourceDoc.get("jsonSchema"));
        assertThat(created.get("uiSchema")).isEqualTo(sourceDoc.get("uiSchema"));
        assertThat(created.get("meta")).isEqualTo(sourceDoc.get("meta"));
    }

    @Test
    void newDraftAuditContainsOnlyCreatedByCreatedAtFromBodyAndClock() throws Exception {
        String serviceId = "c4-nd-audit-shape";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());
        JsonNode audit = bodyOf(result).get("audit");

        Set<String> keys = new java.util.HashSet<>();
        audit.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).containsExactlyInAnyOrder("createdBy", "createdAt");
        assertThat(audit.get("createdBy").asText()).isEqualTo("dana");
        assertThat(audit.get("createdAt").asText()).isEqualTo(FIXED_INSTANT.toString());
    }

    // ================================================================== source_not_cloneable

    @Test
    void draftSourceReturns409SourceNotCloneable() throws Exception {
        String serviceId = "c4-nd-source-draft";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isCreated())
                        .andReturn();
        String etag = etagOf(createResult);

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("source_not_cloneable");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    @Test
    void submittedSourceReturns409SourceNotCloneable() throws Exception {
        String serviceId = "c4-nd-source-submitted";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.submitted);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("source_not_cloneable");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    @Test
    void approvedSourceReturns409SourceNotCloneable() throws Exception {
        String serviceId = "c4-nd-source-approved";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.approved);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("source_not_cloneable");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    // ================================================================== source immutability

    @Test
    void sourceEtagRevisionAndJsonUnchangedAfterClone() throws Exception {
        String serviceId = "c4-nd-source-unchanged";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());
        JsonNode beforeDefinition = selectDefinition(serviceId, 1);

        cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        JsonNode afterDefinition = selectDefinition(serviceId, 1);
        assertThat(afterDefinition).isEqualTo(beforeDefinition);

        FormDefinitionSnapshot sourceAfter = store.findSnapshot(serviceId, 1).orElseThrow();
        assertThat(sourceAfter.revision()).isEqualTo(source.revision());
        assertThat(FormDefinitionETag.format(sourceAfter.revision())).isEqualTo(etag);
    }

    // ================================================================== concurrency

    @Test
    void concurrentAllocationsFromSameSourceProduceUniqueIncreasingVersions() throws Exception {
        String serviceId = "c4-nd-concurrent-alloc";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String ifMatch = FormDefinitionETag.format(source.revision());

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicReference<Throwable> unexpected = new AtomicReference<>();
        AtomicReference<Integer> versionA = new AtomicReference<>();
        AtomicReference<Integer> versionB = new AtomicReference<>();

        Runnable attemptA =
                () -> {
                    try {
                        start.await();
                        FormDefinitionSnapshot created =
                                newDraftService.createFromVersion(serviceId, "1", ifMatch, cloneBody("racer-a"));
                        versionA.set(created.definition().get("version").asInt());
                        successes.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };
        Runnable attemptB =
                () -> {
                    try {
                        start.await();
                        FormDefinitionSnapshot created =
                                newDraftService.createFromVersion(serviceId, "1", ifMatch, cloneBody("racer-b"));
                        versionB.set(created.definition().get("version").asInt());
                        successes.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(attemptA, "c4-nd-concurrent-1");
        Thread t2 = new Thread(attemptB, "c4-nd-concurrent-2");
        t1.start();
        t2.start();
        start.countDown();

        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        assertThat(unexpected.get()).isNull();
        assertThat(successes.get()).isEqualTo(2);

        assertThat(versionA.get()).isNotNull();
        assertThat(versionB.get()).isNotNull();
        assertThat(versionA.get()).isNotEqualTo(versionB.get());
        assertThat(List.of(versionA.get(), versionB.get())).containsExactlyInAnyOrder(2, 3);
        assertThat(countRowsForService(serviceId)).isEqualTo(3); // source + 2 clones
    }

    // ================================================================== version overflow

    @Test
    void versionOverflowReturns409VersionExhaustedAndInsertsNothing() throws Exception {
        String serviceId = "c4-nd-version-overflow";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        ObjectNode overflowDoc = validDraft(serviceId, Integer.MAX_VALUE);
        insertRawRow(serviceId, Integer.MAX_VALUE, "draft", overflowDoc);
        assertThat(countRowsForService(serviceId)).isEqualTo(2);

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("version_exhausted");
        assertThat(countRowsForService(serviceId)).isEqualTo(2);
    }

    @Test
    void versionOverflowThrowsAtServiceLayerToo() throws Exception {
        String serviceId = "c4-nd-version-overflow-service";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String ifMatch = FormDefinitionETag.format(source.revision());

        ObjectNode overflowDoc = validDraft(serviceId, Integer.MAX_VALUE);
        insertRawRow(serviceId, Integer.MAX_VALUE, "draft", overflowDoc);

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> newDraftService.createFromVersion(serviceId, "1", ifMatch, cloneBody("dana")))
                .isInstanceOf(VersionExhaustedException.class);

        assertThat(countRowsForService(serviceId)).isEqualTo(2);
    }

    // ================================================================== mutate response

    @Test
    void mutatingParsedCloneResponseThenGetAgainEqualsStored() throws Exception {
        String serviceId = "c4-nd-mutate-response";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("dana").toString());
        ObjectNode returned = (ObjectNode) bodyOf(result);
        returned.put("serviceId", "MUTATED-CLIENT-SIDE");
        returned.remove("meta");

        MvcResult getResult =
                mockMvc.perform(get(CREATE_PATH).param("serviceId", serviceId).param("version", "2"))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode fetched = bodyOf(getResult);

        assertThat(fetched.get("serviceId").asText()).isEqualTo(serviceId);
        assertThat(fetched.get("meta")).isNotNull();
    }

    // ================================================================== bad request bodies

    @Test
    void missingCreatedByKeyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-nd-missing-createdby";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, "{}");

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    @Test
    void unknownKeyInBodyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-nd-unknown-key";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        ObjectNode body = cloneBody("dana");
        body.put("extra", "nope");

        MvcResult result = cloneFromVersion(serviceId, 1, etag, body.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    @Test
    void nonTextualCreatedByReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-nd-non-textual-createdby";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, "{\"createdBy\":123}");

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    // ================================================================== actor admission

    @Test
    void paddedCreatedByReturns400InvalidActor() throws Exception {
        String serviceId = "c4-nd-padded-createdby";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody(" dana ").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    @Test
    void blankCreatedByReturns400InvalidActor() throws Exception {
        String serviceId = "c4-nd-blank-createdby";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody("   ").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
    }

    @Test
    void overflowCreatedByReturns400InvalidActor() throws Exception {
        String serviceId = "c4-nd-overflow-createdby";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(source.revision());

        MvcResult result =
                cloneFromVersion(serviceId, 1, etag, cloneBody("a".repeat(257)).toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
    }

    // ================================================================== If-Match

    @Test
    void missingIfMatchReturns428IfMatchRequired() throws Exception {
        String serviceId = "c4-nd-missing-ifmatch";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.published);

        MvcResult result = cloneFromVersion(serviceId, 1, null, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(428);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("if_match_required");
    }

    @Test
    void staleIfMatchReturns412StaleRevision() throws Exception {
        String serviceId = "c4-nd-stale-ifmatch";
        FormDefinitionSnapshot source = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String staleEtag = FormDefinitionETag.format(source.revision() + 999);

        MvcResult result = cloneFromVersion(serviceId, 1, staleEtag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(412);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("stale_revision");
        assertThat(countRowsForService(serviceId)).isEqualTo(1);
    }

    @Test
    void malformedIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c4-nd-malformed-ifmatch";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.published);

        MvcResult result = cloneFromVersion(serviceId, 1, "not-a-token", cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_if_match");
    }

    @Test
    void notFoundSourceReturns404() throws Exception {
        String serviceId = "c4-nd-not-found";
        String bogusEtag = FormDefinitionETag.format(0L);

        MvcResult result = cloneFromVersion(serviceId, 1, bogusEtag, cloneBody("dana").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("form_definition_not_found");
    }

    // ================================================================== security

    @Test
    void secretCreatedByNeverLeaksIntoProblemBodyOnRejectedClone() throws Exception {
        String secret = "UNIQUE_SECRET_C4_CLONE_XYZ";
        String serviceId = "c4-nd-secret-leak";
        ObjectNode doc = validDraft(serviceId, 1);
        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isCreated());
        MvcResult getResult =
                mockMvc.perform(get(CREATE_PATH).param("serviceId", serviceId).param("version", "1")).andReturn();
        String etag = etagOf(getResult);

        // Draft source is not cloneable while embedding a distinctive secret in createdBy.
        MvcResult result = cloneFromVersion(serviceId, 1, etag, cloneBody(secret).toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        String body = rawBodyOf(result);
        assertThat(body).doesNotContain(secret);
        assertSecureProblemBody(body);
    }

    private static void assertSecureProblemBody(String body) {
        assertThat(body).contains("\"code\"");
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
        assertThat(body).doesNotContain("lockVersion");
    }
}
