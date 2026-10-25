package org.citizen.expenditure.service;

import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The pre-payment gate: screens a payment file before the money moves. A HOLD means the payment would break a rule
 * (nothing is due, already paid, after a death, over the entitlement); a REVIEW means it looks risky but may be fine.
 * An officer then confirms the hold or releases it with a reason. Nothing here pays anything: it only advises.
 */
@Service
public class PaymentGateService {

    @Value("${integrity.pilot.grace-days-after-death:30}")
    private int defaultGraceDays;

    @Value("${integrity.rule804.bank-token-min-units:4}")
    private int bankClusterMin;

    private final PaymentBatchRepository batchRepo;
    private final PaymentBatchLineRepository lineRepo;
    private final EntitlementUnitRepository unitRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final VerificationEventRepository eventRepo;
    private final SchemeGraceConfigRepository graceRepo;
    private final MutualExclusionSchemePairRepository pairRepo;
    private final IntegrityAlertRepository alertRepo;

    public PaymentGateService(PaymentBatchRepository batchRepo, PaymentBatchLineRepository lineRepo,
                              EntitlementUnitRepository unitRepo, PaymentSettlementRepository paymentRepo,
                              VerificationEventRepository eventRepo, SchemeGraceConfigRepository graceRepo,
                              MutualExclusionSchemePairRepository pairRepo, IntegrityAlertRepository alertRepo) {
        this.batchRepo = batchRepo;
        this.lineRepo = lineRepo;
        this.unitRepo = unitRepo;
        this.paymentRepo = paymentRepo;
        this.eventRepo = eventRepo;
        this.graceRepo = graceRepo;
        this.pairRepo = pairRepo;
        this.alertRepo = alertRepo;
    }

    private static Map<String, Object> reason(String code, String text) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("text", text);
        return m;
    }

    @Transactional
    public PaymentBatch screen(String name, InputStream in, String operator) throws IOException {
        List<CsvSupport.Row> rows = CsvSupport.readRows(in, head -> head.isEmpty() || !head.toLowerCase().startsWith("payment_ref"));
        if (rows.isEmpty()) throw new CsvImportException(0, "the file has no payment lines");
        List<PaymentBatchLine> lines = new ArrayList<>();
        for (CsvSupport.Row row : rows) {
            String[] c = row.cols();
            row.require(c.length >= 5, "expected payment_ref, unit_id, period_start, period_end, amount[, bank_token] but found " + c.length + " columns");
            row.require(!c[0].isBlank(), "payment_ref is empty");
            PaymentBatchLine l = new PaymentBatchLine();
            l.setLineNo(lines.size() + 1);
            l.setPaymentRef(c[0].trim());
            l.setUnitId(row.uuid(c[1], "unit_id"));
            l.setPeriodStart(row.date(c[2], "period_start"));
            l.setPeriodEnd(row.date(c[3], "period_end"));
            row.require(!l.getPeriodEnd().isBefore(l.getPeriodStart()), "period_end is before period_start");
            l.setAmount(row.amount(c[4], "amount"));
            row.require(l.getAmount().signum() > 0, "amount must be more than zero");
            l.setBankToken(c.length > 5 ? CsvSupport.blankToNull(c[5]) : null);
            lines.add(l);
        }

        Set<UUID> unitIds = lines.stream().map(PaymentBatchLine::getUnitId).collect(Collectors.toSet());
        Map<UUID, EntitlementUnit> units = unitRepo.findAllById(unitIds).stream().collect(Collectors.toMap(EntitlementUnit::getId, u -> u));
        Set<String> people = units.values().stream().map(EntitlementUnit::getPersonId).collect(Collectors.toSet());
        Map<String, List<EntitlementUnit>> unitsByPerson = unitRepo.findByPersonIdIn(people).stream().collect(Collectors.groupingBy(EntitlementUnit::getPersonId));
        Map<String, List<VerificationEvent>> eventsByPerson = eventRepo.findByPersonIdIn(people).stream().collect(Collectors.groupingBy(VerificationEvent::getPersonId));
        Map<UUID, List<PaymentSettlement>> paidByUnit = standing(paymentRepo.findByUnitIdIn(unitIds));
        Set<String> knownRefs = paymentRepo.findAll().stream().map(PaymentSettlement::getTransactionRef).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<String> tokens = lines.stream().map(PaymentBatchLine::getBankToken).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<String, Set<String>> peopleByToken = new HashMap<>();
        if (!tokens.isEmpty()) {
            for (PaymentSettlement p : paymentRepo.findByBankTokenIn(tokens)) {
                unitRepo.findById(p.getUnitId()).ifPresent(u -> peopleByToken.computeIfAbsent(p.getBankToken(), k -> new HashSet<>()).add(u.getPersonId()));
            }
        }
        Set<String> pairs = new HashSet<>();
        pairRepo.findAll().forEach(p -> pairs.add(DetectionEngineService.pairKey(p.getSchemeIdA(), p.getSchemeIdB())));
        Map<String, Set<String>> openAlertCodes = new HashMap<>();
        for (IntegrityAlert a : alertRepo.findByDomainAndStatus(org.citizen.expenditure.domain.IntegrityDomain.BENEFICIARY, "OPEN")) {
            if (a.getPersonId() != null && Set.of("801", "802", "803", "806").contains(a.getRuleCode())) {
                openAlertCodes.computeIfAbsent(a.getPersonId(), k -> new TreeSet<>()).add(a.getRuleCode());
            }
        }

        Set<String> refsInFile = new HashSet<>();
        Map<UUID, BigDecimal> runningByUnit = new HashMap<>();
        BigDecimal total = BigDecimal.ZERO;
        for (PaymentBatchLine l : lines) {
            total = total.add(l.getAmount());
            List<Map<String, Object>> holds = new ArrayList<>();
            List<Map<String, Object>> reviews = new ArrayList<>();
            EntitlementUnit u = units.get(l.getUnitId());
            if (!refsInFile.add(l.getPaymentRef()) || knownRefs.contains(l.getPaymentRef())) {
                holds.add(reason("DUPLICATE_REFERENCE", "Payment reference " + l.getPaymentRef() + " has already been used"));
            }
            if (u == null) {
                holds.add(reason("UNKNOWN_UNIT", "No entitlement exists for this unit id"));
            } else {
                l.setPersonId(u.getPersonId());
                l.setPersonName(u.getPersonName());
                l.setSchemeId(u.getSchemeId());
                l.setSchemeName(u.getSchemeName());
                l.setDistrict(u.getDistrict());
                if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
                    holds.add(reason("UNIT_NOT_ACTIVE", "The entitlement is " + u.getStatus() + ", so nothing is due"));
                }
                if (u.getPeriodStart() != null && u.getPeriodEnd() != null
                        && (l.getPeriodStart().isBefore(u.getPeriodStart()) || l.getPeriodEnd().isAfter(u.getPeriodEnd()))) {
                    holds.add(reason("OUTSIDE_ENTITLEMENT_PERIOD", "The payment period " + l.getPeriodStart() + " to " + l.getPeriodEnd()
                            + " is outside the entitlement " + u.getPeriodStart() + " to " + u.getPeriodEnd()));
                }
                List<PaymentSettlement> paid = paidByUnit.getOrDefault(u.getId(), List.of());
                for (PaymentSettlement p : paid) {
                    if (DetectionEngineService.periodsOverlap(p.getPeriodStart(), p.getPeriodEnd(), l.getPeriodStart(), l.getPeriodEnd())) {
                        holds.add(reason("ALREADY_PAID_FOR_PERIOD", "Rs " + p.getAmount().stripTrailingZeros().toPlainString() + " was already paid for " + p.getPeriodStart() + " to " + p.getPeriodEnd()));
                        break;
                    }
                }
                BigDecimal before = runningByUnit.computeIfAbsent(u.getId(),
                        k -> paid.stream().map(PaymentSettlement::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
                BigDecimal after = before.add(l.getAmount());
                runningByUnit.put(u.getId(), after);
                if (u.getAuthorizedAmount() != null && after.compareTo(u.getAuthorizedAmount()) > 0) {
                    holds.add(reason("OVER_ENTITLEMENT", "Total paid would be Rs " + after.stripTrailingZeros().toPlainString()
                            + " against an entitlement of Rs " + u.getAuthorizedAmount().stripTrailingZeros().toPlainString()));
                }
                for (EntitlementUnit other : unitsByPerson.getOrDefault(u.getPersonId(), List.of())) {
                    if (other.getId().equals(u.getId()) || !"ACTIVE".equalsIgnoreCase(other.getStatus())) continue;
                    if (!pairs.contains(DetectionEngineService.pairKey(u.getSchemeId(), other.getSchemeId()))) continue;
                    if (!DetectionEngineService.periodsOverlap(u.getPeriodStart(), u.getPeriodEnd(), other.getPeriodStart(), other.getPeriodEnd())) continue;
                    boolean later = other.getPeriodStart() != null && u.getPeriodStart() != null
                            && (u.getPeriodStart().isAfter(other.getPeriodStart())
                            || (u.getPeriodStart().equals(other.getPeriodStart()) && u.getId().compareTo(other.getId()) > 0));
                    if (later) holds.add(reason("MUTUAL_EXCLUSION", "The person also holds " + other.getSchemeName() + ", which cannot be combined with " + u.getSchemeName()));
                }
                int grace = graceRepo.findBySchemeId(u.getSchemeId()).map(SchemeGraceConfig::getGraceDaysAfterTermination).orElse(defaultGraceDays);
                for (VerificationEvent ev : eventsByPerson.getOrDefault(u.getPersonId(), List.of())) {
                    if (!DetectionEngineService.isTerminatingEvent(ev.getEventType()) || ev.getEventDate() == null) continue;
                    if (l.getPeriodEnd().isAfter(ev.getEventDate().plusDays(grace))) {
                        holds.add(reason("AFTER_VERIFIED_EVENT", ev.getEventType() + " recorded on " + ev.getEventDate() + "; this pays up to " + l.getPeriodEnd() + " (grace " + grace + " days)"));
                        break;
                    }
                }
                Set<String> open = openAlertCodes.getOrDefault(u.getPersonId(), Set.of());
                if (open.contains("801")) reviews.add(reason("REPEATED_ENROLMENT", "An open repeated-enrolment alert exists for this person"));
                for (String code : open) {
                    if (!code.equals("801")) reviews.add(reason("OPEN_ALERT_" + code, "An open rule " + code + " alert exists for this person"));
                }
            }
            if (l.getBankToken() == null) {
                reviews.add(reason("NO_BANK_REFERENCE", "The file gives no bank reference, so the account cannot be checked"));
            } else {
                Set<String> sharers = new HashSet<>(peopleByToken.getOrDefault(l.getBankToken(), Set.of()));
                if (l.getPersonId() != null) sharers.add(l.getPersonId());
                if (sharers.size() >= bankClusterMin) {
                    reviews.add(reason("SHARED_BANK_ACCOUNT", "Account " + DetectionEngineService.maskToken(l.getBankToken()) + " is used by " + sharers.size() + " different people"));
                }
            }
            holds.addAll(reviews);
            l.setReasons(holds);
            l.setVerdict(holds.isEmpty() ? PaymentBatchLine.CLEAR
                    : holds.size() > reviews.size() ? PaymentBatchLine.HOLD : PaymentBatchLine.REVIEW);
            if (l.getBankToken() != null) l.setBankToken(DetectionEngineService.maskToken(l.getBankToken()));
        }

        PaymentBatch b = new PaymentBatch();
        b.setName(name == null || name.isBlank() ? "Payment file" : name.trim());
        b.setUploadedBy(operator);
        b.setLineCount(lines.size());
        b.setTotalAmount(total);
        b = batchRepo.save(b);
        for (PaymentBatchLine l : lines) l.setBatchId(b.getId());
        lineRepo.saveAll(lines);
        return b;
    }

    /** Payments not undone by a reversal, grouped by unit. */
    private static Map<UUID, List<PaymentSettlement>> standing(List<PaymentSettlement> all) {
        Set<UUID> reversed = all.stream().map(PaymentSettlement::getReversalOf).filter(Objects::nonNull).collect(Collectors.toSet());
        return all.stream().filter(p -> p.getReversalOf() == null && !reversed.contains(p.getId()))
                .collect(Collectors.groupingBy(PaymentSettlement::getUnitId));
    }

    public List<Map<String, Object>> listBatches() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PaymentBatch b : batchRepo.findTop50ByOrderByUploadedAtDesc()) out.add(summary(b));
        return out;
    }

    public Map<String, Object> getBatch(UUID id, String verdict, int page, int size) {
        PaymentBatch b = batchRepo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment file not found"));
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by("lineNo"));
        var lines = verdict == null || verdict.isBlank() ? lineRepo.findByBatchId(id, pr) : lineRepo.findByBatchIdAndVerdict(id, verdict.toUpperCase(), pr);
        Map<String, Object> m = summary(b);
        m.put("lines", lines.getContent());
        m.put("totalLines", lines.getTotalElements());
        return m;
    }

    private Map<String, Object> summary(PaymentBatch b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("name", b.getName());
        m.put("uploadedBy", b.getUploadedBy());
        m.put("uploadedAt", b.getUploadedAt());
        m.put("lineCount", b.getLineCount());
        m.put("totalAmount", b.getTotalAmount());
        Map<String, Long> count = new LinkedHashMap<>();
        Map<String, BigDecimal> amount = new LinkedHashMap<>();
        for (String v : List.of("CLEAR", "REVIEW", "HOLD")) { count.put(v, 0L); amount.put(v, BigDecimal.ZERO); }
        long pending = 0, confirmed = 0, released = 0;
        for (Object[] r : lineRepo.summarise(b.getId())) {
            String v = (String) r[0];
            String d = (String) r[1];
            long n = ((Number) r[2]).longValue();
            count.merge(v, n, Long::sum);
            amount.merge(v, new BigDecimal(r[3].toString()), BigDecimal::add);
            if (!v.equals("CLEAR")) {
                if (PaymentBatchLine.HOLD_CONFIRMED.equals(d)) confirmed += n;
                else if (PaymentBatchLine.RELEASED.equals(d)) released += n;
                else pending += n;
            }
        }
        m.put("counts", count);
        m.put("amounts", amount);
        m.put("undecided", pending);
        m.put("holdsConfirmed", confirmed);
        m.put("released", released);
        return m;
    }

    @Transactional
    public PaymentBatchLine decide(UUID batchId, UUID lineId, String action, String reasonText, String operator) {
        PaymentBatchLine l = lineRepo.findById(lineId).filter(x -> x.getBatchId().equals(batchId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment line not found"));
        if (PaymentBatchLine.CLEAR.equals(l.getVerdict()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This payment is clear; there is nothing to decide");
        if (!PaymentBatchLine.NO_DECISION.equals(l.getDecision()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This payment already has a decision");
        String a = action == null ? "" : action.trim().toUpperCase();
        if (!a.equals("CONFIRM_HOLD") && !a.equals("RELEASE"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Action must be CONFIRM_HOLD or RELEASE");
        if (a.equals("RELEASE") && (reasonText == null || reasonText.isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reason is required to release a payment that was flagged");
        l.setDecision(a.equals("RELEASE") ? PaymentBatchLine.RELEASED : PaymentBatchLine.HOLD_CONFIRMED);
        l.setDecisionReason(reasonText == null || reasonText.isBlank() ? null : reasonText.trim());
        l.setDecidedBy(operator);
        l.setDecidedAt(LocalDateTime.now());
        return lineRepo.save(l);
    }

    /** Hold-confirmed lines since a date, for monthly overview bucketing. */
    public List<PaymentBatchLine> holdConfirmedSince(LocalDateTime since) {
        return lineRepo.findByDecisionAndDecidedAtGreaterThanEqual(PaymentBatchLine.HOLD_CONFIRMED, since);
    }

    /** Figures for the acceptance summary. */
    public Map<String, Object> metrics() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("gateBatches", batchRepo.count());
        m.put("gatePreventedAmount", lineRepo.sumAmountByDecision(PaymentBatchLine.HOLD_CONFIRMED));
        m.put("gateHeldPendingAmount", lineRepo.sumPendingHolds());
        m.put("gateHoldsReleased", lineRepo.countByDecision(PaymentBatchLine.RELEASED));
        return m;
    }
}
