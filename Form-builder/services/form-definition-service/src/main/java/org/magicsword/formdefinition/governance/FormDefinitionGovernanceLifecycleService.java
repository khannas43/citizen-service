package org.magicsword.formdefinition.governance;

import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.IfMatchRequiredException;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Secured governance approve/publish transitions (FB-E1 / E1.1). Actor is derived exclusively from
 * {@link GovernancePrincipal}; body must not contain {@code actorId}.
 *
 * <p>Authentication order (E1.1): authenticate → If-Match → body admit → capability → mutate.
 * Resolves {@link GovernancePrincipalProvider} exactly once per request.
 *
 * <p>Reuses {@link FormDefinitionLifecycleService#transitionWithAdmittedActor}. Not a DST path.
 */
@Service
public class FormDefinitionGovernanceLifecycleService {

    private final GovernanceAuthorizationService authorizationService;
    private final FormDefinitionLifecycleService lifecycleService;

    public FormDefinitionGovernanceLifecycleService(
            GovernanceAuthorizationService authorizationService,
            FormDefinitionLifecycleService lifecycleService) {
        this.authorizationService = authorizationService;
        this.lifecycleService = lifecycleService;
    }

    @Transactional
    public FormDefinitionSnapshot transition(
            String serviceId, String versionText, String ifMatch, JsonNode requestBody) {
        // FB-E1.1: authenticate before If-Match / body admission.
        GovernancePrincipal principal = authorizationService.requireAuthenticated();

        if (ifMatch == null || ifMatch.isBlank()) {
            throw new IfMatchRequiredException();
        }

        FormDefinitionStatus target =
                GovernanceTransitionRequestParser.parseTargetStatus(requestBody);

        GovernanceCapability required =
                target == FormDefinitionStatus.approved
                        ? GovernanceCapability.APPROVE_FORM_DEFINITION
                        : GovernanceCapability.PUBLISH_FORM_DEFINITION;

        authorizationService.require(principal, required);

        return lifecycleService.transitionWithAdmittedActor(
                serviceId, versionText, ifMatch, target, principal.actorId());
    }
}
