package org.citizen.scheme.model;

public record OverrideRequest(
        String status,
        String reason,
        String officerName
) {}
