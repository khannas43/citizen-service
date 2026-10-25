package org.citizen.formdefinition.security;

import java.util.Optional;
import java.util.Set;

import org.citizen.formdefinition.application.ActorIdAdmission;
import org.citizen.formdefinition.application.InvalidActorException;
import org.citizen.formdefinition.governance.GovernanceCapability;
import org.citizen.formdefinition.governance.GovernancePrincipal;
import org.citizen.formdefinition.governance.GovernancePrincipalProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * SecurityContext-backed governance principal for profile {@code governance-oidc} (FB-E5.4.1).
 *
 * <p>Actor is JWT {@code sub} only (immutable). Roles from {@code realm_access.roles}. Does not
 * retain principals globally and never logs claims.
 */
public final class OidcGovernancePrincipalProvider implements GovernancePrincipalProvider {

    @Override
    public Optional<GovernancePrincipal> currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuth)
                || !jwtAuth.isAuthenticated()
                || jwtAuth.getToken() == null) {
            return Optional.empty();
        }
        String sub = jwtAuth.getToken().getSubject();
        if (sub == null || sub.isBlank() || !sub.equals(sub.trim())) {
            return Optional.empty();
        }
        try {
            ActorIdAdmission.admit(sub);
        } catch (InvalidActorException ex) {
            return Optional.empty();
        }
        Set<GovernanceCapability> capabilities =
                KeycloakRealmAccessRoleMapper.mapCapabilities(jwtAuth.getToken());
        return Optional.of(GovernancePrincipal.of(sub, capabilities));
    }
}
