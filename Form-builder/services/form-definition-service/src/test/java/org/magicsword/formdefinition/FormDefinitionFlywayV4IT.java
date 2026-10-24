package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** FB-E1 Flyway V4 governance queue partial index. */
@SpringBootTest
@Testcontainers
class FormDefinitionFlywayV4IT {

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

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void governanceQueueIndexExistsWithExpectedPredicate() {
        Map<String, Object> indexRow =
                jdbcTemplate.queryForMap(
                        """
                        SELECT indexdef FROM pg_indexes
                        WHERE schemaname = 'form_definition'
                          AND tablename = 'form_definitions'
                          AND indexname = 'form_definitions_governance_queue_idx'
                        """);
        String indexDef = String.valueOf(indexRow.get("indexdef")).toLowerCase();
        assertThat(indexDef).contains("service_id");
        assertThat(indexDef).contains("version");
        assertThat(indexDef).contains("submitted");
        assertThat(indexDef).contains("approved");
    }
}
