package org.citizen.formdefinition.governance;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

import org.citizen.formdefinition.application.ActorIdAdmission;

/**
 * Authenticated-or-technical governance principal (FB-E1).
 *
 * <p>Constructed only after {@link ActorIdAdmission} and exact capability admission. Must never be
 * serialized into HTTP response bodies, ProblemDetail, or logs.
 */
public final class GovernancePrincipal {

    private final String actorId;
    private final Set<GovernanceCapability> capabilities;

    private GovernancePrincipal(String actorId, Set<GovernanceCapability> capabilities) {
        this.actorId = actorId;
        this.capabilities = capabilities;
    }

    /**
     * @param actorId raw actor; admitted via {@link ActorIdAdmission}
     * @param capabilities exact enum values only; empty allowed (caller still fails capability checks)
     */
    public static GovernancePrincipal of(String actorId, Set<GovernanceCapability> capabilities) {
        String admitted = ActorIdAdmission.admit(actorId);
        Objects.requireNonNull(capabilities, "capabilities");
        EnumSet<GovernanceCapability> copy =
                capabilities.isEmpty()
                        ? EnumSet.noneOf(GovernanceCapability.class)
                        : EnumSet.copyOf(capabilities);
        return new GovernancePrincipal(admitted, Collections.unmodifiableSet(copy));
    }

    public String actorId() {
        return actorId;
    }

    public Set<GovernanceCapability> capabilities() {
        return capabilities;
    }

    public boolean has(GovernanceCapability capability) {
        return capabilities.contains(Objects.requireNonNull(capability, "capability"));
    }
}
