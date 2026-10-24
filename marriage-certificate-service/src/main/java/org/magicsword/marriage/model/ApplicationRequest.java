package org.magicsword.marriage.model;

public record ApplicationRequest(
        String applicantName,
        String casteCode,
        String tenantId,
        String aadhaarRef
) {}
