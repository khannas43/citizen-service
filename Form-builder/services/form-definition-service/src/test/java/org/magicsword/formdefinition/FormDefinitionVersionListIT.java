package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionStore;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
 * {@code GET /api/v1/form-definitions/versions}: ascending bounded pagination, the exclusive
 * {@code afterVersion} cursor across gaps, strict admission, the minimal response projection, and
 * corrupt-row all-or-nothing failure.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionVersionListIT {

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

    private static final String VERSIONS_PATH = "/api/v1/form-definitions/versions";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

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

    /** Seeds a row directly at the given status with a C1-compliant audit trail for that status. */
    private void seedAtStatus(String serviceId, int version, FormDefinitionStatus status) throws IOException {
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", version);
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
            audit.put("publishedAt", "2026-07-24T12:00:00Z");
        }
        store.create(doc);
    }

    private MvcResult listVersions(String serviceId, String afterVersion, String limit) throws Exception {
        var requestBuilder = get(VERSIONS_PATH).param("serviceId", serviceId);
        if (afterVersion != null) {
            requestBuilder = requestBuilder.param("afterVersion", afterVersion);
        }
        if (limit != null) {
            requestBuilder = requestBuilder.param("limit", limit);
        }
        return mockMvc.perform(requestBuilder).andReturn();
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

    // ================================================================== ordering / statuses

    @Test
    void ascendingOrderAcrossAllFiveStatuses() throws Exception {
        String serviceId = "c5-ver-all-statuses";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);
        seedAtStatus(serviceId, 2, FormDefinitionStatus.submitted);
        seedAtStatus(serviceId, 3, FormDefinitionStatus.approved);
        seedAtStatus(serviceId, 4, FormDefinitionStatus.published);
        seedAtStatus(serviceId, 5, FormDefinitionStatus.retired);

        MvcResult result = listVersions(serviceId, null, null);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("serviceId").asText()).isEqualTo(serviceId);
        JsonNode items = body.get("items");
        assertThat(items).hasSize(5);

        List<Integer> versions = new ArrayList<>();
        List<String> statuses = new ArrayList<>();
        items.forEach(
                item -> {
                    versions.add(item.get("version").asInt());
                    statuses.add(item.get("status").asText());
                });
        assertThat(versions).containsExactly(1, 2, 3, 4, 5);
        assertThat(statuses).containsExactly("draft", "submitted", "approved", "published", "retired");
        assertThat(body.has("nextAfterVersion")).isFalse();
    }

    // ================================================================== pagination

    @Test
    void paginationAcrossGapsUsesExclusiveCursor() throws Exception {
        String serviceId = "c5-ver-gaps";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);
        seedAtStatus(serviceId, 5, FormDefinitionStatus.published);
        seedAtStatus(serviceId, 10, FormDefinitionStatus.published);
        seedAtStatus(serviceId, 11, FormDefinitionStatus.retired);

        MvcResult firstPage = listVersions(serviceId, null, "2");
        JsonNode first = bodyOf(firstPage);
        assertThat(first.get("items")).hasSize(2);
        assertThat(first.get("items").get(0).get("version").asInt()).isEqualTo(1);
        assertThat(first.get("items").get(1).get("version").asInt()).isEqualTo(5);
        assertThat(first.get("nextAfterVersion").asInt()).isEqualTo(5);

        MvcResult secondPage = listVersions(serviceId, "5", "2");
        JsonNode second = bodyOf(secondPage);
        assertThat(second.get("items")).hasSize(2);
        assertThat(second.get("items").get(0).get("version").asInt()).isEqualTo(10);
        assertThat(second.get("items").get(1).get("version").asInt()).isEqualTo(11);
        assertThat(second.has("nextAfterVersion")).isFalse();

        // afterVersion between two gapped rows (7) still excludes 5 and includes 10, 11.
        MvcResult midGapPage = listVersions(serviceId, "7", "10");
        JsonNode midGap = bodyOf(midGapPage);
        List<Integer> midVersions = new ArrayList<>();
        midGap.get("items").forEach(item -> midVersions.add(item.get("version").asInt()));
        assertThat(midVersions).containsExactly(10, 11);
    }

    @Test
    void defaultLimitReturnsUpToFiftyWithoutExplicitParam() throws Exception {
        String serviceId = "c5-ver-default-limit";
        for (int v = 1; v <= 55; v++) {
            seedAtStatus(serviceId, v, FormDefinitionStatus.draft);
        }

        MvcResult result = listVersions(serviceId, null, null);
        JsonNode body = bodyOf(result);
        assertThat(body.get("items")).hasSize(50);
        assertThat(body.get("items").get(0).get("version").asInt()).isEqualTo(1);
        assertThat(body.get("items").get(49).get("version").asInt()).isEqualTo(50);
        assertThat(body.get("nextAfterVersion").asInt()).isEqualTo(50);
    }

    @Test
    void maxLimitOfOneHundredIsAccepted() throws Exception {
        String serviceId = "c5-ver-max-limit";
        for (int v = 1; v <= 3; v++) {
            seedAtStatus(serviceId, v, FormDefinitionStatus.draft);
        }

        MvcResult result = listVersions(serviceId, null, "100");
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("items")).hasSize(3);
        assertThat(body.has("nextAfterVersion")).isFalse();
    }

    @Test
    void limitPlusOneFetchProvesBoundedFetchNotFullTableCount() throws Exception {
        // 7 rows total, limit=3 -> fetchLimit=4 internally; exactly 3 returned + a cursor,
        // demonstrating the page size is derived from the bounded limit+1 fetch, not a COUNT(*).
        String serviceId = "c5-ver-bounded-fetch";
        for (int v = 1; v <= 7; v++) {
            seedAtStatus(serviceId, v, FormDefinitionStatus.draft);
        }

        MvcResult result = listVersions(serviceId, null, "3");
        JsonNode body = bodyOf(result);
        assertThat(body.get("items")).hasSize(3);
        assertThat(body.get("nextAfterVersion").asInt()).isEqualTo(3);
        assertThat(body.has("totalCount")).isFalse();
        assertThat(body.has("total")).isFalse();
    }

    @Test
    void nextAfterVersionOmittedOnLastPage() throws Exception {
        String serviceId = "c5-ver-last-page-omits-cursor";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);
        seedAtStatus(serviceId, 2, FormDefinitionStatus.published);

        MvcResult result = listVersions(serviceId, null, "10");
        JsonNode body = bodyOf(result);
        assertThat(body.get("items")).hasSize(2);
        assertThat(body.has("nextAfterVersion")).isFalse();
    }

    @Test
    void emptyServiceReturns200WithEmptyItems() throws Exception {
        MvcResult result = listVersions("c5-ver-never-existed", null, null);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = bodyOf(result);
        assertThat(body.get("serviceId").asText()).isEqualTo("c5-ver-never-existed");
        assertThat(body.get("items")).isEmpty();
        assertThat(body.has("nextAfterVersion")).isFalse();
    }

    // ================================================================== admission

    @Test
    void malformedAfterVersionReturns400InvalidPagination() throws Exception {
        String serviceId = "c5-ver-malformed-after";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);

        for (String bad : List.of("01", "+1", "-1", "1.0", "1e1", "0", " 1", "abc")) {
            MvcResult result = listVersions(serviceId, bad, null);
            assertThat(result.getResponse().getStatus()).as("afterVersion=%s", bad).isEqualTo(400);
            assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_pagination");
        }
    }

    @Test
    void malformedLimitReturns400InvalidPagination() throws Exception {
        String serviceId = "c5-ver-malformed-limit";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);

        for (String bad : List.of("0", "101", "01", "+50", "-50", "50.0", "50e1", " 50", "notanumber")) {
            MvcResult result = listVersions(serviceId, null, bad);
            assertThat(result.getResponse().getStatus()).as("limit=%s", bad).isEqualTo(400);
            assertThat(bodyOf(result).get("code").asText()).isEqualTo("invalid_pagination");
        }
    }

    // ================================================================== response shape

    @Test
    void responseContainsOnlyServiceIdItemsVersionStatusAndOptionalCursor() throws Exception {
        String serviceId = "c5-ver-minimal-projection";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.published);
        seedAtStatus(serviceId, 2, FormDefinitionStatus.draft);

        MvcResult result = listVersions(serviceId, null, "1");
        JsonNode body = bodyOf(result);

        List<String> topKeys = new ArrayList<>();
        body.fieldNames().forEachRemaining(topKeys::add);
        assertThat(topKeys).containsExactlyInAnyOrder("serviceId", "items", "nextAfterVersion");

        JsonNode item = body.get("items").get(0);
        List<String> itemKeys = new ArrayList<>();
        item.fieldNames().forEachRemaining(itemKeys::add);
        assertThat(itemKeys).containsExactlyInAnyOrder("version", "status");

        String raw = rawBodyOf(result);
        assertThat(raw).doesNotContain("audit");
        assertThat(raw).doesNotContain("createdAt");
        assertThat(raw).doesNotContain("updatedAt");
        assertThat(raw).doesNotContain("jsonSchema");
        assertThat(raw).doesNotContain("uiSchema");
        assertThat(raw).doesNotContain("lockVersion");
        assertThat(raw).doesNotContain("revision");
    }

    @Test
    void lastPageResponseOmitsNextAfterVersionKeyEntirely() throws Exception {
        String serviceId = "c5-ver-omit-key-entirely";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);

        MvcResult result = listVersions(serviceId, null, "10");
        String raw = rawBodyOf(result);
        assertThat(raw).doesNotContain("nextAfterVersion");
    }

    // ================================================================== corrupt row

    @Test
    void corruptRowFailsEntireListNotPartialResults() throws Exception {
        String serviceId = "c5-ver-corrupt-all-or-nothing";
        seedAtStatus(serviceId, 1, FormDefinitionStatus.draft);
        seedAtStatus(serviceId, 3, FormDefinitionStatus.published);
        insertCorruptRow(
                serviceId,
                2,
                "draft",
                """
                {"serviceId":"wrong-service-id","version":2,"status":"draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c5","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);

        MvcResult result = listVersions(serviceId, null, null);
        assertThat(result.getResponse().getStatus()).isEqualTo(500);
        String body = rawBodyOf(result);
        assertThat(bodyOf(result).get("code").asText()).isEqualTo("stored_definition_corrupt");
        // Not a partial list: no version/status/items content should be present in the error body.
        assertThat(body).doesNotContain("\"items\"");
        assertSecureProblemBody(body);
    }

    private static void assertSecureProblemBody(String body) {
        assertThat(body).contains("\"code\"");
        assertThat(body).doesNotContain("Exception");
        assertThat(body).doesNotContainIgnoringCase("SQL");
        assertThat(body).doesNotContainIgnoringCase("stack");
        assertThat(body).doesNotContain("Caused by");
        assertThat(body).doesNotContain("wrong-service-id");
    }
}
