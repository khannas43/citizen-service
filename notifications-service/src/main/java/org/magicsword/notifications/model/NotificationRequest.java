package org.magicsword.notifications.model;

public record NotificationRequest(
    String aadhaarRef,
    String title,
    String message,
    String serviceName,
    String trackingId
) {}
