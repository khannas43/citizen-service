package org.citizen.caste.model;

public record ApplicationResponse(
        String engineRef,
        String applicationNo,
        String status,
        String currentTask,
        String assignee,
        String candidateGroups,
        String aadhaarRef,
        String applicantName,
        String casteCode,
        String tenantId,
        String createdAt
) {
    public static ApplicationResponse started(String processInstanceId,
                                               String applicationNo,
                                               String aadhaarRef,
                                               String applicantName,
                                               String casteCode,
                                               String tenantId) {
        return new ApplicationResponse(
                "FLW-" + processInstanceId,
                applicationNo,
                "PENDING",
                "Data Entry Officer Review",
                "data-entry-officer",
                null,
                aadhaarRef,
                applicantName,
                casteCode,
                tenantId,
                java.time.Instant.now().toString()
        );
    }
}
