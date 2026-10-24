package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.MasterChangeLog;
import org.magicsword.expenditure.entity.PaymentSettlement;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.MasterChangeLogRepository;
import org.magicsword.expenditure.repository.PaymentSettlementRepository;
import org.magicsword.expenditure.repository.VerificationEventRepository;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ImportServiceTest {

    static final String SCHEME = "a1000001-0000-0000-0000-000000000006";
    static final String UNIT = "e1000001-0000-0000-0000-000000000001";
    static final String PENSIONER = "GJ-DEMO-PENSION-01";
    static final String CERTS_HEADER = "employee_code,received_date,reference\n";
    static final String UNITS_HEADER = "id,scheme_id,scheme_name,person_id,person_name,district,authorized_amount,period_start,period_end,family_id\n";
    static final String SETTLEMENTS_HEADER = "unit_id,period_start,period_end,amount,status,bank_token,transaction_ref,reversal_of\n";

    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    PaymentSettlementRepository paymentRepo = mock(PaymentSettlementRepository.class);
    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    MasterChangeLogRepository changeLogRepo = mock(MasterChangeLogRepository.class);
    VerificationEventRepository eventRepo = mock(VerificationEventRepository.class);
    VerifiedEventRiskService verifiedEventRisk = mock(VerifiedEventRiskService.class);
    ImportService service;

    @BeforeEach
    void setUp() {
        service = new ImportService(unitRepo, paymentRepo, employeeRepo, changeLogRepo, eventRepo, verifiedEventRisk);
        when(unitRepo.existsById(UUID.fromString(UNIT))).thenReturn(true);
        when(employeeRepo.findByEmployeeCode(PENSIONER)).thenReturn(java.util.Optional.of(new EmployeeIdentity()));
    }

    static ByteArrayInputStream csv(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    List<EntitlementUnit> savedUnits() {
        ArgumentCaptor<List<EntitlementUnit>> c = ArgumentCaptor.forClass(List.class);
        verify(unitRepo).saveAll(c.capture());
        return c.getValue();
    }

    @SuppressWarnings("unchecked")
    List<PaymentSettlement> savedPayments() {
        ArgumentCaptor<List<PaymentSettlement>> c = ArgumentCaptor.forClass(List.class);
        verify(paymentRepo).saveAll(c.capture());
        return c.getValue();
    }

    CsvImportException refused(String text, boolean units) {
        return assertThrows(CsvImportException.class, () -> {
            if (units) service.importUnitsCsv(csv(text)); else service.importSettlementsCsv(csv(text));
        });
    }

    // ---- units ---------------------------------------------------------------------------------------------

    @Test
    void loadsUnitsAndSkipsTheHeader() throws IOException {
        var result = service.importUnitsCsv(csv(UNITS_HEADER
                + "," + SCHEME + ",MYSY,p1,Meera Rathod,Banaskantha,10000,2024-04-01,2025-03-31,fam-1\n"));
        assertEquals(1, result.imported());
        EntitlementUnit u = savedUnits().get(0);
        assertEquals("p1", u.getPersonId());
        assertEquals("fam-1", u.getFamilyId());
        assertEquals(0, new BigDecimal("10000").compareTo(u.getAuthorizedAmount()));
        assertEquals(LocalDate.of(2025, 3, 31), u.getPeriodEnd());
        assertEquals("ACTIVE", u.getStatus());
        assertNotNull(u.getId(), "an id is generated when the file has none");
    }

    @Test
    void aUnitKeepsTheIdFromTheFile_soSettlementsCanPointAtIt() throws IOException {
        service.importUnitsCsv(csv(UNITS_HEADER
                + "e0000099-0000-0000-0000-000000000001," + SCHEME + ",MYSY,p1,A,Surat,5000,2024-04-01,\n"));
        assertEquals(UUID.fromString("e0000099-0000-0000-0000-000000000001"), savedUnits().get(0).getId());
    }

    @Test
    void aFileWithoutAHeaderDoesNotLoseItsFirstRow() throws IOException {
        var result = service.importUnitsCsv(csv(
                "," + SCHEME + ",MYSY,p1,A,Surat,5000,2024-04-01,\n"
                + "," + SCHEME + ",MYSY,p2,B,Surat,5000,2024-04-01,\n"));
        assertEquals(2, result.imported());
    }

    @Test
    void quotedFieldsMayContainCommas_andExcelsByteOrderMarkAndWindowsLineEndingsAreTolerated() throws IOException {
        var result = service.importUnitsCsv(csv("﻿" + UNITS_HEADER.replace("\n", "\r\n")
                + "," + SCHEME + ",\"MYSY, Gujarat\",p1,\"Rathod, Meera \"\"Mimi\"\"\",Surat,5000,2024-04-01,2025-03-31\r\n\r\n"));
        assertEquals(1, result.imported());
        EntitlementUnit u = savedUnits().get(0);
        assertEquals("MYSY, Gujarat", u.getSchemeName());
        assertEquals("Rathod, Meera \"Mimi\"", u.getPersonName());
    }

    @Test
    void aShortRowIsRefusedWithItsLineNumber_notSilentlyDropped() {
        CsvImportException e = refused(UNITS_HEADER + "," + SCHEME + ",MYSY,p1\n", true);
        assertEquals(2, e.getLine());
        assertTrue(e.getMessage().contains("expected at least 8 columns"));
        verify(unitRepo, never()).saveAll(any());
    }

    @Test
    void eachKindOfBadValueIsRefusedAndNothingIsLoaded() {
        String good = "," + SCHEME + ",MYSY,p1,A,Surat,5000,2024-04-01,2025-03-31\n";
        assertTrue(refused(UNITS_HEADER + good + ",not-a-uuid,MYSY,p1,A,Surat,5000,2024-04-01,\n", true).getMessage().contains("scheme_id"));
        assertTrue(refused(UNITS_HEADER + "," + SCHEME + ",MYSY,p1,A,Surat,lots,2024-04-01,\n", true).getMessage().contains("authorized_amount"));
        assertTrue(refused(UNITS_HEADER + "," + SCHEME + ",MYSY,p1,A,Surat,-5,2024-04-01,\n", true).getMessage().contains("negative"));
        assertTrue(refused(UNITS_HEADER + "," + SCHEME + ",MYSY,p1,A,Surat,5000,01/04/2024,\n", true).getMessage().contains("YYYY-MM-DD"));
        assertTrue(refused(UNITS_HEADER + "," + SCHEME + ",MYSY,p1,A,Surat,5000,2025-04-01,2024-04-01\n", true).getMessage().contains("before"));
        assertTrue(refused(UNITS_HEADER + "," + SCHEME + ",MYSY,,A,Surat,5000,2024-04-01,\n", true).getMessage().contains("person_id"));
        CsvImportException e = refused(UNITS_HEADER + good + good + ",x,MYSY,p3,C,Surat,1,2024-04-01,\n", true);
        assertEquals(4, e.getLine(), "the error points at the offending line, not at the first row");
        verify(unitRepo, never()).saveAll(any());          // one bad row, none loaded
    }

    @Test
    void aUnitWithAnIdThatAlreadyExistsIsSkipped_soTheSameFileCanBeUploadedTwice() throws IOException {
        UUID existing = UUID.fromString("e1000009-0000-0000-0000-000000000009");
        when(unitRepo.existsById(existing)).thenReturn(true);
        var result = service.importUnitsCsv(csv(UNITS_HEADER
                + existing + "," + SCHEME + ",MYSY,p1,A,Surat,5000,2024-04-01,\n"
                + "," + SCHEME + ",MYSY,p2,B,Surat,5000,2024-04-01,\n"));
        assertEquals(1, result.imported());
        assertEquals(1, result.skipped());
    }

    // ---- settlements ---------------------------------------------------------------------------------------

    @Test
    void loadsSettlementsWithTheirReference() throws IOException {
        var result = service.importSettlementsCsv(csv(SETTLEMENTS_HEADER
                + UNIT + ",2024-04-01,2025-03-31,10000,settled,hash-bank-1,TXN-A,\n"));
        assertEquals(1, result.imported());
        PaymentSettlement p = savedPayments().get(0);
        assertEquals("SETTLED", p.getStatus(), "status is normalised to upper case");
        assertEquals("hash-bank-1", p.getBankToken());
        assertEquals("TXN-A", p.getTransactionRef());
        assertNull(p.getReversalOf());
    }

    @Test
    void aReversalCanBeLoaded_sothatImportedDataDoesNotRaiseFalseOverpaymentAlerts() throws IOException {
        UUID original = UUID.fromString("b1000001-0000-0000-0000-0000000000aa");
        when(paymentRepo.existsById(original)).thenReturn(true);
        var result = service.importSettlementsCsv(csv(SETTLEMENTS_HEADER
                + UNIT + ",2024-04-01,2025-03-31,-10000,SETTLED,hash-bank-1,TXN-REV," + original + "\n"));
        assertEquals(1, result.imported());
        PaymentSettlement p = savedPayments().get(0);
        assertEquals(original, p.getReversalOf());
        assertEquals(0, new BigDecimal("-10000").compareTo(p.getAmount()));
    }

    @Test
    void aSettlementWithoutAKnownUnitIsRefused() {
        CsvImportException e = refused(SETTLEMENTS_HEADER
                + "e9999999-0000-0000-0000-000000000009,2024-04-01,2025-03-31,10000,SETTLED,b,TXN-A,\n", false);
        assertEquals(2, e.getLine());
        assertTrue(e.getMessage().contains("not a known entitlement unit"));
    }

    @Test
    void badStatusesAmountsAndReversalsAreRefused() {
        assertTrue(refused(SETTLEMENTS_HEADER + UNIT + ",2024-04-01,2025-03-31,10000,PAID,b,T,\n", false).getMessage().contains("status"));
        assertTrue(refused(SETTLEMENTS_HEADER + UNIT + ",2024-04-01,2025-03-31,0,SETTLED,b,T,\n", false).getMessage().contains("greater than zero"));
        assertTrue(refused(SETTLEMENTS_HEADER + UNIT + ",2024-04-01,2025-03-31,-100,SETTLED,b,T,\n", false).getMessage().contains("reversal_of"));
        assertTrue(refused(SETTLEMENTS_HEADER + UNIT + ",2025-04-01,2024-03-31,100,SETTLED,b,T,\n", false).getMessage().contains("before"));
        assertTrue(refused(SETTLEMENTS_HEADER + UNIT + ",2024-04-01,2025-03-31,-100,SETTLED,b,T,b1000001-0000-0000-0000-0000000000bb\n", false)
                .getMessage().contains("not a payment that was loaded earlier"));
        verify(paymentRepo, never()).saveAll(any());
    }

    @Test
    void aTransactionThatWasAlreadyLoadedIsSkipped_notPaidTwice() throws IOException {
        when(paymentRepo.existsByTransactionRef("TXN-OLD")).thenReturn(true);
        var result = service.importSettlementsCsv(csv(SETTLEMENTS_HEADER
                + UNIT + ",2024-04-01,2025-03-31,10000,SETTLED,b,TXN-OLD,\n"
                + UNIT + ",2024-04-01,2025-03-31,10000,SETTLED,b,TXN-NEW,\n"
                + UNIT + ",2024-04-01,2025-03-31,10000,SETTLED,b,TXN-NEW,\n"));      // repeated inside the same file
        assertEquals(1, result.imported());
        assertEquals(2, result.skipped());
        assertEquals("TXN-NEW", savedPayments().get(0).getTransactionRef());
    }

    @Test
    void anEmptyFileLoadsNothing() throws IOException {
        var result = service.importSettlementsCsv(csv(""));
        assertEquals(0, result.imported());
        assertEquals(0, result.skipped());
    }

    // ---- life certificates ---------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    List<MasterChangeLog> savedCertificates() {
        ArgumentCaptor<List<MasterChangeLog>> c = ArgumentCaptor.forClass(List.class);
        verify(changeLogRepo).saveAll(c.capture());
        return c.getValue();
    }

    CsvImportException refusedCertificates(String text) {
        return assertThrows(CsvImportException.class, () -> service.importLifeCertificatesCsv(csv(text), "dept.admin"));
    }

    @Test
    void aLifeCertificateIsStoredTheWayRuleS06ReadsIt() throws IOException {
        var result = service.importLifeCertificatesCsv(csv(CERTS_HEADER + PENSIONER + ",2026-09-15,LC-2026-0091\n"), "dept.admin");
        assertEquals(1, result.imported());
        MasterChangeLog c = savedCertificates().get(0);
        assertEquals(MasterChangeLog.LIFE_CERTIFICATE_FIELD, c.getFieldName(), "the same field name S06 looks for");
        assertEquals(PENSIONER, c.getPersonId());
        assertEquals(LocalDate.of(2026, 9, 15).atStartOfDay(), c.getChangedAt(), "dated when it was received, not when it was loaded");
        assertEquals("LC-2026-0091", c.getApprovalRef(), "the certificate's own reference");
        assertEquals("dept.admin", c.getOperatorId());
    }

    @Test
    void theReferenceIsOptional_andAFileWithoutAHeaderLosesNoRow() throws IOException {
        var result = service.importLifeCertificatesCsv(csv(PENSIONER + ",2026-09-15,\n" + PENSIONER + ",2025-09-10\n"), "dept.admin");
        assertEquals(2, result.imported());
        assertNull(savedCertificates().get(0).getApprovalRef());
    }

    @Test
    void anUnknownEmployeeADateInTheFutureOrAMalformedRowIsRefusedWithTheLine() {
        CsvImportException unknown = refusedCertificates(CERTS_HEADER + PENSIONER + ",2026-09-15,\nNOBODY-1,2026-09-15,\n");
        assertEquals(3, unknown.getLine());
        assertTrue(unknown.getMessage().contains("NOBODY-1") && unknown.getMessage().contains("not a known employee"));
        assertTrue(refusedCertificates(CERTS_HEADER + PENSIONER + "," + LocalDate.now().plusDays(1) + ",\n").getMessage().contains("in the future"));
        assertTrue(refusedCertificates(CERTS_HEADER + PENSIONER + ",15/09/2026,\n").getMessage().contains("YYYY-MM-DD"));
        assertTrue(refusedCertificates(CERTS_HEADER + PENSIONER + "\n").getMessage().contains("expected at least 2 columns"));
        assertTrue(refusedCertificates(CERTS_HEADER + ",2026-09-15,\n").getMessage().contains("employee_code is empty"));
        verify(changeLogRepo, never()).saveAll(any());          // one bad row, none loaded
    }

    @Test
    void aCertificateAlreadyOnFileForThatEmployeeAndDateIsSkipped_notRecordedTwice() throws IOException {
        MasterChangeLog existing = new MasterChangeLog();
        existing.setPersonId(PENSIONER);
        existing.setFieldName(MasterChangeLog.LIFE_CERTIFICATE_FIELD);
        existing.setChangedAt(LocalDate.of(2026, 9, 15).atTime(10, 30));        // on file, with a time of day
        when(changeLogRepo.findByPersonId(PENSIONER)).thenReturn(List.of(existing));
        var result = service.importLifeCertificatesCsv(csv(CERTS_HEADER
                + PENSIONER + ",2026-09-15,LC-1\n"                // already on file
                + PENSIONER + ",2025-09-15,LC-0\n"                // an earlier year: new
                + PENSIONER + ",2025-09-15,LC-0\n"), "dept.admin");     // repeated inside the file
        assertEquals(1, result.imported());
        assertEquals(2, result.skipped());
        assertEquals(LocalDate.of(2025, 9, 15).atStartOfDay(), savedCertificates().get(0).getChangedAt());
    }

    @Test
    void anotherLogEntryOnTheSameDayDoesNotCountAsACertificate() throws IOException {
        MasterChangeLog bankChange = new MasterChangeLog();
        bankChange.setPersonId(PENSIONER);
        bankChange.setFieldName("bank_token");
        bankChange.setChangedAt(LocalDate.of(2026, 9, 15).atStartOfDay());
        when(changeLogRepo.findByPersonId(PENSIONER)).thenReturn(List.of(bankChange));
        assertEquals(1, service.importLifeCertificatesCsv(csv(CERTS_HEADER + PENSIONER + ",2026-09-15,\n"), "dept.admin").imported());
    }
}
