package org.magicsword.scheme.model;

import java.util.List;
import java.util.Map;

public record SimulateResponse(
    int currentCount,
    int projectedCount,
    int delta,
    List<SimulatedBeneficiary> projectedBeneficiaries,
    List<String> removedNames,
    Map<String, Integer> districtBreakdown,
    Map<String, Map<String, Integer>> talukaBreakdown,
    Map<String, Map<String, Map<String, Integer>>> villageBreakdown,
    Long totalAnnualCost,
    Long currentAnnualCost,
    Long costDelta,
    Map<String, Long> districtBudget,
    Map<String, Map<String, Long>> talukaBudget,
    Map<String, Map<String, Map<String, Long>>> villageBudget,
    Map<String, Integer> casteBreakdown,
    Map<String, Long> casteBudget,
    Map<String, Integer> genderBreakdown,
    Map<String, Long> genderBudget,
    List<YearlyBudget> yearlyProjection,
    String appliedRuleName
) {}
