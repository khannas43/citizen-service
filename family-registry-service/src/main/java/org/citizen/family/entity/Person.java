package org.citizen.family.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "person")
public class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;
    private java.time.LocalDate dob;
    private String gender;

    @Column(unique = true)
    private String aadhaarRef;

    private String occupation;

    private Long annualIncome = 0L;

    private String casteCategory;

    private Boolean isAlive = true;

    private String mobile;

    private String educationLevel;   // NONE|PRIMARY|SECONDARY|MATRIC|HIGHER_SEC|GRADUATE|POST_GRADUATE
    private String maritalStatus;    // SINGLE|MARRIED|WIDOWED|DIVORCED|SEPARATED
    private String employmentStatus; // EMPLOYED|UNEMPLOYED|SELF_EMPLOYED|STUDENT|HOMEMAKER|RETIRED

    private Boolean onboardingCompleted = true;

    private String examType;        // STD10|STD12|DIPLOMA|NEET_MBBS
    private Double examPercentile;  // percentile for STD10/STD12, percentage for DIPLOMA
    private String courseCategory;  // MEDICAL_DENTAL|ENGINEERING_GROUP|DIPLOMA|ARTS_COMMERCE

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public java.time.LocalDate getDob() { return dob; }
    public void setDob(java.time.LocalDate dob) { this.dob = dob; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getAadhaarRef() { return aadhaarRef; }
    public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }
    public String getOccupation() { return occupation; }
    public void setOccupation(String occupation) { this.occupation = occupation; }
    public Long getAnnualIncome() { return annualIncome; }
    public void setAnnualIncome(Long annualIncome) { this.annualIncome = annualIncome; }
    public String getCasteCategory() { return casteCategory; }
    public void setCasteCategory(String casteCategory) { this.casteCategory = casteCategory; }
    public Boolean getIsAlive() { return isAlive; }
    public void setIsAlive(Boolean isAlive) { this.isAlive = isAlive; }
    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }
    public String getEducationLevel() { return educationLevel; }
    public void setEducationLevel(String educationLevel) { this.educationLevel = educationLevel; }
    public String getMaritalStatus() { return maritalStatus; }
    public void setMaritalStatus(String maritalStatus) { this.maritalStatus = maritalStatus; }
    public String getEmploymentStatus() { return employmentStatus; }
    public void setEmploymentStatus(String employmentStatus) { this.employmentStatus = employmentStatus; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public void setOnboardingCompleted(Boolean onboardingCompleted) { this.onboardingCompleted = onboardingCompleted; }
    public String getExamType() { return examType; }
    public void setExamType(String examType) { this.examType = examType; }
    public Double getExamPercentile() { return examPercentile; }
    public void setExamPercentile(Double examPercentile) { this.examPercentile = examPercentile; }
    public String getCourseCategory() { return courseCategory; }
    public void setCourseCategory(String courseCategory) { this.courseCategory = courseCategory; }
}
