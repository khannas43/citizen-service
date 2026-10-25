package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.client.SchemeEngineClient;
import org.citizen.expenditure.entity.EntitlementUnit;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.entity.PaymentSettlement;
import org.citizen.expenditure.repository.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class Detection802Test {

    private EntitlementUnitRepository unitRepo;
    private PaymentSettlementRepository paymentRepo;
    private IntegrityAlertRepository alertRepo;
    private IntegrityCaseRepository caseRepo;
    private DetectionEngineService engine;

    @BeforeEach
    void setUp() {
        unitRepo = mock(EntitlementUnitRepository.class);
        paymentRepo = mock(PaymentSettlementRepository.class);
        alertRepo = mock(IntegrityAlertRepository.class);
        caseRepo = mock(IntegrityCaseRepository.class);

        List<IntegrityCase> cases = new ArrayList<>();
        when(alertRepo.findByRuleCodeAndPersonId(any(), any())).thenReturn(List.of());
        when(alertRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(caseRepo.save(any())).thenAnswer(inv -> {
            IntegrityCase c = inv.getArgument(0);
            if (c.getId() == null) c.setId(UUID.randomUUID());
            cases.add(c);
            return c;
        });

        SchemeEngineClient client = new SchemeEngineClient(WebClient.builder().baseUrl("http://127.0.0.1:1").build());
        PersonDisplayNameService displayNames = mock(PersonDisplayNameService.class);
        when(displayNames.nameForNewAlert(any(), any(), any())).thenAnswer(inv -> inv.getArgument(2));

        engine = new DetectionEngineService(
                unitRepo, paymentRepo,
                mock(VerificationEventRepository.class),
                mock(MasterChangeLogRepository.class),
                mock(MutualExclusionSchemePairRepository.class),
                mock(SchemeGraceConfigRepository.class),
                mock(EmployeeIdentityRepository.class),
                mock(PayrollSettlementRepository.class),
                mock(PensionAuthorisationRepository.class),
                mock(ServiceEventRepository.class),
                alertRepo,
                caseRepo,
                client,
                displayNames);
        ReflectionTestUtils.setField(engine, "defaultGraceDays", 30);
        ReflectionTestUtils.setField(engine, "bankClusterMin", 4);
        ReflectionTestUtils.setField(engine, "operatorChangeThreshold", 5);
    }

    @Test
    void detectsDuplicateSettlementOverEntitlement() {
        UUID unitId = UUID.randomUUID();
        EntitlementUnit unit = new EntitlementUnit();
        unit.setId(unitId);
        unit.setPersonId("p1");
        unit.setPersonName("Meera Rathod");
        unit.setSchemeId(UUID.randomUUID());
        unit.setAuthorizedAmount(new BigDecimal("10000"));
        unit.setDistrict("Banaskantha");

        PaymentSettlement p1 = new PaymentSettlement();
        p1.setAmount(new BigDecimal("10000"));
        p1.setStatus("SETTLED");
        PaymentSettlement p2 = new PaymentSettlement();
        p2.setAmount(new BigDecimal("10000"));
        p2.setStatus("SETTLED");

        when(unitRepo.findAll()).thenReturn(List.of(unit));
        when(paymentRepo.findByUnitId(unitId)).thenReturn(List.of(p1, p2));

        var result = engine.runDetection(new DetectionEngineService.DetectionRunRequest(
                null, null, null, LocalDate.of(2024, 1, 1), LocalDate.of(2025, 12, 31), null, null));

        assertTrue(result.alertsCreated() >= 1, "802 and/or related rules should raise alerts");
        verify(alertRepo, atLeastOnce()).save(any());
    }
}
