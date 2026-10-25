package org.citizen.scheme.model;

import java.util.List;

public record GeographicLevelResponse(
        List<GeographicLevelRow> results,
        long totalMatched,
        int limit,
        int offset
) {
    public record GeographicLevelRow(
            String name,
            long beneficiaryCount
    ) {}
}
