package org.magicsword.scheme.model;

public record SchemePublicCriterion(
        String key,
        String label,
        String labelGu,
        String value,
        String operator,
        String source
) {}
