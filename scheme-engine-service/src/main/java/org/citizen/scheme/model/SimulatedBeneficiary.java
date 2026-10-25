package org.citizen.scheme.model;

import java.util.List;

public record SimulatedBeneficiary(
    String personName,
    String personId,
    String familyId,
    String district,
    String taluka,
    String village,
    int age,
    long annualIncome,
    String casteCategory,
    String gender,
    List<String> qualifyingCriteria
) {}
