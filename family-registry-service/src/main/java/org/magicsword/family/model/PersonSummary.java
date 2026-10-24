package org.magicsword.family.model;

import java.time.LocalDate;
import java.util.UUID;

public record PersonSummary(
        UUID id,
        UUID familyId,
        String name,
        LocalDate dob,
        String gender,
        String occupation,
        Long annualIncome,
        String casteCategory,
        Boolean isAlive,
        String mobile,
        String aadhaarRef,
        String relationshipToHead,
        String educationLevel,
        String maritalStatus,
        String employmentStatus,
        String village,
        String taluka,
        String district,
        Boolean onboardingCompleted,
        String examType,
        Double examPercentile,
        String courseCategory
) {}
