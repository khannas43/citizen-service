package org.citizen.expenditure.entity;

import jakarta.persistence.*;
import org.citizen.expenditure.domain.NoticeResponseKind;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "case_notice")
public class CaseNotice {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "case_id", nullable = false)
    private UUID caseId;
    private LocalDateTime issuedAt;
    private String issuedBy;
    private String language;
    private LocalDate responseDueOn;
    private LocalDateTime responseAt;
    @Enumerated(EnumType.STRING)
    private NoticeResponseKind responseKind = NoticeResponseKind.NONE;
    private String responseNote;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getCaseId() { return caseId; }
    public void setCaseId(UUID caseId) { this.caseId = caseId; }
    public LocalDateTime getIssuedAt() { return issuedAt; }
    public void setIssuedAt(LocalDateTime issuedAt) { this.issuedAt = issuedAt; }
    public String getIssuedBy() { return issuedBy; }
    public void setIssuedBy(String issuedBy) { this.issuedBy = issuedBy; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public LocalDate getResponseDueOn() { return responseDueOn; }
    public void setResponseDueOn(LocalDate responseDueOn) { this.responseDueOn = responseDueOn; }
    public LocalDateTime getResponseAt() { return responseAt; }
    public void setResponseAt(LocalDateTime responseAt) { this.responseAt = responseAt; }
    public NoticeResponseKind getResponseKind() { return responseKind; }
    public void setResponseKind(NoticeResponseKind responseKind) { this.responseKind = responseKind; }
    public String getResponseNote() { return responseNote; }
    public void setResponseNote(String responseNote) { this.responseNote = responseNote; }
}
