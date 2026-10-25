package org.citizen.scheme.model;

import org.citizen.scheme.entity.Scheme;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SchemeResponse(
        UUID id,
        String name,
        String nameGujarati,
        String description,
        String department,
        String benefitType,
        String benefitValue,
        Long incomeCeiling,
        String eligibleCastes,
        Integer minAge,
        Integer maxAge,
        String gender,
        String districtScope,
        LocalDate validFrom,
        LocalDate validTo,
        Boolean isActive,
        String createdBy,
        LocalDateTime createdAt,
        String category,
        Double minPercentile,
        Double diplomaMinPercentage,
        Boolean neetMbbsEligible,
        List<SchemeBenefitComponentDTO> benefitComponents
) {
    public static SchemeResponse from(Scheme scheme) {
        return from(scheme, List.of());
    }

    public static SchemeResponse from(Scheme scheme, List<SchemeBenefitComponentDTO> benefitComponents) {
        return new SchemeResponse(
                scheme.getId(),
                scheme.getName(),
                scheme.getNameGujarati(),
                scheme.getDescription(),
                scheme.getDepartment(),
                scheme.getBenefitType(),
                scheme.getBenefitValue(),
                scheme.getIncomeCeiling(),
                scheme.getEligibleCastes(),
                scheme.getMinAge(),
                scheme.getMaxAge(),
                scheme.getGender(),
                scheme.getDistrictScope(),
                scheme.getValidFrom(),
                scheme.getValidTo(),
                scheme.getIsActive(),
                scheme.getCreatedBy(),
                scheme.getCreatedAt(),
                scheme.getCategory(),
                scheme.getMinPercentile(),
                scheme.getDiplomaMinPercentage(),
                scheme.getNeetMbbsEligible(),
                benefitComponents
        );
    }
}
