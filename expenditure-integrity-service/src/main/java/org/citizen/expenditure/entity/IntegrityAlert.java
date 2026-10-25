package org.citizen.expenditure.entity;

import jakarta.persistence.*;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "integrity_alert", indexes = {
        @Index(name = "idx_alert_rule_status", columnList = "rule_code, status")
})
public class IntegrityAlert {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Enumerated(EnumType.STRING)
    private IntegrityDomain domain = IntegrityDomain.BENEFICIARY;
    private String ruleCode;
    private String severity;
    private String status = "OPEN";
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> evidence;
    private String personId;
    private String personName;
    private String district;
    private String taluka;
    private UUID schemeId;
    private String schemeName;
    private BigDecimal amountDelta;
    private LocalDateTime detectedAt = LocalDateTime.now();
    @Column(name = "case_id")
    private UUID caseId;

    /** Expected recovery score for open alerts; not persisted. */
    @Transient
    private Long priority;
    @Transient
    private String priorityReason;
    @Transient
    private Boolean priorityEstimated;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public IntegrityDomain getDomain() { return domain; }
    public void setDomain(IntegrityDomain domain) { this.domain = domain; }
    public String getRuleCode() { return ruleCode; }
    public void setRuleCode(String ruleCode) { this.ruleCode = ruleCode; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Map<String, Object> getEvidence() { return evidence; }
    public void setEvidence(Map<String, Object> evidence) { this.evidence = evidence; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getSchemeName() { return schemeName; }
    public void setSchemeName(String schemeName) { this.schemeName = schemeName; }
    public BigDecimal getAmountDelta() { return amountDelta; }
    public void setAmountDelta(BigDecimal amountDelta) { this.amountDelta = amountDelta; }
    public LocalDateTime getDetectedAt() { return detectedAt; }
    public void setDetectedAt(LocalDateTime detectedAt) { this.detectedAt = detectedAt; }
    public UUID getCaseId() { return caseId; }
    public void setCaseId(UUID caseId) { this.caseId = caseId; }
    public Long getPriority() { return priority; }
    public void setPriority(Long priority) { this.priority = priority; }
    public String getPriorityReason() { return priorityReason; }
    public void setPriorityReason(String priorityReason) { this.priorityReason = priorityReason; }
    public Boolean getPriorityEstimated() { return priorityEstimated; }
    public void setPriorityEstimated(Boolean priorityEstimated) { this.priorityEstimated = priorityEstimated; }
}
