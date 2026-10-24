package org.magicsword.scheme.model;

import java.time.LocalDate;
import java.util.List;

public class FamilyData {
    private List<MemberData> members;
    private Long totalAnnualIncome;
    private String village;
    private String district;
    private String taluka;

    public List<MemberData> getMembers() { return members; }
    public void setMembers(List<MemberData> members) { this.members = members; }
    public Long getTotalAnnualIncome() { return totalAnnualIncome; }
    public void setTotalAnnualIncome(Long totalAnnualIncome) { this.totalAnnualIncome = totalAnnualIncome; }
    public String getVillage() { return village; }
    public void setVillage(String village) { this.village = village; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }

    public static class MemberData {
        private String personId;
        private String name;
        private String casteCategory;
        private String occupation;
        private Long annualIncome;
        private Boolean isAlive;
        private LocalDate dob;
        private String gender;
        private String relationshipToHead;
        private String aadhaarRef;

        private String educationLevel;
        private String maritalStatus;
        private String employmentStatus;

        private String examType;
        private Double examPercentile;
        private String courseCategory;

        public String getPersonId() { return personId; }
        public void setPersonId(String personId) { this.personId = personId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getCasteCategory() { return casteCategory; }
        public void setCasteCategory(String casteCategory) { this.casteCategory = casteCategory; }
        public String getOccupation() { return occupation; }
        public void setOccupation(String occupation) { this.occupation = occupation; }
        public Long getAnnualIncome() { return annualIncome; }
        public void setAnnualIncome(Long annualIncome) { this.annualIncome = annualIncome; }
        public Boolean getIsAlive() { return isAlive; }
        public void setIsAlive(Boolean isAlive) { this.isAlive = isAlive; }
        public LocalDate getDob() { return dob; }
        public void setDob(LocalDate dob) { this.dob = dob; }
        public String getGender() { return gender; }
        public void setGender(String gender) { this.gender = gender; }
        public String getRelationshipToHead() { return relationshipToHead; }
        public void setRelationshipToHead(String relationshipToHead) { this.relationshipToHead = relationshipToHead; }
        public String getAadhaarRef() { return aadhaarRef; }
        public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }
        public String getEducationLevel() { return educationLevel; }
        public void setEducationLevel(String educationLevel) { this.educationLevel = educationLevel; }
        public String getMaritalStatus() { return maritalStatus; }
        public void setMaritalStatus(String maritalStatus) { this.maritalStatus = maritalStatus; }
        public String getEmploymentStatus() { return employmentStatus; }
        public void setEmploymentStatus(String employmentStatus) { this.employmentStatus = employmentStatus; }
        public String getExamType() { return examType; }
        public void setExamType(String examType) { this.examType = examType; }
        public Double getExamPercentile() { return examPercentile; }
        public void setExamPercentile(Double examPercentile) { this.examPercentile = examPercentile; }
        public String getCourseCategory() { return courseCategory; }
        public void setCourseCategory(String courseCategory) { this.courseCategory = courseCategory; }
    }
}
