package org.citizen.scheme.service;

import org.citizen.scheme.entity.Beneficiary;
import org.citizen.scheme.entity.CustomRule;
import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.entity.SchemeBenefitComponent;
import org.citizen.scheme.event.FamilyRegistryEvent;
import org.citizen.scheme.model.*;
import org.citizen.scheme.repository.BeneficiaryDashboardQuery;
import org.citizen.scheme.repository.BeneficiaryRepository;
import org.citizen.scheme.repository.CustomRuleRepository;
import org.citizen.scheme.repository.SchemeBenefitComponentRepository;
import org.citizen.scheme.repository.SchemeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class SchemeEngineService {

    private static final Logger log = LoggerFactory.getLogger(SchemeEngineService.class);
    private static final String NOTIFICATIONS_URL =
            "http://notifications-service.citizen.svc.cluster.local:8080/notifications-service/v1/notifications";
    private static final List<String> ENROLLED_STATUSES = List.of("IDENTIFIED", "CONFIRMED", "ACTIVE");
    private static final List<String> ACTIVE_STATUSES = List.of("ACTIVE", "CONFIRMED");
    private static final String DEMO_SCHEME_NAME = "Ayushman Gujarat";

    private static int demoSchemeRank(String name) {
        return DEMO_SCHEME_NAME.equals(name) ? 0 : 1;
    }
    /** Demo hero families — fraud scan is limited here so 79k+ IDENTIFIED rows stay performant. */
    private static final Set<String> HERO_FAMILY_IDS = Set.of(
            "a1000000-0000-0000-0000-000000000001",
            "a2000000-0000-0000-0000-000000000002",
            "a3000000-0000-0000-0000-000000000003",
            "a4000000-0000-0000-0000-000000000004",
            "a5000000-0000-0000-0000-000000000005"
    );
    private static final int FRAUD_SIGNAL_CAP = 100;
    private static final int IDENTIFICATION_BATCH_SIZE = 500;

    private final SchemeRepository schemeRepository;
    private final BeneficiaryRepository beneficiaryRepository;
    private final BeneficiaryDashboardQuery beneficiaryDashboardQuery;
    private final WebClient webClient;
    private final RestTemplate restTemplate;
    private final TransactionTemplate transactionTemplate;
    private final String familyRegistryBaseUrl;
    private final RuleEvaluatorService ruleEvaluatorService;
    private final CustomRuleRepository customRuleRepository;
    private final SchemeBenefitComponentRepository schemeBenefitComponentRepository;
    private final GuestEligibilityEvaluator guestEligibilityEvaluator;

    @Value("${simulation.max-families:500}")
    private int simulationMaxFamilies;

    public SchemeEngineService(SchemeRepository schemeRepository,
                               BeneficiaryRepository beneficiaryRepository,
                               BeneficiaryDashboardQuery beneficiaryDashboardQuery,
                               WebClient.Builder webClientBuilder,
                               RestTemplate restTemplate,
                               TransactionTemplate transactionTemplate,
                               @Value("${family.registry.base-url}") String familyRegistryBaseUrl,
                               RuleEvaluatorService ruleEvaluatorService,
                               CustomRuleRepository customRuleRepository,
                               SchemeBenefitComponentRepository schemeBenefitComponentRepository,
                               GuestEligibilityEvaluator guestEligibilityEvaluator) {
        this.schemeRepository = schemeRepository;
        this.beneficiaryRepository = beneficiaryRepository;
        this.beneficiaryDashboardQuery = beneficiaryDashboardQuery;
        this.webClient = webClientBuilder.build();
        this.restTemplate = restTemplate;
        this.transactionTemplate = transactionTemplate;
        this.familyRegistryBaseUrl = familyRegistryBaseUrl;
        this.ruleEvaluatorService = ruleEvaluatorService;
        this.customRuleRepository = customRuleRepository;
        this.schemeBenefitComponentRepository = schemeBenefitComponentRepository;
        this.guestEligibilityEvaluator = guestEligibilityEvaluator;
    }

    @Transactional
    public SchemeResponse createScheme(SchemeRequest req) {
        Scheme scheme = new Scheme();
        applyRequest(scheme, req);
        scheme.setCreatedAt(LocalDateTime.now());
        return SchemeResponse.from(schemeRepository.save(scheme));
    }

    @Transactional
    public SchemeResponse updateScheme(UUID id, SchemeRequest req) {
        Scheme scheme = schemeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + id));
        applyRequest(scheme, req);
        return SchemeResponse.from(schemeRepository.save(scheme), benefitComponentsFor(scheme.getId()));
    }

    public List<SchemeResponse> listSchemes() {
        return schemeRepository.findByIsActiveTrue().stream()
                .sorted(Comparator.comparingInt((Scheme s) -> demoSchemeRank(s.getName()))
                        .thenComparing(s -> s.getName() == null ? "" : s.getName(), String.CASE_INSENSITIVE_ORDER))
                .map(scheme -> SchemeResponse.from(scheme, benefitComponentsFor(scheme.getId())))
                .toList();
    }

    /**
     * Guest (no login) eligibility scan — builds a synthetic one-member family and reuses
     * the same scheme rules as identification and logged-in recommendations.
     */
    public GuestEligibilityResponse checkGuestEligibility(GuestEligibilityRequest req) {
        FamilyData family = familyFromGuestRequest(req);
        Set<String> suppliedFields = resolveSuppliedFields(req);
        List<Scheme> schemes = schemeRepository.findByIsActiveTrue();
        List<GuestEligibilityMatch> matches = new ArrayList<>();
        int likelyCount = 0;
        int possibleCount = 0;
        int notEligibleCount = 0;
        for (Scheme scheme : schemes) {
            GuestRuleEvaluationResult eval = guestEligibilityEvaluator.evaluateScheme(scheme, family, suppliedFields);
            GuestEligibilityOutcome outcome = eval.getOutcome();
            switch (outcome) {
                case LIKELY_ELIGIBLE -> likelyCount++;
                case POSSIBLE -> possibleCount++;
                case NOT_ELIGIBLE -> notEligibleCount++;
            }
            List<GuestReasonLine> reasonLines = eval.getReasons();
            List<String> legacyLines = reasonLines.stream().map(GuestReasonLine::text).toList();
            matches.add(new GuestEligibilityMatch(
                    scheme.getId(),
                    scheme.getName(),
                    scheme.getNameGujarati(),
                    scheme.getDepartment(),
                    scheme.getCategory(),
                    outcome == GuestEligibilityOutcome.LIKELY_ELIGIBLE,
                    outcome,
                    new ArrayList<>(eval.getMissingFields()),
                    reasonLines,
                    legacyLines
            ));
        }
        matches.sort(Comparator
                .comparingInt((GuestEligibilityMatch m) -> outcomeRank(m.outcome()))
                .thenComparingInt(m -> demoSchemeRank(m.schemeName()))
                .thenComparing(m -> m.schemeName() == null ? "" : m.schemeName(), String.CASE_INSENSITIVE_ORDER));

        String disclaimer =
                "Indicative eligibility only. Login with Aadhaar to confirm against your family registry record before applying.";
        return new GuestEligibilityResponse(
                schemes.size(),
                likelyCount,
                likelyCount,
                possibleCount,
                notEligibleCount,
                matches,
                disclaimer
        );
    }

    private static int outcomeRank(GuestEligibilityOutcome outcome) {
        return switch (outcome) {
            case LIKELY_ELIGIBLE -> 0;
            case POSSIBLE -> 1;
            case NOT_ELIGIBLE -> 2;
        };
    }

    private Set<String> resolveSuppliedFields(GuestEligibilityRequest req) {
        Set<String> fields = new LinkedHashSet<>();
        if (req.suppliedFields() != null) {
            req.suppliedFields().stream()
                    .filter(s -> s != null && !s.isBlank())
                    .forEach(fields::add);
        }
        fields.add("gender");
        fields.add("casteCategory");
        fields.add("district");
        fields.add("dob");
        if (req.annualIncome() != null) {
            fields.add("annualIncome");
        }
        if (req.taluka() != null && !req.taluka().isBlank()) {
            fields.add("taluka");
        }
        if (req.village() != null && !req.village().isBlank()) {
            fields.add("village");
        }
        return fields;
    }

    private FamilyData familyFromGuestRequest(GuestEligibilityRequest req) {
        if (req.casteCategory() == null || req.casteCategory().isBlank()) {
            throw new IllegalArgumentException("Caste category is required");
        }
        if (req.district() == null || req.district().isBlank()) {
            throw new IllegalArgumentException("District is required");
        }
        if (req.gender() == null || req.gender().isBlank()) {
            throw new IllegalArgumentException("Gender is required");
        }
        LocalDate dob = req.dob();
        if (dob == null) {
            if (req.age() == null || req.age() < 0 || req.age() > 120) {
                throw new IllegalArgumentException("Date of birth or age is required");
            }
            dob = LocalDate.now().minusYears(req.age()).withMonth(1).withDayOfMonth(1);
        }

        FamilyData.MemberData head = new FamilyData.MemberData();
        head.setPersonId("guest");
        head.setName("Guest");
        head.setRelationshipToHead("HEAD");
        head.setIsAlive(true);
        head.setDob(dob);
        head.setGender(normalizeGuestGender(req.gender()));
        head.setCasteCategory(req.casteCategory().trim().toUpperCase());
        head.setEducationLevel(req.educationLevel());
        head.setMaritalStatus(req.maritalStatus());
        head.setEmploymentStatus(req.employmentStatus());
        if (req.examType() != null && !req.examType().isBlank()) {
            head.setExamType(req.examType());
            head.setExamPercentile(req.examPercentile());
            head.setCourseCategory(req.courseCategory());
        }

        long income = req.annualIncome() != null ? req.annualIncome() : 0L;
        head.setAnnualIncome(income);

        FamilyData family = new FamilyData();
        family.setMembers(List.of(head));
        family.setDistrict(req.district().trim());
        family.setTaluka(req.taluka());
        family.setVillage(req.village());
        family.setTotalAnnualIncome(income);
        return family;
    }

    private String normalizeGuestGender(String gender) {
        String g = gender.trim().toUpperCase();
        if (g.startsWith("F") || "FEMALE".equals(g)) {
            return "F";
        }
        if (g.startsWith("M") || "MALE".equals(g)) {
            return "M";
        }
        return "O";
    }

    private List<String> splitPipeReasons(String pipeDelimited) {
        if (pipeDelimited == null || pipeDelimited.isBlank()) {
            return List.of();
        }
        return Arrays.stream(pipeDelimited.split("\\|"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private String guestIneligibleHint(Scheme scheme, FamilyData family) {
        if (isStudentScheme(scheme)) {
            boolean hasExam = family.getMembers().stream()
                    .anyMatch(m -> m.getExamType() != null && !m.getExamType().isBlank());
            if (!hasExam) {
                return "Scholarship schemes need exam details (type, percentile, course)";
            }
            return "Exam or income criteria not met for this scholarship";
        }
        FamilyData.MemberData head = findHead(family);
        if (scheme.getDistrictScope() != null && !scheme.getDistrictScope().isBlank()
                && !isStateWideDistrictScope(scheme.getDistrictScope().trim())
                && (family.getDistrict() == null
                || !scheme.getDistrictScope().equalsIgnoreCase(family.getDistrict()))) {
            return "Scheme limited to " + scheme.getDistrictScope();
        }
        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            if (income > scheme.getIncomeCeiling()) {
                return "Family income above scheme ceiling (" + formatLakh(scheme.getIncomeCeiling()) + ")";
            }
        }
        if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank() && head != null) {
            Set<String> allowed = Arrays.stream(scheme.getEligibleCastes().split(","))
                    .map(s -> s.trim().toUpperCase())
                    .collect(Collectors.toSet());
            if (head.getCasteCategory() == null
                    || !allowed.contains(head.getCasteCategory().trim().toUpperCase())) {
                return "Caste category not in eligible list for this scheme";
            }
        }
        if (scheme.getGender() != null && !"ANY".equalsIgnoreCase(scheme.getGender()) && head != null) {
            if (head.getGender() == null
                    || !normalizeGender(scheme.getGender()).equals(normalizeGender(head.getGender()))) {
                return "Gender criteria not met for this scheme";
            }
        }
        if (scheme.getMinAge() != null || scheme.getMaxAge() != null) {
            return "Age outside published limits for this scheme";
        }
        return "Does not match published criteria";
    }

    public SchemeResponse getScheme(UUID id) {
        Scheme scheme = schemeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + id));
        return SchemeResponse.from(scheme, benefitComponentsFor(scheme.getId()));
    }

    private List<SchemeBenefitComponentDTO> benefitComponentsFor(UUID schemeId) {
        return schemeBenefitComponentRepository.findBySchemeId(schemeId).stream()
                .map(SchemeBenefitComponentDTO::from)
                .toList();
    }

    @Transactional
    public SchemeResponse deactivateScheme(UUID id) {
        Scheme scheme = schemeRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + id));
        scheme.setIsActive(false);
        return SchemeResponse.from(schemeRepository.save(scheme));
    }

    public List<BeneficiaryResponse> getBeneficiaries(UUID schemeId) {
        Scheme scheme = schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));
        return beneficiaryRepository.findBySchemeId(schemeId).stream()
                .map(b -> toBeneficiaryResponse(b, scheme.getName()))
                .toList();
    }

    public BeneficiaryDashboardSummary getBeneficiaryDashboardSummary() {
        long identified = 0;
        long confirmed = 0;
        long active = 0;
        long removed = 0;

        for (Object[] row : beneficiaryRepository.countGroupedByStatus()) {
            String status = row[0] != null ? row[0].toString() : "";
            long count = row[1] instanceof Number n ? n.longValue() : Long.parseLong(row[1].toString());
            switch (status) {
                case "IDENTIFIED" -> identified = count;
                case "CONFIRMED" -> confirmed = count;
                case "ACTIVE" -> active = count;
                case "REMOVED" -> removed = count;
                default -> { }
            }
        }

        long activeTotal = confirmed + active;
        long autoRemoved = beneficiaryRepository.countAutoRemoved();
        long total = identified + confirmed + active + removed;
        return new BeneficiaryDashboardSummary(activeTotal, identified, identified, autoRemoved, total);
    }

    public BeneficiaryListResponse listBeneficiariesDashboard(
            UUID schemeId,
            String status,
            String search,
            String district,
            String taluka,
            String village,
            boolean autoRemovalsOnly,
            String sortBy,
            String sortDir,
            int offset,
            int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        int safeOffset = Math.max(offset, 0);

        var searchResult = beneficiaryDashboardQuery.search(
                schemeId,
                status,
                search,
                district,
                taluka,
                village,
                autoRemovalsOnly,
                sortBy,
                sortDir,
                safeOffset,
                safeLimit);

        Set<UUID> schemeIds = searchResult.rows().stream()
                .map(Beneficiary::getSchemeId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> schemeNames = schemeRepository.findAllById(schemeIds).stream()
                .collect(Collectors.toMap(Scheme::getId, Scheme::getName, (a, b) -> a));

        List<BeneficiaryResponse> results = searchResult.rows().stream()
                .map(b -> toBeneficiaryResponse(b, schemeNames.get(b.getSchemeId())))
                .toList();

        return new BeneficiaryListResponse(
                results,
                searchResult.total(),
                safeLimit,
                safeOffset);
    }

    public BeneficiaryGeoOptions getBeneficiaryGeoOptions(UUID schemeId, String district, String taluka) {
        String districtParam = district != null ? district.trim() : "";
        String talukaParam = taluka != null ? taluka.trim() : "";
        return new BeneficiaryGeoOptions(
                beneficiaryDashboardQuery.distinctDistricts(schemeId),
                districtParam.isEmpty()
                        ? List.of()
                        : beneficiaryDashboardQuery.distinctTalukas(schemeId, districtParam),
                districtParam.isEmpty() || talukaParam.isEmpty()
                        ? List.of()
                        : beneficiaryDashboardQuery.distinctVillages(schemeId, districtParam, talukaParam));
    }

    private static final int BULK_ACTION_MAX = 100;

    public BulkActionResult bulkConfirmBeneficiaries(BulkConfirmRequest req) {
        List<UUID> ids = sanitizeBulkIds(req.ids());
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        for (UUID id : ids) {
            try {
                Beneficiary b = beneficiaryRepository.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Not found"));
                if (!"IDENTIFIED".equals(b.getStatus())) {
                    skipped++;
                    continue;
                }
                confirmBeneficiary(id, req.officerName());
                succeeded++;
            } catch (Exception e) {
                failed++;
                appendBulkError(errors, id, e);
            }
        }
        return new BulkActionResult(ids.size(), succeeded, failed, skipped, errors);
    }

    public BulkActionResult bulkRemoveBeneficiaries(BulkRemoveRequest req) {
        if (req.reason() == null || req.reason().isBlank()) {
            throw new IllegalArgumentException("Reason is required");
        }
        List<UUID> ids = sanitizeBulkIds(req.ids());
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        for (UUID id : ids) {
            try {
                Beneficiary b = beneficiaryRepository.findById(id)
                        .orElseThrow(() -> new NoSuchElementException("Not found"));
                if ("REMOVED".equals(b.getStatus())) {
                    skipped++;
                    continue;
                }
                removeBeneficiary(id, req.reason().trim());
                succeeded++;
            } catch (Exception e) {
                failed++;
                appendBulkError(errors, id, e);
            }
        }
        return new BulkActionResult(ids.size(), succeeded, failed, skipped, errors);
    }

    public BulkActionResult bulkOverrideBeneficiaries(BulkOverrideRequest req) {
        if (!"CONFIRMED".equals(req.status()) && !"REMOVED".equals(req.status())) {
            throw new IllegalArgumentException("Status must be CONFIRMED or REMOVED");
        }
        if (req.reason() == null || req.reason().trim().length() < 10) {
            throw new IllegalArgumentException("Reason must be at least 10 characters");
        }
        OverrideRequest single = new OverrideRequest(req.status(), req.reason(), req.officerName());
        List<UUID> ids = sanitizeBulkIds(req.ids());
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        for (UUID id : ids) {
            try {
                if (!beneficiaryRepository.existsById(id)) {
                    throw new NoSuchElementException("Not found");
                }
                overrideBeneficiary(id, single);
                succeeded++;
            } catch (Exception e) {
                failed++;
                appendBulkError(errors, id, e);
            }
        }
        return new BulkActionResult(ids.size(), succeeded, failed, skipped, errors);
    }

    private List<UUID> sanitizeBulkIds(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("At least one beneficiary id is required");
        }
        return ids.stream().filter(Objects::nonNull).distinct().limit(BULK_ACTION_MAX).toList();
    }

    private void appendBulkError(List<String> errors, UUID id, Exception e) {
        if (errors.size() >= 10) {
            return;
        }
        String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        errors.add(id + ": " + msg);
    }

    public SchemeStatusCountsDTO getStatusCounts(UUID schemeId, String district) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        long identified = 0;
        long confirmed = 0;
        long active = 0;
        long removed = 0;

        for (Object[] row : beneficiaryRepository.countByStatusForScheme(schemeId, district)) {
            String status = row[0] != null ? row[0].toString() : "";
            long count = row[1] instanceof Number n ? n.longValue() : Long.parseLong(row[1].toString());
            switch (status) {
                case "IDENTIFIED" -> identified = count;
                case "CONFIRMED" -> confirmed = count;
                case "ACTIVE" -> active = count;
                case "REMOVED" -> removed = count;
                default -> { }
            }
        }

        long disbursable = beneficiaryRepository.countDisbursableByScheme(schemeId, district);
        long total = identified + confirmed + active + removed;
        return new SchemeStatusCountsDTO(identified, confirmed, active, removed, total, disbursable);
    }

    public List<BeneficiaryResponse> getBeneficiariesByFamily(String familyId) {
        return beneficiaryRepository
                .findByFamilyIdAndStatusIn(familyId, ENROLLED_STATUSES)
                .stream()
                .map(b -> {
                    Scheme scheme = schemeRepository.findById(b.getSchemeId()).orElse(null);
                    String schemeName = scheme != null ? scheme.getName() : null;
                    return toBeneficiaryResponse(b, schemeName);
                })
                .sorted(Comparator.comparingInt((BeneficiaryResponse b) -> demoSchemeRank(b.schemeName())))
                .toList();
    }

    @Transactional
    public BeneficiaryResponse confirmBeneficiary(UUID beneficiaryId) {
        return confirmBeneficiary(beneficiaryId, null);
    }

    @Transactional
    public BeneficiaryResponse confirmBeneficiary(UUID beneficiaryId, String officerName) {
        Beneficiary beneficiary = beneficiaryRepository.findById(beneficiaryId)
                .orElseThrow(() -> new NoSuchElementException("Beneficiary not found: " + beneficiaryId));
        beneficiary.setStatus("CONFIRMED");
        beneficiary.setConfirmedAt(LocalDateTime.now());
        if (officerName != null && !officerName.isBlank()) {
            beneficiary.setConfirmedBy(officerName);
        }
        beneficiary = beneficiaryRepository.save(beneficiary);
        Scheme scheme = schemeRepository.findById(beneficiary.getSchemeId()).orElse(null);
        String schemeName = scheme != null ? scheme.getName() : null;
        return toBeneficiaryResponse(beneficiary, schemeName);
    }

    /**
     * Promote (or create) a beneficiary when a scheme application is fully approved.
     * Citizen "currently availing" only shows CONFIRMED/ACTIVE rows.
     */
    @Transactional
    public BeneficiaryResponse confirmFromApprovedApplication(ConfirmApplicationRequest req) {
        if (req == null || req.schemeId() == null || req.familyId() == null || req.familyId().isBlank()) {
            throw new IllegalArgumentException("schemeId and familyId are required");
        }
        Scheme scheme = schemeRepository.findById(req.schemeId())
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + req.schemeId()));
        FamilyData family = fetchFamilyData(req.familyId());
        FamilyData.MemberData resolved = findMemberByAadhaar(family, req.aadhaarRef());
        if (resolved == null) {
            resolved = findHead(family);
        }
        final FamilyData.MemberData applicant = resolved;
        String personId = applicant != null ? applicant.getPersonId() : null;

        List<Beneficiary> existing = beneficiaryRepository.findBySchemeIdAndFamilyIdAndStatusIn(
                req.schemeId(), req.familyId(), ENROLLED_STATUSES);
        Beneficiary match = existing.stream()
                .filter(b -> personId != null && personId.equals(b.getPersonId()))
                .findFirst()
                .orElse(existing.stream()
                        .filter(b -> applicant != null && applicant.getName() != null
                                && applicant.getName().equalsIgnoreCase(b.getPersonName()))
                        .findFirst()
                        .orElse(null));

        if (match == null) {
            match = new Beneficiary();
            match.setSchemeId(scheme.getId());
            match.setFamilyId(req.familyId());
            match.setPersonId(personId);
            match.setPersonName(applicant != null ? applicant.getName() : "Unknown");
            match.setFamilyVillage(family.getVillage());
            match.setFamilyDistrict(family.getDistrict());
            match.setFamilyTaluka(family.getTaluka());
            match.setIdentifiedAt(LocalDateTime.now());
            match.setCasteCategory(applicant != null ? applicant.getCasteCategory() : null);
            match.setGender(applicant != null ? applicant.getGender() : null);
            match.setEligibilityReason(buildEligibilityReason(scheme, family, applicant));
        }

        match.setStatus("CONFIRMED");
        match.setConfirmedAt(LocalDateTime.now());
        if (req.officerName() != null && !req.officerName().isBlank()) {
            match.setConfirmedBy(req.officerName());
        } else {
            match.setConfirmedBy("Scheme officer");
        }
        if (req.applicationNo() != null && !req.applicationNo().isBlank()) {
            String reason = match.getEligibilityReason();
            String stamp = "Officer approved " + req.applicationNo();
            if (reason == null || reason.isBlank()) {
                match.setEligibilityReason(stamp);
            } else if (!reason.contains(req.applicationNo())) {
                match.setEligibilityReason(reason + "|" + stamp);
            }
        }
        match = beneficiaryRepository.save(match);
        return toBeneficiaryResponse(match, scheme.getName());
    }

    @Transactional
    public BeneficiaryResponse overrideBeneficiary(UUID id, OverrideRequest req) {
        if (!"CONFIRMED".equals(req.status()) && !"REMOVED".equals(req.status())) {
            throw new IllegalArgumentException("Status must be CONFIRMED or REMOVED");
        }
        if (req.reason() == null || req.reason().trim().length() < 10) {
            throw new IllegalArgumentException("Reason must be at least 10 characters");
        }

        Beneficiary b = beneficiaryRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Beneficiary not found: " + id));

        b.setStatus(req.status());
        b.setOverrideBy(req.officerName());
        b.setOverrideReason(req.reason().trim());

        if ("CONFIRMED".equals(req.status())) {
            b.setConfirmedAt(LocalDateTime.now());
            b.setConfirmedBy(req.officerName());
            b.setRemovedAt(null);
            b.setRemovalReason(null);
        } else {
            b.setRemovedAt(LocalDateTime.now());
            b.setRemovalReason("OFFICER_OVERRIDE");
        }

        b = beneficiaryRepository.save(b);
        Scheme scheme = schemeRepository.findById(b.getSchemeId()).orElse(null);
        String schemeName = scheme != null ? scheme.getName() : null;
        return toBeneficiaryResponse(b, schemeName);
    }

    public List<AuditEvent> getAuditTrail(UUID id) {
        Beneficiary b = beneficiaryRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Beneficiary not found: " + id));

        List<AuditEvent> events = new ArrayList<>();

        events.add(new AuditEvent(
                b.getIdentifiedAt(),
                "IDENTIFIED",
                "Eligibility Engine (auto)",
                b.getEligibilityReason() != null
                        ? b.getEligibilityReason().replace("|", " · ") : null
        ));

        if (b.getConfirmedAt() != null && b.getOverrideBy() == null) {
            events.add(new AuditEvent(
                    b.getConfirmedAt(),
                    "CONFIRMED",
                    b.getConfirmedBy() != null ? b.getConfirmedBy() : "Officer",
                    null
            ));
        }

        if (b.getDisbursedAt() != null) {
            events.add(new AuditEvent(
                    b.getDisbursedAt(),
                    "DISBURSED",
                    "Revenue Officer",
                    b.getDisbursementRef()
            ));
        }

        if (b.getOverrideBy() != null) {
            events.add(new AuditEvent(
                    b.getRemovedAt() != null ? b.getRemovedAt() : b.getConfirmedAt(),
                    "OVERRIDE → " + b.getStatus(),
                    b.getOverrideBy(),
                    b.getOverrideReason()
            ));
        }

        if (b.getRemovedAt() != null && b.getOverrideBy() == null) {
            events.add(new AuditEvent(
                    b.getRemovedAt(),
                    "REMOVED",
                    "Eligibility Engine (auto)",
                    b.getRemovalReason()
            ));
        }

        return events.stream()
                .filter(e -> e.timestamp() != null)
                .sorted(Comparator.comparing(AuditEvent::timestamp))
                .collect(Collectors.toList());
    }

    @Transactional
    public BeneficiaryResponse removeBeneficiary(UUID beneficiaryId, String reason) {
        Beneficiary beneficiary = beneficiaryRepository.findById(beneficiaryId)
                .orElseThrow(() -> new NoSuchElementException("Beneficiary not found: " + beneficiaryId));
        beneficiary.setStatus("REMOVED");
        beneficiary.setRemovedAt(LocalDateTime.now());
        beneficiary.setRemovalReason(reason);
        beneficiary = beneficiaryRepository.save(beneficiary);
        Scheme scheme = schemeRepository.findById(beneficiary.getSchemeId()).orElse(null);
        String schemeName = scheme != null ? scheme.getName() : null;
        return toBeneficiaryResponse(beneficiary, schemeName);
    }

    @Transactional
    public BeneficiaryResponse disburse(UUID beneficiaryId, DisburseRequest req) {
        Beneficiary b = beneficiaryRepository.findById(beneficiaryId)
                .orElseThrow(() -> new NoSuchElementException("Beneficiary not found: " + beneficiaryId));

        if (!"CONFIRMED".equals(b.getStatus())) {
            throw new IllegalStateException("Only CONFIRMED beneficiaries can be disbursed");
        }
        if ("DISBURSED".equals(b.getDisbursementStatus())) {
            throw new IllegalStateException("Beneficiary already disbursed");
        }

        String ref = "GOV-TXN-" + String.format("%08d", (int) (Math.random() * 100_000_000));

        b.setDisbursementStatus("DISBURSED");
        b.setDisbursedAt(LocalDateTime.now());
        b.setDisbursementRef(ref);
        beneficiaryRepository.save(b);

        try {
            schemeRepository.findById(b.getSchemeId()).ifPresent(scheme -> {
                String amount = scheme.getBenefitValue() != null
                        ? formatBenefit(scheme.getBenefitValue(), scheme.getBenefitType())
                        : "payment";
                sendDisbursementNotification(b, scheme.getName(), amount, ref);
            });
        } catch (Exception e) {
            log.warn("Disbursement notification failed for {}: {}", beneficiaryId, e.getMessage());
        }

        Scheme scheme = schemeRepository.findById(b.getSchemeId()).orElse(null);
        String schemeName = scheme != null ? scheme.getName() : null;
        return toBeneficiaryResponse(b, schemeName);
    }

    public IdentificationResult runIdentification() {
        List<Scheme> activeSchemes = schemeRepository.findByIsActiveTrue();
        int newlyIdentified = 0;
        int totalFamilies = 0;
        int offset = 0;

        while (true) {
            List<String> familyIds = fetchFamilyIdBatch(offset, IDENTIFICATION_BATCH_SIZE);
            if (familyIds.isEmpty()) {
                break;
            }
            newlyIdentified += identifyFamilyBatch(activeSchemes, familyIds);
            totalFamilies += familyIds.size();
            offset += familyIds.size();
            log.info("Identification progress: {} / ? families processed, {} newly identified",
                    totalFamilies, newlyIdentified);
            if (familyIds.size() < IDENTIFICATION_BATCH_SIZE) {
                break;
            }
        }
        // Use transactional backfill wrapper — native UPDATE requires an active transaction
        int backfilled = backfillGeography();
        log.info("Geography backfill updated {} beneficiary rows", backfilled);
        return new IdentificationResult(activeSchemes.size(), totalFamilies, newlyIdentified);
    }

    private volatile boolean identLogDone = false;

    private int identifyFamilyBatch(List<Scheme> activeSchemes, List<String> familyIds) {
        Integer count = transactionTemplate.execute(status -> {
            int batchNew = 0;
            for (String familyId : familyIds) {
                FamilyData family;
                try {
                    family = fetchFamilyData(familyId);
                } catch (RuntimeException ex) {
                    log.warn("Skipping family {}: {}", familyId, ex.getMessage());
                    continue;
                }
                for (Scheme scheme : activeSchemes) {
                    boolean eligible = isEligibleForScheme(scheme, family);
                    if (!identLogDone) {
                        FamilyData.MemberData head = family.getMembers().stream()
                            .filter(m -> "HEAD".equalsIgnoreCase(m.getRelationshipToHead()))
                            .findFirst().orElse(family.getMembers().isEmpty() ? null : family.getMembers().get(0));
                        log.info("IDENT-DIAG family={} scheme={} eligible={} headCaste={} income={} ceiling={} eligibleCastes={}",
                            familyId, scheme.getName(), eligible,
                            head != null ? head.getCasteCategory() : "NULL",
                            family.getTotalAnnualIncome(), scheme.getIncomeCeiling(),
                            scheme.getEligibleCastes());
                    }
                    if (eligible && !hasEnrolledBeneficiary(scheme.getId(), familyId)) {
                        createIdentifiedBeneficiaryForScheme(scheme, familyId, family);
                        batchNew++;
                    }
                }
                identLogDone = true;
            }
            return batchNew;
        });
        return count != null ? count : 0;
    }

    private List<String> fetchFamilyIdBatch(int offset, int limit) {
        return webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/ids?offset={offset}&limit={limit}", offset, limit)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<String>>() {})
                .blockOptional()
                .orElse(List.of());
    }

    @Transactional
    public void handleFamilyEvent(FamilyRegistryEvent event) {
        if (event == null || event.eventType() == null) {
            return;
        }
        switch (event.eventType()) {
            case "MEMBER_DELETED" -> handleMemberDeleted(event);
            case "INCOME_UPDATED" -> handleIncomeUpdated(event);
            case "MEMBER_ADDED" -> handleMemberAdded(event);
            default -> log.debug("Ignoring event type {}", event.eventType());
        }
    }

    private void handleMemberDeleted(FamilyRegistryEvent event) {
        List<Beneficiary> matches = beneficiaryRepository.findByFamilyIdAndPersonIdAndStatusIn(
                event.familyId(), event.personId(), ACTIVE_STATUSES);
        for (Beneficiary beneficiary : matches) {
            beneficiary.setStatus("REMOVED");
            beneficiary.setRemovalReason("MEMBER_DECEASED");
            beneficiary.setRemovedAt(LocalDateTime.now());
            beneficiaryRepository.save(beneficiary);
        }
        log.info("Auto-removed {} beneficiary records for deceased person {}", matches.size(), event.personId());
    }

    private void handleIncomeUpdated(FamilyRegistryEvent event) {
        FamilyData family = fetchFamilyData(event.familyId());
        List<Scheme> activeSchemes = schemeRepository.findByIsActiveTrue();
        for (Scheme scheme : activeSchemes) {
            if (!isEligibleForScheme(scheme, family)) {
                List<Beneficiary> enrolled = beneficiaryRepository.findBySchemeIdAndFamilyIdAndStatusIn(
                        scheme.getId(), event.familyId(), ACTIVE_STATUSES);
                for (Beneficiary beneficiary : enrolled) {
                    beneficiary.setStatus("REMOVED");
                    beneficiary.setRemovalReason("INCOME_EXCEEDED_CEILING");
                    beneficiary.setRemovedAt(LocalDateTime.now());
                    beneficiaryRepository.save(beneficiary);
                }
            } else if (!hasEnrolledBeneficiary(scheme.getId(), event.familyId())) {
                createIdentifiedBeneficiaryForScheme(scheme, event.familyId(), family);
            }
        }
        log.info("Processed INCOME_UPDATED for family {}", event.familyId());
    }

    private void handleMemberAdded(FamilyRegistryEvent event) {
        FamilyData family = fetchFamilyData(event.familyId());
        List<Scheme> activeSchemes = schemeRepository.findByIsActiveTrue();
        for (Scheme scheme : activeSchemes) {
            if (isEligibleForScheme(scheme, family) && !hasEnrolledBeneficiary(scheme.getId(), event.familyId())) {
                createIdentifiedBeneficiaryForScheme(scheme, event.familyId(), family);
            }
        }
        log.info("Processed MEMBER_ADDED for family {}", event.familyId());
    }

    FamilyData fetchFamilyData(String familyId) {
        Map<String, Object> familyMap = webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/{id}", familyId)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .block();

        Map<String, Object> incomeMap = webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/{id}/income", familyId)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .block();

        if (familyMap == null || incomeMap == null) {
            throw new RuntimeException("Family registry returned empty response for " + familyId);
        }

        FamilyData familyData = new FamilyData();
        familyData.setVillage(stringVal(familyMap.get("village")));
        familyData.setDistrict(stringVal(familyMap.get("district")));
        familyData.setTaluka(stringVal(familyMap.get("taluka")));
        familyData.setTotalAnnualIncome(numberVal(incomeMap.get("totalAnnualIncome")));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> membersRaw = (List<Map<String, Object>>) familyMap.get("members");
        List<FamilyData.MemberData> members = new ArrayList<>();
        if (membersRaw != null) {
            for (Map<String, Object> m : membersRaw) {
                FamilyData.MemberData member = new FamilyData.MemberData();
                member.setPersonId(stringVal(m.get("id")));
                member.setName(stringVal(m.get("name")));
                member.setCasteCategory(stringVal(m.get("casteCategory")));
                member.setOccupation(stringVal(m.get("occupation")));
                member.setAnnualIncome(numberVal(m.get("annualIncome")));
                member.setIsAlive(m.get("isAlive") instanceof Boolean b ? b : Boolean.TRUE);
                member.setGender(stringVal(m.get("gender")));
                member.setRelationshipToHead(stringVal(m.get("relationshipToHead")));
                member.setAadhaarRef(stringVal(m.get("aadhaarRef")));
                member.setEducationLevel(stringVal(m.get("educationLevel")));
                member.setMaritalStatus(stringVal(m.get("maritalStatus")));
                member.setEmploymentStatus(stringVal(m.get("employmentStatus")));
                member.setExamType(stringVal(m.get("examType")));
                member.setExamPercentile(doubleVal(m.get("examPercentile")));
                member.setCourseCategory(stringVal(m.get("courseCategory")));
                if (m.get("dob") != null) {
                    member.setDob(LocalDate.parse(m.get("dob").toString()));
                }
                members.add(member);
            }
        }
        familyData.setMembers(members);
        return familyData;
    }

    boolean evaluateEligibility(Scheme scheme, FamilyData family) {
        LocalDate today = LocalDate.now();
        if (scheme.getValidFrom() != null && today.isBefore(scheme.getValidFrom())) {
            return false;
        }
        if (scheme.getValidTo() != null && today.isAfter(scheme.getValidTo())) {
            return false;
        }
        if (scheme.getDistrictScope() != null && !scheme.getDistrictScope().isBlank()) {
            String scope = scheme.getDistrictScope().trim();
            // State-wide scope (e.g. "Gujarat") — do not require family.district to match the state name.
            if (!isStateWideDistrictScope(scope)
                    && (family.getDistrict() == null || !scope.equalsIgnoreCase(family.getDistrict()))) {
                return false;
            }
        }
        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            if (income > scheme.getIncomeCeiling()) {
                return false;
            }
        }

        FamilyData.MemberData head = findHead(family);
        if (head == null) {
            return false;
        }

        if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank()) {
            Set<String> allowed = new HashSet<>();
            for (String caste : scheme.getEligibleCastes().split(",")) {
                allowed.add(caste.trim().toUpperCase());
            }
            if (head.getCasteCategory() == null
                    || !allowed.contains(head.getCasteCategory().trim().toUpperCase())) {
                return false;
            }
        }

        if (scheme.getGender() != null && !"ANY".equalsIgnoreCase(scheme.getGender())) {
            if (head.getGender() == null
                    || !normalizeGender(scheme.getGender()).equals(normalizeGender(head.getGender()))) {
                return false;
            }
        }

        if (scheme.getExtraConditions() != null && !scheme.getExtraConditions().isEmpty()
                && !ruleEvaluatorService.evaluate(scheme.getExtraConditions(), "AND", family)) {
            return false;
        }

        if (scheme.getMinAge() != null || scheme.getMaxAge() != null) {
            boolean ageMatch = family.getMembers().stream()
                    .filter(m -> m.getDob() != null)
                    .anyMatch(m -> {
                        int age = ageFromDob(m.getDob());
                        if (scheme.getMinAge() != null && age < scheme.getMinAge()) {
                            return false;
                        }
                        if (scheme.getMaxAge() != null && age > scheme.getMaxAge()) {
                            return false;
                        }
                        return true;
                    });
            if (!ageMatch) {
                return false;
            }
        }

        return true;
    }

    /** Scheme.gender stores "FEMALE"/"MALE"/"ANY"; person.gender stores "F"/"M"/"O" — normalize both before comparing. */
    private String normalizeGender(String gender) {
        if (gender == null) return null;
        String g = gender.trim().toUpperCase();
        if (g.startsWith("F")) return "F";
        if (g.startsWith("M")) return "M";
        if (g.startsWith("O")) return "O";
        return g;
    }

    private boolean hasEnrolledBeneficiary(UUID schemeId, String familyId) {
        return beneficiaryRepository.existsBySchemeIdAndFamilyIdAndStatusIn(
                schemeId, familyId, ENROLLED_STATUSES);
    }

    private void createIdentifiedBeneficiary(Scheme scheme, String familyId, FamilyData family) {
        FamilyData.MemberData head = findHead(family);
        String reason = buildEligibilityReason(scheme, family, head);
        Beneficiary beneficiary = new Beneficiary();
        beneficiary.setSchemeId(scheme.getId());
        beneficiary.setFamilyId(familyId);
        beneficiary.setPersonId(head != null ? head.getPersonId() : null);
        beneficiary.setPersonName(head != null ? head.getName() : "Unknown");
        beneficiary.setFamilyVillage(family.getVillage());
        beneficiary.setFamilyDistrict(family.getDistrict());
        beneficiary.setFamilyTaluka(family.getTaluka());
        beneficiary.setStatus("IDENTIFIED");
        beneficiary.setIdentifiedAt(LocalDateTime.now());
        beneficiary.setEligibilityReason(reason);
        beneficiary.setCasteCategory(head != null ? head.getCasteCategory() : null);
        beneficiary.setGender(head != null ? head.getGender() : null);
        beneficiaryRepository.save(beneficiary);
    }

    /** Schemes with any exam-based criterion (MYSY-style) are evaluated per-student, not per-head. */
    private boolean isStudentScheme(Scheme scheme) {
        return scheme.getMinPercentile() != null
                || scheme.getDiplomaMinPercentage() != null
                || Boolean.TRUE.equals(scheme.getNeetMbbsEligible());
    }

    private boolean isEligibleForScheme(Scheme scheme, FamilyData family) {
        if (isStudentScheme(scheme)) {
            return findEligibleStudent(scheme, family) != null;
        }
        return evaluateEligibility(scheme, family);
    }

    private void createIdentifiedBeneficiaryForScheme(Scheme scheme, String familyId, FamilyData family) {
        if (isStudentScheme(scheme)) {
            FamilyData.MemberData student = findEligibleStudent(scheme, family);
            if (student != null) {
                createIdentifiedStudentBeneficiary(scheme, familyId, family, student);
            }
            return;
        }
        createIdentifiedBeneficiary(scheme, familyId, family);
    }

    /**
     * Unlike the head-attributed path below, a student scholarship must be attributed to the
     * actual student — never the family head — so this evaluates each living member directly.
     */
    private FamilyData.MemberData findEligibleStudent(Scheme scheme, FamilyData family) {
        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            if (income > scheme.getIncomeCeiling()) {
                return null;
            }
        }
        return family.getMembers().stream()
                .filter(m -> m.getIsAlive() == null || m.getIsAlive())
                .filter(m -> m.getExamType() != null)
                .filter(m -> meetsExamCriteria(scheme, m))
                .findFirst()
                .orElse(null);
    }

    private boolean meetsExamCriteria(Scheme scheme, FamilyData.MemberData member) {
        String examType = member.getExamType();
        if ("NEET_MBBS".equalsIgnoreCase(examType)) {
            return Boolean.TRUE.equals(scheme.getNeetMbbsEligible());
        }
        if ("DIPLOMA".equalsIgnoreCase(examType)) {
            return scheme.getDiplomaMinPercentage() != null
                    && member.getExamPercentile() != null
                    && member.getExamPercentile() >= scheme.getDiplomaMinPercentage();
        }
        if ("STD10".equalsIgnoreCase(examType) || "STD12".equalsIgnoreCase(examType)) {
            return scheme.getMinPercentile() != null
                    && member.getExamPercentile() != null
                    && member.getExamPercentile() >= scheme.getMinPercentile();
        }
        return false;
    }

    private void createIdentifiedStudentBeneficiary(Scheme scheme, String familyId, FamilyData family,
                                                      FamilyData.MemberData student) {
        Beneficiary beneficiary = new Beneficiary();
        beneficiary.setSchemeId(scheme.getId());
        beneficiary.setFamilyId(familyId);
        beneficiary.setPersonId(student.getPersonId());
        beneficiary.setPersonName(student.getName());
        beneficiary.setFamilyVillage(family.getVillage());
        beneficiary.setFamilyDistrict(family.getDistrict());
        beneficiary.setFamilyTaluka(family.getTaluka());
        beneficiary.setStatus("IDENTIFIED");
        beneficiary.setIdentifiedAt(LocalDateTime.now());
        beneficiary.setCasteCategory(student.getCasteCategory());
        beneficiary.setGender(student.getGender());

        SchemeBenefitComponent component = schemeBenefitComponentRepository
                .findBySchemeIdAndCourseCategory(scheme.getId(), student.getCourseCategory())
                .orElse(null);
        if (component != null) {
            long tuition = nz(component.getTuitionAmount());
            long boarding = nz(component.getBoardingAmount());
            long books = nz(component.getBooksAmount());
            beneficiary.setTuitionAmount(tuition);
            beneficiary.setBoardingAmount(boarding);
            beneficiary.setBooksAmount(books);
            beneficiary.setAmount(tuition + boarding + books);
        }

        beneficiary.setEligibilityReason(buildStudentEligibilityReason(scheme, family, student, component));
        beneficiaryRepository.save(beneficiary);
    }

    private String buildStudentEligibilityReason(Scheme scheme, FamilyData family, FamilyData.MemberData student,
                                                   SchemeBenefitComponent component) {
        List<String> parts = new ArrayList<>();
        String examType = student.getExamType();
        if ("NEET_MBBS".equalsIgnoreCase(examType)) {
            parts.add("NEET-based MBBS admission");
        } else if ("DIPLOMA".equalsIgnoreCase(examType)) {
            parts.add("Diploma " + formatPercent(student.getExamPercentile())
                    + " ≥ " + formatPercent(scheme.getDiplomaMinPercentage()) + " (D-to-D)");
        } else {
            String label = "STD10".equalsIgnoreCase(examType) ? "Std 10" : "Std 12";
            parts.add(label + " Percentile " + formatPercent(student.getExamPercentile())
                    + " ≥ " + formatPercent(scheme.getMinPercentile()));
        }

        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            parts.add("Family income " + formatLakh(income) + " ≤ " + formatLakh(scheme.getIncomeCeiling()) + " (ceiling)");
        }

        parts.add("Course: " + courseCategoryLabel(student.getCourseCategory()));

        if (component != null) {
            parts.add("Tuition " + formatLakh(nz(component.getTuitionAmount()))
                    + " · Boarding " + formatLakh(nz(component.getBoardingAmount()))
                    + " · Books " + formatLakh(nz(component.getBooksAmount())));
        }

        return String.join("|", parts);
    }

    private String formatPercent(Double value) {
        if (value == null) return "—";
        return value == Math.floor(value) ? String.valueOf(value.intValue()) : String.valueOf(value);
    }

    private long nz(Long value) {
        return value != null ? value : 0L;
    }

    private String courseCategoryLabel(String code) {
        if (code == null) return "—";
        return switch (code) {
            case "MEDICAL_DENTAL" -> "Medical/Dental";
            case "ENGINEERING_GROUP" -> "Engineering/Technology, Pharmacy, Ayurveda, Nursing, Para-Medical";
            case "DIPLOMA" -> "Diploma";
            case "ARTS_COMMERCE" -> "B.Sc./B.Com./BCA/BBA/B.A.";
            default -> code;
        };
    }

    private FamilyData.MemberData findHead(FamilyData family) {
        return family.getMembers().stream()
                .filter(m -> "HEAD".equalsIgnoreCase(m.getRelationshipToHead()))
                .findFirst()
                .orElse(family.getMembers().isEmpty() ? null : family.getMembers().get(0));
    }

    /** State names used as district_scope mean statewide eligibility, not a single district. */
    private boolean isStateWideDistrictScope(String scope) {
        return org.citizen.platform.tenancy.StateNames.isStateWide(scope);
    }

    private int ageFromDob(LocalDate dob) {
        LocalDate today = LocalDate.now();
        return today.getYear() - dob.getYear()
                - ((today.getMonthValue() < dob.getMonthValue()
                || (today.getMonthValue() == dob.getMonthValue() && today.getDayOfMonth() < dob.getDayOfMonth())) ? 1 : 0);
    }

    private String formatLakh(long amount) {
        if (amount >= 100_000) return String.format("₹%.2fL", amount / 100_000.0);
        return "₹" + amount;
    }

    /**
     * The age band can be satisfied by any family member, not necessarily the head
     * (e.g. a girl-child or maternity scheme where the head is an older parent).
     * Reason text must describe whichever member actually matched, not blindly the
     * head — otherwise it can assert something false, like "Age 45 <= 25 (maximum)".
     */
    private FamilyData.MemberData findAgeEligibleMember(Scheme scheme, FamilyData family, FamilyData.MemberData head) {
        if (head != null && head.getDob() != null) {
            int headAge = ageFromDob(head.getDob());
            boolean headOk = (scheme.getMinAge() == null || headAge >= scheme.getMinAge())
                    && (scheme.getMaxAge() == null || headAge <= scheme.getMaxAge());
            if (headOk) return head;
        }
        return family.getMembers().stream()
                .filter(m -> m.getDob() != null)
                .filter(m -> {
                    int age = ageFromDob(m.getDob());
                    return (scheme.getMinAge() == null || age >= scheme.getMinAge())
                            && (scheme.getMaxAge() == null || age <= scheme.getMaxAge());
                })
                .findFirst()
                .orElse(head);
    }

    private String buildEligibilityReason(Scheme scheme, FamilyData family, FamilyData.MemberData head) {
        List<String> parts = new ArrayList<>();
        FamilyData.MemberData ageMember = findAgeEligibleMember(scheme, family, head);
        boolean ageMemberIsHead = ageMember == head;

        if (scheme.getMinAge() != null && ageMember != null && ageMember.getDob() != null) {
            int age = ageFromDob(ageMember.getDob());
            parts.add("Age " + age + " ≥ " + scheme.getMinAge() + " (minimum)"
                    + (ageMemberIsHead ? "" : " — " + ageMember.getRelationshipToHead()));
        }
        if (scheme.getMaxAge() != null && ageMember != null && ageMember.getDob() != null) {
            int age = ageFromDob(ageMember.getDob());
            parts.add("Age " + age + " ≤ " + scheme.getMaxAge() + " (maximum)"
                    + (ageMemberIsHead ? "" : " — " + ageMember.getRelationshipToHead()));
        }

        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null
                    ? family.getTotalAnnualIncome() : 0L;
            parts.add("Income " + formatLakh(income)
                    + " < " + formatLakh(scheme.getIncomeCeiling()) + " (ceiling)");
        }

        if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank()) {
            String headCaste = head != null ? head.getCasteCategory() : "—";
            parts.add("Caste " + headCaste + " in eligible list");
        } else {
            parts.add("All castes eligible");
        }

        return String.join("|", parts);
    }

    private boolean simulateEligibility(FamilyData family, SimulateParameters params) {
        FamilyData.MemberData head = findHead(family);
        if (head == null || Boolean.FALSE.equals(head.getIsAlive())) return false;

        if (params.maxIncome() != null && family.getTotalAnnualIncome() != null) {
            if (family.getTotalAnnualIncome() > params.maxIncome()) return false;
        }

        if (params.eligibleCastes() != null && !params.eligibleCastes().isEmpty()) {
            String headCaste = head.getCasteCategory();
            boolean match = params.eligibleCastes().stream()
                    .anyMatch(c -> c.trim().equalsIgnoreCase(headCaste));
            if (!match) return false;
        }

        if (params.minAge() != null || params.maxAge() != null) {
            boolean ageMatch = family.getMembers().stream()
                    .filter(m -> m.getDob() != null && Boolean.TRUE.equals(m.getIsAlive()))
                    .anyMatch(m -> {
                        int age = ageFromDob(m.getDob());
                        if (params.minAge() != null && age < params.minAge()) return false;
                        if (params.maxAge() != null && age > params.maxAge()) return false;
                        return true;
                    });
            if (!ageMatch) return false;
        }

        return true;
    }

    private List<String> buildSimulateCriteria(FamilyData family, SimulateParameters params) {
        List<String> criteria = new ArrayList<>();
        FamilyData.MemberData head = findHead(family);

        if (params.maxIncome() != null && family.getTotalAnnualIncome() != null) {
            long income = family.getTotalAnnualIncome();
            long ceiling = params.maxIncome();
            criteria.add("Income " + formatLakh(income) + " < " + formatLakh(ceiling) + " ceiling");
        }

        if (params.minAge() != null || params.maxAge() != null) {
            family.getMembers().stream()
                    .filter(m -> m.getDob() != null && Boolean.TRUE.equals(m.getIsAlive()))
                    .filter(m -> {
                        int age = ageFromDob(m.getDob());
                        if (params.minAge() != null && age < params.minAge()) return false;
                        if (params.maxAge() != null && age > params.maxAge()) return false;
                        return true;
                    })
                    .findFirst()
                    .ifPresent(m -> {
                        int age = ageFromDob(m.getDob());
                        StringBuilder sb = new StringBuilder();
                        if (params.minAge() != null) sb.append("Age ").append(age).append(" ≥ ").append(params.minAge());
                        if (params.maxAge() != null) {
                            if (!sb.isEmpty()) sb.append(" ≤ ").append(params.maxAge());
                            else sb.append("Age ").append(age).append(" ≤ ").append(params.maxAge());
                        }
                        criteria.add(sb.toString());
                    });
        }

        if (params.eligibleCastes() != null && !params.eligibleCastes().isEmpty()
                && head != null && head.getCasteCategory() != null) {
            criteria.add("Caste " + head.getCasteCategory() + " in eligible list");
        }

        return criteria;
    }

    public List<SchemeCoverageDTO> getSchemeCoverage() {
        Map<UUID, long[]> countsByScheme = new HashMap<>();
        for (Object[] row : beneficiaryRepository.countGroupedBySchemeAndStatus()) {
            UUID schemeId = row[0] instanceof UUID u ? u : UUID.fromString(row[0].toString());
            String status = row[1] != null ? row[1].toString() : "";
            long count = row[2] instanceof Number n ? n.longValue() : Long.parseLong(row[2].toString());
            long[] counts = countsByScheme.computeIfAbsent(schemeId, k -> new long[4]);
            if ("REMOVED".equals(status)) {
                counts[3] += count;
            } else {
                counts[0] += count; // total enrolled (non-removed)
                if ("ACTIVE".equals(status) || "CONFIRMED".equals(status)) {
                    counts[1] += count;
                }
                if ("IDENTIFIED".equals(status)) {
                    counts[2] += count;
                }
            }
        }

        List<SchemeCoverageDTO> result = new ArrayList<>();
        for (Scheme scheme : schemeRepository.findByIsActiveTrue()) {
            long[] counts = countsByScheme.getOrDefault(scheme.getId(), new long[4]);
            result.add(new SchemeCoverageDTO(
                    scheme.getId(),
                    scheme.getName(),
                    scheme.getNameGujarati(),
                    scheme.getDepartment(),
                    scheme.getBenefitType(),
                    scheme.getBenefitValue(),
                    scheme.getCategory() != null ? scheme.getCategory() : "OTHER",
                    counts[0],
                    counts[1],
                    counts[2],
                    counts[3]
            ));
        }
        return result;
    }

    public List<FraudSignalDTO> getFraudSignals() {
        List<FraudSignalDTO> signals = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        List<Beneficiary> enrolled = beneficiaryRepository.findFraudCandidates(HERO_FAMILY_IDS);

        Map<UUID, Scheme> schemeMap = schemeRepository.findAll().stream()
                .collect(Collectors.toMap(Scheme::getId, s -> s));

        Map<String, List<Beneficiary>> byPerson = enrolled.stream()
                .collect(Collectors.groupingBy(Beneficiary::getPersonId));

        for (Map.Entry<String, List<Beneficiary>> entry : byPerson.entrySet()) {
            List<Beneficiary> personBenefits = entry.getValue();
            if (personBenefits.size() < 2) continue;

            List<String> cashSchemeNames = personBenefits.stream()
                    .map(b -> schemeMap.get(b.getSchemeId()))
                    .filter(this::isCashScheme)
                    .map(Scheme::getName)
                    .toList();

            if (cashSchemeNames.size() >= 2) {
                Beneficiary first = personBenefits.get(0);
                signals.add(new FraudSignalDTO(
                        "MULTI_SCHEME_OVERLAP",
                        "HIGH",
                        first.getPersonName(),
                        first.getPersonId(),
                        first.getFamilyId(),
                        first.getSchemeId().toString(),
                        String.join(" + ", cashSchemeNames),
                        "Enrolled as active beneficiary in " + cashSchemeNames.size() +
                                " cash schemes simultaneously: " + String.join(", ", cashSchemeNames),
                        now
                ));
            }
        }

        Set<String> familyIds = enrolled.stream()
                .map(Beneficiary::getFamilyId)
                .collect(Collectors.toSet());

        for (String familyId : familyIds) {
            FamilyData family;
            try {
                family = fetchFamilyData(familyId);
            } catch (Exception e) {
                log.warn("Could not fetch family data for fraud check: {}", familyId);
                continue;
            }
            if (family == null || family.getMembers() == null) continue;

            List<Beneficiary> familyBeneficiaries = enrolled.stream()
                    .filter(b -> familyId.equals(b.getFamilyId()))
                    .toList();

            for (Beneficiary b : familyBeneficiaries) {
                Scheme scheme = schemeMap.get(b.getSchemeId());
                if (scheme == null) continue;

                if (scheme.getIncomeCeiling() != null && scheme.getIncomeCeiling() > 0
                        && family.getTotalAnnualIncome() != null) {
                    long income = family.getTotalAnnualIncome();
                    long ceiling = scheme.getIncomeCeiling();
                    if (income >= ceiling * 90 / 100 && income <= ceiling) {
                        int pct = (int) (income * 100 / ceiling);
                        signals.add(new FraudSignalDTO(
                                "INCOME_CLIFF",
                                "MEDIUM",
                                b.getPersonName(),
                                b.getPersonId(),
                                familyId,
                                b.getSchemeId().toString(),
                                scheme.getName(),
                                "Family income ₹" + String.format("%,.0f", income / 1000.0) + "K is " +
                                        pct + "% of ₹" + String.format("%,.0f", ceiling / 1000.0) +
                                        "K ceiling for " + scheme.getName() + " — verify income source",
                                now
                        ));
                    }
                }

                family.getMembers().stream()
                        .filter(m -> m.getDob() != null && ageFromDob(m.getDob()) > 100)
                        .forEach(m -> signals.add(new FraudSignalDTO(
                                "AGE_ANOMALY",
                                "LOW",
                                m.getName(),
                                b.getPersonId(),
                                familyId,
                                b.getSchemeId().toString(),
                                scheme.getName(),
                                "Family member " + m.getName() + " has DOB " + m.getDob() +
                                        " (age " + ageFromDob(m.getDob()) + ") — verify date of birth",
                                now
                        )));
            }

            if (family.getTotalAnnualIncome() != null
                    && family.getTotalAnnualIncome() < 50_000) {
                family.getMembers().stream()
                        .filter(m -> m.getAnnualIncome() != null && m.getAnnualIncome() > 180_000)
                        .findFirst()
                        .ifPresent(highEarner -> familyBeneficiaries.stream().findFirst().ifPresent(b -> {
                            Scheme scheme2 = schemeMap.get(b.getSchemeId());
                            if (scheme2 == null) return;
                            signals.add(new FraudSignalDTO(
                                    "FAMILY_INCOME_MISMATCH",
                                    "HIGH",
                                    b.getPersonName(),
                                    b.getPersonId(),
                                    familyId,
                                    b.getSchemeId().toString(),
                                    scheme2.getName(),
                                    "Family total income ₹" + family.getTotalAnnualIncome() +
                                            " but " + highEarner.getName() + " earns ₹" +
                                            highEarner.getAnnualIncome() + " individually — verify income declaration",
                                    now
                            ));
                        }));
            }
        }

        List<String> order = List.of("HIGH", "MEDIUM", "LOW");
        signals.sort(Comparator.comparingInt(s -> order.indexOf(s.severity())));

        if (signals.size() > FRAUD_SIGNAL_CAP) {
            return signals.subList(0, FRAUD_SIGNAL_CAP);
        }
        return signals;
    }

    /**
     * Citizen-facing live checks for a selected scheme. Same underlying rules as
     * {@link #getFraudSignals()} but scoped to this family and worded as guidance.
     */
    public ApplicationCheckResponse getApplicationCheck(UUID schemeId, String familyId, String aadhaarRef) {
        Scheme scheme = schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        List<ApplicationCheckItem> items = new ArrayList<>();
        FamilyData family;
        try {
            family = fetchFamilyData(familyId);
        } catch (Exception e) {
            log.warn("application-check: could not load family {}: {}", familyId, e.getMessage());
            return new ApplicationCheckResponse(
                    "ADVICE",
                    schemeId.toString(),
                    scheme.getName(),
                    "We could not load your family record just now. You can still apply.",
                    false,
                    List.of(new ApplicationCheckItem(
                            "REGISTRY_UNAVAILABLE",
                            "advice",
                            "Family record not loaded",
                            "Try again in a moment, or continue — the officer will verify your details."
                    )));
        }

        Map<UUID, Scheme> schemeMap = schemeRepository.findAll().stream()
                .collect(Collectors.toMap(Scheme::getId, s -> s));

        FamilyData.MemberData applicant = findMemberByAadhaar(family, aadhaarRef);

        if (applicant != null && applicant.getDob() != null
                && (scheme.getMinAge() != null || scheme.getMaxAge() != null)) {
            int age = ageFromDob(applicant.getDob());
            String who = applicant.getName() != null ? applicant.getName() : "You";
            if (scheme.getMinAge() != null && age < scheme.getMinAge()) {
                return blockedForAge(scheme, schemeId,
                        who + " is " + age + " years old. " + scheme.getName()
                                + " is only for citizens aged " + scheme.getMinAge()
                                + " or above. This application cannot be submitted.");
            }
            if (scheme.getMaxAge() != null && age > scheme.getMaxAge()) {
                return blockedForAge(scheme, schemeId,
                        who + " is " + age + " years old. " + scheme.getName()
                                + " is only for citizens aged " + scheme.getMaxAge()
                                + " or below. This application cannot be submitted.");
            }
        }

        List<Beneficiary> familyBens = beneficiaryRepository.findByFamilyIdAndStatusIn(
                familyId, ENROLLED_STATUSES);
        String personId = applicant != null ? applicant.getPersonId() : null;
        List<Beneficiary> availing = familyBens.stream()
                .filter(b -> ACTIVE_STATUSES.contains(b.getStatus()))
                .toList();
        List<Beneficiary> personAvailing = availing.stream()
                .filter(b -> personId != null && personId.equals(b.getPersonId()))
                .toList();

        personAvailing.stream()
                .filter(b -> schemeId.equals(b.getSchemeId()))
                .findFirst()
                .ifPresentOrElse(
                        b -> items.add(new ApplicationCheckItem(
                                "ALREADY_ENROLLED",
                                "warning",
                                "Already availing this scheme",
                                "You are already " + statusPhrase(b.getStatus())
                                        + " for " + scheme.getName()
                                        + ". A new application may be treated as a duplicate."
                        )),
                        () -> availing.stream()
                                .filter(b -> schemeId.equals(b.getSchemeId()))
                                .findFirst()
                                .ifPresent(b -> items.add(new ApplicationCheckItem(
                                        "FAMILY_MEMBER_AVAILING",
                                        "advice",
                                        "A family member is already on this scheme",
                                        (b.getPersonName() != null ? b.getPersonName() : "A family member")
                                                + " is already " + statusPhrase(b.getStatus())
                                                + " for " + scheme.getName()
                                                + ". You can still apply for yourself."
                                ))));

        if (isCashScheme(scheme) && !isStudentScheme(scheme)) {
            List<String> otherCash = personAvailing.stream()
                    .filter(b -> !schemeId.equals(b.getSchemeId()))
                    .map(b -> schemeMap.get(b.getSchemeId()))
                    .filter(this::isCashScheme)
                    .map(Scheme::getName)
                    .distinct()
                    .toList();
            if (!otherCash.isEmpty()) {
                items.add(new ApplicationCheckItem(
                        "CASH_OVERLAP",
                        "warning",
                        "Another cash benefit is already on record",
                        "You already receive " + String.join(" and ", otherCash)
                                + ". Another cash scheme is usually reviewed for overlap — keep bank and approval papers ready."
                ));
            }
        }

        Long income = family.getTotalAnnualIncome();
        Long ceiling = scheme.getIncomeCeiling();
        if (ceiling != null && ceiling > 0 && income != null) {
            if (income > ceiling) {
                items.add(new ApplicationCheckItem(
                        "INCOME_OVER",
                        "warning",
                        "Income is above this scheme's limit",
                        "This scheme's income limit is " + formatInr(ceiling)
                                + ". Your family record shows " + formatInr(income)
                                + " — you may not be eligible."
                ));
            } else if (income >= ceiling * 90 / 100) {
                int pct = (int) (income * 100 / ceiling);
                items.add(new ApplicationCheckItem(
                        "INCOME_NEAR",
                        "advice",
                        "Income is close to the scheme limit",
                        "Your family income is " + pct + "% of the "
                                + formatInr(ceiling)
                                + " ceiling. Keep a recent income certificate ready."
                ));
            }
        }

        if (family.getMembers() != null) {
            family.getMembers().stream()
                    .filter(m -> m.getDob() != null && ageFromDob(m.getDob()) > 100)
                    .findFirst()
                    .ifPresent(m -> items.add(new ApplicationCheckItem(
                            "AGE_RECORD",
                            "advice",
                            "Please review a date of birth on file",
                            "A family member's date of birth looks unusual. Update My Family so the officer does not raise a query."
                    )));

            if (income != null && income < 50_000) {
                family.getMembers().stream()
                        .filter(m -> m.getIsAlive() == null || m.getIsAlive())
                        .filter(m -> m.getAnnualIncome() != null && m.getAnnualIncome() > 180_000)
                        .findFirst()
                        .ifPresent(m -> items.add(new ApplicationCheckItem(
                                "INCOME_RECORD",
                                "advice",
                                "Family income on file looks inconsistent",
                                "Household income does not match a member's declared income. Please review My Family before applying."
                        )));
            }
        }

        boolean eligible = isEligibleForScheme(scheme, family);
        FamilyData.MemberData eligibleStudent = isStudentScheme(scheme) ? findEligibleStudent(scheme, family) : null;
        boolean applicantIsEligibleStudent = eligibleStudent != null && personId != null
                && personId.equals(eligibleStudent.getPersonId());
        boolean hasWarning = items.stream().anyMatch(i -> "warning".equals(i.level()));
        if (eligibleStudent != null && !applicantIsEligibleStudent) {
            items.add(0, new ApplicationCheckItem(
                    "STUDENT_APPLICANT",
                    "advice",
                    "This scholarship is for the eligible student",
                    eligibleStudent.getName() + " meets the published exam and income rules. "
                            + "The student should apply with their own Aadhaar — a parent's other benefits are not counted against this scheme."
            ));
        } else if (eligible && !hasWarning) {
            String detail = applicantIsEligibleStudent
                    ? eligibleStudent.getName() + " meets published criteria: "
                        + buildStudentEligibilityReason(scheme, family, eligibleStudent, null).replace("|", "; ")
                    : "Your family record is consistent with " + scheme.getName() + ".";
            items.add(0, new ApplicationCheckItem(
                    "ELIGIBLE",
                    "ok",
                    "Profile matches published criteria",
                    detail
            ));
        } else if (!eligible && items.stream().noneMatch(i -> "INCOME_OVER".equals(i.code()))) {
            items.add(new ApplicationCheckItem(
                    "NOT_ELIGIBLE",
                    "warning",
                    "May not meet published criteria",
                    "Based on the family registry, you may not meet this scheme's rules (age, caste, district, or income). You can still apply; the officer will verify."
            ));
        }

        hasWarning = items.stream().anyMatch(i -> "warning".equals(i.level()));
        boolean hasAdvice = items.stream().anyMatch(i -> "advice".equals(i.level()));
        String outcome = hasWarning ? "REVIEW" : (hasAdvice ? "ADVICE" : "CLEAR");
        String summary = switch (outcome) {
            case "REVIEW" -> "This application may need extra documents or officer review.";
            case "ADVICE" -> "You appear eligible. A few points to check before you submit.";
            default -> "Live check complete — your profile looks consistent with this scheme.";
        };

        return new ApplicationCheckResponse(
                outcome,
                schemeId.toString(),
                scheme.getName(),
                summary,
                false,
                List.copyOf(items)
        );
    }

    private ApplicationCheckResponse blockedForAge(Scheme scheme, UUID schemeId, String detail) {
        return new ApplicationCheckResponse(
                "BLOCK",
                schemeId.toString(),
                scheme.getName(),
                "You do not meet the age requirement for " + scheme.getName() + ".",
                true,
                List.of(new ApplicationCheckItem(
                        "AGE_INELIGIBLE",
                        "block",
                        "Age requirement not met",
                        detail
                ))
        );
    }

    private FamilyData.MemberData findMemberByAadhaar(FamilyData family, String aadhaarRef) {
        if (family == null || family.getMembers() == null || aadhaarRef == null || aadhaarRef.isBlank()) {
            return null;
        }
        String needle = aadhaarRef.trim();
        return family.getMembers().stream()
                .filter(m -> m.getAadhaarRef() != null && needle.equalsIgnoreCase(m.getAadhaarRef().trim()))
                .findFirst()
                .orElse(null);
    }

    private static String statusPhrase(String status) {
        if (status == null) return "listed";
        return switch (status.toUpperCase()) {
            case "ACTIVE" -> "an active beneficiary";
            case "CONFIRMED" -> "confirmed";
            case "IDENTIFIED" -> "identified as eligible";
            default -> status.toLowerCase();
        };
    }

    private static String formatInr(long amount) {
        return "₹" + String.format(Locale.US, "%,d", amount);
    }

    public SimulateResponse simulate(SimulateRequest req) {
        long startMs = System.currentTimeMillis();
        SimulateParameters params = req.parameters() != null
                ? req.parameters()
                : new SimulateParameters(null, null, null, null, null, null, null, null);

        // Resolve custom rule (ruleId takes priority over inline conditions)
        List<RuleCondition> activeConditions = null;
        String activeConditionLogic = "AND";
        String appliedRuleName = null;

        if (req.ruleId() != null && !req.ruleId().isBlank()) {
            try {
                CustomRule rule = customRuleRepository.findById(UUID.fromString(req.ruleId())).orElse(null);
                if (rule != null && rule.getConditions() != null && !rule.getConditions().isEmpty()) {
                    activeConditions = rule.getConditions();
                    activeConditionLogic = rule.getConditionLogic() != null ? rule.getConditionLogic() : "AND";
                    appliedRuleName = rule.getName();
                }
            } catch (Exception e) {
                log.warn("Could not load custom rule {}: {}", req.ruleId(), e.getMessage());
            }
        } else if (req.conditions() != null && !req.conditions().isEmpty()) {
            activeConditions = req.conditions();
            activeConditionLogic = req.conditionLogic() != null ? req.conditionLogic() : "AND";
            appliedRuleName = "Custom Rule (unsaved)";
        }

        final List<RuleCondition> finalConditions = activeConditions;
        final String finalLogic = activeConditionLogic;
        final String finalRuleName = appliedRuleName;

        int currentCount = 0;
        Set<String> baselineFamilyIds = new HashSet<>();
        if (req.baseSchemeId() != null && !req.baseSchemeId().isBlank()) {
            try {
                UUID schemeId = UUID.fromString(req.baseSchemeId());
                List<Beneficiary> baseline = beneficiaryRepository
                        .findBySchemeIdAndStatusIn(schemeId, List.of("ACTIVE", "CONFIRMED"));
                currentCount = baseline.size();
                baseline.forEach(b -> baselineFamilyIds.add(b.getFamilyId()));
            } catch (Exception e) {
                log.warn("Could not load baseline scheme {}: {}", req.baseSchemeId(), e.getMessage());
            }
        }

        List<String> familyIds = webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/ids?limit=" + simulationMaxFamilies)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<String>>() {})
                .blockOptional()
                .orElse(List.of());

        long totalFamiliesInRegistry = familyIds.size();
        try {
            Map<String, Long> stats = webClient.get()
                    .uri(familyRegistryBaseUrl + "/v1/families/stats")
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Long>>() {})
                    .blockOptional()
                    .orElse(Map.of());
            totalFamiliesInRegistry = stats.getOrDefault("totalFamilies", (long) familyIds.size());
        } catch (Exception e) {
            log.warn("Could not load family stats: {}", e.getMessage());
        }

        List<SimulatedBeneficiary> samplePool = new ArrayList<>();
        List<String> removedNames = new ArrayList<>();
        Map<String, Integer> districtBreakdown = new LinkedHashMap<>();
        Map<String, Map<String, Integer>> talukaBreakdownRaw = new LinkedHashMap<>();
        Map<String, Map<String, Map<String, Integer>>> villageBreakdownRaw = new LinkedHashMap<>();
        Map<String, Integer> casteBreakdownRaw = new LinkedHashMap<>();
        Map<String, Integer> genderBreakdownRaw = new LinkedHashMap<>();
        int rawProjected = 0;
        final int sampleCap = 200;

        for (String familyId : familyIds) {
            FamilyData family;
            try {
                family = fetchFamilyData(familyId);
            } catch (Exception e) {
                log.warn("Skipping family {} in simulation: {}", familyId, e.getMessage());
                continue;
            }
            if (family == null || family.getMembers() == null || family.getMembers().isEmpty()) continue;

            boolean qualifies = finalConditions != null
                    ? ruleEvaluatorService.evaluate(finalConditions, finalLogic, family)
                    : simulateEligibility(family, params);
            FamilyData.MemberData head = findHead(family);

            if (qualifies) {
                rawProjected++;
                List<String> criteria = finalConditions != null
                        ? ruleEvaluatorService.describe(finalConditions)
                        : buildSimulateCriteria(family, params);
                String district = family.getDistrict() != null ? family.getDistrict() : "Unknown";
                String taluka = family.getTaluka() != null && !family.getTaluka().isBlank()
                        ? family.getTaluka() : "Unknown";
                String village = family.getVillage() != null && !family.getVillage().isBlank()
                        ? family.getVillage() : "Unknown";
                long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0;

                FamilyData.MemberData display = head;
                if (params.minAge() != null || params.maxAge() != null) {
                    display = family.getMembers().stream()
                            .filter(m -> m.getDob() != null && Boolean.TRUE.equals(m.getIsAlive()))
                            .filter(m -> {
                                int a = ageFromDob(m.getDob());
                                return (params.minAge() == null || a >= params.minAge())
                                    && (params.maxAge() == null || a <= params.maxAge());
                            })
                            .findFirst()
                            .orElse(head);
                }
                int displayAge = (display != null && display.getDob() != null) ? ageFromDob(display.getDob()) : 0;

                String displayPersonId = display != null && display.getPersonId() != null
                        ? display.getPersonId().toString() : null;
                String caste = head != null ? head.getCasteCategory() : null;
                String gender = head != null ? head.getGender() : null;

                casteBreakdownRaw.merge(caste != null ? caste : "Unknown", 1, Integer::sum);
                genderBreakdownRaw.merge(gender != null ? gender : "Unknown", 1, Integer::sum);
                districtBreakdown.merge(district, 1, Integer::sum);
                talukaBreakdownRaw.computeIfAbsent(district, k -> new LinkedHashMap<>())
                        .merge(taluka, 1, Integer::sum);
                villageBreakdownRaw.computeIfAbsent(district, k -> new LinkedHashMap<>())
                        .computeIfAbsent(taluka, k -> new LinkedHashMap<>())
                        .merge(village, 1, Integer::sum);

                if (samplePool.size() < sampleCap * 3) {
                    SimulatedBeneficiary row = new SimulatedBeneficiary(
                            display != null ? display.getName() : (head != null ? head.getName() : "Unknown"),
                            displayPersonId,
                            familyId,
                            district,
                            taluka,
                            village,
                            displayAge,
                            income,
                            caste,
                            gender,
                            criteria
                    );
                    samplePool.add(row);
                }
            } else if (baselineFamilyIds.contains(familyId) && removedNames.size() < 50) {
                removedNames.add(head != null ? head.getName() : familyId);
            }
        }

        int evaluated = familyIds.size();
        double scale = evaluated > 0 && totalFamiliesInRegistry > evaluated
                ? (double) totalFamiliesInRegistry / evaluated
                : 1.0d;
        int extrapolatedCount = (int) Math.round(rawProjected * scale);

        Map<String, Integer> sortedDistrict = scaleBreakdownMap(districtBreakdown, scale);
        Map<String, Map<String, Integer>> sortedTaluka = scaleNestedTalukaBreakdown(talukaBreakdownRaw, scale);
        Map<String, Map<String, Map<String, Integer>>> sortedVillage =
                scaleNestedVillageBreakdown(villageBreakdownRaw, scale);

        List<SimulatedBeneficiary> display = stratifiedBeneficiarySample(samplePool, sampleCap);

        Map<String, Integer> casteBreakdown = casteBreakdownRaw.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a,
                        LinkedHashMap::new));
        Map<String, Integer> genderBreakdown = genderBreakdownRaw.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a,
                        LinkedHashMap::new));

        Long totalAnnualCost = null;
        Long currentAnnualCost = null;
        Long costDelta = null;
        Map<String, Long> districtBudget = null;
        Map<String, Map<String, Long>> talukaBudget = null;
        Map<String, Map<String, Map<String, Long>>> villageBudget = null;
        Map<String, Long> casteBudget = null;
        Map<String, Long> genderBudget = null;
        List<YearlyBudget> yearlyProjection = null;

        Long benefit = params.benefitAmountPerYear();
        if (benefit != null && benefit > 0) {
            totalAnnualCost = (long) extrapolatedCount * benefit;
            currentAnnualCost = (long) currentCount * benefit;
            costDelta = totalAnnualCost - currentAnnualCost;

            districtBudget = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> e : sortedDistrict.entrySet()) {
                districtBudget.put(e.getKey(), (long) e.getValue() * benefit);
            }

            talukaBudget = buildTalukaBudget(sortedTaluka, benefit);
            villageBudget = buildVillageBudget(sortedVillage, benefit);

            casteBudget = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> e : casteBreakdown.entrySet()) {
                int scaled = scale > 1.0d
                        ? (int) Math.round(e.getValue() * scale)
                        : e.getValue();
                casteBudget.put(e.getKey(), (long) scaled * benefit);
            }

            genderBudget = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> e : genderBreakdown.entrySet()) {
                int scaled = scale > 1.0d
                        ? (int) Math.round(e.getValue() * scale)
                        : e.getValue();
                genderBudget.put(e.getKey(), (long) scaled * benefit);
            }

            Map<String, Integer> scaledCasteBreakdown = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> e : casteBreakdown.entrySet()) {
                scaledCasteBreakdown.put(e.getKey(),
                        scale > 1.0d ? (int) Math.round(e.getValue() * scale) : e.getValue());
            }
            casteBreakdown = scaledCasteBreakdown;

            Map<String, Integer> scaledGenderBreakdown = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> e : genderBreakdown.entrySet()) {
                scaledGenderBreakdown.put(e.getKey(),
                        scale > 1.0d ? (int) Math.round(e.getValue() * scale) : e.getValue());
            }
            genderBreakdown = scaledGenderBreakdown;

            int years = params.projectionYears() != null
                    ? Math.min(Math.max(params.projectionYears(), 1), 10) : 5;
            double growthRate = params.annualGrowthRate() != null ? params.annualGrowthRate() : 0.03;
            double attritionRate = params.annualAttritionRate() != null ? params.annualAttritionRate() : 0.0;
            double netRate = growthRate - attritionRate;
            yearlyProjection = new ArrayList<>();
            for (int y = 1; y <= years; y++) {
                int count = (int) Math.round(extrapolatedCount * Math.pow(1 + netRate, y - 1));
                long cost = (long) count * benefit;
                yearlyProjection.add(new YearlyBudget(y, count, cost));
            }
        }

        log.info(
                "Simulation complete: evaluated {} of {} families in {}ms, {} projected (extrapolated {})",
                evaluated, totalFamiliesInRegistry, System.currentTimeMillis() - startMs,
                rawProjected, extrapolatedCount
        );

        return new SimulateResponse(
                currentCount,
                extrapolatedCount,
                extrapolatedCount - currentCount,
                display,
                removedNames,
                sortedDistrict,
                sortedTaluka,
                sortedVillage,
                totalAnnualCost,
                currentAnnualCost,
                costDelta,
                districtBudget,
                talukaBudget,
                villageBudget,
                casteBreakdown,
                casteBudget,
                genderBreakdown,
                genderBudget,
                yearlyProjection,
                finalRuleName
        );
    }

    private Map<String, Integer> scaleBreakdownMap(Map<String, Integer> raw, double scale) {
        return raw.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> (int) Math.round(e.getValue() * scale),
                        (a, b) -> a,
                        LinkedHashMap::new
                ));
    }

    private Map<String, Map<String, Integer>> scaleNestedTalukaBreakdown(
            Map<String, Map<String, Integer>> raw, double scale) {
        Map<String, Map<String, Integer>> result = new LinkedHashMap<>();
        raw.entrySet().stream()
                .sorted((a, b) -> Integer.compare(
                        b.getValue().values().stream().mapToInt(Integer::intValue).sum(),
                        a.getValue().values().stream().mapToInt(Integer::intValue).sum()))
                .forEach(de -> {
                    Map<String, Integer> talukas = de.getValue().entrySet().stream()
                            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                            .collect(Collectors.toMap(
                                    Map.Entry::getKey,
                                    e -> (int) Math.round(e.getValue() * scale),
                                    (a, b) -> a,
                                    LinkedHashMap::new
                            ));
                    result.put(de.getKey(), talukas);
                });
        return result;
    }

    private Map<String, Map<String, Map<String, Integer>>> scaleNestedVillageBreakdown(
            Map<String, Map<String, Map<String, Integer>>> raw, double scale) {
        Map<String, Map<String, Map<String, Integer>>> result = new LinkedHashMap<>();
        raw.forEach((district, talukaMap) -> {
            Map<String, Map<String, Integer>> talukas = new LinkedHashMap<>();
            talukaMap.entrySet().stream()
                    .sorted((a, b) -> Integer.compare(
                            b.getValue().values().stream().mapToInt(Integer::intValue).sum(),
                            a.getValue().values().stream().mapToInt(Integer::intValue).sum()))
                    .forEach(te -> {
                        Map<String, Integer> villages = te.getValue().entrySet().stream()
                                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                                .collect(Collectors.toMap(
                                        Map.Entry::getKey,
                                        e -> (int) Math.round(e.getValue() * scale),
                                        (a, b) -> a,
                                        LinkedHashMap::new
                                ));
                        talukas.put(te.getKey(), villages);
                    });
            result.put(district, talukas);
        });
        return result;
    }

    private Map<String, Map<String, Long>> buildTalukaBudget(
            Map<String, Map<String, Integer>> talukaBreakdown, long benefit) {
        Map<String, Map<String, Long>> result = new LinkedHashMap<>();
        talukaBreakdown.forEach((district, talukas) -> {
            Map<String, Long> budgets = new LinkedHashMap<>();
            talukas.forEach((taluka, count) -> budgets.put(taluka, (long) count * benefit));
            result.put(district, budgets);
        });
        return result;
    }

    private Map<String, Map<String, Map<String, Long>>> buildVillageBudget(
            Map<String, Map<String, Map<String, Integer>>> villageBreakdown, long benefit) {
        Map<String, Map<String, Map<String, Long>>> result = new LinkedHashMap<>();
        villageBreakdown.forEach((district, talukaMap) -> {
            Map<String, Map<String, Long>> talukas = new LinkedHashMap<>();
            talukaMap.forEach((taluka, villages) -> {
                Map<String, Long> budgets = new LinkedHashMap<>();
                villages.forEach((village, count) -> budgets.put(village, (long) count * benefit));
                talukas.put(taluka, budgets);
            });
            result.put(district, talukas);
        });
        return result;
    }

    private List<SimulatedBeneficiary> stratifiedBeneficiarySample(List<SimulatedBeneficiary> all, int maxSize) {
        if (all.size() <= maxSize) {
            return new ArrayList<>(all);
        }
        Map<String, List<SimulatedBeneficiary>> byDistrict = all.stream()
                .collect(Collectors.groupingBy(b -> b.district() != null ? b.district() : "Unknown"));
        List<SimulatedBeneficiary> sample = new ArrayList<>();
        int total = all.size();
        for (List<SimulatedBeneficiary> districtList : byDistrict.values()) {
            int quota = Math.max(1, (int) Math.round((double) districtList.size() / total * maxSize));
            for (int i = 0; i < Math.min(quota, districtList.size()); i++) {
                sample.add(districtList.get(i));
            }
        }
        if (sample.size() > maxSize) {
            return new ArrayList<>(sample.subList(0, maxSize));
        }
        if (sample.size() < maxSize) {
            Set<String> seen = sample.stream()
                    .map(b -> b.personId() + "|" + b.familyId())
                    .collect(Collectors.toSet());
            for (SimulatedBeneficiary b : all) {
                if (sample.size() >= maxSize) break;
                String key = b.personId() + "|" + b.familyId();
                if (seen.add(key)) {
                    sample.add(b);
                }
            }
        }
        return sample;
    }

    private boolean isCashScheme(Scheme scheme) {
        if (scheme == null || scheme.getBenefitType() == null) return false;
        String bt = scheme.getBenefitType().toUpperCase();
        return bt.contains("CASH") || "MONTHLY".equals(bt) || "ANNUAL".equals(bt);
    }

    public GeographicBreakdownDTO getGeographicBreakdown(UUID schemeId) {
        Scheme scheme = schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        Map<String, Map<String, Long>> grouped = new LinkedHashMap<>();
        for (Object[] row : beneficiaryRepository.aggregateDistrictTaluka(schemeId)) {
            String district = row[0] != null ? row[0].toString() : "Unknown";
            String taluka = row[1] != null ? row[1].toString() : "Unknown";
            long count = row[2] instanceof Number n ? n.longValue() : Long.parseLong(row[2].toString());
            grouped.computeIfAbsent(district, k -> new LinkedHashMap<>()).merge(taluka, count, Long::sum);
        }

        List<GeographicBreakdownDTO.DistrictData> districts = new ArrayList<>();
        for (Map.Entry<String, Map<String, Long>> districtEntry : grouped.entrySet()) {
            List<GeographicBreakdownDTO.TalukaData> talukas = new ArrayList<>();
            long districtTotal = 0;
            for (Map.Entry<String, Long> talukaEntry : districtEntry.getValue().entrySet()) {
                districtTotal += talukaEntry.getValue();
                GeographicBreakdownDTO.TalukaData td = new GeographicBreakdownDTO.TalukaData();
                td.setTalukaName(talukaEntry.getKey());
                td.setCitizenCount(talukaEntry.getValue());
                td.setCitizens(List.of());
                talukas.add(td);
            }
            GeographicBreakdownDTO.DistrictData dd = new GeographicBreakdownDTO.DistrictData();
            dd.setDistrictName(districtEntry.getKey());
            dd.setTotalCitizens(districtTotal);
            dd.setTalukas(talukas);
            districts.add(dd);
        }

        GeographicBreakdownDTO dto = new GeographicBreakdownDTO();
        dto.setSchemeId(schemeId);
        dto.setSchemeName(scheme.getName());
        dto.setDistricts(districts);
        return dto;
    }

    public GeographicLevelResponse getGeographicDistricts(
            UUID schemeId, String search, String sortBy, String sortDir, int offset, int limit) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));
        return paginateGeographicLevel(
                toGeographicRows(beneficiaryRepository.aggregateDistricts(schemeId)),
                search, sortBy, sortDir, offset, limit);
    }

    public GeographicLevelResponse getGeographicTalukas(
            UUID schemeId, String district, String search, String sortBy, String sortDir, int offset, int limit) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));
        return paginateGeographicLevel(
                toGeographicRows(beneficiaryRepository.aggregateTalukas(schemeId, district)),
                search, sortBy, sortDir, offset, limit);
    }

    public GeographicLevelResponse getGeographicVillages(
            UUID schemeId, String district, String taluka, String search, String sortBy, String sortDir, int offset, int limit) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));
        return paginateGeographicLevel(
                toGeographicRows(beneficiaryRepository.aggregateVillages(schemeId, district, taluka)),
                search, sortBy, sortDir, offset, limit);
    }

    private List<GeographicLevelResponse.GeographicLevelRow> toGeographicRows(List<Object[]> rows) {
        List<GeographicLevelResponse.GeographicLevelRow> result = new ArrayList<>();
        for (Object[] row : rows) {
            String name = row[0] != null ? row[0].toString() : "Unknown";
            long count = row[1] instanceof Number n ? n.longValue() : Long.parseLong(row[1].toString());
            result.add(new GeographicLevelResponse.GeographicLevelRow(name, count));
        }
        return result;
    }

    private GeographicLevelResponse paginateGeographicLevel(
            List<GeographicLevelResponse.GeographicLevelRow> rows,
            String search,
            String sortBy,
            String sortDir,
            int offset,
            int limit) {
        String q = blankToNull(search);
        List<GeographicLevelResponse.GeographicLevelRow> filtered = rows.stream()
                .filter(r -> q == null || r.name().toLowerCase().contains(q.toLowerCase()))
                .sorted(buildGeoComparator(sortBy, sortDir))
                .toList();

        int safeLimit = Math.min(Math.max(limit, 1), 100);
        int safeOffset = Math.max(offset, 0);
        int end = Math.min(safeOffset + safeLimit, filtered.size());
        List<GeographicLevelResponse.GeographicLevelRow> page =
                safeOffset >= filtered.size() ? List.of() : filtered.subList(safeOffset, end);

        return new GeographicLevelResponse(page, filtered.size(), safeLimit, safeOffset);
    }

    private Comparator<GeographicLevelResponse.GeographicLevelRow> buildGeoComparator(String sortBy, String sortDir) {
        boolean desc = "desc".equalsIgnoreCase(sortDir);
        Comparator<GeographicLevelResponse.GeographicLevelRow> cmp =
                "count".equalsIgnoreCase(sortBy)
                        ? Comparator.comparingLong(GeographicLevelResponse.GeographicLevelRow::beneficiaryCount)
                        : Comparator.comparing(r -> r.name().toLowerCase());
        return desc ? cmp.reversed() : cmp;
    }

    public CitizenListResponse getCitizensForScheme(
            UUID schemeId,
            String district,
            String taluka,
            String search,
            int offset,
            int limit) {
        Scheme scheme = schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        int safeLimit = Math.min(Math.max(limit, 1), 500);
        int safeOffset = Math.max(offset, 0);
        String districtParam = blankToNull(district);
        String talukaParam = blankToNull(taluka);
        String searchParam = blankToNull(search);

        long total = beneficiaryRepository.countCitizens(
                schemeId, districtParam, talukaParam, searchParam);
        List<BeneficiaryResponse> results = beneficiaryRepository.searchCitizens(
                        schemeId, districtParam, talukaParam, searchParam,
                        PageRequest.of(safeOffset / safeLimit, safeLimit))
                .stream()
                .map(b -> toBeneficiaryResponse(b, scheme.getName()))
                .toList();

        return new CitizenListResponse(results, total, safeLimit, safeOffset);
    }

    public List<GeographicBreakdownDTO.CitizenSummary> getTalukaCitizens(
            UUID schemeId, String district, String taluka, int limit) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        int safeLimit = Math.min(Math.max(limit, 1), 200);
        return beneficiaryRepository.searchCitizens(
                        schemeId, district, taluka, null, PageRequest.of(0, safeLimit))
                .stream()
                .map(b -> {
                    GeographicBreakdownDTO.CitizenSummary cs = new GeographicBreakdownDTO.CitizenSummary();
                    cs.setPersonId(b.getPersonId());
                    cs.setPersonName(b.getPersonName());
                    cs.setFamilyId(b.getFamilyId());
                    cs.setVillage(b.getFamilyVillage());
                    cs.setStatus(b.getStatus());
                    cs.setIdentifiedAt(b.getIdentifiedAt());
                    return cs;
                })
                .toList();
    }

    public SchemeDistributionDTO getSchemeDistribution(UUID schemeId) {
        schemeRepository.findById(schemeId)
                .orElseThrow(() -> new NoSuchElementException("Scheme not found: " + schemeId));

        Map<String, Long> casteCounts = new LinkedHashMap<>();
        Map<String, Long> districtCounts = new LinkedHashMap<>();
        Map<String, Long> genderCounts = new LinkedHashMap<>();
        long total = 0;

        for (Object[] row : beneficiaryRepository.countDistributionByScheme(schemeId)) {
            long count = row[3] instanceof Number n ? n.longValue() : Long.parseLong(row[3].toString());
            total += count;
            String caste = row[0] != null ? row[0].toString().toUpperCase() : "GENERAL";
            String district = row[1] != null ? row[1].toString() : "Unknown";
            String genderKey = genderLabel(row[2] != null ? row[2].toString() : null);
            casteCounts.merge(caste, count, Long::sum);
            districtCounts.merge(district, count, Long::sum);
            genderCounts.merge(genderKey, count, Long::sum);
        }

        List<DistributionGeoRow> talukaRows = beneficiaryRepository.aggregateDistrictTaluka(schemeId).stream()
                .map(row -> toDistributionGeoRow(row, false))
                .sorted((a, b) -> Long.compare(b.count(), a.count()))
                .limit(25)
                .toList();

        List<DistributionGeoRow> villageRows = beneficiaryRepository.aggregateTopVillages(schemeId, 25).stream()
                .map(row -> toDistributionGeoRow(row, true))
                .toList();

        return new SchemeDistributionDTO(total, casteCounts, districtCounts, genderCounts, talukaRows, villageRows);
    }

    private DistributionGeoRow toDistributionGeoRow(Object[] row, boolean includeVillage) {
        long count = row[row.length - 1] instanceof Number n
                ? n.longValue()
                : Long.parseLong(row[row.length - 1].toString());
        String district = row[0] != null ? row[0].toString() : "Unknown";
        String taluka = row[1] != null ? row[1].toString() : "Unknown";
        String village = includeVillage && row.length > 3 && row[2] != null ? row[2].toString() : null;
        return new DistributionGeoRow(district, taluka, village, count);
    }

    private String genderLabel(String gender) {
        if (gender == null || gender.isBlank()) {
            return "Other";
        }
        if (gender.toUpperCase().startsWith("F")) {
            return "Female";
        }
        if (gender.toUpperCase().startsWith("M")) {
            return "Male";
        }
        return "Other";
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @Transactional
    public int backfillGeography() {
        int updated = beneficiaryDashboardQuery.backfillGeographyFromFamilyRegistry();
        if (updated > 0) {
            return updated;
        }
        List<Beneficiary> all = beneficiaryRepository.findAll();
        int fallbackUpdated = 0;
        Map<String, FamilyData> cache = new HashMap<>();
        for (Beneficiary b : all) {
            if (b.getFamilyDistrict() != null && b.getFamilyTaluka() != null) {
                continue;
            }
            String fid = b.getFamilyId();
            try {
                FamilyData family = cache.computeIfAbsent(fid, this::fetchFamilyData);
                b.setFamilyDistrict(family.getDistrict());
                b.setFamilyTaluka(family.getTaluka());
                if (b.getFamilyVillage() == null) {
                    b.setFamilyVillage(family.getVillage());
                }
                beneficiaryRepository.save(b);
                fallbackUpdated++;
            } catch (RuntimeException ex) {
                log.warn("Skipping backfill for family {}: {}", fid, ex.getMessage());
            }
        }
        return fallbackUpdated;
    }

    private void applyRequest(Scheme scheme, SchemeRequest req) {
        scheme.setName(req.name());
        scheme.setNameGujarati(req.nameGujarati());
        scheme.setDescription(req.description());
        scheme.setDepartment(req.department());
        scheme.setBenefitType(req.benefitType());
        scheme.setBenefitValue(req.benefitValue());
        scheme.setIncomeCeiling(req.incomeCeiling());
        scheme.setEligibleCastes(req.eligibleCastes());
        scheme.setMinAge(req.minAge());
        scheme.setMaxAge(req.maxAge());
        scheme.setGender(req.gender() != null ? req.gender() : "ANY");
        scheme.setDistrictScope(req.districtScope());
        scheme.setValidFrom(req.validFrom());
        scheme.setValidTo(req.validTo());
        scheme.setCreatedBy(req.createdBy());
        scheme.setCategory(req.category());
        scheme.setMinPercentile(req.minPercentile());
        scheme.setDiplomaMinPercentage(req.diplomaMinPercentage());
        scheme.setNeetMbbsEligible(req.neetMbbsEligible() != null ? req.neetMbbsEligible() : false);
        scheme.setIsActive(true);
    }

    private BeneficiaryResponse toBeneficiaryResponse(Beneficiary beneficiary, String schemeName) {
        return new BeneficiaryResponse(
                beneficiary.getId(),
                beneficiary.getSchemeId(),
                schemeName,
                beneficiary.getFamilyId(),
                beneficiary.getPersonId(),
                beneficiary.getPersonName(),
                beneficiary.getFamilyVillage(),
                beneficiary.getFamilyDistrict(),
                beneficiary.getFamilyTaluka(),
                beneficiary.getStatus(),
                beneficiary.getIdentifiedAt(),
                beneficiary.getConfirmedAt(),
                beneficiary.getRemovedAt(),
                beneficiary.getRemovalReason(),
                beneficiary.getEligibilityReason(),
                beneficiary.getDisbursementStatus(),
                beneficiary.getDisbursedAt(),
                beneficiary.getDisbursementRef(),
                beneficiary.getConfirmedBy(),
                beneficiary.getOverrideBy(),
                beneficiary.getOverrideReason(),
                beneficiary.getCasteCategory(),
                beneficiary.getGender(),
                beneficiary.getAmount(),
                beneficiary.getTuitionAmount(),
                beneficiary.getBoardingAmount(),
                beneficiary.getBooksAmount()
        );
    }

    private String formatBenefit(String benefitValue, String benefitType) {
        if (benefitValue == null || benefitValue.isBlank()) {
            return "payment";
        }
        long value;
        try {
            value = Long.parseLong(benefitValue.replaceAll("[^0-9]", ""));
        } catch (NumberFormatException e) {
            return benefitValue;
        }
        String formatted = value >= 100_000
                ? String.format("₹%.0fL", value / 100_000.0)
                : "₹" + String.format("%,d", value);
        if (benefitType != null && benefitType.contains("MONTHLY")) {
            return formatted + "/month";
        }
        if (benefitType != null && benefitType.contains("ANNUAL")) {
            return formatted + "/year";
        }
        return formatted;
    }

    private void sendDisbursementNotification(Beneficiary b, String schemeName,
                                              String amount, String ref) {
        String aadhaarRef = resolveAadhaarRef(b);
        if (aadhaarRef == null || aadhaarRef.isBlank()) {
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("aadhaarRef", aadhaarRef);
        payload.put("title", "Scheme Disbursement Processed");
        payload.put("message", schemeName + ": " + amount
                + " has been credited to your registered bank account. Ref: " + ref);
        payload.put("serviceName", "Scheme Engine");
        payload.put("trackingId", b.getId().toString());

        try {
            restTemplate.postForObject(NOTIFICATIONS_URL, payload, Void.class);
        } catch (Exception e) {
            log.warn("Notification POST failed: {}", e.getMessage());
        }
    }

    private String resolveAadhaarRef(Beneficiary b) {
        if (b.getFamilyId() == null) {
            return null;
        }
        try {
            Map<String, Object> familyMap = webClient.get()
                    .uri(familyRegistryBaseUrl + "/v1/families/{id}", b.getFamilyId())
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();
            if (familyMap == null) {
                return null;
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> members = (List<Map<String, Object>>) familyMap.get("members");
            if (members == null) {
                return null;
            }

            for (Map<String, Object> m : members) {
                if ("HEAD".equalsIgnoreCase(stringVal(m.get("relationshipToHead")))
                        && Boolean.TRUE.equals(m.get("isAlive"))) {
                    String aadhaar = stringVal(m.get("aadhaarRef"));
                    if (aadhaar != null && !aadhaar.isBlank()) {
                        return aadhaar;
                    }
                }
            }

            for (String preferredRel : List.of("OTHER", "SPOUSE")) {
                for (Map<String, Object> m : members) {
                    if (preferredRel.equalsIgnoreCase(stringVal(m.get("relationshipToHead")))
                            && Boolean.TRUE.equals(m.get("isAlive"))) {
                        String aadhaar = stringVal(m.get("aadhaarRef"));
                        if (aadhaar != null && !aadhaar.isBlank()) {
                            return aadhaar;
                        }
                    }
                }
            }

            if (b.getPersonId() != null) {
                for (Map<String, Object> m : members) {
                    if (b.getPersonId().equals(stringVal(m.get("id")))) {
                        String aadhaar = stringVal(m.get("aadhaarRef"));
                        if (aadhaar != null && !aadhaar.isBlank()) {
                            return aadhaar;
                        }
                    }
                }
            }

            for (Map<String, Object> m : members) {
                if (Boolean.TRUE.equals(m.get("isAlive"))) {
                    String aadhaar = stringVal(m.get("aadhaarRef"));
                    if (aadhaar != null && !aadhaar.isBlank()) {
                        return aadhaar;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not resolve aadhaarRef for beneficiary {}: {}", b.getId(), e.getMessage());
        }
        return null;
    }

    private static String stringVal(Object value) {
        return value != null ? value.toString() : null;
    }

    private static Long numberVal(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return 0L;
    }

    private static Double doubleVal(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return null;
    }

    public OpsSummary getOpsSummary() {
        Map<String, Object> familyStats = webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/stats")
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .blockOptional()
                .orElse(Map.of("totalFamilies", 0, "totalPersons", 0));

        long totalFamilies = numberVal(familyStats.get("totalFamilies"));
        long totalPersons = numberVal(familyStats.get("totalPersons"));

        Map<String, Long> fraudCounts = getFraudSignals().stream()
                .collect(Collectors.groupingBy(FraudSignalDTO::severity, Collectors.counting()));

        long openGrievances = 0;
        long resolvedGrievances = 0;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> gStats = restTemplate.getForObject(
                    "http://grievance-service.citizen.svc.cluster.local:8089/grievance-service/v1/grievances/stats",
                    Map.class);
            if (gStats != null) {
                openGrievances = numberVal(gStats.get("openGrievances"));
                resolvedGrievances = numberVal(gStats.get("resolvedGrievances"));
            }
        } catch (Exception e) {
            log.warn("Grievance stats unavailable: {}", e.getMessage());
        }

        return new OpsSummary(
                totalFamilies,
                totalPersons,
                beneficiaryRepository.count(),
                schemeRepository.count(),
                fraudCounts,
                openGrievances,
                resolvedGrievances
        );
    }

    @Transactional
    public BirthdayCheckResult runBirthdayCheck(LocalDate date) {
        LocalDate checkDate = date != null ? date : LocalDate.now();
        List<String> familyIds = webClient.get()
                .uri(familyRegistryBaseUrl + "/v1/families/ids")
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<String>>() {})
                .blockOptional()
                .orElse(List.of());

        List<Scheme> activeSchemes = schemeRepository.findByIsActiveTrue();
        int personsTurning18 = 0;
        int newlyIdentified = 0;
        int notificationsSent = 0;

        for (String familyId : familyIds) {
            FamilyData family;
            try {
                family = fetchFamilyData(familyId);
            } catch (RuntimeException ex) {
                continue;
            }
            boolean familyHasBirthday = false;
            for (FamilyData.MemberData member : family.getMembers()) {
                if (member.getDob() == null || !Boolean.TRUE.equals(member.getIsAlive())) {
                    continue;
                }
                String gender = member.getGender();
                if (gender == null
                        || (!gender.equalsIgnoreCase("F") && !gender.equalsIgnoreCase("FEMALE"))) {
                    continue;
                }
                if (!member.getDob().plusYears(18).equals(checkDate)) {
                    continue;
                }
                personsTurning18++;
                familyHasBirthday = true;
            }
            if (!familyHasBirthday) {
                continue;
            }
            for (Scheme scheme : activeSchemes) {
                if (!isGirlChildScheme(scheme)) {
                    continue;
                }
                if (evaluateEligibility(scheme, family) && !hasEnrolledBeneficiary(scheme.getId(), familyId)) {
                    createIdentifiedBeneficiary(scheme, familyId, family);
                    newlyIdentified++;
                    for (FamilyData.MemberData member : family.getMembers()) {
                        if (member.getDob() != null
                                && member.getDob().plusYears(18).equals(checkDate)
                                && isFemale(member.getGender())
                                && member.getAadhaarRef() != null) {
                            sendBirthdayNotification(member.getAadhaarRef(), scheme.getName());
                            notificationsSent++;
                            break;
                        }
                    }
                }
            }
        }
        return new BirthdayCheckResult(personsTurning18, newlyIdentified, notificationsSent);
    }

    private boolean isGirlChildScheme(Scheme scheme) {
        return scheme.getName() != null && scheme.getName().toLowerCase().contains("girl");
    }

    private boolean isFemale(String gender) {
        return gender != null
                && (gender.equalsIgnoreCase("F") || gender.equalsIgnoreCase("FEMALE"));
    }

    private void sendBirthdayNotification(String aadhaarRef, String schemeName) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("aadhaarRef", aadhaarRef);
        payload.put("title", "New Scheme Eligibility");
        payload.put("message", "You are now eligible for " + schemeName + ". Check your scheme status.");
        payload.put("serviceName", "Scheme Engine");
        payload.put("trackingId", schemeName);
        try {
            restTemplate.postForObject(NOTIFICATIONS_URL, payload, Void.class);
        } catch (Exception e) {
            log.warn("Birthday notification failed: {}", e.getMessage());
        }
    }
}
