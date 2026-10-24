package org.magicsword.familymember.model;

public record FamilyMemberRequest(
        String familyId,
        String changeType,
        String personName,
        String personId,
        String dob,
        String gender,
        String relationshipToHead,
        String occupation,
        String annualIncome,
        String casteCategory,
        String mobile,
        String reason,
        String tenantId
) {}
