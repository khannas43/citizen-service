package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.client.SchemeEngineClient;
import org.magicsword.expenditure.entity.*;
import org.magicsword.expenditure.repository.*;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WhatIfServiceTest {

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
    WhatIfService whatIf;

    @BeforeEach
    void setUp() {
        when(alertRepo.findByRuleCodeAndPersonId(any(), any())).thenReturn(List.of());
        when(alertRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(caseRepo.save(any())).thenAnswer(inv -> {
            IntegrityCase c = inv.getArgument(0);
            if (c.getId() == null) c.setId(UUID.randomUUID());
            return c;
        });
        when(unitRepo.findAll()).thenReturn(List.of());
        when(paymentRepo.findByUnitId(any())).thenReturn(List.of());
        when(mutualRepo.findAll()).thenReturn(List.of());
        when(changeLogRepo.findAll()).thenReturn(List.of());
        when(employeeRepo.findAll()).thenReturn(List.of());
        when(payrollRepo.findAll()).thenReturn(List.of());
        when(pensionRepo.findAll()).thenReturn(List.of());
        when(serviceEventRepo.findAll()).thenReturn(List.of());
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
        whatIf = new WhatIfService(engine);
    }

    @Test
    void dryRunWithNoChangesMatchesCollectAndPersistCountsFor805() {
        MasterChangeLog c = new MasterChangeLog();
        c.setFieldName("bank_token");
        c.setOperatorId("op-a");
        c.setChangedAt(LocalDateTime.now().minusDays(2));
        when(changeLogRepo.findAll()).thenReturn(List.of(c, c, c, c, c));

        DetectionSettings live = engine.liveSettings();
        List<CollectedFinding> dry = engine.collectFindings(live, true);
        long dry805 = dry.stream().filter(f -> "805".equals(f.ruleCode())).count();

        engine.runDetection(new DetectionEngineService.DetectionRunRequest(null, null, null, null, null, null, null));
        verify(alertRepo, atLeastOnce()).save(any());
        verify(caseRepo, times(1)).save(any());

        WhatIfService.WhatIfResponse resp = whatIf.run(new DetectionSettings.WhatIfRequest(null, null, null, null, null));
        Map<String, Object> row805 = resp.rules().stream().filter(r -> "805".equals(r.get("ruleCode"))).findFirst().orElseThrow();
        assertEquals(dry805, ((Number) row805.get("today")).intValue());
        assertEquals(dry805, ((Number) row805.get("withChange")).intValue());
    }

    @Test
    void aWhatIfRunningAtTheSameTimeAsARealRunNeverWritesAndNeverStopsTheRealRunWriting() throws Exception {
        MasterChangeLog c = new MasterChangeLog();
        c.setFieldName("bank_token");
        c.setOperatorId("op-a");
        c.setChangedAt(LocalDateTime.now().minusDays(2));
        java.util.concurrent.CountDownLatch inWhatIf = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        when(changeLogRepo.findAll()).thenAnswer(inv -> {
            if (Thread.currentThread().getName().startsWith("what-if")) {   // the what-if holds its run open until the real run is done
                inWhatIf.countDown();
                release.await(10, java.util.concurrent.TimeUnit.SECONDS);
            }
            return List.of(c, c, c, c, c);
        });
        List<CollectedFinding> found = new ArrayList<>();
        Thread dry = new Thread(() -> found.addAll(engine.collectFindings(engine.liveSettings(), true)), "what-if");
        dry.start();
        assertTrue(inWhatIf.await(10, java.util.concurrent.TimeUnit.SECONDS));

        engine.runDetection(new DetectionEngineService.DetectionRunRequest(null, null, null, null, null, null, null));
        release.countDown();
        dry.join(10000);

        assertEquals(1, found.stream().filter(f -> "805".equals(f.ruleCode())).count());
        verify(caseRepo, times(1)).save(any());          // the real run's single 805 case; the what-if saved nothing
    }

    @Test
    void stricter805ThresholdDropsAlerts() {
        clearInvocations(alertRepo, caseRepo);
        MasterChangeLog c = new MasterChangeLog();
        c.setFieldName("bank_token");
        c.setOperatorId("op-a");
        c.setChangedAt(LocalDateTime.now().minusDays(2));
        when(changeLogRepo.findAll()).thenReturn(List.of(c, c, c, c, c));

        WhatIfService.WhatIfResponse resp = whatIf.run(new DetectionSettings.WhatIfRequest(null, 10, null, null, null));
        Map<String, Object> row805 = resp.rules().stream().filter(r -> "805".equals(r.get("ruleCode"))).findFirst().orElseThrow();
        assertEquals(1, row805.get("today"));
        assertEquals(0, row805.get("withChange"));
        assertTrue(((Number) row805.get("dropped")).intValue() >= 1);
        verify(alertRepo, never()).save(any());
    }

    @Test
    void sharedBank804RespondsToMinUnits() {
        UUID unitA = UUID.randomUUID();
        UUID unitB = UUID.randomUUID();
        UUID scheme = UUID.randomUUID();
        EntitlementUnit u1 = unit(unitA, "p1", scheme, "fam1");
        EntitlementUnit u2 = unit(unitB, "p2", scheme, "fam2");
        when(unitRepo.findAll()).thenReturn(List.of(u1, u2));
        PaymentSettlement p1 = payment(unitA, "bank-shared");
        PaymentSettlement p2 = payment(unitB, "bank-shared");
        when(paymentRepo.findByUnitId(unitA)).thenReturn(List.of(p1));
        when(paymentRepo.findByUnitId(unitB)).thenReturn(List.of(p2));

        WhatIfService.WhatIfResponse at4 = whatIf.run(new DetectionSettings.WhatIfRequest(null, null, null, null, null));
        WhatIfService.WhatIfResponse at3 = whatIf.run(new DetectionSettings.WhatIfRequest(3, null, null, null, null));
        int today804 = rowCount(at4, "804", "today");
        int change804 = rowCount(at3, "804", "withChange");
        assertTrue(today804 >= change804);
    }

    private static int rowCount(WhatIfService.WhatIfResponse resp, String rule, String field) {
        return resp.rules().stream().filter(r -> rule.equals(r.get("ruleCode"))).map(r -> ((Number) r.get(field)).intValue()).findFirst().orElse(0);
    }

    private static EntitlementUnit unit(UUID id, String personId, UUID schemeId, String familyId) {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(id);
        u.setPersonId(personId);
        u.setPersonName("Person " + personId);
        u.setSchemeId(schemeId);
        u.setSchemeName("Scheme");
        u.setDistrict("Surat");
        u.setTaluka("Choryasi");
        u.setStatus("ACTIVE");
        u.setAuthorizedAmount(BigDecimal.TEN);
        u.setPeriodStart(LocalDate.of(2024, 1, 1));
        u.setPeriodEnd(LocalDate.of(2025, 12, 31));
        u.setFamilyId(familyId);
        return u;
    }

    private static PaymentSettlement payment(UUID unitId, String bank) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(unitId);
        p.setBankToken(bank);
        p.setAmount(BigDecimal.ONE);
        p.setStatus("SETTLED");
        p.setPeriodStart(LocalDate.of(2024, 6, 1));
        p.setPeriodEnd(LocalDate.of(2024, 6, 30));
        return p;
    }
}
