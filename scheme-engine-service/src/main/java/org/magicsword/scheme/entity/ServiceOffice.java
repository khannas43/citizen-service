package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "service_office", indexes = {
        @Index(name = "idx_office_district_taluka", columnList = "district,taluka"),
        @Index(name = "idx_office_type", columnList = "officeType"),
        @Index(name = "idx_office_lat_lng", columnList = "latitude,longitude")
})
public class ServiceOffice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;
    private String nameGujarati;

    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private OfficeType officeType;

    private String department;
    private String address;
    private String district;
    private String taluka;
    private String village;
    private String pincode;

    private double latitude;
    private double longitude;

    private String phone;
    private String email;
    private String workingHours;
    private String weeklyOff;

    private Boolean isActive = true;
    private String dataSource;
    private LocalDate lastVerifiedOn;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getNameGujarati() { return nameGujarati; }
    public void setNameGujarati(String nameGujarati) { this.nameGujarati = nameGujarati; }
    public OfficeType getOfficeType() { return officeType; }
    public void setOfficeType(OfficeType officeType) { this.officeType = officeType; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }
    public String getVillage() { return village; }
    public void setVillage(String village) { this.village = village; }
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
    public double getLatitude() { return latitude; }
    public void setLatitude(double latitude) { this.latitude = latitude; }
    public double getLongitude() { return longitude; }
    public void setLongitude(double longitude) { this.longitude = longitude; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getWorkingHours() { return workingHours; }
    public void setWorkingHours(String workingHours) { this.workingHours = workingHours; }
    public String getWeeklyOff() { return weeklyOff; }
    public void setWeeklyOff(String weeklyOff) { this.weeklyOff = weeklyOff; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public String getDataSource() { return dataSource; }
    public void setDataSource(String dataSource) { this.dataSource = dataSource; }
    public LocalDate getLastVerifiedOn() { return lastVerifiedOn; }
    public void setLastVerifiedOn(LocalDate lastVerifiedOn) { this.lastVerifiedOn = lastVerifiedOn; }
}
