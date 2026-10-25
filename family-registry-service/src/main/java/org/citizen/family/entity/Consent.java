package org.citizen.family.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "consent")
public class Consent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "aadhaar_ref")
    private String aadhaarRef;

    @Column(name = "department")
    private String department;

    @Column(name = "data_category")
    private String dataCategory;

    @Column(name = "purpose", columnDefinition = "TEXT")
    private String purpose;

    @Column(name = "granted_at")
    private LocalDateTime grantedAt = LocalDateTime.now();

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "status")
    private String status = "ACTIVE";

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getAadhaarRef() { return aadhaarRef; }
    public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getDataCategory() { return dataCategory; }
    public void setDataCategory(String dataCategory) { this.dataCategory = dataCategory; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public LocalDateTime getGrantedAt() { return grantedAt; }
    public void setGrantedAt(LocalDateTime grantedAt) { this.grantedAt = grantedAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
