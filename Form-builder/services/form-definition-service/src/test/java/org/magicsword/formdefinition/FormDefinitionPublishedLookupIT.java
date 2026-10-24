package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

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
 * FB-C5 MockMvc + PostgreSQL integration tests for
 * {@code GET /api/v1/form-definitions/published/latest}: release-head policy, retired suppression
 * without fallback, corrupt-data defence, and response-safety (ETag/no-store, detached body).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionPublishedLookupIT {

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

    private static final String PUBLISHED_LATEST_PATH = "/api/v1/form-definitions/published/latest";

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

    private FormDefinitionSnapshot transitionTo(
            String serviceId, int version, String etag, String targetStatus, String actorId) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", targetStatus);
        body.put("actorId", actorId);
        return lifecycleService.transition(serviceId, String.valueOf(version), etag, body);
    }

    /** Creates a draft then drives it through the real lifecycle service up to {@code published}. */
    private FormDefinitionSnapshot publishThroughLifecycle(String serviceId, int version) throws Exception {
        ObjectNode doc = validDraft(serviceId, version);
        FormDefinitionSnapshot created = store.create(doc);
        String etag = FormDefinitionETag.format(created.revision());

        FormDefinitionSnapshot submitted = transitionTo(serviceId, version, etag, "submitted", "alice");
        FormDefinitionSnapshot approved =
                transitionTo(serviceId, version, FormDefinitionETag.format(submitted.revision()), "approved", "bob");
        return transitionTo(
                serviceId, version, FormDefinitionETag.format(approved.revision()), "published", "carol");
    }

    private FormDefinitionSnapshot retireThroughLifecycle(
            String serviceId, int version, FormDefinitionSnapshot published) throws Exception {
        return transitionTo(
                serviceId, version, FormDefinitionETag.format(published.revision()), "retired", "dave");
    }

    private MvcResult getLatestPublished(String serviceId) throws Exception {
        return mockMvc.perform(get(PUBLISHED_LATEST_PATH).param("serviceId", serviceId)).andReturn();
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String rawBodyOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private void insertCorruptRow(String serviceId, int version, String status, String definitionJson) {
        jdbcTemplate.update(
                """
                INSERT INTO form_definition.form_definitions
                  (service_id, version, status, definition, created_at, updated_at, lock_version)
                VALUES (?, ?, ?, ?::jsonb, NOW(), NOW(), 0)
                """,
                serviceId,
                version,
                status,
                definitionJson);
    }

    // ================================================================== release-head policy

    @Test
    void draftOnlyServiceIsNotCitizenVisible() throws Exception {
        String draftOnlySvc = "c5-pub-draft-only";
        store.create(validDraft(draftOnlySvc, 1));

        MvcResult draftResult = getLatestPublished(draftOnlySvc);
        assertThat(draftResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(draftResult).get("code").asText()).isEqualTo("published_form_definition_not_found");
    }

    @Test
    void higherDraftDoesNotShadowPublished() throws Exception {
        String serviceId = "c5-pub-higher-draft-no-shadow";
        FormDefinitionSnapshot published = publishThroughLifecycle(serviceId, 1);

        // Clone the published version into a higher draft; latest-published must remain v1.
        ObjectNode cloneBody = mapper.createObjectNode().put("createdBy", "erin");
        mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                                        "/api/v1/form-definitions/drafts/from-version")
                                .param("serviceId", serviceId)
                                .param("sourceVersion", "1")
                                .header(HttpHeaders.IF_MATCH, FormDefinitionETag.format(published.revision()))
                                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                                .content(cloneBody.toString()))
                .andExpect(status().isCreated());

        MvcResult result = getLatestPublished(serviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("version").asInt()).isEqualTo(1);
        assertThat(body.get("status").asText()).isEqualTo("published");
    }

    @Test
    void submittedOrApprovedAloneIsNotCitizenVisible() throws Exception {
        String submittedSvc = "c5-pub-submitted-only";
        ObjectNode submittedDoc = validDraft(submittedSvc, 1);
        FormDefinitionSnapshot created = store.create(submittedDoc);
        transitionTo(submittedSvc, 1, FormDefinitionETag.format(created.revision()), "submitted", "alice");

        MvcResult submittedResult = getLatestPublished(submittedSvc);
        assertThat(submittedResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(submittedResult).get("code").asText())
                .isEqualTo("published_form_definition_not_found");

        String approvedSvc = "c5-pub-approved-only";
        ObjectNode approvedDoc = validDraft(approvedSvc, 1);
        FormDefinitionSnapshot approvedCreated = store.create(approvedDoc);
        FormDefinitionSnapshot approvedSubmitted =
                transitionTo(
                        approvedSvc, 1, FormDefinitionETag.format(approvedCreated.revision()), "submitted", "alice");
        transitionTo(
                approvedSvc, 1, FormDefinitionETag.format(approvedSubmitted.revision()), "approved", "bob");

        MvcResult approvedResult = getLatestPublished(approvedSvc);
        assertThat(approvedResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(approvedResult).get("code").asText())
                .isEqualTo("published_form_definition_not_found");
    }

    @Test
    void highestPublishedWinsAmongMultiplePublishedVersions() throws Exception {
        String serviceId = "c5-pub-highest-wins";
        publishThroughLifecycle(serviceId, 1);
        publishThroughLifecycle(serviceId, 2);
        publishThroughLifecycle(serviceId, 3);

        MvcResult result = getLatestPublished(serviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(bodyOf(result).get("version").asInt()).isEqualTo(3);
    }

    @Test
    void laterHigherPublishedBecomesCurrentAfterEarlierPublish() throws Exception {
        String serviceId = "c5-pub-later-becomes-current";
        publishThroughLifecycle(serviceId, 1);

        MvcResult first = getLatestPublished(serviceId);
        assertThat(bodyOf(first).get("version").asInt()).isEqualTo(1);

        publishThroughLifecycle(serviceId, 2);

        MvcResult second = getLatestPublished(serviceId);
        assertThat(bodyOf(second).get("version").asInt()).isEqualTo(2);
    }

    @Test
    void retiredReleaseHeadReturns404PublishedNotFound() throws Exception {
        String serviceId = "c5-pub-retired-404";
        FormDefinitionSnapshot published = publishThroughLifecycle(serviceId, 1);
        retireThroughLifecycle(serviceId, 1, published);

        MvcResult result = getLatestPublished(serviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("published_form_definition_not_found");
    }

    @Test
    void retirementDoesNotFallBackToOlderPublishedVersion() throws Exception {
        String serviceId = "c5-pub-no-fallback-on-retire";
        publishThroughLifecycle(serviceId, 1);
        FormDefinitionSnapshot v2 = publishThroughLifecycle(serviceId, 2);

        MvcResult beforeRetire = getLatestPublished(serviceId);
        assertThat(bodyOf(beforeRetire).get("version").asInt()).isEqualTo(2);

        retireThroughLifecycle(serviceId, 2, v2);

        MvcResult afterRetire = getLatestPublished(serviceId);
        assertThat(afterRetire.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(afterRetire).get("code").asText()).isEqualTo("published_form_definition_not_found");
    }

    @Test
    void emptyServiceReturns404PublishedNotFound() throws Exception {
        MvcResult result = getLatestPublished("c5-pub-never-existed");
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("published_form_definition_not_found");
    }

    // ================================================================== corrupt-data defence

    @Test
    void jdbcCorruptCoordinateMismatchReturns500StoredDefinitionCorruptWithoutLeaking() throws Exception {
        String serviceId = "c5-pub-corrupt-mismatch";
        insertCorruptRow(
                serviceId,
                1,
                "published",
                """
                {"serviceId":"other-service-entirely","version":1,"status":"published","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c5","createdAt":"2026-07-24T00:00:00.000Z","submittedBy":"c5","approvedBy":"c5","publishedAt":"2026-07-24T00:00:00.000Z"}}
                """);

        MvcResult result = getLatestPublished(serviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        String body = rawBodyOf(result);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("stored_definition_corrupt");
        assertSecureProblemBody(body);
    }

    @Test
    void c1InvalidPublishedDocumentMissingRequiredAuditReturns500StoredDefinitionCorrupt() throws Exception {
        String serviceId = "c5-pub-corrupt-c1-invalid";
        // Column says published, document coordinates agree, but audit is missing the
        // submittedBy/approvedBy/publishedAt keys that C1 requires once status=published.
        insertCorruptRow(
                serviceId,
                1,
                "published",
                """
                {"serviceId":"c5-pub-corrupt-c1-invalid","version":1,"status":"published","jsonSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{},"additionalProperties":false},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c5","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);

        MvcResult result = getLatestPublished(serviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        String body = rawBodyOf(result);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("stored_definition_corrupt");
        assertSecureProblemBody(body);
        // Must not leak the specific C1 issue codes/paths that would confirm internal schema shape.
        assertThat(body).doesNotContain("issues");
        assertThat(body).doesNotContain("audit_submitted_by_required");
    }

    // ================================================================== response safety

    @Test
    void responseMutationDoesNotAlterPersistence() throws Exception {
        String serviceId = "c5-pub-mutation-isolated";
        publishThroughLifecycle(serviceId, 1);

        MvcResult firstResult = getLatestPublished(serviceId);
        JsonNode firstBody = bodyOf(firstResult);
        ((ObjectNode) firstBody).put("serviceId", "MUTATED-CLIENT-SIDE");
        ((ObjectNode) firstBody).put("status", "draft");

        MvcResult secondResult = getLatestPublished(serviceId);
        JsonNode secondBody = bodyOf(secondResult);
        assertThat(secondBody.get("serviceId").asText()).isEqualTo(serviceId);
        assertThat(secondBody.get("status").asText()).isEqualTo("published");
    }

    @Test
    void successfulResponseHasETagAndNoStoreCacheControl() throws Exception {
        String serviceId = "c5-pub-etag-no-store";
        publishThroughLifecycle(serviceId, 1);

        mockMvc.perform(get(PUBLISHED_LATEST_PATH).param("serviceId", serviceId))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.status").value("published"));
    }

    private static void assertSecureProblemBody(String body) {
        assertThat(body).contains("\"code\"");
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
        assertThat(body).doesNotContain("lockVersion");
        assertThat(body).doesNotContain("other-service-entirely");
    }
}
