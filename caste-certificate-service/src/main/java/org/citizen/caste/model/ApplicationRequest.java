package org.citizen.caste.model;

public record ApplicationRequest(
        String applicantName,
        String casteCode,
        String tenantId,
        String aadhaarRef
) {}
