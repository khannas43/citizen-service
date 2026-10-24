package org.magicsword.schemeapp.model;

public record SchemeApplicationRequest(
        String schemeId,
        String schemeName,
        String familyId,
        String aadhaarRef,
        Long declaredIncome,
        String tenantId
) {}
