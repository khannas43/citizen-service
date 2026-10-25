package org.citizen.scheme.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "geo_centroid")
public class GeoCentroid {

    @Id
    private String district;

    private double latitude;
    private double longitude;

    @Column(nullable = false)
    private boolean approximate = true;

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public double getLatitude() { return latitude; }
    public void setLatitude(double latitude) { this.latitude = latitude; }
    public double getLongitude() { return longitude; }
    public void setLongitude(double longitude) { this.longitude = longitude; }
    public boolean isApproximate() { return approximate; }
    public void setApproximate(boolean approximate) { this.approximate = approximate; }
}
