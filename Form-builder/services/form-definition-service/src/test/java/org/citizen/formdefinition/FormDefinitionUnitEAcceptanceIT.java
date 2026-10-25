package org.citizen.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionETag;
import org.citizen.formdefinition.governance.GovernanceCapability;
import org.citizen.formdefinition.governance.GovernancePrincipal;
import org.citizen.formdefinition.governance.GovernancePrincipalProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
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
 * FB-E4 package-level technical end-to-end acceptance for Form Definition Service.
 *
 * <p><strong>Illustrative / non-authoritative only.</strong> Uses the frozen Unit E representative
 * fixture (derived from Unit D authoring). Does not claim production IAM, DST queue integration,
 * deployment, or §5 live-service acceptance. Profile {@code governance-technical} remains
 * non-production; this suite injects a test principal bean rather than enabling that profile.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
@Import(FormDefinitionUnitEAcceptanceIT.GovernanceTestPrincipalConfig.class)
class FormDefinitionUnitEAcceptanceIT {

    static final Instant FIXED_INSTANT = Instant.parse("2026-07-27T12:00:00Z");

    static final ThreadLocal<GovernancePrincipal> CURRENT = new ThreadLocal<>();

    /** Canonical SHA-256 of acceptance/unit-e/unit-e-representative-definition.json (LF newline). */
    static final String UNIT_E_FIXTURE_SHA256 =
            "8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e";

    static final String SERVICE_ID = "unit-e-technical-acceptance";
    static final int VERSION = 1;
    static final String TECH_ACTOR = "unit-e-technical-submitter";
    static final String GOV_ACTOR = "unit-e-governance-officer";

    @TestConfiguration
    static class GovernanceTestPrincipalConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
        }

        @Bean
        @Primary
        GovernancePrincipalProvider testGovernancePrincipalProvider() {
            return () -> Optional.ofNullable(CURRENT.get());
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

    private static final String BASE = "/api/v1/form-definitions";
    private static final String VALIDATION = BASE + "/validation";
    private static final String CREATE = BASE;
    private static final String EXACT = BASE;
    private static final String TECH_LIFECYCLE = BASE + "/lifecycle-transitions";
    private static final String GOV_QUEUE = BASE + "/governance/queue";
    private static final String GOV_DETAIL = BASE + "/governance/detail";
    private static final String GOV_LIFECYCLE = BASE + "/governance/lifecycle-transitions";
    private static final String PUBLISHED = BASE + "/published/latest";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper mapper = new ObjectMapper();

    @FunctionalInterface
    interface ThrowingRunnable {
        void run() throws Exception;
    }

    private void withPrincipal(GovernancePrincipal principal, ThrowingRunnable action) throws Exception {
        CURRENT.set(principal);
        try {
            action.run();
        } finally {
            CURRENT.remove();
        }
    }

    private GovernancePrincipal fullPrincipal(String actor) {
        return GovernancePrincipal.of(
                actor,
                EnumSet.of(
                        GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE,
                        GovernanceCapability.APPROVE_FORM_DEFINITION,
                        GovernanceCapability.PUBLISH_FORM_DEFINITION));
    }

    private GovernancePrincipal approveOnly(String actor) {
        return GovernancePrincipal.of(
                actor, EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
    }

    private GovernancePrincipal publishOnly(String actor) {
        return GovernancePrincipal.of(
                actor, EnumSet.of(GovernanceCapability.PUBLISH_FORM_DEFINITION));
    }

    private ObjectNode representativeDraft() throws IOException {
        try (InputStream in =
                getClass().getResourceAsStream("/acceptance/unit-e-representative-definition.json")) {
            if (in == null) {
                throw new IllegalStateException("Missing Unit E representative fixture");
            }
            byte[] bytes = in.readAllBytes();
            String sha =
                    HexFormat.of()
                            .formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            assertThat(sha).isEqualTo(UNIT_E_FIXTURE_SHA256);
            ObjectNode doc = (ObjectNode) mapper.readTree(bytes);
            assertThat(doc.path("serviceId").asText()).isEqualTo(SERVICE_ID);
            assertThat(doc.path("version").asInt()).isEqualTo(VERSION);
            assertThat(doc.path("status").asText()).isEqualTo("draft");
            assertThat(doc.path("meta").path("progressiveSteps").isArray()).isTrue();
            assertThat(doc.path("meta").path("progressiveSteps").size()).isGreaterThanOrEqualTo(1);
            assertThat(doc.path("meta").path("prefillBindings").size()).isGreaterThanOrEqualTo(1);
            assertThat(doc.path("meta").path("integrationBindings").size()).isGreaterThanOrEqualTo(1);
            assertThat(doc.path("meta").path("workflowBindings").size()).isGreaterThanOrEqualTo(1);
            String raw = new String(bytes, StandardCharsets.UTF_8);
            assertThat(raw).doesNotContain("Bearer ");
            assertThat(raw).doesNotContainIgnoringCase("base64");
            assertThat(raw).doesNotContain("\"ETag\"");
            assertThat(raw).doesNotContain("lockVersion");
            return doc;
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private String rawOf(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private List<Map<String, Object>> selectEventsOrdered(String serviceId, int version) {
        return jdbcTemplate.queryForList(
                """
                SELECT from_status, to_status, actor_id, occurred_at, resulting_revision
                FROM form_definition.form_definition_lifecycle_events
                WHERE service_id = ? AND version = ?
                ORDER BY resulting_revision ASC
                """,
                serviceId,
                version);
    }

    private void assertNoDstSurface() {
        Integer dstTables =
                jdbcTemplate.queryForObject(
                        """
                        SELECT COUNT(*) FROM information_schema.tables
                        WHERE table_schema = 'form_definition'
                          AND (
                            lower(table_name) LIKE '%dst%'
                            OR lower(table_name) LIKE '%outbox%'
                            OR lower(table_name) LIKE '%notification%'
                            OR lower(table_name) LIKE '%acknowledgement%'
                          )
                        """,
                        Integer.class);
        assertThat(dstTables).isZero();
    }

    @Test
    void packageTechnicalLifecycleSequenceAThroughO() throws Exception {
        ObjectNode draft = representativeDraft();

        // A. Validate representative draft → valid
        MvcResult validation =
                mockMvc.perform(
                                post(VALIDATION)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(draft)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.valid").value(true))
                        .andReturn();
        assertThat(bodyOf(validation).path("issues").isArray()).isTrue();

        // B. Create draft → 201 + strong ETag
        MvcResult created =
                mockMvc.perform(
                                post(CREATE)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(draft)))
                        .andExpect(status().isCreated())
                        .andExpect(header().exists(HttpHeaders.ETAG))
                        .andReturn();
        String createEtag = created.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(createEtag).matches("^\".+\"$");
        assertThat(FormDefinitionETag.parseIfMatch(createEtag)).isNotNegative();
        JsonNode createdBody = bodyOf(created);
        assertThat(createdBody.path("serviceId").asText()).isEqualTo(SERVICE_ID);
        assertThat(createdBody.path("version").asInt()).isEqualTo(VERSION);
        assertThat(createdBody.path("status").asText()).isEqualTo("draft");
        assertThat(rawOf(created)).doesNotContain("lockVersion");

        // C. Exact GET returns draft and same coordinates
        MvcResult exact =
                mockMvc.perform(
                                get(EXACT)
                                        .param("serviceId", SERVICE_ID)
                                        .param("version", String.valueOf(VERSION)))
                        .andExpect(status().isOk())
                        .andExpect(header().string(HttpHeaders.ETAG, createEtag))
                        .andReturn();
        JsonNode exactBody = bodyOf(exact);
        assertThat(exactBody.path("serviceId").asText()).isEqualTo(SERVICE_ID);
        assertThat(exactBody.path("version").asInt()).isEqualTo(VERSION);
        assertThat(exactBody.path("status").asText()).isEqualTo("draft");
        assertThat(exactBody.get("jsonSchema")).isEqualTo(draft.get("jsonSchema"));
        assertThat(exactBody.get("uiSchema")).isEqualTo(draft.get("uiSchema"));
        assertThat(exactBody.get("meta")).isEqualTo(draft.get("meta"));

        // D. Technical submit: draft → submitted
        ObjectNode submitBody = mapper.createObjectNode();
        submitBody.put("targetStatus", "submitted");
        submitBody.put("actorId", TECH_ACTOR);
        MvcResult submitted =
                mockMvc.perform(
                                post(TECH_LIFECYCLE)
                                        .param("serviceId", SERVICE_ID)
                                        .param("version", String.valueOf(VERSION))
                                        .header(HttpHeaders.IF_MATCH, createEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(submitBody)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.status").value("submitted"))
                        .andExpect(jsonPath("$.audit.submittedBy").value(TECH_ACTOR))
                        .andReturn();
        String submittedEtag = submitted.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(submittedEtag).isNotBlank().isNotEqualTo(createEtag);

        // E. Governance queue contains submitted metadata
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    MvcResult queue =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "100"))
                                    .andExpect(status().isOk())
                                    .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                                    .andReturn();
                    JsonNode items = bodyOf(queue).path("items");
                    boolean found = false;
                    for (JsonNode item : items) {
                        assertThat(item.size()).isEqualTo(3);
                        if (SERVICE_ID.equals(item.path("serviceId").asText())
                                && item.path("version").asInt() == VERSION) {
                            found = true;
                            assertThat(item.path("status").asText()).isEqualTo("submitted");
                        }
                    }
                    assertThat(found).isTrue();
                    assertThat(rawOf(queue)).doesNotContain(GOV_ACTOR);
                    assertThat(rawOf(queue)).doesNotContain("DST");
                });

        // F. Governance detail returns submitted definition + strong ETag + no-store
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    MvcResult detail =
                            mockMvc.perform(
                                            get(GOV_DETAIL)
                                                    .param("serviceId", SERVICE_ID)
                                                    .param("version", String.valueOf(VERSION)))
                                    .andExpect(status().isOk())
                                    .andExpect(header().string(HttpHeaders.ETAG, submittedEtag))
                                    .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                                    .andExpect(jsonPath("$.status").value("submitted"))
                                    .andExpect(jsonPath("$.serviceId").value(SERVICE_ID))
                                    .andExpect(jsonPath("$.version").value(VERSION))
                                    .andReturn();
                    assertThat(bodyOf(detail).get("jsonSchema")).isEqualTo(draft.get("jsonSchema"));
                    assertThat(rawOf(detail)).doesNotContain("lockVersion");
                });

        // G. Governance approve with exact { targetStatus: "approved" }
        AtomicEtag approvedEtagHolder = new AtomicEtag();
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    MvcResult approved =
                            mockMvc.perform(
                                            post(GOV_LIFECYCLE)
                                                    .param("serviceId", SERVICE_ID)
                                                    .param("version", String.valueOf(VERSION))
                                                    .header(HttpHeaders.IF_MATCH, submittedEtag)
                                                    .contentType(MediaType.APPLICATION_JSON)
                                                    .content(mapper.writeValueAsBytes(approve)))
                                    .andExpect(status().isOk())
                                    .andExpect(jsonPath("$.status").value("approved"))
                                    .andExpect(jsonPath("$.audit.approvedBy").value(GOV_ACTOR))
                                    .andReturn();
                    approvedEtagHolder.value = approved.getResponse().getHeader(HttpHeaders.ETAG);
                    assertThat(approvedEtagHolder.value).isNotBlank().isNotEqualTo(submittedEtag);
                    assertThat(rawOf(approved)).doesNotContain("spoofed");
                    assertThat(bodyOf(approved).path("audit").has("actorId")).isFalse();
                });

        // H. Old submitted ETag is stale after approval
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    ObjectNode retry = mapper.createObjectNode();
                    retry.put("targetStatus", "approved");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", SERVICE_ID)
                                            .param("version", String.valueOf(VERSION))
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(retry)))
                            .andExpect(status().isPreconditionFailed())
                            .andExpect(jsonPath("$.code").value("stale_revision"));
                });

        // I. Queue now shows approved status
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    MvcResult queue =
                            mockMvc.perform(get(GOV_QUEUE).param("limit", "100"))
                                    .andExpect(status().isOk())
                                    .andReturn();
                    boolean found = false;
                    for (JsonNode item : bodyOf(queue).path("items")) {
                        if (SERVICE_ID.equals(item.path("serviceId").asText())) {
                            found = true;
                            assertThat(item.path("status").asText()).isEqualTo("approved");
                        }
                    }
                    assertThat(found).isTrue();
                });

        // J. Governance publish with exact { targetStatus: "published" }
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    ObjectNode publish = mapper.createObjectNode();
                    publish.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", SERVICE_ID)
                                            .param("version", String.valueOf(VERSION))
                                            .header(HttpHeaders.IF_MATCH, approvedEtagHolder.value)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publish)))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.status").value("published"))
                            .andExpect(jsonPath("$.audit.publishedAt").value(FIXED_INSTANT.toString()));
                });

        // K + L. Published/latest returns exact version; no lockVersion/ETag/lifecycle internals
        MvcResult published =
                mockMvc.perform(get(PUBLISHED).param("serviceId", SERVICE_ID))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.serviceId").value(SERVICE_ID))
                        .andExpect(jsonPath("$.version").value(VERSION))
                        .andExpect(jsonPath("$.status").value("published"))
                        .andReturn();
        String publishedRaw = rawOf(published);
        assertThat(publishedRaw).doesNotContain("lockVersion");
        assertThat(publishedRaw).doesNotContain("\"ETag\"");
        assertThat(publishedRaw).doesNotContain("resulting_revision");
        assertThat(publishedRaw).doesNotContain("from_status");
        assertThat(publishedRaw).doesNotContain("to_status");
        assertThat(publishedRaw).doesNotContainIgnoringCase("lifecycle event");
        JsonNode publishedBody = bodyOf(published);
        assertThat(publishedBody.get("jsonSchema")).isEqualTo(draft.get("jsonSchema"));
        assertThat(publishedBody.get("uiSchema")).isEqualTo(draft.get("uiSchema"));
        assertThat(publishedBody.get("meta")).isEqualTo(draft.get("meta"));

        // M. Lifecycle event rows exactly draft→submitted, submitted→approved, approved→published
        List<Map<String, Object>> events = selectEventsOrdered(SERVICE_ID, VERSION);
        assertThat(events).hasSize(3);
        assertThat(events.get(0).get("from_status")).isEqualTo("draft");
        assertThat(events.get(0).get("to_status")).isEqualTo("submitted");
        assertThat(events.get(0).get("actor_id")).isEqualTo(TECH_ACTOR);
        assertThat(events.get(1).get("from_status")).isEqualTo("submitted");
        assertThat(events.get(1).get("to_status")).isEqualTo("approved");
        assertThat(events.get(1).get("actor_id")).isEqualTo(GOV_ACTOR);
        assertThat(events.get(2).get("from_status")).isEqualTo("approved");
        assertThat(events.get(2).get("to_status")).isEqualTo("published");
        assertThat(events.get(2).get("actor_id")).isEqualTo(GOV_ACTOR);

        // N. Definition audit has only the governed keys for published state
        List<String> auditKeys = new ArrayList<>();
        publishedBody.get("audit").fieldNames().forEachRemaining(auditKeys::add);
        assertThat(auditKeys)
                .containsExactlyInAnyOrder(
                        "createdBy", "createdAt", "submittedBy", "approvedBy", "publishedAt");
        assertThat(publishedBody.path("audit").path("submittedBy").asText()).isEqualTo(TECH_ACTOR);
        assertThat(publishedBody.path("audit").path("approvedBy").asText()).isEqualTo(GOV_ACTOR);
        assertThat(publishedBody.path("audit").has("publishedBy")).isFalse();

        // O. No DST adapter / outbox / notification / invented acknowledgement
        assertNoDstSurface();
        assertThat(auditKeys).noneMatch(k -> k.toLowerCase().contains("dst"));
        assertThat(auditKeys).noneMatch(k -> k.toLowerCase().contains("outbox"));
        assertThat(auditKeys).noneMatch(k -> k.toLowerCase().contains("ack"));
    }

    @Test
    void governanceNegativesCapabilityActorUnauthStaleAndNonProductionProfile() throws Exception {
        ObjectNode draft = representativeDraft();
        // Isolate service id so this test does not collide with the happy-path row.
        draft.put("serviceId", "unit-e-technical-acceptance-neg");
        String sid = draft.path("serviceId").asText();

        MvcResult created =
                mockMvc.perform(
                                post(CREATE)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(draft)))
                        .andExpect(status().isCreated())
                        .andReturn();
        String etag = created.getResponse().getHeader(HttpHeaders.ETAG);

        ObjectNode submitBody = mapper.createObjectNode();
        submitBody.put("targetStatus", "submitted");
        submitBody.put("actorId", TECH_ACTOR);
        MvcResult submitted =
                mockMvc.perform(
                                post(TECH_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(submitBody)))
                        .andExpect(status().isOk())
                        .andReturn();
        String submittedEtag = submitted.getResponse().getHeader(HttpHeaders.ETAG);

        // governance request body actorId is rejected
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    ObjectNode withActor = mapper.createObjectNode();
                    withActor.put("targetStatus", "approved");
                    withActor.put("actorId", "spoofed-actor");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(withActor)))
                            .andExpect(status().isBadRequest())
                            .andExpect(
                                    jsonPath("$.code")
                                            .value("invalid_governance_transition_request"));
                });

        // approve capability alone cannot publish
        withPrincipal(
                approveOnly("approver-only"),
                () -> {
                    ObjectNode publish = mapper.createObjectNode();
                    publish.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publish)))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("governance_forbidden"));
                });

        // publish capability alone cannot approve
        withPrincipal(
                publishOnly("publisher-only"),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(approve)))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("governance_forbidden"));
                });

        // unauthenticated governance access returns 401 before body/If-Match validation
        CURRENT.remove();
        mockMvc.perform(
                        post(GOV_LIFECYCLE)
                                .param("serviceId", sid)
                                .param("version", "1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"targetStatus\":\"approved\",\"actorId\":\"spoofed\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("governance_unauthenticated"));

        // actor comes from the governance principal (approve succeeds with principal actor)
        withPrincipal(
                fullPrincipal(GOV_ACTOR),
                () -> {
                    ObjectNode approve = mapper.createObjectNode();
                    approve.put("targetStatus", "approved");
                    MvcResult approved =
                            mockMvc.perform(
                                            post(GOV_LIFECYCLE)
                                                    .param("serviceId", sid)
                                                    .param("version", "1")
                                                    .header(HttpHeaders.IF_MATCH, submittedEtag)
                                                    .contentType(MediaType.APPLICATION_JSON)
                                                    .content(mapper.writeValueAsBytes(approve)))
                                    .andExpect(status().isOk())
                                    .andExpect(jsonPath("$.audit.approvedBy").value(GOV_ACTOR))
                                    .andReturn();
                    String approvedEtag = approved.getResponse().getHeader(HttpHeaders.ETAG);

                    // stale If-Match returns 412 without mutation
                    ObjectNode publish = mapper.createObjectNode();
                    publish.put("targetStatus", "published");
                    mockMvc.perform(
                                    post(GOV_LIFECYCLE)
                                            .param("serviceId", sid)
                                            .param("version", "1")
                                            .header(HttpHeaders.IF_MATCH, submittedEtag)
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content(mapper.writeValueAsBytes(publish)))
                            .andExpect(status().isPreconditionFailed())
                            .andExpect(jsonPath("$.code").value("stale_revision"));

                    MvcResult detail =
                            mockMvc.perform(
                                            get(GOV_DETAIL)
                                                    .param("serviceId", sid)
                                                    .param("version", "1"))
                                    .andExpect(status().isOk())
                                    .andExpect(jsonPath("$.status").value("approved"))
                                    .andReturn();
                    assertThat(detail.getResponse().getHeader(HttpHeaders.ETAG)).isEqualTo(approvedEtag);
                });

        // default profile remains fail-closed when principal absent
        CURRENT.remove();
        mockMvc.perform(get(GOV_QUEUE))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("governance_unauthenticated"));

        // governance-technical remains explicitly non-production (documented profile resource)
        try (InputStream yml =
                getClass()
                        .getClassLoader()
                        .getResourceAsStream("application-governance-technical.yml")) {
            assertThat(yml).isNotNull();
            String text = new String(yml.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(text.toUpperCase()).contains("NON-PRODUCTION");
            assertThat(text).contains("PROHIBITED in production");
        }

        assertNoDstSurface();
    }

    private static final class AtomicEtag {
        String value;
    }
}
