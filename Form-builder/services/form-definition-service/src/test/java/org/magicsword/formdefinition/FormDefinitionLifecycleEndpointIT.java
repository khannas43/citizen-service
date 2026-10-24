package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionETag;
import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.FormDefinitionStore;
import org.magicsword.formdefinition.application.StaleRevisionException;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
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
 * {@code POST /api/v1/form-definitions/lifecycle-transitions}: the forward-only technical
 * lifecycle state machine, audit mutation semantics, append-only event log, and interaction with
 * the FB-C3 draft-only PUT editability guard.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionLifecycleEndpointIT {

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

    @Autowired
    private FormDefinitionStore store;

    @Autowired
    private FormDefinitionLifecycleService lifecycleService;

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

    private static ObjectNode transitionBody(String targetStatus, String actorId) {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", targetStatus);
        body.put("actorId", actorId);
        return body;
    }

    private MvcResult createDraft(ObjectNode doc) throws Exception {
        return mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private MvcResult transition(String serviceId, int version, String ifMatch, String body) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder requestBuilder =
                post(LIFECYCLE_PATH)
                        .param("serviceId", serviceId)
                        .param("version", String.valueOf(version))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body);
        if (ifMatch != null) {
            requestBuilder = requestBuilder.header(HttpHeaders.IF_MATCH, ifMatch);
        }
        return mockMvc.perform(requestBuilder).andReturn();
    }

    private MvcResult putUpdate(String serviceId, int version, String ifMatch, String body) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder requestBuilder =
                put(CREATE_PATH)
                        .param("serviceId", serviceId)
                        .param("version", String.valueOf(version))
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

    private String selectStatus(String serviceId, int version) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM form_definition.form_definitions WHERE service_id = ? AND version = ?",
                String.class,
                serviceId,
                version);
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
        return new ArrayList<>(
                jdbcTemplate.queryForList(
                        "SELECT from_status, to_status, actor_id, occurred_at, resulting_revision"
                                + " FROM form_definition.form_definition_lifecycle_events"
                                + " WHERE service_id = ? AND version = ? ORDER BY event_id ASC",
                        serviceId,
                        version));
    }

    // ================================================================== single allowed transitions

    @Test
    void draftToSubmittedAlone() throws Exception {
        String serviceId = "c4-lc-draft-submitted";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result =
                transition(serviceId, 1, etag, transitionBody("submitted", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("status").asText()).isEqualTo("submitted");
        assertThat(body.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("submitted");
        assertThat(countEventRows(serviceId, 1)).isEqualTo(1);
    }

    @Test
    void submittedToApprovedAlone() throws Exception {
        String serviceId = "c4-lc-submitted-approved";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.submitted);
        String etag = FormDefinitionETag.format(seeded.revision());

        MvcResult result = transition(serviceId, 1, etag, transitionBody("approved", "bob").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("status").asText()).isEqualTo("approved");
        assertThat(body.at("/audit/approvedBy").asText()).isEqualTo("bob");
        assertThat(body.at("/audit/submittedBy").asText()).isEqualTo("seed-submitter");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("approved");
    }

    @Test
    void approvedToPublishedAlone() throws Exception {
        String serviceId = "c4-lc-approved-published";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.approved);
        String etag = FormDefinitionETag.format(seeded.revision());

        MvcResult result = transition(serviceId, 1, etag, transitionBody("published", "carol").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("status").asText()).isEqualTo("published");
        assertThat(body.at("/audit/publishedAt").asText()).isEqualTo(FIXED_INSTANT.toString());
        assertThat(selectStatus(serviceId, 1)).isEqualTo("published");
    }

    @Test
    void publishedToRetiredAlone() throws Exception {
        String serviceId = "c4-lc-published-retired";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(seeded.revision());

        MvcResult result = transition(serviceId, 1, etag, transitionBody("retired", "dave").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("status").asText()).isEqualTo("retired");
        // Retire adds no new canonical audit key beyond the existing governed set.
        List<String> auditKeys = new ArrayList<>();
        body.get("audit").fieldNames().forEachRemaining(auditKeys::add);
        assertThat(auditKeys)
                .containsExactlyInAnyOrder("createdBy", "createdAt", "submittedBy", "approvedBy", "publishedAt");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("retired");
    }

    // ================================================================== full sequence

    @Test
    void fullLifecycleSequenceDraftSubmittedApprovedPublishedRetired() throws Exception {
        String serviceId = "c4-lc-full-sequence";
        ObjectNode originalDoc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(originalDoc);
        String etag = etagOf(createResult);

        MvcResult submitResult =
                transition(serviceId, 1, etag, transitionBody("submitted", "alice").toString());
        assertThat(submitResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode submitted = bodyOf(submitResult);
        assertThat(submitted.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertUnchangedSchemaAndMeta(originalDoc, submitted);
        String etagAfterSubmit = etagOf(submitResult);
        assertThat(etagAfterSubmit).isNotEqualTo(etag);

        MvcResult approveResult =
                transition(serviceId, 1, etagAfterSubmit, transitionBody("approved", "bob").toString());
        assertThat(approveResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode approved = bodyOf(approveResult);
        assertThat(approved.at("/audit/approvedBy").asText()).isEqualTo("bob");
        assertThat(approved.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertUnchangedSchemaAndMeta(originalDoc, approved);
        String etagAfterApprove = etagOf(approveResult);

        MvcResult publishResult =
                transition(serviceId, 1, etagAfterApprove, transitionBody("published", "carol").toString());
        assertThat(publishResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode published = bodyOf(publishResult);
        assertThat(published.at("/audit/publishedAt").asText()).isEqualTo(FIXED_INSTANT.toString());
        assertThat(published.at("/audit/approvedBy").asText()).isEqualTo("bob");
        assertThat(published.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertUnchangedSchemaAndMeta(originalDoc, published);
        String etagAfterPublish = etagOf(publishResult);

        MvcResult retireResult =
                transition(serviceId, 1, etagAfterPublish, transitionBody("retired", "dave").toString());
        assertThat(retireResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode retired = bodyOf(retireResult);
        assertThat(retired.get("status").asText()).isEqualTo("retired");
        assertUnchangedSchemaAndMeta(originalDoc, retired);
        List<String> retiredAuditKeys = new ArrayList<>();
        retired.get("audit").fieldNames().forEachRemaining(retiredAuditKeys::add);
        assertThat(retiredAuditKeys)
                .containsExactlyInAnyOrder("createdBy", "createdAt", "submittedBy", "approvedBy", "publishedAt");

        // ---- event log: append-only, ordered, count matches the number of transitions.
        assertThat(countEventRows(serviceId, 1)).isEqualTo(4);
        List<Map<String, Object>> events = selectEventsOrdered(serviceId, 1);
        assertThat(events).hasSize(4);
        assertThat(events.get(0).get("from_status")).isEqualTo("draft");
        assertThat(events.get(0).get("to_status")).isEqualTo("submitted");
        assertThat(events.get(0).get("actor_id")).isEqualTo("alice");
        assertThat(events.get(1).get("from_status")).isEqualTo("submitted");
        assertThat(events.get(1).get("to_status")).isEqualTo("approved");
        assertThat(events.get(1).get("actor_id")).isEqualTo("bob");
        assertThat(events.get(2).get("from_status")).isEqualTo("approved");
        assertThat(events.get(2).get("to_status")).isEqualTo("published");
        assertThat(events.get(2).get("actor_id")).isEqualTo("carol");
        assertThat(events.get(3).get("from_status")).isEqualTo("published");
        assertThat(events.get(3).get("to_status")).isEqualTo("retired");
        assertThat(events.get(3).get("actor_id")).isEqualTo("dave");

        long previousRevision = -1;
        for (Map<String, Object> event : events) {
            long resultingRevision = ((Number) event.get("resulting_revision")).longValue();
            assertThat(resultingRevision).isGreaterThan(previousRevision);
            previousRevision = resultingRevision;

            Object occurredAt = event.get("occurred_at");
            Instant occurredInstant =
                    occurredAt instanceof java.sql.Timestamp ts
                            ? ts.toInstant()
                            : Instant.parse(occurredAt.toString());
            assertThat(occurredInstant).isEqualTo(FIXED_INSTANT);
        }
    }

    private void assertUnchangedSchemaAndMeta(JsonNode original, JsonNode candidate) {
        assertThat(candidate.get("jsonSchema")).isEqualTo(original.get("jsonSchema"));
        assertThat(candidate.get("uiSchema")).isEqualTo(original.get("uiSchema"));
        assertThat(candidate.get("meta")).isEqualTo(original.get("meta"));
        assertThat(candidate.at("/audit/createdBy")).isEqualTo(original.at("/audit/createdBy"));
        assertThat(candidate.at("/audit/createdAt")).isEqualTo(original.at("/audit/createdAt"));
    }

    // ================================================================== disallowed transitions

    @Test
    void skipSubmittedReturns409LifecycleTransitionNotAllowed() throws Exception {
        String serviceId = "c4-lc-skip-draft-approved";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, transitionBody("approved", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("lifecycle_transition_not_allowed");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("draft");
        assertThat(countEventRows(serviceId, 1)).isZero();
    }

    @Test
    void skipToPublishedReturns409() throws Exception {
        String serviceId = "c4-lc-skip-draft-published";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, transitionBody("published", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("lifecycle_transition_not_allowed");
    }

    @Test
    void reverseApprovedToSubmittedReturns409() throws Exception {
        String serviceId = "c4-lc-reverse-approved-submitted";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.approved);
        String etag = FormDefinitionETag.format(seeded.revision());

        MvcResult result = transition(serviceId, 1, etag, transitionBody("submitted", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("lifecycle_transition_not_allowed");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("approved");
    }

    @Test
    void repeatSubmittedToSubmittedReturns409() throws Exception {
        String serviceId = "c4-lc-repeat-submitted";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.submitted);
        String etag = FormDefinitionETag.format(seeded.revision());

        MvcResult result = transition(serviceId, 1, etag, transitionBody("submitted", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("lifecycle_transition_not_allowed");
        assertThat(countEventRows(serviceId, 1)).isZero();
    }

    @Test
    void fromRetiredAnyTransitionReturns409() throws Exception {
        String serviceId = "c4-lc-from-retired";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.retired);
        String etag = FormDefinitionETag.format(seeded.revision());

        for (String target : List.of("draft", "submitted", "approved", "published", "retired")) {
            MvcResult result = transition(serviceId, 1, etag, transitionBody(target, "alice").toString());
            assertThat(result.getResponse().getStatus()).isIn(400, 409);
            String code = bodyOf(result).get("code").asText();
            assertThat(code).isIn("invalid_transition_request", "lifecycle_transition_not_allowed");
        }
        assertThat(selectStatus(serviceId, 1)).isEqualTo("retired");
        assertThat(countEventRows(serviceId, 1)).isZero();
    }

    // ================================================================== bad request bodies

    @Test
    void missingActorIdKeyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-missing-actorid";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");

        MvcResult result = transition(serviceId, 1, etag, body.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("draft");
    }

    @Test
    void missingTargetStatusKeyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-missing-target";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode body = mapper.createObjectNode();
        body.put("actorId", "alice");

        MvcResult result = transition(serviceId, 1, etag, body.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    @Test
    void unknownKeyInBodyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-unknown-key";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode body = transitionBody("submitted", "alice");
        body.put("extra", "nope");

        MvcResult result = transition(serviceId, 1, etag, body.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    @Test
    void unknownTargetStatusValueReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-unknown-target-value";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result =
                transition(serviceId, 1, etag, transitionBody("not-a-real-status", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    @Test
    void targetStatusDraftReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-target-draft";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, transitionBody("draft", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    @Test
    void nonObjectBodyReturns400InvalidTransitionRequest() throws Exception {
        String serviceId = "c4-lc-non-object-body";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, "[\"submitted\",\"alice\"]");

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_transition_request");
    }

    // ================================================================== actor admission

    @Test
    void paddedActorIdReturns400InvalidActor() throws Exception {
        String serviceId = "c4-lc-padded-actor";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, transitionBody("submitted", " alice ").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("draft");
    }

    @Test
    void blankActorIdReturns400InvalidActor() throws Exception {
        String serviceId = "c4-lc-blank-actor";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult result = transition(serviceId, 1, etag, transitionBody("submitted", "   ").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
    }

    @Test
    void overflowActorIdReturns400InvalidActor() throws Exception {
        String serviceId = "c4-lc-overflow-actor";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        String overflow = "a".repeat(257);
        MvcResult result = transition(serviceId, 1, etag, transitionBody("submitted", overflow).toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_actor");
    }

    // ================================================================== If-Match

    @Test
    void missingIfMatchReturns428IfMatchRequired() throws Exception {
        String serviceId = "c4-lc-missing-ifmatch";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);

        MvcResult result = transition(serviceId, 1, null, transitionBody("submitted", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(428);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("if_match_required");
    }

    @Test
    void staleIfMatchReturns412StaleRevision() throws Exception {
        String serviceId = "c4-lc-stale-ifmatch";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String staleEtag = etagOf(createResult);

        // Advance the revision with one successful transition.
        transition(serviceId, 1, staleEtag, transitionBody("submitted", "alice").toString());

        MvcResult result = transition(serviceId, 1, staleEtag, transitionBody("approved", "bob").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(412);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("stale_revision");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("submitted");
    }

    @Test
    void malformedIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c4-lc-malformed-ifmatch";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);

        MvcResult result =
                transition(serviceId, 1, "not-a-token", transitionBody("submitted", "alice").toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_if_match");
    }

    // ================================================================== concurrency

    @Test
    void concurrentTransitionsWithSameIfMatchAllowExactlyOneWinner() throws Exception {
        String serviceId = "c4-lc-concurrent";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        long originalRevision = FormDefinitionETag.parseIfMatch(etagOf(createResult));
        String ifMatch = FormDefinitionETag.format(originalRevision);

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger staleFailures = new AtomicInteger();
        AtomicReference<Throwable> unexpected = new AtomicReference<>();

        Runnable attempt =
                () -> {
                    try {
                        start.await();
                        lifecycleService.transition(
                                serviceId, "1", ifMatch, transitionBody("submitted", "racer"));
                        successes.incrementAndGet();
                    } catch (StaleRevisionException ex) {
                        staleFailures.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(attempt, "c4-lc-concurrent-1");
        Thread t2 = new Thread(attempt, "c4-lc-concurrent-2");
        t1.start();
        t2.start();
        start.countDown();

        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        assertThat(unexpected.get()).isNull();
        assertThat(successes.get()).isEqualTo(1);
        assertThat(staleFailures.get()).isEqualTo(1);

        assertThat(selectStatus(serviceId, 1)).isEqualTo("submitted");
        assertThat(countEventRows(serviceId, 1)).isEqualTo(1);
    }

    // ================================================================== PUT interaction (FB-C3)

    @Test
    void putOnSubmittedDefinitionReturns409DefinitionNotEditable() throws Exception {
        String serviceId = "c4-lc-put-submitted";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        MvcResult submitResult =
                transition(serviceId, 1, etag, transitionBody("submitted", "alice").toString());
        String submittedEtag = etagOf(submitResult);

        ObjectNode putAttempt = doc.deepCopy();
        putAttempt.put("status", "draft");
        MvcResult putResult = putUpdate(serviceId, 1, submittedEtag, putAttempt.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(putResult).get("code").asText()).isEqualTo("definition_not_editable");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("submitted");
    }

    @Test
    void putOnPublishedDefinitionReturns409DefinitionNotEditable() throws Exception {
        String serviceId = "c4-lc-put-published";
        FormDefinitionSnapshot seeded = seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        String etag = FormDefinitionETag.format(seeded.revision());

        ObjectNode putAttempt = validDraft(serviceId, 1);
        MvcResult putResult = putUpdate(serviceId, 1, etag, putAttempt.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(putResult).get("code").asText()).isEqualTo("definition_not_editable");
        assertThat(selectStatus(serviceId, 1)).isEqualTo("published");
    }

    // ================================================================== security

    @Test
    void secretActorIdNeverLeaksIntoProblemBodyOnRejectedTransition() throws Exception {
        String secret = "UNIQUE_SECRET_C4_LIFECYCLE_XYZ";
        String serviceId = "c4-lc-secret-leak";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        // Skip transition (disallowed) while embedding a distinctive secret in actorId.
        MvcResult result = transition(serviceId, 1, etag, transitionBody("approved", secret).toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        String body = rawBodyOf(result);
        assertThat(body).doesNotContain(secret);
        assertSecureProblemBody(body);
    }

    @Test
    void secretInStaleRevisionResponseNeverLeaks() throws Exception {
        String secret = "UNIQUE_SECRET_C4_STALE_XYZ";
        String serviceId = "c4-lc-secret-stale";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String staleEtag = etagOf(createResult);
        transition(serviceId, 1, staleEtag, transitionBody("submitted", "alice").toString());

        MvcResult result = transition(serviceId, 1, staleEtag, transitionBody("approved", secret).toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(412);
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
