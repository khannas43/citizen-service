package org.citizen.scheme.model;

import org.citizen.scheme.model.content.SchemeContentDocumentItem;
import org.citizen.scheme.model.content.SchemeContentFaqItem;
import org.citizen.scheme.model.content.SchemeContentStepItem;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SchemeContentEditorResponse(
        UUID schemeId,
        String schemeName,
        String department,
        List<SchemeContentDocumentItem> documentsRequired,
        List<SchemeContentStepItem> applicationSteps,
        List<SchemeContentFaqItem> faqs,
        String helplineLabel,
        String helplineNumber,
        String officialUrl,
        String overview,
        String overviewGu,
        String benefitsNote,
        String benefitsNoteGu,
        String eligibilityNote,
        String eligibilityNoteGu,
        SchemeContext scheme,
        LocalDate lastReviewedOn,
        String contentSource,
        Long version,
        String updatedBy,
        LocalDateTime updatedAt
) {
    /** Facts that come from the scheme record and eligibility rules; shown read-only in the editor. */
    public record SchemeContext(
            String description,
            String benefitType,
            String benefitValue,
            List<SchemeBenefitComponentDTO> benefitComponents,
            List<SchemePublicCriterion> eligibility) {}
}
