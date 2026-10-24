package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "payment_settlement", indexes = {
        @Index(name = "idx_ps_unit", columnList = "unit_id"),
        @Index(name = "idx_ps_bank", columnList = "bank_token")
})
public class PaymentSettlement {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "unit_id")
    private UUID unitId;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal amount;
    private String status = "SETTLED";
    private String bankToken;
    private String transactionRef;
    @Column(name = "reversal_of")
    private UUID reversalOf;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUnitId() { return unitId; }
    public void setUnitId(UUID unitId) { this.unitId = unitId; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getBankToken() { return bankToken; }
    public void setBankToken(String bankToken) { this.bankToken = bankToken; }
    public String getTransactionRef() { return transactionRef; }
    public void setTransactionRef(String transactionRef) { this.transactionRef = transactionRef; }
    public UUID getReversalOf() { return reversalOf; }
    public void setReversalOf(UUID reversalOf) { this.reversalOf = reversalOf; }
}
