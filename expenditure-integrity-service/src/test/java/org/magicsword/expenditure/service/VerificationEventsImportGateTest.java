package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.*;
import org.magicsword.expenditure.repository.*;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Death loaded through the CSV import is visible to the pre-payment gate immediately. */
class VerificationEventsImportGateTest {

    static final String EVENTS_HEADER = "person_id,event_type,event_date\n";
    static final UUID SCHEME = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");

    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    PaymentBatchRepository batchRepo = mock(PaymentBatchRepository.class);
    PaymentBatchLineRepository lineRepo = mock(PaymentBatchLineRepository.class);
    SchemeGraceConfigRepository graceRepo = mock(SchemeGraceConfigRepository.class);
    MutualExclusionSchemePairRepository pairRepo = mock(MutualExclusionSchemePairRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);

    List<VerificationEvent> eventStore = new ArrayList<>();
    List<EntitlementUnit> units = new ArrayList<>();
    List<PaymentSettlement> paid = new ArrayList<>();
    List<PaymentBatchLine> gateLines = new ArrayList<>();

    ImportService importService;
    PaymentGateService gate;

    @BeforeEach
    void setUp() {
        eventStore.clear();
        units.clear();
        paid.clear();
        gateLines.clear();

        VerifiedEventRiskService risk = new VerifiedEventRiskService(unitRepo, paymentRepo, graceRepo);
        ReflectionTestUtils.setField(risk, "defaultGraceDays", 30);
        importService = new ImportService(unitRepo, paymentRepo, employeeRepo, changeLogRepo, eventRepo, risk);
        gate = new PaymentGateService(batchRepo, lineRepo, unitRepo, paymentRepo, eventRepo, graceRepo, pairRepo, alertRepo);
        ReflectionTestUtils.setField(gate, "defaultGraceDays", 30);
        ReflectionTestUtils.setField(gate, "bankClusterMin", 4);

        when(eventRepo.saveAll(any())).thenAnswer(i -> {
            List<VerificationEvent> batch = i.getArgument(0);
            eventStore.addAll(batch);
            return batch;
        });
        when(eventRepo.existsByPersonIdAndEventTypeAndEventDate(any(), any(), any())).thenAnswer(i ->
                eventStore.stream().anyMatch(e -> e.getPersonId().equals(i.getArgument(0))
                        && e.getEventType().equals(i.getArgument(1))
                        && e.getEventDate().equals(i.getArgument(2))));
        when(eventRepo.findByPersonIdIn(any())).thenAnswer(i -> {
            Collection<String> ids = i.getArgument(0);
            return eventStore.stream().filter(e -> ids.contains(e.getPersonId())).toList();
        });
        when(unitRepo.findAllById(any())).thenAnswer(i -> units);
        when(unitRepo.findByPersonIdIn(any())).thenAnswer(i -> units);
        when(unitRepo.findByPersonId(any())).thenAnswer(i -> units.stream().filter(u -> u.getPersonId().equals(i.getArgument(0))).toList());
        when(unitRepo.findById(any())).thenAnswer(i -> units.stream().filter(u -> u.getId().equals(i.getArgument(0))).findFirst());
        when(paymentRepo.findByUnitIdIn(any())).thenAnswer(i -> paid);
        when(paymentRepo.findByUnitId(any())).thenAnswer(i -> paid.stream().filter(p -> p.getUnitId().equals(i.getArgument(0))).toList());
        when(graceRepo.findBySchemeId(any())).thenReturn(Optional.empty());
        when(pairRepo.findAll()).thenReturn(List.of());
        when(alertRepo.findByDomainAndStatus(IntegrityDomain.BENEFICIARY, "OPEN")).thenReturn(List.of());
        when(batchRepo.save(any())).thenAnswer(i -> {
            PaymentBatch b = i.getArgument(0);
            b.setId(UUID.randomUUID());
            return b;
        });
        when(lineRepo.saveAll(any())).thenAnswer(i -> {
            gateLines.addAll(i.getArgument(0));
            return i.getArgument(0);
        });
    }

    @Test
    void paymentAfterFreshlyImportedDeathIsHeld() throws Exception {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(UUID.randomUUID());
        u.setPersonId("P1");
        u.setSchemeId(SCHEME);
        u.setStatus("ACTIVE");
        u.setAuthorizedAmount(new BigDecimal("12000"));
        u.setPeriodStart(LocalDate.of(2026, 1, 1));
        u.setPeriodEnd(LocalDate.of(2026, 12, 31));
        units.add(u);

        PaymentSettlement prior = new PaymentSettlement();
        prior.setId(UUID.randomUUID());
        prior.setUnitId(u.getId());
        prior.setStatus("SETTLED");
        prior.setAmount(new BigDecimal("500"));
        prior.setPeriodStart(LocalDate.of(2026, 1, 1));
        prior.setPeriodEnd(LocalDate.of(2026, 4, 30));
        paid.add(prior);

        importService.importVerificationEventsCsv(new ByteArrayInputStream(
                (EVENTS_HEADER + "P1,DEATH,2026-03-01\n").getBytes()));
        assertEquals(1, eventStore.size());
        LocalDateTime loaded = eventStore.get(0).getCreatedAt();
        assertNotNull(loaded);
        assertTrue(ChronoUnit.MINUTES.between(loaded, LocalDateTime.now()) < 2);

        String csv = "payment_ref,unit_id,period_start,period_end,amount,bank_token\n"
                + "R1," + u.getId() + ",2026-04-01,2026-04-30,500,ACC-1\n";
        gate.screen("test", new ByteArrayInputStream(csv.getBytes()), "tester");

        assertEquals("HOLD", gateLines.get(0).getVerdict());
        Set<String> codes = new TreeSet<>();
        gateLines.get(0).getReasons().forEach(r -> codes.add((String) r.get("code")));
        assertTrue(codes.contains("AFTER_VERIFIED_EVENT"));
    }
}
