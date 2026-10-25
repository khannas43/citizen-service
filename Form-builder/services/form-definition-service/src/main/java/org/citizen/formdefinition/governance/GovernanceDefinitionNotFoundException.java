package org.citizen.formdefinition.governance;

/**
 * Governance detail not found or not eligible (submitted|approved only). Mapped to a generic 404
 * that does not distinguish missing vs wrong-status rows.
 */
public final class GovernanceDefinitionNotFoundException extends RuntimeException {

    public GovernanceDefinitionNotFoundException() {
        super();
    }
}
