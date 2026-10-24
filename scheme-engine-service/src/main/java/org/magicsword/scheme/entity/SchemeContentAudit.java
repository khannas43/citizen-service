package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "scheme_content_audit", indexes = {
        @Index(name = "idx_scheme_content_audit_scheme", columnList = "scheme_id")
})
public class SchemeContentAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "scheme_id", nullable = false)
    private UUID schemeId;

    private LocalDateTime timestamp = LocalDateTime.now();
    private String actor;
    private String role;
    private String sectionsChanged;
    private String detail;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getSectionsChanged() { return sectionsChanged; }
    public void setSectionsChanged(String sectionsChanged) { this.sectionsChanged = sectionsChanged; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
