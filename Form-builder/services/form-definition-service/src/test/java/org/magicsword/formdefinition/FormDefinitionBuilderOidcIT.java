package org.magicsword.formdefinition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.FormDefinitionStore;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
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
 * FB-E5.4.2A / E5.4.2B synthetic JWT MockMvc IT for Builder capability enforcement under {@code
 * governance-oidc}. Uses in-test RSA {@link JwtDecoder} — never calls live JWKS/discovery.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
            "form-definition.security.oidc.issuer-uri=https://fds-test-issuer.example/realms/egov",
            "form-definition.security.oidc.audience=form-definition-service",
            "form-definition.security.oidc.clock-skew-seconds=60",
            "form-definition.security.oidc.discovery-enabled=false"
        })
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("governance-oidc")
@Import(FormDefinitionBuilderOidcIT.OidcTestSecurityConfig.class)
class FormDefinitionBuilderOidcIT {

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
            NimbusJwtDecoder decoder =
                    NimbusJwtDecoder.withPublicKey(JWT.publicKey())
                            .signatureAlgorithm(SignatureAlgorithm.RS256)
                            .build();
            decoder.setJwtValidator(
                    FormDefinitionJwtValidators.create(ISSUER, AUDIENCE, Duration.ofSeconds(60)));
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
    }

    private static final String ROOT = "/api/v1/form-definitions";
    private static final String VALIDATION = ROOT + "/validation";
    private static final String VERSIONS = ROOT + "/versions";
    private static final String CLONE = ROOT + "/drafts/from-version";
    private static final String TECH_LIFECYCLE = ROOT + "/lifecycle-transitions";
    private static final String BUILDER_CLONE = ROOT + "/builder/drafts/from-version";
    private static final String BUILDER_SUBMIT = ROOT + "/builder/lifecycle-transitions";
    private static final String GOV_QUEUE = ROOT + "/governance/queue";
    private static final String PUBLISHED = ROOT + "/published/latest";

    @Autowired private MockMvc mockMvc;
    @Autowired private FormDefinitionStore store;
    @Autowired private JdbcTemplate jdbcTemplate;

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

    /** Seeds a published source for authenticated clone (in-process; bypasses HTTP denyAll). */
    private FormDefinitionSnapshot seedPublished(String serviceId, int version) throws IOException {
        ObjectNode doc = validDraft(serviceId, version);
        doc.put("status", FormDefinitionStatus.published.name());
        ObjectNode audit = (ObjectNode) doc.get("audit");
        audit.put("submittedBy", "seed-submitter");
        audit.put("approvedBy", "seed-approver");
        audit.put("publishedAt", FIXED_INSTANT.toString());
        return store.create(doc);
    }

    private MockHttpServletRequestBuilder bearer(
            MockHttpServletRequestBuilder request, String token) {
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private String token(String sub, String... roles) {
        return JWT.token(sub, roles);
    }

    private void assertNoIdentityLeak(MvcResult result) throws Exception {
        String text = result.getResponse().getContentAsString();
        assertThat(text).doesNotContain("Bearer ");
        assertThat(text).doesNotContain("eyJ");
        assertThat(text).doesNotContain("realm_access");
        assertThat(text).doesNotContain("FDS_");
        assertThat(text).doesNotContain("VALIDATE_FORM_DEFINITION");
        assertThat(text).doesNotContain("CREATE_FORM_DEFINITION_DRAFT");
        assertThat(text).doesNotContain("READ_FORM_DEFINITION");
        assertThat(text).doesNotContain("\"capabilities\"");
        JsonNode body = mapper.readTree(result.getResponse().getContentAsByteArray());
        assertThat(body.has("actorId")).isFalse();
        assertThat(body.has("sub")).isFalse();
        assertThat(body.has("roles")).isFalse();
        assertThat(body.has("capabilities")).isFalse();
    }

    private void expectBuilder401(MvcResult result) throws Exception {
        assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        assertThat(mapper.readTree(result.getResponse().getContentAsByteArray()).path("code").asText())
                .isEqualTo("builder_unauthenticated");
        assertNoIdentityLeak(result);
    }

    private void expectBuilder403(MvcResult result) throws Exception {
        assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        assertThat(mapper.readTree(result.getResponse().getContentAsByteArray()).path("code").asText())
                .isEqualTo("builder_forbidden");
        assertNoIdentityLeak(result);
    }

    @Test
    void validatorCanValidateButCannotCreateReadUpdateOrList() throws Exception {
        String token =
                token("validator-1", KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR);
        ObjectNode doc = validDraft("b-val-only", 1);

        mockMvc.perform(
                        bearer(
                                post(VALIDATION)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(doc)),
                                token))
                .andExpect(status().isOk());

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(ROOT)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(doc)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        get(ROOT)
                                                .param("serviceId", "b-val-only")
                                                .param("version", "1"),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        put(ROOT)
                                                .param("serviceId", "b-val-only")
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, "\"1\"")
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(doc)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());

        expectBuilder403(
                mockMvc.perform(
                                bearer(get(VERSIONS).param("serviceId", "b-val-only").param("limit", "10"), token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void creatorCanCreateOnly() throws Exception {
        String token = token("creator-1", KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CREATOR);
        ObjectNode doc = validDraft("b-create-only", 1);

        mockMvc.perform(
                        bearer(
                                post(ROOT)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(doc)),
                                token))
                .andExpect(status().isCreated())
                .andExpect(header().exists(HttpHeaders.ETAG));

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(VALIDATION)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(doc)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void readerCanExactReadOnly() throws Exception {
        FormDefinitionSnapshot created = store.create(validDraft("b-read-only", 1));
        String token = token("reader-1", KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_READER);

        mockMvc.perform(
                        bearer(
                                get(ROOT).param("serviceId", "b-read-only").param("version", "1"),
                                token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, FormDefinitionETag.format(created.revision())));

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(ROOT)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(
                                                        mapper.writeValueAsBytes(
                                                                validDraft("b-read-only-2", 1))),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void editorCanReplaceOnlyWithIfMatch() throws Exception {
        FormDefinitionSnapshot created = store.create(validDraft("b-edit-only", 1));
        String etag = FormDefinitionETag.format(created.revision());
        ObjectNode doc = validDraft("b-edit-only", 1);
        String token = token("editor-1", KeycloakRealmAccessRoleMapper.ROLE_DRAFT_EDITOR);

        mockMvc.perform(
                        bearer(
                                put(ROOT)
                                        .param("serviceId", "b-edit-only")
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(doc)),
                                token))
                .andExpect(status().isOk())
                .andExpect(header().exists(HttpHeaders.ETAG));

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        get(ROOT)
                                                .param("serviceId", "b-edit-only")
                                                .param("version", "1"),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void versionReaderCanListOnly() throws Exception {
        store.create(validDraft("b-ver-only", 1));
        String token = token("vreader-1", KeycloakRealmAccessRoleMapper.ROLE_VERSION_READER);

        mockMvc.perform(
                        bearer(
                                get(VERSIONS).param("serviceId", "b-ver-only").param("limit", "10"),
                                token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serviceId").value("b-ver-only"));

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        get(ROOT)
                                                .param("serviceId", "b-ver-only")
                                                .param("version", "1"),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void governanceRolesCannotAccessBuilderEndpoints() throws Exception {
        String token =
                token(
                        "gov-officer",
                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                        KeycloakRealmAccessRoleMapper.ROLE_APPROVER,
                        KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER);
        ObjectNode doc = validDraft("b-gov-blocked", 1);

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(VALIDATION)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(doc)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());

        // Governance queue still works with governance roles
        mockMvc.perform(bearer(get(GOV_QUEUE), token)).andExpect(status().isOk());
    }

    @Test
    void builderRolesCannotGainGovernanceCapability() throws Exception {
        String token =
                token(
                        "builder-only",
                        KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR,
                        KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CREATOR,
                        KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_READER);
        MvcResult result =
                mockMvc.perform(bearer(get(GOV_QUEUE), token))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("governance_forbidden"))
                        .andReturn();
        assertNoIdentityLeak(result);
    }

    @Test
    void combinedBuilderRolesWorkForUnionOnly() throws Exception {
        String token =
                token(
                        "combo-1",
                        KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CREATOR,
                        KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_READER);
        ObjectNode doc = validDraft("b-combo", 1);

        mockMvc.perform(
                        bearer(
                                post(ROOT)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(doc)),
                                token))
                .andExpect(status().isCreated());

        mockMvc.perform(
                        bearer(get(ROOT).param("serviceId", "b-combo").param("version", "1"), token))
                .andExpect(status().isOk());

        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(VALIDATION)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(doc)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void missingTokenReturns401BeforeBodyAdmission() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(ROOT)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{not-json"))
                        .andExpect(status().isUnauthorized())
                        .andReturn();
        expectBuilder401(result);
    }

    @Test
    void invalidJwtReturns401() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(VALIDATION)
                                        .header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(validDraft("b-bad", 1))))
                        .andExpect(status().isUnauthorized())
                        .andReturn();
        expectBuilder401(result);
    }

    @Test
    void validJwtWithoutCapabilityReturns403() throws Exception {
        String token = token("nocap", "IT_ADMIN");
        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(VALIDATION)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(
                                                        mapper.writeValueAsBytes(
                                                                validDraft("b-nocap", 1))),
                                        token))
                        .andExpect(status().isForbidden())
                        .andReturn();
        expectBuilder403(result);
    }

    @Test
    void wrongIssuerAudienceSignatureExpiryRemain401() throws Exception {
        ObjectNode doc = validDraft("b-jwt-reject", 1);
        byte[] body = mapper.writeValueAsBytes(doc);

        expectBuilder401(
                mockMvc.perform(
                                post(VALIDATION)
                                        .header(
                                                HttpHeaders.AUTHORIZATION,
                                                "Bearer "
                                                        + JWT.token(
                                                                "x",
                                                                Instant.now().plusSeconds(3600),
                                                                null,
                                                                "https://wrong-issuer.example",
                                                                AUDIENCE,
                                                                KeycloakRealmAccessRoleMapper
                                                                        .ROLE_DEFINITION_VALIDATOR))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                        .andExpect(status().isUnauthorized())
                        .andReturn());

        expectBuilder401(
                mockMvc.perform(
                                post(VALIDATION)
                                        .header(
                                                HttpHeaders.AUTHORIZATION,
                                                "Bearer "
                                                        + JWT.token(
                                                                "x",
                                                                Instant.now().plusSeconds(3600),
                                                                null,
                                                                ISSUER,
                                                                "wrong-audience",
                                                                KeycloakRealmAccessRoleMapper
                                                                        .ROLE_DEFINITION_VALIDATOR))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                        .andExpect(status().isUnauthorized())
                        .andReturn());

        expectBuilder401(
                mockMvc.perform(
                                post(VALIDATION)
                                        .header(
                                                HttpHeaders.AUTHORIZATION,
                                                "Bearer "
                                                        + JWT.tokenSignedWithWrongKey(
                                                                "x",
                                                                KeycloakRealmAccessRoleMapper
                                                                        .ROLE_DEFINITION_VALIDATOR))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                        .andExpect(status().isUnauthorized())
                        .andReturn());

        expectBuilder401(
                mockMvc.perform(
                                post(VALIDATION)
                                        .header(
                                                HttpHeaders.AUTHORIZATION,
                                                "Bearer "
                                                        + JWT.token(
                                                                "x",
                                                                Instant.now().minusSeconds(3600),
                                                                null,
                                                                ISSUER,
                                                                AUDIENCE,
                                                                KeycloakRealmAccessRoleMapper
                                                                        .ROLE_DEFINITION_VALIDATOR))
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                        .andExpect(status().isUnauthorized())
                        .andReturn());
    }

    @Test
    void publishedLatestRemainsAnonymous() throws Exception {
        mockMvc.perform(get(PUBLISHED).param("serviceId", "missing-pub"))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- FB-E5.4.2B authenticated /builder clone + submit

    @Test
    void clonerCanCloneFromPublishedWithSubAsCreatedBy() throws Exception {
        String sid = "b-clone-ok";
        FormDefinitionSnapshot source = seedPublished(sid, 1);
        String etag = FormDefinitionETag.format(source.revision());
        String sub = "builder-cloner-1";
        String token = token(sub, KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CLONER);

        mockMvc.perform(
                        bearer(
                                post(BUILDER_CLONE)
                                        .param("serviceId", sid)
                                        .param("sourceVersion", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{}"),
                                token))
                .andExpect(status().isCreated())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().exists(HttpHeaders.ETAG))
                .andExpect(header().exists(HttpHeaders.LOCATION))
                .andExpect(jsonPath("$.serviceId").value(sid))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.status").value("draft"))
                .andExpect(jsonPath("$.audit.createdBy").value(sub));
    }

    @Test
    void submitterCanSubmitDraftWithSubAsSubmittedByAndEventActor() throws Exception {
        String sid = "b-submit-ok";
        FormDefinitionSnapshot created = store.create(validDraft(sid, 1));
        String etag = FormDefinitionETag.format(created.revision());
        String sub = "builder-submitter-1";
        String token = token(sub, KeycloakRealmAccessRoleMapper.ROLE_FORM_SUBMITTER);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");

        mockMvc.perform(
                        bearer(
                                post(BUILDER_SUBMIT)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(body)),
                                token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.status").value("submitted"))
                .andExpect(jsonPath("$.audit.submittedBy").value(sub));

        List<Map<String, Object>> events =
                jdbcTemplate.queryForList(
                        """
                        SELECT to_status, actor_id FROM form_definition.form_definition_lifecycle_events
                        WHERE service_id = ? AND version = 1 AND to_status = 'submitted'
                        ORDER BY event_id
                        """,
                        sid);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).get("actor_id")).isEqualTo(sub);
    }

    @Test
    void builderCloneRejectsCreatedByAndExtraProperties() throws Exception {
        String sid = "b-clone-spoof";
        FormDefinitionSnapshot source = seedPublished(sid, 1);
        String etag = FormDefinitionETag.format(source.revision());
        String token = token("cloner", KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CLONER);

        ObjectNode withCreatedBy = mapper.createObjectNode();
        withCreatedBy.put("createdBy", "spoofed-creator");
        MvcResult spoof =
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_CLONE)
                                                .param("serviceId", sid)
                                                .param("sourceVersion", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(withCreatedBy)),
                                        token))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("invalid_transition_request"))
                        .andReturn();
        assertThat(spoof.getResponse().getContentAsString()).doesNotContain("spoofed-creator");
        assertNoIdentityLeak(spoof);

        ObjectNode withExtra = mapper.createObjectNode();
        withExtra.put("extra", "no");
        mockMvc.perform(
                        bearer(
                                post(BUILDER_CLONE)
                                        .param("serviceId", sid)
                                        .param("sourceVersion", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(withExtra)),
                                token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_transition_request"));
    }

    @Test
    void builderSubmitRejectsActorIdAndWrongTarget() throws Exception {
        String sid = "b-submit-spoof";
        FormDefinitionSnapshot created = store.create(validDraft(sid, 1));
        String etag = FormDefinitionETag.format(created.revision());
        String token = token("submitter", KeycloakRealmAccessRoleMapper.ROLE_FORM_SUBMITTER);

        ObjectNode withActor = mapper.createObjectNode();
        withActor.put("targetStatus", "submitted");
        withActor.put("actorId", "spoofed-actor");
        MvcResult spoof =
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_SUBMIT)
                                                .param("serviceId", sid)
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(withActor)),
                                        token))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("invalid_transition_request"))
                        .andReturn();
        assertThat(spoof.getResponse().getContentAsString()).doesNotContain("spoofed-actor");
        assertNoIdentityLeak(spoof);

        ObjectNode wrongTarget = mapper.createObjectNode();
        wrongTarget.put("targetStatus", "approved");
        mockMvc.perform(
                        bearer(
                                post(BUILDER_SUBMIT)
                                        .param("serviceId", sid)
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, etag)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(mapper.writeValueAsBytes(wrongTarget)),
                                token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_transition_request"));
    }

    @Test
    void builderCloneAndSubmitRequireMatchingCapability() throws Exception {
        String sid = "b-cap-matrix";
        FormDefinitionSnapshot published = seedPublished(sid, 1);
        FormDefinitionSnapshot draft = store.create(validDraft(sid + "-d", 1));
        String pubEtag = FormDefinitionETag.format(published.revision());
        String draftEtag = FormDefinitionETag.format(draft.revision());

        String validator =
                token("validator", KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR);
        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_CLONE)
                                                .param("serviceId", sid)
                                                .param("sourceVersion", "1")
                                                .header(HttpHeaders.IF_MATCH, pubEtag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content("{}"),
                                        validator))
                        .andExpect(status().isForbidden())
                        .andReturn());
        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_SUBMIT)
                                                .param("serviceId", sid + "-d")
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, draftEtag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content("{\"targetStatus\":\"submitted\"}"),
                                        validator))
                        .andExpect(status().isForbidden())
                        .andReturn());

        String clonerOnly = token("cloner-only", KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CLONER);
        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_SUBMIT)
                                                .param("serviceId", sid + "-d")
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, draftEtag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content("{\"targetStatus\":\"submitted\"}"),
                                        clonerOnly))
                        .andExpect(status().isForbidden())
                        .andReturn());

        String submitterOnly =
                token("submitter-only", KeycloakRealmAccessRoleMapper.ROLE_FORM_SUBMITTER);
        expectBuilder403(
                mockMvc.perform(
                                bearer(
                                        post(BUILDER_CLONE)
                                                .param("serviceId", sid)
                                                .param("sourceVersion", "1")
                                                .header(HttpHeaders.IF_MATCH, pubEtag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content("{}"),
                                        submitterOnly))
                        .andExpect(status().isForbidden())
                        .andReturn());
    }

    @Test
    void builderCloneAndSubmitUnauthenticatedReturn401BeforeIfMatch() throws Exception {
        expectBuilder401(
                mockMvc.perform(
                                post(BUILDER_CLONE)
                                        .param("serviceId", "b-unauth-clone")
                                        .param("sourceVersion", "1")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{}"))
                        .andExpect(status().isUnauthorized())
                        .andReturn());
        expectBuilder401(
                mockMvc.perform(
                                post(BUILDER_SUBMIT)
                                        .param("serviceId", "b-unauth-submit")
                                        .param("version", "1")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"targetStatus\":\"submitted\"}"))
                        .andExpect(status().isUnauthorized())
                        .andReturn());
    }

    @Test
    void technicalCloneDeniedEvenWithClonerRole() throws Exception {
        FormDefinitionSnapshot created = store.create(validDraft("b-clone-deny", 1));
        String etag = FormDefinitionETag.format(created.revision());
        String token = token("cloner", KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CLONER);
        ObjectNode body = mapper.createObjectNode();
        body.put("createdBy", "should-not-matter");

        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(CLONE)
                                                .param("serviceId", "b-clone-deny")
                                                .param("sourceVersion", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(body)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("forbidden"))
                        .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("should-not-matter");
        assertNoIdentityLeak(result);
    }

    @Test
    void technicalLifecycleDeniedEvenWithSubmitterRole() throws Exception {
        FormDefinitionSnapshot created = store.create(validDraft("b-submit-deny", 1));
        String etag = FormDefinitionETag.format(created.revision());
        String token = token("submitter", KeycloakRealmAccessRoleMapper.ROLE_FORM_SUBMITTER);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");
        body.put("actorId", "legacy-actor");

        MvcResult result =
                mockMvc.perform(
                                bearer(
                                        post(TECH_LIFECYCLE)
                                                .param("serviceId", "b-submit-deny")
                                                .param("version", "1")
                                                .header(HttpHeaders.IF_MATCH, etag)
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(mapper.writeValueAsBytes(body)),
                                        token))
                        .andExpect(status().isForbidden())
                        .andExpect(jsonPath("$.code").value("forbidden"))
                        .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("legacy-actor");
        assertNoIdentityLeak(result);
    }

    @Test
    void trailingSlashCreateCannotBypassAuthorization() throws Exception {
        mockMvc.perform(
                        post(ROOT + "/")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(mapper.writeValueAsBytes(validDraft("b-slash", 1))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("builder_unauthenticated"));
    }
}
