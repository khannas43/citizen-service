package org.citizen.auth.model;

public record OtpSendResponse(boolean success, String maskedMobile, String name) {}
