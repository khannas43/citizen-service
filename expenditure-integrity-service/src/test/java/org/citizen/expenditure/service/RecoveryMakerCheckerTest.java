package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.ActionStatus;
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
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RecoveryMakerCheckerTest {

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
    org.citizen.expenditure.client.FamilyRegistryClient familyRegistry =
            mock(org.citizen.expenditure.client.FamilyRegistryClient.class);

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

    @BeforeEach
    void setUp() {
        service = new IntegrityCaseService(caseRepo, alertRepo, actionRepo, auditRepo, paymentRepo, unitRepo,
                changeLogRepo, eventRepo, employeeRepo, displayNames, familyRegistry);
        ReflectionTestUtils.setField(service, "recoveryApprovalThreshold", new BigDecimal("100000"));
        ReflectionTestUtils.setField(service, "verifyNeedsSecondPerson", false);

        theCase = new IntegrityCase();
        theCase.setId(caseId);
        theCase.setDomain(IntegrityDomain.BENEFICIARY);
        theCase.setStatus(CaseStatus.OPEN);
        theCase.setClassification(CaseClassification.CONFIRMED_OVERPAYMENT);
        theAlert = new IntegrityAlert();
        theAlert.setId(UUID.randomUUID());
        theAlert.setCaseId(caseId);
        theAlert.setStatus("OPEN");

        when(caseRepo.findById(caseId)).thenReturn(Optional.of(theCase));
        when(caseRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        when(alertRepo.findByCaseId(caseId)).thenReturn(List.of(theAlert));
        when(alertRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        when(actionRepo.save(any())).thenAnswer(i -> {
            IntegrityAction a = i.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            actions.add(a);
            return a;
        });
        when(actionRepo.findById(any())).thenAnswer(i -> actions.stream().filter(a -> a.getId().equals(i.getArgument(0))).findFirst());
        when(actionRepo.findByCaseIdOrderByCreatedAtDesc(caseId)).thenAnswer(i -> actions.stream()
                .sorted(Comparator.comparing(IntegrityAction::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))).toList());
        when(actionRepo.findByActionType(ActionType.RECOVERY_RECORD)).thenAnswer(i -> actions.stream()
                .filter(a -> a.getActionType() == ActionType.RECOVERY_RECORD).toList());
        when(auditRepo.save(any())).thenAnswer(i -> {
            audit.add(i.getArgument(0));
            return i.getArgument(0);
        });
    }

    @Test
    void belowThresholdBehavesAsImmediateRecovery() {
        IntegrityAction a = service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 50000),
                officer("maker", "DEPT_ADMIN"));
        assertEquals(ActionStatus.APPROVED, a.getActionStatus());
        assertEquals(CaseStatus.ACTION_RECORDED, theCase.getStatus());
        assertEquals("RESOLVED", theAlert.getStatus());
        assertEquals("ACTION_RECOVERY_RECORD", audit.get(audit.size() - 1).getAction());
    }

    @Test
    void aboveThresholdStaysPendingUntilApproved() {
        Jwt maker = officer("maker", "DEPT_ADMIN");
        IntegrityAction pending = service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 150000), maker);
        assertEquals(ActionStatus.PENDING, pending.getActionStatus());
        assertEquals(CaseStatus.OPEN, theCase.getStatus());
        assertEquals("OPEN", theAlert.getStatus());
        assertEquals("RECOVERY_REQUESTED", audit.get(audit.size() - 1).getAction());

        ResponseStatusException same = assertThrows(ResponseStatusException.class,
                () -> service.approveRecovery(caseId, pending.getId(), maker));
        assertEquals(HttpStatus.CONFLICT, same.getStatusCode());

        Jwt checker = officer("checker", "FINANCE_OFFICER");
        IntegrityAction approved = service.approveRecovery(caseId, pending.getId(), checker);
        assertEquals(ActionStatus.APPROVED, approved.getActionStatus());
        assertEquals(CaseStatus.ACTION_RECORDED, theCase.getStatus());
        assertEquals("RESOLVED", theAlert.getStatus());
        assertEquals("RECOVERY_APPROVED", audit.get(audit.size() - 1).getAction());
    }

    @Test
    void rejectRequiresReasonAndDoesNotResolve() {
        Jwt maker = officer("maker", "DEPT_ADMIN");
        IntegrityAction pending = service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 200000), maker);
        assertThrows(ResponseStatusException.class,
                () -> service.rejectRecovery(caseId, pending.getId(), "  ", officer("checker", "DEPT_ADMIN")));
        IntegrityAction rejected = service.rejectRecovery(caseId, pending.getId(), "Not justified", officer("checker", "DEPT_ADMIN"));
        assertEquals(ActionStatus.REJECTED, rejected.getActionStatus());
        assertEquals("OPEN", theAlert.getStatus());
        assertEquals("RECOVERY_REJECTED", audit.get(audit.size() - 1).getAction());
    }

    @Test
    void metricsIgnorePendingRecoveries() {
        service.recordAction(caseId, ActionType.RECOVERY_RECORD, Map.of("amount", 250000), officer("maker", "DEPT_ADMIN"));
        AcceptanceMetricsService metrics = new AcceptanceMetricsService(caseRepo, alertRepo, actionRepo);
        when(caseRepo.findAll()).thenReturn(List.of(theCase));
        when(alertRepo.findAll()).thenReturn(List.of(theAlert));
        when(actionRepo.findAll()).thenReturn(actions);
        assertEquals(0L, metrics.metrics().get("recoveryActionsRecorded"));
    }
}
