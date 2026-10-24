package org.magicsword.expenditure.service;

import org.magicsword.expenditure.repository.ReadinessQueryRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ReadinessService {

    private final ReadinessQueryRepository queries;

    public ReadinessService(ReadinessQueryRepository queries) {
        this.queries = queries;
    }

    public Map<String, Object> readiness() {
        List<Map<String, Object>> feeds = new ArrayList<>();
        feeds.add(entitlementFeed());
        feeds.add(settlementFeed());
        feeds.add(verificationFeed());
        feeds.add(masterChangeFeed());
        feeds.add(employeeFeed());
        feeds.add(serviceEventFeed());
        feeds.add(payrollFeed());
        feeds.add(pensionFeed());
        return Map.of("feeds", feeds, "asOf", LocalDateTime.now());
    }

    private Map<String, Object> entitlementFeed() {
        long total = queries.countUnits();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "units-missing-geo",
                "Taluka and village present",
                queries.countUnitsMissingTalukaOrVillage(),
                total,
                "Taluka-level reporting and village filters need geography on every unit.",
                "Taluka demo data reporting",
                null,
                "Ask the scheme department for taluka and village on every entitlement row.",
                "units"));
        checks.add(check(
                "units-missing-snapshots",
                "Income and age snapshots present",
                queries.countUnitsMissingIncomeOrAge(),
                total,
                "The scheme engine compares income and age on record when checking eligibility.",
                "806",
                null,
                "Ask for income and age snapshots when entitlements are created or renewed.",
                "units"));
        long active = queries.countActiveUnits();
        LocalDate since = LocalDate.now().minusMonths(12);
        checks.add(check(
                "active-units-no-recent-payment",
                "Active units paid in the last 12 months",
                queries.countActiveUnitsWithoutRecentSettlement(since),
                active,
                "Stale entitlements with no recent settlement may be inactive in reality.",
                "802, 801",
                null,
                "Ask the payment system for settlements through today for every active entitlement.",
                "settlements"));
        return feed("entitlement_unit", "Entitlement units", formatDate(queries.maxUnitPeriodEnd()), checks);
    }

    private Map<String, Object> settlementFeed() {
        long total = queries.countSettlements();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "settlements-missing-bank",
                "Bank reference on every settlement",
                queries.countSettlementsMissingBankToken(),
                total,
                "Shared-bank and bank-change checks need a token on each payment.",
                "804, 805, pre-payment gate",
                null,
                "Ask the payment system for the bank reference on every settlement.",
                "settlements"));
        checks.add(check(
                "settlements-missing-txref",
                "Transaction reference on every settlement",
                queries.countSettlementsMissingTransactionRef(),
                total,
                "Without a reference, the same payment cannot be distinguished from a duplicate load.",
                "802",
                null,
                "Ask the payment system for a unique transaction reference on every settlement.",
                "settlements"));
        return feed("payment_settlement", "Payment settlements", formatDate(queries.maxSettlementPeriodEnd()), checks);
    }

    private Map<String, Object> verificationFeed() {
        long people = queries.countDistinctBeneficiaryPeople();
        long without = queries.countPeopleWithoutVerificationEvent();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(coverageCheck(
                "verification-feed-coverage",
                "People with a death or status event on file",
                without,
                people,
                "Rule 803 needs to know when someone died or left a scheme before paying after that date.",
                "803",
                "This is a coverage figure: ask civil registration and HR for event feeds for these people.",
                null));
        return feed("verification_event", "Verification events", formatDate(queries.maxVerificationEventDate()), checks);
    }

    private Map<String, Object> masterChangeFeed() {
        long bankTotal = queries.countBankTokenChanges();
        long bankChanges = queries.countBankChangesWithoutApproval();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "bank-changes-no-approval",
                "Bank changes with an approval reference",
                bankChanges,
                bankTotal,
                "Concentrated bank changes without approval are a fraud pattern the rules look for.",
                "805",
                null,
                "Ask operators to record an approval reference whenever a bank account is changed.",
                null));
        return feed("master_change_log", "Master changes", formatDateTime(queries.maxMasterChangeAt()), checks);
    }

    private Map<String, Object> employeeFeed() {
        long total = queries.countEmployees();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "employees-no-person-link",
                "Employee linked to beneficiary registry (person_id)",
                queries.countEmployeesMissingPersonLink(),
                total,
                "Rule 807 compares payroll with scheme income only when the employee is linked to a citizen id.",
                "807",
                null,
                "Ask HR to send the family-registry person id on the employee master.",
                "employees"));
        checks.add(check(
                "employees-no-district",
                "District on employee record",
                queries.countEmployeesMissingDistrict(),
                total,
                "Payroll alerts and district filters need a district on every employee.",
                "S01–S06 reporting",
                null,
                "Ask HR for district (and taluka) on every employee row.",
                "employees"));
        return feed("employee_identity", "Employees", formatDate(queries.maxEmployeeStatusSince()), checks);
    }

    private Map<String, Object> serviceEventFeed() {
        long total = queries.countEmployees();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "employees-no-service-event",
                "At least one service event per employee",
                queries.countEmployeesWithoutServiceEvent(),
                total,
                "Transfer and overlap checks need posting and transfer orders on file.",
                "S01",
                null,
                "Ask HR for service events (joining, transfer, retirement) for every employee.",
                "service-events"));
        return feed("service_event", "Service events", formatDate(queries.maxServiceEventDate()), checks);
    }

    private Map<String, Object> payrollFeed() {
        long total = queries.countPayrollRows();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "payroll-missing-txref",
                "Transaction reference on every payroll row",
                queries.countPayrollMissingTransactionRef(),
                total,
                "Duplicate file loads must not double-count the same salary payment.",
                "S01, S02",
                null,
                "Ask the payroll system for a unique transaction reference on every pay row.",
                "payroll"));
        long pensionRows = queries.countPensionPayrollRows();
        checks.add(check(
                "pension-pay-without-auth",
                "PENSION rows with a pension authorisation",
                queries.countPensionPayrollWithoutAuthorisation(),
                pensionRows,
                "Rule S05 compares paid pension with the authorised rate.",
                "S05",
                null,
                "Ask treasury for pension authorisation (PPO) before pension payroll is loaded.",
                "pensions"));
        return feed("payroll_settlement", "Payroll settlements", formatDate(queries.maxPayrollPeriodEnd()), checks);
    }

    private Map<String, Object> pensionFeed() {
        long total = queries.countPensioners();
        List<Map<String, Object>> checks = new ArrayList<>();
        checks.add(check(
                "pensioners-no-life-cert",
                "Pensioners with a life certificate on file",
                queries.countPensionersWithoutLifeCertificate(),
                total,
                "Rule S06 flags pensioners whose life certificate is missing or overdue.",
                "S06",
                null,
                "Ask pensioners or treasury for life-certificate receipt dates.",
                "life-certificates"));
        return feed("pension_authorisation", "Pension authorisations", formatDate(queries.maxPensionEffectiveFrom()), checks);
    }

    private static Map<String, Object> feed(String id, String title, String freshness, List<Map<String, Object>> checks) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("feed", id);
        m.put("title", title);
        m.put("freshness", freshness);
        m.put("checks", checks);
        return m;
    }

    private static Map<String, Object> check(
            String id,
            String label,
            long affected,
            long total,
            String whyItMatters,
            String rulesWeakened,
            String coverageNote,
            String askFor,
            String importName) {
        Map<String, Object> m = baseCheck(id, label, affected, total, whyItMatters, rulesWeakened, coverageNote, askFor, importName);
        m.put("coverage", false);
        return m;
    }

    private static Map<String, Object> coverageCheck(
            String id,
            String label,
            long affected,
            long total,
            String whyItMatters,
            String rulesWeakened,
            String askFor,
            String importName) {
        Map<String, Object> m = baseCheck(id, label, affected, total, whyItMatters, rulesWeakened, "Coverage metric — not a data error.", askFor, importName);
        m.put("coverage", true);
        return m;
    }

    private static Map<String, Object> baseCheck(
            String id,
            String label,
            long affected,
            long total,
            String whyItMatters,
            String rulesWeakened,
            String coverageNote,
            String askFor,
            String importName) {
        double percent = percentComplete(affected, total);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("check", label);
        m.put("affected", affected);
        m.put("total", total);
        m.put("percentComplete", percent);
        m.put("whyItMatters", whyItMatters);
        m.put("rulesWeakened", rulesWeakened);
        if (coverageNote != null) {
            m.put("coverageNote", coverageNote);
        }
        if (percent < 100.0 && askFor != null) {
            m.put("askFor", askFor);
        }
        if (importName != null) {
            m.put("importName", importName);
        }
        return m;
    }

    static double percentComplete(long affected, long total) {
        if (total <= 0) {
            return 100.0;
        }
        long good = Math.max(0, total - affected);
        return Math.round(good * 1000.0 / total) / 10.0;
    }

    private static String formatDate(Optional<LocalDate> d) {
        return d.map(LocalDate::toString).orElse("—");
    }

    private static String formatDateTime(Optional<LocalDateTime> d) {
        return d.map(dt -> dt.toLocalDate().toString()).orElse("—");
    }
}
