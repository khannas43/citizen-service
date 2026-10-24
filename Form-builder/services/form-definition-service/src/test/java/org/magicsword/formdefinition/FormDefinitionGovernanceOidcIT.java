package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.FormDefinitionETag;
import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.FormDefinitionStore;
import org.magicsword.formdefinition.security.FormDefinitionJwtValidators;
import org.magicsword.formdefinition.security.KeycloakRealmAccessRoleMapper;
import org.magicsword.formdefinition.security.SyntheticJwtSupport;
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
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-E5.4.1 synthetic JWT MockMvc IT under profile {@code governance-oidc}. Uses an in-test RSA
 * {@link JwtDecoder} — never calls live JWKS/discovery.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
            // Available before EnvironmentPreparedEvent (DynamicPropertySource is too late for the
            // OIDC startup guard). Synthetic issuer only — never contacted.
            "form-definition.security.oidc.issuer-uri=https://fds-test-issuer.example/realms/egov",
            "form-definition.security.oidc.audience=form-definition-service",
            "form-definition.security.oidc.clock-skew-seconds=60",
            // Never contact live discovery/JWKS in automated tests.
            "form-definition.security.oidc.discovery-enabled=false"
        })
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("governance-oidc")
@Import(FormDefinitionGovernanceOidcIT.OidcTestSecurityConfig.class)
class FormDefinitionGovernanceOidcIT {

    static final Instant FIXED_INSTANT = Instant.parse("2026-07-28T12:00:00Z");
    static final String ISSUER = SyntheticJwtSupport.DEFAULT_ISSUER;
    static final String AUDIENCE = SyntheticJwtSupport.DEFAULT_AUDIENCE;

    static final SyntheticJwtSupport JWT = SyntheticJwtSupport.generate();

    @TestConfiguration
    static class OidcTestSecurityConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
        }

        @Bean
        @Primary
        JwtDecoder formDefinitionTestJwtDecoder() {
            // Boot 3.3 / Security 6.3: PublicKeyJwtDecoderBuilder.signatureAlgorithm (RS256).
            NimbusJwtDecoder decoder =
                    NimbusJwtDecoder.withPublicKey(JWT.publicKey())
                            .signatureAlgorithm(SignatureAlgorithm.RS256)
                            .build();
            decoder.setJwtValidator(
                    FormDefinitionJwtValidators.create(
                            ISSUER, AUDIENCE, Duration.ofSeconds(60)));
            return decoder;
        }
    }

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("egov_db")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("form-definition.security.oidc.issuer-uri", () -> ISSUER);
        registry.add("form-definition.security.oidc.audience", () -> AUDIENCE);
        registry.add("form-definition.security.oidc.clock-skew-seconds", () -> 60);
    }

    private static final String CREATE_PATH = "/api/v1/form-definitions";
    private static final String TECH_LIFECYCLE = "/api/v1/form-definitions/lifecycle-transitions";
    private static final String GOV_QUEUE = "/api/v1/form-definitions/governance/queue";
    private static final String GOV_DETAIL = "/api/v1/form-definitions/governance/detail";
    private static final String GOV_LIFECYCLE =
            "/api/v1/form-definitions/governance/lifecycle-transitions";
    private static final String PUBLISHED = "/api/v1/form-definitions/published/latest";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionStore store;

    @Autowired
    private FormDefinitionLifecycleService lifecycleService;

    private final ObjectMapper mapper = new ObjectMapper();

    // ---------------------------------------------------------------- fixtures / seeding

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

    /** In-process seed: create draft + technical submit (bypasses HTTP denyAll). */
    private String seedSubmitted(String serviceId) throws Exception {
        FormDefinitionSnapshot created = store.create(validDraft(serviceId, 1));
        String etag = FormDefinitionETag.format(created.revision());
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");
        body.put("actorId", "seed-submitter");
        FormDefinitionSnapshot submitted =
                lifecycleService.transition(serviceId, "1", etag, body);
        return FormDefinitionETag.format(submitted.revision());
    }

    private String seedApproved(String serviceId) throws Exception {
        String submittedEtag = seedSubmitted(serviceId);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        body.put("actorId", "seed-approver");
        FormDefinitionSnapshot approved =
                lifecycleService.transition(serviceId, "1", submittedEtag, body);
        return FormDefinitionETag.format(approved.revision());
    }

    private String seedPublished(String serviceId) throws Exception {
        String approvedEtag = seedApproved(serviceId);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "published");
        body.put("actorId", "seed-publisher");
        FormDefinitionSnapshot published =
                lifecycleService.transition(serviceId, "1", approvedEtag, body);
        return FormDefinitionETag.format(published.revision());
    }

    private MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, String token) {
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private String readerToken(String sub) {
        return JWT.token(sub, KeycloakRealmAccessRoleMapper.ROLE_READER);
    }

    private String approverToken(String sub) {
        return JWT.token(
                sub,
                KeycloakRealmAccessRoleMapper.ROLE_READER,
                KeycloakRealmAccessRoleMapper.ROLE_APPROVER);
    }

    private String publisherToken(String sub) {
        return JWT.token(
                sub,
                KeycloakRealmAccessRoleMapper.ROLE_READER,
                KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER);
    }

    private String fullToken(String sub) {
        return JWT.token(
                sub,
                KeycloakRealmAccessRoleMapper.ROLE_READER,
                KeycloakRealmAccessRoleMapper.ROLE_APPROVER,
                KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER);
    }

    private void assertNoIdentityLeak(MvcResult result) throws Exception {
        String text = result.getResponse().getContentAsString();
        assertThat(text).doesNotContain("Bearer ");
        assertThat(text).doesNotContain("eyJ");
        assertThat(text).doesNotContain("realm_access");
        assertThat(text).doesNotContain("FDS_GOVERNANCE_READER");
        assertThat(text).doesNotContain("FDS_FORM_APPROVER");
        assertThat(text).doesNotContain("FDS_FORM_PUBLISHER");
        assertThat(text).doesNotContain("FDS_DEFINITION_VALIDATOR");
        assertThat(text).doesNotContain("FDS_DRAFT_CREATOR");
        assertThat(text).doesNotContain("VALIDATE_FORM_DEFINITION");
        assertThat(text).doesNotContain("CREATE_FORM_DEFINITION_DRAFT");
        assertThat(text).doesNotContain("READ_FORM_DEFINITION_GOVERNANCE");
        assertThat(text).doesNotContain("APPROVE_FORM_DEFINITION");
        assertThat(text).doesNotContain("PUBLISH_FORM_DEFINITION");
        assertThat(text).doesNotContain("\"capabilities\"");
        JsonNode body = mapper.readTree(result.getResponse().getContentAsByteArray());
        assertThat(body.has("actorId")).isFalse();
        assertThat(body.has("sub")).isFalse();
        assertThat(body.has("subject")).isFalse();
        assertThat(body.has("roles")).isFalse();
        assertThat(body.has("capabilities")).isFalse();
    }

    // ---------------------------------------------------------------- capability matrix

    @Test
    void readerCanQueueAndDetailButCannotApproveOrPublish() throws Exception {
        String sid = "oidc-reader-1";
        String etag = seedSubmitted(sid);
        String token = readerToken("reader-officer");

        mockMvc.perform(bearer(get(GOV_QUEUE).param("limit", "20"), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        mockMvc.perform(
                        bearer(
                                get(GOV_DETAIL).param("serviceId", sid).param("version", "1"),
                                token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("submitted"))
                .andExpect(header().string(HttpHeaders.ETAG, etag));

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        MvcResult forbiddenApprove =
                mockMvc.perform(
                                bearer(
                                        post(GOV_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(approve)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("governance_forbidden"))
                        .andReturn();
        assertNoIdentityLeak(forbiddenApprove);

        ObjectNode publish = mapper.createObjectNode();
        publish.put("targetStatus", "published");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(publish)),
                                token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("governance_forbidden"));
    }

    @Test
    void approverCanApproveButCannotPublish() throws Exception {
        String sid = "oidc-approver-1";
        String etag = seedSubmitted(sid);
        String token = approverToken("approver-officer");

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        MvcResult approved =
                mockMvc.perform(
                                bearer(
                                        post(GOV_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(approve)),
                                        token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.status").value("approved"))
                        .andExpect(jsonPath("$.audit.approvedBy").value("approver-officer"))
                        .andReturn();
        String approvedEtag = approved.getResponse().getHeader(HttpHeaders.ETAG);

        ObjectNode publish = mapper.createObjectNode();
        publish.put("targetStatus", "published");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, approvedEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(publish)),
                                token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("governance_forbidden"));
    }

    @Test
    void publisherCanPublishButCannotApprove() throws Exception {
        String sid = "oidc-publisher-1";
        String submittedEtag = seedSubmitted(sid);
        String publisher = publisherToken("publisher-officer");

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, submittedEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(approve)),
                                publisher))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("governance_forbidden"));

        String approvedEtag = seedApproved("oidc-publisher-2");
        String sid2 = "oidc-publisher-2";
        ObjectNode publish = mapper.createObjectNode();
        publish.put("targetStatus", "published");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid2)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, approvedEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(publish)),
                                publisher))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("published"));

        String actor =
                jdbcTemplate.queryForObject(
                        """
                        SELECT actor_id FROM form_definition.form_definition_lifecycle_events
                        WHERE service_id = ? AND version = 1 AND to_status = 'published'
                        """,
                        String.class,
                        sid2);
        assertThat(actor).isEqualTo("publisher-officer");
    }

    @Test
    void combinedRolesCanApproveAndPublishAndAuditActorEqualsJwtSub() throws Exception {
        String sid = "oidc-combined-1";
        String etag = seedSubmitted(sid);
        String sub = "combined-officer";
        String token = fullToken(sub);

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        MvcResult approved =
                mockMvc.perform(
                                bearer(
                                        post(GOV_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(approve)),
                                        token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.audit.approvedBy").value(sub))
                        .andReturn();
        String approvedEtag = approved.getResponse().getHeader(HttpHeaders.ETAG);

        ObjectNode publish = mapper.createObjectNode();
        publish.put("targetStatus", "published");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, approvedEtag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(publish)),
                                token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("published"));

        List<Map<String, Object>> events =
                jdbcTemplate.queryForList(
                        """
                        SELECT to_status, actor_id FROM form_definition.form_definition_lifecycle_events
                        WHERE service_id = ? AND version = 1 AND to_status IN ('approved', 'published')
                        ORDER BY event_id
                        """,
                        sid);
        assertThat(events).hasSize(2);
        assertThat(events.get(0).get("actor_id")).isEqualTo(sub);
        assertThat(events.get(1).get("actor_id")).isEqualTo(sub);
    }

    @Test
    void bodyActorIdRejectedOnGovernanceLifecycle() throws Exception {
        String sid = "oidc-body-actor";
        String etag = seedSubmitted(sid);
        String token = fullToken("gov-actor");

        ObjectNode withActor = mapper.createObjectNode();
        withActor.put("targetStatus", "approved");
        withActor.put("actorId", "spoofed-actor");
        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(GOV_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(withActor)),
                                        token))
                        .andExpect(status().isBadRequest())
                        .andExpect(
                                jsonPath("$.code").value("invalid_governance_transition_request"))
                        .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("spoofed-actor");
        assertNoIdentityLeak(result);
    }

    // ---------------------------------------------------------------- JWT negatives → 401

    @Test
    void missingMalformedWrongSigHs256WrongIssuerAudExpiredNbfBlankAndPaddedSubReturn401()
            throws Exception {
        String sid = "oidc-jwt-neg";
        seedSubmitted(sid);

        MvcResult missing =
                mockMvc.perform(get(GOV_QUEUE))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                        .andReturn();
        assertNoIdentityLeak(missing);

        mockMvc.perform(
                        bearer(get(GOV_QUEUE), SyntheticJwtSupport.malformedCompact()))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.tokenSignedWithWrongKey(
                                        "x", KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.hs256Token("x", KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        "x",
                                        Instant.now().plusSeconds(3600),
                                        null,
                                        "https://wrong-issuer.example/realms/egov",
                                        AUDIENCE,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        "x",
                                        Instant.now().plusSeconds(3600),
                                        null,
                                        ISSUER,
                                        "wrong-audience",
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        "x",
                                        Instant.now().minusSeconds(3600),
                                        null,
                                        ISSUER,
                                        AUDIENCE,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        "x",
                                        Instant.now().plusSeconds(3600),
                                        Instant.now().plusSeconds(3600),
                                        ISSUER,
                                        AUDIENCE,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        " ",
                                        Instant.now().plusSeconds(3600),
                                        null,
                                        ISSUER,
                                        AUDIENCE,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        bearer(
                                get(GOV_QUEUE),
                                JWT.token(
                                        " padded-sub ",
                                        Instant.now().plusSeconds(3600),
                                        null,
                                        ISSUER,
                                        AUDIENCE,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void malformedRolesAuthenticateButCapabilityChecksReturn403() throws Exception {
        String sid = "oidc-malformed-roles";
        String etag = seedSubmitted(sid);
        String token = JWT.tokenWithRealmAccess("authed-no-caps", "not-a-map");

        mockMvc.perform(bearer(get(GOV_QUEUE), token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("governance_forbidden"));

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(GOV_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(approve)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("governance_forbidden"))
                        .andReturn();
        assertNoIdentityLeak(result);
    }

    // ---------------------------------------------------------------- ETag / auth order / anonymous / denyAll

    @Test
    void etagIfMatchStillWorksUnderOidc() throws Exception {
        String sid = "oidc-etag-1";
        String etag = seedSubmitted(sid);
        String token = fullToken("etag-officer");

        ObjectNode approve = mapper.createObjectNode();
        approve.put("targetStatus", "approved");
        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, FormDefinitionETag.format(0L))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(approve)),
                                token))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.code").value("stale_revision"));

        mockMvc.perform(
                        bearer(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(approve)),
                                token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"))
                .andExpect(header().exists(HttpHeaders.ETAG));
    }

    @Test
    void authBeforeIfMatchUnauthenticatedWithBadIfMatchStill401() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", "any")
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, "W/\"bad\"")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"targetStatus\":\"approved\"}"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                        .andReturn();
        assertNoIdentityLeak(result);
    }

    @Test
    void anonymousGetPublishedLatestWorks() throws Exception {
        String sid = "oidc-anon-pub";
        seedPublished(sid);

        mockMvc.perform(get(PUBLISHED).param("serviceId", sid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("published"))
                .andExpect(jsonPath("$.serviceId").value(sid));
    }

    @Test
    void postTechnicalLifecycleTransitionsIsDenyAll() throws Exception {
        String sid = "oidc-tech-deny";
        FormDefinitionSnapshot created = store.create(validDraft(sid, 1));
        String etag = FormDefinitionETag.format(created.revision());

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");
        body.put("actorId", "legacy-tech-actor");

        // Even with a valid governance JWT, the technical body-actorId path stays denyAll → 403.
        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(TECH_LIFECYCLE)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(body)),
                                        readerToken("officer-deny")))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("forbidden"))
                        .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("legacy-tech-actor");
        assertNoIdentityLeak(result);

        // Still works in-process for seeding (HTTP path is denyAll only)
        FormDefinitionSnapshot submitted =
                lifecycleService.transition(sid, "1", etag, body);
        assertThat(submitted.status().name()).isEqualTo("submitted");
    }

    @Test
    void createDraftRequiresAuthenticationUnderOidc() throws Exception {
        ObjectNode doc = validDraft("oidc-create-auth", 1);
        MvcResult result =
                mockMvc.perform(
                                post(CREATE_PATH)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(doc)))
                        .andExpect(status().isUnauthorized())
                        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                        .andExpect(jsonPath("$.code").value("builder_unauthenticated"))
                        .andReturn();
        assertNoIdentityLeak(result);
    }
}
