package org.magicsword.scheme.model;

import java.util.List;

public record SimulateParameters(
    Integer minAge,
    Integer maxAge,
    Long maxIncome,
    List<String> eligibleCastes,
    Long benefitAmountPerYear,
    Integer projectionYears,
    Double annualGrowthRate,
    Double annualAttritionRate
) {}
