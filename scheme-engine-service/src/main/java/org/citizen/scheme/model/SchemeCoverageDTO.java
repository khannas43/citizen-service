package org.citizen.scheme.model;

import java.util.UUID;

public record SchemeCoverageDTO(
        UUID schemeId,
        String schemeName,
        String schemeNameGujarati,
        String department,
        String benefitType,
        String benefitValue,
        String category,
        long totalEnrolled,
        long activeCount,
        long identifiedCount,
        long removedCount
) {}
