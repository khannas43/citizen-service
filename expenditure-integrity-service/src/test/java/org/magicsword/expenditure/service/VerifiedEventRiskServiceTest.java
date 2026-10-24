package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.PaymentSettlement;
import org.magicsword.expenditure.entity.SchemeGraceConfig;
import org.magicsword.expenditure.entity.VerificationEvent;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.PaymentSettlementRepository;
import org.magicsword.expenditure.repository.SchemeGraceConfigRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class VerifiedEventRiskServiceTest {

    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    SchemeGraceConfigRepository graceRepo = mock(SchemeGraceConfigRepository.class);
    VerifiedEventRiskService service;

    static final UUID SCHEME = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");

    @BeforeEach
    void setUp() {
        service = new VerifiedEventRiskService(unitRepo, paymentRepo, graceRepo);
        ReflectionTestUtils.setField(service, "defaultGraceDays", 30);
    }

    EntitlementUnit activeUnit(String person) {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(UUID.randomUUID());
        u.setPersonId(person);
        u.setSchemeId(SCHEME);
        u.setStatus("ACTIVE");
        return u;
    }

    PaymentSettlement settled(UUID unitId, LocalDate periodEnd) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(unitId);
        p.setStatus("SETTLED");
        p.setAmount(new BigDecimal("100"));
        p.setPeriodEnd(periodEnd);
        return p;
    }

    VerificationEvent death(String person, LocalDate date) {
        VerificationEvent ev = new VerificationEvent();
        ev.setPersonId(person);
        ev.setEventType("DEATH");
        ev.setEventDate(date);
        return ev;
    }

    @Test
    void countsPersonWhenSettledPaymentEndsAfterGrace() {
        EntitlementUnit u = activeUnit("P1");
        when(unitRepo.findByPersonId("P1")).thenReturn(List.of(u));
        when(paymentRepo.findByUnitId(u.getId())).thenReturn(List.of(
                settled(u.getId(), LocalDate.of(2026, 4, 15))));
        when(graceRepo.findBySchemeId(SCHEME)).thenReturn(Optional.empty());
        assertEquals(1, service.countPeopleAtRisk(List.of(death("P1", LocalDate.of(2026, 3, 1)))));
    }

    @Test
    void doesNotCountWhenPaymentEndsWithinGrace() {
        EntitlementUnit u = activeUnit("P1");
        when(unitRepo.findByPersonId("P1")).thenReturn(List.of(u));
        when(paymentRepo.findByUnitId(u.getId())).thenReturn(List.of(
                settled(u.getId(), LocalDate.of(2026, 3, 20))));
        assertEquals(0, service.countPeopleAtRisk(List.of(death("P1", LocalDate.of(2026, 3, 1)))));
    }

    @Test
    void usesSchemeGraceWhenConfigured() {
        EntitlementUnit u = activeUnit("P1");
        SchemeGraceConfig cfg = new SchemeGraceConfig();
        cfg.setGraceDaysAfterTermination(5);
        when(unitRepo.findByPersonId("P1")).thenReturn(List.of(u));
        when(graceRepo.findBySchemeId(SCHEME)).thenReturn(Optional.of(cfg));
        when(paymentRepo.findByUnitId(u.getId())).thenReturn(List.of(
                settled(u.getId(), LocalDate.of(2026, 3, 10))));
        assertEquals(1, service.countPeopleAtRisk(List.of(death("P1", LocalDate.of(2026, 3, 1)))));
    }

    @Test
    void twoEventsSamePersonAreCountedOnce() {
        EntitlementUnit u = activeUnit("P1");
        when(unitRepo.findByPersonId("P1")).thenReturn(List.of(u));
        when(paymentRepo.findByUnitId(u.getId())).thenReturn(List.of(
                settled(u.getId(), LocalDate.of(2026, 5, 1))));
        assertEquals(1, service.countPeopleAtRisk(List.of(
                death("P1", LocalDate.of(2026, 3, 1)),
                death("P1", LocalDate.of(2026, 2, 1)))));
    }

    @Test
    void inactiveUnitDoesNotCount() {
        EntitlementUnit u = activeUnit("P1");
        u.setStatus("CLOSED");
        when(unitRepo.findByPersonId("P1")).thenReturn(List.of(u));
        assertEquals(0, service.countPeopleAtRisk(List.of(death("P1", LocalDate.of(2026, 3, 1)))));
        verify(paymentRepo, never()).findByUnitId(any());
    }
}
