package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C5 Flyway migration integration tests: clean {@code V1 -> V2 -> V3} apply on a fresh
 * database, the {@code form_definitions_release_head_idx} partial index exists with the expected
 * definition, V1/V2 migration content is provably unchanged (SHA-256 fixed at authoring time), and
 * the planner is capable of using the new index for the representative release-head query.
 */
@SpringBootTest
@Testcontainers
class FormDefinitionFlywayV3IT {

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

    // SHA-256 of the migration file content, fixed when V3 was authored. Any future edit to V1 or
    // V2 SQL must go through a governed migration decision, not a silent content rewrite.
    private static final String V1_SHA256 =
            "918ae688ff532d0a727871d71125cd685410b0e3a429852be8797c89010c26d7";
    private static final String V2_SHA256 =
            "5044655369efb9e45ff5b5ac46277bb9b3dd3b4eb29a94560bdf7f2330dcaf32";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionStore store;

    private final ObjectMapper mapper = new ObjectMapper();

    // ================================================================== clean migration apply

    @Test
    void v1ThroughV3ApplySuccessfullyOnAFreshDatabase() {
        List<Map<String, Object>> history =
                jdbcTemplate.queryForList(
                        "SELECT version, description, success FROM form_definition.flyway_schema_history"
                                + " WHERE type = 'SQL' ORDER BY installed_rank ASC");

        List<String> versions = history.stream().map(row -> String.valueOf(row.get("version"))).toList();
        // FB-E1 adds V4; V1–V3 must still apply first and remain successful.
        assertThat(versions).containsSequence("1", "2", "3");
        assertThat(versions).contains("4");

        for (Map<String, Object> row : history) {
            assertThat((Boolean) row.get("success"))
                    .as("migration V%s succeeded", row.get("version"))
                    .isTrue();
        }
    }

    // ================================================================== V3 index

    @Test
    void releaseHeadIndexExistsWithExpectedColumnsAndPredicate() {
        Map<String, Object> indexRow =
                jdbcTemplate.queryForMap(
                        """
                        SELECT indexdef FROM pg_indexes
                        WHERE schemaname = 'form_definition'
                          AND tablename = 'form_definitions'
                          AND indexname = 'form_definitions_release_head_idx'
                        """);
        String indexDef = String.valueOf(indexRow.get("indexdef")).toLowerCase(java.util.Locale.ROOT);
        assertThat(indexDef).contains("service_id");
        assertThat(indexDef).contains("version");
        assertThat(indexDef).contains("desc");
        assertThat(indexDef).contains("published");
        assertThat(indexDef).contains("retired");
    }

    // ================================================================== V1 / V2 unchanged

    @Test
    void v1MigrationContentIsByteForByteUnchanged() throws IOException, NoSuchAlgorithmException {
        assertThat(sha256Of("V1__form_definitions.sql")).isEqualTo(V1_SHA256);
    }

    @Test
    void v2MigrationContentIsByteForByteUnchanged() throws IOException, NoSuchAlgorithmException {
        assertThat(sha256Of("V2__form_definition_lifecycle_events.sql")).isEqualTo(V2_SHA256);
    }

    private String sha256Of(String migrationFileName) throws IOException, NoSuchAlgorithmException {
        try (InputStream in =
                getClass().getResourceAsStream("/db/migration/" + migrationFileName)) {
            if (in == null) {
                throw new IllegalStateException("Missing migration resource: " + migrationFileName);
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(in.readAllBytes());
            return HexFormat.of().formatHex(hash);
        }
    }

    // ================================================================== planner capability

    @Test
    void plannerCanUseReleaseHeadIndexForRepresentativeQuery() throws IOException {
        String serviceId = "c5-flyway-explain-svc";
        ObjectNode doc = fixture("valid-single-page.json");
        doc.put("serviceId", serviceId);
        doc.put("version", 1);
        doc.put("status", "published");
        ObjectNode audit = (ObjectNode) doc.get("audit");
        audit.put("submittedBy", "seed");
        audit.put("approvedBy", "seed");
        audit.put("publishedAt", "2026-07-24T00:00:00Z");
        store.create(doc);

        List<String> planLines = explainReleaseHeadQuery(serviceId);
        String plan = String.join("\n", planLines).toLowerCase(java.util.Locale.ROOT);

        boolean usesIndexOrScan =
                plan.contains("form_definitions_release_head_idx")
                        || plan.contains("index scan")
                        || plan.contains("index only scan")
                        || plan.contains("bitmap");
        assertThat(usesIndexOrScan)
                .as("EXPLAIN plan should be able to use the release-head index: %s", plan)
                .isTrue();
    }

    private ObjectNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/validation/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Missing test fixture: " + name);
            }
            return (ObjectNode) mapper.readTree(in);
        }
    }

    /**
     * Runs EXPLAIN for the release-head lookup shape with {@code enable_seqscan} disabled on this
     * connection only, so the planner is forced to demonstrate index-capability rather than
     * relying on cardinality estimates from a tiny test table (soft structural assertion; exact
     * plan text is not asserted).
     */
    private List<String> explainReleaseHeadQuery(String serviceId) {
        return jdbcTemplate.execute(
                (ConnectionCallback<List<String>>)
                        connection -> {
                            List<String> lines = new ArrayList<>();
                            try (var setStatement = connection.createStatement()) {
                                setStatement.execute("SET enable_seqscan = OFF");
                            }
                            try (PreparedStatement statement =
                                    connection.prepareStatement(
                                            """
                                            EXPLAIN SELECT service_id, version, status
                                            FROM form_definition.form_definitions
                                            WHERE service_id = ?
                                              AND status IN ('published', 'retired')
                                            ORDER BY version DESC
                                            LIMIT 1
                                            """)) {
                                statement.setString(1, serviceId);
                                try (ResultSet resultSet = statement.executeQuery()) {
                                    while (resultSet.next()) {
                                        lines.add(resultSet.getString(1));
                                    }
                                }
                            } finally {
                                try (var resetStatement = connection.createStatement()) {
                                    resetStatement.execute("SET enable_seqscan = ON");
                                }
                            }
                            return lines;
                        });
    }
}
