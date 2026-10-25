package org.citizen.grievance.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record GrievanceResponse(
        UUID id,
        String trackingRef,
        String aadhaarRef,
        String citizenName,
        String complaintText,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String officerNotes,
        String grievanceRef,
        String category,
        String priority
) {}
