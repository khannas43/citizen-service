package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.DuplicateFormDefinitionException;
import org.magicsword.formdefinition.application.FormDefinitionCommandService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C2 MockMvc + PostgreSQL integration tests for {@code POST /api/v1/form-definitions}
 * (draft-only create): validate-then-persist, 422/409 failure mapping, and no-leak security
 * assertions on the {@code ProblemDetail} body.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionCreateEndpointIT {

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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionCommandService commandService;

    private final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/validation/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Missing test fixture: " + name);
            }
            return (ObjectNode) mapper.readTree(in);
        }
    }

    /** A fully C1-compliant draft, retargeted to a fresh serviceId/version for test isolation. */
    private ObjectNode validDraft(String serviceId, int version) throws IOException {
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", version);
        doc.put("status", "draft");
        return doc;
    }

    private long countRows(String serviceId, int version) {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definitions WHERE service_id = ? AND version = ?",
                        Long.class,
                        serviceId,
                        version);
        return count == null ? 0L : count;
    }

    private static ObjectNode nestedChain(ObjectMapper mapper, int depth) {
        ObjectNode node = mapper.createObjectNode();
        if (depth <= 0) {
            node.put("leaf", true);
            return node;
        }
        node.set("child", nestedChain(mapper, depth - 1));
        return node;
    }

    // ---------------------------------------------------------------- happy path

    @Test
    void validDraftCreatesRowAndLocationEncodesGetUrlAndResponseBodyIsDetached() throws Exception {
        ObjectNode doc = validDraft("c2-create-valid", 1);

        MvcResult createResult =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isCreated())
                        .andExpect(header().exists("Location"))
                        .andReturn();

        String location = createResult.getResponse().getHeader("Location");
        assertThat(location).isNotNull();
        URI locationUri = URI.create(location);
        assertThat(locationUri.getPath()).endsWith(CREATE_PATH);
        assertThat(locationUri.getQuery()).contains("serviceId=c2-create-valid").contains("version=1");

        JsonNode createdBody = mapper.readTree(createResult.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(createdBody).isEqualTo(doc);

        // Mutating the parsed response body must never affect what a subsequent GET returns.
        ((ObjectNode) createdBody).put("serviceId", "MUTATED-CLIENT-SIDE");

        MvcResult getResult =
                mockMvc.perform(get(locationUri)).andExpect(status().isOk()).andReturn();
        JsonNode fetched = mapper.readTree(getResult.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(fetched).isEqualTo(doc);
        assertThat(fetched.get("serviceId").asText()).isEqualTo("c2-create-valid");

        assertThat(countRows("c2-create-valid", 1)).isEqualTo(1);
    }

    // ---------------------------------------------------------------- 422 validation_failed

    @Test
    void invalidDocumentFailingAtLeastTwoStagesReturns422ValidationFailedAndPersistsNothing() throws Exception {
        ObjectNode doc = validDraft("c2-create-invalid-multi-stage", 1);
        // Stage 2: provenance widgetType mismatched with uiSchema selection.
        ((ObjectNode) doc.get("meta").get("paletteProvenance").get(0)).put("widgetType", "not-a-real-widget");
        // Stage 3: incomplete bilingual copy (missing "gu").
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name")).remove("gu");

        MvcResult result =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isUnprocessableEntity())
                        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                        .andExpect(jsonPath("$.code").value("validation_failed"))
                        .andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(body.get("issues")).isNotEmpty();
        assertThat(body.get("issues").size()).isGreaterThanOrEqualTo(2);
        java.util.List<String> codes = body.get("issues").findValues("code").stream().map(JsonNode::asText).toList();
        assertThat(codes).contains("palette.provenance_unknown_widget_type", "bilingual.label_invalid");

        assertThat(countRows("c2-create-invalid-multi-stage", 1)).isZero();
    }

    @Test
    void oversizedDepthDocumentReturns422AndIsNotPersisted() throws Exception {
        ObjectNode doc = validDraft("c2-create-oversized-depth", 1);
        doc.set("x-depth-bomb-not-a-real-key", nestedChain(mapper, 100));

        // Adding an unknown top-level key would itself be a validation error, but the
        // depth-limit short-circuit fires first in the pipeline and reports only the
        // traversal_depth_limit_exceeded issue before any other stage runs.
        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.issues[*].code").value(
                        org.hamcrest.Matchers.hasItem("structure.traversal_depth_limit_exceeded")));

        assertThat(countRows("c2-create-oversized-depth", 1)).isZero();
    }

    @Test
    void oversizedNodeCountDocumentReturns422AndIsNotPersisted() throws Exception {
        ObjectNode doc = validDraft("c2-create-oversized-nodes", 1);
        ArrayNode bloat = doc.putArray("x-node-bomb-not-a-real-key");
        for (int i = 0; i < 10_500; i++) {
            bloat.addNull();
        }

        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.issues[*].code").value(
                        org.hamcrest.Matchers.hasItem("structure.traversal_node_limit_exceeded")));

        assertThat(countRows("c2-create-oversized-nodes", 1)).isZero();
    }

    @Test
    void secretStringInInvalidDocumentNeverLeaksIntoProblemBody() throws Exception {
        String secret = "UNIQUE_SECRET_C2_XYZ";
        ObjectNode doc = validDraft("c2-create-secret-leak-check", 1);
        // Trailing whitespace makes this an invalid localized pair (bilingual.label_invalid)
        // while embedding a distinctive secret that must never leak into the response.
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("en", secret + " ");

        MvcResult result =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isUnprocessableEntity())
                        .andReturn();

        String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(body).doesNotContain(secret);
        assertSecureProblemBody(body);
        assertThat(countRows("c2-create-secret-leak-check", 1)).isZero();
    }

    // ---------------------------------------------------------------- 422 create_requires_draft

    @Test
    void publishedButOtherwiseValidDocumentReturns422CreateRequiresDraft() throws Exception {
        ObjectNode doc = validDraft("c2-create-published", 1);
        doc.put("status", "published");
        ObjectNode audit = (ObjectNode) doc.get("audit");
        audit.put("submittedBy", "svc-account");
        audit.put("approvedBy", "svc-account");
        audit.put("publishedAt", "2026-01-02T00:00:00Z");

        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("create_requires_draft"));

        assertThat(countRows("c2-create-published", 1)).isZero();
    }

    // ---------------------------------------------------------------- 409 duplicate

    @Test
    void duplicateCreateReturns409AndOriginalRowUnchanged() throws Exception {
        ObjectNode first = validDraft("c2-create-duplicate", 1);
        ((ObjectNode) first.get("audit")).put("createdBy", "original-creator");

        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(first.toString()))
                .andExpect(status().isCreated());

        ObjectNode second = first.deepCopy();
        ((ObjectNode) second.get("audit")).put("createdBy", "overwrite-attempt");

        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(second.toString()))
                .andExpect(status().isConflict())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("duplicate_form_definition"));

        assertThat(countRows("c2-create-duplicate", 1)).isEqualTo(1);
        String storedCreatedBy =
                jdbcTemplate.queryForObject(
                        "SELECT definition->'audit'->>'createdBy' FROM form_definition.form_definitions"
                                + " WHERE service_id = ? AND version = ?",
                        String.class,
                        "c2-create-duplicate",
                        1);
        assertThat(storedCreatedBy).isEqualTo("original-creator");
    }

    @Test
    void concurrentCreateViaCommandServiceAllowsExactlyOneWinner() throws Exception {
        String serviceId = "c2-create-race";
        int version = 1;
        ObjectNode template = validDraft(serviceId, version);

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger duplicates = new AtomicInteger();
        AtomicReference<Throwable> unexpected = new AtomicReference<>();

        Runnable attempt =
                () -> {
                    try {
                        start.await();
                        ObjectNode doc = template.deepCopy();
                        ((ObjectNode) doc.get("audit")).put("createdBy", "thread-" + Thread.currentThread().getId());
                        commandService.createDraft(doc);
                        successes.incrementAndGet();
                    } catch (DuplicateFormDefinitionException ex) {
                        duplicates.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(attempt, "c2-race-1");
        Thread t2 = new Thread(attempt, "c2-race-2");
        t1.start();
        t2.start();
        start.countDown();

        assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        assertThat(unexpected.get()).isNull();
        assertThat(successes.get()).isEqualTo(1);
        assertThat(duplicates.get()).isEqualTo(1);
        assertThat(countRows(serviceId, version)).isEqualTo(1);
    }

    // ---------------------------------------------------------------- security assertions

    @Test
    void malformedCreateJsonReturns400ProblemJsonWithoutLeakingInternals() throws Exception {
        MvcResult result =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content("{"))
                        .andExpect(status().isBadRequest())
                        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                        .andExpect(jsonPath("$.code").value("malformed_json"))
                        .andReturn();
        assertSecureProblemBody(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void unsupportedContentTypeOnCreateReturns415() throws Exception {
        mockMvc.perform(post(CREATE_PATH).contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType());
    }

    private static void assertSecureProblemBody(String body) {
        assertThat(body).contains("\"code\"");
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
    }
}
