package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.CaseStatus;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.citizen.expenditure.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** The case workflow: assign, decide, record an outcome, and what each step does to the case, its alerts and the audit trail. */
class IntegrityCaseServiceTest {

    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityActionRepository actionRepo = mock(IntegrityActionRepository.class);
    IntegrityAuditLogRepository auditRepo = mock(IntegrityAuditLogRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    PersonDisplayNameService displayNames = mock(PersonDisplayNameService.class);
    org.citizen.expenditure.client.FamilyRegistryClient familyRegistry = mock(org.citizen.expenditure.client.FamilyRegistryClient.class);
    IntegrityCaseService service;

    final UUID caseId = UUID.randomUUID();
    IntegrityCase theCase;
    IntegrityAlert theAlert;
    final List<IntegrityAuditLog> audit = new ArrayList<>();
    final List<IntegrityAction> actions = new ArrayList<>();

    Jwt officer(String subject, String... roles) {
        return Jwt.withTokenValue("t").header("alg", "none").subject(subject)
                .claim("realm_access", Map.of("roles", List.of(roles))).build();
    }

    final Jwt deptAdmin = officer("sub-dept-admin", "DEPT_ADMIN");

    @BeforeEach
    void setUp() {
        service = new IntegrityCaseService(caseRepo, alertRepo, actionRepo, auditRepo, paymentRepo, unitRepo, changeLogRepo, eventRepo, employeeRepo, displayNames, familyRegistry);
        ReflectionTestUtils.setField(service, "recoveryApprovalThreshold", new BigDecimal("100000"));
        ReflectionTestUtils.setField(service, "verifyNeedsSecondPerson", false);
        org.mockito.Mockito.doAnswer(inv -> {
            EntitlementUnit u = inv.getArgument(1);
            if (u != null && u.getPersonName() != null) {
                inv.<IntegrityAlert>getArgument(0).setPersonName(u.getPersonName());
            }
            return null;
        }).when(displayNames).applyBeneficiaryDisplayName(any(), any());
        theCase = new IntegrityCase();
        theCase.setId(caseId);
        theCase.setDomain(IntegrityDomain.BENEFICIARY);
        theCase.setStatus(CaseStatus.OPEN);
        theAlert = new IntegrityAlert();
        theAlert.setId(UUID.randomUUID());
        theAlert.setCaseId(caseId);
        theAlert.setStatus("OPEN");
        theAlert.setRuleCode("802");
        when(caseRepo.findById(caseId)).thenReturn(Optional.of(theCase));
        when(caseRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        when(alertRepo.findByCaseId(caseId)).thenReturn(List.of(theAlert));
        when(alertRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        when(actionRepo.save(any())).thenAnswer(i -> { actions.add(i.getArgument(0)); return i.getArgument(0); });
        when(actionRepo.findByCaseIdOrderByCreatedAtDesc(caseId)).thenAnswer(i -> actions);
        when(auditRepo.save(any())).thenAnswer(i -> { audit.add(i.getArgument(0)); return i.getArgument(0); });
        when(auditRepo.findByCaseIdOrderByCreatedAtDesc(caseId)).thenAnswer(i -> audit);
    }

    ResponseStatusException refused(org.junit.jupiter.api.function.Executable call) {
        return assertThrows(ResponseStatusException.class, call);
    }

    void decide(CaseClassification classification) {
        service.recordDecision(caseId, classification, "Checked the settlement ledger", false, deptAdmin);
    }

    // ---- assign --------------------------------------------------------------------------------------------

    @Test
    void assigningTakesTheCaseUnderReview_andTheAuditSaysWhoDidIt() {
        IntegrityCase c = service.assign(caseId, "reviewer.one", officer("sub-9", "SCHEME_DEPT"));
        assertEquals("reviewer.one", c.getAssignee());
        assertEquals(CaseStatus.UNDER_REVIEW, c.getStatus());
        IntegrityAuditLog line = audit.get(0);
        assertEquals("ASSIGN", line.getAction());
        assertEquals("sub-9", line.getActor());
        assertEquals("SCHEME_DEPT", line.getActorRole());
        assertEquals("reviewer.one", line.getDetails().get("assignee"));
    }

    @Test
    void anAssigneeIsRequired() {
        for (String missing : new String[] {null, "", "   "}) {
            ResponseStatusException e = refused(() -> service.assign(caseId, missing, deptAdmin));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
            assertTrue(e.getReason().contains("assignee"));
        }
        assertTrue(audit.isEmpty(), "a refused request leaves no trace in the case");
    }

    @Test
    void aCaseThatDoesNotExistIsNotFound() {
        UUID other = UUID.randomUUID();
        when(caseRepo.findById(other)).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, refused(() -> service.assign(other, "x", deptAdmin)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, refused(() -> service.recordDecision(other, CaseClassification.DATA_ERROR, "r", false, deptAdmin)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, refused(() -> service.recordAction(other, ActionType.DISMISS, null, deptAdmin)).getStatusCode());
    }

    // ---- decision ------------------------------------------------------------------------------------------

    @Test
    void aDecisionRecordsTheClassificationTheReasonAndTheNotice() {
        IntegrityCase c = service.recordDecision(caseId, CaseClassification.CONFIRMED_OVERPAYMENT, "Two settlements, one entitlement", true, deptAdmin);
        assertEquals(CaseClassification.CONFIRMED_OVERPAYMENT, c.getClassification());
        assertEquals("Two settlements, one entitlement", c.getDecisionText());
        assertTrue(c.isNoticeRequired());
        assertEquals(CaseStatus.DECIDED, c.getStatus());
        assertEquals("DECISION", audit.get(0).getAction());
        assertEquals("CONFIRMED_OVERPAYMENT", audit.get(0).getDetails().get("classification"));
        assertEquals(true, audit.get(0).getDetails().get("noticeRequired"));
        assertEquals("OPEN", theAlert.getStatus(), "a decided case still needs its outcome recorded, so the alert stays open");
    }

    @Test
    void aReasonAndAClassificationAreRequired_onTheServerAsWellAsOnTheScreen() {
        for (String reason : new String[] {null, "", "  \t "}) {
            ResponseStatusException e = refused(() -> service.recordDecision(caseId, CaseClassification.DATA_ERROR, reason, false, deptAdmin));
            assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
            assertTrue(e.getReason().toLowerCase().contains("reason"));
        }
        ResponseStatusException e = refused(() -> service.recordDecision(caseId, null, "A reason", false, deptAdmin));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertTrue(e.getReason().toLowerCase().contains("classification"));
        assertNull(theCase.getClassification());
        assertTrue(audit.isEmpty());
    }

    @Test
    void aDecisionCanBeRevisedAfterReopenOnAppeal() {
        decide(CaseClassification.SUSPECTED_OVERPAYMENT);
        assertEquals(CaseStatus.DECIDED, theCase.getStatus());
        service.reopenOnAppeal(caseId, "Written appeal received", deptAdmin);
        assertEquals(CaseStatus.UNDER_REVIEW, theCase.getStatus());
        decide(CaseClassification.CONFIRMED_OVERPAYMENT);
        assertEquals(CaseClassification.CONFIRMED_OVERPAYMENT, theCase.getClassification());
        assertEquals(2, audit.stream().filter(a -> a.getAction().equals("DECISION")).count());
        assertTrue(audit.stream().anyMatch(a -> "REOPEN_APPEAL".equals(a.getAction())));
    }

    @Test
    void overturnIsAuditedWhenConfirmedIsReclassified() {
        decide(CaseClassification.CONFIRMED_OVERPAYMENT);
        service.reopenOnAppeal(caseId, "Appeal", deptAdmin);
        decide(CaseClassification.DATA_ERROR);
        assertTrue(audit.stream().anyMatch(a -> "OVERTURN".equals(a.getAction())));
    }

    @Test
    void dismissingTheCaseClosesItAndResolvesItsAlert() {
        decide(CaseClassification.DISMISSED);
        assertEquals(CaseStatus.CLOSED, theCase.getStatus());
        assertEquals("RESOLVED", theAlert.getStatus());
    }

    @Test
    void aClosedCaseTakesNoFurtherDecisionOrAction() {
        decide(CaseClassification.DISMISSED);
        assertEquals(HttpStatus.CONFLICT, refused(() -> decide(CaseClassification.CONFIRMED_OVERPAYMENT)).getStatusCode());
        assertEquals(HttpStatus.CONFLICT, refused(() -> service.recordAction(caseId, ActionType.DISMISS, null, deptAdmin)).getStatusCode());
        assertEquals(HttpStatus.CONFLICT, refused(() -> service.assign(caseId, "someone", deptAdmin)).getStatusCode());
        assertEquals(CaseClassification.DISMISSED, theCase.getClassification());
    }

    // ---- outcomes ------------------------------------------------------------------------------------------

    @Test
    void anOutcomeNeedsADecisionFirst_exceptClosingWithoutAction() {
        for (ActionType type : List.of(ActionType.MASTER_CORRECTION, ActionType.PAYMENT_ADJUSTMENT, ActionType.RECOVERY_RECORD)) {
            ResponseStatusException e = refused(() -> service.recordAction(caseId, type, Map.of(), deptAdmin));
            assertEquals(HttpStatus.CONFLICT, e.getStatusCode(), type + " before any decision");
            assertTrue(e.getReason().toLowerCase().contains("decision"));
        }
        assertTrue(actions.isEmpty());
        service.recordAction(caseId, ActionType.DISMISS, Map.of("note", "nothing to do"), deptAdmin);
        assertEquals(CaseStatus.CLOSED, theCase.getStatus());
    }

    @Test
    void aRecoveryIsRecordedOnlyAfterTheOverpaymentIsConfirmed() {
        decide(CaseClassification.SUSPECTED_OVERPAYMENT);
        ResponseStatusException e = refused(() -> service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of(), deptAdmin));
        assertEquals(HttpStatus.CONFLICT, e.getStatusCode());
        assertTrue(e.getReason().toLowerCase().contains("confirmed"));
        // the other outcomes, such as correcting a record, do not need confirmation
        service.recordAction(caseId, ActionType.MASTER_CORRECTION, Map.of(), deptAdmin);
        service.reopenOnAppeal(caseId, "Need to confirm overpayment after review", deptAdmin);
        decide(CaseClassification.CONFIRMED_OVERPAYMENT);
        assertNotNull(service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 10000), deptAdmin));
    }

    @Test
    void anOutcomeGetsAReferenceAndAnAuthoriser_movesTheCaseOn_andResolvesTheAlert() {
        decide(CaseClassification.CONFIRMED_OVERPAYMENT);
        IntegrityAction a = service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 10000), officer("sub-fin", "DEPT_ADMIN"));
        assertTrue(a.getExternalRef().matches("GOV-INT-[0-9A-F]{8}"), a.getExternalRef());
        assertEquals("sub-fin", a.getAuthoriser());
        assertEquals(ActionType.RECOVERY_RECORD, a.getActionType());
        assertEquals(10000, a.getPayload().get("amount"));
        assertEquals(CaseStatus.ACTION_RECORDED, theCase.getStatus());
        assertEquals("RESOLVED", theAlert.getStatus(), "an alert whose outcome is recorded leaves the inbox");
        IntegrityAuditLog line = audit.get(audit.size() - 1);
        assertEquals("ACTION_RECOVERY_RECORD", line.getAction());
        assertEquals(a.getExternalRef(), line.getDetails().get("externalRef"));
    }

    @Test
    void aMissingPayloadBecomesAnEmptyOne_andEachOutcomeGetsItsOwnReference() {
        decide(CaseClassification.CONFIRMED_OVERPAYMENT);
        IntegrityAction one = service.recordAction(caseId, ActionType.PAYMENT_ADJUSTMENT, null, deptAdmin);
        IntegrityAction two = service.recordAction(caseId, ActionType.RECOVERY_RECORD, null, deptAdmin);
        assertTrue(one.getPayload().isEmpty());
        assertNotEquals(one.getExternalRef(), two.getExternalRef());
        assertEquals(2, service.getCaseDetail(caseId).orElseThrow().actions().size());
    }

    @Test
    void closingWithoutActionClosesTheCaseAndResolvesTheAlert() {
        service.recordAction(caseId, ActionType.DISMISS, null, deptAdmin);
        assertEquals(CaseStatus.CLOSED, theCase.getStatus());
        assertEquals("RESOLVED", theAlert.getStatus());
    }

    // ---- reading -------------------------------------------------------------------------------------------

    @Test
    void theCaseDetailHasItsOwnAlertsActionsAndHistory_andOnlyThose() {
        IntegrityAlert someoneElses = new IntegrityAlert();
        someoneElses.setCaseId(UUID.randomUUID());
        when(alertRepo.findAll()).thenReturn(List.of(theAlert, someoneElses));       // the old way of finding them: a scan of everything
        service.assign(caseId, "reviewer.one", deptAdmin);
        var detail = service.getCaseDetail(caseId).orElseThrow();
        assertSame(theCase, detail.caseEntity());
        assertEquals(List.of(theAlert), detail.alerts());
        assertEquals(1, detail.auditLog().size());
        verify(alertRepo, never()).findAll();         // one case must not read every alert in the database
    }

    @Test
    void aCaseThatDoesNotExistHasNoDetail() {
        UUID other = UUID.randomUUID();
        when(caseRepo.findById(other)).thenReturn(Optional.empty());
        assertTrue(service.getCaseDetail(other).isEmpty());
        assertTrue(service.domainOf(other).isEmpty());
        assertEquals(Optional.of(IntegrityDomain.BENEFICIARY), service.domainOf(caseId));
    }

    @Test
    void inboxPersonNameMatchesLinkedEntitlementUnit() {
        UUID unitId = UUID.randomUUID();
        IntegrityAlert stale = alert("801", IntegrityDomain.BENEFICIARY, "OPEN", LocalDateTime.of(2026, 6, 1, 0, 0));
        stale.setPersonName("Pilot DupEnroll (Bavla)");
        stale.setEvidence(Map.of("unitIds", List.of(unitId.toString())));
        EntitlementUnit unit = new EntitlementUnit();
        unit.setId(unitId);
        unit.setPersonName("Vimal Mali");
        unit.setPersonId("person-vimal");
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.BENEFICIARY, "OPEN")).thenReturn(List.of(stale));
        when(unitRepo.findById(unitId)).thenReturn(Optional.of(unit));

        assertEquals("Vimal Mali", service.listAlerts(IntegrityDomain.BENEFICIARY, null, "OPEN", null, null, null, null).get(0).getPersonName());
    }

    @Test
    void caseDetailListsRelatedEntitlementsWithoutRecordIds() {
        UUID unitA = UUID.randomUUID();
        UUID unitB = UUID.randomUUID();
        theAlert.setRuleCode("801");
        theAlert.setEvidence(Map.of("activeEnrollments", 2, "unitIds", List.of(unitA.toString(), unitB.toString())));
        EntitlementUnit a = new EntitlementUnit();
        a.setId(unitA);
        a.setSchemeName("MYSY");
        a.setStatus("ACTIVE");
        a.setAuthorizedAmount(new BigDecimal("10000"));
        a.setPeriodStart(LocalDate.of(2024, 4, 1));
        a.setDistrict("Ahmedabad");
        EntitlementUnit b = new EntitlementUnit();
        b.setId(unitB);
        b.setSchemeName("MYSY");
        b.setStatus("ACTIVE");
        when(unitRepo.findById(unitA)).thenReturn(Optional.of(a));
        when(unitRepo.findById(unitB)).thenReturn(Optional.of(b));
        when(paymentRepo.findByUnitId(any())).thenReturn(List.of());

        var detail = service.getCaseDetail(caseId).orElseThrow();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> units = (List<Map<String, Object>>) detail.evidenceContext().get("relatedEntitlements");
        assertEquals(2, units.size());
        assertEquals("MYSY", units.get(0).get("schemeName"));
        assertEquals("10000", units.get(0).get("authorizedAmount").toString());
        assertFalse(units.get(0).containsKey("id"));
        assertFalse(units.get(0).containsKey("personId"));
        assertFalse(units.get(0).containsKey("familyId"));
    }

    @Test
    void theInboxFiltersByDomainStatusAndRule_newestFirst() {
        IntegrityAlert old = alert("802", IntegrityDomain.BENEFICIARY, "OPEN", LocalDateTime.of(2026, 1, 1, 0, 0));
        IntegrityAlert recent = alert("805", IntegrityDomain.BENEFICIARY, "OPEN", LocalDateTime.of(2026, 6, 1, 0, 0));
        IntegrityAlert done = alert("802", IntegrityDomain.BENEFICIARY, "RESOLVED", LocalDateTime.of(2026, 3, 1, 0, 0));
        IntegrityAlert payroll = alert("S01", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2026, 2, 1, 0, 0));
        when(alertRepo.findAll()).thenReturn(List.of(old, recent, done, payroll));
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.BENEFICIARY, "OPEN")).thenReturn(List.of(old, recent));
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.BENEFICIARY, "RESOLVED")).thenReturn(List.of(done));

        assertEquals(List.of(recent, old), service.listAlerts(IntegrityDomain.BENEFICIARY, null, "OPEN", null, null, null, null));
        assertEquals(List.of(done), service.listAlerts(IntegrityDomain.BENEFICIARY, null, "RESOLVED", null, null, null, null));
        assertEquals(List.of(old), service.listAlerts(IntegrityDomain.BENEFICIARY, "802", "OPEN", null, null, null, null));
        assertEquals(List.of(recent, payroll, old), service.listAlerts(null, null, "OPEN", null, null, null, null), "no domain: both domains, same status filter");
    }

    @Test
    void payrollInboxFiltersByPayPeriod() {
        IntegrityAlert inRange = alert("S01", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2024, 8, 15, 0, 0));
        inRange.setEvidence(Map.of("overlapStart", "2024-08-01", "overlapEnd", "2024-08-31"));
        IntegrityAlert outOfRange = alert("S05", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2024, 3, 1, 0, 0));
        outOfRange.setEvidence(Map.of("overlapStart", "2024-02-01", "overlapEnd", "2024-02-28"));
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.PAYROLL, "OPEN")).thenReturn(List.of(inRange, outOfRange));

        assertEquals(List.of(inRange), service.listAlerts(
                IntegrityDomain.PAYROLL, null, "OPEN", null, null, null, null, null,
                java.time.LocalDate.of(2024, 6, 1), java.time.LocalDate.of(2024, 9, 30)));
    }

    @Test
    void payrollPeriodFilterKeepsAlertsThatHaveNoPaySpan() {
        IntegrityAlert overlap = alert("S01", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2026, 7, 12, 0, 0));
        overlap.setEvidence(Map.of("overlapStart", "2024-07-01", "overlapEnd", "2024-07-31"));
        IntegrityAlert pensionCheck = alert("S06", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2026, 8, 1, 0, 0));
        pensionCheck.setEvidence(Map.of("reasons", List.of("LIFE_CERTIFICATE_OVERDUE")));
        IntegrityAlert otherYear = alert("S01", IntegrityDomain.PAYROLL, "OPEN", LocalDateTime.of(2026, 7, 13, 0, 0));
        otherYear.setEvidence(Map.of("overlapStart", "2025-07-01", "overlapEnd", "2025-07-31"));
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.PAYROLL, "OPEN"))
                .thenReturn(List.of(overlap, pensionCheck, otherYear));

        assertEquals(List.of(pensionCheck, overlap), service.listAlerts(
                IntegrityDomain.PAYROLL, null, "OPEN", null, null, null, null, null,
                java.time.LocalDate.of(2024, 4, 1), java.time.LocalDate.of(2025, 3, 31)));
    }

    @Test
    void payrollResolvedInboxExcludesRecoveryCases() {
        UUID recoveryCase = UUID.randomUUID();
        UUID plainCase = UUID.randomUUID();
        IntegrityAlert withRecovery = alert("S01", IntegrityDomain.PAYROLL, "RESOLVED", LocalDateTime.of(2026, 3, 1, 0, 0));
        withRecovery.setCaseId(recoveryCase);
        IntegrityAlert dismissed = alert("S05", IntegrityDomain.PAYROLL, "RESOLVED", LocalDateTime.of(2026, 4, 1, 0, 0));
        dismissed.setCaseId(plainCase);
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.PAYROLL, "RESOLVED")).thenReturn(List.of(withRecovery, dismissed));
        IntegrityAction recovery = new IntegrityAction();
        recovery.setCaseId(recoveryCase);
        recovery.setActionType(ActionType.RECOVERY_RECORD);
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of(recovery));

        assertEquals(List.of(dismissed), service.listAlerts(
                IntegrityDomain.PAYROLL, null, "RESOLVED", null, null, null, null));
    }

    @Test
    void recoveriesInboxShowsOnlyAlertsWhoseCaseHasARecovery() {
        IntegrityAlert recovered = alert("802", IntegrityDomain.BENEFICIARY, "RESOLVED", LocalDateTime.of(2026, 3, 1, 0, 0));
        recovered.setCaseId(caseId);
        IntegrityAlert other = alert("801", IntegrityDomain.BENEFICIARY, "RESOLVED", LocalDateTime.of(2026, 4, 1, 0, 0));
        other.setCaseId(UUID.randomUUID());
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.BENEFICIARY, "RESOLVED")).thenReturn(List.of(recovered, other));
        IntegrityAction recovery = new IntegrityAction();
        recovery.setCaseId(caseId);
        recovery.setActionType(ActionType.RECOVERY_RECORD);
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenReturn(List.of(recovery));

        assertEquals(List.of(recovered), service.listAlerts(
                IntegrityDomain.BENEFICIARY, null, "RESOLVED", null, null, null, null, ActionType.RECOVERY_RECORD));
    }

    private static IntegrityAlert alert(String rule, IntegrityDomain domain, String status, LocalDateTime detected) {
        IntegrityAlert a = new IntegrityAlert();
        a.setRuleCode(rule);
        a.setDomain(domain);
        a.setStatus(status);
        a.setDetectedAt(detected);
        a.setAmountDelta(BigDecimal.ONE);
        return a;
    }

    @Test
    void aCaseWithARecordedOutcomeCanBeVerifiedClosedWithANote() {
        theCase.setStatus(CaseStatus.ACTION_RECORDED);
        IntegrityCase c = service.verifyClosed(caseId, "  Checked the register: master record corrected  ", deptAdmin);
        assertEquals(CaseStatus.CLOSED, c.getStatus());
        assertNotNull(c.getVerifiedAt());
        assertEquals("sub-dept-admin", c.getVerifiedBy());
        assertEquals("Checked the register: master record corrected", c.getVerificationNote());
        assertTrue(audit.stream().anyMatch(a -> "VERIFIED_CLOSED".equals(a.getAction())));
    }

    @Test
    void verifyingNeedsAnOutcomeANoteAndHappensOnce() {
        assertEquals(HttpStatus.CONFLICT, refused(() -> service.verifyClosed(caseId, "ok", deptAdmin)).getStatusCode());   // still open
        theCase.setStatus(CaseStatus.ACTION_RECORDED);
        assertEquals(HttpStatus.BAD_REQUEST, refused(() -> service.verifyClosed(caseId, " ", deptAdmin)).getStatusCode());
        service.verifyClosed(caseId, "done", deptAdmin);
        assertEquals(HttpStatus.CONFLICT, refused(() -> service.verifyClosed(caseId, "again", deptAdmin)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, refused(() -> service.verifyClosed(UUID.randomUUID(), "x", deptAdmin)).getStatusCode());
    }

    @Test
    void aDismissedCaseHasNothingToVerify() {
        theCase.setStatus(CaseStatus.CLOSED);
        assertEquals(HttpStatus.CONFLICT, refused(() -> service.verifyClosed(caseId, "x", deptAdmin)).getStatusCode());
    }
}
