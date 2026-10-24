package org.magicsword.formdefinition.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.governance.GovernanceCapability;
import org.magicsword.formdefinition.governance.GovernancePrincipal;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class OidcGovernancePrincipalProviderTest {

    private final OidcGovernancePrincipalProvider provider = new OidcGovernancePrincipalProvider();

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void mapsJwtSubAndRealmRoles() {
        Jwt jwt =
                Jwt.withTokenValue("t")
                        .header("alg", "RS256")
                        .subject("officer-sub-1")
                        .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                        .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                        .claim(
                                "realm_access",
                                Map.of(
                                        "roles",
                                        List.of(
                                                KeycloakRealmAccessRoleMapper.ROLE_READER,
                                                KeycloakRealmAccessRoleMapper.ROLE_APPROVER)))
                        .build();
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        Optional<GovernancePrincipal> principal = provider.currentPrincipal();
        assertThat(principal).isPresent();
        assertThat(principal.get().actorId()).isEqualTo("officer-sub-1");
        assertThat(principal.get().has(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE)).isTrue();
        assertThat(principal.get().has(GovernanceCapability.APPROVE_FORM_DEFINITION)).isTrue();
        assertThat(principal.get().has(GovernanceCapability.PUBLISH_FORM_DEFINITION)).isFalse();
    }

    @Test
    void emptyWithoutJwtAuthentication() {
        assertThat(provider.currentPrincipal()).isEmpty();

        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("u", "p"));
        assertThat(provider.currentPrincipal()).isEmpty();

        // Jwt-only constructor stays unauthenticated in Spring Security 6.3
        Jwt jwt =
                Jwt.withTokenValue("t")
                        .header("alg", "RS256")
                        .subject("officer")
                        .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                        .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                        .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        assertThat(provider.currentPrincipal()).isEmpty();
    }

    @Test
    void blankOrPaddedSubYieldsEmpty() {
        SecurityContextHolder.getContext()
                .setAuthentication(authenticated(jwtWithSubject(" ")));
        assertThat(provider.currentPrincipal()).isEmpty();

        SecurityContextHolder.getContext()
                .setAuthentication(authenticated(jwtWithSubject("  padded  ")));
        assertThat(provider.currentPrincipal()).isEmpty();
    }

    @Test
    void malformedRolesStillYieldPrincipalWithEmptyCapabilities() {
        Jwt jwt =
                Jwt.withTokenValue("t")
                        .header("alg", "RS256")
                        .subject("officer-no-caps")
                        .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                        .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                        .claim("realm_access", "broken")
                        .build();
        SecurityContextHolder.getContext().setAuthentication(authenticated(jwt));

        Optional<GovernancePrincipal> principal = provider.currentPrincipal();
        assertThat(principal).isPresent();
        assertThat(principal.get().actorId()).isEqualTo("officer-no-caps");
        assertThat(principal.get().capabilities()).isEmpty();
    }

    private static JwtAuthenticationToken authenticated(Jwt jwt) {
        return new JwtAuthenticationToken(jwt, AuthorityUtils.NO_AUTHORITIES);
    }

    private static Jwt jwtWithSubject(String sub) {
        return Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .subject(sub)
                .issuedAt(Instant.parse("2026-07-28T12:00:00Z"))
                .expiresAt(Instant.parse("2026-07-28T13:00:00Z"))
                .claim(
                        "realm_access",
                        Map.of("roles", List.of(KeycloakRealmAccessRoleMapper.ROLE_READER)))
                .build();
    }
}
