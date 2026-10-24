package org.magicsword.expenditure.service;

import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.MasterChangeLog;
import org.magicsword.expenditure.entity.PaymentSettlement;
import org.magicsword.expenditure.entity.VerificationEvent;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.MasterChangeLogRepository;
import org.magicsword.expenditure.repository.PaymentSettlementRepository;
import org.magicsword.expenditure.repository.VerificationEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * CSV loaders for the pilot data.
 *
 * Units:       id (optional), scheme_id, scheme_name, person_id, person_name, district, authorized_amount,
 *              period_start, period_end (optional), family_id (optional)
 * Settlements: unit_id, period_start, period_end, amount, status, bank_token, transaction_ref (optional),
 *              reversal_of (optional: the id of the payment this row reverses)
 * Life certificates: employee_code, received_date, reference (optional)
 *
 * A file is accepted whole or refused whole: every row is checked first, and the first problem is reported with
 * its line number. Rows that were loaded before (same unit id, same transaction reference) are skipped, so
 * uploading the same file twice does not pay anyone twice.
 */
@Service
public class ImportService {

    /** {@code updated} counts existing records a file changed (employees and pensions can be revised by re-uploading). */
    public record ImportResult(int imported, int skipped, int updated, Integer newlyAtRisk) {
        public ImportResult(int imported, int skipped) {
            this(imported, skipped, 0, null);
        }

        public ImportResult(int imported, int skipped, int updated) {
            this(imported, skipped, updated, null);
        }
    }

    private static final Set<String> SETTLEMENT_STATUSES = Set.of("SETTLED", "PENDING", "REJECTED", "FAILED");
    private static final Set<String> VERIFICATION_EVENT_TYPES = Set.of("DEATH", "STATUS_TERMINATION", "LIFE_CERT_EXPIRED");
    private static final Set<String> CONFIDENCE_LEVELS = Set.of("HIGH", "MEDIUM", "LOW");

    private final EntitlementUnitRepository unitRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final EmployeeIdentityRepository employeeRepo;
    private final MasterChangeLogRepository changeLogRepo;
    private final VerificationEventRepository eventRepo;
    private final VerifiedEventRiskService verifiedEventRisk;

    public ImportService(EntitlementUnitRepository unitRepo, PaymentSettlementRepository paymentRepo,
                         EmployeeIdentityRepository employeeRepo, MasterChangeLogRepository changeLogRepo,
                         VerificationEventRepository eventRepo, VerifiedEventRiskService verifiedEventRisk) {
        this.unitRepo = unitRepo;
        this.paymentRepo = paymentRepo;
        this.employeeRepo = employeeRepo;
        this.changeLogRepo = changeLogRepo;
        this.eventRepo = eventRepo;
        this.verifiedEventRisk = verifiedEventRisk;
    }

    // ---- settlements ---------------------------------------------------------------------------------------

    @Transactional
    public ImportResult importSettlementsCsv(InputStream in) throws IOException {
        List<PaymentSettlement> toSave = new ArrayList<>();
        Set<String> refsInFile = new HashSet<>();
        int skipped = 0;
        for (CsvSupport.Row row : CsvSupport.readRows(in, CsvSupport::looksLikeUuid)) {
            String[] c = row.cols();
            row.require(c.length >= 6, "expected at least 6 columns (unit_id, period_start, period_end, amount, status, bank_token) but found " + c.length);
            PaymentSettlement p = new PaymentSettlement();
            p.setUnitId(row.uuid(c[0], "unit_id"));
            row.require(unitRepo.existsById(p.getUnitId()), "unit_id " + c[0].trim() + " is not a known entitlement unit");
            p.setPeriodStart(row.date(c[1], "period_start"));
            p.setPeriodEnd(row.date(c[2], "period_end"));
            row.require(!p.getPeriodEnd().isBefore(p.getPeriodStart()), "period_end is before period_start");
            p.setAmount(row.amount(c[3], "amount"));
            String status = c[4].trim().toUpperCase();
            row.require(SETTLEMENT_STATUSES.contains(status), "status '" + c[4].trim() + "' must be one of " + new java.util.TreeSet<>(SETTLEMENT_STATUSES));
            p.setStatus(status);
            p.setBankToken(CsvSupport.blankToNull(c[5]));
            p.setTransactionRef(c.length > 6 ? CsvSupport.blankToNull(c[6]) : null);
            String reversalOf = c.length > 7 ? CsvSupport.blankToNull(c[7]) : null;
            if (reversalOf != null) {
                p.setReversalOf(row.uuid(reversalOf, "reversal_of"));
                row.require(paymentRepo.existsById(p.getReversalOf()),
                        "reversal_of " + reversalOf + " is not a payment that was loaded earlier");
            } else {
                row.require(p.getAmount().signum() > 0, "amount must be greater than zero (a reversal needs reversal_of)");
            }
            String ref = p.getTransactionRef();
            if (ref != null && (!refsInFile.add(ref) || paymentRepo.existsByTransactionRef(ref))) {
                skipped++;                      // already loaded: not a second payment
                continue;
            }
            toSave.add(p);
        }
        paymentRepo.saveAll(toSave);
        return new ImportResult(toSave.size(), skipped);
    }

    // ---- units ---------------------------------------------------------------------------------------------

    @Transactional
    public ImportResult importUnitsCsv(InputStream in) throws IOException {
        List<EntitlementUnit> toSave = new ArrayList<>();
        Set<UUID> idsInFile = new HashSet<>();
        int skipped = 0;
        for (CsvSupport.Row row : CsvSupport.readRows(in, head -> head.isEmpty() || CsvSupport.looksLikeUuid(head))) {
            String[] c = row.cols();
            row.require(c.length >= 8, "expected at least 8 columns (id, scheme_id, scheme_name, person_id, person_name, district, authorized_amount, period_start) but found " + c.length);
            EntitlementUnit u = new EntitlementUnit();
            u.setId(c[0].isBlank() ? UUID.randomUUID() : row.uuid(c[0], "id"));      // assigned here: the entity does not generate ids
            u.setSchemeId(row.uuid(c[1], "scheme_id"));
            u.setSchemeName(c[2].trim());
            row.require(!c[3].isBlank(), "person_id is empty");
            u.setPersonId(c[3].trim());
            u.setPersonName(c[4].trim());
            u.setDistrict(CsvSupport.blankToNull(c[5]));
            int idx = 6;
            if (idx < c.length && !CsvSupport.looksLikeAmount(c[idx])) {
                u.setTaluka(CsvSupport.blankToNull(c[idx++]));
                if (idx < c.length && !CsvSupport.looksLikeAmount(c[idx])) {
                    u.setVillage(CsvSupport.blankToNull(c[idx++]));
                }
            }
            row.require(idx < c.length && CsvSupport.looksLikeAmount(c[idx]),
                    "authorized_amount is missing (use district, taluka, village?, authorized_amount, period_start, …)");
            u.setAuthorizedAmount(row.amount(c[idx++], "authorized_amount"));
            row.require(u.getAuthorizedAmount().signum() >= 0, "authorized_amount must not be negative");
            u.setPeriodStart(row.date(c[idx++], "period_start"));
            if (idx < c.length && !c[idx].isBlank()) {
                u.setPeriodEnd(row.date(c[idx++], "period_end"));
                row.require(!u.getPeriodEnd().isBefore(u.getPeriodStart()), "period_end is before period_start");
            }
            if (idx < c.length) u.setFamilyId(CsvSupport.blankToNull(c[idx]));
            if (!idsInFile.add(u.getId()) || unitRepo.existsById(u.getId())) {
                skipped++;
                continue;
            }
            toSave.add(u);
        }
        unitRepo.saveAll(toSave);
        return new ImportResult(toSave.size(), skipped);
    }

    // ---- life certificates ---------------------------------------------------------------------------------

    /**
     * Records the date a pensioner's life certificate was received, as the master-change entry rule S06 looks for. A
     * certificate already on file for that employee and date is skipped. {@code operator} is who loaded the file.
     */
    @Transactional
    public ImportResult importLifeCertificatesCsv(InputStream in, String operator) throws IOException {
        List<MasterChangeLog> toSave = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int skipped = 0;
        for (CsvSupport.Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("employee_code"))) {
            String[] c = row.cols();
            row.require(c.length >= 2, "expected at least 2 columns (employee_code, received_date) but found " + c.length);
            String code = c[0].trim();
            row.require(!code.isEmpty(), "employee_code is empty");
            row.require(employeeRepo.findByEmployeeCode(code).isPresent(), "employee_code '" + code + "' is not a known employee");
            LocalDate received = row.date(c[1], "received_date");
            row.require(!received.isAfter(LocalDate.now()), "received_date " + received + " is in the future");
            boolean onFile = changeLogRepo.findByPersonId(code).stream()
                    .anyMatch(e -> MasterChangeLog.LIFE_CERTIFICATE_FIELD.equalsIgnoreCase(e.getFieldName())
                            && e.getChangedAt() != null && e.getChangedAt().toLocalDate().equals(received));
            if (onFile || !seen.add(code + "|" + received)) {
                skipped++;
                continue;
            }
            MasterChangeLog entry = new MasterChangeLog();
            entry.setPersonId(code);
            entry.setFieldName(MasterChangeLog.LIFE_CERTIFICATE_FIELD);
            entry.setNewValue("received");
            entry.setOperatorId(operator);
            entry.setApprovalRef(c.length > 2 ? CsvSupport.blankToNull(c[2]) : null);
            entry.setChangedAt(received.atStartOfDay());
            toSave.add(entry);
        }
        changeLogRepo.saveAll(toSave);
        return new ImportResult(toSave.size(), skipped);
    }

    // ---- verification events (deaths, terminations) --------------------------------------------------------

    /**
     * Death and status records for rule 803 and the pre-payment gate. Columns:
     * person_id, event_type, event_date, source?, confidence?, family_id?
     */
    @Transactional
    public ImportResult importVerificationEventsCsv(InputStream in) throws IOException {
        List<VerificationEvent> toSave = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int skipped = 0;
        for (CsvSupport.Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("person_id"))) {
            String[] c = row.cols();
            row.require(c.length >= 3, "expected at least 3 columns (person_id, event_type, event_date) but found " + c.length);
            String personId = c[0].trim();
            row.require(!personId.isEmpty(), "person_id is empty");
            String eventType = c[1].trim().toUpperCase();
            row.require(VERIFICATION_EVENT_TYPES.contains(eventType),
                    "event_type '" + c[1].trim() + "' must be one of " + new java.util.TreeSet<>(VERIFICATION_EVENT_TYPES));
            LocalDate eventDate = row.date(c[2], "event_date");
            row.require(!eventDate.isAfter(LocalDate.now()), "event_date " + eventDate + " is in the future");
            String source = c.length > 3 ? CsvSupport.blankToNull(c[3]) : null;
            String confidenceRaw = c.length > 4 ? CsvSupport.blankToNull(c[4]) : null;
            String confidence = confidenceRaw == null ? "MEDIUM" : confidenceRaw.toUpperCase();
            row.require(CONFIDENCE_LEVELS.contains(confidence),
                    "confidence '" + confidenceRaw + "' must be HIGH, MEDIUM or LOW");
            String familyId = c.length > 5 ? CsvSupport.blankToNull(c[5]) : null;
            String dedupeKey = personId + "|" + eventType + "|" + eventDate;
            if (eventRepo.existsByPersonIdAndEventTypeAndEventDate(personId, eventType, eventDate)
                    || !seen.add(dedupeKey)) {
                skipped++;
                continue;
            }
            VerificationEvent ev = new VerificationEvent();
            ev.setPersonId(personId);
            ev.setEventType(eventType);
            ev.setEventDate(eventDate);
            ev.setSource(source);
            ev.setConfidence(confidence);
            ev.setFamilyId(familyId);
            ev.setCreatedAt(LocalDateTime.now());
            toSave.add(ev);
        }
        eventRepo.saveAll(toSave);
        int newlyAtRisk = toSave.isEmpty() ? 0 : verifiedEventRisk.countPeopleAtRisk(toSave);
        return new ImportResult(toSave.size(), skipped, 0, newlyAtRisk);
    }

    // ---- reading -------------------------------------------------------------------------------------------
}
