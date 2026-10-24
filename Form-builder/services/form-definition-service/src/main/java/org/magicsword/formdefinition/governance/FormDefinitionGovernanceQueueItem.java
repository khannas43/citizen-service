package org.magicsword.formdefinition.governance;

import java.util.Objects;

import org.magicsword.formdefinition.domain.FormDefinitionStatus;

/** Immutable governance queue row projection (FB-E1). No definition JSON / audit / ETag. */
public final class FormDefinitionGovernanceQueueItem {

    private final String serviceId;
    private final int version;
    private final FormDefinitionStatus status;

    public FormDefinitionGovernanceQueueItem(
            String serviceId, int version, FormDefinitionStatus status) {
        this.serviceId = Objects.requireNonNull(serviceId, "serviceId");
        this.version = version;
        this.status = Objects.requireNonNull(status, "status");
        if (status != FormDefinitionStatus.submitted && status != FormDefinitionStatus.approved) {
            throw new IllegalArgumentException("governance queue status must be submitted or approved");
        }
    }

    public String serviceId() {
        return serviceId;
    }

    public int version() {
        return version;
    }

    public FormDefinitionStatus status() {
        return status;
    }
}
