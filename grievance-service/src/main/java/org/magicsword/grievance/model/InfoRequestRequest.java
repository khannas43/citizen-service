package org.magicsword.grievance.model;

public record InfoRequestRequest(
        String applicationRef,
        String displayRef,
        String aadhaarRef,
        String serviceName,
        String query,
        String officerName
) {}
