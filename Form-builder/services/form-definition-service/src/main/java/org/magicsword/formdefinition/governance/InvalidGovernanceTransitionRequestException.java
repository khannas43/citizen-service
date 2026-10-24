package org.magicsword.formdefinition.governance;

/**
 * Malformed governance transition body (FB-E1). Mapped to {@code 400
 * invalid_governance_transition_request}.
 */
public final class InvalidGovernanceTransitionRequestException extends RuntimeException {

    public InvalidGovernanceTransitionRequestException() {
        super();
    }
}
