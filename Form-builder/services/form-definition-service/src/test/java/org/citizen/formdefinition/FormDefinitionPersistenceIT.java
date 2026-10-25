package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.DuplicateFormDefinitionException;
import org.citizen.formdefinition.application.FormDefinitionAdmissionException;
import org.citizen.formdefinition.application.FormDefinitionStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

@SpringBootTest
@Testcontainers
class FormDefinitionPersistenceIT {

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
    private FormDefinitionStore store;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void flywayCreatesSchemaAndTable() {
        Integer schemaCount =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'form_definition'",
                        Integer.class);
        Integer tableCount =
                jdbcTemplate.queryForObject(
                        """
                        SELECT COUNT(*) FROM information_schema.tables
                        WHERE table_schema = 'form_definition' AND table_name = 'form_definitions'
                        """,
                        Integer.class);
        assertThat(schemaCount).isEqualTo(1);
        assertThat(tableCount).isEqualTo(1);
    }

    @Test
    void definitionColumnIsNativeJsonb() {
        ObjectNode doc = representativeDraft("jsonb-type-check", 1);
        store.create(doc);

        String pgType =
                jdbcTemplate.queryForObject(
                        """
                        SELECT pg_typeof(definition)::text
                        FROM form_definition.form_definitions
                        WHERE service_id = ? AND version = ?
                        """,
                        String.class,
                        "jsonb-type-check",
                        1);
        assertThat(pgType).isEqualTo("jsonb");
    }

    @Test
    void representativeDraftRoundTripsWithSemanticEquality() throws Exception {
        ObjectNode doc = representativeDraft("income-certificate-illustrative", 1);
        JsonNode saved = store.create(doc).definition();
        JsonNode loaded = store.find("income-certificate-illustrative", 1).orElseThrow();

        assertThat(saved).isEqualTo(doc);
        assertThat(loaded).isEqualTo(doc);
        assertThat(loaded).isEqualTo(saved);
    }

    @Test
    void gujaratiUnicodeSurvivesRoundTrip() {
        ObjectNode doc = representativeDraft("unicode-service", 1);
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name"))
                .put("gu", "અરજદારનું નામ");
        JsonNode loaded = store.create(doc).definition();
        assertThat(loaded.at("/meta/bilingual/labels/applicant_name/gu").asText())
                .isEqualTo("અરજદારનું નામ");
        assertThat(store.find("unicode-service", 1).orElseThrow().at("/meta/bilingual/labels/applicant_name/gu")
                        .asText())
                .isEqualTo("અરજદારનું નામ");
    }

    @Test
    void nestedTypesSurviveRoundTrip() {
        ObjectNode doc = representativeDraft("nested-types", 1);
        ObjectNode extras = doc.putObject("x-c0-fixture");
        extras.putObject("nested").put("flag", true).putNull("empty");
        extras.putArray("list").add(1).add("two").add(false);
        extras.put("amount", 42);

        JsonNode loaded = store.create(doc).definition();
        assertThat(loaded.at("/x-c0-fixture/nested/flag").asBoolean()).isTrue();
        assertThat(loaded.at("/x-c0-fixture/nested/empty").isNull()).isTrue();
        assertThat(loaded.at("/x-c0-fixture/list").get(0).asInt()).isEqualTo(1);
        assertThat(loaded.at("/x-c0-fixture/list").get(1).asText()).isEqualTo("two");
        assertThat(loaded.at("/x-c0-fixture/list").get(2).asBoolean()).isFalse();
        assertThat(loaded.at("/x-c0-fixture/amount").asInt()).isEqualTo(42);
    }

    @Test
    void primaryKeyIsServiceIdPlusVersion() {
        store.create(representativeDraft("pk-service", 1));
        store.create(representativeDraft("pk-service", 2));

        Map<String, Object> row =
                jdbcTemplate.queryForMap(
                        """
                        SELECT service_id, version FROM form_definition.form_definitions
                        WHERE service_id = ? AND version = ?
                        """,
                        "pk-service",
                        1);
        assertThat(row.get("service_id")).isEqualTo("pk-service");
        assertThat(((Number) row.get("version")).intValue()).isEqualTo(1);
        assertThat(store.find("pk-service", 1)).isPresent();
        assertThat(store.find("pk-service", 2)).isPresent();
    }

    @Test
    void sameServiceIdDifferentVersionsAllowed() {
        store.create(representativeDraft("multi-version", 1));
        store.create(representativeDraft("multi-version", 2));
        assertThat(store.find("multi-version", 1)).isPresent();
        assertThat(store.find("multi-version", 2)).isPresent();
    }

    @Test
    void duplicateServiceIdAndVersionRejectedNeverOverwritten() {
        ObjectNode first = representativeDraft("dup-service", 1);
        first.put("marker", "original");
        store.create(first);

        ObjectNode second = representativeDraft("dup-service", 1);
        second.put("marker", "overwrite-attempt");

        assertThatThrownBy(() -> store.create(second)).isInstanceOf(DuplicateFormDefinitionException.class);

        JsonNode loaded = store.find("dup-service", 1).orElseThrow();
        assertThat(loaded.get("marker").asText()).isEqualTo("original");
        assertThat(countRows("dup-service", 1)).isEqualTo(1);
    }

    @Test
    void invalidStatusRejectedAndNoRowCreated() {
        long before = countAllRows();
        ObjectNode doc = representativeDraft("bad-status", 1);
        doc.put("status", "pending");
        assertThatThrownBy(() -> store.create(doc)).isInstanceOf(FormDefinitionAdmissionException.class);
        assertThat(countAllRows()).isEqualTo(before);
    }

    @Test
    void missingBlankNoncanonicalServiceIdRejected() {
        long before = countAllRows();

        ObjectNode missing = representativeDraft("tmp", 1);
        missing.remove("serviceId");
        assertThatThrownBy(() -> store.create(missing)).isInstanceOf(FormDefinitionAdmissionException.class);

        ObjectNode blank = representativeDraft("tmp", 1);
        blank.put("serviceId", "");
        assertThatThrownBy(() -> store.create(blank)).isInstanceOf(FormDefinitionAdmissionException.class);

        ObjectNode whitespace = representativeDraft("tmp", 1);
        whitespace.put("serviceId", "  padded  ");
        assertThatThrownBy(() -> store.create(whitespace)).isInstanceOf(FormDefinitionAdmissionException.class);

        ObjectNode nonString = representativeDraft("tmp", 1);
        nonString.put("serviceId", 123);
        assertThatThrownBy(() -> store.create(nonString)).isInstanceOf(FormDefinitionAdmissionException.class);

        assertThat(countAllRows()).isEqualTo(before);
    }

    @Test
    void invalidVersionsRejected() {
        long before = countAllRows();

        assertRejectedVersion(0);
        assertRejectedVersion(-1);
        assertRejectedVersion(1.5);
        assertRejectedVersion(1.0); // floating JSON number, even if whole
        assertRejectedVersion("2");

        ObjectNode overflow = representativeDraft("ver-overflow", 1);
        overflow.put("version", Long.MAX_VALUE);
        assertThatThrownBy(() -> store.create(overflow)).isInstanceOf(FormDefinitionAdmissionException.class);

        assertThat(countAllRows()).isEqualTo(before);
    }

    @Test
    void topLevelNonObjectRejected() throws Exception {
        long before = countAllRows();
        JsonNode array = objectMapper.readTree("[1,2,3]");
        JsonNode text = objectMapper.readTree("\"nope\"");
        assertThatThrownBy(() -> store.create(array)).isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.create(text)).isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.create(null)).isInstanceOf(FormDefinitionAdmissionException.class);
        assertThat(countAllRows()).isEqualTo(before);
    }

    @Test
    void coordinateMismatchOnLoadIsRejected() {
        // Insert a corrupt row where columns disagree with the JSON document.
        jdbcTemplate.update(
                """
                INSERT INTO form_definition.form_definitions
                  (service_id, version, status, definition, created_at, updated_at, lock_version)
                VALUES (?, ?, ?, ?::jsonb, NOW(), NOW(), 0)
                """,
                "mismatch-service",
                1,
                "draft",
                """
                {"serviceId":"other-service","version":1,"status":"draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);

        assertThatThrownBy(() -> store.find("mismatch-service", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void loadRejectsNumericServiceIdEvenWhenColumnMatchesCoercedText() {
        insertCorrupt(
                "numeric-sid",
                1,
                "draft",
                """
                {"serviceId":123,"version":1,"status":"draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);
        assertThatThrownBy(() -> store.find("numeric-sid", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void loadRejectsFractionalVersionEvenWhenColumnMatchesTruncation() {
        insertCorrupt(
                "frac-ver",
                1,
                "draft",
                """
                {"serviceId":"frac-ver","version":1.5,"status":"draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);
        assertThatThrownBy(() -> store.find("frac-ver", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void loadRejectsMissingCoordinateNonTextualStatusAndPaddedStatus() {
        insertCorrupt(
                "missing-coord",
                1,
                "draft",
                """
                {"version":1,"status":"draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);
        assertThatThrownBy(() -> store.find("missing-coord", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        insertCorrupt(
                "nontext-status",
                1,
                "draft",
                """
                {"serviceId":"nontext-status","version":1,"status":true,"jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);
        assertThatThrownBy(() -> store.find("nontext-status", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        insertCorrupt(
                "padded-status",
                1,
                "draft",
                """
                {"serviceId":"padded-status","version":1,"status":" draft","jsonSchema":{},"uiSchema":{},"meta":{"paletteProvenance":[],"bilingual":{"labels":{},"help":{},"errors":{}},"prefillBindings":[],"integrationBindings":[],"workflowBindings":[],"progressiveSteps":[]},"audit":{"createdBy":"c0","createdAt":"2026-07-24T00:00:00.000Z"}}
                """);
        assertThatThrownBy(() -> store.find("padded-status", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void serviceIdLengthBoundaryUsesUnicodeCodePoints() {
        String exactly256 = "a".repeat(256);
        store.create(representativeDraft(exactly256, 1));
        assertThat(store.find(exactly256, 1)).isPresent();

        long before = countAllRows();
        String tooLong = "a".repeat(257);
        ObjectNode oversized = representativeDraft("tmp-len", 1);
        oversized.put("serviceId", tooLong);
        assertThatThrownBy(() -> store.create(oversized))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThat(countAllRows()).isEqualTo(before);

        // 256 emoji code points (each emoji is one code point, two UTF-16 chars).
        String emoji256 = "😀".repeat(256);
        assertThat(emoji256.codePointCount(0, emoji256.length())).isEqualTo(256);
        store.create(representativeDraft(emoji256, 1));
        assertThat(store.find(emoji256, 1)).isPresent();

        String emoji257 = "😀".repeat(257);
        ObjectNode emojiOver = representativeDraft("tmp-emoji", 1);
        emojiOver.put("serviceId", emoji257);
        long beforeEmoji = countAllRows();
        assertThatThrownBy(() -> store.create(emojiOver))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThat(countAllRows()).isEqualTo(beforeEmoji);
    }

    @Test
    void concurrentDuplicateCreateAllowsExactlyOneWinner() throws Exception {
        String serviceId = "race-service";
        int version = 1;
        ObjectNode template = representativeDraft(serviceId, version);
        template.put("marker", "winner-candidate");

        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(2);
        java.util.concurrent.atomic.AtomicInteger successes =
                new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger duplicates =
                new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<Throwable> unexpected =
                new java.util.concurrent.atomic.AtomicReference<>();

        Runnable attempt =
                () -> {
                    try {
                        start.await();
                        ObjectNode doc = template.deepCopy();
                        doc.put("marker", "thread-" + Thread.currentThread().getId());
                        store.create(doc);
                        successes.incrementAndGet();
                    } catch (DuplicateFormDefinitionException ex) {
                        duplicates.incrementAndGet();
                    } catch (Throwable ex) {
                        unexpected.compareAndSet(null, ex);
                    } finally {
                        done.countDown();
                    }
                };

        Thread t1 = new Thread(attempt, "c0.1-race-1");
        Thread t2 = new Thread(attempt, "c0.1-race-2");
        t1.start();
        t2.start();
        start.countDown();
        assertThat(done.await(30, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        assertThat(unexpected.get()).isNull();
        assertThat(successes.get()).isEqualTo(1);
        assertThat(duplicates.get()).isEqualTo(1);
        assertThat(countRows(serviceId, version)).isEqualTo(1);

        JsonNode loaded = store.find(serviceId, version).orElseThrow();
        assertThat(loaded.get("marker").asText()).startsWith("thread-");
        // Winner marker must remain the first persisted value — not merged/overwritten later.
        String marker = loaded.get("marker").asText();
        assertThat(jdbcTemplate.queryForObject(
                        """
                        SELECT definition->>'marker' FROM form_definition.form_definitions
                        WHERE service_id = ? AND version = ?
                        """,
                        String.class,
                        serviceId,
                        version))
                .isEqualTo(marker);
    }

    @Test
    void invalidFindArgumentsRejectedWithoutReturningCorruptData() {
        assertThatThrownBy(() -> store.find(null, 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("  padded  ", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("ok", 0))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("ok", -3))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("a".repeat(257), 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    private void insertCorrupt(String serviceId, int version, String status, String definitionJson) {
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

    @Test
    void callerMutationAfterSaveDoesNotAffectPersistedData() {
        ObjectNode doc = representativeDraft("mutate-after-save", 1);
        store.create(doc);
        doc.put("serviceId", "MUTATED-CALLER");
        doc.put("status", "published");

        JsonNode loaded = store.find("mutate-after-save", 1).orElseThrow();
        assertThat(loaded.get("serviceId").asText()).isEqualTo("mutate-after-save");
        assertThat(loaded.get("status").asText()).isEqualTo("draft");
    }

    @Test
    void returnedJsonNodeMutationDoesNotAffectPersistedValue() {
        ObjectNode doc = representativeDraft("mutate-returned", 1);
        JsonNode returned = store.create(doc).definition();
        ((ObjectNode) returned).put("serviceId", "MUTATED-RETURN");

        JsonNode loaded = store.find("mutate-returned", 1).orElseThrow();
        assertThat(loaded.get("serviceId").asText()).isEqualTo("mutate-returned");
        assertThat(returned.get("serviceId").asText()).isEqualTo("MUTATED-RETURN");
    }

    private void assertRejectedVersion(Object versionValue) {
        ObjectNode doc = representativeDraft("bad-version-" + versionValue, 1);
        if (versionValue instanceof Double d) {
            doc.put("version", d);
        } else if (versionValue instanceof Integer i) {
            doc.put("version", i);
        } else if (versionValue instanceof String s) {
            doc.put("version", s);
        } else {
            throw new IllegalArgumentException("unsupported test value");
        }
        assertThatThrownBy(() -> store.create(doc)).isInstanceOf(FormDefinitionAdmissionException.class);
    }

    private long countRows(String serviceId, int version) {
        Long count =
                jdbcTemplate.queryForObject(
                        """
                        SELECT COUNT(*) FROM form_definition.form_definitions
                        WHERE service_id = ? AND version = ?
                        """,
                        Long.class,
                        serviceId,
                        version);
        return count == null ? 0L : count;
    }

    private long countAllRows() {
        Long count =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM form_definition.form_definitions", Long.class);
        return count == null ? 0L : count;
    }

    /**
     * Illustrative draft only — not an authoritative catalogue / DST form.
     */
    private ObjectNode representativeDraft(String serviceId, int version) {
        try {
            ObjectNode root = objectMapper.createObjectNode();
            root.put("serviceId", serviceId);
            root.put("version", version);
            root.put("status", "draft");
            root.putObject("jsonSchema")
                    .put("$schema", "https://json-schema.org/draft/2020-12/schema")
                    .put("type", "object");
            root.putObject("uiSchema");
            ObjectNode meta = root.putObject("meta");
            meta.putArray("paletteProvenance");
            ObjectNode bilingual = meta.putObject("bilingual");
            bilingual.putObject("labels")
                    .putObject("applicant_name")
                    .put("en", "Applicant name")
                    .put("gu", "અરજદારનું નામ");
            bilingual.putObject("help");
            bilingual.putObject("errors");
            meta.putArray("prefillBindings");
            meta.putArray("integrationBindings");
            meta.putArray("workflowBindings");
            meta.putArray("progressiveSteps");
            root.putObject("audit")
                    .put("createdBy", "form-definition-service.c0@example.gov.in")
                    .put("createdAt", "2026-07-24T00:00:00.000Z");
            return root;
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
