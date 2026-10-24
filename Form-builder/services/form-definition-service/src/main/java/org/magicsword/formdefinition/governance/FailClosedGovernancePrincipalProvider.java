package org.magicsword.formdefinition.governance;

import java.util.Optional;

/**
 * Default fail-closed principal provider (FB-E1). Always returns empty — governance endpoints
 * respond {@code 401 governance_unauthenticated}.
 */
public final class FailClosedGovernancePrincipalProvider implements GovernancePrincipalProvider {

    @Override
    public Optional<GovernancePrincipal> currentPrincipal() {
        return Optional.empty();
    }
}
