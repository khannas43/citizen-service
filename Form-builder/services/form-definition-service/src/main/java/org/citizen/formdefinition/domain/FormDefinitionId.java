package org.citizen.formdefinition.domain;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Immutable composite primary key: (service_id, version).
 */
@Embeddable
public final class FormDefinitionId implements Serializable {

    private static final long serialVersionUID = 1L;

    @Column(name = "service_id", nullable = false, length = 256)
    private String serviceId;

    @Column(name = "version", nullable = false)
    private Integer version;

    protected FormDefinitionId() {
        // JPA
    }

    public FormDefinitionId(String serviceId, Integer version) {
        this.serviceId = Objects.requireNonNull(serviceId, "serviceId");
        this.version = Objects.requireNonNull(version, "version");
    }

    public String getServiceId() {
        return serviceId;
    }

    public Integer getVersion() {
        return version;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof FormDefinitionId that)) {
            return false;
        }
        return Objects.equals(serviceId, that.serviceId) && Objects.equals(version, that.version);
    }

    @Override
    public int hashCode() {
        return Objects.hash(serviceId, version);
    }

    @Override
    public String toString() {
        return "FormDefinitionId{serviceId='" + serviceId + "', version=" + version + '}';
    }
}
