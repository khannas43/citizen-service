package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * One visual line for a case: the entitlement or employment, every payment and reversal, every event, and every record
 * change, each on its own lane with its dates. The items the alert is about are marked, so a duplicate, a payment after
 * a death or a double salary shows at a glance. Bank accounts are masked.
 */
@Service
public class CaseTimelineService {

    public record Item(String id, LocalDate start, LocalDate end, String kind, String label, String detail,
                       BigDecimal amount, boolean flagged) {}

    public record Lane(String key, String label, List<Item> items) {}

    public record Timeline(IntegrityDomain domain, LocalDate from, LocalDate to, List<Lane> lanes) {}

    private final IntegrityAlertRepository alertRepo;
    private final IntegrityCaseRepository caseRepo;
    private final IntegrityCaseService cases;
    private final EntitlementUnitRepository unitRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final VerificationEventRepository eventRepo;
    private final MasterChangeLogRepository changeLogRepo;
    private final PayrollSettlementRepository payrollRepo;
    private final ServiceEventRepository serviceEventRepo;
    private final PensionAuthorisationRepository pensionRepo;
    private final EmployeeIdentityRepository employeeRepo;

    public CaseTimelineService(IntegrityAlertRepository alertRepo, IntegrityCaseRepository caseRepo, IntegrityCaseService cases,
                               EntitlementUnitRepository unitRepo, PaymentSettlementRepository paymentRepo,
                               VerificationEventRepository eventRepo, MasterChangeLogRepository changeLogRepo,
                               PayrollSettlementRepository payrollRepo, ServiceEventRepository serviceEventRepo,
                               PensionAuthorisationRepository pensionRepo, EmployeeIdentityRepository employeeRepo) {
        this.alertRepo = alertRepo;
        this.caseRepo = caseRepo;
        this.cases = cases;
        this.unitRepo = unitRepo;
        this.paymentRepo = paymentRepo;
        this.eventRepo = eventRepo;
        this.changeLogRepo = changeLogRepo;
        this.payrollRepo = payrollRepo;
        this.serviceEventRepo = serviceEventRepo;
        this.pensionRepo = pensionRepo;
        this.employeeRepo = employeeRepo;
    }

    public Optional<Timeline> timeline(UUID caseId) {
        return caseRepo.findById(caseId).map(c -> {
            List<IntegrityAlert> alerts = alertRepo.findByCaseId(caseId);
            Set<String> flagged = new HashSet<>();
            for (IntegrityAlert a : alerts) collectIds(a.getEvidence(), flagged);
            List<Lane> lanes = c.getDomain() == IntegrityDomain.PAYROLL ? payrollLanes(alerts, flagged) : beneficiaryLanes(alerts, flagged);
            lanes = lanes.stream().filter(l -> !l.items().isEmpty()).toList();
            LocalDate from = null, to = null;
            for (Lane l : lanes) {
                for (Item i : l.items()) {
                    if (from == null || i.start().isBefore(from)) from = i.start();
                    if (to == null || i.end().isAfter(to)) to = i.end();
                }
            }
            return new Timeline(c.getDomain(), from, to, lanes);
        });
    }

    private List<Lane> beneficiaryLanes(List<IntegrityAlert> alerts, Set<String> flagged) {
        Map<UUID, EntitlementUnit> units = new LinkedHashMap<>();
        Set<String> people = new LinkedHashSet<>();
        for (IntegrityAlert a : alerts) {
            if (a.getPersonId() != null) people.add(a.getPersonId());
            for (UUID id : cases.resolveUnitIdsForAlert(a)) {
                unitRepo.findById(id).ifPresent(u -> units.putIfAbsent(u.getId(), u));
            }
        }
        List<Item> entitlement = new ArrayList<>();
        List<Item> payments = new ArrayList<>();
        for (EntitlementUnit u : units.values()) {
            LocalDate end = u.getPeriodEnd() != null ? u.getPeriodEnd() : u.getPeriodStart();
            if (u.getPeriodStart() != null) {
                entitlement.add(new Item(u.getId().toString(), u.getPeriodStart(), end, "ENTITLEMENT",
                        u.getSchemeName() + (u.getAuthorizedAmount() != null ? " · ₹" + plain(u.getAuthorizedAmount()) : ""),
                        "Entitlement period" + (u.getStatus() != null ? ", " + u.getStatus().toLowerCase() : ""),
                        u.getAuthorizedAmount(), flagged.contains(u.getId().toString())));
            }
            for (PaymentSettlement p : paymentRepo.findByUnitId(u.getId())) {
                if (p.getPeriodStart() == null) continue;
                boolean reversal = p.getReversalOf() != null || (p.getAmount() != null && p.getAmount().signum() < 0);
                String detail = (p.getStatus() != null ? p.getStatus().toLowerCase() : "")
                        + (p.getTransactionRef() != null ? ", ref " + p.getTransactionRef() : "")
                        + (p.getBankToken() != null ? ", account " + DetectionEngineService.maskToken(p.getBankToken()) : "");
                payments.add(new Item(p.getId().toString(), p.getPeriodStart(), p.getPeriodEnd() != null ? p.getPeriodEnd() : p.getPeriodStart(),
                        reversal ? "REVERSAL" : "PAYMENT", (reversal ? "Reversal ₹" : "₹") + plain(p.getAmount() == null ? BigDecimal.ZERO : p.getAmount().abs()),
                        detail, p.getAmount(), flagged.contains(p.getId().toString())));
            }
        }
        List<Item> events = new ArrayList<>();
        List<Item> changes = new ArrayList<>();
        for (String person : people) {
            for (VerificationEvent ev : eventRepo.findByPersonId(person)) {
                if (ev.getEventDate() == null) continue;
                events.add(new Item(String.valueOf(ev.getId()), ev.getEventDate(), ev.getEventDate(), "EVENT", words(ev.getEventType()),
                        (ev.getSource() != null ? "Source " + ev.getSource() : "") + (ev.getConfidence() != null ? ", " + ev.getConfidence().toLowerCase() + " confidence" : ""),
                        null, DetectionEngineService.isTerminatingEvent(ev.getEventType())));
            }
            changes.addAll(changeItems(person, flagged));
        }
        return List.of(new Lane("entitlement", "Entitlement", sorted(entitlement)), new Lane("payments", "Payments", sorted(payments)),
                new Lane("events", "Verified events", sorted(events)), new Lane("changes", "Record changes", sorted(changes)));
    }

    private List<Lane> payrollLanes(List<IntegrityAlert> alerts, Set<String> flagged) {
        Set<String> employees = new LinkedHashSet<>();
        for (IntegrityAlert a : alerts) if (a.getPersonId() != null) employees.add(a.getPersonId());
        List<Item> service = new ArrayList<>(), pay = new ArrayList<>(), pension = new ArrayList<>(), changes = new ArrayList<>();
        boolean statusCase = alerts.stream().anyMatch(a -> "S02".equals(a.getRuleCode()));
        for (String code : employees) {
            // The date a post-event case turns on: the status date the alert recorded when it was raised (the employee's
            // status may have been corrected since), else the employee's current non-active status.
            LocalDate statusSince = null;
            String statusName = null;
            Optional<EmployeeIdentity> emp = employeeRepo.findByEmployeeCode(code);
            for (IntegrityAlert a : alerts) {
                if (!"S02".equals(a.getRuleCode()) || a.getEvidence() == null || !code.equals(a.getPersonId())) continue;
                Object since = a.getEvidence().get("statusSince");
                if (since != null) {
                    try { statusSince = LocalDate.parse(since.toString()); } catch (RuntimeException ignored) { /* not a date */ }
                }
                Object name = a.getEvidence().get("employmentStatus");
                if (name != null && !"ACTIVE".equalsIgnoreCase(name.toString())) statusName = name.toString();
            }
            if (statusSince == null && emp.isPresent() && emp.get().getStatusSince() != null && emp.get().getStatus() != null
                    && !"ACTIVE".equalsIgnoreCase(emp.get().getStatus())) {
                statusSince = emp.get().getStatusSince();
            }
            if (statusName == null && emp.isPresent() && emp.get().getStatus() != null && !"ACTIVE".equalsIgnoreCase(emp.get().getStatus())) {
                statusName = emp.get().getStatus();
            }
            if (statusSince != null) {
                service.add(new Item("status-" + code, statusSince, statusSince, "EVENT",
                        statusName == null ? "Status changed" : "Status: " + words(statusName),
                        "Recorded status change of the employee", null, statusCase));
            }
            for (ServiceEvent ev : serviceEventRepo.findByEmployeeCode(code)) {
                if (ev.getEffectiveDate() == null) continue;
                service.add(new Item(String.valueOf(ev.getId()), ev.getEffectiveDate(), ev.getEffectiveDate(), "EVENT", words(ev.getEventType()),
                        ev.getOrderRef() != null ? "Order " + ev.getOrderRef() : "No order reference", null, false));
            }
            for (PayrollSettlement p : payrollRepo.findByEmployeeCode(code)) {
                if (p.getPeriodStart() == null) continue;
                boolean reversal = p.getReversalOf() != null || (p.getNetAmount() != null && p.getNetAmount().signum() < 0);
                BigDecimal net = p.getNetAmount() == null ? BigDecimal.ZERO : p.getNetAmount();
                pay.add(new Item(p.getId().toString(), p.getPeriodStart(), p.getPeriodEnd() != null ? p.getPeriodEnd() : p.getPeriodStart(),
                        reversal ? "REVERSAL" : "PAYMENT", words(p.getComponent()) + " · " + p.getDdoCode() + " · ₹" + plain(net.abs()),
                        (reversal ? "Reversal" : "Paid") + (p.getTransactionRef() != null ? ", ref " + p.getTransactionRef() : ""),
                        p.getNetAmount(), flagged.contains(p.getId().toString())
                        || (statusCase && statusSince != null && !reversal && p.getPeriodEnd() != null && p.getPeriodEnd().isAfter(statusSince)
                        && !"PENSION".equalsIgnoreCase(p.getComponent()))));
            }
            pensionRepo.findByEmployeeCode(code).ifPresent(pa -> {
                if (pa.getEffectiveFrom() != null) {
                    pension.add(new Item(String.valueOf(pa.getId()), pa.getEffectiveFrom(), pa.getEffectiveFrom(), "EVENT",
                            "Pension authorised ₹" + plain(pa.getMonthlyRate()) + " a month", "PPO " + pa.getPpoId(), pa.getMonthlyRate(), false));
                }
            });
            changes.addAll(changeItems(code, flagged));
        }
        return List.of(new Lane("service", "Service orders", sorted(service)), new Lane("pay", "Pay", sorted(pay)),
                new Lane("pension", "Pension", sorted(pension)), new Lane("changes", "Record changes", sorted(changes)));
    }

    private List<Item> changeItems(String personKey, Set<String> flagged) {
        List<Item> out = new ArrayList<>();
        for (MasterChangeLog m : changeLogRepo.findByPersonId(personKey)) {
            if (m.getChangedAt() == null) continue;
            LocalDate day = m.getChangedAt().toLocalDate();
            boolean certificate = MasterChangeLog.LIFE_CERTIFICATE_FIELD.equalsIgnoreCase(m.getFieldName());
            boolean bank = "bank_token".equalsIgnoreCase(m.getFieldName());
            String label = certificate ? "Life certificate received" : bank ? "Bank account changed" : words(m.getFieldName()) + " changed";
            String detail = (m.getOperatorId() != null ? "By " + m.getOperatorId() : "")
                    + (!certificate ? (m.getApprovalRef() != null && !m.getApprovalRef().isBlank() ? ", approval " + m.getApprovalRef() : ", no approval reference") : "");
            out.add(new Item(String.valueOf(m.getId()), day, day, certificate ? "CERTIFICATE" : "CHANGE", label, detail, null,
                    bank && (m.getApprovalRef() == null || m.getApprovalRef().isBlank())));
        }
        return out;
    }

    private static List<Item> sorted(List<Item> items) {
        return items.stream().sorted(Comparator.comparing(Item::start).thenComparing(Item::end)).toList();
    }

    private static String plain(BigDecimal n) {
        return n.stripTrailingZeros().toPlainString();
    }

    private static String words(String s) {
        if (s == null) return "";
        String t = s.replace('_', ' ').toLowerCase();
        return Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    /** Every id-like string anywhere in an alert's evidence: these are the records the alert is about. */
    private static void collectIds(Object value, Set<String> out) {
        if (value instanceof Map<?, ?> m) m.values().forEach(v -> collectIds(v, out));
        else if (value instanceof Collection<?> c) c.forEach(v -> collectIds(v, out));
        else if (value instanceof String s && s.length() == 36) {
            try { out.add(UUID.fromString(s).toString()); } catch (IllegalArgumentException ignored) { /* not an id */ }
        } else if (value instanceof UUID u) out.add(u.toString());
    }
}
