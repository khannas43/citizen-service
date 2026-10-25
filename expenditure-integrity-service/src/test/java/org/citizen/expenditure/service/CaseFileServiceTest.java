package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.CaseStatus;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CaseFileServiceTest {

    IntegrityCaseService caseService = mock(IntegrityCaseService.class);
    CaseTimelineService timelineService = mock(CaseTimelineService.class);
    CaseFileService service;

    final UUID caseId = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    @BeforeEach
    void setUp() {
        service = new CaseFileService(caseService, timelineService);
    }

    @Test
    void beneficiaryExportContainsEverySectionAndMasksBankAccounts() {
        IntegrityCase c = sampleCase(caseId, IntegrityDomain.BENEFICIARY, LocalDateTime.of(2025, 6, 1, 10, 0));
        c.setClassification(org.citizen.expenditure.domain.CaseClassification.SUSPECTED_OVERPAYMENT);
        c.setDecisionText("Checked entitlement and payments.");
        c.setNoticeRequired(true);

        IntegrityAlert alert = new IntegrityAlert();
        alert.setRuleCode("802");
        alert.setSeverity("HIGH");
        alert.setPersonName("Meera Rathod");
        alert.setAmountDelta(new BigDecimal("5000"));
        alert.setEvidence(new LinkedHashMap<>(Map.of(
                "variant", "OVER_SETTLEMENT",
                "authorizedAmount", 10000,
                "netSettled", 15000,
                "bankToken", "BANK-SECRET-1234")));

        IntegrityAction action = new IntegrityAction();
        action.setActionType(org.citizen.expenditure.domain.ActionType.MASTER_CORRECTION);
        action.setExternalRef("GOV-INT-ABCD1234");
        action.setAuthoriser("sub-1");
        action.setCreatedAt(LocalDateTime.of(2025, 7, 1, 9, 0));

        IntegrityAuditLog log = new IntegrityAuditLog();
        log.setCreatedAt(LocalDateTime.of(2025, 7, 1, 9, 5));
        log.setActorRole("DEPT_ADMIN");
        log.setAction("DECISION");
        log.setDetails(Map.of("classification", "SUSPECTED_OVERPAYMENT"));

        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(c, List.of(alert), List.of(action), List.of(log), Map.of())));
        when(timelineService.timeline(caseId)).thenReturn(Optional.of(new CaseTimelineService.Timeline(
                IntegrityDomain.BENEFICIARY,
                LocalDate.of(2024, 1, 1),
                LocalDate.of(2024, 12, 31),
                List.of(new CaseTimelineService.Lane("payments", "Payments", List.of(
                        new CaseTimelineService.Item("p1", LocalDate.of(2024, 6, 1), LocalDate.of(2024, 6, 30),
                                "PAYMENT", "₹1000", "account ****1234", BigDecimal.TEN, true)))))));

        var auth = new UsernamePasswordAuthenticationToken("user", "n/a",
                List.of(new SimpleGrantedAuthority("ROLE_DEPT_ADMIN")));
        CaseFileService.CaseFileExport file = service.build(caseId, auth).orElseThrow();

        assertTrue(file.html().contains("Case file"));
        assertTrue(file.html().contains("Meera Rathod") || file.html().contains("802"));
        assertFalse(file.html().contains("BANK-SECRET"));
        assertTrue(file.html().contains("Demo data"));

        Map<String, Object> json = file.json();
        assertNotNull(json.get("header"));
        assertNotNull(json.get("alerts"));
        assertNotNull(json.get("timeline"));
        assertNotNull(json.get("decision"));
        assertNotNull(json.get("outcomes"));
        assertNotNull(json.get("auditTrail"));
        assertEquals("DEPT_ADMIN", json.get("generatedByRole"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> alertsJson = (List<Map<String, Object>>) json.get("alerts");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> evidence = (List<Map<String, String>>) alertsJson.get(0).get("evidence");
        assertTrue(evidence.stream().anyMatch(row -> row.get("value").contains("****")));
    }

    @Test
    void textAnOfficerTypedCannotInjectMarkupIntoTheStandaloneFile() {
        IntegrityCase c = sampleCase(caseId, IntegrityDomain.BENEFICIARY, LocalDateTime.of(2026, 5, 1, 10, 0));
        c.setClassification(org.citizen.expenditure.domain.CaseClassification.CONFIRMED_OVERPAYMENT);
        c.setDecisionText("<script>alert('x')</script> & \"quoted\"");
        c.setTitle("Rule 802 — <img src=x onerror=alert(1)>");
        IntegrityAlert alert = new IntegrityAlert();
        alert.setRuleCode("802");
        alert.setPersonName("<b>Name</b>");
        alert.setEvidence(new LinkedHashMap<>(Map.of("note", "<svg onload=alert(1)>")));
        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(c, List.of(alert), List.of(), List.of(), Map.of())));
        when(timelineService.timeline(caseId)).thenReturn(Optional.empty());
        var auth = new UsernamePasswordAuthenticationToken("user", "n/a", List.of(new SimpleGrantedAuthority("ROLE_DEPT_ADMIN")));

        String html = service.build(caseId, auth).orElseThrow().html();
        assertFalse(html.contains("<script>alert"));
        assertFalse(html.contains("<img src=x"));
        assertFalse(html.contains("<svg onload"));
        assertTrue(html.contains("&lt;script&gt;"));
        assertTrue(html.contains("&amp;"));
    }

    @Test
    void payrollExportIncludesTimelineAndDemoFlagWhenRecent() {
        UUID payrollCase = UUID.randomUUID();
        IntegrityCase c = sampleCase(payrollCase, IntegrityDomain.PAYROLL, LocalDateTime.of(2026, 3, 1, 12, 0));
        IntegrityAlert alert = new IntegrityAlert();
        alert.setRuleCode("S01");
        alert.setSeverity("HIGH");
        alert.setPersonName("Employee One");
        when(caseService.getCaseDetail(payrollCase)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(c, List.of(alert), List.of(), List.of(), Map.of())));
        when(timelineService.timeline(payrollCase)).thenReturn(Optional.of(new CaseTimelineService.Timeline(
                IntegrityDomain.PAYROLL, LocalDate.of(2024, 4, 1), LocalDate.of(2024, 5, 31), List.of())));

        CaseFileService.CaseFileExport file = service.build(payrollCase,
                new UsernamePasswordAuthenticationToken("x", "y", List.of(new SimpleGrantedAuthority("ROLE_HR_OFFICER"))))
                .orElseThrow();
        assertFalse(file.html().contains("Demo data"));
        assertTrue(file.json().containsKey("timeline"));
    }

    @Test
    void unknownCaseIsEmpty() {
        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.empty());
        assertTrue(service.build(caseId, null).isEmpty());
    }

    @Test
    void sanitizeStripsAadhaarAndMasksBanks() {
        Map<String, Object> in = new LinkedHashMap<>();
        in.put("maskedAadhaar", "XXXX-1234");
        in.put("bankAccount", "TOKEN-9999");
        Map<String, Object> out = CaseFileService.sanitize(in);
        assertFalse(out.containsKey("maskedAadhaar"));
        assertEquals(DetectionEngineService.maskToken("TOKEN-9999"), out.get("bankAccount"));
    }

    private static IntegrityCase sampleCase(UUID id, IntegrityDomain domain, LocalDateTime created) {
        IntegrityCase c = new IntegrityCase();
        c.setId(id);
        c.setDomain(domain);
        c.setTitle("Rule test — Person");
        c.setStatus(CaseStatus.OPEN);
        c.setCreatedAt(created);
        c.setUpdatedAt(created);
        return c;
    }
}
