package org.citizen.scheme.model;

import java.util.List;
import java.util.Map;

public record SchemeDistributionDTO(
        long total,
        Map<String, Long> casteCounts,
        Map<String, Long> districtCounts,
        Map<String, Long> genderCounts,
        List<DistributionGeoRow> talukaRows,
        List<DistributionGeoRow> villageRows
) {}
