package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.domain.NoticeResponseKind;
import org.citizen.expenditure.entity.CaseNotice;
import org.citizen.expenditure.entity.IntegrityAction;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.IntegrityAuditLog;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.entity.EmployeeIdentity;
import org.citizen.expenditure.repository.CaseNoticeRepository;
import org.citizen.expenditure.repository.EmployeeIdentityRepository;
import org.citizen.expenditure.repository.IntegrityActionRepository;
import org.citizen.expenditure.repository.IntegrityAlertRepository;
import org.citizen.expenditure.repository.IntegrityAuditLogRepository;
import org.citizen.expenditure.repository.IntegrityCaseRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The money picture for senior management: how much is flagged, confirmed and recovered, by district and by rule, plus
 * what the pre-payment gate stopped. Totals only. No person, employee or salary is in it.
 */
@Service
public class OverviewService {

    static final String UNSPECIFIED = "Unspecified";

    private final IntegrityAlertRepository alertRepo;
    private final IntegrityCaseRepository caseRepo;
    private final IntegrityActionRepository actionRepo;
    private final PaymentGateService gate;
    private final EmployeeIdentityRepository employeeRepo;
    private final IntegrityAuditLogRepository auditRepo;
    private final CaseNoticeRepository noticeRepo;

    @Value("${officer.integrity.projection.pilot-share-percent:0}")
    private BigDecimal pilotSharePercent;

    public OverviewService(IntegrityAlertRepository alertRepo, IntegrityCaseRepository caseRepo,
                           IntegrityActionRepository actionRepo, PaymentGateService gate,
                           EmployeeIdentityRepository employeeRepo, IntegrityAuditLogRepository auditRepo,
                           CaseNoticeRepository noticeRepo) {
        this.alertRepo = alertRepo;
        this.caseRepo = caseRepo;
        this.actionRepo = actionRepo;
        this.gate = gate;
        this.employeeRepo = employeeRepo;
        this.auditRepo = auditRepo;
        this.noticeRepo = noticeRepo;
    }

    private static BigDecimal amount(IntegrityAlert a) {
        return a.getAmountDelta() != null ? a.getAmountDelta() : BigDecimal.ZERO;
    }

    private static final class Tally {
        long openAlerts;
        long beneficiaryOpen;
        long payrollOpen;
        BigDecimal flagged = BigDecimal.ZERO;
        BigDecimal confirmed = BigDecimal.ZERO;
        BigDecimal recovered = BigDecimal.ZERO;

        Map<String, Object> toMap(String key, String value) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(key, value);
            m.put("openAlerts", openAlerts);
            m.put("beneficiaryOpenAlerts", beneficiaryOpen);
            m.put("payrollOpenAlerts", payrollOpen);
            m.put("flaggedAmount", flagged);
            m.put("confirmedAmount", confirmed);
            m.put("recoveredAmount", recovered);
            return m;
        }
    }

    /**
     * Whether fixes hold and how fast the source gets corrected:
     * - recurrence: of the people/schemes with a confirmed, resolved finding, the share flagged again by the same check
     *   after that case was last touched;
     * - days to master correction: case opened to the first master correction recorded on it;
     * - verified closed / awaiting verification: cases whose outcome someone has checked, and cases still waiting.
     */
    Map<String, Object> loopMetrics(List<IntegrityAlert> alerts, Map<UUID, IntegrityCase> cases) {
        Map<String, List<IntegrityAlert>> byKey = new HashMap<>();
        for (IntegrityAlert a : alerts) {
            if (a.getPersonId() == null) continue;
            byKey.computeIfAbsent(a.getRuleCode() + "|" + a.getPersonId() + "|" + a.getSchemeId(), k -> new ArrayList<>()).add(a);
        }
        long fixed = 0, recurred = 0;
        for (List<IntegrityAlert> group : byKey.values()) {
            LocalDateTime fixedAt = null;
            for (IntegrityAlert a : group) {
                IntegrityCase c = a.getCaseId() == null ? null : cases.get(a.getCaseId());
                if ("RESOLVED".equals(a.getStatus()) && c != null && c.getClassification() == CaseClassification.CONFIRMED_OVERPAYMENT
                        && c.getUpdatedAt() != null && (fixedAt == null || c.getUpdatedAt().isBefore(fixedAt))) {
                    fixedAt = c.getUpdatedAt();
                }
            }
            if (fixedAt == null) continue;
            fixed++;
            final LocalDateTime since = fixedAt;
            if (group.stream().anyMatch(a -> a.getDetectedAt() != null && a.getDetectedAt().isAfter(since))) recurred++;
        }

        List<Double> toCorrection = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        for (IntegrityAction a : actionRepo.findByActionType(ActionType.MASTER_CORRECTION)) {
            IntegrityCase c = a.getCaseId() == null ? null : cases.get(a.getCaseId());
            if (c == null || c.getCreatedAt() == null || a.getCreatedAt() == null || !seen.add(c.getId())) continue;
            toCorrection.add(java.time.Duration.between(c.getCreatedAt(), a.getCreatedAt()).toMinutes() / 1440.0);
        }
        long verified = cases.values().stream().filter(c -> c.getVerifiedAt() != null).count();
        long awaiting = cases.values().stream().filter(c -> c.getStatus() == org.citizen.expenditure.domain.CaseStatus.ACTION_RECORDED).count();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fixedFindings", fixed);
        m.put("recurredFindings", recurred);
        m.put("recurrenceRate", fixed == 0 ? null : Math.round(recurred * 1000.0 / fixed) / 10.0);
        m.put("masterCorrections", toCorrection.size());
        m.put("avgDaysToMasterCorrection", toCorrection.isEmpty() ? null
                : Math.round(toCorrection.stream().mapToDouble(Double::doubleValue).average().orElse(0) * 10) / 10.0);
        m.put("verifiedClosedCases", verified);
        m.put("awaitingVerification", awaiting);
        return m;
    }

    /** Fewer reviewed alerts than this and the precision is shown but marked as thin evidence. */
    static final int ENOUGH_REVIEWED = 10;

    /**
     * How reliable each check is, from what reviewers decided: of the alerts a reviewer ruled on, how many were real
     * overpayments, and how many turned out to be legitimate exceptions, data errors or dismissals. A check with many
     * data errors needs better data; one with many legitimate exceptions needs a looser threshold.
     */
    List<Map<String, Object>> ruleHealth(List<IntegrityAlert> alerts, Map<UUID, IntegrityCase> cases) {
        Map<String, long[]> byRule = new TreeMap<>();      // raised, open, confirmed, legitimate, dataError, dismissed, suspected
        Map<String, BigDecimal> confirmedAmount = new HashMap<>();
        for (IntegrityAlert a : alerts) {
            long[] c = byRule.computeIfAbsent(a.getRuleCode(), k -> new long[7]);
            c[0]++;
            if ("OPEN".equals(a.getStatus())) c[1]++;
            IntegrityCase ic = a.getCaseId() == null ? null : cases.get(a.getCaseId());
            if (ic == null || ic.getClassification() == null) continue;
            switch (ic.getClassification()) {
                case CONFIRMED_OVERPAYMENT -> { c[2]++; confirmedAmount.merge(a.getRuleCode(), amount(a), BigDecimal::add); }
                case LEGITIMATE_EXCEPTION -> c[3]++;
                case DATA_ERROR -> c[4]++;
                case DISMISSED -> c[5]++;
                case SUSPECTED_OVERPAYMENT -> c[6]++;
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, long[]> e : byRule.entrySet()) {
            long[] c = e.getValue();
            long reviewed = c[2] + c[3] + c[4] + c[5];        // a ruling was made; "suspected" is still an open question
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ruleCode", e.getKey());
            m.put("raised", c[0]);
            m.put("open", c[1]);
            m.put("reviewed", reviewed);
            m.put("confirmed", c[2]);
            m.put("legitimateException", c[3]);
            m.put("dataError", c[4]);
            m.put("dismissed", c[5]);
            m.put("suspected", c[6]);
            m.put("confirmedAmount", confirmedAmount.getOrDefault(e.getKey(), BigDecimal.ZERO));
            m.put("precisionPercent", reviewed == 0 ? null : Math.round(c[2] * 1000.0 / reviewed) / 10.0);
            m.put("enoughEvidence", reviewed >= ENOUGH_REVIEWED);
            out.add(m);
        }
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> -(Long) m.get("reviewed")).thenComparing(m -> (String) m.get("ruleCode")));
        return out;
    }

    static final String PROJECTION_CAVEAT =
            "Estimate, not a finding. It assumes the demo data districts and schemes are typical of the state.";

    private static final class MonthTally {
        BigDecimal flagged = BigDecimal.ZERO;
        BigDecimal confirmed = BigDecimal.ZERO;
        BigDecimal recovered = BigDecimal.ZERO;
        BigDecimal prevented = BigDecimal.ZERO;
    }

    /** Last twelve calendar months including the current month, oldest first. */
    static List<String> monthKeys(YearMonth endInclusive) {
        List<String> keys = new ArrayList<>();
        YearMonth start = endInclusive.minusMonths(11);
        for (YearMonth m = start; !m.isAfter(endInclusive); m = m.plusMonths(1)) {
            keys.add(String.format("%04d-%02d", m.getYear(), m.getMonthValue()));
        }
        return keys;
    }

    static String monthKey(LocalDateTime when) {
        if (when == null) return null;
        return String.format("%04d-%02d", when.getYear(), when.getMonthValue());
    }

    List<Map<String, Object>> byMonth(List<IntegrityAlert> alerts, Map<UUID, IntegrityCase> cases,
                                        Set<UUID> recoveredCaseIds, Map<UUID, BigDecimal> caseConfirmedAmount) {
        YearMonth end = YearMonth.now();
        List<String> keys = monthKeys(end);
        Map<String, MonthTally> buckets = new LinkedHashMap<>();
        for (String k : keys) {
            buckets.put(k, new MonthTally());
        }
        LocalDateTime windowStart = end.minusMonths(11).atDay(1).atStartOfDay();

        for (IntegrityAlert a : alerts) {
            if (a.getDetectedAt() != null && !a.getDetectedAt().isBefore(windowStart)) {
                String mk = monthKey(a.getDetectedAt());
                MonthTally t = buckets.get(mk);
                if (t != null) {
                    t.flagged = t.flagged.add(amount(a));
                }
            }
            IntegrityCase c = a.getCaseId() == null ? null : cases.get(a.getCaseId());
            if (c != null && c.getClassification() == CaseClassification.CONFIRMED_OVERPAYMENT && c.getUpdatedAt() != null
                    && !c.getUpdatedAt().isBefore(windowStart)) {
                String mk = monthKey(c.getUpdatedAt());
                MonthTally t = buckets.get(mk);
                if (t != null) {
                    t.confirmed = t.confirmed.add(amount(a));
                }
            }
        }

        for (IntegrityAction action : actionRepo.findByActionType(ActionType.RECOVERY_RECORD)) {
            if (!IntegrityActionSupport.countsAsRecovery(action) || action.getCreatedAt() == null
                    || action.getCreatedAt().isBefore(windowStart)) {
                continue;
            }
            String mk = monthKey(action.getCreatedAt());
            MonthTally t = buckets.get(mk);
            if (t == null || action.getCaseId() == null) {
                continue;
            }
            t.recovered = t.recovered.add(caseConfirmedAmount.getOrDefault(action.getCaseId(), BigDecimal.ZERO));
        }

        for (var line : gate.holdConfirmedSince(windowStart)) {
            if (line.getDecidedAt() == null) {
                continue;
            }
            String mk = monthKey(line.getDecidedAt());
            MonthTally t = buckets.get(mk);
            if (t != null && line.getAmount() != null) {
                t.prevented = t.prevented.add(line.getAmount());
            }
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (String k : keys) {
            MonthTally t = buckets.get(k);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", k);
            row.put("flagged", t.flagged);
            row.put("confirmed", t.confirmed);
            row.put("recovered", t.recovered);
            row.put("prevented", t.prevented);
            out.add(row);
        }
        return out;
    }

    Map<String, Object> safeguardMetrics(Map<UUID, IntegrityCase> cases) {
        Set<UUID> adverse = new HashSet<>();
        Set<UUID> overturned = new HashSet<>();
        Map<UUID, LocalDateTime> lastReopen = new HashMap<>();
        Map<UUID, LocalDateTime> decisionAfterReopen = new HashMap<>();
        List<IntegrityAuditLog> logs = auditRepo.findAll().stream()
                .sorted(Comparator.comparing(IntegrityAuditLog::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        for (IntegrityAuditLog log : logs) {
            if (log.getCaseId() == null) {
                continue;
            }
            UUID cid = log.getCaseId();
            if ("REOPEN_APPEAL".equals(log.getAction())) {
                lastReopen.put(cid, log.getCreatedAt());
                decisionAfterReopen.remove(cid);
            } else if ("DECISION".equals(log.getAction()) && log.getDetails() != null) {
                Object cls = log.getDetails().get("classification");
                if (CaseClassification.CONFIRMED_OVERPAYMENT.name().equals(String.valueOf(cls))) {
                    adverse.add(cid);
                }
                if (lastReopen.containsKey(cid) && log.getCreatedAt() != null
                        && log.getCreatedAt().isAfter(lastReopen.get(cid))) {
                    decisionAfterReopen.put(cid, log.getCreatedAt());
                }
            } else if ("OVERTURN".equals(log.getAction())) {
                overturned.add(cid);
            }
        }
        for (Map.Entry<UUID, IntegrityCase> e : cases.entrySet()) {
            if (adverse.contains(e.getKey()) && e.getValue().getClassification() != CaseClassification.CONFIRMED_OVERPAYMENT) {
                overturned.add(e.getKey());
            }
        }
        long appealsOpen = 0;
        for (Map.Entry<UUID, LocalDateTime> e : lastReopen.entrySet()) {
            IntegrityCase c = cases.get(e.getKey());
            if (c == null || c.getStatus() != org.citizen.expenditure.domain.CaseStatus.UNDER_REVIEW) {
                continue;
            }
            LocalDateTime decided = decisionAfterReopen.get(e.getKey());
            if (decided == null || decided.isBefore(e.getValue())) {
                appealsOpen++;
            }
        }
        long noticesIssued = noticeRepo.findAll().stream().filter(n -> n.getIssuedAt() != null).count();
        long noticesAwaiting = noticeRepo.findAll().stream()
                .filter(n -> n.getIssuedAt() != null && n.getResponseAt() == null
                        && (n.getResponseKind() == null || n.getResponseKind() == NoticeResponseKind.NONE))
                .count();
        long adverseCount = adverse.size();
        long overturnCount = overturned.size();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("adverseDecisions", adverseCount);
        m.put("overturned", overturnCount);
        m.put("overturnRate", adverseCount == 0 ? null
                : BigDecimal.valueOf(overturnCount * 100.0 / adverseCount).setScale(1, RoundingMode.HALF_UP));
        m.put("noticesIssued", noticesIssued);
        m.put("noticesAwaitingResponse", noticesAwaiting);
        m.put("appealsOpen", appealsOpen);
        return m;
    }

    Map<String, Object> projectionFor(BigDecimal pilotConfirmed) {
        if (pilotSharePercent == null || pilotSharePercent.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        BigDecimal share = pilotSharePercent;
        BigDecimal estimated = pilotConfirmed
                .multiply(BigDecimal.valueOf(100))
                .divide(share, 0, RoundingMode.HALF_UP);
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("basis", "Confirmed overpayment in the loaded demo data");
        p.put("pilotConfirmed", pilotConfirmed);
        p.put("pilotSharePercent", share);
        p.put("estimatedStateConfirmed", estimated);
        p.put("formula", "demo data confirmed ÷ (demo data share % ÷ 100)");
        p.put("caveat", PROJECTION_CAVEAT);
        return p;
    }

    public Map<String, Object> overview() {
        List<IntegrityAlert> alerts = alertRepo.findAll();
        Map<UUID, IntegrityCase> cases = caseRepo.findAll().stream().collect(Collectors.toMap(IntegrityCase::getId, c -> c, (a, b) -> a));
        Set<UUID> recovered = actionRepo.findByActionType(ActionType.RECOVERY_RECORD).stream()
                .filter(org.citizen.expenditure.service.IntegrityActionSupport::countsAsRecovery)
                .map(IntegrityAction::getCaseId).filter(Objects::nonNull).collect(Collectors.toSet());
        long recoveriesPendingApproval = actionRepo.findByActionType(ActionType.RECOVERY_RECORD).stream()
                .filter(a -> a.getActionStatus() == org.citizen.expenditure.domain.ActionStatus.PENDING)
                .count();

        Tally total = new Tally();
        Map<String, Tally> byDistrict = new TreeMap<>();
        Map<String, Tally> byRule = new TreeMap<>();
        long dismissed = cases.values().stream().filter(c -> c.getClassification() == CaseClassification.DISMISSED).count();

        // a payroll alert raised without a district still belongs to its employee's district
        Map<String, String> employeeDistrict = new HashMap<>();
        for (EmployeeIdentity e : employeeRepo.findAll()) {
            if (e.getDistrict() != null && !e.getDistrict().isBlank()) employeeDistrict.put(e.getEmployeeCode(), e.getDistrict());
        }

        for (IntegrityAlert a : alerts) {
            String own = a.getDistrict() != null && !a.getDistrict().isBlank() ? a.getDistrict()
                    : a.getDomain() == IntegrityDomain.PAYROLL ? employeeDistrict.get(a.getPersonId()) : null;
            String district = own == null ? UNSPECIFIED : own;
            Tally d = byDistrict.computeIfAbsent(district, k -> new Tally());
            Tally r = byRule.computeIfAbsent(a.getRuleCode(), k -> new Tally());
            IntegrityCase c = a.getCaseId() == null ? null : cases.get(a.getCaseId());
            for (Tally t : List.of(total, d, r)) {
                if ("OPEN".equals(a.getStatus())) {
                    t.openAlerts++;
                    if (a.getDomain() == IntegrityDomain.PAYROLL) t.payrollOpen++; else t.beneficiaryOpen++;
                    t.flagged = t.flagged.add(amount(a));
                }
                if (c != null && c.getClassification() == CaseClassification.CONFIRMED_OVERPAYMENT) {
                    t.confirmed = t.confirmed.add(amount(a));
                    if (recovered.contains(c.getId())) t.recovered = t.recovered.add(amount(a));
                }
            }
        }

        Map<UUID, BigDecimal> caseConfirmedAmount = new HashMap<>();
        for (IntegrityAlert a : alerts) {
            IntegrityCase c = a.getCaseId() == null ? null : cases.get(a.getCaseId());
            if (c != null && c.getClassification() == CaseClassification.CONFIRMED_OVERPAYMENT && a.getCaseId() != null) {
                caseConfirmedAmount.merge(a.getCaseId(), amount(a), BigDecimal::add);
            }
        }

        Map<String, Object> totals = total.toMap("scope", "all");
        totals.remove("scope");
        totals.put("dismissedCases", dismissed);
        totals.put("recoveriesPendingApproval", recoveriesPendingApproval);
        totals.putAll(loopMetrics(alerts, cases));
        totals.putAll(gate.metrics());
        totals.putAll(safeguardMetrics(cases));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totals", totals);
        out.put("byDistrict", byDistrict.entrySet().stream().map(e -> e.getValue().toMap("district", e.getKey())).toList());
        out.put("byRule", byRule.entrySet().stream()
                .filter(e -> e.getValue().openAlerts > 0 || e.getValue().confirmed.signum() > 0)
                .map(e -> e.getValue().toMap("ruleCode", e.getKey())).toList());
        out.put("byMonth", byMonth(alerts, cases, recovered, caseConfirmedAmount));
        out.put("ruleHealth", ruleHealth(alerts, cases));
        Map<String, Object> projection = projectionFor(total.confirmed);
        if (projection != null) {
            out.put("projection", projection);
        }
        out.put("asOf", LocalDateTime.now());
        return out;
    }
}
