package org.citizen.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.entity.VerificationEvent;
import org.citizen.expenditure.repository.EmployeeIdentityRepository;
import org.citizen.expenditure.repository.EntitlementUnitRepository;
import org.citizen.expenditure.repository.MasterChangeLogRepository;
import org.citizen.expenditure.repository.PaymentSettlementRepository;
import org.citizen.expenditure.repository.VerificationEventRepository;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class VerificationEventsImportTest {

    static final String HEADER = "person_id,event_type,event_date,source,confidence,family_id\n";

    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    VerifiedEventRiskService verifiedEventRisk = mock(VerifiedEventRiskService.class);
    ImportService service;

    List<VerificationEvent> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        saved.clear();
        service = new ImportService(unitRepo, paymentRepo, employeeRepo, changeLogRepo, eventRepo, verifiedEventRisk);
        when(eventRepo.saveAll(any())).thenAnswer(i -> {
            List<VerificationEvent> batch = i.getArgument(0);
            saved.addAll(batch);
            return batch;
        });
        when(eventRepo.existsByPersonIdAndEventTypeAndEventDate(any(), any(), any())).thenAnswer(i ->
                saved.stream().anyMatch(e -> e.getPersonId().equals(i.getArgument(0))
                        && e.getEventType().equals(i.getArgument(1))
                        && e.getEventDate().equals(i.getArgument(2))));
        when(verifiedEventRisk.countPeopleAtRisk(any())).thenReturn(2);
    }

    static ByteArrayInputStream csv(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    List<VerificationEvent> captured() {
        ArgumentCaptor<List<VerificationEvent>> c = ArgumentCaptor.forClass(List.class);
        verify(eventRepo).saveAll(c.capture());
        return c.getValue();
    }

    @Test
    void loadsDeathAndStatusEventsWithDefaults() throws IOException {
        var result = service.importVerificationEventsCsv(csv(HEADER
                + "P1,DEATH,2026-03-01,Registrar,HIGH,fam-1\n"
                + "P2,STATUS_TERMINATION,2026-02-15,,,\n"));
        assertEquals(2, result.imported());
        assertEquals(0, result.skipped());
        assertEquals(2, result.newlyAtRisk());
        VerificationEvent first = captured().get(0);
        assertEquals("P1", first.getPersonId());
        assertEquals("DEATH", first.getEventType());
        assertEquals(LocalDate.of(2026, 3, 1), first.getEventDate());
        assertEquals("Registrar", first.getSource());
        assertEquals("HIGH", first.getConfidence());
        assertEquals("fam-1", first.getFamilyId());
        assertNotNull(first.getCreatedAt());
        VerificationEvent second = captured().get(1);
        assertEquals("MEDIUM", second.getConfidence());
    }

    @Test
    void badEventTypeIsRefusedAndNothingIsSaved() {
        CsvImportException e = assertThrows(CsvImportException.class, () ->
                service.importVerificationEventsCsv(csv(HEADER + "P1,RETIRED,2026-03-01,\n")));
        assertTrue(e.getMessage().contains("event_type"));
        verify(eventRepo, never()).saveAll(any());
    }

    @Test
    void badDateAndFutureDateAreRefused() {
        assertTrue(assertThrows(CsvImportException.class, () ->
                service.importVerificationEventsCsv(csv(HEADER + "P1,DEATH,01/03/2026,\n"))).getMessage().contains("YYYY-MM-DD"));
        assertTrue(assertThrows(CsvImportException.class, () ->
                service.importVerificationEventsCsv(csv(HEADER + "P1,DEATH," + LocalDate.now().plusDays(1) + ",\n")))
                .getMessage().contains("in the future"));
        verify(eventRepo, never()).saveAll(any());
    }

    @Test
    void duplicatePersonTypeAndDateIsSkipped() throws IOException {
        when(eventRepo.existsByPersonIdAndEventTypeAndEventDate("P1", "DEATH", LocalDate.of(2026, 3, 1))).thenReturn(true);
        var result = service.importVerificationEventsCsv(csv(HEADER
                + "P1,DEATH,2026-03-01,\n"
                + "P1,DEATH,2026-03-01,\n"
                + "P2,DEATH,2026-03-01,\n"));
        assertEquals(1, result.imported());
        assertEquals(2, result.skipped());
        verify(verifiedEventRisk).countPeopleAtRisk(any());
    }

    @Test
    void oneBadRowRefusesTheWholeFile() {
        String good = "P1,DEATH,2026-03-01,\n";
        CsvImportException e = assertThrows(CsvImportException.class, () ->
                service.importVerificationEventsCsv(csv(HEADER + good + "P2,DEATH,not-a-date,\n")));
        assertEquals(3, e.getLine());
        verify(eventRepo, never()).saveAll(any());
    }

    @Test
    void emptyImportDoesNotCallRiskCount() throws IOException {
        var result = service.importVerificationEventsCsv(csv(HEADER));
        assertEquals(0, result.imported());
        assertEquals(0, result.newlyAtRisk());
        verify(verifiedEventRisk, never()).countPeopleAtRisk(any());
    }
}
