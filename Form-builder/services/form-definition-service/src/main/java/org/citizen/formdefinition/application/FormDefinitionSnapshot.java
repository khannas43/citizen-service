package org.citizen.formdefinition.application;

import java.time.Instant;
import java.util.Objects;

import org.citizen.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Detached Form Definition snapshot for API/application boundaries (FB-C3).
 *
 * <p>Revision is an internal optimistic-lock representation — never serialized into JSON bodies.
 * HTTP ETags are derived opaquely from it.
 */
public final class FormDefinitionSnapshot {

    private final JsonNode definition;
    private final long revision;
    private final FormDefinitionStatus status;
    private final Instant updatedAt;

    public FormDefinitionSnapshot(
            JsonNode definition, long revision, FormDefinitionStatus status, Instant updatedAt) {
        this.definition = Objects.requireNonNull(definition, "definition").deepCopy();
        this.revision = revision;
        this.status = Objects.requireNonNull(status, "status");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public JsonNode definition() {
        // Defensive copy so callers cannot mutate the snapshot's stored node.
        return definition.deepCopy();
    }

    public long revision() {
        return revision;
    }

    public FormDefinitionStatus status() {
        return status;
    }

    public Instant updatedAt() {
        return updatedAt;
    }
}
