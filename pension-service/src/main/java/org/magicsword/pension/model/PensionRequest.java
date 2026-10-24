package org.magicsword.pension.model;

public record PensionRequest(
        String applicantName,
        String pensionType,
        String aadhaarRef,
        String familyId,
        String tenantId
) {}
