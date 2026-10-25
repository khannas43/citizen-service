package org.citizen.familymember.model;

public record FamilyMemberResponse(
        String engineRef,
        String applicationNo,
        String status,
        String currentTask,
        String assignee,
        String candidateGroups,
        String familyId,
        String changeType,
        String personName,
        String reason,
        String createdAt
) {
    public static FamilyMemberResponse started(String processInstanceId,
                                               String applicationNo,
                                               String familyId,
                                               String changeType,
                                               String personName,
                                               String reason) {
        return new FamilyMemberResponse(
                "FLW-" + processInstanceId,
                applicationNo,
                "PENDING",
                "Talati Verification",
                "talati",
                "talati",
                familyId,
                changeType,
                personName,
                reason,
                java.time.Instant.now().toString()
        );
    }
}
