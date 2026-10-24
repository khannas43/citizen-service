package org.magicsword.formdefinition.governance;

import java.util.Optional;

/**
 * Application port for the current governance principal (FB-E1).
 *
 * <p>Spring-independent. Default runtime implementations must fail closed (empty).
 */
@FunctionalInterface
public interface GovernancePrincipalProvider {

    /**
     * @return current principal when available; empty when unauthenticated / unavailable
     */
    Optional<GovernancePrincipal> currentPrincipal();
}
