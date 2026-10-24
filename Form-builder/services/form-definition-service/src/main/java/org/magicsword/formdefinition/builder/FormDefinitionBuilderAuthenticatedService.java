package org.magicsword.formdefinition.builder;

import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionNewDraftService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.IfMatchRequiredException;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Authenticated Builder clone and draft-submit (FB-E5.4.2B). Actor is JWT {@code sub} only. Bodies
 * must not carry client identity. Filter-chain enforces {@link BuilderCapability} authorities.
 *
 * <p>Order: resolve actor → require If-Match → admit body → mutate.
 */
@Service
public class FormDefinitionBuilderAuthenticatedService {

    private final BuilderAuthenticatedActorResolver actorResolver;
    private final FormDefinitionNewDraftService newDraftService;
    private final FormDefinitionLifecycleService lifecycleService;

    public FormDefinitionBuilderAuthenticatedService(
            BuilderAuthenticatedActorResolver actorResolver,
            FormDefinitionNewDraftService newDraftService,
            FormDefinitionLifecycleService lifecycleService) {
        this.actorResolver = actorResolver;
        this.newDraftService = newDraftService;
        this.lifecycleService = lifecycleService;
    }

    @Transactional
    public FormDefinitionSnapshot cloneFromVersion(
            String serviceId, String sourceVersionText, String ifMatch, JsonNode requestBody) {
        String actorId = actorResolver.requireActorId();
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new IfMatchRequiredException();
        }
        BuilderAuthenticatedRequestParser.admitEmptyCloneBody(requestBody);
        return newDraftService.createFromVersionWithAdmittedActor(
                serviceId, sourceVersionText, ifMatch, actorId);
    }

    @Transactional
    public FormDefinitionSnapshot submitDraft(
            String serviceId, String versionText, String ifMatch, JsonNode requestBody) {
        String actorId = actorResolver.requireActorId();
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new IfMatchRequiredException();
        }
        BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(requestBody);
        return lifecycleService.transitionWithAdmittedActor(
                serviceId, versionText, ifMatch, FormDefinitionStatus.submitted, actorId);
    }
}
