package org.citizen.family.model;

public record SchemeEligibility(
        String schemeName,
        boolean eligible,
        String reason
) {}
