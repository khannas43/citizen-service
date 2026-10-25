package org.citizen.scheme.model;

public record DistributionGeoRow(
        String district,
        String taluka,
        String village,
        long count
) {}
