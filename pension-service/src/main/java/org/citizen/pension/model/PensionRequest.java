package org.citizen.pension.model;

public record PensionRequest(
        String applicantName,
        String pensionType,
        String aadhaarRef,
        String familyId,
        String tenantId
) {}
