package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "office_service_link", indexes = {
        @Index(name = "idx_office_link_key", columnList = "serviceKey"),
        @Index(name = "idx_office_link_office", columnList = "officeId")
})
public class OfficeServiceLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID officeId;

    @Column(nullable = false, length = 200)
    private String serviceKey;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getOfficeId() { return officeId; }
    public void setOfficeId(UUID officeId) { this.officeId = officeId; }
    public String getServiceKey() { return serviceKey; }
    public void setServiceKey(String serviceKey) { this.serviceKey = serviceKey; }
}
