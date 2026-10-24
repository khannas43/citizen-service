package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import org.magicsword.expenditure.domain.CaseClassification;
import org.magicsword.expenditure.domain.CaseStatus;
import org.magicsword.expenditure.domain.IntegrityDomain;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "integrity_case")
public class IntegrityCase {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Enumerated(EnumType.STRING)
    private IntegrityDomain domain = IntegrityDomain.BENEFICIARY;
    private String title;
    @Enumerated(EnumType.STRING)
    private CaseStatus status = CaseStatus.OPEN;
    private String assignee;
    @Enumerated(EnumType.STRING)
    private CaseClassification classification;
    private String decisionText;
    private boolean noticeRequired;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();
    /** Set when someone has checked that the fix really holds: the record was corrected or the money came back. */
    private LocalDateTime verifiedAt;
    private String verifiedBy;
    private String verificationNote;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public IntegrityDomain getDomain() { return domain; }
    public void setDomain(IntegrityDomain domain) { this.domain = domain; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public CaseStatus getStatus() { return status; }
    public void setStatus(CaseStatus status) { this.status = status; }
    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }
    public CaseClassification getClassification() { return classification; }
    public void setClassification(CaseClassification classification) { this.classification = classification; }
    public String getDecisionText() { return decisionText; }
    public void setDecisionText(String decisionText) { this.decisionText = decisionText; }
    public boolean isNoticeRequired() { return noticeRequired; }
    public void setNoticeRequired(boolean noticeRequired) { this.noticeRequired = noticeRequired; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public LocalDateTime getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(LocalDateTime verifiedAt) { this.verifiedAt = verifiedAt; }
    public String getVerifiedBy() { return verifiedBy; }
    public void setVerifiedBy(String verifiedBy) { this.verifiedBy = verifiedBy; }
    public String getVerificationNote() { return verificationNote; }
    public void setVerificationNote(String verificationNote) { this.verificationNote = verificationNote; }
}
