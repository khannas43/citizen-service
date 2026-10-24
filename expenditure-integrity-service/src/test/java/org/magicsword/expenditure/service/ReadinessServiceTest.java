package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.repository.ReadinessQueryRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReadinessServiceTest {

    ReadinessQueryRepository queries = mock(ReadinessQueryRepository.class);
    ReadinessService service;

    @BeforeEach
    void setUp() {
        service = new ReadinessService(queries);
        stubZeros();
    }

    void stubZeros() {
        when(queries.countUnits()).thenReturn(0L);
        when(queries.countUnitsMissingTalukaOrVillage()).thenReturn(0L);
        when(queries.countUnitsMissingIncomeOrAge()).thenReturn(0L);
        when(queries.countActiveUnits()).thenReturn(0L);
        when(queries.countActiveUnitsWithoutRecentSettlement(any())).thenReturn(0L);
        when(queries.maxUnitPeriodEnd()).thenReturn(Optional.empty());
        when(queries.countSettlements()).thenReturn(0L);
        when(queries.countSettlementsMissingBankToken()).thenReturn(0L);
        when(queries.countSettlementsMissingTransactionRef()).thenReturn(0L);
        when(queries.maxSettlementPeriodEnd()).thenReturn(Optional.empty());
        when(queries.countDistinctBeneficiaryPeople()).thenReturn(0L);
        when(queries.countPeopleWithoutVerificationEvent()).thenReturn(0L);
        when(queries.maxVerificationEventDate()).thenReturn(Optional.empty());
        when(queries.countBankTokenChanges()).thenReturn(0L);
        when(queries.countBankChangesWithoutApproval()).thenReturn(0L);
        when(queries.maxMasterChangeAt()).thenReturn(Optional.empty());
        when(queries.countEmployees()).thenReturn(0L);
        when(queries.countEmployeesWithoutServiceEvent()).thenReturn(0L);
        when(queries.countEmployeesMissingPersonLink()).thenReturn(0L);
        when(queries.countEmployeesMissingDistrict()).thenReturn(0L);
        when(queries.maxEmployeeStatusSince()).thenReturn(Optional.empty());
        when(queries.maxServiceEventDate()).thenReturn(Optional.empty());
        when(queries.countPayrollRows()).thenReturn(0L);
        when(queries.countPayrollMissingTransactionRef()).thenReturn(0L);
        when(queries.countPensionPayrollRows()).thenReturn(0L);
        when(queries.countPensionPayrollWithoutAuthorisation()).thenReturn(0L);
        when(queries.maxPayrollPeriodEnd()).thenReturn(Optional.empty());
        when(queries.countPensioners()).thenReturn(0L);
        when(queries.countPensionersWithoutLifeCertificate()).thenReturn(0L);
        when(queries.maxPensionEffectiveFrom()).thenReturn(Optional.empty());
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> findCheck(String id) {
        List<Map<String, Object>> feeds = (List<Map<String, Object>>) service.readiness().get("feeds");
        for (Map<String, Object> feed : feeds) {
            for (Map<String, Object> c : (List<Map<String, Object>>) feed.get("checks")) {
                if (id.equals(c.get("id"))) {
                    return c;
                }
            }
        }
        throw new AssertionError("check " + id);
    }

    @Test
    void emptyTablesReportOneHundredPercent() {
        when(queries.countUnits()).thenReturn(0L);
        Map<String, Object> c = findCheck("units-missing-geo");
        assertEquals(100.0, c.get("percentComplete"));
        assertEquals(0L, c.get("affected"));
    }

    @Test
    void unitsMissingGeoPercent() {
        when(queries.countUnits()).thenReturn(10L);
        when(queries.countUnitsMissingTalukaOrVillage()).thenReturn(2L);
        Map<String, Object> c = findCheck("units-missing-geo");
        assertEquals(80.0, c.get("percentComplete"));
        assertTrue(c.containsKey("askFor"));
    }

    @Test
    void unitsMissingSnapshots() {
        when(queries.countUnits()).thenReturn(4L);
        when(queries.countUnitsMissingIncomeOrAge()).thenReturn(1L);
        assertEquals(75.0, findCheck("units-missing-snapshots").get("percentComplete"));
    }

    @Test
    void settlementsMissingBank() {
        when(queries.countSettlements()).thenReturn(5L);
        when(queries.countSettlementsMissingBankToken()).thenReturn(5L);
        assertEquals(0.0, findCheck("settlements-missing-bank").get("percentComplete"));
    }

    @Test
    void settlementsMissingTransactionRef() {
        when(queries.countSettlements()).thenReturn(3L);
        when(queries.countSettlementsMissingTransactionRef()).thenReturn(1L);
        assertEquals(66.7, findCheck("settlements-missing-txref").get("percentComplete"));
    }

    @Test
    void activeUnitsWithoutRecentSettlement() {
        when(queries.countActiveUnits()).thenReturn(2L);
        when(queries.countActiveUnitsWithoutRecentSettlement(any(LocalDate.class))).thenReturn(1L);
        assertEquals(50.0, findCheck("active-units-no-recent-payment").get("percentComplete"));
    }

    @Test
    void verificationCoverage() {
        when(queries.countDistinctBeneficiaryPeople()).thenReturn(100L);
        when(queries.countPeopleWithoutVerificationEvent()).thenReturn(40L);
        Map<String, Object> c = findCheck("verification-feed-coverage");
        assertEquals(60.0, c.get("percentComplete"));
        assertEquals(true, c.get("coverage"));
    }

    @Test
    void bankChangesWithoutApproval() {
        when(queries.countBankTokenChanges()).thenReturn(6L);
        when(queries.countBankChangesWithoutApproval()).thenReturn(6L);
        assertEquals(0.0, findCheck("bank-changes-no-approval").get("percentComplete"));
    }

    @Test
    void employeesWithoutServiceEvent() {
        when(queries.countEmployees()).thenReturn(8L);
        when(queries.countEmployeesWithoutServiceEvent()).thenReturn(2L);
        assertEquals(75.0, findCheck("employees-no-service-event").get("percentComplete"));
    }

    @Test
    void employeesMissingPersonLink() {
        when(queries.countEmployees()).thenReturn(5L);
        when(queries.countEmployeesMissingPersonLink()).thenReturn(1L);
        assertEquals(80.0, findCheck("employees-no-person-link").get("percentComplete"));
    }

    @Test
    void employeesMissingDistrict() {
        when(queries.countEmployees()).thenReturn(5L);
        when(queries.countEmployeesMissingDistrict()).thenReturn(1L);
        assertEquals(80.0, findCheck("employees-no-district").get("percentComplete"));
    }

    @Test
    void payrollMissingTransactionRef() {
        when(queries.countPayrollRows()).thenReturn(10L);
        when(queries.countPayrollMissingTransactionRef()).thenReturn(1L);
        assertEquals(90.0, findCheck("payroll-missing-txref").get("percentComplete"));
    }

    @Test
    void pensionPayrollWithoutAuth() {
        when(queries.countPensionPayrollRows()).thenReturn(4L);
        when(queries.countPensionPayrollWithoutAuthorisation()).thenReturn(2L);
        assertEquals(50.0, findCheck("pension-pay-without-auth").get("percentComplete"));
    }

    @Test
    void pensionersWithoutLifeCertificate() {
        when(queries.countPensioners()).thenReturn(3L);
        when(queries.countPensionersWithoutLifeCertificate()).thenReturn(1L);
        assertEquals(66.7, findCheck("pensioners-no-life-cert").get("percentComplete"));
    }

    @Test
    void percentCompleteHelperAvoidsDivideByZero() {
        assertEquals(100.0, ReadinessService.percentComplete(0, 0));
    }
}
