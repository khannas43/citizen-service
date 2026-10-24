package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.*;
import org.magicsword.expenditure.repository.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CaseTimelineServiceTest {

    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    IntegrityCaseService cases = mock(IntegrityCaseService.class);
    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    PayrollSettlementRepository payrollRepo = mock(PayrollSettlementRepository.class);
    ServiceEventRepository serviceEventRepo = mock(ServiceEventRepository.class);
    PensionAuthorisationRepository pensionRepo = mock(PensionAuthorisationRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    CaseTimelineService service;

    final UUID caseId = UUID.randomUUID();
    IntegrityCase theCase = new IntegrityCase();
    IntegrityAlert alert = new IntegrityAlert();

    @BeforeEach
    void setUp() {
        service = new CaseTimelineService(alertRepo, caseRepo, cases, unitRepo, paymentRepo, eventRepo, changeLogRepo,
                payrollRepo, serviceEventRepo, pensionRepo, employeeRepo);
        theCase.setId(caseId);
        alert.setCaseId(caseId);
        when(caseRepo.findById(caseId)).thenReturn(Optional.of(theCase));
        when(alertRepo.findByCaseId(caseId)).thenReturn(List.of(alert));
        when(pensionRepo.findByEmployeeCode(any())).thenReturn(Optional.empty());
        when(employeeRepo.findByEmployeeCode(any())).thenReturn(Optional.empty());
    }

    EntitlementUnit unit(String start, String end) {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(UUID.randomUUID());
        u.setSchemeName("MYSY");
        u.setPersonId("p1");
        u.setAuthorizedAmount(new BigDecimal("10000"));
        u.setPeriodStart(LocalDate.parse(start));
        u.setPeriodEnd(LocalDate.parse(end));
        when(unitRepo.findById(u.getId())).thenReturn(Optional.of(u));
        return u;
    }

    PaymentSettlement payment(EntitlementUnit u, String amount, String start, String end, UUID reversalOf) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(u.getId());
        p.setAmount(new BigDecimal(amount));
        p.setPeriodStart(LocalDate.parse(start));
        p.setPeriodEnd(LocalDate.parse(end));
        p.setBankToken("ACC-1234567890");
        p.setReversalOf(reversalOf);
        return p;
    }

    CaseTimelineService.Lane lane(CaseTimelineService.Timeline t, String key) {
        return t.lanes().stream().filter(l -> l.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void aPaymentAfterADeathIsOnTheSameLineAsTheEventAndTheFlaggedPaymentIsMarked() {
        theCase.setDomain(IntegrityDomain.BENEFICIARY);
        alert.setPersonId("p1");
        EntitlementUnit u = unit("2024-04-01", "2025-03-31");
        PaymentSettlement early = payment(u, "5000", "2024-04-01", "2024-05-31", null);
        PaymentSettlement late = payment(u, "5000", "2024-09-01", "2024-09-30", null);
        PaymentSettlement refund = payment(u, "-5000", "2024-09-01", "2024-09-30", late.getId());
        alert.setEvidence(Map.of("paymentIds", List.of(late.getId().toString())));
        VerificationEvent death = new VerificationEvent();
        death.setId(UUID.randomUUID());
        death.setPersonId("p1");
        death.setEventType("DEATH");
        death.setEventDate(LocalDate.parse("2024-06-01"));
        when(cases.resolveUnitIdsForAlert(alert)).thenReturn(List.of(u.getId()));
        when(paymentRepo.findByUnitId(u.getId())).thenReturn(List.of(early, late, refund));
        when(eventRepo.findByPersonId("p1")).thenReturn(List.of(death));
        when(changeLogRepo.findByPersonId("p1")).thenReturn(List.of());

        CaseTimelineService.Timeline t = service.timeline(caseId).orElseThrow();
        assertEquals(LocalDate.parse("2024-04-01"), t.from());
        assertEquals(LocalDate.parse("2025-03-31"), t.to());
        List<CaseTimelineService.Item> pay = lane(t, "payments").items();
        assertEquals(3, pay.size());
        assertFalse(pay.get(0).flagged());
        assertTrue(pay.stream().filter(i -> i.id().equals(late.getId().toString())).findFirst().orElseThrow().flagged());
        assertEquals("REVERSAL", pay.stream().filter(i -> i.id().equals(refund.getId().toString())).findFirst().orElseThrow().kind());
        assertTrue(lane(t, "events").items().get(0).flagged());
        assertFalse(pay.toString().contains("1234567890"));            // the account is masked
        assertTrue(pay.get(0).detail().contains("7890"));
    }

    @Test
    void twoOverlappingEntitlementsBothShowAndTheOneInTheEvidenceIsMarked() {
        theCase.setDomain(IntegrityDomain.BENEFICIARY);
        alert.setPersonId("p1");
        EntitlementUnit a = unit("2024-04-01", "2025-03-31");
        EntitlementUnit b = unit("2024-06-01", "2025-05-31");
        alert.setEvidence(Map.of("unitIds", List.of(a.getId().toString(), b.getId().toString())));
        when(cases.resolveUnitIdsForAlert(alert)).thenReturn(List.of(a.getId(), b.getId()));
        when(paymentRepo.findByUnitId(any())).thenReturn(List.of());
        when(eventRepo.findByPersonId(any())).thenReturn(List.of());
        when(changeLogRepo.findByPersonId(any())).thenReturn(List.of());

        CaseTimelineService.Timeline t = service.timeline(caseId).orElseThrow();
        List<CaseTimelineService.Item> ent = lane(t, "entitlement").items();
        assertEquals(2, ent.size());
        assertTrue(ent.stream().allMatch(CaseTimelineService.Item::flagged));
        assertTrue(t.lanes().stream().noneMatch(l -> l.key().equals("payments")));       // empty lanes are left out
    }

    @Test
    void aPayrollCaseShowsBothDdosPayingTheSameMonthAndTheTransferOrder() {
        theCase.setDomain(IntegrityDomain.PAYROLL);
        alert.setPersonId("E1");
        PayrollSettlement a = pay("DDO-A", "2024-06-01", "2024-06-30");
        PayrollSettlement b = pay("DDO-B", "2024-06-01", "2024-06-30");
        alert.setEvidence(Map.of("payrollA", a.getId(), "payrollB", b.getId()));
        ServiceEvent transfer = new ServiceEvent();
        transfer.setId(UUID.randomUUID());
        transfer.setEmployeeCode("E1");
        transfer.setEventType("TRANSFER");
        transfer.setEffectiveDate(LocalDate.parse("2024-06-15"));
        when(payrollRepo.findByEmployeeCode("E1")).thenReturn(List.of(a, b));
        when(serviceEventRepo.findByEmployeeCode("E1")).thenReturn(List.of(transfer));
        MasterChangeLog noApproval = new MasterChangeLog();
        noApproval.setId(UUID.randomUUID());
        noApproval.setFieldName("bank_token");
        noApproval.setOperatorId("op1");
        noApproval.setChangedAt(LocalDateTime.parse("2024-06-10T10:00:00"));
        when(changeLogRepo.findByPersonId("E1")).thenReturn(List.of(noApproval));

        CaseTimelineService.Timeline t = service.timeline(caseId).orElseThrow();
        assertEquals(IntegrityDomain.PAYROLL, t.domain());
        assertEquals(2, lane(t, "pay").items().size());
        assertTrue(lane(t, "pay").items().stream().allMatch(CaseTimelineService.Item::flagged));
        assertEquals("Transfer", lane(t, "service").items().get(0).label());
        CaseTimelineService.Item change = lane(t, "changes").items().get(0);
        assertEquals("Bank account changed", change.label());
        assertTrue(change.flagged());                       // changed with no approval reference
    }

    PayrollSettlement pay(String ddo, String start, String end) {
        PayrollSettlement p = new PayrollSettlement();
        p.setId(UUID.randomUUID());
        p.setEmployeeCode("E1");
        p.setComponent("BASIC");
        p.setDdoCode(ddo);
        p.setPeriodStart(LocalDate.parse(start));
        p.setPeriodEnd(LocalDate.parse(end));
        p.setNetAmount(new BigDecimal("50000"));
        return p;
    }

    @Test
    void aPostEventCaseMarksTheStatusChangeAndThePayAfterIt() {
        theCase.setDomain(IntegrityDomain.PAYROLL);
        alert.setPersonId("E1");
        alert.setRuleCode("S02");
        alert.setEvidence(Map.of("employeeCode", "E1"));
        EmployeeIdentity e = new EmployeeIdentity();
        e.setEmployeeCode("E1");
        e.setStatus("DECEASED");
        e.setStatusSince(LocalDate.parse("2024-07-01"));
        when(employeeRepo.findByEmployeeCode("E1")).thenReturn(Optional.of(e));
        PayrollSettlement before = pay("DDO-A", "2024-06-01", "2024-06-30");
        PayrollSettlement after = pay("DDO-A", "2024-08-01", "2024-08-31");
        when(payrollRepo.findByEmployeeCode("E1")).thenReturn(List.of(before, after));
        when(serviceEventRepo.findByEmployeeCode("E1")).thenReturn(List.of());
        when(changeLogRepo.findByPersonId("E1")).thenReturn(List.of());

        CaseTimelineService.Timeline t = service.timeline(caseId).orElseThrow();
        CaseTimelineService.Item status = lane(t, "service").items().get(0);
        assertEquals("Status: Deceased", status.label());
        assertTrue(status.flagged());
        List<CaseTimelineService.Item> pay = lane(t, "pay").items();
        assertFalse(pay.get(0).flagged());          // paid before the status change
        assertTrue(pay.get(1).flagged());           // paid after it
    }

    @Test
    void anUnknownCaseHasNoTimeline() {
        assertTrue(service.timeline(UUID.randomUUID()).isEmpty());
    }
}
