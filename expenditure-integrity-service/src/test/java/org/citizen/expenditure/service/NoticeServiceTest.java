package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.domain.NoticeResponseKind;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.repository.CaseNoticeRepository;
import org.citizen.expenditure.repository.IntegrityAuditLogRepository;
import org.citizen.expenditure.repository.IntegrityCaseRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NoticeServiceTest {

    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    IntegrityCaseService caseService = mock(IntegrityCaseService.class);
    CaseNoticeRepository noticeRepo = mock(CaseNoticeRepository.class);
    IntegrityAuditLogRepository auditRepo = mock(IntegrityAuditLogRepository.class);
    NoticeService service = new NoticeService(caseRepo, caseService, noticeRepo, auditRepo);

    UUID caseId = UUID.randomUUID();
    IntegrityCase theCase;
    Jwt jwt = Jwt.withTokenValue("t")
            .header("alg", "none")
            .claim("sub", "officer-1")
            .claim("realm_access", Map.of("roles", List.of("DEPT_ADMIN")))
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(3600))
            .build();

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(service, "noticeResponseDays", 15);
        theCase = new IntegrityCase();
        theCase.setId(caseId);
        theCase.setDomain(IntegrityDomain.BENEFICIARY);
        theCase.setNoticeRequired(true);
        theCase.setClassification(CaseClassification.CONFIRMED_OVERPAYMENT);
        theCase.setDecisionText("Two active MYSY settlements overlap for the same academic year.");
        theCase.setUpdatedAt(LocalDateTime.of(2026, 3, 1, 10, 0));
        IntegrityAlert alert = new IntegrityAlert();
        alert.setPersonName("Demo Beneficiary");
        alert.setSchemeName("MYSY");
        alert.setAmountDelta(new BigDecimal("12000"));
        alert.setEvidence(Map.of("periodStart", "2025-04-01", "periodEnd", "2026-03-31"));
        when(caseRepo.findById(caseId)).thenReturn(Optional.of(theCase));
        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(theCase, List.of(alert), List.of(), List.of(), Map.of())));
    }

    @Test
    void fillsEnglishBeneficiaryTemplateWithNoPlaceholdersLeft() {
        Map<String, Object> draft = service.draft(caseId, "en");
        String text = (String) draft.get("text");
        assertFalse(text.contains("{{"));
        assertTrue(text.contains("Demo Beneficiary"));
        assertTrue(text.contains("MYSY"));
        assertTrue(text.contains("Two active MYSY"));
        assertTrue(text.contains("₹12000"));
    }

    @Test
    void fillsGujaratiBeneficiaryTemplateWithNoPlaceholdersLeft() {
        Map<String, Object> draft = service.draft(caseId, "gu");
        String text = (String) draft.get("text");
        assertFalse(text.contains("{{"));
        assertTrue(text.contains("Demo Beneficiary"));
        assertTrue(text.contains("અપીલ"));
    }

    @Test
    void whenThePeriodAndAmountAreUnknownTheSentenceStillReadsCleanly() {
        IntegrityAlert bare = new IntegrityAlert();
        bare.setPersonName("Person");
        bare.setSchemeName("MYSY");
        bare.setEvidence(Map.of());
        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(theCase, List.of(bare), List.of(), List.of(), Map.of())));
        String en = (String) service.draft(caseId, "en").get("text");
        assertTrue(en.contains("under MYSY has found a possible overpayment."));
        assertFalse(en.contains("the period under review"));
        assertFalse(en.contains("case file"));
        String gu = (String) service.draft(caseId, "gu").get("text");
        assertTrue(gu.contains("MYSY હેઠળ તમારી હકદારીની તપાસમાં શક્ય વધારાની ચુકવણી જણાઈ છે."));
        assertFalse(gu.contains("{{"));
    }

    @Test
    void beneficiaryNoticeNeverIncludesSalaryBankOrAadhaar() {
        IntegrityAlert alert = new IntegrityAlert();
        alert.setPersonName("Person");
        alert.setSchemeName("MYSY");
        alert.setAmountDelta(new BigDecimal("500"));
        alert.setEvidence(Map.of(
                "grossPay", "450000",
                "bankAccount", "XXXX1234",
                "aadhaar", "123456789012"));
        when(caseService.getCaseDetail(caseId)).thenReturn(Optional.of(
                new IntegrityCaseService.CaseDetail(theCase, List.of(alert), List.of(), List.of(),
                        Map.of("personLink", Map.of("maskedAadhaar", "XXXX-1234")))));
        String text = (String) service.draft(caseId, "en").get("text");
        assertFalse(text.toLowerCase().contains("450000"));
        assertFalse(text.contains("XXXX1234"));
        assertFalse(text.contains("123456789012"));
        assertFalse(text.contains("XXXX-1234"));
    }

    @Test
    void draftReturns409WhenNoticeNotRequired() {
        theCase.setNoticeRequired(false);
        ResponseStatusException e = assertThrows(ResponseStatusException.class, () -> service.draft(caseId, "en"));
        assertEquals(HttpStatus.CONFLICT, e.getStatusCode());
    }

    @Test
    void issueAndResponseAreAudited() {
        when(noticeRepo.save(any())).thenAnswer(inv -> {
            org.citizen.expenditure.entity.CaseNotice n = inv.getArgument(0);
            if (n.getId() == null) n.setId(UUID.randomUUID());
            return n;
        });
        when(noticeRepo.findFirstByCaseIdOrderByIssuedAtDesc(caseId)).thenAnswer(inv -> {
            var n = new org.citizen.expenditure.entity.CaseNotice();
            n.setId(UUID.randomUUID());
            n.setCaseId(caseId);
            n.setIssuedAt(LocalDateTime.now());
            return Optional.of(n);
        });
        service.issue(caseId, "en", jwt);
        verify(auditRepo).save(argThat(l -> "NOTICE_ISSUED".equals(l.getAction())));
        service.recordResponse(caseId, NoticeResponseKind.DISPUTED, "I disagree", jwt);
        verify(auditRepo).save(argThat(l -> "NOTICE_RESPONSE".equals(l.getAction())));
    }

    @Test
    void fillTemplateRejectsUnknownPlaceholders() {
        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> NoticeService.fillTemplate("Hello {{missing}}", Map.of("other", "x")));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, e.getStatusCode());
    }
}
