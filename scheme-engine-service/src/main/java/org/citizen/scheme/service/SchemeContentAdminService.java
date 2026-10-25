package org.citizen.scheme.service;

import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.entity.SchemeContent;
import org.citizen.scheme.entity.SchemeContentAudit;
import org.citizen.scheme.model.*;
import org.citizen.scheme.model.content.SchemeContentDocumentItem;
import org.citizen.scheme.model.content.SchemeContentFaqItem;
import org.citizen.scheme.model.content.SchemeContentStepItem;
import org.citizen.scheme.repository.SchemeBenefitComponentRepository;
import org.citizen.scheme.repository.SchemeContentAuditRepository;
import org.citizen.scheme.repository.SchemeContentRepository;
import org.citizen.scheme.repository.SchemeRepository;
import org.citizen.scheme.security.OfficerRoleNormalizer;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SchemeContentAdminService {

    private final SchemeRepository schemeRepository;
    private final SchemeContentRepository contentRepository;
    private final SchemeContentAuditRepository auditRepository;
    private final SchemeContentValidationService validationService;
    private final SchemeBenefitComponentRepository benefitComponentRepository;
    private final SchemeEligibilityCriteriaBuilder criteriaBuilder;

    public SchemeContentAdminService(
            SchemeRepository schemeRepository,
            SchemeContentRepository contentRepository,
            SchemeContentAuditRepository auditRepository,
            SchemeContentValidationService validationService,
            SchemeBenefitComponentRepository benefitComponentRepository,
            SchemeEligibilityCriteriaBuilder criteriaBuilder) {
        this.schemeRepository = schemeRepository;
        this.contentRepository = contentRepository;
        this.auditRepository = auditRepository;
        this.validationService = validationService;
        this.benefitComponentRepository = benefitComponentRepository;
        this.criteriaBuilder = criteriaBuilder;
    }

    public List<SchemeContentListItem> listForEditor() {
        List<Scheme> schemes = schemeRepository.findByIsActiveTrue().stream()
                .sorted(Comparator.comparing(Scheme::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        Set<UUID> ids = schemes.stream().map(Scheme::getId).collect(Collectors.toSet());
        Map<UUID, SchemeContent> contentById = contentRepository.findBySchemeIdIn(ids).stream()
                .collect(Collectors.toMap(SchemeContent::getSchemeId, c -> c));
        List<SchemeContentListItem> out = new ArrayList<>();
        for (Scheme s : schemes) {
            SchemeContent c = contentById.get(s.getId());
            out.add(new SchemeContentListItem(
                    s.getId(),
                    s.getName(),
                    s.getDepartment(),
                    s.getCategory(),
                    c != null,
                    c != null ? c.getContentSource() : null,
                    c != null ? c.getUpdatedBy() : null,
                    c != null ? c.getUpdatedAt() : null));
        }
        return out;
    }

    public Optional<SchemeContentEditorResponse> getForEditor(UUID schemeId) {
        Scheme scheme = schemeRepository.findById(schemeId).orElse(null);
        if (scheme == null || !Boolean.TRUE.equals(scheme.getIsActive())) return Optional.empty();
        SchemeContent content = contentRepository.findById(schemeId).orElse(null);
        if (content == null) {
            content = emptyContent(schemeId);
        }
        return Optional.of(toEditorResponse(scheme, content));
    }

    @Transactional
    public SaveResult save(UUID schemeId, SchemeContentSaveRequest body, Jwt jwt) {
        Scheme scheme = schemeRepository.findById(schemeId).orElse(null);
        if (scheme == null || !Boolean.TRUE.equals(scheme.getIsActive())) {
            return SaveResult.notFound();
        }
        Map<String, String> errors = validationService.validate(
                body.documentsRequired(),
                body.applicationSteps(),
                body.faqs(),
                body.helplineLabel(),
                body.helplineNumber(),
                body.officialUrl(),
                body.overview(),
                body.overviewGu(),
                body.benefitsNote(),
                body.benefitsNoteGu(),
                body.eligibilityNote(),
                body.eligibilityNoteGu());
        if (!errors.isEmpty()) {
            return SaveResult.validation(errors);
        }

        SchemeContent content = contentRepository.findById(schemeId).orElseGet(() -> emptyContent(schemeId));
        long expectedVersion = content.getVersion() != null ? content.getVersion() : 0L;
        long sentVersion = body.version() != null ? body.version() : 0L;
        if (sentVersion != expectedVersion) {
            return SaveResult.conflict();
        }

        List<String> sections = detectSections(content, body);
        String actor = jwt.getClaimAsString("preferred_username");
        if (actor == null || actor.isBlank()) actor = jwt.getSubject();
        String role = OfficerRoleNormalizer.primaryOfficerRole(jwt).orElse("UNKNOWN");

        content.setDocumentsRequired(copyDocs(body.documentsRequired()));
        content.setApplicationSteps(copySteps(body.applicationSteps()));
        content.setFaqs(copyFaqs(body.faqs()));
        content.setOverview(trim(body.overview()));
        content.setOverviewGu(trim(body.overviewGu()));
        content.setBenefitsNote(trim(body.benefitsNote()));
        content.setBenefitsNoteGu(trim(body.benefitsNoteGu()));
        content.setEligibilityNote(trim(body.eligibilityNote()));
        content.setEligibilityNoteGu(trim(body.eligibilityNoteGu()));
        content.setHelplineLabel(trim(body.helplineLabel()));
        content.setHelplineNumber(trim(body.helplineNumber()));
        content.setOfficialUrl(trim(body.officialUrl()));
        content.setLastReviewedOn(LocalDate.now());
        if (!"OFFICER".equals(content.getContentSource())) {
            content.setContentSource("OFFICER");
        }
        content.setUpdatedBy(actor);
        content.setUpdatedAt(LocalDateTime.now());

        try {
            // Flush so @Version is incremented before we build the response; otherwise the client
            // receives the old version and conflicts with its own next save.
            content = contentRepository.saveAndFlush(content);
        } catch (ObjectOptimisticLockingFailureException e) {
            return SaveResult.conflict();
        }

        SchemeContentAudit audit = new SchemeContentAudit();
        audit.setSchemeId(schemeId);
        audit.setActor(actor);
        audit.setRole(role);
        audit.setSectionsChanged(String.join(", ", sections));
        audit.setDetail("Scheme content updated");
        auditRepository.save(audit);

        return SaveResult.ok(toEditorResponse(scheme, content));
    }

    public List<AuditEvent> history(UUID schemeId) {
        return auditRepository.findBySchemeIdOrderByTimestampDesc(schemeId).stream()
                .map(a -> new AuditEvent(
                        a.getTimestamp(),
                        "SCHEME_CONTENT_UPDATE",
                        a.getActor() + " (" + a.getRole() + ")",
                        a.getSectionsChanged() + " — " + a.getDetail()))
                .toList();
    }

    private static SchemeContent emptyContent(UUID schemeId) {
        SchemeContent c = new SchemeContent();
        c.setSchemeId(schemeId);
        c.setContentSource("DEMO_SEED");
        return c;
    }

    private SchemeContentEditorResponse toEditorResponse(Scheme scheme, SchemeContent content) {
        List<SchemeBenefitComponentDTO> components = benefitComponentRepository.findBySchemeId(scheme.getId()).stream()
                .map(SchemeBenefitComponentDTO::from)
                .toList();
        SchemeContentEditorResponse.SchemeContext context = new SchemeContentEditorResponse.SchemeContext(
                scheme.getDescription(),
                scheme.getBenefitType(),
                scheme.getBenefitValue(),
                components,
                criteriaBuilder.build(scheme));
        return new SchemeContentEditorResponse(
                scheme.getId(),
                scheme.getName(),
                scheme.getDepartment(),
                content.getDocumentsRequired(),
                content.getApplicationSteps(),
                content.getFaqs(),
                content.getHelplineLabel(),
                content.getHelplineNumber(),
                content.getOfficialUrl(),
                content.getOverview(),
                content.getOverviewGu(),
                content.getBenefitsNote(),
                content.getBenefitsNoteGu(),
                content.getEligibilityNote(),
                content.getEligibilityNoteGu(),
                context,
                content.getLastReviewedOn(),
                content.getContentSource(),
                content.getVersion(),
                content.getUpdatedBy(),
                content.getUpdatedAt());
    }

    private static List<String> detectSections(SchemeContent before, SchemeContentSaveRequest after) {
        List<String> changed = new ArrayList<>();
        if (!Objects.equals(trim(before.getOverview()), trim(after.overview()))
                || !Objects.equals(trim(before.getOverviewGu()), trim(after.overviewGu()))) {
            changed.add("overview");
        }
        if (!Objects.equals(trim(before.getBenefitsNote()), trim(after.benefitsNote()))
                || !Objects.equals(trim(before.getBenefitsNoteGu()), trim(after.benefitsNoteGu()))) {
            changed.add("benefits");
        }
        if (!Objects.equals(trim(before.getEligibilityNote()), trim(after.eligibilityNote()))
                || !Objects.equals(trim(before.getEligibilityNoteGu()), trim(after.eligibilityNoteGu()))) {
            changed.add("eligibility");
        }
        if (!Objects.equals(before.getDocumentsRequired(), after.documentsRequired())) changed.add("documents");
        if (!Objects.equals(before.getApplicationSteps(), after.applicationSteps())) changed.add("steps");
        if (!Objects.equals(before.getFaqs(), after.faqs())) changed.add("faqs");
        if (!Objects.equals(trim(before.getHelplineLabel()), trim(after.helplineLabel()))
                || !Objects.equals(trim(before.getHelplineNumber()), trim(after.helplineNumber()))
                || !Objects.equals(trim(before.getOfficialUrl()), trim(after.officialUrl()))) {
            changed.add("helpline");
        }
        return changed;
    }

    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static List<SchemeContentDocumentItem> copyDocs(List<SchemeContentDocumentItem> in) {
        return in == null ? List.of() : List.copyOf(in);
    }

    private static List<SchemeContentStepItem> copySteps(List<SchemeContentStepItem> in) {
        return in == null ? List.of() : List.copyOf(in);
    }

    private static List<SchemeContentFaqItem> copyFaqs(List<SchemeContentFaqItem> in) {
        return in == null ? List.of() : List.copyOf(in);
    }

    public sealed interface SaveResult {
        record Ok(SchemeContentEditorResponse body) implements SaveResult {}
        record Validation(Map<String, String> fieldErrors) implements SaveResult {}
        record Conflict() implements SaveResult {}
        record NotFound() implements SaveResult {}

        static SaveResult ok(SchemeContentEditorResponse body) { return new Ok(body); }
        static SaveResult validation(Map<String, String> e) { return new Validation(e); }
        static SaveResult conflict() { return new Conflict(); }
        static SaveResult notFound() { return new NotFound(); }
    }
}
