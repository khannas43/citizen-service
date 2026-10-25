package org.citizen.formdefinition.application;

import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * External create/update commands: validate-before-persist for drafts (FB-C2 / C3).
 *
 * <p>Does not wire validation into {@link FormDefinitionStore}; the store remains usable by
 * internal persistence tests without the five-stage gate.
 */
@Service
public class FormDefinitionCommandService {

    private final FormDefinitionValidationService validationService;
    private final FormDefinitionStore store;

    public FormDefinitionCommandService(
            FormDefinitionValidationService validationService, FormDefinitionStore store) {
        this.validationService = validationService;
        this.store = store;
    }

    /**
     * Validate with C1, require {@code status=draft}, then create-only insert.
     *
     * @return detached snapshot (definition + revision for ETag)
     */
    @Transactional
    public FormDefinitionSnapshot createDraft(JsonNode document) {
        JsonNode detached = document == null ? null : document.deepCopy();

        ValidationResult result = validationService.validate(detached);
        if (!result.valid()) {
            throw new FormDefinitionValidationFailedException(result);
        }

        requireCreateDraftStatus(detached);
        return store.create(detached);
    }

    /**
     * Full draft replacement with If-Match optimistic concurrency (FB-C3).
     *
     * <p>Ordering: admit coordinates → parse If-Match → load → require stored draft → compare
     * revision → C1 validate → require body draft → coordinate match → immutable creation audit →
     * atomic replace.
     */
    @Transactional
    public FormDefinitionSnapshot replaceDraft(
            String serviceId, String versionText, String ifMatch, JsonNode body) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int version = FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText);
        long expectedRevision = FormDefinitionETag.parseIfMatch(ifMatch);

        FormDefinitionSnapshot current;
        try {
            current =
                    store.findSnapshot(admittedServiceId, version)
                            .orElseThrow(
                                    () -> new FormDefinitionNotFoundException(admittedServiceId, version));
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        if (current.status() != FormDefinitionStatus.draft) {
            throw new DefinitionNotEditableException();
        }
        if (current.revision() != expectedRevision) {
            throw new StaleRevisionException();
        }

        JsonNode detached = body == null ? null : body.deepCopy();

        ValidationResult validation = validationService.validate(detached);
        if (!validation.valid()) {
            throw new FormDefinitionValidationFailedException(validation);
        }

        requireUpdateDraftStatus(detached);
        requireCoordinateMatch(detached, admittedServiceId, version);
        requireImmutableCreationAudit(detached, current.definition());

        return store.replaceDraft(admittedServiceId, version, expectedRevision, detached);
    }

    private static void requireCreateDraftStatus(JsonNode document) {
        if (document == null || !document.isObject()) {
            throw new CreateRequiresDraftException();
        }
        JsonNode statusNode = document.get("status");
        if (statusNode == null || !statusNode.isTextual()) {
            throw new CreateRequiresDraftException();
        }
        if (!FormDefinitionStatus.draft.name().equals(statusNode.textValue())) {
            throw new CreateRequiresDraftException();
        }
    }

    private static void requireUpdateDraftStatus(JsonNode document) {
        if (document == null || !document.isObject()) {
            throw new UpdateRequiresDraftException();
        }
        JsonNode statusNode = document.get("status");
        if (statusNode == null || !statusNode.isTextual()) {
            throw new UpdateRequiresDraftException();
        }
        if (!FormDefinitionStatus.draft.name().equals(statusNode.textValue())) {
            throw new UpdateRequiresDraftException();
        }
    }

    private static void requireCoordinateMatch(JsonNode body, String serviceId, int version) {
        if (body == null || !body.isObject()) {
            throw new DefinitionCoordinateMismatchException();
        }
        JsonNode serviceIdNode = body.get("serviceId");
        JsonNode versionNode = body.get("version");
        if (serviceIdNode == null
                || !serviceIdNode.isTextual()
                || !serviceId.equals(serviceIdNode.textValue())) {
            throw new DefinitionCoordinateMismatchException();
        }
        if (versionNode == null
                || !versionNode.isIntegralNumber()
                || versionNode.isFloatingPointNumber()
                || versionNode.intValue() != version) {
            throw new DefinitionCoordinateMismatchException();
        }
    }

    private static void requireImmutableCreationAudit(JsonNode body, JsonNode stored) {
        JsonNode bodyAudit = body.get("audit");
        JsonNode storedAudit = stored.get("audit");
        if (bodyAudit == null || !bodyAudit.isObject() || storedAudit == null || !storedAudit.isObject()) {
            throw new ImmutableCreationAuditChangedException();
        }
        if (!exactTextMatch(bodyAudit.get("createdBy"), storedAudit.get("createdBy"))
                || !exactTextMatch(bodyAudit.get("createdAt"), storedAudit.get("createdAt"))) {
            throw new ImmutableCreationAuditChangedException();
        }
    }

    private static boolean exactTextMatch(JsonNode left, JsonNode right) {
        return left != null
                && right != null
                && left.isTextual()
                && right.isTextual()
                && left.textValue().equals(right.textValue());
    }
}
