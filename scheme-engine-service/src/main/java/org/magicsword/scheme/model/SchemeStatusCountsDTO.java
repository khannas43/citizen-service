package org.magicsword.scheme.model;

public record SchemeStatusCountsDTO(
        long identified,
        long confirmed,
        long active,
        long removed,
        long total,
        long disbursable
) {}
