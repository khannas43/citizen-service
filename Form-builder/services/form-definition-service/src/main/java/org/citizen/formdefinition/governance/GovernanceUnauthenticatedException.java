package org.citizen.formdefinition.governance;

/**
 * Missing governance principal (FB-E1). Mapped to {@code 401 governance_unauthenticated}. Never
 * carries actor or capability detail.
 */
public final class GovernanceUnauthenticatedException extends RuntimeException {

    public GovernanceUnauthenticatedException() {
        super();
    }
}
