package org.citizen.expenditure.service;

import org.citizen.expenditure.client.SchemeEngineClient;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DetectionEngineService {

    private final EntitlementUnitRepository unitRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final VerificationEventRepository eventRepo;
    private final MasterChangeLogRepository changeLogRepo;
    private final MutualExclusionSchemePairRepository mutualRepo;
    private final SchemeGraceConfigRepository graceRepo;
    private final EmployeeIdentityRepository employeeRepo;
    private final PayrollSettlementRepository payrollRepo;
    private final PensionAuthorisationRepository pensionRepo;
    private final ServiceEventRepository serviceEventRepo;
    private final IntegrityAlertRepository alertRepo;
    private final IntegrityCaseRepository caseRepo;
    private final SchemeEngineClient schemeEngineClient;
    private final PersonDisplayNameService displayNames;

    /** Set for the duration of runDetection or a what-if dry run (single-threaded per request). */
    /** The run in progress on this thread. A field shared between requests would let a what-if and a real run overwrite each other. */
    private final ThreadLocal<DetectionRunContext> currentRun = new ThreadLocal<>();

    @Value("${integrity.pilot.grace-days-after-death:30}")
    private int defaultGraceDays;

    @Value("${integrity.rule804.bank-token-min-units:4}")
    private int bankClusterMin;

    @Value("${integrity.rule805.operator-change-threshold:5}")
    private int operatorChangeThreshold;

    /** Bank changes approved under a reference with this prefix are an approved batch migration, left out of 805. */
    @Value("${integrity.rule805.batch-approval-prefix:BATCH-}")
    private String batchApprovalPrefix;

    @Value("${integrity.s06.bank-change-window-days:90}")
    private int bankChangeWindowDays;

    @Value("${integrity.s06.life-certificate-max-age-days:365}")
    private int lifeCertificateMaxAgeDays;

    public DetectionEngineService(
            EntitlementUnitRepository unitRepo,
            PaymentSettlementRepository paymentRepo,
            VerificationEventRepository eventRepo,
            MasterChangeLogRepository changeLogRepo,
            MutualExclusionSchemePairRepository mutualRepo,
            SchemeGraceConfigRepository graceRepo,
            EmployeeIdentityRepository employeeRepo,
            PayrollSettlementRepository payrollRepo,
            PensionAuthorisationRepository pensionRepo,
            ServiceEventRepository serviceEventRepo,
            IntegrityAlertRepository alertRepo,
            IntegrityCaseRepository caseRepo,
            SchemeEngineClient schemeEngineClient,
            PersonDisplayNameService displayNames) {
        this.unitRepo = unitRepo;
        this.paymentRepo = paymentRepo;
        this.eventRepo = eventRepo;
        this.changeLogRepo = changeLogRepo;
        this.mutualRepo = mutualRepo;
        this.graceRepo = graceRepo;
        this.employeeRepo = employeeRepo;
        this.payrollRepo = payrollRepo;
        this.pensionRepo = pensionRepo;
        this.serviceEventRepo = serviceEventRepo;
        this.alertRepo = alertRepo;
        this.caseRepo = caseRepo;
        this.schemeEngineClient = schemeEngineClient;
        this.displayNames = displayNames;
    }

    public DetectionSettings liveSettings() {
        return new DetectionSettings(defaultGraceDays, bankClusterMin, operatorChangeThreshold,
                batchApprovalPrefix, bankChangeWindowDays, lifeCertificateMaxAgeDays);
    }

    private DetectionSettings settings() {
        return currentRun.get() != null ? currentRun.get().settings() : liveSettings();
    }

    /**
     * Dry-run detection with explicit settings. When {@code skipSchemeEngineRules} is true, 806 and 807 are skipped
     * (what-if panel). Nothing is written to integrity_alert or integrity_case.
     */
    public List<CollectedFinding> collectFindings(DetectionSettings detectionSettings, boolean skipSchemeEngineRules) {
        currentRun.set(DetectionRunContext.collect(detectionSettings));
        try {
            DetectionRunRequest all = new DetectionRunRequest(null, null, null, null, null, null, null);
            if (runBeneficiaryDomain(all)) {
                List<EntitlementUnit> units = filterUnits(all);
                run801(units);
                run802(units);
                run803(units);
                run804(units);
                run805();
                if (!skipSchemeEngineRules) {
                    run807(units);
                    run806(units);
                }
            }
            if (runPayrollDomain(all)) {
                runPayrollRules(all);
            }
            return currentRun.get().findings();
        } finally {
            currentRun.remove();
        }
    }

    @Transactional
    public DetectionRunResult runDetection(DetectionRunRequest request) {
        currentRun.set(DetectionRunContext.persist(liveSettings()));
        try {
            int alertsCreated = 0;
            if (runBeneficiaryDomain(request)) {
                List<EntitlementUnit> units = filterUnits(request);
                alertsCreated += run801(units);
                alertsCreated += run802(units);
                alertsCreated += run803(units);
                alertsCreated += run804(units);
                alertsCreated += run805();
                // 807 asks the scheme engine only a few questions; it goes first because the engine allows 60 guest checks a
                // minute per caller and 806 (one check per entitlement) uses them all
                alertsCreated += run807(units);
                alertsCreated += run806(units);
            }
            if (runPayrollDomain(request)) {
                alertsCreated += runPayrollRules(request);
            }
            return new DetectionRunResult(alertsCreated, LocalDateTime.now());
        } finally {
            currentRun.remove();
        }
    }

    private static boolean runBeneficiaryDomain(DetectionRunRequest request) {
        return request.domains() == null || request.domains().isEmpty()
                || request.domains().contains(IntegrityDomain.BENEFICIARY);
    }

    private static boolean runPayrollDomain(DetectionRunRequest request) {
        return request.domains() == null || request.domains().isEmpty()
                || request.domains().contains(IntegrityDomain.PAYROLL);
    }

    private List<EntitlementUnit> filterUnits(DetectionRunRequest request) {
        List<EntitlementUnit> all = unitRepo.findAll();
        if (request.schemeIds() != null && !request.schemeIds().isEmpty()) {
            Set<UUID> ids = new HashSet<>(request.schemeIds());
            all = all.stream().filter(u -> ids.contains(u.getSchemeId())).toList();
        }
        if (request.districts() != null && !request.districts().isEmpty()) {
            Set<String> d = request.districts().stream().map(String::toLowerCase).collect(Collectors.toSet());
            all = all.stream().filter(u -> u.getDistrict() != null && d.contains(u.getDistrict().toLowerCase())).toList();
        }
        if (request.talukas() != null && !request.talukas().isEmpty()) {
            Set<String> t = request.talukas().stream().map(String::toLowerCase).collect(Collectors.toSet());
            all = all.stream().filter(u -> u.getTaluka() != null && t.contains(u.getTaluka().toLowerCase())).toList();
        }
        if (request.periodStart() != null) {
            all = all.stream().filter(u -> u.getPeriodEnd() == null || !u.getPeriodEnd().isBefore(request.periodStart())).toList();
        }
        if (request.periodEnd() != null) {
            all = all.stream().filter(u -> u.getPeriodStart() == null || !u.getPeriodStart().isAfter(request.periodEnd())).toList();
        }
        return all;
    }

    private int run801(List<EntitlementUnit> units) {
        int created = 0;
        Map<String, List<EntitlementUnit>> byPersonScheme = units.stream()
                .filter(u -> "ACTIVE".equalsIgnoreCase(u.getStatus()))
                .collect(Collectors.groupingBy(u -> u.getPersonId() + "|" + u.getSchemeId()));
        for (List<EntitlementUnit> group : byPersonScheme.values()) {
            if (group.size() < 2) continue;
            EntitlementUnit u = group.get(0);
            if (alertExists("801", u.getPersonId(), u.getSchemeId())) continue;
            created += persistAlert(IntegrityDomain.BENEFICIARY, "801", "HIGH", u,
                    Map.of("activeEnrollments", group.size(), "unitIds", group.stream().map(EntitlementUnit::getId).toList()),
                    BigDecimal.ZERO);
        }
        return created;
    }

    /**
     * 802 Conflicting entitlement. Two separate triggers, both raised as rule 802 (evidence "variant" tells them apart):
     * OVER_SETTLEMENT: net settled for one unit and period is more than the authorised entitlement;
     * MUTUAL_EXCLUSION: the same person holds active entitlements in two schemes marked mutually exclusive, for
     * overlapping periods. Reversals and unsettled payments never count.
     */
    private int run802(List<EntitlementUnit> units) {
        Set<String> mutualPairs = loadMutualPairs();
        return run802OverSettlement(units, mutualPairs) + run802MutualExclusion(units, mutualPairs);
    }

    private BigDecimal netSettled(UUID unitId) {
        return standingPayments(unitId).stream().map(PaymentSettlement::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private int run802OverSettlement(List<EntitlementUnit> units, Set<String> mutualPairs) {
        int created = 0;
        for (EntitlementUnit unit : units) {
            List<PaymentSettlement> payments = standingPayments(unit.getId());
            BigDecimal netPaid = payments.stream().map(PaymentSettlement::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal authorized = unit.getAuthorizedAmount() != null ? unit.getAuthorizedAmount() : BigDecimal.ZERO;
            BigDecimal delta = netPaid.subtract(authorized);
            if (delta.compareTo(BigDecimal.ZERO) <= 0) continue;
            if (alert802Exists(unit, "OVER_SETTLEMENT", null)) continue;
            created += persistAlert(IntegrityDomain.BENEFICIARY, "802", "HIGH", unit,
                    Map.of(
                            "variant", "OVER_SETTLEMENT",
                            "authorizedAmount", authorized,
                            "netSettled", netPaid,
                            "paymentIds", payments.stream().map(PaymentSettlement::getId).toList(),
                            "mutualExclusionConflict", hasMutualExclusionConflict(unit, units, mutualPairs)),
                    delta);
        }
        return created;
    }

    private int run802MutualExclusion(List<EntitlementUnit> units, Set<String> mutualPairs) {
        if (mutualPairs.isEmpty()) return 0;
        int created = 0;
        Map<String, List<EntitlementUnit>> byPerson = units.stream()
                .filter(u -> u.getPersonId() != null && "ACTIVE".equalsIgnoreCase(u.getStatus()))
                .collect(Collectors.groupingBy(EntitlementUnit::getPersonId));
        for (List<EntitlementUnit> held : byPerson.values()) {
            for (int i = 0; i < held.size(); i++) {
                for (int j = i + 1; j < held.size(); j++) {
                    EntitlementUnit x = held.get(i), y = held.get(j);
                    if (!mutualPairs.contains(pairKey(x.getSchemeId(), y.getSchemeId()))) continue;
                    if (!periodsOverlap(x.getPeriodStart(), x.getPeriodEnd(), y.getPeriodStart(), y.getPeriodEnd())) continue;
                    // the alert sits on the later entitlement: that is the one that should not have been granted
                    boolean yLater = y.getPeriodStart() != null && x.getPeriodStart() != null
                            ? y.getPeriodStart().isAfter(x.getPeriodStart())
                            : y.getId().toString().compareTo(x.getId().toString()) > 0;
                    EntitlementUnit later = yLater ? y : x, earlier = yLater ? x : y;
                    if (alert802Exists(later, "MUTUAL_EXCLUSION", earlier.getId())) continue;
                    BigDecimal settledOnLater = netSettled(later.getId());
                    Map<String, Object> evidence = new LinkedHashMap<>();
                    evidence.put("variant", "MUTUAL_EXCLUSION");
                    evidence.put("conflictingUnitId", earlier.getId());
                    evidence.put("conflictingSchemeId", earlier.getSchemeId());
                    evidence.put("conflictingSchemeName", earlier.getSchemeName());
                    // stored as ISO text: a LocalDate inside a JSON map would come back as [2024, 9, 1]
                    evidence.put("overlapStart", (later.getPeriodStart().isAfter(earlier.getPeriodStart())
                            ? later.getPeriodStart() : earlier.getPeriodStart()).toString());
                    evidence.put("overlapEnd", (later.getPeriodEnd().isBefore(earlier.getPeriodEnd())
                            ? later.getPeriodEnd() : earlier.getPeriodEnd()).toString());
                    evidence.put("settledOnLaterEntitlement", settledOnLater);
                    created += persistAlert(IntegrityDomain.BENEFICIARY, "802",
                            settledOnLater.signum() > 0 ? "HIGH" : "MEDIUM", later, evidence, settledOnLater);
                }
            }
        }
        return created;
    }

    /** Alerts raised before the "variant" field existed are over-settlement alerts. */
    private boolean alert802Exists(EntitlementUnit unit, String variant, UUID conflictingUnitId) {
        if (isCollecting()) {
            return currentRun.get().sessionAlerts().stream()
                    .filter(a -> "802".equals(a.getRuleCode()) && unit.getPersonId().equals(a.getPersonId()))
                    .filter(a -> unit.getSchemeId() == null || unit.getSchemeId().equals(a.getSchemeId()))
                    .anyMatch(a -> {
                        Map<String, Object> ev = a.getEvidence();
                        Object v = ev == null ? null : ev.get("variant");
                        if (!variant.equals(v == null ? "OVER_SETTLEMENT" : v)) return false;
                        return conflictingUnitId == null
                                || (ev != null && String.valueOf(conflictingUnitId).equals(String.valueOf(ev.get("conflictingUnitId"))));
                    });
        }
        return alertRepo.findByRuleCodeAndPersonId("802", unit.getPersonId()).stream()
                .filter(a -> unit.getSchemeId() == null || unit.getSchemeId().equals(a.getSchemeId()))
                .anyMatch(a -> {
                    Map<String, Object> ev = a.getEvidence();
                    Object v = ev == null ? null : ev.get("variant");
                    if (!variant.equals(v == null ? "OVER_SETTLEMENT" : v)) return false;
                    return conflictingUnitId == null
                            || (ev != null && String.valueOf(conflictingUnitId).equals(String.valueOf(ev.get("conflictingUnitId"))));
                });
    }

    /** Settled payments that still stand: reversal rows are left out, and so are the payments they reversed. */
    private List<PaymentSettlement> standingPayments(UUID unitId) {
        List<PaymentSettlement> all = paymentRepo.findByUnitId(unitId);
        Set<UUID> reversed = all.stream().map(PaymentSettlement::getReversalOf).filter(Objects::nonNull).collect(Collectors.toSet());
        return all.stream()
                .filter(p -> p.getReversalOf() == null && !reversed.contains(p.getId()) && "SETTLED".equalsIgnoreCase(p.getStatus()))
                .toList();
    }

    /** Payroll rows that still stand: reversal rows are left out, and so are the rows they reversed. */
    private static List<PayrollSettlement> standingPayroll(List<PayrollSettlement> all) {
        Set<UUID> reversed = all.stream().map(PayrollSettlement::getReversalOf).filter(Objects::nonNull).collect(Collectors.toSet());
        return all.stream().filter(p -> p.getReversalOf() == null && !reversed.contains(p.getId())).toList();
    }

    private int run803(List<EntitlementUnit> units) {
        int created = 0;
        for (EntitlementUnit unit : units) {
            List<VerificationEvent> events = eventRepo.findByPersonId(unit.getPersonId());
            for (VerificationEvent ev : events) {
                if (!isTerminatingEvent(ev.getEventType()) || ev.getEventDate() == null) continue;
                int grace = graceRepo.findBySchemeId(unit.getSchemeId())
                        .map(SchemeGraceConfig::getGraceDaysAfterTermination)
                        .orElse(settings().defaultGraceDays());
                LocalDate cutoff = ev.getEventDate().plusDays(grace);
                List<Map<String, Object>> violating = new ArrayList<>();
                BigDecimal totalDelta = BigDecimal.ZERO;
                for (PaymentSettlement p : standingPayments(unit.getId())) {
                    if (p.getPeriodEnd() == null || !p.getPeriodEnd().isAfter(cutoff)) continue;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("paymentId", p.getId());
                    row.put("amount", p.getAmount());
                    row.put("periodEnd", p.getPeriodEnd().toString());
                    violating.add(row);
                    if (p.getAmount() != null) {
                        totalDelta = totalDelta.add(p.getAmount());
                    }
                }
                if (violating.isEmpty() || alertExists("803", unit.getPersonId(), unit.getSchemeId())) continue;
                Map<String, Object> evidence803 = new LinkedHashMap<>();
                evidence803.put("eventType", ev.getEventType());
                evidence803.put("eventDate", ev.getEventDate().toString());
                evidence803.put("graceDays", grace);
                evidence803.put("unitIds", List.of(unit.getId()));
                evidence803.put("paymentIds", violating.stream().map(r -> r.get("paymentId")).toList());
                evidence803.put("payments", violating);
                if (violating.size() == 1) {
                    evidence803.put("paymentId", violating.get(0).get("paymentId"));
                }
                created += persistAlert(IntegrityDomain.BENEFICIARY, "803", "HIGH", unit, evidence803, totalDelta);
            }
        }
        return created;
    }

    /** 804: one bank destination receiving for many unrelated people. A family, or one person, counts once. */
    private int run804(List<EntitlementUnit> units) {
        Map<String, Set<String>> holdersByBank = new HashMap<>();
        Map<String, Set<UUID>> unitsByBank = new HashMap<>();
        for (EntitlementUnit unit : units) {
            String holder = unit.getFamilyId() != null && !unit.getFamilyId().isBlank() ? "family:" + unit.getFamilyId()
                    : "person:" + unit.getPersonId();
            for (PaymentSettlement p : standingPayments(unit.getId())) {
                if (p.getBankToken() == null) continue;
                holdersByBank.computeIfAbsent(p.getBankToken(), k -> new HashSet<>()).add(holder);
                unitsByBank.computeIfAbsent(p.getBankToken(), k -> new HashSet<>()).add(unit.getId());
            }
        }
        int created = 0;
        for (Map.Entry<String, Set<String>> e : holdersByBank.entrySet()) {
            if (e.getValue().size() < settings().bankClusterMin()) continue;
            Set<UUID> unitIds = unitsByBank.get(e.getKey());
            EntitlementUnit sample = units.stream().filter(u -> unitIds.contains(u.getId())).findFirst().orElse(null);
            if (sample == null) continue;
            if (alertExists("804", e.getKey(), sample.getSchemeId())) continue;
            created += persistAlert(IntegrityDomain.BENEFICIARY, "804", "MEDIUM", sample,
                    Map.of("bankToken", maskToken(e.getKey()), "distinctPeople", e.getValue().size(),
                            "distinctUnits", unitIds.size(), "unitIds", unitIds),
                    BigDecimal.ZERO);
        }
        return created;
    }

    private boolean approvedBatchChange(MasterChangeLog c) {
        return batchApprovalPrefix != null && !batchApprovalPrefix.isBlank() && c.getApprovalRef() != null
                && c.getApprovalRef().trim().toUpperCase().startsWith(batchApprovalPrefix.trim().toUpperCase());
    }

    /**
     * 805 Bank-change concentration: one operator replacing an unusual number of bank accounts in 30 days. Approved
     * batch migrations are left out and counted in the evidence; a change with only an individual approval reference
     * still counts, because the review for this rule is to verify those approvals.
     */
    private int run805() {
        LocalDateTime since = LocalDateTime.now().minusDays(30);
        List<MasterChangeLog> recent = changeLogRepo.findAll().stream()
                .filter(c -> "bank_token".equalsIgnoreCase(c.getFieldName()))
                .filter(c -> c.getChangedAt() != null && c.getChangedAt().isAfter(since))
                .filter(c -> c.getOperatorId() != null && !c.getOperatorId().isBlank())
                .toList();
        Map<String, Long> byOperator = recent.stream()
                .filter(c -> !approvedBatchChange(c))
                .collect(Collectors.groupingBy(MasterChangeLog::getOperatorId, Collectors.counting()));
        Map<String, Long> leftOut = recent.stream()
                .filter(this::approvedBatchChange)
                .collect(Collectors.groupingBy(MasterChangeLog::getOperatorId, Collectors.counting()));
        int created = 0;
        for (Map.Entry<String, Long> e : byOperator.entrySet()) {
            if (e.getValue() < settings().operatorChangeThreshold()) continue;
            if (alertExists("805", e.getKey(), null)) continue;
            IntegrityAlert alert = new IntegrityAlert();
            alert.setDomain(IntegrityDomain.BENEFICIARY);
            alert.setRuleCode("805");
            alert.setSeverity("MEDIUM");
            alert.setPersonId(e.getKey());
            alert.setPersonName("Operator " + e.getKey());
            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("operatorId", e.getKey());
            evidence.put("bankChanges30d", e.getValue());
            long excluded = leftOut.getOrDefault(e.getKey(), 0L);
            if (excluded > 0) evidence.put("approvedBatchChangesLeftOut", excluded);
            alert.setEvidence(evidence);
            created += saveAlertWithCase(alert);
        }
        return created;
    }

    /**
     * 806: the income or age on record fails the scheme's own rules. Only those two tests are read (see
     * SchemeEngineClient.failedIncomeOrAgeTests): an entitlement is not called a mismatch because of facts the unit
     * does not hold.
     */
    private int run806(List<EntitlementUnit> units) {
        int created = 0;
        for (EntitlementUnit unit : units) {
            if (unit.getSchemeId() == null) continue;
            long income = unit.getIncomeSnapshot() != null ? unit.getIncomeSnapshot() : 0;
            int age = unit.getAgeSnapshot() != null ? unit.getAgeSnapshot() : 18;
            List<String> failed = schemeEngineClient.failedIncomeOrAgeTests(unit.getSchemeId(), unit.getDistrict(), age, income);
            if (failed.isEmpty()) continue;
            if (alertExists("806", unit.getPersonId(), unit.getSchemeId())) continue;
            created += persistAlert(IntegrityDomain.BENEFICIARY, "806", "MEDIUM", unit,
                    Map.of("failedTests", failed, "incomeSnapshot", income, "ageSnapshot", age),
                    BigDecimal.ZERO);
        }
        return created;
    }

    /**
     * 807: a person on a government payroll receives an income-tested scheme whose limit their pay would breach. The
     * employee is linked to the beneficiary by person id. Only the income band goes into the evidence: the beneficiary
     * tab is open to roles that may not see individual salaries. A person already flagged by 806 (their income on record
     * already fails the scheme) is left to that rule.
     */
    private int run807(List<EntitlementUnit> units) {
        Map<String, EmployeeIdentity> byPerson = new HashMap<>();
        for (EmployeeIdentity e : employeeRepo.findAll()) {
            if (e.getPersonId() != null && !e.getPersonId().isBlank()) byPerson.putIfAbsent(e.getPersonId(), e);
        }
        if (byPerson.isEmpty()) return 0;
        Map<String, BigDecimal> annualByEmployee = new HashMap<>();
        Map<String, LocalDate> onPayrollSince = new HashMap<>();
        int created = 0;
        for (EntitlementUnit unit : units) {
            EmployeeIdentity emp = byPerson.get(unit.getPersonId());
            if (emp == null || unit.getSchemeId() == null || !"ACTIVE".equalsIgnoreCase(unit.getStatus())) continue;
            String code = emp.getEmployeeCode();
            if (!annualByEmployee.containsKey(code)) {
                List<PayrollSettlement> rows = standingPayroll(payrollRepo.findByEmployeeCode(code)).stream()
                        .filter(p -> p.getGrossAmount() != null && p.getPeriodStart() != null && p.getPeriodEnd() != null).toList();
                annualByEmployee.put(code, annualisedPay(rows));
                rows.stream().map(PayrollSettlement::getPeriodStart).min(Comparator.naturalOrder()).ifPresent(d -> onPayrollSince.put(code, d));
            }
            BigDecimal annual = annualByEmployee.get(code);
            if (annual == null || alertExists("806", unit.getPersonId(), unit.getSchemeId())) continue;
            if (alertExists("807", unit.getPersonId(), unit.getSchemeId())) continue;
            int age = unit.getAgeSnapshot() != null ? unit.getAgeSnapshot() : 18;
            String district = unit.getDistrict() != null ? unit.getDistrict() : emp.getDistrict();
            if (!schemeEngineClient.incomeBreachesScheme(unit.getSchemeId(), district, age, annual.longValue())) continue;
            LocalDate since = onPayrollSince.get(code);
            BigDecimal paidWhileEmployed = standingPayments(unit.getId()).stream()
                    .filter(p -> since == null || (p.getPeriodEnd() != null && !p.getPeriodEnd().isBefore(since)))
                    .map(PaymentSettlement::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("employeePost", emp.getPostTitle());
            evidence.put("ddoCode", emp.getDdoCode());
            evidence.put("annualPayBand", incomeBand(annual));
            if (unit.getIncomeSnapshot() != null) evidence.put("incomeOnRecord", unit.getIncomeSnapshot());
            evidence.put("amountPaidWhileEmployed", paidWhileEmployed);
            created += persistAlert(IntegrityDomain.BENEFICIARY, "807", paidWhileEmployed.signum() > 0 ? "HIGH" : "MEDIUM",
                    unit, evidence, paidWhileEmployed);
        }
        return created;
    }

    /** Pay over the latest 12 months of rows, scaled up to a year when fewer months are on file; null when under 30 days. */
    private static BigDecimal annualisedPay(List<PayrollSettlement> rows) {
        if (rows.isEmpty()) return null;
        LocalDate latest = rows.stream().map(PayrollSettlement::getPeriodEnd).max(Comparator.naturalOrder()).get();
        LocalDate from = latest.minusDays(364);
        List<PayrollSettlement> recent = rows.stream().filter(p -> !p.getPeriodEnd().isBefore(from)).toList();
        LocalDate first = recent.stream().map(PayrollSettlement::getPeriodStart).min(Comparator.naturalOrder()).get();
        long days = java.time.temporal.ChronoUnit.DAYS.between(first.isBefore(from) ? from : first, latest) + 1;
        if (days < 30) return null;
        BigDecimal sum = recent.stream().map(PayrollSettlement::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return days >= 365 ? sum : sum.multiply(BigDecimal.valueOf(365)).divide(BigDecimal.valueOf(days), 0, java.math.RoundingMode.HALF_UP);
    }

    /** A one-lakh band, so the beneficiary view never shows a salary. */
    static String incomeBand(BigDecimal annual) {
        long lakh = annual.divide(BigDecimal.valueOf(100000), 0, java.math.RoundingMode.DOWN).longValue();
        return lakh + "-" + (lakh + 1) + " lakh a year";
    }

    private int runPayrollRules(DetectionRunRequest request) {
        List<EmployeeIdentity> employees = filterEmployees(request);
        Set<String> employeeCodes = employees.stream().map(EmployeeIdentity::getEmployeeCode).collect(Collectors.toSet());
        List<PayrollSettlement> standing = filterStandingPayroll(standingPayroll(payrollRepo.findAll()), request, employeeCodes);
        return runS01(standing) + runS02(standing) + runS03(standing) + runS04(standing) + runS05(standing) + runS06(employees);
    }

    private List<EmployeeIdentity> filterEmployees(DetectionRunRequest request) {
        List<EmployeeIdentity> all = employeeRepo.findAll();
        if (request.districts() != null && !request.districts().isEmpty()) {
            Set<String> d = request.districts().stream().map(String::toLowerCase).collect(Collectors.toSet());
            all = all.stream().filter(e -> e.getDistrict() != null && d.contains(e.getDistrict().toLowerCase())).toList();
        }
        if (request.talukas() != null && !request.talukas().isEmpty()) {
            Set<String> t = request.talukas().stream().map(String::toLowerCase).collect(Collectors.toSet());
            all = all.stream().filter(e -> e.getTaluka() != null && t.contains(e.getTaluka().toLowerCase())).toList();
        }
        if (request.ddoCodes() != null && !request.ddoCodes().isEmpty()) {
            Set<String> dd = request.ddoCodes().stream().map(String::toLowerCase).collect(Collectors.toSet());
            all = all.stream().filter(e -> e.getDdoCode() != null && dd.contains(e.getDdoCode().toLowerCase())).toList();
        }
        return all;
    }

    private static List<PayrollSettlement> filterStandingPayroll(
            List<PayrollSettlement> standing, DetectionRunRequest request, Set<String> employeeCodes) {
        return standing.stream()
                .filter(p -> employeeCodes.contains(p.getEmployeeCode()))
                .filter(p -> payrollPeriodInScope(p, request))
                .toList();
    }

    private static boolean payrollPeriodInScope(PayrollSettlement p, DetectionRunRequest request) {
        if (request.periodStart() == null && request.periodEnd() == null) return true;
        if (p.getPeriodStart() == null || p.getPeriodEnd() == null) return true;
        if (request.periodStart() != null && p.getPeriodEnd().isBefore(request.periodStart())) return false;
        if (request.periodEnd() != null && p.getPeriodStart().isAfter(request.periodEnd())) return false;
        return true;
    }

    /** Raises a payroll alert if the employee is known; returns how many alerts were actually raised (0 or 1). */
    private int raisePayroll(String rule, String severity, String employeeCode, Map<String, Object> evidence, BigDecimal delta) {
        return employeeRepo.findByEmployeeCode(employeeCode).map(emp -> {
            IntegrityAlert alert = payrollAlert(rule, severity, emp, evidence);
            if (delta != null) alert.setAmountDelta(delta);
            return saveAlertWithCase(alert);
        }).orElse(0);
    }

    private static long daysInclusive(LocalDate start, LocalDate end) {
        return java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1;
    }

    private static String span(PayrollSettlement p) {
        return p.getPeriodStart() + " to " + p.getPeriodEnd();
    }

    /**
     * S01 Overlapping salary: one employee paid basic by two DDOs for overlapping days. The possible excess is the
     * overlapping days at the lower of the two daily rates (a conservative figure; payroll staff confirm the real one).
     * Two full months paid for the same month therefore give one month's pay as the excess.
     */
    private int runS01(List<PayrollSettlement> standing) {
        int created = 0;
        Map<String, List<PayrollSettlement>> byEmp = standing.stream()
                .filter(p -> "BASIC".equalsIgnoreCase(p.getComponent()))
                .collect(Collectors.groupingBy(PayrollSettlement::getEmployeeCode));
        for (List<PayrollSettlement> rows : byEmp.values()) {
            boolean raised = false;
            for (int i = 0; i < rows.size() && !raised; i++) {
                for (int j = i + 1; j < rows.size() && !raised; j++) {
                    PayrollSettlement a = rows.get(i);
                    PayrollSettlement b = rows.get(j);
                    if (a.getDdoCode() == null || a.getDdoCode().equals(b.getDdoCode())) continue;
                    if (!periodsOverlap(a.getPeriodStart(), a.getPeriodEnd(), b.getPeriodStart(), b.getPeriodEnd())) continue;
                    if (alertExists("S01", a.getEmployeeCode(), null)) { raised = true; continue; }
                    long daysA = daysInclusive(a.getPeriodStart(), a.getPeriodEnd());
                    long daysB = daysInclusive(b.getPeriodStart(), b.getPeriodEnd());
                    if (daysA <= 0 || daysB <= 0) continue;
                    LocalDate from = a.getPeriodStart().isAfter(b.getPeriodStart()) ? a.getPeriodStart() : b.getPeriodStart();
                    LocalDate to = a.getPeriodEnd().isBefore(b.getPeriodEnd()) ? a.getPeriodEnd() : b.getPeriodEnd();
                    long overlapDays = daysInclusive(from, to);
                    if (overlapDays <= 0) continue;
                    BigDecimal rateA = a.getNetAmount().divide(BigDecimal.valueOf(daysA), 6, java.math.RoundingMode.HALF_UP);
                    BigDecimal rateB = b.getNetAmount().divide(BigDecimal.valueOf(daysB), 6, java.math.RoundingMode.HALF_UP);
                    BigDecimal excess = rateA.min(rateB).multiply(BigDecimal.valueOf(overlapDays)).setScale(2, java.math.RoundingMode.HALF_UP);
                    Map<String, Object> evidence = new LinkedHashMap<>();
                    evidence.put("ddoA", a.getDdoCode());
                    evidence.put("periodA", span(a));
                    evidence.put("amountA", a.getNetAmount());
                    evidence.put("ddoB", b.getDdoCode());
                    evidence.put("periodB", span(b));
                    evidence.put("amountB", b.getNetAmount());
                    evidence.put("overlapStart", from.toString());
                    evidence.put("overlapEnd", to.toString());
                    evidence.put("overlapDays", overlapDays);
                    evidence.put("possibleExcess", excess);
                    evidence.put("payrollA", a.getId());
                    evidence.put("payrollB", b.getId());
                    int n = raisePayroll("S01", "HIGH", a.getEmployeeCode(), evidence, excess);
                    created += n;
                    raised = n > 0;
                }
            }
        }
        return created;
    }

    /**
     * S02 Post-event entitlement: pay for a period after the event that ends it. A retired person is paid a pension, so
     * after a retirement only the other components are flagged; after a death everything is, a pension included, since a
     * pension that carries on after a death needs a different recipient and a review.
     */
    private int runS02(List<PayrollSettlement> standing) {
        int created = 0;
        for (ServiceEvent ev : serviceEventRepo.findAll()) {
            if (ev.getEventType() == null || ev.getEffectiveDate() == null
                    || !Set.of("RETIREMENT", "DEATH", "SUSPENSION").contains(ev.getEventType())) continue;
            for (PayrollSettlement p : standing) {
                if (!ev.getEmployeeCode().equals(p.getEmployeeCode())) continue;
                if ("PENSION".equalsIgnoreCase(p.getComponent()) && !"DEATH".equals(ev.getEventType())) continue;
                if (p.getPeriodStart() == null || !p.getPeriodStart().isAfter(ev.getEffectiveDate())) continue;
                if (alertExists("S02", ev.getEmployeeCode() + p.getId(), null)) continue;
                created += raisePayroll("S02", "HIGH", ev.getEmployeeCode(), Map.of(
                        "eventType", ev.getEventType(), "effectiveDate", ev.getEffectiveDate().toString(),
                        "payrollId", p.getId(), "component", p.getComponent(), "period", span(p)), p.getNetAmount());
            }
        }
        return created;
    }

    private int runS03(List<PayrollSettlement> standing) {
        int created = 0;
        for (PayrollSettlement p : standing) {
            if (!"HRA".equalsIgnoreCase(p.getComponent())) continue;
            boolean transferred = employeeRepo.findByEmployeeCode(p.getEmployeeCode())
                    .map(e -> "TRANSFERRED".equalsIgnoreCase(e.getStatus())).orElse(false);
            if (!transferred || alertExists("S03", p.getEmployeeCode(), null)) continue;
            created += raisePayroll("S03", "MEDIUM", p.getEmployeeCode(),
                    Map.of("payrollId", p.getId(), "component", "HRA", "period", span(p)), p.getNetAmount());
        }
        return created;
    }

    private int runS04(List<PayrollSettlement> standing) {
        int created = 0;
        Map<String, List<PayrollSettlement>> grouped = standing.stream()
                .filter(p -> "ARREARS".equalsIgnoreCase(p.getComponent()))
                .collect(Collectors.groupingBy(p -> p.getEmployeeCode() + "|" + p.getPeriodStart() + "|" + p.getPeriodEnd()));
        for (List<PayrollSettlement> g : grouped.values()) {
            if (g.size() < 2) continue;
            PayrollSettlement p = g.get(0);
            if (alertExists("S04", p.getEmployeeCode(), null)) continue;
            created += raisePayroll("S04", "HIGH", p.getEmployeeCode(), Map.of(
                    "duplicateCount", g.size(), "payrollIds", g.stream().map(PayrollSettlement::getId).toList()),
                    g.stream().skip(1).map(PayrollSettlement::getNetAmount).filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add));
        }
        return created;
    }

    private int runS05(List<PayrollSettlement> standing) {
        int created = 0;
        for (PensionAuthorisation auth : pensionRepo.findAll()) {
            if (auth.getMonthlyRate() == null || alertExists("S05", auth.getEmployeeCode(), null)) continue;
            for (PayrollSettlement p : standing) {
                if (!auth.getEmployeeCode().equals(p.getEmployeeCode()) || !"PENSION".equalsIgnoreCase(p.getComponent())
                        || p.getNetAmount() == null) continue;
                BigDecimal diff = p.getNetAmount().subtract(auth.getMonthlyRate()).abs();
                if (diff.compareTo(new BigDecimal("100")) <= 0) continue;
                created += raisePayroll("S05", "HIGH", auth.getEmployeeCode(), Map.of(
                        "authorizedRate", auth.getMonthlyRate(), "settledAmount", p.getNetAmount(), "ppoId", auth.getPpoId(),
                        "period", span(p)), diff);
                break;
            }
        }
        return created;
    }

    /**
     * S06 Record verification risk: records that should back an active payment are missing or unexplained. It asks
     * for evidence; it is not a finding about the person, and a missing life certificate is not a finding of death.
     * Three gaps: no service order on file for an active employee; a bank change in the last N days with no approval
     * reference (active employees and pensioners); and a pensioner whose life certificate is missing or older than a year.
     * A life certificate is recorded as a master-change entry with field "life_certificate" dated when it was received.
     */
    private int runS06(List<EmployeeIdentity> employees) {
        int created = 0;
        LocalDateTime now = LocalDateTime.now();
        Set<String> pensioners = pensionRepo.findAll().stream().map(PensionAuthorisation::getEmployeeCode).collect(Collectors.toSet());
        for (EmployeeIdentity emp : employees) {
            String code = emp.getEmployeeCode();
            boolean active = "ACTIVE".equalsIgnoreCase(emp.getStatus());
            boolean pensioner = pensioners.contains(code);
            if (!active && !pensioner) continue;
            List<MasterChangeLog> log = changeLogRepo.findByPersonId(code);
            List<String> reasons = new ArrayList<>();

            boolean serviceOrderOnFile = !serviceEventRepo.findByEmployeeCode(code).isEmpty();
            if (active && !serviceOrderOnFile) reasons.add("MISSING_SERVICE_ORDER");

            long unexplainedBankChanges = log.stream()
                    .filter(c -> "bank_token".equalsIgnoreCase(c.getFieldName()))
                    .filter(c -> c.getChangedAt() != null && c.getChangedAt().isAfter(now.minusDays(settings().bankChangeWindowDays())))
                    .filter(c -> c.getApprovalRef() == null || c.getApprovalRef().isBlank())
                    .count();
            if (unexplainedBankChanges > 0) reasons.add("UNEXPLAINED_BANK_CHANGE");

            LocalDate lastCertificate = log.stream()
                    .filter(c -> MasterChangeLog.LIFE_CERTIFICATE_FIELD.equalsIgnoreCase(c.getFieldName()) && c.getChangedAt() != null)
                    .map(c -> c.getChangedAt().toLocalDate()).max(Comparator.naturalOrder()).orElse(null);
            if (pensioner && (lastCertificate == null || lastCertificate.isBefore(now.toLocalDate().minusDays(settings().lifeCertificateMaxAgeDays())))) {
                reasons.add("LIFE_CERTIFICATE_OVERDUE");
            }

            if (reasons.isEmpty() || alertExists("S06", code, null)) continue;
            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("reasons", reasons);
            if (active) evidence.put("serviceOrderOnFile", serviceOrderOnFile);
            evidence.put("unexplainedBankChanges", unexplainedBankChanges);
            if (pensioner) evidence.put("lastLifeCertificate", lastCertificate == null ? "none on record" : lastCertificate.toString());
            created += saveAlertWithCase(payrollAlert("S06", unexplainedBankChanges > 0 ? "MEDIUM" : "LOW", emp, evidence));
        }
        return created;
    }

    private IntegrityAlert payrollAlert(String rule, String severity, EmployeeIdentity emp, Map<String, Object> evidence) {
        IntegrityAlert alert = new IntegrityAlert();
        alert.setDomain(IntegrityDomain.PAYROLL);
        alert.setRuleCode(rule);
        alert.setSeverity(severity);
        alert.setPersonId(emp.getEmployeeCode());
        alert.setPersonName(emp.getPersonName());
        Map<String, Object> withEmployee = new LinkedHashMap<>();
        withEmployee.put("employeeCode", emp.getEmployeeCode());
        withEmployee.put("post", emp.getPostTitle());
        withEmployee.put("payLevel", emp.getPayLevel());
        withEmployee.put("ddoCode", emp.getDdoCode());
        withEmployee.put("employmentStatus", emp.getStatus());
        withEmployee.putAll(evidence);
        alert.setEvidence(withEmployee);
        alert.setDistrict(emp.getDistrict());
        alert.setTaluka(emp.getTaluka());
        return alert;
    }

    private int persistAlert(IntegrityDomain domain, String rule, String severity, EntitlementUnit unit,
                             Map<String, Object> evidence, BigDecimal delta) {
        IntegrityAlert alert = new IntegrityAlert();
        alert.setDomain(domain);
        alert.setRuleCode(rule);
        alert.setSeverity(severity);
        alert.setPersonId(unit.getPersonId());
        alert.setPersonName(displayNames.nameForNewAlert(unit.getPersonId(), unit.getFamilyId(), unit.getPersonName()));
        alert.setDistrict(unit.getDistrict());
        alert.setTaluka(unit.getTaluka());
        alert.setSchemeId(unit.getSchemeId());
        alert.setSchemeName(unit.getSchemeName());
        alert.setEvidence(evidence);
        alert.setAmountDelta(delta);
        return saveAlertWithCase(alert);
    }

    private int saveAlertWithCase(IntegrityAlert alert) {
        if (isCollecting()) {
            currentRun.get().record(alert);
            return 1;
        }
        alert.setStatus("OPEN");
        alertRepo.save(alert);
        IntegrityCase c = new IntegrityCase();
        c.setDomain(alert.getDomain());
        c.setTitle("Rule " + alert.getRuleCode() + " — " + Optional.ofNullable(alert.getPersonName()).orElse("Unknown"));
        c.setStatus(org.citizen.expenditure.domain.CaseStatus.OPEN);
        caseRepo.save(c);
        alert.setCaseId(c.getId());
        alertRepo.save(alert);
        return 1;
    }

    private boolean isCollecting() {
        DetectionRunContext c = currentRun.get();
        return c != null && c.isCollecting();
    }

    private boolean alertExists(String rule, String personKey, UUID schemeId) {
        if (isCollecting()) {
            return currentRun.get().sessionAlerts().stream()
                    .anyMatch(a -> rule.equals(a.getRuleCode()) && personKey.equals(a.getPersonId())
                            && (schemeId == null || schemeId.equals(a.getSchemeId())));
        }
        return alertRepo.findByRuleCodeAndPersonId(rule, personKey).stream()
                .anyMatch(a -> schemeId == null || schemeId.equals(a.getSchemeId()));
    }

    private Set<String> loadMutualPairs() {
        Set<String> pairs = new HashSet<>();
        for (MutualExclusionSchemePair p : mutualRepo.findAll()) {
            pairs.add(pairKey(p.getSchemeIdA(), p.getSchemeIdB()));
        }
        return pairs;
    }

    private boolean hasMutualExclusionConflict(EntitlementUnit unit, List<EntitlementUnit> units, Set<String> pairs) {
        for (EntitlementUnit other : units) {
            if (other.getPersonId() != null && other.getPersonId().equals(unit.getPersonId())
                    && !other.getId().equals(unit.getId())
                    && "ACTIVE".equalsIgnoreCase(other.getStatus())
                    && pairs.contains(pairKey(unit.getSchemeId(), other.getSchemeId()))
                    && periodsOverlap(unit.getPeriodStart(), unit.getPeriodEnd(), other.getPeriodStart(), other.getPeriodEnd())) {
                return true;
            }
        }
        return false;
    }

    static String pairKey(UUID a, UUID b) {
        if (a == null || b == null) return "";
        return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
    }

    static boolean isTerminatingEvent(String type) {
        return type != null && Set.of("DEATH", "STATUS_TERMINATION", "LIFE_CERT_EXPIRED").contains(type.toUpperCase());
    }

    static boolean periodsOverlap(LocalDate aStart, LocalDate aEnd, LocalDate bStart, LocalDate bEnd) {
        if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
        return !aStart.isAfter(bEnd) && !bStart.isAfter(aEnd);
    }

    static String maskToken(String token) {
        if (token == null || token.length() < 4) return "****";
        return "****" + token.substring(token.length() - 4);
    }

    public record DetectionRunRequest(
            List<UUID> schemeIds,
            List<String> districts,
            List<String> talukas,
            LocalDate periodStart,
            LocalDate periodEnd,
            List<String> ddoCodes,
            List<IntegrityDomain> domains) {}
    public record DetectionRunResult(int alertsCreated, LocalDateTime completedAt) {}
}
