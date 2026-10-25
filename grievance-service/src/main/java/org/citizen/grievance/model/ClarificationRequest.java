package org.citizen.grievance.model;

public record ClarificationRequest(
        String applicationRef,
        String aadhaarRef,
        String citizenName,
        String serviceName,
        String question
) {}
