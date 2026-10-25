package org.citizen.scheme.model;

public record IdentificationResult(
        int schemesScanned,
        int familiesScanned,
        int newlyIdentified
) {}
