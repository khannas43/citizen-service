package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.client.SchemeEngineClient;
import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** One scenario per rule (801-806, S01-S06): what must raise an alert and what the use case says must not. */
class DetectionRulesTest {

    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    MutualExclusionSchemePairRepository mutualRepo = mock(MutualExclusionSchemePairRepository.class);
    SchemeGraceConfigRepository graceRepo = mock(SchemeGraceConfigRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    PayrollSettlementRepository payrollRepo = mock(PayrollSettlementRepository.class);
    PensionAuthorisationRepository pensionRepo = mock(PensionAuthorisationRepository.class);
    ServiceEventRepository serviceEventRepo = mock(ServiceEventRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    SchemeEngineClient client = mock(SchemeEngineClient.class);

    DetectionEngineService engine;
    final List<IntegrityAlert> saved = new ArrayList<>();
    final List<IntegrityAlert> alreadyStored = new ArrayList<>();

    final UUID schemeA = UUID.fromString("a1000001-0000-0000-0000-000000000001");
    final UUID schemeB = UUID.fromString("a1000001-0000-0000-0000-000000000002");
    final LocalDate d2024 = LocalDate.of(2024, 4, 1);

    @BeforeEach
    void setUp() {
        when(alertRepo.save(any())).thenAnswer(inv -> {
            IntegrityAlert a = inv.getArgument(0);
            if (saved.stream().noneMatch(x -> x == a)) saved.add(a);
            return a;
        });
        when(alertRepo.findByRuleCodeAndPersonId(any(), any())).thenAnswer(inv -> {
            List<IntegrityAlert> all = new ArrayList<>(alreadyStored);
            all.addAll(saved);
            return all.stream().filter(a -> inv.getArgument(0).equals(a.getRuleCode())
                    && inv.getArgument(1).equals(a.getPersonId())).toList();
        });
        when(caseRepo.save(any())).thenAnswer(inv -> {
            IntegrityCase c = inv.getArgument(0);
            if (c.getId() == null) c.setId(UUID.randomUUID());
            return c;
        });
        when(client.isEligibleForScheme(any(), any())).thenReturn(true);   // 806 stays quiet unless a test says otherwise
        when(unitRepo.findAll()).thenAnswer(inv -> units);
        when(payrollRepo.findAll()).thenAnswer(inv -> payroll);
        when(payrollRepo.findByEmployeeCode(any())).thenAnswer(inv ->
                payroll.stream().filter(p -> p.getEmployeeCode().equals(inv.getArgument(0))).toList());
        when(pensionRepo.findAll()).thenAnswer(inv -> pensions);
        when(employeeRepo.findAll()).thenAnswer(inv -> employees);
        when(employeeRepo.findByEmployeeCode(any())).thenAnswer(inv ->
                employees.stream().filter(e -> e.getEmployeeCode().equals(inv.getArgument(0))).findFirst());
        when(serviceEventRepo.findAll()).thenAnswer(inv -> serviceEvents);
        when(serviceEventRepo.findByEmployeeCode(any())).thenAnswer(inv ->
                serviceEvents.stream().filter(e -> e.getEmployeeCode().equals(inv.getArgument(0))).toList());
        when(changeLogRepo.findAll()).thenAnswer(inv -> changes);
        when(changeLogRepo.findByPersonId(any())).thenAnswer(inv ->
                changes.stream().filter(c -> inv.getArgument(0).equals(c.getPersonId())).toList());
        when(mutualRepo.findAll()).thenAnswer(inv -> pairs);
        when(eventRepo.findByPersonId(any())).thenAnswer(inv ->
                events.stream().filter(e -> inv.getArgument(0).equals(e.getPersonId())).toList());
        when(paymentRepo.findByUnitId(any())).thenAnswer(inv ->
                payments.stream().filter(p -> inv.getArgument(0).equals(p.getUnitId())).toList());

        PersonDisplayNameService displayNames = mock(PersonDisplayNameService.class);
        when(displayNames.nameForNewAlert(any(), any(), any())).thenAnswer(inv -> inv.getArgument(2));
        engine = new DetectionEngineService(unitRepo, paymentRepo, eventRepo, changeLogRepo, mutualRepo, graceRepo,
                employeeRepo, payrollRepo, pensionRepo, serviceEventRepo, alertRepo, caseRepo, client, displayNames);
        ReflectionTestUtils.setField(engine, "defaultGraceDays", 30);
        ReflectionTestUtils.setField(engine, "bankClusterMin", 4);
        ReflectionTestUtils.setField(engine, "operatorChangeThreshold", 5);
        ReflectionTestUtils.setField(engine, "batchApprovalPrefix", "BATCH-");
        ReflectionTestUtils.setField(engine, "bankChangeWindowDays", 90);
        ReflectionTestUtils.setField(engine, "lifeCertificateMaxAgeDays", 365);
    }

    // ---- fixtures -------------------------------------------------------------------------------------------

    final List<EntitlementUnit> units = new ArrayList<>();
    final List<PaymentSettlement> payments = new ArrayList<>();
    final List<VerificationEvent> events = new ArrayList<>();
    final List<MasterChangeLog> changes = new ArrayList<>();
    final List<MutualExclusionSchemePair> pairs = new ArrayList<>();
    final List<EmployeeIdentity> employees = new ArrayList<>();
    final List<PayrollSettlement> payroll = new ArrayList<>();
    final List<PensionAuthorisation> pensions = new ArrayList<>();
    final List<ServiceEvent> serviceEvents = new ArrayList<>();

    EntitlementUnit unit(String person, UUID scheme, LocalDate start, LocalDate end, String authorised) {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(UUID.randomUUID());
        u.setPersonId(person);
        u.setPersonName("Person " + person);
        u.setFamilyId("fam-" + person);
        u.setSchemeId(scheme);
        u.setSchemeName("Scheme " + scheme.toString().substring(34));
        u.setDistrict("Banaskantha");
        u.setPeriodStart(start);
        u.setPeriodEnd(end);
        u.setAuthorizedAmount(new BigDecimal(authorised));
        u.setStatus("ACTIVE");
        units.add(u);
        return u;
    }

    PaymentSettlement pay(EntitlementUnit u, String amount, LocalDate end, String bank) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(u.getId());
        p.setAmount(new BigDecimal(amount));
        p.setStatus("SETTLED");
        p.setPeriodStart(d2024);
        p.setPeriodEnd(end);
        p.setBankToken(bank);
        payments.add(p);
        return p;
    }

    PaymentSettlement reversal(PaymentSettlement of) {
        PaymentSettlement r = new PaymentSettlement();
        r.setId(UUID.randomUUID());
        r.setUnitId(of.getUnitId());
        r.setAmount(of.getAmount().negate());
        r.setStatus("SETTLED");
        r.setPeriodStart(of.getPeriodStart());
        r.setPeriodEnd(of.getPeriodEnd());
        r.setReversalOf(of.getId());
        payments.add(r);
        return r;
    }

    EmployeeIdentity employee(String code, String status) {
        EmployeeIdentity e = new EmployeeIdentity();
        e.setId(UUID.randomUUID());
        e.setEmployeeCode(code);
        e.setPersonName("Employee " + code);
        e.setStatus(status);
        e.setDdoCode("DDO-A");
        employees.add(e);
        return e;
    }

    PayrollSettlement pay(String emp, String component, String ddo, LocalDate start, LocalDate end, String net) {
        PayrollSettlement p = new PayrollSettlement();
        p.setId(UUID.randomUUID());
        p.setEmployeeCode(emp);
        p.setComponent(component);
        p.setDdoCode(ddo);
        p.setPeriodStart(start);
        p.setPeriodEnd(end);
        p.setGrossAmount(new BigDecimal(net));
        p.setNetAmount(new BigDecimal(net));
        payroll.add(p);
        return p;
    }

    ServiceEvent serviceEvent(String emp, String type, LocalDate effective) {
        ServiceEvent s = new ServiceEvent();
        s.setId(UUID.randomUUID());
        s.setEmployeeCode(emp);
        s.setEventType(type);
        s.setEffectiveDate(effective);
        serviceEvents.add(s);
        return s;
    }

    MasterChangeLog bankChange(String operator, String person, String field, LocalDateTime when) {
        MasterChangeLog c = new MasterChangeLog();
        c.setId(UUID.randomUUID());
        c.setOperatorId(operator);
        c.setPersonId(person);
        c.setFieldName(field);
        c.setChangedAt(when);
        changes.add(c);
        return c;
    }

    DetectionEngineService.DetectionRunResult run() {
        int before = saved.size();
        var result = engine.runDetection(new DetectionEngineService.DetectionRunRequest(null, null, null, null, null, null, null));
        assertEquals(saved.size() - before, result.alertsCreated(), "reported alert count must equal alerts actually raised");
        return result;
    }

    List<IntegrityAlert> alerts(String rule) {
        return saved.stream().filter(a -> rule.equals(a.getRuleCode())).toList();
    }

    // ---- UC1 -----------------------------------------------------------------------------------------------

    @Test
    void r801_flagsTheSamePersonEnrolledTwiceInOneSchemeButNotAcrossSchemesOrPeople() {
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");      // same person, same scheme: duplicate
        unit("p2", schemeA, d2024, d2024.plusMonths(12), "1000");
        unit("p3", schemeA, d2024, d2024.plusMonths(12), "1000");
        unit("p3", schemeB, d2024, d2024.plusMonths(12), "1000");      // same person, different schemes: fine
        run();
        assertEquals(1, alerts("801").size());
        assertEquals("p1", alerts("801").get(0).getPersonId());
    }

    @Test
    void r801_ignoresInactiveEnrollments() {
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000").setStatus("CLOSED");
        run();
        assertTrue(alerts("801").isEmpty());
    }

    @Test
    void r802_flagsSettlementsAboveTheAuthorisedAmount_theUseCaseExample() {
        EntitlementUnit u = unit("meera", schemeA, d2024, d2024.plusMonths(12), "10000");
        pay(u, "10000", d2024.plusMonths(12), "bank-1");
        pay(u, "10000", d2024.plusMonths(12), "bank-1");
        run();
        List<IntegrityAlert> a = alerts("802");
        assertEquals(1, a.size());
        assertEquals(0, new BigDecimal("10000").compareTo(a.get(0).getAmountDelta()));
        assertEquals("OVER_SETTLEMENT", a.get(0).getEvidence().get("variant"));
    }

    @Test
    void r802_doesNotCountAPaymentThatWasReversed() {
        EntitlementUnit u = unit("meera", schemeA, d2024, d2024.plusMonths(12), "10000");
        pay(u, "10000", d2024.plusMonths(12), "bank-1");
        reversal(pay(u, "10000", d2024.plusMonths(12), "bank-1"));    // the duplicate was reversed
        run();
        assertTrue(alerts("802").isEmpty(), "net of the reversal the unit was paid exactly what it was owed");
    }

    @Test
    void r802_ignoresPaymentsThatNeverSettled() {
        EntitlementUnit u = unit("meera", schemeA, d2024, d2024.plusMonths(12), "10000");
        pay(u, "10000", d2024.plusMonths(12), "bank-1");
        pay(u, "10000", d2024.plusMonths(12), "bank-1").setStatus("REJECTED");
        run();
        assertTrue(alerts("802").isEmpty());
    }

    @Test
    void r802_flagsAPersonHoldingTwoMutuallyExclusiveSchemesInTheSamePeriod() {
        MutualExclusionSchemePair pair = new MutualExclusionSchemePair();
        pair.setSchemeIdA(schemeA);
        pair.setSchemeIdB(schemeB);
        pairs.add(pair);
        EntitlementUnit first = unit("p1", schemeA, LocalDate.of(2024, 4, 1), LocalDate.of(2025, 3, 31), "5000");
        EntitlementUnit second = unit("p1", schemeB, LocalDate.of(2024, 9, 1), LocalDate.of(2025, 8, 31), "5000");
        pay(second, "5000", LocalDate.of(2025, 3, 31), "bank-1");
        run();
        List<IntegrityAlert> a = alerts("802");
        assertEquals(1, a.size());
        assertEquals("MUTUAL_EXCLUSION", a.get(0).getEvidence().get("variant"));
        assertEquals(second.getSchemeId(), a.get(0).getSchemeId(), "the alert sits on the later entitlement");
        assertEquals(first.getId(), a.get(0).getEvidence().get("conflictingUnitId"));
        assertEquals(0, new BigDecimal("5000").compareTo(a.get(0).getAmountDelta()));
        assertEquals("2024-09-01", a.get(0).getEvidence().get("overlapStart"), "dates are stored as ISO text");
        assertEquals("2025-03-31", a.get(0).getEvidence().get("overlapEnd"));
    }

    @Test
    void r802_mutualExclusionNeedsOverlappingPeriodsAndAMarkedPair() {
        MutualExclusionSchemePair pair = new MutualExclusionSchemePair();
        pair.setSchemeIdA(schemeA);
        pair.setSchemeIdB(schemeB);
        pairs.add(pair);
        unit("p1", schemeA, LocalDate.of(2023, 4, 1), LocalDate.of(2024, 3, 31), "5000");
        unit("p1", schemeB, LocalDate.of(2024, 4, 1), LocalDate.of(2025, 3, 31), "5000");   // back to back, no overlap
        UUID schemeC = UUID.fromString("a1000001-0000-0000-0000-000000000003");
        unit("p2", schemeA, d2024, d2024.plusMonths(12), "5000");
        unit("p2", schemeC, d2024, d2024.plusMonths(12), "5000");                           // overlap, but not a marked pair
        run();
        assertTrue(alerts("802").isEmpty());
    }

    @Test
    void r802_doesNotRaiseTheSameAlertTwice() {
        MutualExclusionSchemePair pair = new MutualExclusionSchemePair();
        pair.setSchemeIdA(schemeA);
        pair.setSchemeIdB(schemeB);
        pairs.add(pair);
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "5000");
        unit("p1", schemeB, d2024.plusMonths(1), d2024.plusMonths(13), "5000");
        EntitlementUnit u = unit("p9", schemeA, d2024, d2024.plusMonths(12), "1000");
        pay(u, "2000", d2024.plusMonths(12), "b");
        run();
        int first = saved.size();
        run();   // second run: the alerts are already stored
        assertEquals(first, saved.size());
    }

    @Test
    void r803_flagsPaymentForAPeriodAfterDeathPlusGrace_andRespectsSchemeGrace() {
        EntitlementUnit u = unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");
        pay(u, "1000", LocalDate.of(2024, 7, 31), "b1");            // covers a period well after the event
        VerificationEvent death = new VerificationEvent();
        death.setPersonId("p1");
        death.setEventType("DEATH");
        death.setEventDate(LocalDate.of(2024, 5, 1));
        events.add(death);
        run();
        assertEquals(1, alerts("803").size());

        // a longer scheme-specific grace period (120 days) pushes the cutoff past the payment period
        saved.clear();
        SchemeGraceConfig grace = new SchemeGraceConfig();
        grace.setSchemeId(schemeA);
        grace.setGraceDaysAfterTermination(120);
        when(graceRepo.findBySchemeId(schemeA)).thenReturn(Optional.of(grace));
        run();
        assertTrue(alerts("803").isEmpty());
    }

    @Test
    void r803_raisesOneAlertWhenSeveralPaymentsViolateGrace() {
        EntitlementUnit u = unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");
        pay(u, "1000", LocalDate.of(2024, 7, 31), "b1");
        pay(u, "1000", LocalDate.of(2024, 8, 31), "b2");
        pay(u, "1000", LocalDate.of(2024, 9, 30), "b3");
        VerificationEvent death = new VerificationEvent();
        death.setPersonId("p1");
        death.setEventType("DEATH");
        death.setEventDate(LocalDate.of(2024, 6, 1));
        events.add(death);
        run();
        assertEquals(1, alerts("803").size());
        assertEquals(3, ((List<?>) alerts("803").get(0).getEvidence().get("paymentIds")).size());
    }

    @Test
    void r803_ignoresAReversedPaymentAndNonTerminatingEvents() {
        EntitlementUnit u = unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000");
        reversal(pay(u, "1000", LocalDate.of(2024, 12, 31), "b1"));
        VerificationEvent death = new VerificationEvent();
        death.setPersonId("p1");
        death.setEventType("DEATH");
        death.setEventDate(LocalDate.of(2024, 5, 1));
        events.add(death);
        EntitlementUnit v = unit("p2", schemeA, d2024, d2024.plusMonths(12), "1000");
        pay(v, "1000", LocalDate.of(2024, 12, 31), "b2");
        VerificationEvent other = new VerificationEvent();
        other.setPersonId("p2");
        other.setEventType("ADDRESS_CHANGE");
        other.setEventDate(LocalDate.of(2024, 5, 1));
        events.add(other);
        run();
        assertTrue(alerts("803").isEmpty());
    }

    @Test
    void r804_flagsOneBankAccountReceivingForManyUnrelatedPeople() {
        for (int i = 1; i <= 4; i++) pay(unit("person" + i, schemeA, d2024, d2024.plusMonths(12), "1000"), "1000", d2024.plusMonths(3), "shared-bank");
        run();
        assertEquals(1, alerts("804").size());
        assertEquals(4, alerts("804").get(0).getEvidence().get("distinctPeople"));
    }

    @Test
    void r804_aSinglePersonWithSeveralSchemesIsNotACluster() {
        for (UUID s : List.of(schemeA, schemeB, UUID.randomUUID(), UUID.randomUUID()))
            pay(unit("p1", s, d2024, d2024.plusMonths(12), "1000"), "1000", d2024.plusMonths(3), "own-bank");
        run();
        assertTrue(alerts("804").isEmpty());
    }

    @Test
    void r804_membersOfOneFamilyCountAsOneDestinationHolder() {
        for (int i = 1; i <= 4; i++) {
            EntitlementUnit u = unit("member" + i, schemeA, d2024, d2024.plusMonths(12), "1000");
            u.setFamilyId("same-family");
            pay(u, "1000", d2024.plusMonths(3), "family-bank");
        }
        run();
        assertTrue(alerts("804").isEmpty());
    }

    @Test
    void r804_belowTheThresholdIsQuiet() {
        for (int i = 1; i <= 3; i++) pay(unit("person" + i, schemeA, d2024, d2024.plusMonths(12), "1000"), "1000", d2024.plusMonths(3), "shared-bank");
        run();
        assertTrue(alerts("804").isEmpty());
    }

    @Test
    void r805_flagsAnOperatorWithAnUnusualNumberOfBankChanges() {
        for (int i = 0; i < 5; i++) bankChange("OP-1", "p" + i, "bank_token", LocalDateTime.now().minusDays(3));
        for (int i = 0; i < 4; i++) bankChange("OP-2", "q" + i, "bank_token", LocalDateTime.now().minusDays(3));   // under threshold
        run();
        assertEquals(1, alerts("805").size());
        assertEquals("OP-1", alerts("805").get(0).getPersonId());
    }

    private void bankChanges(String operator, int count, String approvalRef) {
        for (int i = 0; i < count; i++) {
            bankChange(operator, operator + "-p" + i + "-" + (approvalRef == null ? "n" : approvalRef), "bank_token", LocalDateTime.now().minusDays(3))
                    .setApprovalRef(approvalRef);
        }
    }

    @Test
    void r805_leavesOutApprovedBatchMigrations() {
        bankChanges("OP-MIGRATION", 12, "BATCH-MIG-2024");      // a planned, approved migration: not a concentration to investigate
        run();
        assertTrue(alerts("805").isEmpty());
    }

    @Test
    void r805_countsOnlyTheChangesOutsideTheBatch_andSaysHowManyWereLeftOut() {
        bankChanges("OP-MIXED", 3, null);
        bankChanges("OP-MIXED", 10, "BATCH-MIG-2024");
        run();
        assertTrue(alerts("805").isEmpty(), "3 unapproved changes are under the threshold of 5, whatever the batch adds");

        saved.clear();
        bankChanges("OP-MIXED", 3, null);                       // now 6 unapproved
        run();
        IntegrityAlert a = alerts("805").get(0);
        assertEquals(6L, a.getEvidence().get("bankChanges30d"));
        assertEquals(10L, a.getEvidence().get("approvedBatchChangesLeftOut"));
    }

    @Test
    void r805_anIndividualApprovalReferenceDoesNotExcuseAChange() {
        bankChanges("OP-1", 5, "APP-77");                       // approved one by one: still to be verified, so it still counts
        run();
        assertEquals(1, alerts("805").size());
        assertEquals(5L, alerts("805").get(0).getEvidence().get("bankChanges30d"));
    }

    @Test
    void r805_theBatchPrefixIsNotCaseSensitive() {
        bankChanges("OP-MIGRATION", 6, "batch-2025-07");
        run();
        assertTrue(alerts("805").isEmpty());
    }

    @Test
    void r805_countsOnlyRecentBankChanges_andSurvivesAMissingOperator() {
        for (int i = 0; i < 5; i++) bankChange("OP-1", "p" + i, "bank_token", LocalDateTime.now().minusDays(90));   // too old
        for (int i = 0; i < 5; i++) bankChange("OP-3", "r" + i, "address", LocalDateTime.now().minusDays(2));       // not a bank change
        for (int i = 0; i < 6; i++) bankChange(null, "s" + i, "bank_token", LocalDateTime.now().minusDays(2));     // no operator recorded
        assertDoesNotThrow(this::run);
        assertTrue(alerts("805").isEmpty());
    }

    @Test
    void r806_flagsAnEntitlementWhoseIncomeOrAgeOnRecordFailsTheSchemeRules() {
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "1000").setIncomeSnapshot(900000L);
        unit("p2", schemeA, d2024, d2024.plusMonths(12), "1000").setIncomeSnapshot(20000L);
        // the stub answers by the income in the request: p1 fails the income test, p2 passes
        when(client.failedIncomeOrAgeTests(any(), any(), anyInt(), anyLong())).thenAnswer(inv ->
                (long) inv.getArgument(3) > 100000L ? List.of("Income 9.00L > 6.00L (ceiling)") : List.of());
        run();
        assertEquals(1, alerts("806").size());
        assertEquals("p1", alerts("806").get(0).getPersonId());
        assertEquals(List.of("Income 9.00L > 6.00L (ceiling)"), alerts("806").get(0).getEvidence().get("failedTests"));
    }

    /** A year of monthly pay for an employee linked to a beneficiary, so rule 807 has an income to test. */
    EmployeeIdentity linkedEmployee(String code, String personId, String monthlyGross) {
        EmployeeIdentity e = employee(code, "ACTIVE");
        e.setPersonId(personId);
        e.setPostTitle("Clerk");
        for (int m = 1; m <= 12; m++) {
            pay(code, "BASIC", "DDO-A", LocalDate.of(2024, m, 1), LocalDate.of(2024, m, 1).plusMonths(1).minusDays(1), monthlyGross);
        }
        return e;
    }

    private void tooRichForTheScheme() {
        when(client.incomeBreachesScheme(any(), any(), anyInt(), anyLong())).thenAnswer(inv -> (long) inv.getArgument(3) > 300000L);
    }

    @Test
    void r807_flagsASalariedBeneficiaryWhosePayBreachesTheIncomeLimit_withoutShowingTheSalary() {
        EntitlementUnit u = unit("p1", schemeA, d2024, d2024.plusMonths(12), "10000");
        u.setIncomeSnapshot(50000L);
        payments.add(settlement(u, "10000", d2024, d2024.plusMonths(3)));
        linkedEmployee("E1", "p1", "50000");                          // 6,00,000 a year
        unit("p2", schemeA, d2024, d2024.plusMonths(12), "10000");
        linkedEmployee("E2", "p2", "10000");                          // 1,20,000 a year: within the limit
        tooRichForTheScheme();
        run();
        assertEquals(1, alerts("807").size());
        IntegrityAlert a = alerts("807").get(0);
        assertEquals("p1", a.getPersonId());
        assertEquals("HIGH", a.getSeverity());
        assertEquals(0, new BigDecimal("10000").compareTo(a.getAmountDelta()));
        assertEquals("6-7 lakh a year", a.getEvidence().get("annualPayBand"));
        assertFalse(a.getEvidence().toString().contains("600000"));
        assertFalse(a.getEvidence().toString().contains("50000.00"));
    }

    @Test
    void r807_leavesWhatRule806AlreadyFlaggedAndUnlinkedEmployeesAlone() {
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "10000").setIncomeSnapshot(900000L);
        linkedEmployee("E1", "p1", "50000");
        unit("p2", schemeA, d2024, d2024.plusMonths(12), "10000");
        EmployeeIdentity unlinked = employee("E2", "ACTIVE");          // no person id: nothing to compare
        pay(unlinked.getEmployeeCode(), "BASIC", "DDO-A", LocalDate.of(2024, 1, 1), LocalDate.of(2024, 12, 31), "900000");
        alreadyStored.add(alert806For("p1"));
        tooRichForTheScheme();
        run();
        assertTrue(alerts("807").isEmpty());
    }

    @Test
    void r807_scalesAPartYearOfPayUpToAYear() {
        unit("p1", schemeA, d2024, d2024.plusMonths(12), "10000");
        EmployeeIdentity e = employee("E1", "ACTIVE");
        e.setPersonId("p1");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 1, 1), LocalDate.of(2024, 3, 31), "150000");   // 3 months: about 6 lakh a year
        tooRichForTheScheme();
        run();
        assertEquals(1, alerts("807").size());
    }

    IntegrityAlert alert806For(String person) {
        IntegrityAlert a = new IntegrityAlert();
        a.setRuleCode("806");
        a.setPersonId(person);
        a.setSchemeId(schemeA);
        return a;
    }

    PaymentSettlement settlement(EntitlementUnit u, String amount, LocalDate start, LocalDate end) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(u.getId());
        p.setAmount(new BigDecimal(amount));
        p.setPeriodStart(start);
        p.setPeriodEnd(end);
        p.setStatus("SETTLED");
        return p;
    }

    // ---- UC4 -----------------------------------------------------------------------------------------------

    @Test
    void s01_flagsTwoDdosPayingTheSameMonthOfBasic_theUseCaseExample() {
        employee("E1", "ACTIVE");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        pay("E1", "BASIC", "DDO-B", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        run();
        assertEquals(1, alerts("S01").size());
        assertEquals("E1", alerts("S01").get(0).getPersonId());
    }

    @Test
    void s01_aFullMonthPaidTwiceIsOneMonthOfExcess_withTheEvidenceToCheckIt() {
        EmployeeIdentity e = employee("E1", "ACTIVE");
        e.setPostTitle("Clerk");
        e.setPayLevel("L5");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 7, 1), LocalDate.of(2024, 7, 31), "42000");
        pay("E1", "BASIC", "DDO-B", LocalDate.of(2024, 7, 1), LocalDate.of(2024, 7, 31), "42000");
        run();
        IntegrityAlert a = alerts("S01").get(0);
        Map<String, Object> ev = a.getEvidence();
        assertEquals(31L, ev.get("overlapDays"));
        assertEquals("2024-07-01", ev.get("overlapStart"));
        assertEquals("2024-07-31", ev.get("overlapEnd"));
        assertEquals("2024-07-01 to 2024-07-31", ev.get("periodA"));
        assertEquals("DDO-A", ev.get("ddoA"));
        assertEquals("DDO-B", ev.get("ddoB"));
        assertEquals(0, new BigDecimal("42000").compareTo((BigDecimal) ev.get("possibleExcess")));
        assertEquals(0, new BigDecimal("42000").compareTo(a.getAmountDelta()));
        assertEquals("Clerk", ev.get("post"), "every payroll alert says who the employee is");
        assertEquals("L5", ev.get("payLevel"));
        assertEquals("E1", ev.get("employeeCode"));
    }

    @Test
    void s01_aPartOverlapIsOnlyTheOverlappingDays_atTheLowerDailyRate() {
        employee("E1", "ACTIVE");
        // DDO-A paid 1-30 June (60,000 = 2,000 a day); DDO-B paid 16 June - 15 July (30,000 = 1,000 a day)
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "60000");
        pay("E1", "BASIC", "DDO-B", LocalDate.of(2024, 6, 16), LocalDate.of(2024, 7, 15), "30000");
        run();
        Map<String, Object> ev = alerts("S01").get(0).getEvidence();
        assertEquals(15L, ev.get("overlapDays"));
        assertEquals("2024-06-16", ev.get("overlapStart"));
        assertEquals("2024-06-30", ev.get("overlapEnd"));
        assertEquals(0, new BigDecimal("15000.00").compareTo((BigDecimal) ev.get("possibleExcess")), "15 days x 1,000");
        assertEquals(0, new BigDecimal("15000.00").compareTo(alerts("S01").get(0).getAmountDelta()));
    }

    @Test
    void s01_isQuietForTheSameDdo_nonOverlappingMonths_andReversedPayments() {
        employee("E1", "ACTIVE");
        employee("E2", "ACTIVE");
        employee("E3", "ACTIVE");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");     // same DDO
        pay("E2", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        pay("E2", "BASIC", "DDO-B", LocalDate.of(2024, 7, 1), LocalDate.of(2024, 7, 31), "50000");     // different months
        pay("E3", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        PayrollSettlement dup = pay("E3", "BASIC", "DDO-B", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "50000");
        PayrollSettlement rev = pay("E3", "BASIC", "DDO-B", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "-50000");
        rev.setReversalOf(dup.getId());                                                                 // the duplicate was reversed
        run();
        assertTrue(alerts("S01").isEmpty());
    }

    @Test
    void s02_flagsPayForAPeriodAfterRetirement() {
        employee("E1", "RETIRED");
        serviceEvent("E1", "RETIREMENT", LocalDate.of(2024, 3, 31));
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 5, 1), LocalDate.of(2024, 5, 31), "40000");
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 2, 1), LocalDate.of(2024, 2, 29), "40000");     // before: fine
        run();
        assertEquals(1, alerts("S02").size());
    }

    @Test
    void s02_aPensionPaidAfterRetirementIsNormal_aSalaryPaidAfterRetirementIsNot() {
        employee("E1", "RETIRED");
        serviceEvent("E1", "RETIREMENT", LocalDate.of(2024, 3, 31));
        pay("E1", "PENSION", "DDO-P", LocalDate.of(2024, 8, 1), LocalDate.of(2024, 8, 31), "32000");     // what a retired person is paid
        pay("E1", "DA", "DDO-A", LocalDate.of(2024, 8, 1), LocalDate.of(2024, 8, 31), "5000");           // an active-pay allowance: not owed
        run();
        List<IntegrityAlert> s02 = alerts("S02");
        assertEquals(1, s02.size());
        assertEquals("DA", s02.get(0).getEvidence().get("component"));
    }

    @Test
    void s02_aPensionPaidAfterADeathIsTheRealAlarm() {
        employee("E1", "DECEASED");
        serviceEvent("E1", "DEATH", LocalDate.of(2024, 3, 31));
        pay("E1", "PENSION", "DDO-P", LocalDate.of(2024, 8, 1), LocalDate.of(2024, 8, 31), "32000");
        pay("E1", "PENSION", "DDO-P", LocalDate.of(2024, 2, 1), LocalDate.of(2024, 2, 29), "32000");     // before the death: fine
        run();
        assertEquals(1, alerts("S02").size());
        assertEquals("PENSION", alerts("S02").get(0).getEvidence().get("component"));
    }

    @Test
    void s02_aSuspendedEmployeesSalaryAfterTheSuspensionIsFlagged_butItsPensionComponentIsNotWhatItIsAbout() {
        employee("E1", "SUSPENDED");
        serviceEvent("E1", "SUSPENSION", LocalDate.of(2024, 5, 1));
        pay("E1", "BASIC", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "40000");
        run();
        assertEquals(1, alerts("S02").size());
    }

    @Test
    void s03_flagsAnAllowanceThatContinuesAfterTheQualifyingConditionEnded_andCountsHonestly() {
        employee("E1", "TRANSFERRED");
        employee("E2", "ACTIVE");
        pay("E1", "HRA", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "8000");
        pay("E2", "HRA", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "8000");
        run();   // run() also checks reported count == alerts raised
        assertEquals(1, alerts("S03").size());
        assertEquals("E1", alerts("S03").get(0).getPersonId());
    }

    @Test
    void s04_flagsArrearsPaidTwiceForTheSamePeriod() {
        employee("E1", "ACTIVE");
        employee("E2", "ACTIVE");
        pay("E1", "ARREARS", "DDO-A", LocalDate.of(2023, 4, 1), LocalDate.of(2023, 9, 30), "12000");
        pay("E1", "ARREARS", "DDO-A", LocalDate.of(2023, 4, 1), LocalDate.of(2023, 9, 30), "12000");
        pay("E2", "ARREARS", "DDO-A", LocalDate.of(2023, 4, 1), LocalDate.of(2023, 9, 30), "12000");
        run();
        assertEquals(1, alerts("S04").size());
        assertEquals("E1", alerts("S04").get(0).getPersonId());
    }

    @Test
    void s05_flagsAPensionSettledAwayFromTheAuthorisedRate_withATolerance() {
        employee("E1", "RETIRED");
        employee("E2", "RETIRED");
        PensionAuthorisation a1 = new PensionAuthorisation();
        a1.setId(UUID.randomUUID());
        a1.setEmployeeCode("E1");
        a1.setPpoId("PPO-1");
        a1.setMonthlyRate(new BigDecimal("28000"));
        PensionAuthorisation a2 = new PensionAuthorisation();
        a2.setId(UUID.randomUUID());
        a2.setEmployeeCode("E2");
        a2.setPpoId("PPO-2");
        a2.setMonthlyRate(new BigDecimal("28000"));
        pensions.addAll(List.of(a1, a2));
        pay("E1", "PENSION", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "32000");   // 4000 over
        pay("E2", "PENSION", "DDO-A", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30), "28050");   // within tolerance
        run();
        assertEquals(1, alerts("S05").size());
        assertEquals("E1", alerts("S05").get(0).getPersonId());
        assertEquals(0, new BigDecimal("4000").compareTo(alerts("S05").get(0).getAmountDelta()));
    }

    PensionAuthorisation pensioner(String code) {
        PensionAuthorisation a = new PensionAuthorisation();
        a.setId(UUID.randomUUID());
        a.setEmployeeCode(code);
        a.setPpoId("PPO-" + code);
        a.setMonthlyRate(new BigDecimal("28000"));
        pensions.add(a);
        return a;
    }

    @Test
    void s06_flagsAnActiveEmployeeWithNoServiceOrder_butNotOneWhoseRecordsAreInPlace() {
        employee("E1", "ACTIVE");                       // no service order on file
        employee("E2", "ACTIVE");                       // order on file: nothing to ask for (an active employee owes no life certificate)
        serviceEvent("E2", "POSTING", LocalDate.of(2023, 1, 1));
        employee("E3", "RETIRED");                      // retired and not on a pension: out of scope
        run();
        assertEquals(1, alerts("S06").size());
        IntegrityAlert a = alerts("S06").get(0);
        assertEquals("E1", a.getPersonId());
        assertEquals(List.of("MISSING_SERVICE_ORDER"), a.getEvidence().get("reasons"));
        assertEquals("LOW", a.getSeverity());
        assertEquals(false, a.getEvidence().get("serviceOrderOnFile"));
    }

    @Test
    void s06_asksAPensionerForALifeCertificateOnlyWhenItIsMissingOrOlderThanAYear() {
        for (String code : List.of("P-NONE", "P-OLD", "P-FRESH")) {
            employee(code, "RETIRED");
            pensioner(code);
        }
        bankChange("OP", "P-OLD", "life_certificate", LocalDateTime.now().minusDays(400));
        bankChange("OP", "P-FRESH", "life_certificate", LocalDateTime.now().minusDays(30));
        run();
        assertEquals(2, alerts("S06").size());
        IntegrityAlert none = alerts("S06").stream().filter(a -> a.getPersonId().equals("P-NONE")).findFirst().orElseThrow();
        IntegrityAlert old = alerts("S06").stream().filter(a -> a.getPersonId().equals("P-OLD")).findFirst().orElseThrow();
        assertEquals(List.of("LIFE_CERTIFICATE_OVERDUE"), none.getEvidence().get("reasons"));
        assertEquals("none on record", none.getEvidence().get("lastLifeCertificate"));
        assertEquals(LocalDate.now().minusDays(400).toString(), old.getEvidence().get("lastLifeCertificate"));
        assertFalse(none.getEvidence().containsKey("serviceOrderOnFile"), "a pensioner has no service order to ask for");
        assertTrue(alerts("S06").stream().noneMatch(a -> a.getPersonId().equals("P-FRESH")));
    }

    @Test
    void s06_flagsARecentBankChangeWithNoApproval_andIgnoresApprovedOrOldOnes() {
        for (String code : List.of("E1", "E2", "E3")) {
            employee(code, "ACTIVE");
            serviceEvent(code, "POSTING", LocalDate.of(2023, 1, 1));       // service orders in place: only the bank changes differ
        }
        bankChange("OP", "E1", "bank_token", LocalDateTime.now().minusDays(10));                      // recent, no approval
        bankChange("OP", "E2", "bank_token", LocalDateTime.now().minusDays(10)).setApprovalRef("APP-77");   // approved
        bankChange("OP", "E3", "bank_token", LocalDateTime.now().minusDays(200));                     // old
        run();
        assertEquals(1, alerts("S06").size());
        IntegrityAlert a = alerts("S06").get(0);
        assertEquals("E1", a.getPersonId());
        assertEquals(List.of("UNEXPLAINED_BANK_CHANGE"), a.getEvidence().get("reasons"));
        assertEquals(1L, a.getEvidence().get("unexplainedBankChanges"));
        assertEquals("MEDIUM", a.getSeverity(), "an unexplained bank change on live pay is more serious than a missing document");
    }

    @Test
    void s06_putsEveryGapOnOneAlert_andRaisesItOnlyOnce() {
        employee("P1", "RETIRED");
        pensioner("P1");
        bankChange("OP", "P1", "bank_token", LocalDateTime.now().minusDays(5));
        run();
        List<String> reasons = (List<String>) alerts("S06").get(0).getEvidence().get("reasons");
        assertEquals(List.of("UNEXPLAINED_BANK_CHANGE", "LIFE_CERTIFICATE_OVERDUE"), reasons);
        run();
        assertEquals(1, alerts("S06").size(), "a second run does not repeat the request");
    }
}
