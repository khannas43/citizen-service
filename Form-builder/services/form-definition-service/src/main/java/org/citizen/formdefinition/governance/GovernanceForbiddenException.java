package org.citizen.formdefinition.governance;

/**
 * Principal present but missing required capability (FB-E1). Mapped to {@code 403
 * governance_forbidden}. Never carries actor or capability detail.
 */
public final class GovernanceForbiddenException extends RuntimeException {

    public GovernanceForbiddenException() {
        super();
    }
}
