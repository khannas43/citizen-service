package org.citizen.formdefinition.application;

import org.citizen.formdefinition.domain.FormDefinitionStatus;

/**
 * Strict admitted coordinates for a Form Definition document (FB-C0.1).
 * Persistence safety only — not the five-stage validator.
 */
public final class FormDefinitionCoordinates {

    private final String serviceId;
    private final int version;
    private final FormDefinitionStatus status;

    public FormDefinitionCoordinates(String serviceId, int version, FormDefinitionStatus status) {
        this.serviceId = serviceId;
        this.version = version;
        this.status = status;
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
