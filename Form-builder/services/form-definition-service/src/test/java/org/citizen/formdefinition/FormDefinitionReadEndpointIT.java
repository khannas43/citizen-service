package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.citizen.formdefinition.application.FormDefinitionCommandService;
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
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C2 MockMvc + PostgreSQL integration tests for {@code GET /api/v1/form-definitions} (exact
 * read by serviceId + version).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionReadEndpointIT {

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

    private static final String READ_PATH = "/api/v1/form-definitions";

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

    private ObjectNode validDraft(String serviceId, int version) throws IOException {
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", version);
        doc.put("status", "draft");
        return doc;
    }

    // ---------------------------------------------------------------- happy path

    @Test
    void afterCreateGetExactReturns200WithStoredBody() throws Exception {
        ObjectNode doc = validDraft("c2-read-happy", 1);
        commandService.createDraft(doc);

        MvcResult result =
                mockMvc.perform(get(READ_PATH).param("serviceId", "c2-read-happy").param("version", "1"))
                        .andExpect(status().isOk())
                        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                        .andReturn();

        JsonNode fetched = mapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(fetched).isEqualTo(doc);
    }

    @Test
    void mutatingParsedGetResponseDoesNotAffectSubsequentGet() throws Exception {
        ObjectNode doc = validDraft("c2-read-detached", 1);
        commandService.createDraft(doc);

        MvcResult firstResult =
                mockMvc.perform(get(READ_PATH).param("serviceId", "c2-read-detached").param("version", "1"))
                        .andExpect(status().isOk())
                        .andReturn();
        ObjectNode first = (ObjectNode) mapper.readTree(firstResult.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        first.put("serviceId", "MUTATED-CLIENT-SIDE");
        first.remove("meta");

        MvcResult secondResult =
                mockMvc.perform(get(READ_PATH).param("serviceId", "c2-read-detached").param("version", "1"))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode second = mapper.readTree(secondResult.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));

        assertThat(second).isEqualTo(doc);
        assertThat(second.get("serviceId").asText()).isEqualTo("c2-read-detached");
        assertThat(second.get("meta")).isNotNull();
    }

    // ---------------------------------------------------------------- 404

    @Test
    void missingDefinitionReturns404() throws Exception {
        mockMvc.perform(get(READ_PATH).param("serviceId", "c2-read-does-not-exist").param("version", "1"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("form_definition_not_found"));
    }

    // ---------------------------------------------------------------- 400 invalid coordinates

    @ParameterizedTest
    @ValueSource(strings = {"0", "01", "1.0", "+1", "1e3", " 1", "1 ", "", "-1", "1e2"})
    void nonCanonicalVersionReturns400InvalidCoordinates(String version) throws Exception {
        mockMvc.perform(get(READ_PATH).param("serviceId", "c2-read-bad-version").param("version", version))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("invalid_coordinates"));
    }

    @ParameterizedTest
    @ValueSource(strings = {" x ", "", "   "})
    void paddedOrBlankServiceIdReturns400InvalidCoordinates(String serviceId) throws Exception {
        mockMvc.perform(get(READ_PATH).param("serviceId", serviceId).param("version", "1"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("invalid_coordinates"));
    }

    // ---------------------------------------------------------------- 500 stored_definition_corrupt

    @Test
    void corruptStoredDefinitionReturns500WithGenericDetailOnly() throws Exception {
        String serviceId = "c2-read-corrupt";
        commandService.createDraft(validDraft(serviceId, 1));

        jdbcTemplate.update(
                "UPDATE form_definition.form_definitions"
                        + " SET definition = jsonb_set(definition, '{serviceId}', '\"mismatched-service-id\"')"
                        + " WHERE service_id = ? AND version = ?",
                serviceId,
                1);

        MvcResult result =
                mockMvc.perform(get(READ_PATH).param("serviceId", serviceId).param("version", "1"))
                        .andExpect(status().isInternalServerError())
                        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                        .andExpect(jsonPath("$.code").value("stored_definition_corrupt"))
                        .andReturn();

        String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
        assertThat(body).doesNotContain("mismatched-service-id");
    }
}
