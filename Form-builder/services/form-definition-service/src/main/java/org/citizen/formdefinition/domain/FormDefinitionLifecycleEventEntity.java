package org.citizen.formdefinition.domain;

import java.time.Instant;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Append-only lifecycle event row (FB-C4). Never updated or deleted through the application API.
 */
@Entity
@Table(name = "form_definition_lifecycle_events", schema = "form_definition")
public class FormDefinitionLifecycleEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "service_id", nullable = false, length = 256)
    private String serviceId;

    @Column(name = "version", nullable = false)
    private int version;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = false, length = 32)
    private FormDefinitionStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 32)
    private FormDefinitionStatus toStatus;

    @Column(name = "actor_id", nullable = false, length = 256)
    private String actorId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "resulting_revision", nullable = false)
    private long resultingRevision;

    protected FormDefinitionLifecycleEventEntity() {
        // JPA
    }

    public FormDefinitionLifecycleEventEntity(
            String serviceId,
            int version,
            FormDefinitionStatus fromStatus,
            FormDefinitionStatus toStatus,
            String actorId,
            Instant occurredAt,
            long resultingRevision) {
        this.serviceId = Objects.requireNonNull(serviceId, "serviceId");
        this.version = version;
        this.fromStatus = Objects.requireNonNull(fromStatus, "fromStatus");
        this.toStatus = Objects.requireNonNull(toStatus, "toStatus");
        this.actorId = Objects.requireNonNull(actorId, "actorId");
        this.occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        this.resultingRevision = resultingRevision;
    }

    public Long getEventId() {
        return eventId;
    }

    public String getServiceId() {
        return serviceId;
    }

    public int getVersion() {
        return version;
    }

    public FormDefinitionStatus getFromStatus() {
        return fromStatus;
    }

    public FormDefinitionStatus getToStatus() {
        return toStatus;
    }

    public String getActorId() {
        return actorId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public long getResultingRevision() {
        return resultingRevision;
    }
}
