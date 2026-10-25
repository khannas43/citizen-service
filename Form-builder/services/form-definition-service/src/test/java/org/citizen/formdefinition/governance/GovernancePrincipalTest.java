package org.citizen.formdefinition.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.InvalidActorException;

class GovernancePrincipalTest {

    @Test
    void admitsActorAndCopiesCapabilities() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "officer-1",
                        EnumSet.of(
                                GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE,
                                GovernanceCapability.APPROVE_FORM_DEFINITION));
        assertThat(principal.actorId()).isEqualTo("officer-1");
        assertThat(principal.has(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE)).isTrue();
        assertThat(principal.has(GovernanceCapability.APPROVE_FORM_DEFINITION)).isTrue();
        assertThat(principal.has(GovernanceCapability.PUBLISH_FORM_DEFINITION)).isFalse();
        assertThat(principal.capabilities()).isUnmodifiable();
    }

    @Test
    void rejectsInvalidActor() {
        assertThatThrownBy(() -> GovernancePrincipal.of(" ", Set.of()))
                .isInstanceOf(InvalidActorException.class);
        assertThatThrownBy(() -> GovernancePrincipal.of(null, Set.of()))
                .isInstanceOf(InvalidActorException.class);
    }

    @Test
    void approveDoesNotImplyPublish() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "approver", EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
        assertThat(principal.has(GovernanceCapability.PUBLISH_FORM_DEFINITION)).isFalse();
    }
}
