package org.magicsword.formdefinition.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Iterator;
import java.util.Set;

import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Immutable new-draft version creation from a published/retired source (FB-C4 / C4.1).
 *
 * <p>Ordering (C4.1): admit → service mutation lock → first source load → verify → allocate →
 * build detached candidate → C1 validate → create. No pre-lock source load.
 *
 * <p>{@code createdBy} is a provisional assertion until authenticated principals exist.
 */
@Service
public class FormDefinitionNewDraftService {

    private static final Set<String> REQUEST_KEYS = Set.of("createdBy");

    private final FormDefinitionStore store;
    private final FormDefinitionValidationService validationService;
    private final Clock clock;

    public FormDefinitionNewDraftService(
            FormDefinitionStore store, FormDefinitionValidationService validationService, Clock clock) {
        this.store = store;
        this.validationService = validationService;
        this.clock = clock;
    }

    @Transactional
    public FormDefinitionSnapshot createFromVersion(
            String serviceId, String sourceVersionText, String ifMatch, JsonNode requestBody) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int sourceVersion = FormDefinitionQueryCoordinateParser.parseVersionQuery(sourceVersionText);
        long expectedRevision = FormDefinitionETag.parseIfMatch(ifMatch);
        String createdBy = ActorIdAdmission.admit(parseCreatedBy(requestBody));
        return createFromVersionWithAdmittedActor(
                admittedServiceId, sourceVersion, expectedRevision, createdBy);
    }

    /**
     * Clone with a server-derived, already-admitted {@code createdBy} (FB-E5.4.2B). Does not parse a
     * client identity. Reuses the same lock / ETag / validation / create path as the technical
     * endpoint.
     */
    @Transactional
    public FormDefinitionSnapshot createFromVersionWithAdmittedActor(
            String serviceId,
            String sourceVersionText,
            String ifMatch,
            String createdBy) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int sourceVersion = FormDefinitionQueryCoordinateParser.parseVersionQuery(sourceVersionText);
        long expectedRevision = FormDefinitionETag.parseIfMatch(ifMatch);
        String admittedCreatedBy = ActorIdAdmission.admit(createdBy);
        return createFromVersionWithAdmittedActor(
                admittedServiceId, sourceVersion, expectedRevision, admittedCreatedBy);
    }

    private FormDefinitionSnapshot createFromVersionWithAdmittedActor(
            String admittedServiceId, int sourceVersion, long expectedRevision, String createdBy) {
        // FB-C4.1: lock before any source load so concurrent lifecycle cannot race the check.
        store.acquireServiceMutationLock(admittedServiceId);

        FormDefinitionSnapshot source;
        try {
            source =
                    store.findSnapshot(admittedServiceId, sourceVersion)
                            .orElseThrow(
                                    () ->
                                            new FormDefinitionNotFoundException(
                                                    admittedServiceId, sourceVersion));
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        if (!LifecycleTransitionRules.isCloneableSource(source.status())) {
            throw new SourceNotCloneableException();
        }
        if (source.revision() != expectedRevision) {
            throw new StaleRevisionException();
        }

        int nextVersion = store.allocateNextVersion(admittedServiceId);

        Instant createdAt = clock.instant();
        // Detached structural copy — do not share mutable JsonNode graphs with the source.
        ObjectNode draft =
                buildNewDraft(source.definition(), admittedServiceId, nextVersion, createdBy, createdAt);

        ValidationResult validation = validationService.validate(draft);
        if (!validation.valid()) {
            throw new FormDefinitionValidationFailedException(validation);
        }

        return store.create(draft);
    }

    private static String parseCreatedBy(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new InvalidTransitionRequestException();
        }
        int count = 0;
        Iterator<String> names = body.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!REQUEST_KEYS.contains(name)) {
                throw new InvalidTransitionRequestException();
            }
            count++;
        }
        if (count != 1) {
            throw new InvalidTransitionRequestException();
        }
        JsonNode createdBy = body.get("createdBy");
        if (createdBy == null || !createdBy.isTextual()) {
            throw new InvalidTransitionRequestException();
        }
        return createdBy.textValue();
    }

    private static ObjectNode buildNewDraft(
            JsonNode sourceDefinition,
            String serviceId,
            int newVersion,
            String createdBy,
            Instant createdAt) {
        ObjectNode draft = JsonNodeFactory.instance.objectNode();
        draft.put("serviceId", serviceId);
        draft.put("version", newVersion);
        draft.put("status", FormDefinitionStatus.draft.name());
        draft.set("jsonSchema", sourceDefinition.get("jsonSchema").deepCopy());
        draft.set("uiSchema", sourceDefinition.get("uiSchema").deepCopy());
        draft.set("meta", sourceDefinition.get("meta").deepCopy());

        ObjectNode audit = JsonNodeFactory.instance.objectNode();
        audit.put("createdBy", createdBy);
        audit.put("createdAt", createdAt.toString());
        draft.set("audit", audit);
        return draft;
    }
}
