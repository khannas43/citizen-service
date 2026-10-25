package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.citizen.formdefinition.application.FormDefinitionCommandService;
import org.citizen.formdefinition.application.FormDefinitionETag;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.application.FormDefinitionStore;
import org.citizen.formdefinition.application.StaleRevisionException;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
 * FB-C3 MockMvc + PostgreSQL integration tests for {@code PUT /api/v1/form-definitions} (draft
 * replacement with If-Match optimistic concurrency) plus ETag coverage for create/read.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionUpdateEndpointIT {

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

    private static final String PATH = "/api/v1/form-definitions";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionCommandService commandService;

    @Autowired
    private FormDefinitionStore store;

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

    private MvcResult createDraft(ObjectNode doc) throws Exception {
        return mockMvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private MvcResult getExact(String serviceId, int version) throws Exception {
        return mockMvc.perform(get(PATH).param("serviceId", serviceId).param("version", String.valueOf(version)))
                .andReturn();
    }

    private MvcResult putUpdate(String serviceId, int version, String ifMatch, String body) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder requestBuilder =
                put(PATH)
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

    private long selectLockVersion(String serviceId, int version) {
        Long lockVersion =
                jdbcTemplate.queryForObject(
                        "SELECT lock_version FROM form_definition.form_definitions"
                                + " WHERE service_id = ? AND version = ?",
                        Long.class,
                        serviceId,
                        version);
        return lockVersion == null ? -1L : lockVersion;
    }

    private Instant selectUpdatedAt(String serviceId, int version) {
        Timestamp ts =
                jdbcTemplate.queryForObject(
                        "SELECT updated_at FROM form_definition.form_definitions"
                                + " WHERE service_id = ? AND version = ?",
                        Timestamp.class,
                        serviceId,
                        version);
        return ts == null ? null : ts.toInstant();
    }

    private String selectStatus(String serviceId, int version) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM form_definition.form_definitions WHERE service_id = ? AND version = ?",
                String.class,
                serviceId,
                version);
    }

    private long countRows(String serviceId, int version) {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definitions"
                                + " WHERE service_id = ? AND version = ?",
                        Long.class,
                        serviceId,
                        version);
        return count == null ? 0L : count;
    }

    /** Edits the bilingual label for applicant_name, keeping the document otherwise C1-valid. */
    private static ObjectNode withChangedBilingualLabel(ObjectNode doc, String enLabel) {
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name")).put("en", enLabel);
        return doc;
    }

    // ================================================================== ETag

    @Test
    void createReturnsETagAndCacheControlNoStore() throws Exception {
        ObjectNode doc = validDraft("c3-etag-create", 1);

        MvcResult result =
                mockMvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isCreated())
                        .andExpect(header().exists(HttpHeaders.ETAG))
                        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                        .andReturn();

        String etag = etagOf(result);
        assertThat(etag).isNotBlank();
        assertThat(etag).startsWith("\"").endsWith("\"");
    }

    @Test
    void getReturnsSameETagAsCreate() throws Exception {
        ObjectNode doc = validDraft("c3-etag-get-same", 1);
        MvcResult createResult = createDraft(doc);
        String createEtag = etagOf(createResult);

        MvcResult getResult =
                mockMvc.perform(get(PATH).param("serviceId", "c3-etag-get-same").param("version", "1"))
                        .andExpect(status().isOk())
                        .andExpect(header().exists(HttpHeaders.ETAG))
                        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                        .andReturn();

        assertThat(etagOf(getResult)).isEqualTo(createEtag);
    }

    @Test
    void putRealEditReturnsNewDifferentETag() throws Exception {
        String serviceId = "c3-etag-put-differs";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String createEtag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "Applicant full name");
        MvcResult putResult =
                putUpdate(serviceId, 1, createEtag, updated.toString());
        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        String putEtag = etagOf(putResult);

        assertThat(putEtag).isNotBlank();
        assertThat(putEtag).isNotEqualTo(createEtag);
    }

    @Test
    void missingIfMatchReturns428IfMatchRequired() throws Exception {
        String serviceId = "c3-etag-missing-ifmatch";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "changed");
        MvcResult result = putUpdate(serviceId, 1, null, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(428);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("if_match_required");
    }

    @Test
    void weakIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c3-etag-weak";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String opaque = etagOf(createResult).substring(1, etagOf(createResult).length() - 1);

        assertInvalidIfMatch(serviceId, doc, "W/\"" + opaque + "\"");
    }

    @Test
    void wildcardIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c3-etag-wildcard";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);

        assertInvalidIfMatch(serviceId, doc, "*");
    }

    @Test
    void multipleTokenIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c3-etag-multiple";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        assertInvalidIfMatch(serviceId, doc, etag + ", " + etag);
    }

    @Test
    void paddedIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c3-etag-padded";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        assertInvalidIfMatch(serviceId, doc, " " + etag + " ");
    }

    @Test
    void malformedIfMatchReturns400InvalidIfMatch() throws Exception {
        String serviceId = "c3-etag-malformed";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);

        assertInvalidIfMatch(serviceId, doc, "not-a-valid-token");
        assertInvalidIfMatch(serviceId, doc, "\"not-valid-base64!!!\"");
        assertInvalidIfMatch(serviceId, doc, "\"\"");
    }

    private void assertInvalidIfMatch(String serviceId, ObjectNode originalDoc, String ifMatch) throws Exception {
        ObjectNode updated = withChangedBilingualLabel(originalDoc.deepCopy(), "changed-" + ifMatch.hashCode());
        MvcResult result = putUpdate(serviceId, 1, ifMatch, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_if_match");
    }

    @Test
    void staleTokenReturns412StaleRevision() throws Exception {
        String serviceId = "c3-etag-stale";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String createEtag = etagOf(createResult);

        // Advance the revision with one successful edit.
        ObjectNode firstEdit = withChangedBilingualLabel(doc.deepCopy(), "first edit");
        putUpdate(serviceId, 1, createEtag, firstEdit.toString());

        // Retry using the now-stale original ETag.
        ObjectNode staleEdit = withChangedBilingualLabel(doc.deepCopy(), "stale edit attempt");
        MvcResult staleResult = putUpdate(serviceId, 1, createEtag, staleEdit.toString());

        assertThat(staleResult.getResponse().getStatus()).isEqualTo(412);
        assertThat(bodyOf(staleResult).get("code").asText()).isEqualTo("stale_revision");
    }

    @Test
    void responseBodyNeverContainsLockVersionRawRevisionOrEtagStringAsField() throws Exception {
        String serviceId = "c3-etag-no-leak";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String createEtag = etagOf(createResult);
        String createBody = rawBodyOf(createResult);

        assertThat(bodyOf(createResult).findValues("lockVersion")).isEmpty();
        assertThat(bodyOf(createResult).findValues("revision")).isEmpty();
        assertThat(createBody).doesNotContain(createEtag);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "no-leak edit");
        MvcResult putResult = putUpdate(serviceId, 1, createEtag, updated.toString());
        String putBody = rawBodyOf(putResult);
        String putEtag = etagOf(putResult);

        assertThat(bodyOf(putResult).findValues("lockVersion")).isEmpty();
        assertThat(bodyOf(putResult).findValues("revision")).isEmpty();
        assertThat(putBody).doesNotContain(putEtag);
    }

    // ================================================================== Update semantics

    @Test
    void validDraftReplacementSucceedsWithChangedBilingualLabel() throws Exception {
        String serviceId = "c3-update-valid";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "Full applicant name");
        MvcResult putResult = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode returned = bodyOf(putResult);
        assertThat(returned.at("/meta/bilingual/labels/applicant_name/en").asText())
                .isEqualTo("Full applicant name");
        assertThat(selectDefinition(serviceId, 1).at("/meta/bilingual/labels/applicant_name/en").asText())
                .isEqualTo("Full applicant name");
    }

    @Test
    void invalidDocumentWipingProvenanceReturns422ValidationFailedAndDbUnchanged() throws Exception {
        String serviceId = "c3-update-invalid-provenance";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        JsonNode beforeDefinition = selectDefinition(serviceId, 1);
        long beforeLockVersion = selectLockVersion(serviceId, 1);
        Instant beforeUpdatedAt = selectUpdatedAt(serviceId, 1);

        ObjectNode invalid = doc.deepCopy();
        ((ObjectNode) invalid.get("meta")).putArray("paletteProvenance");

        MvcResult result = putUpdate(serviceId, 1, etag, invalid.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("validation_failed");

        assertThat(selectDefinition(serviceId, 1)).isEqualTo(beforeDefinition);
        assertThat(selectLockVersion(serviceId, 1)).isEqualTo(beforeLockVersion);
        assertThat(selectUpdatedAt(serviceId, 1)).isEqualTo(beforeUpdatedAt);
    }

    @Test
    void duplicateJsonKeysReturns400AndDbUnchanged() throws Exception {
        String serviceId = "c3-update-dup-keys";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        JsonNode beforeDefinition = selectDefinition(serviceId, 1);
        long beforeLockVersion = selectLockVersion(serviceId, 1);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "dup key edit");
        String rawJson = updated.toString();
        String duplicated = rawJson.replaceFirst("\\{", "{\"serviceId\":\"" + serviceId + "\",");

        MvcResult result = putUpdate(serviceId, 1, etag, duplicated);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("malformed_json");

        assertThat(selectDefinition(serviceId, 1)).isEqualTo(beforeDefinition);
        assertThat(selectLockVersion(serviceId, 1)).isEqualTo(beforeLockVersion);
    }

    @Test
    void queryCoordinatesTargetingADifferentExistingResourceThanTheBodyReturns409DefinitionCoordinateMismatch()
            throws Exception {
        String queryTargetServiceId = "c3-update-coord-query-target";
        String bodyServiceId = "c3-update-coord-body-source";
        ObjectNode queryTargetDoc = validDraft(queryTargetServiceId, 1);
        ObjectNode bodySourceDoc = validDraft(bodyServiceId, 1);
        createDraft(queryTargetDoc);
        createDraft(bodySourceDoc);

        MvcResult getResult = getExact(queryTargetServiceId, 1);
        String etag = etagOf(getResult);

        // Query coordinates resolve to an existing draft (queryTargetServiceId), but the body
        // claims to be a different existing service — the update must be rejected even though
        // both coordinate pairs individually resolve to real rows.
        ObjectNode mismatchedBody = withChangedBilingualLabel(bodySourceDoc.deepCopy(), "coord edit");
        MvcResult result = putUpdate(queryTargetServiceId, 1, etag, mismatchedBody.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("definition_coordinate_mismatch");
        assertThat(selectDefinition(queryTargetServiceId, 1)).isEqualTo(queryTargetDoc);
        assertThat(selectDefinition(bodyServiceId, 1)).isEqualTo(bodySourceDoc);
    }

    @Test
    void bodyServiceIdMismatchReturns409DefinitionCoordinateMismatch() throws Exception {
        String serviceId = "c3-update-coord-body-sid";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "coord edit");
        updated.put("serviceId", "mismatched-body-service-id");
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("definition_coordinate_mismatch");
    }

    @Test
    void bodyVersionMismatchReturns409DefinitionCoordinateMismatch() throws Exception {
        String serviceId = "c3-update-coord-body-version";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "coord edit");
        updated.put("version", 2);
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("definition_coordinate_mismatch");
    }

    @Test
    void bodyStatusPublishedReturns422UpdateRequiresDraft() throws Exception {
        String serviceId = "c3-update-status-published";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        JsonNode beforeDefinition = selectDefinition(serviceId, 1);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "published attempt");
        updated.put("status", "published");
        ObjectNode audit = (ObjectNode) updated.get("audit");
        audit.put("submittedBy", "svc-account");
        audit.put("approvedBy", "svc-account");
        audit.put("publishedAt", "2026-01-02T00:00:00Z");
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("update_requires_draft");
        assertThat(selectDefinition(serviceId, 1)).isEqualTo(beforeDefinition);
    }

    @Test
    void changingCreatedByReturns409ImmutableCreationAuditChanged() throws Exception {
        String serviceId = "c3-update-audit-createdby";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        JsonNode beforeDefinition = selectDefinition(serviceId, 1);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "audit edit");
        ((ObjectNode) updated.get("audit")).put("createdBy", "someone-else@example.gov.in");
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("immutable_creation_audit_changed");
        assertThat(selectDefinition(serviceId, 1)).isEqualTo(beforeDefinition);
    }

    @Test
    void changingCreatedAtReturns409ImmutableCreationAuditChanged() throws Exception {
        String serviceId = "c3-update-audit-createdat";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "audit edit 2");
        ((ObjectNode) updated.get("audit")).put("createdAt", "2099-01-01T00:00:00Z");
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("immutable_creation_audit_changed");
    }

    @ParameterizedTest
    @EnumSource(value = FormDefinitionStatus.class, names = {"submitted", "approved", "published", "retired"})
    void nonDraftStoredStatusReturns409DefinitionNotEditable(FormDefinitionStatus seedStatus) throws Exception {
        String serviceId = "c3-update-not-editable-" + seedStatus.name();
        ObjectNode doc = validDraft(serviceId, 1);
        doc.put("status", seedStatus.name());
        // store.create bypasses the draft-only command gate, so non-draft rows can be seeded
        // directly to exercise the update-time editability guard.
        FormDefinitionSnapshot snapshot = store.create(doc);
        String etag = FormDefinitionETag.format(snapshot.revision());

        ObjectNode updated = doc.deepCopy();
        updated.put("status", "draft");
        MvcResult result = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("definition_not_editable");
        assertThat(selectStatus(serviceId, 1)).isEqualTo(seedStatus.name());
    }

    @Test
    void notFoundReturns404() throws Exception {
        ObjectNode updated = validDraft("c3-update-not-found", 1);
        String bogusEtag = FormDefinitionETag.format(0L);

        MvcResult result = putUpdate("c3-update-not-found", 1, bogusEtag, updated.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("form_definition_not_found");
    }

    @Test
    void noOpPutWithIdenticalBodyPreservesETagAndUpdatedAt() throws Exception {
        String serviceId = "c3-update-noop";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);
        Instant updatedAtBefore = selectUpdatedAt(serviceId, 1);

        // Wait a moment to make sure a wrongly-touched updated_at would visibly differ.
        Thread.sleep(50);

        MvcResult putResult = putUpdate(serviceId, 1, etag, doc.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(etagOf(putResult)).isEqualTo(etag);
        assertThat(selectUpdatedAt(serviceId, 1)).isEqualTo(updatedAtBefore);
    }

    @Test
    void realEditAdvancesETagAndUpdatedAt() throws Exception {
        String serviceId = "c3-update-real-edit-advances";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);
        Instant updatedAtBefore = selectUpdatedAt(serviceId, 1);

        Thread.sleep(50);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "advance edit");
        MvcResult putResult = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(etagOf(putResult)).isNotEqualTo(etag);
        assertThat(selectUpdatedAt(serviceId, 1)).isAfter(updatedAtBefore);
    }

    @Test
    void mutatingParsedPutResponseThenGetAgainEqualsStored() throws Exception {
        String serviceId = "c3-update-mutate-response";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "mutate response edit");
        MvcResult putResult = putUpdate(serviceId, 1, etag, updated.toString());
        ObjectNode returned = (ObjectNode) bodyOf(putResult);
        returned.put("serviceId", "MUTATED-CLIENT-SIDE");
        returned.remove("meta");

        MvcResult getResult = getExact(serviceId, 1);
        JsonNode fetched = bodyOf(getResult);

        assertThat(fetched).isEqualTo(updated);
        assertThat(fetched.get("serviceId").asText()).isEqualTo(serviceId);
        assertThat(fetched.get("meta")).isNotNull();
    }

    @Test
    void statusColumnStaysDraftAndMatchesDocumentStatusAfterUpdate() throws Exception {
        String serviceId = "c3-update-status-column";
        ObjectNode doc = validDraft(serviceId, 1);
        createDraft(doc);
        MvcResult getResult = getExact(serviceId, 1);
        String etag = etagOf(getResult);

        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "status column edit");
        MvcResult putResult = putUpdate(serviceId, 1, etag, updated.toString());

        assertThat(putResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(selectStatus(serviceId, 1)).isEqualTo("draft");
        assertThat(bodyOf(putResult).get("status").asText()).isEqualTo("draft");
    }

    // ================================================================== Concurrency

    @Test
    void concurrentPutWithSameIfMatchAllowsExactlyOneWinner() throws Exception {
        String serviceId = "c3-concurrent-update";
        int version = 1;
        ObjectNode doc = validDraft(serviceId, version);
        FormDefinitionSnapshot created = commandService.createDraft(doc);
        long originalRevision = created.revision();

        ObjectNode editA = withChangedBilingualLabel(doc.deepCopy(), "thread-A-edit");
        ObjectNode editB = withChangedBilingualLabel(doc.deepCopy(), "thread-B-edit");
        String ifMatch = FormDefinitionETag.format(originalRevision);

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger staleFailures = new AtomicInteger();
        AtomicReference<Throwable> unexpected = new AtomicReference<>();
        AtomicReference<String> winnerLabel = new AtomicReference<>();

        Runnable attemptA =
                () -> {
                    try {
                        start.await();
                        FormDefinitionSnapshot result = commandService.replaceDraft(serviceId, String.valueOf(version), ifMatch, editA);
                        successes.incrementAndGet();
                        winnerLabel.set(result.definition().at("/meta/bilingual/labels/applicant_name/en").asText());
                    } catch (StaleRevisionException ex) {
                        staleFailures.incrementAndGet();
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
                        FormDefinitionSnapshot result = commandService.replaceDraft(serviceId, String.valueOf(version), ifMatch, editB);
                        successes.incrementAndGet();
                        winnerLabel.set(result.definition().at("/meta/bilingual/labels/applicant_name/en").asText());
                    } catch (StaleRevisionException ex) {
                        staleFailures.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(attemptA, "c3-concurrent-1");
        Thread t2 = new Thread(attemptB, "c3-concurrent-2");
        t1.start();
        t2.start();
        start.countDown();

        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        assertThat(unexpected.get()).isNull();
        assertThat(successes.get()).isEqualTo(1);
        assertThat(staleFailures.get()).isEqualTo(1);

        String storedLabel =
                selectDefinition(serviceId, version).at("/meta/bilingual/labels/applicant_name/en").asText();
        assertThat(storedLabel).isEqualTo(winnerLabel.get());
        assertThat(List.of("thread-A-edit", "thread-B-edit")).contains(storedLabel);

        assertThat(selectLockVersion(serviceId, version)).isEqualTo(originalRevision + 1);
    }

    // ================================================================== Security

    @Test
    void secretStringInInvalidUpdateNeverLeaksIntoProblemBody() throws Exception {
        String secret = "UNIQUE_SECRET_C3_XYZ";
        String serviceId = "c3-update-secret-leak-check";
        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult = createDraft(doc);
        String etag = etagOf(createResult);

        ObjectNode invalid = doc.deepCopy();
        // Trailing whitespace makes this an invalid localized pair (bilingual.label_invalid)
        // while embedding a distinctive secret that must never leak into the response.
        ((ObjectNode) invalid.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("en", secret + " ");

        MvcResult result = putUpdate(serviceId, 1, etag, invalid.toString());

        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        String body = rawBodyOf(result);
        assertThat(body).doesNotContain(secret);
        assertSecureProblemBody(body);
    }

    @Test
    void corruptStoredDefinitionOnPutReturns500StoredDefinitionCorruptWithoutLeaking() throws Exception {
        String serviceId = "c3-update-corrupt";
        ObjectNode doc = validDraft(serviceId, 1);
        FormDefinitionSnapshot created = commandService.createDraft(doc);

        jdbcTemplate.update(
                "UPDATE form_definition.form_definitions"
                        + " SET definition = jsonb_set(definition, '{serviceId}', '\"mismatched-service-id\"')"
                        + " WHERE service_id = ? AND version = ?",
                serviceId,
                1);

        String etag = FormDefinitionETag.format(created.revision());
        ObjectNode updated = withChangedBilingualLabel(doc.deepCopy(), "corrupt edit attempt");

        MvcResult putResult = putUpdate(serviceId, 1, etag, updated.toString());
        assertThat(putResult.getResponse().getStatus()).isEqualTo(500);
        assertThat(bodyOf(putResult).get("code").asText()).isEqualTo("stored_definition_corrupt");
        String putBody = rawBodyOf(putResult);
        assertSecureProblemBody(putBody);
        assertThat(putBody).doesNotContain("mismatched-service-id");

        MvcResult getResult = getExact(serviceId, 1);
        assertThat(getResult.getResponse().getStatus()).isEqualTo(500);
        assertThat(bodyOf(getResult).get("code").asText()).isEqualTo("stored_definition_corrupt");
        String getBody = rawBodyOf(getResult);
        assertSecureProblemBody(getBody);
        assertThat(getBody).doesNotContain("mismatched-service-id");
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
