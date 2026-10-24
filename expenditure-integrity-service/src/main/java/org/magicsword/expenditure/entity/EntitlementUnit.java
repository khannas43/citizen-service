package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "entitlement_unit", indexes = {
        @Index(name = "idx_eu_person_scheme", columnList = "person_id, scheme_id"),
        @Index(name = "idx_eu_district", columnList = "district"),
        @Index(name = "idx_eu_district_taluka", columnList = "district, taluka")
})
public class EntitlementUnit {

    @PrePersist
    void assignIdIfMissing() {
        if (id == null) id = UUID.randomUUID();
    }

    /** Assigned, not generated: an import may fix the id so that settlements can refer to the unit. */
    @Id
    private UUID id;
    private UUID schemeId;
    private String schemeName;
    private String personId;
    private String personName;
    private String familyId;
    private String district;
    private String taluka;
    private String village;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private BigDecimal authorizedAmount;
    private Long incomeSnapshot;
    private Integer ageSnapshot;
    private String status = "ACTIVE";
    private UUID beneficiaryRef;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getSchemeName() { return schemeName; }
    public void setSchemeName(String schemeName) { this.schemeName = schemeName; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public String getFamilyId() { return familyId; }
    public void setFamilyId(String familyId) { this.familyId = familyId; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }
    public String getVillage() { return village; }
    public void setVillage(String village) { this.village = village; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public BigDecimal getAuthorizedAmount() { return authorizedAmount; }
    public void setAuthorizedAmount(BigDecimal authorizedAmount) { this.authorizedAmount = authorizedAmount; }
    public Long getIncomeSnapshot() { return incomeSnapshot; }
    public void setIncomeSnapshot(Long incomeSnapshot) { this.incomeSnapshot = incomeSnapshot; }
    public Integer getAgeSnapshot() { return ageSnapshot; }
    public void setAgeSnapshot(Integer ageSnapshot) { this.ageSnapshot = ageSnapshot; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public UUID getBeneficiaryRef() { return beneficiaryRef; }
    public void setBeneficiaryRef(UUID beneficiaryRef) { this.beneficiaryRef = beneficiaryRef; }
}
