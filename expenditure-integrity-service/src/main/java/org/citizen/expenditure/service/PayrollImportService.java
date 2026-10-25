package org.citizen.expenditure.service;

import org.citizen.expenditure.entity.EmployeeIdentity;
import org.citizen.expenditure.entity.PayrollSettlement;
import org.citizen.expenditure.entity.PensionAuthorisation;
import org.citizen.expenditure.entity.ServiceEvent;
import org.citizen.expenditure.repository.EmployeeIdentityRepository;
import org.citizen.expenditure.repository.PayrollSettlementRepository;
import org.citizen.expenditure.repository.PensionAuthorisationRepository;
import org.citizen.expenditure.repository.ServiceEventRepository;
import org.citizen.expenditure.service.CsvSupport.Row;
import org.citizen.expenditure.service.ImportService.ImportResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * CSV loaders for the payroll and pension pilot data (UC4). Like the other importers a file is accepted whole or
 * refused whole, with the line of the first problem.
 *
 * Employees:   employee_code, person_name, ddo_code, post_title, pay_level, status, status_since (optional).
 *              An existing employee_code is updated, so a transfer or retirement is loaded by uploading the new status.
 * Service events: employee_code, event_type, effective_date, order_ref (optional)
 * Payroll:     employee_code, component, ddo_code, period_start, period_end, gross_amount, net_amount,
 *              transaction_ref (required), reversal_of_ref (optional: transaction_ref of the payment being reversed;
 *              a reversal is negative). The reference is what lets a file be uploaded twice without paying twice.
 * Pensions:    ppo_id, employee_code, monthly_rate, effective_from, commutation_amount (optional), recipient_name (optional).
 *              An existing ppo_id is updated (a revised rate); an employee has one authorisation.
 */
@Service
public class PayrollImportService {

    static final Set<String> EMPLOYEE_STATUSES = Set.of("ACTIVE", "TRANSFERRED", "SUSPENDED", "RETIRED", "DECEASED");
    static final Set<String> EVENT_TYPES = Set.of("JOINING", "POSTING", "TRANSFER", "PROMOTION", "SUSPENSION", "REINSTATEMENT", "RETIREMENT", "DEATH");
    static final Set<String> COMPONENTS = Set.of("BASIC", "DA", "HRA", "TA", "ARREARS", "PENSION", "OTHER");
    private static final int IN_CHUNK = 500;

    private final EmployeeIdentityRepository employeeRepo;
    private final ServiceEventRepository eventRepo;
    private final PayrollSettlementRepository payrollRepo;
    private final PensionAuthorisationRepository pensionRepo;

    public PayrollImportService(EmployeeIdentityRepository employeeRepo, ServiceEventRepository eventRepo,
                                PayrollSettlementRepository payrollRepo, PensionAuthorisationRepository pensionRepo) {
        this.employeeRepo = employeeRepo;
        this.eventRepo = eventRepo;
        this.payrollRepo = payrollRepo;
        this.pensionRepo = pensionRepo;
    }

    private Set<String> knownEmployees() {
        return employeeRepo.findAll().stream().map(EmployeeIdentity::getEmployeeCode).collect(Collectors.toSet());
    }

    // ---- employees -----------------------------------------------------------------------------------------

    @Transactional
    public ImportResult importEmployees(InputStream in) throws IOException {
        Map<String, EmployeeIdentity> existing = new HashMap<>();
        for (EmployeeIdentity e : employeeRepo.findAll()) existing.putIfAbsent(e.getEmployeeCode(), e);
        Map<String, Integer> firstLine = new HashMap<>();
        List<EmployeeIdentity> toSave = new ArrayList<>();
        int imported = 0, updated = 0, skipped = 0;
        for (Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("employee_code"))) {
            String[] c = row.cols();
            row.require(c.length >= 6, "expected at least 6 columns (employee_code, person_name, ddo_code, post_title, pay_level, status) but found " + c.length);
            String code = c[0].trim();
            row.require(!code.isEmpty(), "employee_code is empty");
            Integer earlier = firstLine.putIfAbsent(code, row.line());
            row.require(earlier == null, "employee_code '" + code + "' appears twice (first on line " + earlier + ")");
            row.require(!c[1].isBlank(), "person_name is empty");
            row.require(!c[2].isBlank(), "ddo_code is empty");
            String status = c[5].trim().toUpperCase();
            row.require(EMPLOYEE_STATUSES.contains(status), "status '" + c[5].trim() + "' must be one of " + new TreeSet<>(EMPLOYEE_STATUSES));
            LocalDate since = c.length > 6 && !c[6].isBlank() ? row.date(c[6], "status_since") : null;

            EmployeeIdentity e = existing.get(code);
            boolean isNew = e == null;
            if (isNew) e = new EmployeeIdentity();
            boolean changed = isNew
                    || !Objects.equals(e.getPersonName(), c[1].trim()) || !Objects.equals(e.getDdoCode(), c[2].trim())
                    || !Objects.equals(e.getPostTitle(), CsvSupport.blankToNull(c[3])) || !Objects.equals(e.getPayLevel(), CsvSupport.blankToNull(c[4]))
                    || !Objects.equals(e.getStatus(), status) || !Objects.equals(e.getStatusSince(), since)
                    || (c.length > 9 && !Objects.equals(e.getPersonId(), CsvSupport.blankToNull(c[9])));
            if (!changed) {
                skipped++;
                continue;
            }
            e.setEmployeeCode(code);
            e.setPersonName(c[1].trim());
            e.setDdoCode(c[2].trim());
            e.setPostTitle(CsvSupport.blankToNull(c[3]));
            e.setPayLevel(CsvSupport.blankToNull(c[4]));
            e.setStatus(status);
            e.setStatusSince(since);
            if (c.length > 7) e.setDistrict(CsvSupport.blankToNull(c[7]));
            if (c.length > 8) e.setTaluka(CsvSupport.blankToNull(c[8]));
            if (c.length > 9) e.setPersonId(CsvSupport.blankToNull(c[9]));
            toSave.add(e);
            if (isNew) imported++; else updated++;
        }
        employeeRepo.saveAll(toSave);
        return new ImportResult(imported, skipped, updated);
    }

    // ---- service events ------------------------------------------------------------------------------------

    @Transactional
    public ImportResult importServiceEvents(InputStream in) throws IOException {
        Set<String> employees = knownEmployees();
        Map<String, Set<String>> onFile = new HashMap<>();          // employee -> keys of the events already stored
        List<ServiceEvent> toSave = new ArrayList<>();
        int skipped = 0;
        for (Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("employee_code"))) {
            String[] c = row.cols();
            row.require(c.length >= 3, "expected at least 3 columns (employee_code, event_type, effective_date) but found " + c.length);
            String code = c[0].trim();
            row.require(!code.isEmpty(), "employee_code is empty");
            row.require(employees.contains(code), "employee_code '" + code + "' is not a known employee");
            String type = c[1].trim().toUpperCase();
            row.require(EVENT_TYPES.contains(type), "event_type '" + c[1].trim() + "' must be one of " + new TreeSet<>(EVENT_TYPES));
            LocalDate effective = row.date(c[2], "effective_date");
            String orderRef = c.length > 3 ? CsvSupport.blankToNull(c[3]) : null;
            Set<String> keys = onFile.computeIfAbsent(code, k -> eventRepo.findByEmployeeCode(k).stream()
                    .map(e -> eventKey(e.getEventType(), e.getEffectiveDate(), e.getOrderRef())).collect(Collectors.toCollection(HashSet::new)));
            if (!keys.add(eventKey(type, effective, orderRef))) {
                skipped++;                                  // already on file, or repeated in this file
                continue;
            }
            ServiceEvent ev = new ServiceEvent();
            ev.setEmployeeCode(code);
            ev.setEventType(type);
            ev.setEffectiveDate(effective);
            ev.setOrderRef(orderRef);
            toSave.add(ev);
        }
        eventRepo.saveAll(toSave);
        return new ImportResult(toSave.size(), skipped);
    }

    private static String eventKey(String type, LocalDate date, String orderRef) {
        return String.valueOf(type).toUpperCase() + "|" + date + "|" + (orderRef == null ? "" : orderRef.trim());
    }

    // ---- payroll -------------------------------------------------------------------------------------------

    private record PayrollRow(int line, PayrollSettlement payment, String ref, String reversalRef) {}

    @Transactional
    public ImportResult importPayroll(InputStream in) throws IOException {
        Set<String> employees = knownEmployees();
        List<PayrollRow> rows = new ArrayList<>();
        Set<String> refsInFile = new HashSet<>();
        int skipped = 0;
        for (Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("employee_code"))) {
            String[] c = row.cols();
            row.require(c.length >= 8, "expected at least 8 columns (employee_code, component, ddo_code, period_start, period_end, gross_amount, net_amount, transaction_ref) but found " + c.length);
            PayrollSettlement p = new PayrollSettlement();
            String code = c[0].trim();
            row.require(employees.contains(code), "employee_code '" + code + "' is not a known employee");
            p.setEmployeeCode(code);
            String component = c[1].trim().toUpperCase();
            row.require(COMPONENTS.contains(component), "component '" + c[1].trim() + "' must be one of " + new TreeSet<>(COMPONENTS));
            p.setComponent(component);
            row.require(!c[2].isBlank(), "ddo_code is empty");
            p.setDdoCode(c[2].trim());
            p.setPeriodStart(row.date(c[3], "period_start"));
            p.setPeriodEnd(row.date(c[4], "period_end"));
            row.require(!p.getPeriodEnd().isBefore(p.getPeriodStart()), "period_end is before period_start");
            p.setGrossAmount(row.amount(c[5], "gross_amount"));
            p.setNetAmount(row.amount(c[6], "net_amount"));
            String ref = CsvSupport.blankToNull(c[7]);
            row.require(ref != null, "transaction_ref is required: it is what tells a file loaded twice from a payment made twice");
            p.setTransactionRef(ref);
            String reversalRef = c.length > 8 ? CsvSupport.blankToNull(c[8]) : null;
            if (reversalRef != null) {
                row.require(p.getGrossAmount().signum() < 0 && p.getNetAmount().signum() < 0, "a reversal must have negative gross_amount and net_amount");
                row.require(!reversalRef.equals(ref), "reversal_of_ref cannot be the row's own transaction_ref");
            } else {
                row.require(p.getGrossAmount().signum() > 0 && p.getNetAmount().signum() > 0,
                        "gross_amount and net_amount must be greater than zero (a reversal needs reversal_of_ref)");
            }
            if (!refsInFile.add(ref)) {
                skipped++;                                  // the same payment twice in one file
                continue;
            }
            rows.add(new PayrollRow(row.line(), p, ref, reversalRef));
        }

        // payments already loaded are skipped; reversals may point at payments loaded earlier or in this file
        Set<String> wanted = new HashSet<>();
        for (PayrollRow r : rows) {
            wanted.add(r.ref());
            if (r.reversalRef() != null) wanted.add(r.reversalRef());
        }
        Map<String, PayrollSettlement> stored = storedByRef(wanted);
        List<PayrollRow> fresh = new ArrayList<>();
        for (PayrollRow r : rows) {
            if (stored.containsKey(r.ref())) skipped++;
            else fresh.add(r);
        }
        Set<String> freshOriginals = fresh.stream().filter(r -> r.reversalRef() == null).map(PayrollRow::ref).collect(Collectors.toSet());
        for (PayrollRow r : fresh) {
            if (r.reversalRef() != null && !stored.containsKey(r.reversalRef()) && !freshOriginals.contains(r.reversalRef())) {
                throw new CsvImportException(r.line(), "reversal_of_ref '" + r.reversalRef() + "' is not a payment that was loaded earlier or is in this file");
            }
        }

        List<PayrollSettlement> originals = fresh.stream().filter(r -> r.reversalRef() == null).map(PayrollRow::payment).toList();
        Map<String, UUID> idByRef = new HashMap<>();
        stored.forEach((ref, p) -> idByRef.put(ref, p.getId()));
        for (PayrollSettlement saved : payrollRepo.saveAll(originals)) idByRef.put(saved.getTransactionRef(), saved.getId());
        List<PayrollSettlement> reversals = new ArrayList<>();
        for (PayrollRow r : fresh) {
            if (r.reversalRef() == null) continue;
            r.payment().setReversalOf(idByRef.get(r.reversalRef()));
            reversals.add(r.payment());
        }
        payrollRepo.saveAll(reversals);
        return new ImportResult(fresh.size(), skipped);
    }

    private Map<String, PayrollSettlement> storedByRef(Set<String> refs) {
        Map<String, PayrollSettlement> found = new HashMap<>();
        List<String> all = new ArrayList<>(refs);
        for (int i = 0; i < all.size(); i += IN_CHUNK) {
            for (PayrollSettlement p : payrollRepo.findByTransactionRefIn(all.subList(i, Math.min(all.size(), i + IN_CHUNK)))) {
                if (p.getTransactionRef() != null) found.putIfAbsent(p.getTransactionRef(), p);
            }
        }
        return found;
    }

    // ---- pensions ------------------------------------------------------------------------------------------

    @Transactional
    public ImportResult importPensions(InputStream in) throws IOException {
        Set<String> employees = knownEmployees();
        Map<String, PensionAuthorisation> byPpo = new HashMap<>();
        Map<String, String> ppoOfEmployee = new HashMap<>();
        for (PensionAuthorisation a : pensionRepo.findAll()) {
            byPpo.put(a.getPpoId(), a);
            ppoOfEmployee.put(a.getEmployeeCode(), a.getPpoId());
        }
        Map<String, Integer> firstLine = new HashMap<>();
        List<PensionAuthorisation> toSave = new ArrayList<>();
        int imported = 0, updated = 0, skipped = 0;
        for (Row row : CsvSupport.readRows(in, head -> !head.equalsIgnoreCase("ppo_id"))) {
            String[] c = row.cols();
            row.require(c.length >= 4, "expected at least 4 columns (ppo_id, employee_code, monthly_rate, effective_from) but found " + c.length);
            String ppo = c[0].trim();
            row.require(!ppo.isEmpty(), "ppo_id is empty");
            Integer earlier = firstLine.putIfAbsent(ppo, row.line());
            row.require(earlier == null, "ppo_id '" + ppo + "' appears twice (first on line " + earlier + ")");
            String code = c[1].trim();
            row.require(employees.contains(code), "employee_code '" + code + "' is not a known employee");
            BigDecimal rate = row.amount(c[2], "monthly_rate");
            row.require(rate.signum() > 0, "monthly_rate must be greater than zero");
            LocalDate from = row.date(c[3], "effective_from");
            BigDecimal commutation = c.length > 4 && !c[4].isBlank() ? row.amount(c[4], "commutation_amount") : null;
            row.require(commutation == null || commutation.signum() >= 0, "commutation_amount must not be negative");
            String recipient = c.length > 5 ? CsvSupport.blankToNull(c[5]) : null;

            PensionAuthorisation a = byPpo.get(ppo);
            boolean isNew = a == null;
            if (!isNew) {
                row.require(code.equals(a.getEmployeeCode()), "ppo_id '" + ppo + "' belongs to employee '" + a.getEmployeeCode() + "', not '" + code + "'");
            } else {
                String other = ppoOfEmployee.get(code);
                row.require(other == null, "employee '" + code + "' already has PPO '" + other + "'; an employee has one authorisation");
                a = new PensionAuthorisation();
            }
            boolean changed = isNew
                    || a.getMonthlyRate().compareTo(rate) != 0 || !Objects.equals(a.getEffectiveFrom(), from)
                    || !sameAmount(a.getCommutationAmount(), commutation) || !Objects.equals(a.getRecipientName(), recipient);
            ppoOfEmployee.put(code, ppo);
            if (!changed) {
                skipped++;
                continue;
            }
            a.setPpoId(ppo);
            a.setEmployeeCode(code);
            a.setMonthlyRate(rate);
            a.setEffectiveFrom(from);
            a.setCommutationAmount(commutation);
            a.setRecipientName(recipient);
            toSave.add(a);
            if (isNew) imported++; else updated++;
        }
        pensionRepo.saveAll(toSave);
        return new ImportResult(imported, skipped, updated);
    }

    private static boolean sameAmount(BigDecimal a, BigDecimal b) {
        return a == null ? b == null : b != null && a.compareTo(b) == 0;
    }
}
