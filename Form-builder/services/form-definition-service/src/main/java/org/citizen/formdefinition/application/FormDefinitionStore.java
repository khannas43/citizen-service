package org.citizen.formdefinition.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.citizen.formdefinition.domain.FormDefinitionEntity;
import org.citizen.formdefinition.domain.FormDefinitionId;
import org.citizen.formdefinition.domain.FormDefinitionLifecycleEventEntity;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceQueueItem;
import org.citizen.formdefinition.governance.GovernanceQueueCursorParser;
import org.citizen.formdefinition.persistence.FormDefinitionInsertAdapter;
import org.citizen.formdefinition.persistence.FormDefinitionRepository;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.persistence.EntityManager;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.Query;

/**
 * Internal persistence boundary for Form Definitions (FB-C0–C5).
 *
 * <p>Service-level PostgreSQL transaction advisory locks serialize explicit draft create, clone
 * allocation, and lifecycle transitions that affect cloneable-source state. Draft PUT continues to
 * rely on {@code @Version} only. Published lookup and version listing are read-only and detached.
 */
@Service
public class FormDefinitionStore {

    private final FormDefinitionRepository repository;
    private final FormDefinitionInsertAdapter insertAdapter;
    private final EntityManager entityManager;

    public FormDefinitionStore(
            FormDefinitionRepository repository,
            FormDefinitionInsertAdapter insertAdapter,
            EntityManager entityManager) {
        this.repository = repository;
        this.insertAdapter = insertAdapter;
        this.entityManager = entityManager;
    }

    /**
     * Acquire the shared service mutation advisory lock (FB-C4.1).
     *
     * <p>Requires an active transaction. Uses {@code pg_advisory_xact_lock(hashtextextended(serviceId,
     * 0))} — identical SQL/key for create, clone allocation, and lifecycle.
     */
    @Transactional
    public void acquireServiceMutationLock(String serviceId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Service mutation lock requires an active transaction");
        }
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        Query query =
                entityManager.createNativeQuery(
                        "SELECT pg_advisory_xact_lock(hashtextextended(?1, 0))");
        query.setParameter(1, admittedServiceId);
        query.getSingleResult();
    }

    @Transactional
    public FormDefinitionSnapshot create(JsonNode document) {
        FormDefinitionCoordinates coordinates = FormDefinitionCoordinateParser.parseDocument(document);
        acquireServiceMutationLock(coordinates.serviceId());

        JsonNode detachedCopy = document.deepCopy();
        FormDefinitionId id = new FormDefinitionId(coordinates.serviceId(), coordinates.version());
        FormDefinitionEntity entity =
                new FormDefinitionEntity(id, coordinates.status(), detachedCopy.deepCopy());

        insertAdapter.insertNew(entity);
        verifyPersistedCoordinates(entity);
        return toSnapshot(entity);
    }

    @Transactional(readOnly = true)
    public Optional<JsonNode> find(String serviceId, int version) {
        return findSnapshot(serviceId, version).map(FormDefinitionSnapshot::definition);
    }

    @Transactional(readOnly = true)
    public Optional<FormDefinitionSnapshot> findSnapshot(String serviceId, int version) {
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        int admittedVersion = FormDefinitionCoordinateParser.admitLookupVersion(version);
        return repository
                .findById(new FormDefinitionId(admittedServiceId, admittedVersion))
                .map(
                        entity -> {
                            verifyPersistedCoordinates(entity);
                            return toSnapshot(entity);
                        });
    }

    /**
     * Highest published/retired definition for a service (release head). Does not filter retired vs
     * published — callers apply C5 release-head policy. Read-only; returns a detached snapshot.
     */
    @Transactional(readOnly = true)
    public Optional<FormDefinitionSnapshot> findReleaseHead(String serviceId) {
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        List<FormDefinitionEntity> heads =
                repository.findReleaseHeads(admittedServiceId, PageRequest.of(0, 1));
        if (heads.isEmpty()) {
            return Optional.empty();
        }
        FormDefinitionEntity entity = heads.get(0);
        verifyPersistedCoordinates(entity);
        return Optional.of(toSnapshot(entity));
    }

    /**
     * Bounded ascending version metadata. Fetches at most {@code limit} verified rows after the
     * exclusive {@code afterVersion} cursor ({@code 0} = start). Caller must request {@code
     * limit+1} when computing a next cursor.
     */
    @Transactional(readOnly = true)
    public List<FormDefinitionVersionItem> listVersionItems(
            String serviceId, int afterVersion, int fetchLimit) {
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        if (afterVersion < 0) {
            throw new InvalidPaginationException("afterVersion must not be negative");
        }
        if (fetchLimit < 1) {
            throw new InvalidPaginationException("fetchLimit must be positive");
        }
        List<FormDefinitionEntity> rows =
                repository.findVersionsAfter(
                        admittedServiceId, afterVersion, PageRequest.of(0, fetchLimit));
        List<FormDefinitionVersionItem> items = new ArrayList<>(rows.size());
        for (FormDefinitionEntity entity : rows) {
            verifyPersistedCoordinates(entity);
            items.add(
                    new FormDefinitionVersionItem(
                            entity.getId().getVersion(), entity.getStatus()));
        }
        return List.copyOf(items);
    }

    /**
     * Bounded governance queue metadata (FB-E1). Fetches at most {@code fetchLimit} submitted|approved
     * rows after the exclusive keyset cursor (null cursor = start). Does not load JSONB bodies.
     */
    @Transactional(readOnly = true)
    public List<FormDefinitionGovernanceQueueItem> listGovernanceQueueItems(
            GovernanceQueueCursorParser.Cursor cursorOrNull, int fetchLimit) {
        if (fetchLimit < 1) {
            throw new InvalidPaginationException("fetchLimit must be positive");
        }
        boolean hasCursor = cursorOrNull != null;
        String afterServiceId = hasCursor ? cursorOrNull.afterServiceId() : "";
        int afterVersion = hasCursor ? cursorOrNull.afterVersion() : 0;
        List<FormDefinitionGovernanceQueueItem> rows =
                repository.findGovernanceQueueAfter(
                        hasCursor, afterServiceId, afterVersion, PageRequest.of(0, fetchLimit));
        return List.copyOf(rows);
    }

    @Transactional
    public FormDefinitionSnapshot replaceDraft(
            String serviceId, int version, long expectedRevision, JsonNode document) {
        // Draft PUT: @Version only — clone sources are never draft (FB-C4.1).
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        int admittedVersion = FormDefinitionCoordinateParser.admitLookupVersion(version);
        FormDefinitionId id = new FormDefinitionId(admittedServiceId, admittedVersion);

        FormDefinitionEntity entity =
                repository
                        .findById(id)
                        .orElseThrow(() -> new FormDefinitionNotFoundException(admittedServiceId, admittedVersion));

        verifyPersistedCoordinates(entity);

        if (entity.getStatus() != FormDefinitionStatus.draft) {
            throw new DefinitionNotEditableException();
        }
        if (entity.getLockVersion() != expectedRevision) {
            throw new StaleRevisionException();
        }

        JsonNode replacement = document.deepCopy();
        if (entity.getDefinition().equals(replacement)) {
            return toSnapshot(entity);
        }

        try {
            entity.replaceDraftDefinition(replacement);
            entityManager.flush();
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw new StaleRevisionException(ex);
        }

        verifyPersistedCoordinates(entity);
        if (entity.getStatus() != FormDefinitionStatus.draft) {
            throw new DefinitionNotEditableException();
        }
        return toSnapshot(entity);
    }

    /**
     * Return {@code max(version)+1}. Reacquires the same transaction-scoped service mutation lock
     * (safe if already held). Must never be called before the service lock is held by the caller.
     */
    @Transactional
    public int allocateNextVersion(String serviceId) {
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        acquireServiceMutationLock(admittedServiceId);
        return nextVersionOrThrow(admittedServiceId);
    }

    /**
     * Atomically apply a validated lifecycle candidate and append an event row.
     *
     * <p>Reacquires the service mutation lock (safe if already held by {@link
     * FormDefinitionLifecycleService}).
     */
    @Transactional
    public FormDefinitionSnapshot applyLifecycleTransition(
            String serviceId,
            int version,
            long expectedRevision,
            FormDefinitionStatus fromStatus,
            FormDefinitionStatus toStatus,
            String actorId,
            Instant occurredAt,
            JsonNode candidateDocument) {
        String admittedServiceId = FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
        int admittedVersion = FormDefinitionCoordinateParser.admitLookupVersion(version);
        acquireServiceMutationLock(admittedServiceId);

        FormDefinitionId id = new FormDefinitionId(admittedServiceId, admittedVersion);

        FormDefinitionEntity entity =
                repository
                        .findById(id)
                        .orElseThrow(() -> new FormDefinitionNotFoundException(admittedServiceId, admittedVersion));

        verifyPersistedCoordinates(entity);

        if (entity.getLockVersion() != expectedRevision || entity.getStatus() != fromStatus) {
            throw new StaleRevisionException();
        }

        JsonNode replacement = candidateDocument.deepCopy();
        try {
            entity.applyLifecycleDocument(toStatus, replacement);
            entityManager.flush();

            FormDefinitionLifecycleEventEntity event =
                    new FormDefinitionLifecycleEventEntity(
                            admittedServiceId,
                            admittedVersion,
                            fromStatus,
                            toStatus,
                            actorId,
                            occurredAt,
                            entity.getLockVersion());
            entityManager.persist(event);
            entityManager.flush();
        } catch (OptimisticLockException | OptimisticLockingFailureException ex) {
            throw new StaleRevisionException(ex);
        }

        verifyPersistedCoordinates(entity);
        return toSnapshot(entity);
    }

    private int nextVersionOrThrow(String serviceId) {
        Query query =
                entityManager.createNativeQuery(
                        """
                        SELECT COALESCE(MAX(version), 0)
                        FROM form_definition.form_definitions
                        WHERE service_id = :serviceId
                        """);
        query.setParameter("serviceId", serviceId);
        Number max = (Number) query.getSingleResult();
        long next = max.longValue() + 1L;
        if (next > Integer.MAX_VALUE || next <= 0L) {
            throw new VersionExhaustedException();
        }
        return (int) next;
    }

    private static FormDefinitionSnapshot toSnapshot(FormDefinitionEntity entity) {
        return new FormDefinitionSnapshot(
                entity.getDefinition(),
                entity.getLockVersion(),
                entity.getStatus(),
                entity.getUpdatedAt());
    }

    private static void verifyPersistedCoordinates(FormDefinitionEntity entity) {
        JsonNode definition = entity.getDefinition();
        FormDefinitionCoordinates parsed;
        try {
            parsed = FormDefinitionCoordinateParser.parseDocument(definition);
        } catch (FormDefinitionAdmissionException ex) {
            throw new FormDefinitionAdmissionException("persisted definition coordinates are invalid", ex);
        }
        if (!Objects.equals(entity.getId().getServiceId(), parsed.serviceId())) {
            throw new FormDefinitionAdmissionException("serviceId column does not match definition.serviceId");
        }
        if (entity.getId().getVersion() != parsed.version()) {
            throw new FormDefinitionAdmissionException("version column does not match definition.version");
        }
        if (entity.getStatus() == null || entity.getStatus() != parsed.status()) {
            throw new FormDefinitionAdmissionException("status column does not match definition.status");
        }
    }
}
