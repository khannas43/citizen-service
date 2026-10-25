package org.citizen.grievance.model;

import java.util.List;

public record GrievanceRequest(
        String aadhaarRef,
        String citizenName,
        String trackingRef,
        String complaintText,
        String category,
        String priority,
        List<AttachmentDto> attachments
) {}
