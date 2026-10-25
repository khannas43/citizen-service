package org.citizen.formdefinition.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.EnumSet;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionLifecycleService;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.application.IfMatchRequiredException;
import org.citizen.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

class FormDefinitionGovernanceLifecycleServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void unauthenticatedMissingIfMatchThrowsUnauthenticatedBeforeLifecycle() {
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.empty());
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        assertThatThrownBy(() -> service.transition("svc", "1", null, body))
                .isInstanceOf(GovernanceUnauthenticatedException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void unauthenticatedInvalidBodyThrowsUnauthenticatedBeforeBodyAdmissionPath() {
        // Auth runs first; missing If-Match would also 401. Use a present If-Match so that without
        // auth-first the body parser would run — proving auth wins.
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.empty());
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        body.put("actorId", "spoofed");
        assertThatThrownBy(() -> service.transition("svc", "1", "\"etag\"", body))
                .isInstanceOf(GovernanceUnauthenticatedException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void authenticatedMissingIfMatchThrows428Semantics() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "gov", EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        assertThatThrownBy(() -> service.transition("svc", "1", "  ", body))
                .isInstanceOf(IfMatchRequiredException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void authenticatedInvalidBodyThrowsInvalidGovernanceTransition() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "gov", EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        body.put("actorId", "spoofed");
        assertThatThrownBy(() -> service.transition("svc", "1", "\"etag\"", body))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void approveCapabilityCannotPublishAndResolvesProviderOnce() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "approver", EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "published");
        assertThatThrownBy(() -> service.transition("svc", "1", "\"etag\"", body))
                .isInstanceOf(GovernanceForbiddenException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void publishCapabilityCannotApprove() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "publisher", EnumSet.of(GovernanceCapability.PUBLISH_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);

        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        assertThatThrownBy(() -> service.transition("svc", "1", "\"etag\"", body))
                .isInstanceOf(GovernanceForbiddenException.class);
        verify(provider, times(1)).currentPrincipal();
        verifyNoInteractions(lifecycle);
    }

    @Test
    void derivesActorFromPrincipalAndCallsLifecycleWithAdmittedActorOnce() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "gov-actor-1", EnumSet.of(GovernanceCapability.APPROVE_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        FormDefinitionSnapshot snapshot = mock(FormDefinitionSnapshot.class);
        when(lifecycle.transitionWithAdmittedActor(
                        eq("svc"),
                        eq("1"),
                        eq("\"etag\""),
                        eq(FormDefinitionStatus.approved),
                        eq("gov-actor-1")))
                .thenReturn(snapshot);

        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");

        assertThat(service.transition("svc", "1", "\"etag\"", body)).isSameAs(snapshot);
        verify(provider, times(1)).currentPrincipal();
        verify(lifecycle)
                .transitionWithAdmittedActor(
                        "svc", "1", "\"etag\"", FormDefinitionStatus.approved, "gov-actor-1");
    }

    @Test
    void publishRequiresPublishCapabilityIndependently() {
        GovernancePrincipal principal =
                GovernancePrincipal.of(
                        "publisher", EnumSet.of(GovernanceCapability.PUBLISH_FORM_DEFINITION));
        GovernancePrincipalProvider provider = mock(GovernancePrincipalProvider.class);
        when(provider.currentPrincipal()).thenReturn(Optional.of(principal));
        FormDefinitionLifecycleService lifecycle = mock(FormDefinitionLifecycleService.class);
        when(lifecycle.transitionWithAdmittedActor(
                        eq("svc"),
                        eq("2"),
                        eq("\"e\""),
                        eq(FormDefinitionStatus.published),
                        eq("publisher")))
                .thenReturn(mock(FormDefinitionSnapshot.class));

        FormDefinitionGovernanceLifecycleService service =
                new FormDefinitionGovernanceLifecycleService(
                        new GovernanceAuthorizationService(provider), lifecycle);
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "published");
        service.transition("svc", "2", "\"e\"", body);
        verify(provider, times(1)).currentPrincipal();
        verify(lifecycle)
                .transitionWithAdmittedActor(
                        "svc", "2", "\"e\"", FormDefinitionStatus.published, "publisher");
    }
}
