package org.citizen.scheme.model;

import org.citizen.scheme.entity.OfficeType;

import java.util.UUID;

public record OfficeNearbyItem(
        UUID id,
        String name,
        String nameGujarati,
        OfficeType officeType,
        String department,
        String address,
        String district,
        String taluka,
        String village,
        String pincode,
        double latitude,
        double longitude,
        String phone,
        String email,
        String workingHours,
        String weeklyOff,
        Double distanceKm,
        Boolean isOpenNow,
        String dataSource
) {}
