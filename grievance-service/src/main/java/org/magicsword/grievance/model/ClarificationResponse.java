package org.magicsword.grievance.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record ClarificationResponse(
        UUID id,
        String applicationRef,
        String aadhaarRef,
        String citizenName,
        String serviceName,
        String question,
        String answer,
        String status,
        String direction,
        String officerName,
        String displayRef,
        LocalDateTime askedAt,
        LocalDateTime answeredAt
) {}
