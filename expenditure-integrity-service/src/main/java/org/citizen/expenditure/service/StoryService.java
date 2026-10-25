package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.springframework.stereotype.Service;
import org.citizen.expenditure.repository.EntitlementUnitRepository;
import org.citizen.expenditure.repository.IntegrityAlertRepository;

import java.math.BigDecimal;
import java.util.*;
import java.util.function.Predicate;

/**
 * The guided demo: three real cases that tell the story (a student paid twice, a double salary, pay that carried on after
 * someone's status changed), each picked from the live data, plus the headline numbers for a one-page summary.
 * An open case is preferred so a presenter can act on it; otherwise the largest one.
 */
@Service
public class StoryService {

    public record Scenario(String key, String title, String ruleCode, IntegrityDomain domain, UUID caseId, String personName,
                           String subject, BigDecimal amount, String status, String headline) {}

    private record Spec(String key, String title, String ruleCode, Predicate<IntegrityAlert> filter) {}

    private static final List<Spec> SPECS = List.of(
            new Spec("DUPLICATE_PAYMENT", "A student is paid more than the scheme allows", "802",
                    a -> "OVER_SETTLEMENT".equals(String.valueOf(a.getEvidence() == null ? null : a.getEvidence().get("variant")))),
            new Spec("DOUBLE_SALARY", "Two offices pay the same salary for the same days", "S01", a -> true),
            new Spec("PAID_AFTER_STATUS_CHANGE", "Pay carries on after an employee's status changed", "S02", a -> true));

    private final IntegrityAlertRepository alertRepo;
    private final OverviewService overview;
    private final IntegrityCaseService cases;
    private final EntitlementUnitRepository unitRepo;

    public StoryService(IntegrityAlertRepository alertRepo, OverviewService overview, IntegrityCaseService cases,
                        EntitlementUnitRepository unitRepo) {
        this.alertRepo = alertRepo;
        this.overview = overview;
        this.cases = cases;
        this.unitRepo = unitRepo;
    }

    /** The scenarios the caller may see (a scenario is left out when its kind of case is closed to the caller's role). */
    public List<Scenario> scenarios(Predicate<IntegrityDomain> canRead) {
        List<IntegrityAlert> all = alertRepo.findAll();
        List<Scenario> out = new ArrayList<>();
        for (Spec spec : SPECS) {
            all.stream()
                    .filter(a -> spec.ruleCode().equals(a.getRuleCode()) && a.getCaseId() != null && canRead.test(a.getDomain()) && spec.filter().test(a))
                    .min(Comparator.comparing((IntegrityAlert a) -> !"OPEN".equals(a.getStatus()))
                            .thenComparing((IntegrityAlert a) -> a.getAmountDelta() == null ? BigDecimal.ZERO : a.getAmountDelta(), Comparator.reverseOrder())
                            .thenComparing(a -> String.valueOf(a.getPersonName())))
                    .ifPresent(picked -> {
                        IntegrityAlert a = withEntitlementNames(picked);
                        out.add(new Scenario(spec.key(), spec.title(), spec.ruleCode(), a.getDomain(), a.getCaseId(),
                                a.getPersonName(), subjectOf(a), a.getAmountDelta(), a.getStatus(), headline(spec.key(), a)));
                    });
        }
        return out;
    }

    /**
     * A beneficiary alert can carry a stale person name; the entitlement its payments were made under is the truth, so the
     * story says what the case detail will say. Returns a transient copy; the stored alert is never touched.
     */
    private IntegrityAlert withEntitlementNames(IntegrityAlert source) {
        if (source.getDomain() != IntegrityDomain.BENEFICIARY) return source;
        IntegrityAlert copy = new IntegrityAlert();
        copy.setDomain(source.getDomain());
        copy.setCaseId(source.getCaseId());
        copy.setStatus(source.getStatus());
        copy.setAmountDelta(source.getAmountDelta());
        copy.setEvidence(source.getEvidence());
        copy.setPersonName(source.getPersonName());
        copy.setSchemeName(source.getSchemeName());
        for (UUID unitId : cases.resolveUnitIdsForAlert(source)) {
            unitRepo.findById(unitId).ifPresent(u -> {
                if (u.getPersonName() != null && !u.getPersonName().isBlank()) copy.setPersonName(u.getPersonName());
                if (u.getSchemeName() != null && !u.getSchemeName().isBlank()) copy.setSchemeName(u.getSchemeName());
            });
            break;
        }
        return copy;
    }

    /** What the pilot found: totals only, safe to print. */
    public Map<String, Object> summary() {
        @SuppressWarnings("unchecked") Map<String, Object> totals = (Map<String, Object>) overview.overview().get("totals");
        Map<String, Object> m = new LinkedHashMap<>();
        for (String k : List.of("openAlerts", "flaggedAmount", "confirmedAmount", "recoveredAmount", "gatePreventedAmount",
                "verifiedClosedCases", "awaitingVerification", "recurrenceRate", "avgDaysToMasterCorrection")) {
            m.put(k, totals.get(k));
        }
        return m;
    }

    private static String subjectOf(IntegrityAlert a) {
        if (a.getSchemeName() != null && !a.getSchemeName().isBlank()) return a.getSchemeName();
        Object post = a.getEvidence() == null ? null : a.getEvidence().get("post");
        Object ddo = a.getEvidence() == null ? null : a.getEvidence().get("ddoCode");
        return post == null ? null : post + (ddo == null ? "" : " · " + ddo);
    }

    private static String plain(Object n) {
        if (n == null) return "?";
        try {
            return new BigDecimal(n.toString()).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException e) {
            return n.toString();
        }
    }

    private static String headline(String key, IntegrityAlert a) {
        Map<String, Object> e = a.getEvidence() == null ? Map.of() : a.getEvidence();
        String who = a.getPersonName() == null ? "This person" : a.getPersonName();
        return switch (key) {
            case "DUPLICATE_PAYMENT" -> who + " is entitled to ₹" + plain(e.get("authorizedAmount")) + " under "
                    + (a.getSchemeName() == null ? "the scheme" : a.getSchemeName()) + ", but ₹" + plain(e.get("netSettled")) + " has been paid.";
            case "DOUBLE_SALARY" -> e.get("ddoA") + " and " + e.get("ddoB") + " both paid " + who + " basic salary for "
                    + e.getOrDefault("overlapDays", "the same") + " of the same days.";
            default -> who + " was paid up to " + e.getOrDefault("lastPayDate", "a later date") + ", although their status changed on "
                    + e.getOrDefault("statusSince", "an earlier date") + ".";
        };
    }
}
