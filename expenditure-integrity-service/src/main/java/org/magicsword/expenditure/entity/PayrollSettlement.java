package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "payroll_settlement", indexes = {
        @Index(name = "idx_pay_emp_period", columnList = "employee_code, period_start, period_end"),
        @Index(name = "idx_pay_transaction_ref", columnList = "transaction_ref")
})
public class PayrollSettlement {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String employeeCode;
    private String component;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal grossAmount;
    private BigDecimal netAmount;
    private String ddoCode;
    /** The payment's own reference: what tells a file loaded twice from a payment made twice. */
    private String transactionRef;
    @Column(name = "reversal_of")
    private UUID reversalOf;

    public String getTransactionRef() { return transactionRef; }
    public void setTransactionRef(String transactionRef) { this.transactionRef = transactionRef; }
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }
    public String getComponent() { return component; }
    public void setComponent(String component) { this.component = component; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public BigDecimal getGrossAmount() { return grossAmount; }
    public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }
    public BigDecimal getNetAmount() { return netAmount; }
    public void setNetAmount(BigDecimal netAmount) { this.netAmount = netAmount; }
    public String getDdoCode() { return ddoCode; }
    public void setDdoCode(String ddoCode) { this.ddoCode = ddoCode; }
    public UUID getReversalOf() { return reversalOf; }
    public void setReversalOf(UUID reversalOf) { this.reversalOf = reversalOf; }
}
