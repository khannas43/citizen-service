package org.magicsword.scheme.model;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public class GeographicBreakdownDTO {
    private UUID schemeId;
    private String schemeName;
    private List<DistrictData> districts;

    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getSchemeName() { return schemeName; }
    public void setSchemeName(String schemeName) { this.schemeName = schemeName; }
    public List<DistrictData> getDistricts() { return districts; }
    public void setDistricts(List<DistrictData> districts) { this.districts = districts; }

    public static class DistrictData {
        private String districtName;
        private long totalCitizens;
        private List<TalukaData> talukas;

        public String getDistrictName() { return districtName; }
        public void setDistrictName(String districtName) { this.districtName = districtName; }
        public long getTotalCitizens() { return totalCitizens; }
        public void setTotalCitizens(long totalCitizens) { this.totalCitizens = totalCitizens; }
        public List<TalukaData> getTalukas() { return talukas; }
        public void setTalukas(List<TalukaData> talukas) { this.talukas = talukas; }
    }

    public static class TalukaData {
        private String talukaName;
        private long citizenCount;
        private List<CitizenSummary> citizens;

        public String getTalukaName() { return talukaName; }
        public void setTalukaName(String talukaName) { this.talukaName = talukaName; }
        public long getCitizenCount() { return citizenCount; }
        public void setCitizenCount(long citizenCount) { this.citizenCount = citizenCount; }
        public List<CitizenSummary> getCitizens() { return citizens; }
        public void setCitizens(List<CitizenSummary> citizens) { this.citizens = citizens; }
    }

    public static class CitizenSummary {
        private String personId;
        private String personName;
        private String familyId;
        private String village;
        private String status;
        private LocalDateTime identifiedAt;

        public String getPersonId() { return personId; }
        public void setPersonId(String personId) { this.personId = personId; }
        public String getPersonName() { return personName; }
        public void setPersonName(String personName) { this.personName = personName; }
        public String getFamilyId() { return familyId; }
        public void setFamilyId(String familyId) { this.familyId = familyId; }
        public String getVillage() { return village; }
        public void setVillage(String village) { this.village = village; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public LocalDateTime getIdentifiedAt() { return identifiedAt; }
        public void setIdentifiedAt(LocalDateTime identifiedAt) { this.identifiedAt = identifiedAt; }
    }
}
