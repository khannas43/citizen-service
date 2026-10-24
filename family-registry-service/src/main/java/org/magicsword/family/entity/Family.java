package org.magicsword.family.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "family")
public class Family {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String address;
    private String village;
    private String taluka;
    private String district;
    private String state = "Gujarat";
    private String rationCardNumber;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getRationCardNumber() { return rationCardNumber; }
    public void setRationCardNumber(String rationCardNumber) { this.rationCardNumber = rationCardNumber; }
    public String getVillage() { return village; }
    public void setVillage(String village) { this.village = village; }
    public String getTaluka() { return taluka; }
    public void setTaluka(String taluka) { this.taluka = taluka; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
}
