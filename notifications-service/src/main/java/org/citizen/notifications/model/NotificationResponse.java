package org.citizen.notifications.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record NotificationResponse(
    UUID id,
    String aadhaarRef,
    String title,
    String message,
    String serviceName,
    String trackingId,
    Boolean isRead,
    LocalDateTime createdAt
) {}
