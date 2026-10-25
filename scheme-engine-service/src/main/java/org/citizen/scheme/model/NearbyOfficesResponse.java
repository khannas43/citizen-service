package org.citizen.scheme.model;

import java.util.List;

public record NearbyOfficesResponse(
        List<OfficeNearbyItem> offices,
        boolean widened,
        String widenedDistrict,
        Double mapCenterLat,
        Double mapCenterLng,
        boolean demoData
) {}
