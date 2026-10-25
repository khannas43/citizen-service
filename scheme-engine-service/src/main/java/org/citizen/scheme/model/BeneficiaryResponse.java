package org.citizen.scheme.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record BeneficiaryResponse(
        UUID id,
        UUID schemeId,
        String schemeName,
        String familyId,
        String personId,
        String personName,
        String familyVillage,
        String familyDistrict,
        String familyTaluka,
        String status,
        LocalDateTime identifiedAt,
        LocalDateTime confirmedAt,
        LocalDateTime removedAt,
        String removalReason,
        String eligibilityReason,
        String disbursementStatus,
        LocalDateTime disbursedAt,
        String disbursementRef,
        String confirmedBy,
        String overrideBy,
        String overrideReason,
        String casteCategory,
        String gender,
        Long amount,
        Long tuitionAmount,
        Long boardingAmount,
        Long booksAmount
) {}
