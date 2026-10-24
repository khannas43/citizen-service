package org.magicsword.schemeapp.model;

public record SchemeApplicationResponse(
        String engineRef,
        String applicationNo,
        String status,
        String currentTask,
        String assignee,
        String candidateGroups,
        String aadhaarRef,
        String schemeId,
        String schemeName,
        String familyId,
        Long declaredIncome,
        Long registryIncome,
        String eligibilityNotes,
        String createdAt
) {
    public static SchemeApplicationResponse started(String processInstanceId,
                                                    String applicationNo,
                                                    String aadhaarRef,
                                                    String schemeId,
                                                    String schemeName,
                                                    String familyId,
                                                    Long declaredIncome,
                                                    Long registryIncome,
                                                    String eligibilityNotes) {
        return new SchemeApplicationResponse(
                "FLW-" + processInstanceId,
                applicationNo,
                "PENDING",
                "Income Verification Officer",
                "income-officer",
                null,
                aadhaarRef,
                schemeId,
                schemeName,
                familyId,
                declaredIncome,
                registryIncome,
                eligibilityNotes,
                java.time.Instant.now().toString()
        );
    }
}
