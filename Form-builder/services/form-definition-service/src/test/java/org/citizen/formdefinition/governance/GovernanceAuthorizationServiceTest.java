package org.citizen.formdefinition.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.EnumSet;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class GovernanceAuthorizationServiceTest {

    @Test
    void requireAuthenticatedThrowsWhenMissing() {
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.empty());
        GovernanceAuthorizationService auth = new GovernanceAuthorizationService(provider);
        assertThatThrownBy(auth::requireAuthenticated)
                .isInstanceOf(GovernanceUnauthenticatedException.class);
        verify(provider, times(1)).currentPrincipal();
    }

    @Test
    void requireOnResolvedPrincipalChecksCapabilityOnly() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "reader", EnumSet.of(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE));
        GovernanceAuthorizationService auth =
                new GovernanceAuthorizationService(mock(GovernancePrincipalProvider.class));
        auth.require(principal, GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);
        assertThatThrownBy(
                        () -> auth.require(principal, GovernanceCapability.APPROVE_FORM_DEFINITION))
                .isInstanceOf(GovernanceForbiddenException.class);
        assertThatThrownBy(
                        () -> auth.require(principal, GovernanceCapability.PUBLISH_FORM_DEFINITION))
                .isInstanceOf(GovernanceForbiddenException.class);
    }

    @Test
    void requireCapabilityComposesAuthThenCapabilityAndResolvesOnce() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "publisher", EnumSet.of(GovernanceCapability.PUBLISH_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        GovernanceAuthorizationService auth = new GovernanceAuthorizationService(provider);
        assertThat(auth.require(GovernanceCapability.PUBLISH_FORM_DEFINITION).actorId())
                .isEqualTo("publisher");
        verify(provider, times(1)).currentPrincipal();
    }

    @Test
    void missingPrincipalThrowsUnauthenticated() {
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.empty());
        GovernanceAuthorizationService auth = new GovernanceAuthorizationService(provider);
        assertThatThrownBy(
                        () ->
                                auth.require(
                                        GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE))
                .isInstanceOf(GovernanceUnauthenticatedException.class);
    }

    @Test
    void missingCapabilityThrowsForbidden() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "reader", EnumSet.of(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        GovernanceAuthorizationService auth = new GovernanceAuthorizationService(provider);
        assertThatThrownBy(() -> auth.require(GovernanceCapability.APPROVE_FORM_DEFINITION))
                .isInstanceOf(GovernanceForbiddenException.class);
        assertThatThrownBy(() -> auth.require(GovernanceCapability.PUBLISH_FORM_DEFINITION))
                .isInstanceOf(GovernanceForbiddenException.class);
    }
}
