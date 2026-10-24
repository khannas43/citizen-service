package org.magicsword.scheme.model;

public record IdentificationResult(
        int schemesScanned,
        int familiesScanned,
        int newlyIdentified
) {}
