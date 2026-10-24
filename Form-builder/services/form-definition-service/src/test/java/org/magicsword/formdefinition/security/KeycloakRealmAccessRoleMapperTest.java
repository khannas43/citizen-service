package org.magicsword.formdefinition.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.governance.GovernanceCapability;
import org.springframework.security.oauth2.jwt.Jwt;

class KeycloakRealmAccessRoleMapperTest {

    @Test
    void mapsKnownRolesToCapabilities() {
        Jwt jwt =
                jwtWithRoles(
                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                        KeycloakRealmAccessRoleMapper.ROLE_APPROVER,
                        KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER);
        assertThat(KeycloakRealmAccessRoleMapper.mapCapabilities(jwt))
                .containsExactlyInAnyOrder(
                        GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE,
                        GovernanceCapability.APPROVE_FORM_DEFINITION,
                        GovernanceCapability.PUBLISH_FORM_DEFINITION);
    }

    @Test
    void duplicateRolesAreHarmless() {
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapRoleNames(
                                List.of(
                                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                                        KeycloakRealmAccessRoleMapper.ROLE_APPROVER)))
                .isEqualTo(
                        EnumSet.of(
                                GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE,
                                GovernanceCapability.APPROVE_FORM_DEFINITION));
    }

    @Test
    void unknownRolesIncludingOfficerUiRolesAreIgnored() {
        Jwt jwt =
                jwtWithRoles(
                        "IT_ADMIN",
                        "OFFICER_PORTAL_USER",
                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                        "something-else");
        assertThat(KeycloakRealmAccessRoleMapper.mapCapabilities(jwt))
                .containsExactly(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);
    }

    @Test
    void approveDoesNotImplyPublishAndPublishDoesNotImplyApprove() {
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapRoleNames(
                                List.of(KeycloakRealmAccessRoleMapper.ROLE_APPROVER)))
                .containsExactly(GovernanceCapability.APPROVE_FORM_DEFINITION)
                .doesNotContain(GovernanceCapability.PUBLISH_FORM_DEFINITION);

        assertThat(
                        KeycloakRealmAccessRoleMapper.mapRoleNames(
                                List.of(KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER)))
                .containsExactly(GovernanceCapability.PUBLISH_FORM_DEFINITION)
                .doesNotContain(GovernanceCapability.APPROVE_FORM_DEFINITION);
    }

    @Test
    void malformedRealmAccessYieldsEmptyCapabilities() {
        assertThat(KeycloakRealmAccessRoleMapper.mapCapabilities(null)).isEmpty();

        assertThat(KeycloakRealmAccessRoleMapper.mapCapabilities(jwtWithoutRealmAccess())).isEmpty();

        assertThat(
                        KeycloakRealmAccessRoleMapper.mapCapabilities(
                                jwtWithClaim("realm_access", "not-a-map")))
                .isEmpty();

        assertThat(
                        KeycloakRealmAccessRoleMapper.mapCapabilities(
                                jwtWithClaim("realm_access", Map.of("roles", "not-a-collection"))))
                .isEmpty();

        assertThat(
                        KeycloakRealmAccessRoleMapper.mapCapabilities(
                                jwtWithClaim(
                                        "realm_access",
                                        Map.of("roles", List.of(1, true, Map.of("x", "y"))))))
                .isEmpty();

        assertThat(
                        KeycloakRealmAccessRoleMapper.mapCapabilities(
                                jwtWithClaim("realm_access", Map.of())))
                .isEmpty();
    }

    @Test
    void nullRoleNamesListYieldsEmpty() {
        assertThat(KeycloakRealmAccessRoleMapper.mapRoleNames(null)).isEmpty();
    }

    @Test
    void mapsBuilderRolesIndependentlyOfGovernance() {
        Jwt jwt =
                jwtWithRoles(
                        KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR,
                        KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CREATOR,
                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                        "IT_ADMIN");
        assertThat(KeycloakRealmAccessRoleMapper.mapBuilderCapabilities(jwt))
                .containsExactlyInAnyOrder(
                        org.magicsword.formdefinition.builder.BuilderCapability
                                .VALIDATE_FORM_DEFINITION,
                        org.magicsword.formdefinition.builder.BuilderCapability
                                .CREATE_FORM_DEFINITION_DRAFT);
        assertThat(KeycloakRealmAccessRoleMapper.mapCapabilities(jwt))
                .containsExactly(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);
    }

    @Test
    void builderRolesDoNotImplyEachOther() {
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapBuilderRoleNames(
                                List.of(KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR)))
                .containsExactly(
                        org.magicsword.formdefinition.builder.BuilderCapability
                                .VALIDATE_FORM_DEFINITION);
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapBuilderRoleNames(
                                List.of(KeycloakRealmAccessRoleMapper.ROLE_DRAFT_EDITOR)))
                .doesNotContain(
                        org.magicsword.formdefinition.builder.BuilderCapability
                                .CREATE_FORM_DEFINITION_DRAFT,
                        org.magicsword.formdefinition.builder.BuilderCapability
                                .SUBMIT_FORM_DEFINITION);
    }

    @Test
    void governanceRolesGrantZeroBuilderCapabilities() {
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapBuilderRoleNames(
                                List.of(
                                        KeycloakRealmAccessRoleMapper.ROLE_READER,
                                        KeycloakRealmAccessRoleMapper.ROLE_APPROVER,
                                        KeycloakRealmAccessRoleMapper.ROLE_PUBLISHER)))
                .isEmpty();
    }

    @Test
    void builderRolesGrantZeroGovernanceCapabilities() {
        assertThat(
                        KeycloakRealmAccessRoleMapper.mapRoleNames(
                                List.of(
                                        KeycloakRealmAccessRoleMapper.ROLE_DEFINITION_VALIDATOR,
                                        KeycloakRealmAccessRoleMapper.ROLE_DRAFT_CREATOR,
                                        KeycloakRealmAccessRoleMapper.ROLE_FORM_SUBMITTER)))
                .isEmpty();
    }

    private static Jwt jwtWithRoles(String... roles) {
        return jwtWithClaim("realm_access", Map.of("roles", List.of(roles)));
    }

    private static Jwt jwtWithoutRealmAccess() {
        return Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .subject("officer")
                .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                .build();
    }

    private static Jwt jwtWithClaim(String name, Object value) {
        return Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .subject("officer")
                .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                .claim(name, value)
                .build();
    }
}
