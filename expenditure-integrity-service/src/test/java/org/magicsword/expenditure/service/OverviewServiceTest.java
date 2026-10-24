package org.magicsword.expenditure.service;

import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.domain.ActionType;
import org.magicsword.expenditure.domain.CaseClassification;
import org.magicsword.expenditure.entity.IntegrityAction;
import org.magicsword.expenditure.entity.IntegrityAlert;
import org.magicsword.expenditure.entity.IntegrityCase;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.IntegrityActionRepository;
import org.magicsword.expenditure.repository.IntegrityAlertRepository;
import org.magicsword.expenditure.repository.CaseNoticeRepository;
import org.magicsword.expenditure.repository.IntegrityAuditLogRepository;
import org.magicsword.expenditure.repository.IntegrityCaseRepository;

import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OverviewServiceTest {

    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    IntegrityActionRepository actionRepo = mock(IntegrityActionRepository.class);
    PaymentGateService gate = mock(PaymentGateService.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    IntegrityAuditLogRepository auditRepo = mock(IntegrityAuditLogRepository.class);
    CaseNoticeRepository noticeRepo = mock(CaseNoticeRepository.class);
    OverviewService service = new OverviewService(alertRepo, caseRepo, actionRepo, gate, employeeRepo, auditRepo, noticeRepo);

    {
        when(gate.holdConfirmedSince(any())).thenReturn(List.of());
        when(auditRepo.findAll()).thenReturn(List.of());
        when(noticeRepo.findAll()).thenReturn(List.of());
    }

    IntegrityCase caseOf(CaseClassification c) {
        IntegrityCase ic = new IntegrityCase();
        ic.setId(UUID.randomUUID());
        ic.setClassification(c);
        return ic;
    }

    IntegrityAlert alert(String rule, String district, String status, String amount, IntegrityCase c) {
        IntegrityAlert a = new IntegrityAlert();
        a.setId(UUID.randomUUID());
        a.setRuleCode(rule);
        a.setDistrict(district);
        a.setStatus(status);
        a.setAmountDelta(amount == null ? null : new BigDecimal(amount));
        a.setCaseId(c == null ? null : c.getId());
        return a;
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> row(Object list, String key, String value) {
        return ((List<Map<String, Object>>) list).stream().filter(m -> value.equals(m.get(key))).findFirst().orElseThrow();
    }

    @Test
    void addsUpFlaggedConfirmedAndRecoveredMoneyByDistrictAndRule() {
        IntegrityCase confirmed = caseOf(CaseClassification.CONFIRMED_OVERPAYMENT);
        IntegrityCase dismissed = caseOf(CaseClassification.DISMISSED);
        List<IntegrityAlert> alerts = List.of(
                alert("802", "Surat", "OPEN", "1000", null),
                alert("803", "Surat", "OPEN", null, null),
                alert("802", "Surat", "RESOLVED", "4000", confirmed),
                alert("S01", null, "OPEN", "500", null),
                alert("804", "Ahmedabad", "RESOLVED", "900", dismissed));
        IntegrityAction recovery = new IntegrityAction();
        recovery.setActionType(ActionType.RECOVERY_RECORD);
        recovery.setCaseId(confirmed.getId());
        when(alertRepo.findAll()).thenReturn(alerts);
        when(caseRepo.findAll()).thenReturn(List.of(confirmed, dismissed));
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of(recovery));
        when(gate.metrics()).thenReturn(Map.of("gatePreventedAmount", new BigDecimal("700")));

        Map<String, Object> out = service.overview();
        @SuppressWarnings("unchecked") Map<String, Object> totals = (Map<String, Object>) out.get("totals");
        assertEquals(3L, totals.get("openAlerts"));
        assertEquals(0, new BigDecimal("1500").compareTo((BigDecimal) totals.get("flaggedAmount")));
        assertEquals(0, new BigDecimal("4000").compareTo((BigDecimal) totals.get("confirmedAmount")));
        assertEquals(0, new BigDecimal("4000").compareTo((BigDecimal) totals.get("recoveredAmount")));
        assertEquals(1L, totals.get("dismissedCases"));
        assertEquals(new BigDecimal("700"), totals.get("gatePreventedAmount"));

        Map<String, Object> surat = row(out.get("byDistrict"), "district", "Surat");
        assertEquals(2L, surat.get("openAlerts"));
        assertEquals(0, new BigDecimal("1000").compareTo((BigDecimal) surat.get("flaggedAmount")));
        assertEquals(0, new BigDecimal("4000").compareTo((BigDecimal) surat.get("recoveredAmount")));
        assertEquals(1L, row(out.get("byDistrict"), "district", "Unspecified").get("openAlerts"));
        assertEquals(1L, row(out.get("byRule"), "ruleCode", "802").get("openAlerts"));
    }

    @Test
    void aPayrollAlertWithNoDistrictCountsInItsEmployeesDistrict() {
        IntegrityAlert payroll = alert("S01", null, "OPEN", "800", null);
        payroll.setDomain(IntegrityDomain.PAYROLL);
        payroll.setPersonId("E1");
        IntegrityAlert beneficiary = alert("802", "Surat", "OPEN", "100", null);
        beneficiary.setDomain(IntegrityDomain.BENEFICIARY);
        EmployeeIdentity e = new EmployeeIdentity();
        e.setEmployeeCode("E1");
        e.setDistrict("Surat");
        when(alertRepo.findAll()).thenReturn(List.of(payroll, beneficiary));
        when(caseRepo.findAll()).thenReturn(List.of());
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(employeeRepo.findAll()).thenReturn(List.of(e));
        when(gate.metrics()).thenReturn(Map.of());

        Map<String, Object> surat = row(service.overview().get("byDistrict"), "district", "Surat");
        assertEquals(2L, surat.get("openAlerts"));
        assertEquals(1L, surat.get("payrollOpenAlerts"));
        assertEquals(1L, surat.get("beneficiaryOpenAlerts"));
        assertEquals(0, new BigDecimal("900").compareTo((BigDecimal) surat.get("flaggedAmount")));
    }

    @Test
    void measuresRecurrenceMasterCorrectionTimeAndVerification() {
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        IntegrityCase c1 = caseOf(CaseClassification.CONFIRMED_OVERPAYMENT);
        c1.setCreatedAt(now.minusDays(10));
        c1.setUpdatedAt(now.minusDays(5));
        c1.setStatus(org.magicsword.expenditure.domain.CaseStatus.ACTION_RECORDED);
        IntegrityCase c2 = caseOf(CaseClassification.CONFIRMED_OVERPAYMENT);
        c2.setUpdatedAt(now.minusDays(4));
        c2.setStatus(org.magicsword.expenditure.domain.CaseStatus.CLOSED);
        c2.setVerifiedAt(now.minusDays(3));
        IntegrityAlert fixed1 = alert("802", "Surat", "RESOLVED", "100", c1);
        fixed1.setPersonId("p1");
        fixed1.setDetectedAt(now.minusDays(10));
        IntegrityAlert again = alert("802", "Surat", "OPEN", "100", null);
        again.setPersonId("p1");
        again.setDetectedAt(now.minusDays(1));          // flagged again after the fix
        IntegrityAlert fixed2 = alert("803", "Surat", "RESOLVED", "50", c2);
        fixed2.setPersonId("p2");
        fixed2.setDetectedAt(now.minusDays(9));         // not seen again
        IntegrityAction fix = new IntegrityAction();
        fix.setCaseId(c1.getId());
        fix.setActionType(ActionType.MASTER_CORRECTION);
        fix.setCreatedAt(now.minusDays(6));             // 4 days after the case opened
        when(alertRepo.findAll()).thenReturn(List.of(fixed1, again, fixed2));
        when(caseRepo.findAll()).thenReturn(List.of(c1, c2));
        when(actionRepo.findByActionType(ActionType.MASTER_CORRECTION)).thenReturn(List.of(fix));
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());

        @SuppressWarnings("unchecked") Map<String, Object> t = (Map<String, Object>) service.overview().get("totals");
        assertEquals(2L, t.get("fixedFindings"));
        assertEquals(1L, t.get("recurredFindings"));
        assertEquals(50.0, t.get("recurrenceRate"));
        assertEquals(4.0, t.get("avgDaysToMasterCorrection"));
        assertEquals(1L, t.get("verifiedClosedCases"));
        assertEquals(1L, t.get("awaitingVerification"));
    }

    @Test
    void recurrenceIsUnknownUntilSomethingHasBeenFixed() {
        when(alertRepo.findAll()).thenReturn(List.of(alert("802", "Surat", "OPEN", "1", null)));
        when(caseRepo.findAll()).thenReturn(List.of());
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());
        @SuppressWarnings("unchecked") Map<String, Object> t = (Map<String, Object>) service.overview().get("totals");
        assertNull(t.get("recurrenceRate"));
        assertNull(t.get("avgDaysToMasterCorrection"));
    }

    @Test
    void ruleHealthCountsWhatReviewersDecidedAndComputesPrecision() {
        List<CaseClassification> rulings = List.of(CaseClassification.CONFIRMED_OVERPAYMENT, CaseClassification.CONFIRMED_OVERPAYMENT,
                CaseClassification.CONFIRMED_OVERPAYMENT, CaseClassification.LEGITIMATE_EXCEPTION, CaseClassification.DATA_ERROR,
                CaseClassification.DISMISSED, CaseClassification.SUSPECTED_OVERPAYMENT);
        List<IntegrityAlert> alerts = new ArrayList<>();
        Map<UUID, IntegrityCase> cases = new HashMap<>();
        for (CaseClassification ruling : rulings) {
            IntegrityCase ic = caseOf(ruling);
            cases.put(ic.getId(), ic);
            alerts.add(alert("802", "Surat", "RESOLVED", "1000", ic));
        }
        alerts.add(alert("802", "Surat", "OPEN", "1000", null));                                 // not reviewed yet
        alerts.add(alert("805", "Surat", "OPEN", null, null));
        Map<String, Object> r802 = row(service.ruleHealth(alerts, cases), "ruleCode", "802");
        assertEquals(8L, r802.get("raised"));
        assertEquals(1L, r802.get("open"));
        assertEquals(6L, r802.get("reviewed"));                 // suspected is not a ruling
        assertEquals(3L, r802.get("confirmed"));
        assertEquals(1L, r802.get("legitimateException"));
        assertEquals(1L, r802.get("dataError"));
        assertEquals(1L, r802.get("dismissed"));
        assertEquals(1L, r802.get("suspected"));
        assertEquals(50.0, r802.get("precisionPercent"));
        assertEquals(false, r802.get("enoughEvidence"));        // 6 rulings is thin evidence
        assertEquals(0, new BigDecimal("3000").compareTo((BigDecimal) r802.get("confirmedAmount")));
        Map<String, Object> r805 = row(service.ruleHealth(alerts, cases), "ruleCode", "805");
        assertNull(r805.get("precisionPercent"));               // nothing reviewed, no figure
        assertEquals("802", service.ruleHealth(alerts, cases).get(0).get("ruleCode"));   // most reviewed first
    }

    @Test
    void byMonthIncludesTwelveMonthsWithZerosAndBucketsAcrossYearBoundary() {
        YearMonth now = YearMonth.now();
        LocalDateTime dec = now.minusMonths(1).atEndOfMonth().atStartOfDay().minusHours(1);
        LocalDateTime jan = now.atDay(5).atStartOfDay();
        IntegrityCase confirmed = caseOf(CaseClassification.CONFIRMED_OVERPAYMENT);
        confirmed.setUpdatedAt(jan);
        confirmed.setCreatedAt(jan.minusDays(2));
        IntegrityAlert flaggedOld = alert("802", "Surat", "OPEN", "100", null);
        flaggedOld.setDetectedAt(dec);
        IntegrityAlert flaggedNew = alert("802", "Surat", "OPEN", "200", null);
        flaggedNew.setDetectedAt(jan);
        IntegrityAlert confirmedAlert = alert("802", "Surat", "RESOLVED", "500", confirmed);
        confirmedAlert.setDetectedAt(now.minusYears(2).atDay(1).atStartOfDay());
        when(alertRepo.findAll()).thenReturn(List.of(flaggedOld, flaggedNew, confirmedAlert));
        when(caseRepo.findAll()).thenReturn(List.of(confirmed));
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());

        @SuppressWarnings("unchecked") List<Map<String, Object>> months = (List<Map<String, Object>>) service.overview().get("byMonth");
        assertEquals(12, months.size());
        assertEquals(0, new BigDecimal(String.valueOf(months.get(0).get("flagged"))).compareTo(BigDecimal.ZERO));
        String decKey = String.format("%04d-%02d", dec.getYear(), dec.getMonthValue());
        String janKey = String.format("%04d-%02d", jan.getYear(), jan.getMonthValue());
        Map<String, Object> decRow = months.stream().filter(m -> decKey.equals(m.get("month"))).findFirst().orElseThrow();
        Map<String, Object> janRow = months.stream().filter(m -> janKey.equals(m.get("month"))).findFirst().orElseThrow();
        assertEquals(0, new BigDecimal("100").compareTo((BigDecimal) decRow.get("flagged")));
        assertEquals(0, new BigDecimal("200").compareTo((BigDecimal) janRow.get("flagged")));
        assertEquals(0, new BigDecimal("500").compareTo((BigDecimal) janRow.get("confirmed")));
    }

    @Test
    void projectionIsAbsentWhenPilotShareIsZero() {
        ReflectionTestUtils.setField(service, "pilotSharePercent", BigDecimal.ZERO);
        when(alertRepo.findAll()).thenReturn(List.of());
        when(caseRepo.findAll()).thenReturn(List.of());
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());
        assertFalse(service.overview().containsKey("projection"));
    }

    @Test
    void projectionScalesConfirmedByPilotShare() {
        ReflectionTestUtils.setField(service, "pilotSharePercent", new BigDecimal("5"));
        IntegrityCase confirmed = caseOf(CaseClassification.CONFIRMED_OVERPAYMENT);
        when(alertRepo.findAll()).thenReturn(List.of(alert("802", "Surat", "RESOLVED", "5000", confirmed)));
        when(caseRepo.findAll()).thenReturn(List.of(confirmed));
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());
        @SuppressWarnings("unchecked") Map<String, Object> p = (Map<String, Object>) service.overview().get("projection");
        assertEquals(0, new BigDecimal("5000").compareTo((BigDecimal) p.get("pilotConfirmed")));
        assertEquals(0, new BigDecimal("100000").compareTo((BigDecimal) p.get("estimatedStateConfirmed")));
        assertTrue(String.valueOf(p.get("caveat")).contains("Estimate, not a finding"));
    }

    @Test
    void safeguardMetricsCountOverturnOnceAfterReclassification() {
        UUID cid = UUID.randomUUID();
        IntegrityCase c = caseOf(CaseClassification.DATA_ERROR);
        c.setId(cid);
        org.magicsword.expenditure.entity.IntegrityAuditLog confirmed = new org.magicsword.expenditure.entity.IntegrityAuditLog();
        confirmed.setCaseId(cid);
        confirmed.setAction("DECISION");
        confirmed.setDetails(Map.of("classification", CaseClassification.CONFIRMED_OVERPAYMENT.name()));
        when(auditRepo.findAll()).thenReturn(List.of(confirmed));
        when(alertRepo.findAll()).thenReturn(List.of());
        when(caseRepo.findAll()).thenReturn(List.of(c));
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());
        @SuppressWarnings("unchecked") Map<String, Object> t = (Map<String, Object>) service.overview().get("totals");
        assertEquals(1L, ((Number) t.get("adverseDecisions")).longValue());
        assertEquals(1L, ((Number) t.get("overturned")).longValue());
    }

    @Test
    void monthKeysCoverTwelveMonths() {
        List<String> keys = OverviewService.monthKeys(YearMonth.of(2026, 3));
        assertEquals(12, keys.size());
        assertEquals("2025-04", keys.get(0));
        assertEquals("2026-03", keys.get(11));
    }

    @Test
    void carriesNoPersonalDetails() {
        IntegrityAlert a = alert("802", "Surat", "OPEN", "10", null);
        a.setPersonName("Meera Rathod");
        a.setPersonId("p1");
        when(alertRepo.findAll()).thenReturn(List.of(a));
        when(caseRepo.findAll()).thenReturn(List.of());
        when(actionRepo.findByActionType(any())).thenReturn(List.of());
        when(gate.metrics()).thenReturn(Map.of());
        String all = service.overview().toString();
        assertFalse(all.contains("Meera") || all.contains("p1"));
    }
}
