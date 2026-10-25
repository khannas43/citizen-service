package org.citizen.family.model;

import java.util.UUID;

public record IncomeMember(
        UUID personId,
        String name,
        Long annualIncome,
        String occupation,
        String relationshipToHead
) {}
