package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.IntegrityAction;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.repository.IntegrityActionRepository;
import org.citizen.expenditure.repository.IntegrityAlertRepository;
import org.citizen.expenditure.repository.IntegrityCaseRepository;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The figures on the summary cards: what each one counts, and what it leaves out. */
class AcceptanceMetricsServiceTest {

    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityActionRepository actionRepo = mock(IntegrityActionRepository.class);
    AcceptanceMetricsService service = new AcceptanceMetricsService(caseRepo, alertRepo, actionRepo);

    final List<IntegrityCase> cases = new ArrayList<>();
    final List<IntegrityAlert> alerts = new ArrayList<>();
    final List<IntegrityAction> actions = new ArrayList<>();

    @BeforeEach
    void setUp() {
        cases.clear();
        alerts.clear();
        actions.clear();
        when(caseRepo.findAll()).thenReturn(cases);
        when(alertRepo.findAll()).thenReturn(alerts);
        when(actionRepo.findAll()).thenReturn(actions);
    }

    IntegrityCase theCase(CaseClassification classification) {
        IntegrityCase c = new IntegrityCase();
        c.setId(UUID.randomUUID());
        c.setClassification(classification);
        cases.add(c);
        return c;
    }

    IntegrityAlert alertFor(IntegrityCase c, String status, String delta) {
        return alertFor(c, status, delta, IntegrityDomain.BENEFICIARY);
    }

    IntegrityAlert alertFor(IntegrityCase c, String status, String delta, IntegrityDomain domain) {
        IntegrityAlert a = new IntegrityAlert();
        a.setId(UUID.randomUUID());
        a.setCaseId(c == null ? null : c.getId());
        a.setStatus(status);
        a.setAmountDelta(delta == null ? null : new BigDecimal(delta));
        a.setDomain(domain);
        alerts.add(a);
        return a;
    }

    void action(ActionType type) {
        IntegrityAction a = new IntegrityAction();
        a.setActionType(type);
        actions.add(a);
    }

    @Test
    void anEmptySystemReportsZeroEverywhere() {
        Map<String, Object> m = service.metrics();
        assertEquals(0, ((BigDecimal) m.get("verifiedOverpaymentAmount")).signum());
        for (String key : List.of("recoveryActionsRecorded", "masterCorrectionsRecorded", "overturnedOrDismissed", "openAlerts", "resolvedAlerts", "totalCases")) {
            assertEquals(0L, ((Number) m.get(key)).longValue(), key);
        }
    }

    @Test
    void verifiedOverpaymentIsTheAmountOnConfirmedCasesOnly() {
        alertFor(theCase(CaseClassification.CONFIRMED_OVERPAYMENT), "RESOLVED", "10000");
        alertFor(theCase(CaseClassification.CONFIRMED_OVERPAYMENT), "OPEN", "3500.50");
        alertFor(theCase(CaseClassification.SUSPECTED_OVERPAYMENT), "OPEN", "99999");     // only suspected: not verified
        alertFor(theCase(CaseClassification.DATA_ERROR), "RESOLVED", "5000");
        alertFor(theCase(null), "OPEN", "7000");                                          // not decided yet
        alertFor(null, "OPEN", "8000");                                                   // an alert with no case
        assertEquals(0, new BigDecimal("13500.50").compareTo((BigDecimal) service.metrics().get("verifiedOverpaymentAmount")));
    }

    @Test
    void aConfirmedCaseWithNoAmountAddsNothing_andDoesNotBreakTheTotal() {
        alertFor(theCase(CaseClassification.CONFIRMED_OVERPAYMENT), "OPEN", null);
        alertFor(theCase(CaseClassification.CONFIRMED_OVERPAYMENT), "OPEN", "250");
        assertEquals(0, new BigDecimal("250").compareTo((BigDecimal) service.metrics().get("verifiedOverpaymentAmount")));
    }

    @Test
    void recoveriesAndCorrectionsCountEachRecordedOutcomeOfThatKind() {
        action(ActionType.RECOVERY_RECORD);
        action(ActionType.RECOVERY_RECORD);
        action(ActionType.MASTER_CORRECTION);
        action(ActionType.PAYMENT_ADJUSTMENT);
        action(ActionType.DISMISS);
        Map<String, Object> m = service.metrics();
        assertEquals(2L, m.get("recoveryActionsRecorded"));
        assertEquals(1L, m.get("masterCorrectionsRecorded"));
    }

    @Test
    void dismissedCasesAreThoseClassifiedDismissed() {
        theCase(CaseClassification.DISMISSED);
        theCase(CaseClassification.DISMISSED);
        theCase(CaseClassification.CONFIRMED_OVERPAYMENT);
        theCase(null);
        Map<String, Object> m = service.metrics();
        assertEquals(2L, m.get("overturnedOrDismissed"));
        assertEquals(4, m.get("totalCases"));
    }

    @Test
    void openAndResolvedCountsCanBeScopedToOneDomain() {
        IntegrityCase benCase = theCase(null);
        benCase.setDomain(IntegrityDomain.BENEFICIARY);
        IntegrityCase payCase = new IntegrityCase();
        payCase.setId(UUID.randomUUID());
        payCase.setDomain(IntegrityDomain.PAYROLL);
        cases.add(payCase);
        alertFor(benCase, "OPEN", "1", IntegrityDomain.BENEFICIARY);
        alertFor(benCase, "OPEN", "1", IntegrityDomain.BENEFICIARY);
        alertFor(payCase, "OPEN", "1", IntegrityDomain.PAYROLL);
        alertFor(payCase, "OPEN", "1", IntegrityDomain.PAYROLL);
        alertFor(payCase, "OPEN", "1", IntegrityDomain.PAYROLL);
        assertEquals(5L, service.metrics().get("openAlerts"));
        assertEquals(2L, service.metrics(IntegrityDomain.BENEFICIARY).get("openAlerts"));
        assertEquals(3L, service.metrics(IntegrityDomain.PAYROLL).get("openAlerts"));
    }

    @Test
    void payrollResolvedMetricExcludesRecoveryCases() {
        IntegrityCase recoveryCase = new IntegrityCase();
        recoveryCase.setId(UUID.randomUUID());
        recoveryCase.setDomain(IntegrityDomain.PAYROLL);
        IntegrityCase plainCase = new IntegrityCase();
        plainCase.setId(UUID.randomUUID());
        plainCase.setDomain(IntegrityDomain.PAYROLL);
        cases.add(recoveryCase);
        cases.add(plainCase);
        IntegrityAlert recovered = alertFor(recoveryCase, "RESOLVED", "1", IntegrityDomain.PAYROLL);
        IntegrityAlert plain = alertFor(plainCase, "RESOLVED", "1", IntegrityDomain.PAYROLL);
        IntegrityAction recovery = new IntegrityAction();
        recovery.setCaseId(recoveryCase.getId());
        recovery.setActionType(ActionType.RECOVERY_RECORD);
        actions.add(recovery);
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of(recovery));

        assertEquals(1L, service.metrics(IntegrityDomain.PAYROLL).get("resolvedAlerts"));
        assertEquals(1L, service.metrics(IntegrityDomain.PAYROLL).get("recoveryActionsRecorded"));
    }

    @Test
    void openAndResolvedAlertsAreCountedByTheirStatus() {
        IntegrityCase c = theCase(null);
        alertFor(c, "OPEN", "1");
        alertFor(c, "OPEN", "1");
        alertFor(c, "OPEN", "1");
        alertFor(c, "RESOLVED", "1");
        alertFor(c, "RESOLVED", "1");
        Map<String, Object> m = service.metrics();
        assertEquals(3L, m.get("openAlerts"));
        assertEquals(2L, m.get("resolvedAlerts"));
    }
}
