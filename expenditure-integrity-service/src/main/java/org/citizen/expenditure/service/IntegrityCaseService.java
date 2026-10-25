package org.citizen.expenditure.service;

import org.citizen.expenditure.client.FamilyRegistryClient;
import org.citizen.expenditure.domain.ActionStatus;
import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.CaseStatus;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IntegrityCaseService {

    private final IntegrityCaseRepository caseRepo;
    private final IntegrityAlertRepository alertRepo;
    private final IntegrityActionRepository actionRepo;
    private final IntegrityAuditLogRepository auditRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final EntitlementUnitRepository unitRepo;
    private final MasterChangeLogRepository changeLogRepo;
    private final VerificationEventRepository eventRepo;
    private final EmployeeIdentityRepository employeeRepo;
    private final PersonDisplayNameService displayNames;
    private final FamilyRegistryClient familyRegistry;

    @Value("${officer.integrity.recovery-approval-threshold:100000}")
    private BigDecimal recoveryApprovalThreshold;

    @Value("${officer.integrity.verify-needs-second-person:false}")
    private boolean verifyNeedsSecondPerson;

    public IntegrityCaseService(
            IntegrityCaseRepository caseRepo,
            IntegrityAlertRepository alertRepo,
            IntegrityActionRepository actionRepo,
            IntegrityAuditLogRepository auditRepo,
            PaymentSettlementRepository paymentRepo,
            EntitlementUnitRepository unitRepo,
            MasterChangeLogRepository changeLogRepo,
            VerificationEventRepository eventRepo,
            EmployeeIdentityRepository employeeRepo,
            PersonDisplayNameService displayNames,
            FamilyRegistryClient familyRegistry) {
        this.caseRepo = caseRepo;
        this.alertRepo = alertRepo;
        this.actionRepo = actionRepo;
        this.auditRepo = auditRepo;
        this.paymentRepo = paymentRepo;
        this.unitRepo = unitRepo;
        this.changeLogRepo = changeLogRepo;
        this.eventRepo = eventRepo;
        this.employeeRepo = employeeRepo;
        this.displayNames = displayNames;
        this.familyRegistry = familyRegistry;
    }

    public List<IntegrityAlert> listAlerts(IntegrityDomain domain, String ruleCode, String status,
                                           String district, String taluka, UUID schemeId, String ddoCode) {
        return listAlerts(domain, ruleCode, status, district, taluka, schemeId, ddoCode, null, null, null);
    }

    public List<IntegrityAlert> listAlerts(IntegrityDomain domain, String ruleCode, String status,
                                           String district, String taluka, UUID schemeId, String ddoCode,
                                           ActionType actionType) {
        return listAlerts(domain, ruleCode, status, district, taluka, schemeId, ddoCode, actionType, null, null);
    }

    public List<IntegrityAlert> listAlerts(IntegrityDomain domain, String ruleCode, String status,
                                           String district, String taluka, UUID schemeId, String ddoCode,
                                           ActionType actionType, LocalDate periodStart, LocalDate periodEnd) {
        List<IntegrityAlert> list = domain != null
                ? alertRepo.findByDomainAndStatus(domain, status != null ? status : "OPEN")
                : alertRepo.findAll();
        if (ruleCode != null && !ruleCode.isBlank()) {
            list = list.stream().filter(a -> ruleCode.equals(a.getRuleCode())).toList();
        }
        if (status != null && domain == null) {
            list = list.stream().filter(a -> status.equals(a.getStatus())).toList();
        }
        if (actionType != null) {
            Set<UUID> caseIds = actionRepo.findByActionType(actionType).stream()
                    .filter(a -> actionType != ActionType.RECOVERY_RECORD || IntegrityActionSupport.countsAsRecovery(a))
                    .map(IntegrityAction::getCaseId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            list = list.stream().filter(a -> a.getCaseId() != null && caseIds.contains(a.getCaseId())).toList();
        } else if (domain == IntegrityDomain.PAYROLL && "RESOLVED".equals(status)) {
            Set<UUID> recoveryCaseIds = actionRepo.findByActionType(ActionType.RECOVERY_RECORD).stream()
                    .filter(IntegrityActionSupport::countsAsRecovery)
                    .map(IntegrityAction::getCaseId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            list = list.stream()
                    .filter(a -> a.getCaseId() == null || !recoveryCaseIds.contains(a.getCaseId()))
                    .toList();
        }
        list = list.stream().peek(this::enrichAlertForDisplay).toList();
        if (domain == IntegrityDomain.PAYROLL) {
            list = list.stream().filter(a -> matchesPayrollScope(a, district, taluka, ddoCode)).toList();
            if (periodStart != null || periodEnd != null) {
                list = list.stream().filter(a -> matchesPayrollPeriod(a, periodStart, periodEnd)).toList();
            }
        } else {
            if (district != null && !district.isBlank()) {
                String d = district.trim().toLowerCase();
                list = list.stream().filter(a -> a.getDistrict() != null && a.getDistrict().toLowerCase().equals(d)).toList();
            }
            if (taluka != null && !taluka.isBlank()) {
                String t = taluka.trim().toLowerCase();
                list = list.stream().filter(a -> a.getTaluka() != null && a.getTaluka().toLowerCase().equals(t)).toList();
            }
            if (ddoCode != null && !ddoCode.isBlank()) {
                list = list.stream().filter(a -> matchesDdoFilter(a, ddoCode, null)).toList();
            }
        }
        if (schemeId != null) {
            list = list.stream().filter(a -> schemeId.equals(a.getSchemeId())).toList();
        }
        return list.stream()
                .sorted(Comparator.comparing(IntegrityAlert::getDetectedAt).reversed())
                .toList();
    }

    private void alignPayrollAlertGeoFromEmployee(IntegrityAlert alert) {
        if (alert.getDomain() != IntegrityDomain.PAYROLL || alert.getPersonId() == null) {
            return;
        }
        employeeRepo.findByEmployeeCode(alert.getPersonId()).ifPresent(emp -> {
            if (emp.getDistrict() != null) {
                alert.setDistrict(emp.getDistrict());
            }
            if (emp.getTaluka() != null) {
                alert.setTaluka(emp.getTaluka());
            }
            if (alert.getEvidence() != null && emp.getDdoCode() != null && !alert.getEvidence().containsKey("ddoCode")) {
                alert.getEvidence().put("ddoCode", emp.getDdoCode());
            }
        });
        if (alert.getDistrict() == null || alert.getTaluka() == null) {
            PayrollGeoSupport.inferFromEmployeeCode(alert.getPersonId()).ifPresent(geo -> {
                if (alert.getDistrict() == null) {
                    alert.setDistrict(geo.district());
                }
                if (alert.getTaluka() == null) {
                    alert.setTaluka(geo.taluka());
                }
            });
        }
    }

    private boolean matchesPayrollScope(IntegrityAlert alert, String district, String taluka, String ddoCode) {
        boolean wantDistrict = district != null && !district.isBlank();
        boolean wantTaluka = taluka != null && !taluka.isBlank();
        boolean wantDdo = ddoCode != null && !ddoCode.isBlank();
        if (!wantDistrict && !wantTaluka && !wantDdo) {
            return true;
        }
        EmployeeIdentity emp = alert.getPersonId() != null
                ? employeeRepo.findByEmployeeCode(alert.getPersonId()).orElse(null)
                : null;
        String d = wantDistrict ? district.trim() : null;
        String t = wantTaluka ? taluka.trim() : null;
        String resolvedDistrict = firstNonBlank(
                emp != null ? emp.getDistrict() : null,
                alert.getDistrict(),
                PayrollGeoSupport.inferFromEmployeeCode(alert.getPersonId()).map(PayrollGeoSupport.Geo::district).orElse(null));
        String resolvedTaluka = firstNonBlank(
                emp != null ? emp.getTaluka() : null,
                alert.getTaluka(),
                PayrollGeoSupport.inferFromEmployeeCode(alert.getPersonId()).map(PayrollGeoSupport.Geo::taluka).orElse(null));
        if (wantDistrict && (resolvedDistrict == null || !resolvedDistrict.equalsIgnoreCase(d))) {
            return false;
        }
        if (wantTaluka && (resolvedTaluka == null || !resolvedTaluka.equalsIgnoreCase(t))) {
            return false;
        }
        if (wantDdo && !matchesDdoFilter(alert, ddoCode, emp)) {
            return false;
        }
        return true;
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    /**
     * Pay period filter uses the evidence pay span when the check has one (overlap or settlement dates).
     * Pension record checks have no pay month — they stay in the list. Detection date is not a pay period.
     */
    private static boolean matchesPayrollPeriod(IntegrityAlert alert, LocalDate periodStart, LocalDate periodEnd) {
        LocalDate windowStart = periodStart != null ? periodStart : LocalDate.MIN;
        LocalDate windowEnd = periodEnd != null ? periodEnd : LocalDate.MAX;
        Map<String, Object> ev = alert.getEvidence();
        if (ev == null) {
            return true;
        }
        LocalDate spanStart = firstEvidenceDate(ev, "overlapStart", "periodStart");
        LocalDate spanEnd = firstEvidenceDate(ev, "overlapEnd", "periodEnd");
        if (spanStart == null || spanEnd == null) {
            return true;
        }
        return !spanEnd.isBefore(windowStart) && !spanStart.isAfter(windowEnd);
    }

    private static LocalDate firstEvidenceDate(Map<String, Object> ev, String... keys) {
        for (String key : keys) {
            LocalDate d = parseEvidenceDate(ev.get(key));
            if (d != null) {
                return d;
            }
        }
        return null;
    }

    private static LocalDate parseEvidenceDate(Object raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.toString().trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean matchesDdoFilter(IntegrityAlert alert, String ddoCode, EmployeeIdentity emp) {
        if (ddoCode == null || ddoCode.isBlank()) {
            return true;
        }
        String want = ddoCode.trim().toLowerCase();
        if (emp != null && emp.getDdoCode() != null && emp.getDdoCode().trim().toLowerCase().equals(want)) {
            return true;
        }
        if (alert.getEvidence() != null) {
            for (String key : List.of("ddoCode", "ddoA", "ddoB")) {
                Object v = alert.getEvidence().get(key);
                if (v != null && v.toString().trim().toLowerCase().equals(want)) {
                    return true;
                }
            }
        }
        return false;
    }

    private void applyRegistryNameToUnit(EntitlementUnit unit) {
        if (unit == null || unit.getPersonId() == null) {
            return;
        }
        IntegrityAlert scratch = new IntegrityAlert();
        scratch.setPersonId(unit.getPersonId());
        scratch.setPersonName(unit.getPersonName());
        displayNames.applyBeneficiaryDisplayName(scratch, unit);
        if (scratch.getPersonName() != null && !scratch.getPersonName().isBlank()) {
            unit.setPersonName(scratch.getPersonName());
        }
    }

    private void enrichAlertForDisplay(IntegrityAlert alert) {
        if (alert.getDomain() == IntegrityDomain.BENEFICIARY) {
            EntitlementUnit unit = resolveEntitlementUnitForAlert(alert);
            alignAlertFieldsFromEntitlement(alert, unit);
            displayNames.applyBeneficiaryDisplayName(alert, unit);
            return;
        }
        alignPayrollAlertGeoFromEmployee(alert);
    }

    /** Inbox labels must match family registry / entitlement master, not stale text stored when the alert was raised. */
    private void alignAlertFieldsFromEntitlement(IntegrityAlert alert, EntitlementUnit unit) {
        if (unit == null) {
            return;
        }
        if (unit.getPersonId() != null && !unit.getPersonId().isBlank()) {
            alert.setPersonId(unit.getPersonId());
        }
        if (unit.getDistrict() != null && !unit.getDistrict().isBlank()) {
            alert.setDistrict(unit.getDistrict());
        }
        if (unit.getTaluka() != null && !unit.getTaluka().isBlank()) {
            alert.setTaluka(unit.getTaluka());
        }
        if (unit.getSchemeId() != null) {
            alert.setSchemeId(unit.getSchemeId());
        }
        if (unit.getSchemeName() != null && !unit.getSchemeName().isBlank()) {
            alert.setSchemeName(unit.getSchemeName());
        }
    }

    private EntitlementUnit resolveEntitlementUnitForAlert(IntegrityAlert alert) {
        UUID unitId = firstUnitIdFromEvidence(alert.getEvidence());
        if (unitId == null) {
            unitId = unitIdFromPaymentEvidence(alert.getEvidence());
        }
        if (unitId != null) {
            return unitRepo.findById(unitId).orElse(null);
        }
        if (alert.getPersonId() == null || alert.getPersonId().isBlank()) {
            return null;
        }
        List<EntitlementUnit> units = unitRepo.findByPersonId(alert.getPersonId());
        if (units.isEmpty()) {
            return null;
        }
        if (alert.getSchemeId() != null) {
            return units.stream()
                    .filter(u -> alert.getSchemeId().equals(u.getSchemeId()))
                    .findFirst()
                    .orElse(units.get(0));
        }
        return units.get(0);
    }

    private UUID unitIdFromPaymentEvidence(Map<String, Object> evidence) {
        return parseUuid(evidence != null ? evidence.get("paymentId") : null)
                .flatMap(paymentRepo::findById)
                .map(PaymentSettlement::getUnitId)
                .orElse(null);
    }

    private static Optional<UUID> parseUuid(Object value) {
        if (value instanceof UUID u) {
            return Optional.of(u);
        }
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(UUID.fromString(String.valueOf(value)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static List<UUID> unitIdsFromEvidence(Map<String, Object> evidence) {
        LinkedHashSet<UUID> ids = new LinkedHashSet<>();
        if (evidence == null) {
            return List.of();
        }
        Object raw = evidence.get("unitIds");
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                parseUuid(item).ifPresent(ids::add);
            }
        }
        parseUuid(evidence.get("conflictingUnitId")).ifPresent(ids::add);
        return List.copyOf(ids);
    }

    private static UUID firstUnitIdFromEvidence(Map<String, Object> evidence) {
        List<UUID> ids = unitIdsFromEvidence(evidence);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static Map<String, Object> toOfficerUnit(EntitlementUnit u) {
        Map<String, Object> row = new LinkedHashMap<>();
        if (u.getPersonId() != null && !u.getPersonId().isBlank()) row.put("personId", u.getPersonId());
        if (u.getPersonName() != null && !u.getPersonName().isBlank()) row.put("personName", u.getPersonName());
        if (u.getFamilyId() != null && !u.getFamilyId().isBlank()) row.put("familyId", u.getFamilyId());
        if (u.getSchemeName() != null && !u.getSchemeName().isBlank()) row.put("schemeName", u.getSchemeName());
        if (u.getPeriodStart() != null) row.put("periodStart", u.getPeriodStart().toString());
        if (u.getPeriodEnd() != null) row.put("periodEnd", u.getPeriodEnd().toString());
        if (u.getAuthorizedAmount() != null) row.put("authorizedAmount", u.getAuthorizedAmount());
        if (u.getStatus() != null && !u.getStatus().isBlank()) row.put("status", u.getStatus());
        if (u.getDistrict() != null && !u.getDistrict().isBlank()) row.put("district", u.getDistrict());
        if (u.getTaluka() != null && !u.getTaluka().isBlank()) row.put("taluka", u.getTaluka());
        return row;
    }

    private static Map<String, Object> toOfficerPayment(PaymentSettlement p) {
        Map<String, Object> row = new LinkedHashMap<>();
        if (p.getAmount() != null) row.put("amount", p.getAmount());
        if (p.getPeriodStart() != null) row.put("periodStart", p.getPeriodStart().toString());
        if (p.getPeriodEnd() != null) row.put("periodEnd", p.getPeriodEnd().toString());
        if (p.getStatus() != null && !p.getStatus().isBlank()) row.put("status", p.getStatus());
        if (p.getBankToken() != null && !p.getBankToken().isBlank()) row.put("bankAccount", p.getBankToken());
        if (p.getTransactionRef() != null && !p.getTransactionRef().isBlank()) row.put("transactionRef", p.getTransactionRef());
        return row;
    }

    public Optional<IntegrityDomain> domainOf(UUID caseId) {
        return caseRepo.findById(caseId).map(IntegrityCase::getDomain);
    }

    public Optional<CaseDetail> getCaseDetail(UUID caseId) {
        return caseRepo.findById(caseId).map(c -> {
            List<IntegrityAlert> alerts = alertRepo.findByCaseId(caseId).stream()
                    .peek(this::enrichAlertForDisplay)
                    .toList();
            List<IntegrityAction> actions = actionRepo.findByCaseIdOrderByCreatedAtDesc(caseId);
            List<IntegrityAuditLog> audit = auditRepo.findByCaseIdOrderByCreatedAtDesc(caseId);
            Map<String, Object> evidenceExtras = buildEvidenceExtras(alerts);
            return new CaseDetail(c, alerts, actions, audit, evidenceExtras);
        });
    }

    private Map<String, Object> buildEvidenceExtras(List<IntegrityAlert> alerts) {
        Map<String, Object> extras = new LinkedHashMap<>();
        for (IntegrityAlert a : alerts) {
            if (a.getPersonId() != null) {
                extras.put("verificationEvents", eventRepo.findByPersonId(a.getPersonId()));
                extras.put("masterChanges", changeLogRepo.findByPersonId(a.getPersonId()));
            }
            EntitlementUnit primaryUnit = null;
            List<UUID> unitIds = resolveUnitIdsForAlert(a);
            if (!unitIds.isEmpty()) {
                List<Map<String, Object>> relatedUnits = new ArrayList<>();
                List<Map<String, Object>> relatedPayments = new ArrayList<>();
                for (UUID unitId : unitIds) {
                    Optional<EntitlementUnit> unitOpt = unitRepo.findById(unitId);
                    if (unitOpt.isPresent()) {
                        EntitlementUnit u = unitOpt.get();
                        if (primaryUnit == null) {
                            primaryUnit = u;
                        }
                        applyRegistryNameToUnit(u);
                        Map<String, Object> officerUnit = toOfficerUnit(u);
                        relatedUnits.add(officerUnit);
                        extras.putIfAbsent("entitlementUnit", officerUnit);
                    }
                    for (PaymentSettlement p : paymentRepo.findByUnitId(unitId)) {
                        relatedPayments.add(toOfficerPayment(p));
                    }
                }
                extras.put("relatedEntitlements", relatedUnits);
                extras.put("relatedPayments", relatedPayments);
                extras.put("payments", paymentRepo.findByUnitId(unitIds.get(0)));
            }
            if (a.getDomain() == IntegrityDomain.BENEFICIARY) {
                extras.putIfAbsent("personLink", buildPersonLink(a, primaryUnit));
            }
        }
        return extras;
    }

    public List<UUID> resolveUnitIdsForAlert(IntegrityAlert alert) {
        List<UUID> unitIds = new ArrayList<>(unitIdsFromEvidence(alert.getEvidence()));
        if (unitIds.isEmpty()) {
            UUID fromPayment = unitIdFromPaymentEvidence(alert.getEvidence());
            if (fromPayment != null) {
                unitIds.add(fromPayment);
            }
        }
        if (unitIds.isEmpty() && alert.getEvidence() != null && alert.getEvidence().get("paymentIds") instanceof List<?> payments) {
            // the payments an alert is about name the entitlement they were paid under, even when the alert's own person id is stale
            for (Object raw : payments) {
                parseUuid(raw).flatMap(paymentRepo::findById).map(PaymentSettlement::getUnitId)
                        .filter(id -> !unitIds.contains(id)).ifPresent(unitIds::add);
            }
        }
        if (unitIds.isEmpty() && alert.getPersonId() != null && alert.getSchemeId() != null) {
            unitRepo.findByPersonId(alert.getPersonId()).stream()
                    .filter(u -> alert.getSchemeId().equals(u.getSchemeId()))
                    .map(EntitlementUnit::getId)
                    .findFirst()
                    .ifPresent(unitIds::add);
        }
        return unitIds;
    }

    private Map<String, Object> buildPersonLink(IntegrityAlert alert, EntitlementUnit unit) {
        Map<String, Object> link = new LinkedHashMap<>();
        String personId = unit != null && unit.getPersonId() != null ? unit.getPersonId() : alert.getPersonId();
        String familyId = unit != null ? unit.getFamilyId() : null;
        if ((familyId == null || familyId.isBlank()) && personId != null) {
            familyId = unitRepo.findByPersonId(personId).stream()
                    .map(EntitlementUnit::getFamilyId)
                    .filter(Objects::nonNull)
                    .filter(f -> !f.isBlank())
                    .findFirst()
                    .orElse(null);
        }
        if (personId != null) {
            link.put("personId", personId);
        }
        if (familyId != null) {
            link.put("familyId", familyId);
        }
        String name = unit != null && unit.getPersonName() != null ? unit.getPersonName() : alert.getPersonName();
        if (name != null) {
            link.put("personName", name);
        }
        if (personId != null && familyId != null) {
            familyRegistry.findMaskedAadhaar(personId, familyId).ifPresent(m -> link.put("maskedAadhaar", m));
        }
        return link;
    }

    private IntegrityCase openCase(UUID caseId) {
        IntegrityCase c = caseRepo.findById(caseId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        if (c.getStatus() == CaseStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case is closed and takes no further changes.");
        }
        return c;
    }

    /** An alert stays in the inbox until its case has an outcome or is closed; after that it is resolved. */
    private void resolveAlerts(UUID caseId) {
        for (IntegrityAlert a : alertRepo.findByCaseId(caseId)) {
            if ("OPEN".equals(a.getStatus())) {
                a.setStatus("RESOLVED");
                alertRepo.save(a);
            }
        }
    }

    @Transactional
    public IntegrityCase assign(UUID caseId, String assignee, Jwt jwt) {
        if (assignee == null || assignee.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An assignee is required.");
        }
        IntegrityCase c = openCase(caseId);
        c.setAssignee(assignee.trim());
        c.setStatus(CaseStatus.UNDER_REVIEW);
        c.setUpdatedAt(LocalDateTime.now());
        audit(caseId, jwt, "ASSIGN", Map.of("assignee", c.getAssignee()));
        return caseRepo.save(c);
    }

    @Transactional
    public IntegrityCase recordDecision(UUID caseId, CaseClassification classification, String decisionText,
                                        boolean noticeRequired, Jwt jwt) {
        if (classification == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A classification is required.");
        }
        if (decisionText == null || decisionText.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason is required: say what was checked and why it leads to this classification.");
        }
        IntegrityCase c = caseRepo.findById(caseId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        if (c.getStatus() == CaseStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case is closed. Reopen it on appeal before recording a new decision.");
        }
        if (c.getStatus() == CaseStatus.ACTION_RECORDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An outcome is already recorded. Reopen the case on appeal before changing the decision.");
        }
        // a decision can still be corrected until an outcome is recorded; once it is, only an appeal changes it
        if (c.getStatus() != CaseStatus.OPEN && c.getStatus() != CaseStatus.UNDER_REVIEW && c.getStatus() != CaseStatus.DECIDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case cannot take a decision in its current state.");
        }
        CaseClassification previous = c.getClassification();
        c.setClassification(classification);
        c.setDecisionText(decisionText.trim());
        c.setNoticeRequired(noticeRequired);
        c.setStatus(classification == CaseClassification.DISMISSED ? CaseStatus.CLOSED : CaseStatus.DECIDED);
        c.setUpdatedAt(LocalDateTime.now());
        Map<String, Object> auditDetails = new LinkedHashMap<>();
        auditDetails.put("classification", classification.name());
        auditDetails.put("noticeRequired", noticeRequired);
        if (previous != null) {
            auditDetails.put("previousClassification", previous.name());
        }
        audit(caseId, jwt, "DECISION", auditDetails);
        if (previous == CaseClassification.CONFIRMED_OVERPAYMENT
                && classification != CaseClassification.CONFIRMED_OVERPAYMENT) {
            audit(caseId, jwt, "OVERTURN", Map.of(
                    "from", previous.name(),
                    "to", classification.name()));
        }
        if (c.getStatus() == CaseStatus.CLOSED) resolveAlerts(caseId);
        return caseRepo.save(c);
    }

    /** Puts a decided or closed case back under review so an appeal can change the classification. History is kept. */
    @Transactional
    public IntegrityCase reopenOnAppeal(UUID caseId, String reason, Jwt jwt) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An appeal reason is required.");
        }
        IntegrityCase c = caseRepo.findById(caseId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        if (c.getStatus() != CaseStatus.DECIDED && c.getStatus() != CaseStatus.ACTION_RECORDED && c.getStatus() != CaseStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a decided or closed case can be reopened on appeal.");
        }
        if (c.getClassification() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case has no decision to appeal.");
        }
        c.setStatus(CaseStatus.UNDER_REVIEW);
        c.setVerifiedAt(null);
        c.setVerifiedBy(null);
        c.setVerificationNote(null);
        c.setUpdatedAt(LocalDateTime.now());
        audit(caseId, jwt, "REOPEN_APPEAL", Map.of("reason", reason.trim()));
        return caseRepo.save(c);
    }

    /**
     * Records an outcome. Closing without action needs no decision. Any other outcome needs one, and a recovery needs
     * the overpayment to be confirmed: the use case allows recovery only after the department has confirmed it.
     */
    @Transactional
    public IntegrityAction recordAction(UUID caseId, ActionType type, Map<String, Object> payload, Jwt jwt) {
        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An outcome type is required.");
        }
        IntegrityCase c = openCase(caseId);
        if (type != ActionType.DISMISS && c.getClassification() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Record a decision on this case before recording an outcome.");
        }
        if (type == ActionType.RECOVERY_RECORD && c.getClassification() != CaseClassification.CONFIRMED_OVERPAYMENT) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A recovery can be recorded only once the overpayment is confirmed.");
        }
        IntegrityAction action = new IntegrityAction();
        action.setCaseId(caseId);
        action.setActionType(type);
        action.setAuthoriser(jwt.getSubject());
        action.setPayload(payload != null ? payload : Map.of());
        action.setExternalRef("GOV-INT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());

        if (type == ActionType.RECOVERY_RECORD && recoveryNeedsApproval(action.getPayload())) {
            action.setActionStatus(ActionStatus.PENDING);
            action.setRequestedBy(jwt.getSubject());
            action.setRequestedByRole(actorRoles(jwt));
            actionRepo.save(action);
            c.setUpdatedAt(LocalDateTime.now());
            caseRepo.save(c);
            audit(caseId, jwt, "RECOVERY_REQUESTED", Map.of(
                    "externalRef", action.getExternalRef(),
                    "amount", action.getPayload().get("amount"),
                    "actionId", action.getId()));
            return action;
        }

        action.setActionStatus(ActionStatus.APPROVED);
        action.setRequestedBy(jwt.getSubject());
        actionRepo.save(action);
        applyOutcome(c, type);
        caseRepo.save(c);
        audit(caseId, jwt, "ACTION_" + type.name(), Map.of("externalRef", action.getExternalRef(), "payload", action.getPayload()));
        resolveAlerts(caseId);
        return action;
    }

    @Transactional
    public IntegrityAction approveRecovery(UUID caseId, UUID actionId, Jwt jwt) {
        IntegrityAction action = pendingRecovery(caseId, actionId);
        assertDifferentPerson(action, jwt, "The same officer cannot approve their own recovery request.");
        action.setActionStatus(ActionStatus.APPROVED);
        action.setDecidedBy(jwt.getSubject());
        action.setDecidedAt(LocalDateTime.now());
        actionRepo.save(action);
        IntegrityCase c = openCase(caseId);
        applyOutcome(c, ActionType.RECOVERY_RECORD);
        caseRepo.save(c);
        audit(caseId, jwt, "RECOVERY_APPROVED", Map.of("externalRef", action.getExternalRef(), "actionId", actionId));
        resolveAlerts(caseId);
        return action;
    }

    @Transactional
    public IntegrityAction rejectRecovery(UUID caseId, UUID actionId, String reason, Jwt jwt) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason is required to reject a recovery request.");
        }
        IntegrityAction action = pendingRecovery(caseId, actionId);
        assertDifferentPerson(action, jwt, "The same officer cannot reject their own recovery request.");
        action.setActionStatus(ActionStatus.REJECTED);
        action.setDecidedBy(jwt.getSubject());
        action.setDecidedAt(LocalDateTime.now());
        action.setDecisionNote(reason.trim());
        actionRepo.save(action);
        IntegrityCase c = caseRepo.findById(caseId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        c.setUpdatedAt(LocalDateTime.now());
        caseRepo.save(c);
        audit(caseId, jwt, "RECOVERY_REJECTED", Map.of("externalRef", action.getExternalRef(), "reason", action.getDecisionNote()));
        return action;
    }

    public long countRecoveriesPendingApproval() {
        return actionRepo.findByActionType(ActionType.RECOVERY_RECORD).stream()
                .filter(a -> a.getActionStatus() == ActionStatus.PENDING)
                .count();
    }

    private IntegrityAction pendingRecovery(UUID caseId, UUID actionId) {
        IntegrityAction action = actionRepo.findById(actionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Outcome not found."));
        if (!caseId.equals(action.getCaseId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Outcome not found.");
        }
        if (action.getActionType() != ActionType.RECOVERY_RECORD || action.getActionStatus() != ActionStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This recovery is not waiting for approval.");
        }
        return action;
    }

    private void applyOutcome(IntegrityCase c, ActionType type) {
        c.setStatus(type == ActionType.DISMISS ? CaseStatus.CLOSED : CaseStatus.ACTION_RECORDED);
        c.setUpdatedAt(LocalDateTime.now());
    }

    private boolean recoveryNeedsApproval(Map<String, Object> payload) {
        BigDecimal amount = IntegrityActionSupport.recoveryAmount(payload);
        return amount != null && amount.compareTo(recoveryApprovalThreshold) >= 0;
    }

    private static void assertDifferentPerson(IntegrityAction action, Jwt jwt, String message) {
        String requester = IntegrityActionSupport.requesterSubject(action);
        if (requester != null && requester.equals(jwt.getSubject())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        }
    }

    private static String actorRoles(Jwt jwt) {
        return String.join(",", org.citizen.expenditure.security.OfficerRoleNormalizer.normalizedRoles(jwt));
    }

    /** Closes a case whose outcome is recorded, once someone has checked that the fix holds. The note says how it was checked. */
    @Transactional
    public IntegrityCase verifyClosed(UUID caseId, String note, Jwt jwt) {
        IntegrityCase c = caseRepo.findById(caseId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        if (c.getStatus() == CaseStatus.CLOSED && c.getVerifiedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case has already been verified closed.");
        }
        if (c.getStatus() != CaseStatus.ACTION_RECORDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a case with a recorded outcome can be verified closed.");
        }
        if (note == null || note.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say how you checked that the fix holds.");
        }
        if (verifyNeedsSecondPerson) {
            actionRepo.findByCaseIdOrderByCreatedAtDesc(caseId).stream()
                    .filter(a -> a.getActionType() != ActionType.DISMISS)
                    .findFirst()
                    .ifPresent(a -> {
                        if (jwt.getSubject().equals(IntegrityActionSupport.requesterSubject(a))) {
                            throw new ResponseStatusException(HttpStatus.CONFLICT,
                                    "Verification must be done by a different officer from the one who recorded the outcome.");
                        }
                    });
        }
        c.setStatus(CaseStatus.CLOSED);
        c.setVerifiedAt(LocalDateTime.now());
        c.setVerifiedBy(jwt.getSubject());
        c.setVerificationNote(note.trim());
        c.setUpdatedAt(LocalDateTime.now());
        caseRepo.save(c);
        audit(caseId, jwt, "VERIFIED_CLOSED", Map.of("note", c.getVerificationNote()));
        return c;
    }

    private void audit(UUID caseId, Jwt jwt, String action, Map<String, Object> details) {
        IntegrityAuditLog log = new IntegrityAuditLog();
        log.setCaseId(caseId);
        log.setActor(jwt.getSubject());
        log.setActorRole(String.join(",", org.citizen.expenditure.security.OfficerRoleNormalizer.normalizedRoles(jwt)));
        log.setAction(action);
        log.setDetails(details);
        auditRepo.save(log);
    }

    public record CaseDetail(
            IntegrityCase caseEntity,
            List<IntegrityAlert> alerts,
            List<IntegrityAction> actions,
            List<IntegrityAuditLog> auditLog,
            Map<String, Object> evidenceContext) {}
}
