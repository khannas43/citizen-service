package org.magicsword.auth.model;

public record OtpVerifyRequest(String aadhaarRef, String otp) {}
