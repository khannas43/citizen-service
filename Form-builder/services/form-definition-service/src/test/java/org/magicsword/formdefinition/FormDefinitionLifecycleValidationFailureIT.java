package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionValidationService;
import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
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
 * FB-C4 dedicated integration test proving that when the lifecycle transition candidate document
 * fails C1 validation, the transition is rejected atomically: neither the {@code form_definitions}
 * row nor any {@code form_definition_lifecycle_events} row is mutated.
 *
 * <p>Runs in its own Spring context with {@link FormDefinitionValidationService} mocked, since the
 * candidate built from an already-valid stored draft cannot naturally fail C1 through the public
 * API — the mock lets the first (create) validation pass and only the second (transition
 * candidate) validation fail.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionLifecycleValidationFailureIT {

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

    @MockBean
    private FormDefinitionValidationService validationService;

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

    private static ValidationResult validResult() {
        return new ValidationResult(true, List.of());
    }

    private static ValidationResult invalidResult() {
        return new ValidationResult(
                false, List.of(ValidationIssue.error("forced.invalid_for_test", "forced invalid", null)));
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
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

    @Test
    void candidateValidationFailureLeavesDefinitionAndEventRowsUnchanged() throws Exception {
        String serviceId = "c4-lc-validation-rollback";

        // First invocation (draft create) is valid; every subsequent invocation (the lifecycle
        // transition candidate) is forced invalid.
        when(validationService.validate(any())).thenReturn(validResult()).thenReturn(invalidResult());

        ObjectNode doc = validDraft(serviceId, 1);
        MvcResult createResult =
                mockMvc.perform(post(CREATE_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                        .andExpect(status().isCreated())
                        .andReturn();
        String etag = createResult.getResponse().getHeader(HttpHeaders.ETAG);

        JsonNode beforeDefinition = selectDefinition(serviceId, 1);
        long beforeLockVersion = selectLockVersion(serviceId, 1);

        ObjectNode transitionBody = mapper.createObjectNode();
        transitionBody.put("targetStatus", "submitted");
        transitionBody.put("actorId", "alice");

        MvcResult transitionResult =
                mockMvc.perform(
                                post(LIFECYCLE_PATH)
                                        .param("serviceId", serviceId)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(transitionBody.toString()))
                        .andReturn();

        assertThat(transitionResult.getResponse().getStatus()).isEqualTo(422);
        assertThat(bodyOf(transitionResult).get("code").asText()).isEqualTo("validation_failed");

        // Atomic rejection: neither the definition row nor any event row changed.
        assertThat(selectStatus(serviceId, 1)).isEqualTo("draft");
        assertThat(selectDefinition(serviceId, 1)).isEqualTo(beforeDefinition);
        assertThat(selectLockVersion(serviceId, 1)).isEqualTo(beforeLockVersion);
        assertThat(countEventRows(serviceId, 1)).isZero();
    }
}
