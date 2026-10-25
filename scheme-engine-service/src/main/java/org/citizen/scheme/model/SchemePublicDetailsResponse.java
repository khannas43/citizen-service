package org.citizen.scheme.model;

import org.citizen.scheme.model.content.SchemeContentDocumentItem;
import org.citizen.scheme.model.content.SchemeContentFaqItem;
import org.citizen.scheme.model.content.SchemeContentStepItem;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record SchemePublicDetailsResponse(
        UUID id,
        String name,
        String nameGujarati,
        String description,
        String department,
        String category,
        String benefitType,
        String benefitValue,
        LocalDate validFrom,
        LocalDate validTo,
        String status,
        List<SchemeBenefitComponentDTO> benefitComponents,
        List<SchemePublicCriterion> eligibility,
        List<SchemeContentDocumentItem> documentsRequired,
        List<SchemeContentStepItem> applicationSteps,
        List<SchemeContentFaqItem> faqs,
        String helplineLabel,
        String helplineNumber,
        String officialUrl,
        LocalDate lastReviewedOn,
        boolean contentIsSample,
        List<SchemeRelatedSummary> relatedSchemes,
        /** Gujarati overview (the English one replaces `description` when an officer wrote it). */
        String overviewGu,
        String benefitsNote,
        String benefitsNoteGu,
        String eligibilityNote,
        String eligibilityNoteGu
) {}
