package org.magicsword.grievance.model;

public record GrievanceUpdateRequest(
        String status,
        String officerNotes
) {}
