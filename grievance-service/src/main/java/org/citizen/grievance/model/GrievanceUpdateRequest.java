package org.citizen.grievance.model;

public record GrievanceUpdateRequest(
        String status,
        String officerNotes
) {}
