package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "pension_authorisation", uniqueConstraints = {
        @UniqueConstraint(name = "uq_ppo_id", columnNames = "ppo_id"),
        @UniqueConstraint(name = "uq_pension_employee", columnNames = "employee_code")   // one authorisation per employee: S05 looks it up by employee
})
public class PensionAuthorisation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String ppoId;
    private String employeeCode;
    private BigDecimal monthlyRate;
    private BigDecimal commutationAmount;
    private LocalDate effectiveFrom;
    private String recipientName;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getPpoId() { return ppoId; }
    public void setPpoId(String ppoId) { this.ppoId = ppoId; }
    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }
    public BigDecimal getMonthlyRate() { return monthlyRate; }
    public void setMonthlyRate(BigDecimal monthlyRate) { this.monthlyRate = monthlyRate; }
    public BigDecimal getCommutationAmount() { return commutationAmount; }
    public void setCommutationAmount(BigDecimal commutationAmount) { this.commutationAmount = commutationAmount; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public void setEffectiveFrom(LocalDate effectiveFrom) { this.effectiveFrom = effectiveFrom; }
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String recipientName) { this.recipientName = recipientName; }
}
