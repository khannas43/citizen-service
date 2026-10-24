package org.magicsword.formdefinition.domain;

import java.time.Instant;
import java.util.Objects;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "form_definitions", schema = "form_definition")
public class FormDefinitionEntity {

    @EmbeddedId
    private FormDefinitionId id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private FormDefinitionStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "definition", nullable = false, columnDefinition = "jsonb")
    private JsonNode definition;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "lock_version", nullable = false)
    private long lockVersion;

    protected FormDefinitionEntity() {
        // JPA
    }

    public FormDefinitionEntity(FormDefinitionId id, FormDefinitionStatus status, JsonNode definition) {
        this.id = Objects.requireNonNull(id, "id");
        this.status = Objects.requireNonNull(status, "status");
        this.definition = Objects.requireNonNull(definition, "definition");
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public FormDefinitionId getId() {
        return id;
    }

    public FormDefinitionStatus getStatus() {
        return status;
    }

    public JsonNode getDefinition() {
        return definition;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getLockVersion() {
        return lockVersion;
    }

    /**
     * Replace the JSONB document on a managed draft entity (FB-C3). Does not change status or
     * primary-key coordinates. Caller must ensure the document remains {@code status=draft} and
     * coordinate-consistent before flush.
     */
    public void replaceDraftDefinition(JsonNode replacement) {
        this.definition = Objects.requireNonNull(replacement, "replacement");
    }

    /**
     * Apply a lifecycle transition document on a managed entity (FB-C4). Updates both the status
     * column and the JSONB document atomically within the same flush.
     */
    public void applyLifecycleDocument(FormDefinitionStatus newStatus, JsonNode replacement) {
        this.status = Objects.requireNonNull(newStatus, "newStatus");
        this.definition = Objects.requireNonNull(replacement, "replacement");
    }
}
