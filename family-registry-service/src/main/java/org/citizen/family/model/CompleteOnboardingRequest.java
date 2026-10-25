package org.citizen.family.model;

public record CompleteOnboardingRequest(
        String occupation,
        Long annualIncome,
        String casteCategory,
        String educationLevel,
        String maritalStatus,
        String employmentStatus
) {}
