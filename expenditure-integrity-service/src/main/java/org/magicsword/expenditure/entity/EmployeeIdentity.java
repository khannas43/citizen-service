package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "employee_identity", uniqueConstraints = @UniqueConstraint(name = "uq_employee_code", columnNames = "employee_code"))
public class EmployeeIdentity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String employeeCode;
    private String personName;
    private String ddoCode;
    private String postTitle;
    private String payLevel;
    private String status = "ACTIVE";
    private LocalDate statusSince;
    private String district;
    private String taluka;
    /** The beneficiary person id this employee is known by in the family registry; lets rule 807 compare pay with scheme income limits. */
    private String personId;

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }
    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }
    public String getDdoCode() { return ddoCode; }
    public void setDdoCode(String ddoCode) { this.ddoCode = ddoCode; }
    public String getPostTitle() { return postTitle; }
    public void setPostTitle(String postTitle) { this.postTitle = postTitle; }
    public String getPayLevel() { return payLevel; }
    public void setPayLevel(String payLevel) { this.payLevel = payLevel; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getStatusSince() { return statusSince; }
    public void setStatusSince(LocalDate statusSince) { this.statusSince = statusSince; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
}
