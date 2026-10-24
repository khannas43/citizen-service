package org.magicsword.auth.model;

public record TokenVerifyResponse(
        boolean valid,
        String role,
        String aadhaarRef,
        String name,
        String familyId
) {}
