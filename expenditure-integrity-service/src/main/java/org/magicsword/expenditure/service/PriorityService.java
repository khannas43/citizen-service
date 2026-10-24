package org.magicsword.expenditure.service;

import org.magicsword.expenditure.entity.IntegrityAlert;
import org.magicsword.expenditure.entity.IntegrityCase;
import org.magicsword.expenditure.repository.IntegrityAlertRepository;
import org.magicsword.expenditure.repository.IntegrityCaseRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.*;

/**
 * Ranks open alerts by expected recovery: amount at stake times the check's historical precision (share of ruled-on
 * alerts that were confirmed overpayments). Not a model — a transparent heuristic.
 */
@Service
public class PriorityService {

    private static final Map<String, Integer> SEVERITY_RANK = Map.of("HIGH", 0, "MEDIUM", 1, "LOW", 2);

    private final IntegrityAlertRepository alertRepo;
    private final IntegrityCaseRepository caseRepo;
    private final OverviewService overview;

    @Value("${officer.integrity.priority.no-amount-weight:5000}")
    private long noAmountWeight;

    public PriorityService(IntegrityAlertRepository alertRepo, IntegrityCaseRepository caseRepo, OverviewService overview) {
        this.alertRepo = alertRepo;
        this.caseRepo = caseRepo;
        this.overview = overview;
    }

    public void applyPriority(List<IntegrityAlert> alerts) {
        if (alerts == null || alerts.isEmpty()) {
            return;
        }
        List<IntegrityAlert> allAlerts = alertRepo.findAll();
        Map<UUID, IntegrityCase> cases = caseRepo.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(IntegrityCase::getId, c -> c, (a, b) -> a));
        List<Map<String, Object>> health = overview.ruleHealth(allAlerts, cases);
        Map<String, RulePrecision> byRule = new HashMap<>();
        long reviewedTotal = 0;
        long confirmedTotal = 0;
        for (Map<String, Object> row : health) {
            String rule = String.valueOf(row.get("ruleCode"));
            long reviewed = ((Number) row.get("reviewed")).longValue();
            long confirmed = ((Number) row.get("confirmed")).longValue();
            reviewedTotal += reviewed;
            confirmedTotal += confirmed;
            Double pct = (Double) row.get("precisionPercent");
            boolean enough = Boolean.TRUE.equals(row.get("enoughEvidence"));
            byRule.put(rule, new RulePrecision(pct, enough && pct != null, reviewed));
        }
        double overallFraction = reviewedTotal == 0 ? 0 : confirmedTotal * 1.0 / reviewedTotal;
        double overallPercent = Math.round(overallFraction * 1000.0) / 10.0;

        for (IntegrityAlert alert : alerts) {
            if (!"OPEN".equals(alert.getStatus())) {
                continue;
            }
            PriorityCalc calc = score(alert, byRule, overallFraction, overallPercent);
            alert.setPriority(calc.score());
            alert.setPriorityReason(calc.reason());
            alert.setPriorityEstimated(calc.estimated());
        }
    }

    /** Sort key for tie-breaking after score: lower is higher priority (severity, then age). */
    public static int severityRank(String severity) {
        return SEVERITY_RANK.getOrDefault(severity != null ? severity.toUpperCase(Locale.ROOT) : "", 9);
    }

    record RulePrecision(Double precisionPercent, boolean useRule, long reviewed) {}

    record PriorityCalc(long score, String reason, boolean estimated) {}

    PriorityCalc score(IntegrityAlert alert, Map<String, RulePrecision> byRule, double overallFraction, double overallPercent) {
        BigDecimal amount = alert.getAmountDelta();
        boolean hasAmount = amount != null && amount.signum() > 0;
        BigDecimal stake = hasAmount ? amount : BigDecimal.valueOf(noAmountWeight);

        RulePrecision rp = byRule.get(alert.getRuleCode());
        boolean estimated = rp == null || !rp.useRule();
        double precision = estimated ? overallFraction
                : rp.precisionPercent() / 100.0;
        long score = stake.multiply(BigDecimal.valueOf(precision)).setScale(0, RoundingMode.HALF_UP).longValue();

        String stakeText = hasAmount ? rupees(stake) + " at stake"
                : "no amount on the alert (using a fixed weight for ranking)";
        String precisionText = estimated ? reviewedTotalMessage(overallPercent)
                : "this check is confirmed " + formatPercent(rp.precisionPercent()) + " of the time";
        String reason = "Likely " + rupees(BigDecimal.valueOf(score)) + " recoverable: " + stakeText + ", " + precisionText;
        return new PriorityCalc(score, reason, estimated);
    }

    /** Higher score first; then severity; then older detection date. */
    public static int compareAlerts(IntegrityAlert a, IntegrityAlert b) {
        long pa = a.getPriority() != null ? a.getPriority() : 0L;
        long pb = b.getPriority() != null ? b.getPriority() : 0L;
        if (pa != pb) {
            return Long.compare(pb, pa);
        }
        int sa = severityRank(a.getSeverity());
        int sb = severityRank(b.getSeverity());
        if (sa != sb) {
            return Integer.compare(sa, sb);
        }
        if (a.getDetectedAt() == null && b.getDetectedAt() == null) {
            return 0;
        }
        if (a.getDetectedAt() == null) {
            return 1;
        }
        if (b.getDetectedAt() == null) {
            return -1;
        }
        return a.getDetectedAt().compareTo(b.getDetectedAt());
    }

    private static String reviewedTotalMessage(double overallPercent) {
        if (Double.isNaN(overallPercent) || overallPercent <= 0) {
            return "overall checks have little ruling history yet (estimated)";
        }
        return "overall checks are confirmed " + formatPercent(overallPercent) + " of the time (estimated)";
    }

    private static String formatPercent(double pct) {
        if (pct == Math.rint(pct)) {
            return String.format(Locale.ENGLISH, "%.0f%%", pct);
        }
        return String.format(Locale.ENGLISH, "%.1f%%", pct);
    }

    private static String rupees(BigDecimal n) {
        NumberFormat nf = NumberFormat.getCurrencyInstance(new Locale("en", "IN"));
        nf.setMaximumFractionDigits(0);
        nf.setMinimumFractionDigits(0);
        return nf.format(n);
    }
}
