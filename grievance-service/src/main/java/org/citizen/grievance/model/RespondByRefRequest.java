package org.citizen.grievance.model;

import java.util.UUID;

public record RespondByRefRequest(
        UUID clarificationId,
        String aadhaarRef,
        String applicationRef,
        String displayRef,
        String serviceName,
        String query,
        String officerName,
        String answer
) {}
