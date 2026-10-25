package org.citizen.scheme.model;

import java.time.LocalDate;

public record SchemeRequest(
        String name,
        String nameGujarati,
        String description,
        String department,
        String benefitType,
        String benefitValue,
        Long incomeCeiling,
        String eligibleCastes,
        Integer minAge,
        Integer maxAge,
        String gender,
        String districtScope,
        LocalDate validFrom,
        LocalDate validTo,
        String createdBy,
        String category,
        Double minPercentile,
        Double diplomaMinPercentage,
        Boolean neetMbbsEligible
) {}
