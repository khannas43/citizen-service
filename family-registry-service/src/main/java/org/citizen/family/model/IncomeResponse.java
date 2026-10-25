package org.citizen.family.model;

import java.util.List;
import java.util.UUID;

public record IncomeResponse(
        UUID familyId,
        Long totalAnnualIncome,
        List<IncomeMember> breakdown
) {}
