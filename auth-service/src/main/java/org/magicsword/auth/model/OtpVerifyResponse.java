package org.magicsword.auth.model;

public record OtpVerifyResponse(String token, String name, String aadhaarRef, String familyId) {}
