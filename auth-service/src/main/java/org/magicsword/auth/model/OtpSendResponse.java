package org.magicsword.auth.model;

public record OtpSendResponse(boolean success, String maskedMobile, String name) {}
