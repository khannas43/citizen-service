package org.citizen.family.model;

import java.time.LocalDate;

public record AddMemberRequest(
        String name,
        LocalDate dob,
        String gender,
        String occupation,
        Long annualIncome,
        String casteCategory,
        String mobile,
        String aadhaarRef,
        String relationshipToHead,
        String examType,
        Double examPercentile,
        String courseCategory
) {}
