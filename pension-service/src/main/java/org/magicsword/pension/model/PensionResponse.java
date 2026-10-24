package org.magicsword.pension.model;

public record PensionResponse(
        String engineRef,
        String applicationNo,
        String status,
        String currentTask,
        String assignee,
        String candidateGroups,
        String applicantName,
        String pensionType,
        String aadhaarRef,
        String familyIncome,
        String createdAt
) {
    public static PensionResponse started(String processInstanceId,
                                          String applicationNo,
                                          String applicantName,
                                          String pensionType,
                                          String aadhaarRef,
                                          String familyIncome) {
        return new PensionResponse(
                "FLW-" + processInstanceId,
                applicationNo,
                "PENDING",
                "Revenue Officer Verification",
                "revenue-officer",
                null,
                applicantName,
                pensionType,
                aadhaarRef,
                familyIncome,
                java.time.Instant.now().toString()
        );
    }
}
