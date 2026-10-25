package org.citizen.scheme.model;

import java.util.Map;

public record OpsSummary(
        long totalFamilies,
        long totalPersons,
        long totalBeneficiaries,
        long totalSchemes,
        Map<String, Long> fraudSignalCount,
        long openGrievances,
        long resolvedGrievances
) {}
