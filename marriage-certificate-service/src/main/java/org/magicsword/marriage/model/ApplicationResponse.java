package org.magicsword.marriage.model;

public record ApplicationResponse(
        String engineRef,
        String applicationNo,
        String status,
        String currentTask,
        String assignee,
        String candidateGroups,
        String applicantName,
        String casteCode,
        String tenantId,
        String createdAt,
        String aadhaarRef
) {
    public static ApplicationResponse started(String workflowId,
                                               String applicationNo,
                                               String applicantName,
                                               String spouseName,
                                               String tenantId,
                                               String aadhaarRef) {
        return new ApplicationResponse(
                "DGT-" + workflowId,
                applicationNo,
                "PENDING",
                "Pending Approval",
                null,
                "MARRIAGE_APPROVER",
                applicantName,
                spouseName,
                tenantId,
                java.time.Instant.now().toString(),
                aadhaarRef
        );
    }
}
