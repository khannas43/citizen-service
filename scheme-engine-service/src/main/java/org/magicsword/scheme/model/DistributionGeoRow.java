package org.magicsword.scheme.model;

public record DistributionGeoRow(
        String district,
        String taluka,
        String village,
        long count
) {}
