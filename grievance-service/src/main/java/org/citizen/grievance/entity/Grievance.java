package org.citizen.grievance.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "grievance")
public class Grievance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tracking_ref")
    private String trackingRef;

    @Column(name = "aadhaar_ref")
    private String aadhaarRef;

    @Column(name = "citizen_name")
    private String citizenName;

    @Column(name = "complaint_text", columnDefinition = "TEXT")
    private String complaintText;

    @Column(name = "status")
    private String status = "OPEN";

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "officer_notes", columnDefinition = "TEXT")
    private String officerNotes;

    @Column(name = "category")
    private String category = "OTHER";

    @Column(name = "priority")
    private String priority = "NORMAL";

    @Column(name = "grievance_ref")
    private String grievanceRef;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getTrackingRef() { return trackingRef; }
    public void setTrackingRef(String trackingRef) { this.trackingRef = trackingRef; }

    public String getAadhaarRef() { return aadhaarRef; }
    public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }

    public String getCitizenName() { return citizenName; }
    public void setCitizenName(String citizenName) { this.citizenName = citizenName; }

    public String getComplaintText() { return complaintText; }
    public void setComplaintText(String complaintText) { this.complaintText = complaintText; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public String getOfficerNotes() { return officerNotes; }
    public void setOfficerNotes(String officerNotes) { this.officerNotes = officerNotes; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getGrievanceRef() { return grievanceRef; }
    public void setGrievanceRef(String grievanceRef) { this.grievanceRef = grievanceRef; }
}
