package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "beneficiary")
public class Beneficiary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID schemeId;
    private String familyId;
    private String personId;
    private String personName;
    private String familyVillage;
    private String familyDistrict;
    private String familyTaluka;
    private String status;
    private LocalDateTime identifiedAt;
    private LocalDateTime confirmedAt;
    private LocalDateTime removedAt;
    private String removalReason;

    @Column(name = "eligibility_reason", length = 500)
    private String eligibilityReason;

    @Column(name = "disbursement_status")
    private String disbursementStatus;

    @Column(name = "disbursed_at")
    private LocalDateTime disbursedAt;

    @Column(name = "disbursement_ref")
    private String disbursementRef;

    @Column(name = "confirmed_by")
    private String confirmedBy;

    @Column(name = "override_by")
    private String overrideBy;

    @Column(name = "override_reason", length = 500)
    private String overrideReason;

    @Column(name = "caste_category")
    private String casteCategory;

    @Column(name = "gender")
    private String gender;

    @Column(name = "amount")
    private Long amount;

    @Column(name = "tuition_amount")
    private Long tuitionAmount;

    @Column(name = "boarding_amount")
    private Long boardingAmount;

    @Column(name = "books_amount")
    private Long booksAmount;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getFamilyId() { return familyId; }
    public void setFamilyId(String familyId) { this.familyId = familyId; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public String getFamilyVillage() { return familyVillage; }
    public void setFamilyVillage(String familyVillage) { this.familyVillage = familyVillage; }
    public String getFamilyDistrict() { return familyDistrict; }
    public void setFamilyDistrict(String familyDistrict) { this.familyDistrict = familyDistrict; }
    public String getFamilyTaluka() { return familyTaluka; }
    public void setFamilyTaluka(String familyTaluka) { this.familyTaluka = familyTaluka; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getIdentifiedAt() { return identifiedAt; }
    public void setIdentifiedAt(LocalDateTime identifiedAt) { this.identifiedAt = identifiedAt; }
    public LocalDateTime getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(LocalDateTime confirmedAt) { this.confirmedAt = confirmedAt; }
    public LocalDateTime getRemovedAt() { return removedAt; }
    public void setRemovedAt(LocalDateTime removedAt) { this.removedAt = removedAt; }
    public String getRemovalReason() { return removalReason; }
    public void setRemovalReason(String removalReason) { this.removalReason = removalReason; }
    public String getEligibilityReason() { return eligibilityReason; }
    public void setEligibilityReason(String eligibilityReason) { this.eligibilityReason = eligibilityReason; }
    public String getDisbursementStatus() { return disbursementStatus; }
    public void setDisbursementStatus(String disbursementStatus) { this.disbursementStatus = disbursementStatus; }
    public LocalDateTime getDisbursedAt() { return disbursedAt; }
    public void setDisbursedAt(LocalDateTime disbursedAt) { this.disbursedAt = disbursedAt; }
    public String getDisbursementRef() { return disbursementRef; }
    public void setDisbursementRef(String disbursementRef) { this.disbursementRef = disbursementRef; }
    public String getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(String confirmedBy) { this.confirmedBy = confirmedBy; }
    public String getOverrideBy() { return overrideBy; }
    public void setOverrideBy(String overrideBy) { this.overrideBy = overrideBy; }
    public String getOverrideReason() { return overrideReason; }
    public void setOverrideReason(String overrideReason) { this.overrideReason = overrideReason; }
    public String getCasteCategory() { return casteCategory; }
    public void setCasteCategory(String casteCategory) { this.casteCategory = casteCategory; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public Long getAmount() { return amount; }
    public void setAmount(Long amount) { this.amount = amount; }
    public Long getTuitionAmount() { return tuitionAmount; }
    public void setTuitionAmount(Long tuitionAmount) { this.tuitionAmount = tuitionAmount; }
    public Long getBoardingAmount() { return boardingAmount; }
    public void setBoardingAmount(Long boardingAmount) { this.boardingAmount = boardingAmount; }
    public Long getBooksAmount() { return booksAmount; }
    public void setBooksAmount(Long booksAmount) { this.booksAmount = booksAmount; }
}
