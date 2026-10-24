package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.*;
import org.magicsword.expenditure.repository.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PaymentGateServiceTest {

    PaymentBatchRepository batchRepo = mock(PaymentBatchRepository.class);
    PaymentBatchLineRepository lineRepo = mock(PaymentBatchLineRepository.class);
    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    SchemeGraceConfigRepository graceRepo = mock(SchemeGraceConfigRepository.class);
    MutualExclusionSchemePairRepository pairRepo = mock(MutualExclusionSchemePairRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    PaymentGateService gate;

    List<EntitlementUnit> units = new ArrayList<>();
    List<PaymentSettlement> paid = new ArrayList<>();
    List<VerificationEvent> events = new ArrayList<>();
    List<MutualExclusionSchemePair> pairs = new ArrayList<>();
    List<IntegrityAlert> alerts = new ArrayList<>();
    List<PaymentBatchLine> saved = new ArrayList<>();

    static final UUID SCHEME_A = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    static final UUID SCHEME_B = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000002");

    @BeforeEach
    void setUp() {
        gate = new PaymentGateService(batchRepo, lineRepo, unitRepo, paymentRepo, eventRepo, graceRepo, pairRepo, alertRepo);
        ReflectionTestUtils.setField(gate, "defaultGraceDays", 30);
        ReflectionTestUtils.setField(gate, "bankClusterMin", 4);
        when(unitRepo.findAllById(any())).thenAnswer(i -> units);
        when(unitRepo.findByPersonIdIn(any())).thenAnswer(i -> units);
        when(unitRepo.findById(any())).thenAnswer(i -> units.stream().filter(u -> u.getId().equals(i.getArgument(0))).findFirst());
        when(paymentRepo.findByUnitIdIn(any())).thenAnswer(i -> paid);
        when(paymentRepo.findAll()).thenAnswer(i -> paid);
        when(paymentRepo.findByBankTokenIn(any())).thenAnswer(i -> paid);
        when(eventRepo.findByPersonIdIn(any())).thenAnswer(i -> events);
        when(graceRepo.findBySchemeId(any())).thenReturn(Optional.empty());
        when(pairRepo.findAll()).thenAnswer(i -> pairs);
        when(alertRepo.findByDomainAndStatus(any(), any())).thenAnswer(i -> alerts);
        when(batchRepo.save(any())).thenAnswer(i -> { PaymentBatch b = i.getArgument(0); b.setId(UUID.randomUUID()); return b; });
        when(lineRepo.saveAll(any())).thenAnswer(i -> { saved.addAll(i.getArgument(0)); return i.getArgument(0); });
    }

    EntitlementUnit unit(String person, UUID scheme, String amount, String start, String end) {
        EntitlementUnit u = new EntitlementUnit();
        u.setId(UUID.randomUUID());
        u.setPersonId(person);
        u.setPersonName(person);
        u.setSchemeId(scheme);
        u.setSchemeName("Scheme " + scheme.toString().substring(31));
        u.setAuthorizedAmount(new BigDecimal(amount));
        u.setPeriodStart(LocalDate.parse(start));
        u.setPeriodEnd(LocalDate.parse(end));
        units.add(u);
        return u;
    }

    PaymentSettlement settlement(EntitlementUnit u, String amount, String start, String end) {
        PaymentSettlement p = new PaymentSettlement();
        p.setId(UUID.randomUUID());
        p.setUnitId(u.getId());
        p.setAmount(new BigDecimal(amount));
        p.setPeriodStart(LocalDate.parse(start));
        p.setPeriodEnd(LocalDate.parse(end));
        paid.add(p);
        return p;
    }

    void screen(String... csvLines) throws Exception {
        String csv = "payment_ref,unit_id,period_start,period_end,amount,bank_token\n" + String.join("\n", csvLines) + "\n";
        saved.clear();
        gate.screen("test", new ByteArrayInputStream(csv.getBytes()), "tester");
    }

    String line(String ref, EntitlementUnit u, String start, String end, String amount) {
        return ref + "," + u.getId() + "," + start + "," + end + "," + amount + ",ACC-1";
    }

    Set<String> codes(int index) {
        Set<String> out = new TreeSet<>();
        saved.get(index).getReasons().forEach(r -> out.add((String) r.get("code")));
        return out;
    }

    @Test
    void aPaymentThatBreaksNoRuleIsClear() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        screen(line("R1", u, "2026-01-01", "2026-03-31", "3000"));
        assertEquals("CLEAR", saved.get(0).getVerdict());
        assertTrue(saved.get(0).getReasons().isEmpty());
    }

    @Test
    void anUnknownUnitIsHeld() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        units.clear();
        screen(line("R1", u, "2026-01-01", "2026-03-31", "3000"));
        assertEquals("HOLD", saved.get(0).getVerdict());
        assertTrue(codes(0).contains("UNKNOWN_UNIT"));
    }

    @Test
    void aPeriodAlreadyPaidIsHeld() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        settlement(u, "3000", "2026-01-01", "2026-03-31");
        screen(line("R1", u, "2026-02-01", "2026-04-30", "3000"));
        assertTrue(codes(0).contains("ALREADY_PAID_FOR_PERIOD"));
        assertEquals("HOLD", saved.get(0).getVerdict());
    }

    @Test
    void aReversedPaymentDoesNotCountAsPaid() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        PaymentSettlement original = settlement(u, "3000", "2026-01-01", "2026-03-31");
        PaymentSettlement reversal = settlement(u, "-3000", "2026-01-01", "2026-03-31");
        reversal.setReversalOf(original.getId());
        screen(line("R1", u, "2026-01-01", "2026-03-31", "3000"));
        assertEquals("CLEAR", saved.get(0).getVerdict());
    }

    @Test
    void entitlementIsCountedAcrossLinesInTheSameFile() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "5000", "2026-01-01", "2026-12-31");
        screen(line("R1", u, "2026-01-01", "2026-03-31", "3000"), line("R2", u, "2026-04-01", "2026-06-30", "3000"));
        assertEquals("CLEAR", saved.get(0).getVerdict());
        assertEquals("HOLD", saved.get(1).getVerdict());
        assertTrue(codes(1).contains("OVER_ENTITLEMENT"));
    }

    @Test
    void aPaymentAfterDeathBeyondGraceIsHeldButWithinGraceIsNot() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        VerificationEvent ev = new VerificationEvent();
        ev.setPersonId("P1");
        ev.setEventType("DEATH");
        ev.setEventDate(LocalDate.parse("2026-03-01"));
        events.add(ev);
        screen(line("R1", u, "2026-03-01", "2026-03-20", "500"), line("R2", u, "2026-04-01", "2026-04-30", "500"));
        assertEquals("CLEAR", saved.get(0).getVerdict());
        assertTrue(codes(1).contains("AFTER_VERIFIED_EVENT"));
    }

    @Test
    void onlyTheLaterOfTwoExclusiveSchemesIsHeld() throws Exception {
        EntitlementUnit first = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        EntitlementUnit second = unit("P1", SCHEME_B, "12000", "2026-03-01", "2026-12-31");
        MutualExclusionSchemePair pair = new MutualExclusionSchemePair();
        pair.setSchemeIdA(SCHEME_A);
        pair.setSchemeIdB(SCHEME_B);
        pairs.add(pair);
        first.setStatus("ACTIVE");
        second.setStatus("ACTIVE");
        screen(line("R1", first, "2026-04-01", "2026-04-30", "100"), line("R2", second, "2026-04-01", "2026-04-30", "100"));
        assertEquals("CLEAR", saved.get(0).getVerdict());
        assertTrue(codes(1).contains("MUTUAL_EXCLUSION"));
    }

    @Test
    void aReferenceUsedBeforeOrTwiceInTheFileIsHeld() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        PaymentSettlement p = settlement(u, "100", "2025-01-01", "2025-01-31");
        p.setTransactionRef("OLD-1");
        screen(line("OLD-1", u, "2026-01-01", "2026-01-31", "100"),
                line("NEW-1", u, "2026-02-01", "2026-02-28", "100"),
                line("NEW-1", u, "2026-03-01", "2026-03-31", "100"));
        assertTrue(codes(0).contains("DUPLICATE_REFERENCE"));
        assertEquals("CLEAR", saved.get(1).getVerdict());
        assertTrue(codes(2).contains("DUPLICATE_REFERENCE"));
    }

    @Test
    void anOpenAlertOrMissingBankReferenceOnlyAsksForReview() throws Exception {
        EntitlementUnit u = unit("P1", SCHEME_A, "12000", "2026-01-01", "2026-12-31");
        IntegrityAlert a = new IntegrityAlert();
        a.setRuleCode("806");
        a.setPersonId("P1");
        alerts.add(a);
        screen(u.getId().toString().isEmpty() ? "" : "R1," + u.getId() + ",2026-01-01,2026-01-31,100");
        assertEquals("REVIEW", saved.get(0).getVerdict());
        assertEquals(Set.of("NO_BANK_REFERENCE", "OPEN_ALERT_806"), codes(0));
    }

    @Test
    void aBadFileIsRefusedWholeWithTheLine() {
        String csv = "payment_ref,unit_id,period_start,period_end,amount\nR1,not-an-id,2026-01-01,2026-01-31,100\n";
        CsvImportException e = assertThrows(CsvImportException.class, () -> gate.screen("x", new ByteArrayInputStream(csv.getBytes()), "t"));
        assertTrue(e.getMessage().startsWith("Line 2:"));
        verify(batchRepo, never()).save(any());
    }

    PaymentBatchLine flagged(String verdict, String decision) {
        PaymentBatchLine l = new PaymentBatchLine();
        UUID batch = UUID.randomUUID();
        l.setId(UUID.randomUUID());
        l.setBatchId(batch);
        l.setVerdict(verdict);
        l.setDecision(decision);
        when(lineRepo.findById(l.getId())).thenReturn(Optional.of(l));
        when(lineRepo.save(any())).thenAnswer(i -> i.getArgument(0));
        return l;
    }

    @Test
    void releasingNeedsAReasonAndAConfirmedHoldIsFinal() {
        PaymentBatchLine l = flagged("HOLD", "NONE");
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> gate.decide(l.getBatchId(), l.getId(), "RELEASE", " ", "o")).getStatusCode().value());
        PaymentBatchLine done = gate.decide(l.getBatchId(), l.getId(), "CONFIRM_HOLD", null, "officer");
        assertEquals("HOLD_CONFIRMED", done.getDecision());
        assertEquals("officer", done.getDecidedBy());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> gate.decide(l.getBatchId(), l.getId(), "RELEASE", "ok", "o")).getStatusCode().value());
    }

    @Test
    void aClearLineHasNothingToDecideAndAWrongBatchIsNotFound() {
        PaymentBatchLine clear = flagged("CLEAR", "NONE");
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> gate.decide(clear.getBatchId(), clear.getId(), "RELEASE", "x", "o")).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> gate.decide(UUID.randomUUID(), clear.getId(), "RELEASE", "x", "o")).getStatusCode().value());
    }
}
