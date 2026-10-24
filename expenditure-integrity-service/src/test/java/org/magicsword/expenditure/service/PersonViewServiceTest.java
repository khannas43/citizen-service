package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.IntegrityAlert;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.IntegrityAlertRepository;
import org.magicsword.expenditure.security.DomainAccess;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PersonViewServiceTest {

    EmployeeIdentityRepository employeeRepo = mock(EmployeeIdentityRepository.class);
    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    DomainAccess access = new DomainAccess(
            "SCHEME_DEPT,DEPT_ADMIN,REVENUE_OFFICER,IT_ADMIN,FINANCE_OFFICER",
            "SCHEME_DEPT,DEPT_ADMIN,REVENUE_OFFICER",
            "DEPT_ADMIN,PAYROLL_REVIEWER,FINANCE_OFFICER,HR_OFFICER",
            "DEPT_ADMIN,PAYROLL_REVIEWER");
    PersonViewService service;

    static final String REGISTRY = "50000005-0000-0000-0000-000000000001";
    static final String EMP_CODE = "GJ-DEMO-TRANSFER-01";

    @BeforeEach
    void setUp() {
        service = new PersonViewService(employeeRepo, alertRepo, unitRepo, access);
    }

    JwtAuthenticationToken auth(String... roles) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject("sub")
                .claim("realm_access", Map.of("roles", List.of(roles))).build();
        var authorities = Arrays.stream(roles).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
        return new JwtAuthenticationToken(jwt, authorities);
    }

    IntegrityAlert openAlert(IntegrityDomain domain, String personId, String amount) {
        IntegrityAlert a = new IntegrityAlert();
        a.setId(UUID.randomUUID());
        a.setDomain(domain);
        a.setPersonId(personId);
        a.setPersonName("Demo Person");
        a.setRuleCode(domain == IntegrityDomain.PAYROLL ? "S01" : "802");
        a.setStatus("OPEN");
        a.setSeverity("HIGH");
        a.setAmountDelta(amount == null ? null : new BigDecimal(amount));
        a.setCaseId(UUID.randomUUID());
        a.setSchemeName("MYSY");
        return a;
    }

    @Test
    void linkedPersonShowsBothSidesForDeptAdmin() {
        EmployeeIdentity emp = new EmployeeIdentity();
        emp.setEmployeeCode(EMP_CODE);
        emp.setPersonId(REGISTRY);
        emp.setPostTitle("Clerk");
        emp.setDdoCode("DDO-A");
        emp.setPersonName("Demo Person");
        when(employeeRepo.findFirstByPersonId(REGISTRY)).thenReturn(Optional.of(emp));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, REGISTRY))
                .thenReturn(List.of(openAlert(IntegrityDomain.BENEFICIARY, REGISTRY, "10000")));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.PAYROLL, EMP_CODE))
                .thenReturn(List.of(openAlert(IntegrityDomain.PAYROLL, EMP_CODE, "42000")));
        when(unitRepo.findByPersonId(REGISTRY)).thenReturn(List.of(new EntitlementUnit()));

        Map<String, Object> out = service.overview(REGISTRY, auth("DEPT_ADMIN"));
        assertTrue((Boolean) out.get("linked"));
        assertNotNull(out.get("beneficiary"));
        assertNotNull(out.get("payroll"));
        @SuppressWarnings("unchecked") Map<String, Object> pay = (Map<String, Object>) out.get("payroll");
        assertEquals(EMP_CODE, pay.get("employeeCode"));
    }

    @Test
    void schemeDeptSeesBeneficiaryOnlyNotPayrollFields() {
        EmployeeIdentity emp = new EmployeeIdentity();
        emp.setEmployeeCode(EMP_CODE);
        emp.setPersonId(REGISTRY);
        emp.setPostTitle("Clerk");
        emp.setDdoCode("DDO-A");
        when(employeeRepo.findFirstByPersonId(REGISTRY)).thenReturn(Optional.of(emp));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, REGISTRY))
                .thenReturn(List.of(openAlert(IntegrityDomain.BENEFICIARY, REGISTRY, "1000")));
        when(unitRepo.findByPersonId(REGISTRY)).thenReturn(List.of());

        Map<String, Object> out = service.overview(REGISTRY, auth("SCHEME_DEPT"));
        assertTrue((Boolean) out.get("linked"));
        assertNotNull(out.get("beneficiary"));
        assertFalse(out.containsKey("payroll"));
    }

    @Test
    void payrollRoleWithoutBeneficiaryReadSeesPayrollSideOnly() {
        EmployeeIdentity emp = new EmployeeIdentity();
        emp.setEmployeeCode(EMP_CODE);
        emp.setPersonId(REGISTRY);
        emp.setPostTitle("Clerk");
        emp.setPersonName("Payroll Only");
        when(employeeRepo.findByEmployeeCode(EMP_CODE)).thenReturn(Optional.of(emp));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.PAYROLL, EMP_CODE))
                .thenReturn(List.of(openAlert(IntegrityDomain.PAYROLL, EMP_CODE, "1000")));

        Map<String, Object> out = service.overview(EMP_CODE, auth("HR_OFFICER"));
        assertTrue((Boolean) out.get("linked"));
        assertFalse(out.containsKey("beneficiary"));
        assertNotNull(out.get("payroll"));
    }

    @Test
    void unlinkedBeneficiaryHasNoPayrollBlock() {
        when(employeeRepo.findFirstByPersonId(REGISTRY)).thenReturn(Optional.empty());
        when(unitRepo.findByPersonId(REGISTRY)).thenReturn(List.of(new EntitlementUnit()));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, REGISTRY)).thenReturn(List.of());

        Map<String, Object> out = service.overview(REGISTRY, auth("DEPT_ADMIN"));
        assertFalse((Boolean) out.get("linked"));
        assertNotNull(out.get("beneficiary"));
        assertNull(out.get("payroll"));
    }

    @Test
    void employeeCodeLookupUsesRegistryWhenLinked() {
        EmployeeIdentity emp = new EmployeeIdentity();
        emp.setEmployeeCode(EMP_CODE);
        emp.setPersonId(REGISTRY);
        emp.setPersonName("From Employee");
        when(employeeRepo.findByEmployeeCode(EMP_CODE)).thenReturn(Optional.of(emp));
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, REGISTRY)).thenReturn(List.of());
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.PAYROLL, EMP_CODE)).thenReturn(List.of());
        when(unitRepo.findByPersonId(REGISTRY)).thenReturn(List.of());

        Map<String, Object> out = service.overview(EMP_CODE, auth("DEPT_ADMIN"));
        assertEquals(REGISTRY, out.get("personId"));
        assertTrue((Boolean) out.get("linked"));
    }

    @Test
    void unknownPersonIsNotFound() {
        when(employeeRepo.findByEmployeeCode("missing")).thenReturn(Optional.empty());
        when(employeeRepo.findFirstByPersonId("missing")).thenReturn(Optional.empty());
        when(unitRepo.findByPersonId("missing")).thenReturn(List.of());
        when(alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, "missing")).thenReturn(List.of());

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> service.overview("missing", auth("DEPT_ADMIN")));
        assertEquals(HttpStatus.NOT_FOUND, e.getStatusCode());
    }

    @Test
    void linkedRegistryIdSetFiltersToLinkedPeople() {
        EmployeeIdentity linked = new EmployeeIdentity();
        linked.setPersonId(REGISTRY);
        when(employeeRepo.findByPersonIdIn(List.of(REGISTRY, "other"))).thenReturn(List.of(linked));

        Set<String> out = service.linkedRegistryIds(List.of(REGISTRY, "other"));
        assertEquals(Set.of(REGISTRY), out);
    }
}
