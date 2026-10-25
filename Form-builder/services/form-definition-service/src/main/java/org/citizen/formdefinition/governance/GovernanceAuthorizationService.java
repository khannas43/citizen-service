package org.citizen.formdefinition.governance;

import java.util.Objects;

import org.springframework.stereotype.Service;

/**
 * Application-layer capability checks for Form Definition governance (FB-E1 / E1.1).
 *
 * <p>Authentication must run before request admission on governance endpoints. Does not log or
 * serialize principals.
 */
@Service
public class GovernanceAuthorizationService {

    private final GovernancePrincipalProvider principalProvider;

    public GovernanceAuthorizationService(GovernancePrincipalProvider principalProvider) {
        this.principalProvider = principalProvider;
    }

    /**
     * Resolve the current principal exactly once. Missing principal → {@link
     * GovernanceUnauthenticatedException}.
     */
    public GovernancePrincipal requireAuthenticated() {
        return principalProvider
                .currentPrincipal()
                .orElseThrow(GovernanceUnauthenticatedException::new);
    }

    /**
     * Require {@code capability} on an already-resolved principal. Missing capability → {@link
     * GovernanceForbiddenException}.
     */
    public void require(GovernancePrincipal principal, GovernanceCapability capability) {
        Objects.requireNonNull(principal, "principal");
        Objects.requireNonNull(capability, "capability");
        if (!principal.has(capability)) {
            throw new GovernanceForbiddenException();
        }
    }

    /**
     * Resolve principal once and require {@code capability}. Used by queue/detail. Lifecycle should
     * prefer {@link #requireAuthenticated()} then {@link #require(GovernancePrincipal,
     * GovernanceCapability)} so authentication precedes If-Match/body admission without a second
     * provider resolution.
     */
    public GovernancePrincipal require(GovernanceCapability capability) {
        GovernancePrincipal principal = requireAuthenticated();
        require(principal, capability);
        return principal;
    }
}
