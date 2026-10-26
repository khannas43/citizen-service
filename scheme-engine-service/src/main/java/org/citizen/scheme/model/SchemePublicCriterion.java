package org.citizen.scheme.model;

public record SchemePublicCriterion(
        String key,
        String label,
        String labelLocal,
        String value,
        String operator,
        String source
) {}
