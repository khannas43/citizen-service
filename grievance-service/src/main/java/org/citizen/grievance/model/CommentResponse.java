package org.citizen.grievance.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record CommentResponse(
        UUID id,
        UUID grievanceId,
        String authorName,
        String authorType,
        String commentText,
        String attachmentName,
        String attachmentType,
        String attachmentData,
        LocalDateTime createdAt
) {}
