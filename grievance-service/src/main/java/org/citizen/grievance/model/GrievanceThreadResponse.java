package org.citizen.grievance.model;

import java.util.List;

public record GrievanceThreadResponse(
        GrievanceResponse grievance,
        List<AttachmentDto> attachments,
        List<CommentResponse> comments
) {}
