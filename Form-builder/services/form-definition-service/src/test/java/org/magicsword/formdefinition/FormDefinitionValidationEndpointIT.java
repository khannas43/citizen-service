package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.junit.jupiter.api.Test;
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
 * FB-C2 MockMvc + PostgreSQL integration tests for {@code POST /api/v1/form-definitions/validation}.
 *
 * <p>The validation endpoint always returns 200 with a {@code ValidationResultBody} (valid or
 * invalid) and must never persist anything, regardless of outcome.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionValidationEndpointIT {

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

    private static final String VALIDATION_PATH = "/api/v1/form-definitions/validation";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/validation/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Missing test fixture: " + name);
            }
            return mapper.readTree(in);
        }
    }

    private long countAllRows() {
        Long count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM form_definition.form_definitions", Long.class);
        return count == null ? 0L : count;
    }

    @Test
    void validDocumentReturns200AndNeverPersists() throws Exception {
        long before = countAllRows();
        JsonNode doc = fixture("valid-single-page.json");

        mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content(doc.toString()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.issues").isEmpty());

        assertThat(countAllRows()).isEqualTo(before);
    }

    @Test
    void invalidDocumentReturns200WithDeterministicOrderedIssuesAndNeverPersists() throws Exception {
        long before = countAllRows();
        ObjectNode doc = (ObjectNode) fixture("valid-single-page.json");
        // Wipe paletteProvenance entirely so every governed field is reported as missing.
        ((ArrayNode) doc.get("meta").get("paletteProvenance")).removeAll();
        String body = doc.toString();

        MvcResult first =
                mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.valid").value(false))
                        .andReturn();
        MvcResult second =
                mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.valid").value(false))
                        .andReturn();

        List<String> firstTuples = issueTuples(first);
        List<String> secondTuples = issueTuples(second);
        assertThat(firstTuples).isNotEmpty();
        assertThat(firstTuples).containsExactlyElementsOf(secondTuples);
        assertThat(firstTuples.toString()).contains("palette.missing_provenance_entry");

        assertThat(countAllRows()).isEqualTo(before);
    }

    private List<String> issueTuples(MvcResult result) throws Exception {
        JsonNode body = mapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        return body.get("issues").findValues("code").stream().map(JsonNode::asText).toList();
    }

    @Test
    void malformedJsonReturns400ProblemJson() throws Exception {
        mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("malformed_json"));
    }

    @Test
    void duplicateJsonPropertyReturns400MalformedJson() throws Exception {
        String body = "{\"serviceId\":\"a\",\"serviceId\":\"b\",\"version\":1,\"status\":\"draft\"}";

        mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("malformed_json"));
    }

    @Test
    void unsupportedContentTypeReturns415() throws Exception {
        mockMvc.perform(post(VALIDATION_PATH).contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType());
    }
}
