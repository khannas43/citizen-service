package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.entity.PayrollSettlement;
import org.magicsword.expenditure.entity.PensionAuthorisation;
import org.magicsword.expenditure.entity.ServiceEvent;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.PayrollSettlementRepository;
import org.magicsword.expenditure.repository.PensionAuthorisationRepository;
import org.magicsword.expenditure.repository.ServiceEventRepository;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** The UC4 importers: employees, service events, payroll and pensions. */
class PayrollImportServiceTest {

    static final String EMP_HEADER = "employee_code,person_name,ddo_code,post_title,pay_level,status,status_since\n";
    static final String EVENT_HEADER = "employee_code,event_type,effective_date,order_ref\n";
    static final String PAY_HEADER = "employee_code,component,ddo_code,period_start,period_end,gross_amount,net_amount,transaction_ref,reversal_of_ref\n";
    static final String PPO_HEADER = "ppo_id,employee_code,monthly_rate,effective_from,commutation_amount,recipient_name\n";

    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    ServiceEventRepository eventRepo = mock(ServiceEventRepository.class);
    PayrollSettlementRepository payrollRepo = mock(PayrollSettlementRepository.class);
    PensionAuthorisationRepository pensionRepo = mock(PensionAuthorisationRepository.class);
    PayrollImportService service;

    final List<EmployeeIdentity> employees = new ArrayList<>();
    final List<PensionAuthorisation> pensions = new ArrayList<>();
    final List<PayrollSettlement> storedPayroll = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new PayrollImportService(employeeRepo, eventRepo, payrollRepo, pensionRepo);
        when(employeeRepo.findAll()).thenAnswer(i -> employees);
        when(pensionRepo.findAll()).thenAnswer(i -> pensions);
        when(payrollRepo.findByTransactionRefIn(any())).thenAnswer(i -> {
            Collection<String> refs = i.getArgument(0);
            return storedPayroll.stream().filter(p -> refs.contains(p.getTransactionRef())).toList();
        });
        when(payrollRepo.saveAll(any())).thenAnswer(i -> {
            List<PayrollSettlement> list = i.getArgument(0);
            list.forEach(p -> { if (p.getId() == null) p.setId(UUID.randomUUID()); });
            return list;
        });
        known("E1");
    }

    EmployeeIdentity known(String code) {
        EmployeeIdentity e = new EmployeeIdentity();
        e.setId(UUID.randomUUID());
        e.setEmployeeCode(code);
        e.setPersonName("Person " + code);
        e.setDdoCode("DDO-A");
        e.setPostTitle("Clerk");
        e.setPayLevel("L5");
        e.setStatus("ACTIVE");
        employees.add(e);
        return e;
    }

    static ByteArrayInputStream csv(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }

    CsvImportException refused(String text, String importer) {
        return assertThrows(CsvImportException.class, () -> {
            switch (importer) {
                case "employees" -> service.importEmployees(csv(text));
                case "events" -> service.importServiceEvents(csv(text));
                case "payroll" -> service.importPayroll(csv(text));
                default -> service.importPensions(csv(text));
            }
        });
    }

    @SuppressWarnings("unchecked")
    List<EmployeeIdentity> savedEmployees() {
        ArgumentCaptor<List<EmployeeIdentity>> c = ArgumentCaptor.forClass(List.class);
        verify(employeeRepo).saveAll(c.capture());
        return c.getValue();
    }

    @SuppressWarnings("unchecked")
    List<ServiceEvent> savedEvents() {
        ArgumentCaptor<List<ServiceEvent>> c = ArgumentCaptor.forClass(List.class);
        verify(eventRepo).saveAll(c.capture());
        return c.getValue();
    }

    @SuppressWarnings("unchecked")
    List<PensionAuthorisation> savedPensions() {
        ArgumentCaptor<List<PensionAuthorisation>> c = ArgumentCaptor.forClass(List.class);
        verify(pensionRepo).saveAll(c.capture());
        return c.getValue();
    }

    @SuppressWarnings("unchecked")
    List<List<PayrollSettlement>> savedPayrollBatches() {
        ArgumentCaptor<List<PayrollSettlement>> c = ArgumentCaptor.forClass(List.class);
        verify(payrollRepo, atLeastOnce()).saveAll(c.capture());
        return c.getAllValues();
    }

    // ---- employees -----------------------------------------------------------------------------------------

    @Test
    void loadsEmployeesWithTheirPostAndStatus() throws IOException {
        var result = service.importEmployees(csv(EMP_HEADER + "GJ-9,\"Rathod, Meera\",DDO-B,Teacher,L6,active,2024-06-01\n"));
        assertEquals(1, result.imported());
        EmployeeIdentity e = savedEmployees().get(0);
        assertEquals("GJ-9", e.getEmployeeCode());
        assertEquals("Rathod, Meera", e.getPersonName());
        assertEquals("ACTIVE", e.getStatus(), "status is normalised to upper case");
        assertEquals(LocalDate.of(2024, 6, 1), e.getStatusSince());
        assertEquals("Teacher", e.getPostTitle());
    }

    @Test
    void anExistingEmployeeIsUpdated_andAnUnchangedOneIsSkipped() throws IOException {
        var result = service.importEmployees(csv(EMP_HEADER
                + "E1,Person E1,DDO-A,Clerk,L5,ACTIVE,\n"                    // identical to what is stored
                + "E1-NEW,New Person,DDO-A,Clerk,L5,ACTIVE,\n"));
        assertEquals(1, result.imported());
        assertEquals(1, result.skipped());
        // a transfer: the same employee, a new status
        known("E2");
        var second = service.importEmployees(csv(EMP_HEADER + "E2,Person E2,DDO-A,Clerk,L5,TRANSFERRED,2024-07-01\n"));
        assertEquals(0, second.imported());
        assertEquals(1, second.updated());
        assertEquals("TRANSFERRED", employees.get(1).getStatus());
    }

    @Test
    void badEmployeeRowsAreRefusedWithTheLine() {
        assertTrue(refused(EMP_HEADER + "E9,Name,DDO-A,Clerk,L5,ON_LEAVE,\n", "employees").getMessage().contains("status"));
        assertTrue(refused(EMP_HEADER + ",Name,DDO-A,Clerk,L5,ACTIVE,\n", "employees").getMessage().contains("employee_code is empty"));
        assertTrue(refused(EMP_HEADER + "E9,,DDO-A,Clerk,L5,ACTIVE,\n", "employees").getMessage().contains("person_name"));
        assertTrue(refused(EMP_HEADER + "E9,Name,,Clerk,L5,ACTIVE,\n", "employees").getMessage().contains("ddo_code"));
        assertTrue(refused(EMP_HEADER + "E9,Name,DDO-A,Clerk,L5,ACTIVE,June\n", "employees").getMessage().contains("YYYY-MM-DD"));
        assertTrue(refused(EMP_HEADER + "E9,Name\n", "employees").getMessage().contains("expected at least 6 columns"));
        CsvImportException twice = refused(EMP_HEADER + "E9,Name,DDO-A,Clerk,L5,ACTIVE,\nE9,Other,DDO-A,Clerk,L5,ACTIVE,\n", "employees");
        assertEquals(3, twice.getLine());
        assertTrue(twice.getMessage().contains("appears twice") && twice.getMessage().contains("line 2"));
        verify(employeeRepo, never()).saveAll(any());
    }

    // ---- service events ------------------------------------------------------------------------------------

    @Test
    void anEmployeeCanBeLinkedToABeneficiaryByPersonId() throws Exception {
        service.importEmployees(csv(EMP_HEADER.trim() + ",district,taluka,person_id\nE7,Person E7,DDO-A,Clerk,L5,ACTIVE,,Surat,Olpad,50000001-0000-0000-0000-000000000007\n"));
        assertEquals("50000001-0000-0000-0000-000000000007", savedEmployees().get(0).getPersonId());
    }

    @Test
    void loadsServiceEventsForKnownEmployees() throws IOException {
        var result = service.importServiceEvents(csv(EVENT_HEADER + "E1,transfer,2024-07-16,ORD-77\nE1,RETIREMENT,2030-03-31,\n"));
        assertEquals(2, result.imported());
        List<ServiceEvent> events = savedEvents();
        assertEquals("TRANSFER", events.get(0).getEventType());
        assertEquals("ORD-77", events.get(0).getOrderRef());
        assertNull(events.get(1).getOrderRef());
        assertEquals(LocalDate.of(2030, 3, 31), events.get(1).getEffectiveDate(), "a planned future retirement is fine");
    }

    @Test
    void anEventAlreadyOnFileOrRepeatedInTheFileIsSkipped() throws IOException {
        ServiceEvent stored = new ServiceEvent();
        stored.setEmployeeCode("E1");
        stored.setEventType("TRANSFER");
        stored.setEffectiveDate(LocalDate.of(2024, 7, 16));
        stored.setOrderRef("ORD-77");
        when(eventRepo.findByEmployeeCode("E1")).thenReturn(List.of(stored));
        var result = service.importServiceEvents(csv(EVENT_HEADER
                + "E1,TRANSFER,2024-07-16,ORD-77\n"             // already on file
                + "E1,TRANSFER,2024-07-16,ORD-78\n"             // a different order: new
                + "E1,TRANSFER,2024-07-16,ORD-78\n"));          // repeated
        assertEquals(1, result.imported());
        assertEquals(2, result.skipped());
    }

    @Test
    void badEventRowsAreRefused() {
        assertTrue(refused(EVENT_HEADER + "NOBODY,TRANSFER,2024-07-16,\n", "events").getMessage().contains("not a known employee"));
        assertTrue(refused(EVENT_HEADER + "E1,PROMOTED,2024-07-16,\n", "events").getMessage().contains("event_type"));
        assertTrue(refused(EVENT_HEADER + "E1,TRANSFER,16/07/2024,\n", "events").getMessage().contains("YYYY-MM-DD"));
        assertTrue(refused(EVENT_HEADER + "E1,TRANSFER\n", "events").getMessage().contains("expected at least 3 columns"));
        verify(eventRepo, never()).saveAll(any());
    }

    // ---- payroll -------------------------------------------------------------------------------------------

    @Test
    void loadsPayrollRowsWithTheirReference() throws IOException {
        var result = service.importPayroll(csv(PAY_HEADER
                + "E1,basic,DDO-A,2024-07-01,2024-07-31,45000,42000,PAY-1,\n"
                + "E1,hra,DDO-A,2024-07-01,2024-07-31,8000,8000,PAY-2,\n"));
        assertEquals(2, result.imported());
        PayrollSettlement p = savedPayrollBatches().get(0).get(0);
        assertEquals("BASIC", p.getComponent());
        assertEquals("PAY-1", p.getTransactionRef());
        assertEquals(0, new BigDecimal("42000").compareTo(p.getNetAmount()));
        assertEquals("DDO-A", p.getDdoCode());
    }

    @Test
    void thePaymentReferenceIsRequired_becauseItIsWhatTellsAFileLoadedTwiceFromAPaymentMadeTwice() {
        CsvImportException e = refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,45000,42000,,\n", "payroll");
        assertEquals(2, e.getLine());
        assertTrue(e.getMessage().contains("transaction_ref is required"));
    }

    @Test
    void aPaymentAlreadyLoadedIsSkipped_butTwoRealPaymentsOfTheSamePayAreBothLoaded() throws IOException {
        PayrollSettlement old = new PayrollSettlement();
        old.setId(UUID.randomUUID());
        old.setTransactionRef("PAY-OLD");
        storedPayroll.add(old);
        var result = service.importPayroll(csv(PAY_HEADER
                + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,45000,42000,PAY-OLD,\n"        // loaded before: skipped
                + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,45000,42000,PAY-NEW-1,\n"      // same employee, period and amount...
                + "E1,BASIC,DDO-B,2024-07-01,2024-07-31,45000,42000,PAY-NEW-2,\n"      // ...paid again by another DDO: a real second payment
                + "E1,BASIC,DDO-B,2024-07-01,2024-07-31,45000,42000,PAY-NEW-2,\n"));   // the same line twice in the file: skipped
        assertEquals(2, result.imported(), "S01 and S04 need genuine duplicate payments to survive the import");
        assertEquals(2, result.skipped());
    }

    @Test
    void aReversalPointsAtThePaymentItReverses_whetherLoadedEarlierOrInTheSameFile() throws IOException {
        PayrollSettlement old = new PayrollSettlement();
        UUID oldId = UUID.randomUUID();
        old.setId(oldId);
        old.setTransactionRef("PAY-OLD");
        storedPayroll.add(old);
        var result = service.importPayroll(csv(PAY_HEADER
                + "E1,BASIC,DDO-B,2024-07-01,2024-07-31,-45000,-42000,PAY-REV-1,PAY-OLD\n"     // reverses a stored payment
                + "E1,BASIC,DDO-B,2024-07-01,2024-07-31,45000,42000,PAY-NEW,\n"
                + "E1,BASIC,DDO-B,2024-07-01,2024-07-31,-45000,-42000,PAY-REV-2,PAY-NEW\n"));   // reverses one in this file
        assertEquals(3, result.imported());
        List<List<PayrollSettlement>> batches = savedPayrollBatches();
        PayrollSettlement newPayment = batches.get(0).get(0);
        assertEquals("PAY-NEW", newPayment.getTransactionRef());
        Map<String, PayrollSettlement> reversals = new HashMap<>();
        batches.get(1).forEach(p -> reversals.put(p.getTransactionRef(), p));
        assertEquals(oldId, reversals.get("PAY-REV-1").getReversalOf());
        assertEquals(newPayment.getId(), reversals.get("PAY-REV-2").getReversalOf());
    }

    @Test
    void badPayrollRowsAreRefusedAndNothingIsLoaded() {
        String ok = "E1,BASIC,DDO-A,2024-07-01,2024-07-31,45000,42000,PAY-1,\n";
        assertTrue(refused(PAY_HEADER + "NOBODY,BASIC,DDO-A,2024-07-01,2024-07-31,1,1,P,\n", "payroll").getMessage().contains("not a known employee"));
        assertTrue(refused(PAY_HEADER + "E1,SALARY,DDO-A,2024-07-01,2024-07-31,1,1,P,\n", "payroll").getMessage().contains("component"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,,2024-07-01,2024-07-31,1,1,P,\n", "payroll").getMessage().contains("ddo_code"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-31,2024-07-01,1,1,P,\n", "payroll").getMessage().contains("before"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,lots,1,P,\n", "payroll").getMessage().contains("gross_amount"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,0,0,P,\n", "payroll").getMessage().contains("greater than zero"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,-5,-5,P,\n", "payroll").getMessage().contains("reversal_of_ref"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,5,5,P,Q\n", "payroll").getMessage().contains("negative"));
        assertTrue(refused(PAY_HEADER + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,-5,-5,P,P\n", "payroll").getMessage().contains("own transaction_ref"));
        CsvImportException unknown = refused(PAY_HEADER + ok + "E1,BASIC,DDO-A,2024-07-01,2024-07-31,-5,-5,PAY-REV,NO-SUCH-PAYMENT\n", "payroll");
        assertEquals(3, unknown.getLine());
        assertTrue(unknown.getMessage().contains("NO-SUCH-PAYMENT"));
        verify(payrollRepo, never()).saveAll(any());          // one bad row, none loaded
    }

    // ---- pensions ------------------------------------------------------------------------------------------

    @Test
    void loadsAPensionAuthorisation() throws IOException {
        var result = service.importPensions(csv(PPO_HEADER + "PPO-1,E1,28000,2023-04-01,150000,Meera Rathod\n"));
        assertEquals(1, result.imported());
        PensionAuthorisation a = savedPensions().get(0);
        assertEquals("PPO-1", a.getPpoId());
        assertEquals(0, new BigDecimal("28000").compareTo(a.getMonthlyRate()));
        assertEquals(0, new BigDecimal("150000").compareTo(a.getCommutationAmount()));
        assertEquals("Meera Rathod", a.getRecipientName());
    }

    @Test
    void aRevisedRateUpdatesTheSamePpo_anUnchangedOneIsSkipped() throws IOException {
        PensionAuthorisation stored = new PensionAuthorisation();
        stored.setPpoId("PPO-1");
        stored.setEmployeeCode("E1");
        stored.setMonthlyRate(new BigDecimal("28000"));
        stored.setEffectiveFrom(LocalDate.of(2023, 4, 1));
        pensions.add(stored);
        var same = service.importPensions(csv(PPO_HEADER + "PPO-1,E1,28000.00,2023-04-01,,\n"));
        assertEquals(1, same.skipped());
        var revised = service.importPensions(csv(PPO_HEADER + "PPO-1,E1,30000,2024-04-01,,\n"));
        assertEquals(1, revised.updated());
        assertEquals(0, new BigDecimal("30000").compareTo(stored.getMonthlyRate()));
        assertEquals(LocalDate.of(2024, 4, 1), stored.getEffectiveFrom());
    }

    @Test
    void anEmployeeHasOneAuthorisation_andAPpoBelongsToOneEmployee() {
        known("E2");
        PensionAuthorisation stored = new PensionAuthorisation();
        stored.setPpoId("PPO-1");
        stored.setEmployeeCode("E1");
        stored.setMonthlyRate(new BigDecimal("28000"));
        pensions.add(stored);
        assertTrue(refused(PPO_HEADER + "PPO-2,E1,30000,2024-04-01,,\n", "pensions").getMessage().contains("already has PPO 'PPO-1'"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E2,30000,2024-04-01,,\n", "pensions").getMessage().contains("belongs to employee 'E1'"));
        assertTrue(refused(PPO_HEADER + "PPO-3,E2,30000,2024-04-01,,\nPPO-4,E2,30000,2024-04-01,,\n", "pensions").getMessage().contains("already has PPO 'PPO-3'"));
    }

    @Test
    void badPensionRowsAreRefused() {
        assertTrue(refused(PPO_HEADER + "PPO-1,NOBODY,28000,2023-04-01,,\n", "pensions").getMessage().contains("not a known employee"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E1,0,2023-04-01,,\n", "pensions").getMessage().contains("greater than zero"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E1,lots,2023-04-01,,\n", "pensions").getMessage().contains("monthly_rate"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E1,28000,April 2023,,\n", "pensions").getMessage().contains("YYYY-MM-DD"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E1,28000,2023-04-01,-1,\n", "pensions").getMessage().contains("must not be negative"));
        assertTrue(refused(PPO_HEADER + ",E1,28000,2023-04-01,,\n", "pensions").getMessage().contains("ppo_id is empty"));
        assertTrue(refused(PPO_HEADER + "PPO-1,E1\n", "pensions").getMessage().contains("expected at least 4 columns"));
        verify(pensionRepo, never()).saveAll(any());
    }

    @Test
    void emptyFilesLoadNothing() throws IOException {
        assertEquals(0, service.importEmployees(csv("")).imported());
        assertEquals(0, service.importServiceEvents(csv("")).imported());
        assertEquals(0, service.importPayroll(csv("")).imported());
        assertEquals(0, service.importPensions(csv(PPO_HEADER)).imported());
    }
}
