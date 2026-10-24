package org.magicsword.scheme.service;

import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.entity.SchemeContent;
import org.magicsword.scheme.model.SchemeBenefitComponentDTO;
import org.magicsword.scheme.model.SchemePublicDetailsResponse;
import org.magicsword.scheme.model.SchemeRelatedSummary;
import org.magicsword.scheme.repository.SchemeBenefitComponentRepository;
import org.magicsword.scheme.repository.SchemeContentRepository;
import org.magicsword.scheme.repository.SchemeRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class SchemePublicDetailsService {

    private final SchemeRepository schemeRepository;
    private final SchemeBenefitComponentRepository benefitComponentRepository;
    private final SchemeContentRepository contentRepository;
    private final SchemeEligibilityCriteriaBuilder criteriaBuilder;

    public SchemePublicDetailsService(
            SchemeRepository schemeRepository,
            SchemeBenefitComponentRepository benefitComponentRepository,
            SchemeContentRepository contentRepository,
            SchemeEligibilityCriteriaBuilder criteriaBuilder) {
        this.schemeRepository = schemeRepository;
        this.benefitComponentRepository = benefitComponentRepository;
        this.contentRepository = contentRepository;
        this.criteriaBuilder = criteriaBuilder;
    }

    public SchemePublicDetailsResponse getPublicDetails(UUID id) {
        Scheme scheme = schemeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + id));
        if (!Boolean.TRUE.equals(scheme.getIsActive())) {
            throw new NoSuchElementException("Scheme not active: " + id);
        }
        List<SchemeBenefitComponentDTO> components = benefitComponentRepository.findBySchemeId(id).stream()
                .map(SchemeBenefitComponentDTO::from)
                .toList();
        SchemeContent content = contentRepository.findById(id).orElse(null);
        boolean sample = content == null || "DEMO_SEED".equalsIgnoreCase(content.getContentSource());
        return new SchemePublicDetailsResponse(
                scheme.getId(),
                scheme.getName(),
                scheme.getNameGujarati(),
                content != null && hasText(content.getOverview()) ? content.getOverview() : scheme.getDescription(),
                scheme.getDepartment(),
                scheme.getCategory(),
                scheme.getBenefitType(),
                scheme.getBenefitValue(),
                scheme.getValidFrom(),
                scheme.getValidTo(),
                deriveStatus(scheme),
                components,
                criteriaBuilder.build(scheme),
                content != null ? content.getDocumentsRequired() : List.of(),
                content != null ? content.getApplicationSteps() : List.of(),
                content != null ? content.getFaqs() : List.of(),
                content != null ? content.getHelplineLabel() : null,
                content != null ? content.getHelplineNumber() : null,
                content != null ? content.getOfficialUrl() : null,
                content != null ? content.getLastReviewedOn() : null,
                sample,
                relatedSchemes(scheme),
                content != null ? blankToNull(content.getOverviewGu()) : null,
                content != null ? blankToNull(content.getBenefitsNote()) : null,
                content != null ? blankToNull(content.getBenefitsNoteGu()) : null,
                content != null ? blankToNull(content.getEligibilityNote()) : null,
                content != null ? blankToNull(content.getEligibilityNoteGu()) : null
        );
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String blankToNull(String s) {
        return hasText(s) ? s.trim() : null;
    }

    List<SchemeRelatedSummary> relatedSchemes(Scheme scheme) {
        LinkedHashSet<UUID> seen = new LinkedHashSet<>();
        List<SchemeRelatedSummary> out = new ArrayList<>();
        UUID exclude = scheme.getId();
        appendRelated(out, seen, schemeRepository.findTop4ByIsActiveTrueAndCategoryIgnoreCaseAndIdNotOrderByNameAsc(
                scheme.getCategory(), exclude), exclude);
        if (out.size() < 4 && scheme.getDepartment() != null) {
            appendRelated(out, seen, schemeRepository.findTop4ByIsActiveTrueAndDepartmentIgnoreCaseAndIdNotOrderByNameAsc(
                    scheme.getDepartment(), exclude), exclude);
        }
        return out.size() > 4 ? out.subList(0, 4) : out;
    }

    private static void appendRelated(
            List<SchemeRelatedSummary> out, LinkedHashSet<UUID> seen, List<Scheme> rows, UUID excludeId) {
        for (Scheme s : rows) {
            if (out.size() >= 4) break;
            if (excludeId != null && excludeId.equals(s.getId())) continue;
            if (!seen.add(s.getId())) continue;
            out.add(new SchemeRelatedSummary(
                    s.getId(), s.getName(), s.getNameGujarati(), s.getDepartment(),
                    s.getBenefitType(), s.getBenefitValue()));
        }
    }

    static String deriveStatus(Scheme scheme) {
        LocalDate today = LocalDate.now();
        if (scheme.getValidFrom() != null && today.isBefore(scheme.getValidFrom())) {
            return "UPCOMING";
        }
        if (scheme.getValidTo() != null && today.isAfter(scheme.getValidTo())) {
            return "ENDED";
        }
        return "ACTIVE";
    }
}
