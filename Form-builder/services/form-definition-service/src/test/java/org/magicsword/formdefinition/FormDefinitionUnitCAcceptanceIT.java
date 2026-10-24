package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionETag;
import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.FormDefinitionStore;
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
 * FB-C5 package-level technical acceptance for {@code services/form-definition-service} (FB-C0
 * through FB-C5).
 *
 * <p><strong>Illustrative technical fixture only.</strong> {@code valid-single-page.json} is a
 * synthetic, single-page document used purely to exercise the REST/persistence/validation
 * machinery. It is <strong>not</strong> an authoritative DG Service Catalogue / DST-approved
 * {@code FormDefinition} and must never be treated as approved production content — see
 * {@code docs/unit-c-acceptance.md}.
 *
 * <p>Covers the fifteen FB-C5 package-acceptance points end-to-end: C1 stage rejection, draft
 * create/read/ETag-replace, full lifecycle to published, published-lookup release-head policy and
 * immutability, clone-to-new-draft, version listing, retire-without-fallback, append-only
 * lifecycle events, absence of DST/network integration, strict JSON admission, safe
 * {@code ProblemDetail} mapping, and PostgreSQL JSONB/Unicode preservation.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionUnitCAcceptanceIT {

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

    private static final String BASE_PATH = "/api/v1/form-definitions";
    private static final String VALIDATION_PATH = BASE_PATH + "/validation";
    private static final String LIFECYCLE_PATH = BASE_PATH + "/lifecycle-transitions";
    private static final String NEW_DRAFT_PATH = BASE_PATH + "/drafts/from-version";
    private static final String PUBLISHED_LATEST_PATH = BASE_PATH + "/published/latest";
    private static final String VERSIONS_PATH = BASE_PATH + "/versions";

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

    /** Illustrative draft only — technical acceptance fixture, not an authoritative DG form. */
    private ObjectNode validDraft(String serviceId, int version) throws IOException {
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", version);
        doc.put("status", "draft");
        return doc;
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String rawBodyOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private MvcResult createDraft(ObjectNode doc) throws Exception {
        return mockMvc.perform(post(BASE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andReturn();
    }

    private MvcResult getExact(String serviceId, int version) throws Exception {
        return mockMvc.perform(
                        get(BASE_PATH).param("serviceId", serviceId).param("version", String.valueOf(version)))
                .andReturn();
    }

    private MvcResult transition(String serviceId, int version, String etag, String targetStatus, String actorId)
            throws Exception {
        ObjectNode body = mapper.createObjectNode().put("targetStatus", targetStatus).put("actorId", actorId);
        return mockMvc.perform(
                        post(LIFECYCLE_PATH)
                                .param("serviceId", serviceId)
                                .param("version", String.valueOf(version))
                                .header(HttpHeaders.IF_MATCH, etag)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body.toString()))
                .andReturn();
    }

    /** Drives a fresh draft through the real lifecycle service up to {@code published}. */
    private FormDefinitionSnapshot publishThroughLifecycle(String serviceId, int version) throws Exception {
        ObjectNode doc = validDraft(serviceId, version);
        FormDefinitionSnapshot created = store.create(doc);
        String etag = FormDefinitionETag.format(created.revision());

        ObjectNode submitBody = mapper.createObjectNode().put("targetStatus", "submitted").put("actorId", "alice");
        FormDefinitionSnapshot submitted = lifecycleService.transition(serviceId, String.valueOf(version), etag, submitBody);

        ObjectNode approveBody = mapper.createObjectNode().put("targetStatus", "approved").put("actorId", "bob");
        FormDefinitionSnapshot approved =
                lifecycleService.transition(
                        serviceId, String.valueOf(version), FormDefinitionETag.format(submitted.revision()), approveBody);

        ObjectNode publishBody = mapper.createObjectNode().put("targetStatus", "published").put("actorId", "carol");
        return lifecycleService.transition(
                serviceId, String.valueOf(version), FormDefinitionETag.format(approved.revision()), publishBody);
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

    private String selectDefinitionJsonType(String serviceId, int version) {
        return jdbcTemplate.queryForObject(
                "SELECT pg_typeof(definition)::text FROM form_definition.form_definitions"
                        + " WHERE service_id = ? AND version = ?",
                String.class,
                serviceId,
                version);
    }

    private static void assertSecureProblemBody(String body) {
        assertThat(body).contains("\"code\"");
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
        assertThat(body).doesNotContain("lockVersion");
    }

    // ================================================================== 1. C1 stage rejection

    @Test
    void invalidExampleForEachC1StageIsRejectedByValidationEndpoint() throws Exception {
        // Stage 1 — schema.*: unsupported $schema dialect.
        ObjectNode stage1 = validDraft("c5-acc-stage1", 1);
        ((ObjectNode) stage1.get("jsonSchema")).put("$schema", "https://json-schema.org/draft-07/schema#");
        assertStageRejected(stage1, "schema.dialect_unsupported");

        // Stage 2 — palette.*: provenance references an unknown widget type.
        ObjectNode stage2 = validDraft("c5-acc-stage2", 1);
        ((ObjectNode) stage2.get("meta").get("paletteProvenance").get(0)).put("widgetType", "not-a-real-widget");
        assertStageRejected(stage2, "palette.provenance_unknown_widget_type");

        // Stage 3 — bilingual.*: missing Gujarati translation.
        ObjectNode stage3 = validDraft("c5-acc-stage3", 1);
        ((ObjectNode) stage3.get("meta").get("bilingual").get("labels").get("applicant_name")).remove("gu");
        assertStageRejected(stage3, "bilingual.label_invalid");

        // Stage 4 — binding.*: prefill binding references a nonexistent field.
        ObjectNode stage4 = validDraft("c5-acc-stage4", 1);
        ObjectNode badPrefill =
                ((com.fasterxml.jackson.databind.node.ArrayNode) stage4.get("meta").get("prefillBindings"))
                        .addObject();
        badPrefill.put("fieldId", "does-not-exist");
        badPrefill.put("cafAttribute", "goldenRecord.someAttribute");
        badPrefill.put("confidenceMin", 0.5);
        assertStageRejected(stage4, "binding.prefill_field_not_found");

        // Stage 5 — structure.*: unexpected/ungoverned audit key (also proves no DST field is
        // accepted into the governed audit shape — see point 12).
        ObjectNode stage5 = validDraft("c5-acc-stage5", 1);
        ((ObjectNode) stage5.get("audit")).put("dstApprovedBy", "not-governed");
        assertStageRejected(stage5, "structure.audit_unexpected_key");
    }

    private void assertStageRejected(ObjectNode doc, String expectedIssueCode) throws Exception {
        MvcResult result =
                mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.valid").value(false))
                        .andReturn();
        List<String> codes = bodyOf(result).get("issues").findValues("code").stream().map(JsonNode::asText).toList();
        assertThat(codes).as("issues for %s", doc.get("serviceId")).contains(expectedIssueCode);

        // The same document must also be rejected (never persisted) via draft create.
        MvcResult createResult = createDraft(doc);
        assertThat(createResult.getResponse().getStatus()).isEqualTo(422);
    }

    // ================================================================== 2. draft create/read round-trip

    @Test
    void validDraftCreateReadRoundTrip() throws Exception {
        String serviceId = "c5-acc-draft-roundtrip";
        ObjectNode doc = validDraft(serviceId, 1);

        MvcResult createResult = createDraft(doc);
        assertThat(createResult.getResponse().getStatus()).isEqualTo(201);
        assertThat(createResult.getResponse().getHeader(HttpHeaders.ETAG)).isNotBlank();
        JsonNode created = bodyOf(createResult);
        assertThat(created).isEqualTo(doc);

        MvcResult readResult = getExact(serviceId, 1);
        assertThat(readResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode read = bodyOf(readResult);
        assertThat(read).isEqualTo(doc);
        assertThat(readResult.getResponse().getHeader(HttpHeaders.ETAG))
                .isEqualTo(createResult.getResponse().getHeader(HttpHeaders.ETAG));
    }

    // ================================================================== 3. ETag draft replacement

    @Test
    void etagDraftReplacementSucceedsWithMatchingIfMatchAndRejectsStale() throws Exception {
        String serviceId = "c5-acc-etag-replace";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = createResult.getResponse().getHeader(HttpHeaders.ETAG);

        ObjectNode replacement = doc.deepCopy();
        ((ObjectNode) replacement.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("en", "Applicant full name");

        MvcResult putResult =
                mockMvc.perform(
                                put(BASE_PATH)
                                        .param("serviceId", serviceId)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(replacement.toString()))
                        .andReturn();
        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        String newEtag = putResult.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(newEtag).isNotEqualTo(etag);

        // Reusing the stale (original) ETag now fails.
        MvcResult staleResult =
                mockMvc.perform(
                                put(BASE_PATH)
                                        .param("serviceId", serviceId)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(doc.toString()))
                        .andReturn();
        assertThat(staleResult.getResponse().getStatus()).isEqualTo(412);
        assertThat(bodyOf(staleResult).get("code").asText()).isEqualTo("stale_revision");
    }

    // ================================================================== 4. full lifecycle to published

    @Test
    void fullLifecycleDraftToPublishedSucceedsThroughRealEndpoints() throws Exception {
        String serviceId = "c5-acc-full-lifecycle";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = createResult.getResponse().getHeader(HttpHeaders.ETAG);

        MvcResult submitResult = transition(serviceId, 1, etag, "submitted", "alice");
        assertThat(submitResult.getResponse().getStatus()).isEqualTo(200);
        String submitEtag = submitResult.getResponse().getHeader(HttpHeaders.ETAG);

        MvcResult approveResult = transition(serviceId, 1, submitEtag, "approved", "bob");
        assertThat(approveResult.getResponse().getStatus()).isEqualTo(200);
        String approveEtag = approveResult.getResponse().getHeader(HttpHeaders.ETAG);

        MvcResult publishResult = transition(serviceId, 1, approveEtag, "published", "carol");
        assertThat(publishResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(bodyOf(publishResult).get("status").asText()).isEqualTo("published");
    }

    // ================================================================== 5. published lookup: only published

    @Test
    void publishedLookupReturnsOnlyPublishedNeverDraftSubmittedApprovedRetired() throws Exception {
        String serviceId = "c5-acc-published-only";
        ObjectNode doc = validDraft(serviceId, 1);
        FormDefinitionSnapshot created = store.create(doc);

        // draft
        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(404);

        FormDefinitionSnapshot submitted =
                lifecycleService.transition(
                        serviceId,
                        "1",
                        FormDefinitionETag.format(created.revision()),
                        mapper.createObjectNode().put("targetStatus", "submitted").put("actorId", "alice"));
        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(404);

        FormDefinitionSnapshot approved =
                lifecycleService.transition(
                        serviceId,
                        "1",
                        FormDefinitionETag.format(submitted.revision()),
                        mapper.createObjectNode().put("targetStatus", "approved").put("actorId", "bob"));
        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(404);

        FormDefinitionSnapshot published =
                lifecycleService.transition(
                        serviceId,
                        "1",
                        FormDefinitionETag.format(approved.revision()),
                        mapper.createObjectNode().put("targetStatus", "published").put("actorId", "carol"));
        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(200);

        lifecycleService.transition(
                serviceId,
                "1",
                FormDefinitionETag.format(published.revision()),
                mapper.createObjectNode().put("targetStatus", "retired").put("actorId", "dave"));
        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(404);
    }

    private int getLatestPublishedStatus(String serviceId) throws Exception {
        return mockMvc.perform(get(PUBLISHED_LATEST_PATH).param("serviceId", serviceId))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    // ================================================================== 6. published content immutable

    @Test
    void publishedContentIsImmutableThroughPutAndLifecycle() throws Exception {
        String serviceId = "c5-acc-published-immutable";
        FormDefinitionSnapshot published = publishThroughLifecycle(serviceId, 1);
        String etag = FormDefinitionETag.format(published.revision());

        ObjectNode putAttempt = validDraft(serviceId, 1);
        MvcResult putResult =
                mockMvc.perform(
                                put(BASE_PATH)
                                        .param("serviceId", serviceId)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(putAttempt.toString()))
                        .andReturn();
        assertThat(putResult.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(putResult).get("code").asText()).isEqualTo("definition_not_editable");

        JsonNode stored = store.find(serviceId, 1).orElseThrow();
        assertThat(stored.get("status").asText()).isEqualTo("published");
    }

    // ================================================================== 7. clone published -> new draft

    @Test
    void clonePublishedProducesNewDraftVersion() throws Exception {
        String serviceId = "c5-acc-clone-to-draft";
        FormDefinitionSnapshot published = publishThroughLifecycle(serviceId, 1);

        ObjectNode cloneBody = mapper.createObjectNode().put("createdBy", "erin");
        MvcResult cloneResult =
                mockMvc.perform(
                                post(NEW_DRAFT_PATH)
                                        .param("serviceId", serviceId)
                                        .param("sourceVersion", "1")
                                        .header(HttpHeaders.IF_MATCH, FormDefinitionETag.format(published.revision()))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(cloneBody.toString()))
                        .andReturn();
        assertThat(cloneResult.getResponse().getStatus()).isEqualTo(201);
        JsonNode cloned = bodyOf(cloneResult);
        assertThat(cloned.get("version").asInt()).isEqualTo(2);
        assertThat(cloned.get("status").asText()).isEqualTo("draft");
        assertThat(cloned.at("/audit/createdBy").asText()).isEqualTo("erin");
    }

    // ================================================================== 8. new draft editable without changing published

    @Test
    void newDraftIsEditableWithoutChangingThePublishedSource() throws Exception {
        String serviceId = "c5-acc-new-draft-editable";
        FormDefinitionSnapshot published = publishThroughLifecycle(serviceId, 1);

        ObjectNode cloneBody = mapper.createObjectNode().put("createdBy", "erin");
        MvcResult cloneResult =
                mockMvc.perform(
                                post(NEW_DRAFT_PATH)
                                        .param("serviceId", serviceId)
                                        .param("sourceVersion", "1")
                                        .header(HttpHeaders.IF_MATCH, FormDefinitionETag.format(published.revision()))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(cloneBody.toString()))
                        .andReturn();
        JsonNode cloned = bodyOf(cloneResult);
        String cloneEtag = cloneResult.getResponse().getHeader(HttpHeaders.ETAG);

        ObjectNode edited = (ObjectNode) cloned.deepCopy();
        ((ObjectNode) edited.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("en", "Edited applicant name");

        MvcResult putResult =
                mockMvc.perform(
                                put(BASE_PATH)
                                        .param("serviceId", serviceId)
                                        .param("version", "2")
                                        .header(HttpHeaders.IF_MATCH, cloneEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(edited.toString()))
                        .andReturn();
        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);

        JsonNode publishedAfterEdit = store.find(serviceId, 1).orElseThrow();
        assertThat(publishedAfterEdit.at("/meta/bilingual/labels/applicant_name/en").asText())
                .isEqualTo("Applicant name");

        JsonNode draftAfterEdit = store.find(serviceId, 2).orElseThrow();
        assertThat(draftAfterEdit.at("/meta/bilingual/labels/applicant_name/en").asText())
                .isEqualTo("Edited applicant name");
    }

    // ================================================================== 9. version list shows published + draft

    @Test
    void versionListShowsBothPublishedAndDraftVersions() throws Exception {
        String serviceId = "c5-acc-version-list-mixed";
        publishThroughLifecycle(serviceId, 1);
        ObjectNode draft2 = validDraft(serviceId, 2);
        store.create(draft2);

        MvcResult result = mockMvc.perform(get(VERSIONS_PATH).param("serviceId", serviceId)).andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("items")).hasSize(2);
        assertThat(body.get("items").get(0).get("version").asInt()).isEqualTo(1);
        assertThat(body.get("items").get(0).get("status").asText()).isEqualTo("published");
        assertThat(body.get("items").get(1).get("version").asInt()).isEqualTo(2);
        assertThat(body.get("items").get(1).get("status").asText()).isEqualTo("draft");
    }

    // ================================================================== 10. retire prevents fallback

    @Test
    void retirePreventsFallbackToOlderPublishedVersion() throws Exception {
        String serviceId = "c5-acc-retire-no-fallback";
        publishThroughLifecycle(serviceId, 1);
        FormDefinitionSnapshot v2 = publishThroughLifecycle(serviceId, 2);

        assertThat(getLatestPublishedStatus(serviceId)).isEqualTo(200);

        lifecycleService.transition(
                serviceId,
                "2",
                FormDefinitionETag.format(v2.revision()),
                mapper.createObjectNode().put("targetStatus", "retired").put("actorId", "dave"));

        MvcResult afterRetire = mockMvc.perform(get(PUBLISHED_LATEST_PATH).param("serviceId", serviceId)).andReturn();
        assertThat(afterRetire.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(afterRetire).get("code").asText()).isEqualTo("published_form_definition_not_found");
    }

    // ================================================================== 11. lifecycle events atomic append-only

    @Test
    void lifecycleEventsAreAtomicAndAppendOnly() throws Exception {
        String serviceId = "c5-acc-events-append-only";
        assertThat(countEventRows(serviceId, 1)).isZero();

        ObjectNode doc = validDraft(serviceId, 1);
        FormDefinitionSnapshot created = store.create(doc);
        assertThat(countEventRows(serviceId, 1)).isZero();

        FormDefinitionSnapshot submitted =
                lifecycleService.transition(
                        serviceId,
                        "1",
                        FormDefinitionETag.format(created.revision()),
                        mapper.createObjectNode().put("targetStatus", "submitted").put("actorId", "alice"));
        assertThat(countEventRows(serviceId, 1)).isEqualTo(1);

        // A rejected (disallowed) transition attempt must not append an event row.
        MvcResult rejected = transition(serviceId, 1, FormDefinitionETag.format(submitted.revision()), "published", "eve");
        assertThat(rejected.getResponse().getStatus()).isEqualTo(409);
        assertThat(countEventRows(serviceId, 1)).isEqualTo(1);

        List<Map<String, Object>> events =
                jdbcTemplate.queryForList(
                        "SELECT from_status, to_status, actor_id FROM form_definition.form_definition_lifecycle_events"
                                + " WHERE service_id = ? AND version = ? ORDER BY event_id ASC",
                        serviceId,
                        1);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).get("from_status")).isEqualTo("draft");
        assertThat(events.get(0).get("to_status")).isEqualTo("submitted");
        assertThat(events.get(0).get("actor_id")).isEqualTo("alice");
    }

    // ================================================================== 12. no fetch / network / DST

    @Test
    void noDstOrExternalNetworkIntegrationIsAcceptedIntoTheGovernedShape() throws Exception {
        // The server never performs outbound HTTP by construction (pure Spring MVC + JPA/JDBC to
        // the configured PostgreSQL datasource only); structurally we prove no DST/approval-queue
        // field can enter the governed document shape at all, at any lifecycle stage.
        String serviceId = "c5-acc-no-dst-field";
        ObjectNode doc = validDraft(serviceId, 1);
        ((ObjectNode) doc.get("audit")).put("dstApprovalId", "not-governed");

        MvcResult result = createDraft(doc);
        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("validation_failed");

        // A structurally valid published document likewise carries no DST-related audit key.
        FormDefinitionSnapshot published = publishThroughLifecycle("c5-acc-no-dst-published", 1);
        List<String> auditKeys = new java.util.ArrayList<>();
        published.definition().get("audit").fieldNames().forEachRemaining(auditKeys::add);
        assertThat(auditKeys).noneMatch(key -> key.toLowerCase(java.util.Locale.ROOT).contains("dst"));
    }

    // ================================================================== 13. strict JSON duplicate handling

    @Test
    void strictJsonDuplicateKeyHandling() throws Exception {
        String duplicateKeyBody =
                "{\"serviceId\":\"c5-acc-dup-key\",\"serviceId\":\"other\",\"version\":1,\"status\":\"draft\"}";

        MvcResult result =
                mockMvc.perform(post(BASE_PATH).contentType(MediaType.APPLICATION_JSON).content(duplicateKeyBody))
                        .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("malformed_json");

        String duplicateNestedKeyBody =
                "{\"serviceId\":\"c5-acc-dup-key-2\",\"version\":1,\"status\":\"draft\","
                        + "\"audit\":{\"createdBy\":\"a\",\"createdBy\":\"b\"}}";
        MvcResult nestedResult =
                mockMvc.perform(
                                post(VALIDATION_PATH)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(duplicateNestedKeyBody))
                        .andReturn();
        assertThat(nestedResult.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(nestedResult).get("code").asText()).isEqualTo("malformed_json");
    }

    // ================================================================== 14. safe ProblemDetail

    @Test
    void problemDetailResponsesNeverLeakInternalsAcrossDistinctFailureModes() throws Exception {
        String secret = "UNIQUE_SECRET_C5_ACCEPTANCE_XYZ";

        // validation_failed
        ObjectNode invalidDoc = validDraft("c5-acc-safe-problem-validation", 1);
        ((ObjectNode) invalidDoc.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("en", secret);
        ((ObjectNode) invalidDoc.get("meta").get("bilingual").get("labels").get("applicant_name")).remove("gu");
        MvcResult validationFailure = createDraft(invalidDoc);
        assertThat(validationFailure.getResponse().getStatus()).isEqualTo(422);
        String validationBody = rawBodyOf(validationFailure);
        assertThat(validationBody).doesNotContain(secret);
        assertSecureProblemBody(validationBody);

        // form_definition_not_found
        MvcResult notFound = getExact("c5-acc-safe-problem-missing", 1);
        assertThat(notFound.getResponse().getStatus()).isEqualTo(404);
        assertSecureProblemBody(rawBodyOf(notFound));

        // stale_revision (secret embedded in actorId must never leak)
        String serviceId = "c5-acc-safe-problem-stale";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String staleEtag = createResult.getResponse().getHeader(HttpHeaders.ETAG);
        transition(serviceId, 1, staleEtag, "submitted", "alice");
        MvcResult staleResult = transition(serviceId, 1, staleEtag, "approved", secret);
        assertThat(staleResult.getResponse().getStatus()).isEqualTo(412);
        String staleBody = rawBodyOf(staleResult);
        assertThat(staleBody).doesNotContain(secret);
        assertSecureProblemBody(staleBody);

        // published_form_definition_not_found
        MvcResult publishedMissing =
                mockMvc.perform(get(PUBLISHED_LATEST_PATH).param("serviceId", "c5-acc-safe-problem-published"))
                        .andReturn();
        assertThat(publishedMissing.getResponse().getStatus()).isEqualTo(404);
        assertSecureProblemBody(rawBodyOf(publishedMissing));

        // invalid_pagination
        MvcResult invalidPagination =
                mockMvc.perform(
                                get(VERSIONS_PATH)
                                        .param("serviceId", "c5-acc-safe-problem-pagination")
                                        .param("limit", "0"))
                        .andReturn();
        assertThat(invalidPagination.getResponse().getStatus()).isEqualTo(400);
        assertSecureProblemBody(rawBodyOf(invalidPagination));
    }

    // ================================================================== 15. PostgreSQL JSONB + Unicode

    @Test
    void postgresqlJsonbStorageAndUnicodePreservation() throws Exception {
        String serviceId = "c5-acc-jsonb-unicode";
        ObjectNode doc = validDraft(serviceId, 1);
        String gujaratiText = "અરજદારનું સંપૂર્ણ નામ";
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name")).put("gu", gujaratiText);

        MvcResult createResult = createDraft(doc);
        assertThat(createResult.getResponse().getStatus()).isEqualTo(201);

        assertThat(selectDefinitionJsonType(serviceId, 1)).isEqualTo("jsonb");

        String storedGujarati =
                jdbcTemplate.queryForObject(
                        "SELECT definition->'meta'->'bilingual'->'labels'->'applicant_name'->>'gu'"
                                + " FROM form_definition.form_definitions WHERE service_id = ? AND version = ?",
                        String.class,
                        serviceId,
                        1);
        assertThat(storedGujarati).isEqualTo(gujaratiText);

        MvcResult readResult = getExact(serviceId, 1);
        assertThat(bodyOf(readResult).at("/meta/bilingual/labels/applicant_name/gu").asText())
                .isEqualTo(gujaratiText);
    }
}
