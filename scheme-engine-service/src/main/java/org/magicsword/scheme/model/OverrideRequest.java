package org.magicsword.scheme.model;

public record OverrideRequest(
        String status,
        String reason,
        String officerName
) {}
