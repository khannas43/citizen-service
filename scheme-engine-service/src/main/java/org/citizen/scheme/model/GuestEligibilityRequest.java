package org.citizen.scheme.model;

import java.time.LocalDate;

public record GuestEligibilityRequest(
        LocalDate dob,
        Integer age,
        String gender,
        String casteCategory,
        String district,
        String taluka,
        String village,
        Long annualIncome,
        String educationLevel,
        String maritalStatus,
        String employmentStatus,
        String examType,
        Double examPercentile,
        String courseCategory,
        /** Keys the guest explicitly provided (e.g. maritalStatus, employmentStatus). */
        java.util.List<String> suppliedFields
) {}
