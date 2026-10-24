package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "scheme")
public class Scheme {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;
    private String nameGujarati;
    private String description;
    private String department;
    private String benefitType;
    private String benefitValue;
    private Long incomeCeiling;
    private String eligibleCastes;
    private Integer minAge;
    private Integer maxAge;
    private String gender = "ANY";
    private String districtScope;
    private LocalDate validFrom;
    private LocalDate validTo;
    private Boolean isActive = true;
    private String category;
    private String createdBy;
    private LocalDateTime createdAt = LocalDateTime.now();

    private Double minPercentile;         // e.g. 80.0 for STD10/STD12 exam-based schemes
    private Double diplomaMinPercentage;  // e.g. 65.0 for DIPLOMA (D-to-D) students
    private Boolean neetMbbsEligible = false; // NEET-based MBBS admission bypasses percentile check

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getNameGujarati() { return nameGujarati; }
    public void setNameGujarati(String nameGujarati) { this.nameGujarati = nameGujarati; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getBenefitType() { return benefitType; }
    public void setBenefitType(String benefitType) { this.benefitType = benefitType; }
    public String getBenefitValue() { return benefitValue; }
    public void setBenefitValue(String benefitValue) { this.benefitValue = benefitValue; }
    public Long getIncomeCeiling() { return incomeCeiling; }
    public void setIncomeCeiling(Long incomeCeiling) { this.incomeCeiling = incomeCeiling; }
    public String getEligibleCastes() { return eligibleCastes; }
    public void setEligibleCastes(String eligibleCastes) { this.eligibleCastes = eligibleCastes; }
    public Integer getMinAge() { return minAge; }
    public void setMinAge(Integer minAge) { this.minAge = minAge; }
    public Integer getMaxAge() { return maxAge; }
    public void setMaxAge(Integer maxAge) { this.maxAge = maxAge; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getDistrictScope() { return districtScope; }
    public void setDistrictScope(String districtScope) { this.districtScope = districtScope; }
    public LocalDate getValidFrom() { return validFrom; }
    public void setValidFrom(LocalDate validFrom) { this.validFrom = validFrom; }
    public LocalDate getValidTo() { return validTo; }
    public void setValidTo(LocalDate validTo) { this.validTo = validTo; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public Double getMinPercentile() { return minPercentile; }
    public void setMinPercentile(Double minPercentile) { this.minPercentile = minPercentile; }
    public Double getDiplomaMinPercentage() { return diplomaMinPercentage; }
    public void setDiplomaMinPercentage(Double diplomaMinPercentage) { this.diplomaMinPercentage = diplomaMinPercentage; }
    public Boolean getNeetMbbsEligible() { return neetMbbsEligible; }
    public void setNeetMbbsEligible(Boolean neetMbbsEligible) { this.neetMbbsEligible = neetMbbsEligible; }
}
