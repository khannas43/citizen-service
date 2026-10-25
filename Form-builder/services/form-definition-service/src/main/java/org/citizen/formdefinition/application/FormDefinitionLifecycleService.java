package org.citizen.formdefinition.application;

import java.time.Clock;
import java.time.Instant;
import java.util.Iterator;
import java.util.Set;

import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Technical lifecycle transitions (FB-C4 / C4.1). {@code actorId} is a provisional unauthenticated
 * assertion until authn/z exists.
 *
 * <p>Ordering (C4.1): admit → service mutation lock → load → verify → build/validate → persist.
 * Shares the same PostgreSQL advisory lock as create/clone so published→retired cannot race an
 * in-progress clone source check.
 */
@Service
public class FormDefinitionLifecycleService {

    private static final Set<String> REQUEST_KEYS = Set.of("targetStatus", "actorId");

    private final FormDefinitionStore store;
    private final FormDefinitionValidationService validationService;
    private final Clock clock;

    public FormDefinitionLifecycleService(
            FormDefinitionStore store, FormDefinitionValidationService validationService, Clock clock) {
        this.store = store;
        this.validationService = validationService;
        this.clock = clock;
    }

    @Transactional
    public FormDefinitionSnapshot transition(
            String serviceId, String versionText, String ifMatch, JsonNode requestBody) {
        TransitionRequest request = parseRequest(requestBody);
        String actorId = ActorIdAdmission.admit(request.actorId());
        return executeTransition(serviceId, versionText, ifMatch, request.targetStatus(), actorId);
    }

    /**
     * Lifecycle transition with a server-derived, already-admitted actor (FB-E1 governance). Does not
     * parse a client {@code actorId}. Reuses the same lock / ETag / validation / event path as the
     * technical endpoint.
     */
    @Transactional
    public FormDefinitionSnapshot transitionWithAdmittedActor(
            String serviceId,
            String versionText,
            String ifMatch,
            FormDefinitionStatus targetStatus,
            String actorId) {
        String admittedActor = ActorIdAdmission.admit(actorId);
        if (targetStatus == null || targetStatus == FormDefinitionStatus.draft) {
            throw new InvalidTransitionRequestException();
        }
        return executeTransition(serviceId, versionText, ifMatch, targetStatus, admittedActor);
    }

    private FormDefinitionSnapshot executeTransition(
            String serviceId,
            String versionText,
            String ifMatch,
            FormDefinitionStatus targetStatus,
            String actorId) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int version = FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText);
        long expectedRevision = FormDefinitionETag.parseIfMatch(ifMatch);

        // FB-C4.1: lock before definition lookup.
        store.acquireServiceMutationLock(admittedServiceId);

        FormDefinitionSnapshot current;
        try {
            current =
                    store.findSnapshot(admittedServiceId, version)
                            .orElseThrow(
                                    () -> new FormDefinitionNotFoundException(admittedServiceId, version));
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        if (current.revision() != expectedRevision) {
            throw new StaleRevisionException();
        }

        FormDefinitionStatus from = current.status();
        if (!LifecycleTransitionRules.isAllowed(from, targetStatus)) {
            throw new LifecycleTransitionNotAllowedException();
        }

        Instant occurredAt = clock.instant();
        ObjectNode candidate = buildCandidate(current.definition(), targetStatus, actorId, occurredAt);

        ValidationResult validation = validationService.validate(candidate);
        if (!validation.valid()) {
            throw new FormDefinitionValidationFailedException(validation);
        }

        return store.applyLifecycleTransition(
                admittedServiceId,
                version,
                expectedRevision,
                from,
                targetStatus,
                actorId,
                occurredAt,
                candidate);
    }

    private static TransitionRequest parseRequest(JsonNode body) {
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
        if (count != REQUEST_KEYS.size()) {
            throw new InvalidTransitionRequestException();
        }
        JsonNode targetNode = body.get("targetStatus");
        JsonNode actorNode = body.get("actorId");
        if (targetNode == null || !targetNode.isTextual() || actorNode == null || !actorNode.isTextual()) {
            throw new InvalidTransitionRequestException();
        }
        FormDefinitionStatus target;
        try {
            target = FormDefinitionStatus.parseExact(targetNode.textValue());
        } catch (IllegalArgumentException ex) {
            throw new InvalidTransitionRequestException();
        }
        if (target == FormDefinitionStatus.draft) {
            throw new InvalidTransitionRequestException();
        }
        return new TransitionRequest(target, actorNode.textValue());
    }

    private static ObjectNode buildCandidate(
            JsonNode sourceDefinition,
            FormDefinitionStatus to,
            String actorId,
            Instant occurredAt) {
        ObjectNode candidate = (ObjectNode) sourceDefinition.deepCopy();
        candidate.put("status", to.name());

        JsonNode auditNode = candidate.get("audit");
        if (auditNode == null || !auditNode.isObject()) {
            throw new StoredDefinitionCorruptException();
        }
        ObjectNode audit = (ObjectNode) auditNode;

        switch (to) {
            case submitted -> audit.put("submittedBy", actorId);
            case approved -> audit.put("approvedBy", actorId);
            case published -> audit.put("publishedAt", occurredAt.toString());
            case retired -> {
                // No additional canonical FormDefinition.audit property for retire.
            }
            default -> throw new LifecycleTransitionNotAllowedException();
        }
        return candidate;
    }

    private record TransitionRequest(FormDefinitionStatus targetStatus, String actorId) {}
}
