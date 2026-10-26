package org.citizen.scheme.model;

import java.util.UUID;

public record SchemeRelatedSummary(
        UUID id,
        String name,
        String nameLocal,
        String department,
        String benefitType,
        String benefitValue
) {}
