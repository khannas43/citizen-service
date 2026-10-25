package org.citizen.auth.model;

public record OtpVerifyRequest(String aadhaarRef, String otp) {}
