package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** One proposed payment, with what the gate found and what an officer decided about it. */
@Entity
@Table(name = "payment_batch_line", indexes = {
        @Index(name = "idx_pbl_batch", columnList = "batch_id, line_no"),
        @Index(name = "idx_pbl_decision", columnList = "decision, verdict")
})
public class PaymentBatchLine {
    public static final String CLEAR = "CLEAR";
    public static final String REVIEW = "REVIEW";
    public static final String HOLD = "HOLD";
    public static final String NO_DECISION = "NONE";
    public static final String HOLD_CONFIRMED = "HOLD_CONFIRMED";
    public static final String RELEASED = "RELEASED";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "batch_id")
    private UUID batchId;
    @Column(name = "line_no")
    private int lineNo;
    private String paymentRef;
    private UUID unitId;
    private String personId;
    private String personName;
    private UUID schemeId;
    private String schemeName;
    private String district;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal amount;
    private String bankToken;
    private String verdict = CLEAR;
    @JdbcTypeCode(SqlTypes.JSON)
    private List<Map<String, Object>> reasons;
    private String decision = NO_DECISION;
    private String decisionReason;
    private String decidedBy;
    private LocalDateTime decidedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getBatchId() { return batchId; }
    public void setBatchId(UUID batchId) { this.batchId = batchId; }
    public int getLineNo() { return lineNo; }
    public void setLineNo(int lineNo) { this.lineNo = lineNo; }
    public String getPaymentRef() { return paymentRef; }
    public void setPaymentRef(String paymentRef) { this.paymentRef = paymentRef; }
    public UUID getUnitId() { return unitId; }
    public void setUnitId(UUID unitId) { this.unitId = unitId; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getSchemeName() { return schemeName; }
    public void setSchemeName(String schemeName) { this.schemeName = schemeName; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getBankToken() { return bankToken; }
    public void setBankToken(String bankToken) { this.bankToken = bankToken; }
    public String getVerdict() { return verdict; }
    public void setVerdict(String verdict) { this.verdict = verdict; }
    public List<Map<String, Object>> getReasons() { return reasons; }
    public void setReasons(List<Map<String, Object>> reasons) { this.reasons = reasons; }
    public String getDecision() { return decision; }
    public void setDecision(String decision) { this.decision = decision; }
    public String getDecisionReason() { return decisionReason; }
    public void setDecisionReason(String decisionReason) { this.decisionReason = decisionReason; }
    public String getDecidedBy() { return decidedBy; }
    public void setDecidedBy(String decidedBy) { this.decidedBy = decidedBy; }
    public LocalDateTime getDecidedAt() { return decidedAt; }
    public void setDecidedAt(LocalDateTime decidedAt) { this.decidedAt = decidedAt; }
}
