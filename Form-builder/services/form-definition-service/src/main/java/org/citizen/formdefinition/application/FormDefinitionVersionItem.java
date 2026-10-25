package org.citizen.formdefinition.application;

import java.util.Objects;

import org.citizen.formdefinition.domain.FormDefinitionStatus;

/** Detached version-list row projection (FB-C5). No definition/audit/revision payload. */
public final class FormDefinitionVersionItem {

    private final int version;
    private final FormDefinitionStatus status;

    public FormDefinitionVersionItem(int version, FormDefinitionStatus status) {
        if (version < 1) {
            throw new IllegalArgumentException("version must be positive");
        }
        this.version = version;
        this.status = Objects.requireNonNull(status, "status");
    }

    public int version() {
        return version;
    }

    public FormDefinitionStatus status() {
        return status;
    }
}
