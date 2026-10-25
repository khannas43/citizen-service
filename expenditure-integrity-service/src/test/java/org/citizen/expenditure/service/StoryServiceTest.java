package org.citizen.expenditure.service;

import org.junit.jupiter.api.Test;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.EntitlementUnit;
import org.citizen.expenditure.repository.EntitlementUnitRepository;
import org.citizen.expenditure.repository.IntegrityAlertRepository;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StoryServiceTest {

    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    OverviewService overview = mock(OverviewService.class);
    IntegrityCaseService cases = mock(IntegrityCaseService.class);
    EntitlementUnitRepository unitRepo = mock(EntitlementUnitRepository.class);
    StoryService service = new StoryService(alertRepo, overview, cases, unitRepo);

    IntegrityAlert alert(String rule, IntegrityDomain domain, String status, String delta, String person, Map<String, Object> evidence) {
        IntegrityAlert a = new IntegrityAlert();
        a.setId(UUID.randomUUID());
        a.setCaseId(UUID.randomUUID());
        a.setRuleCode(rule);
        a.setDomain(domain);
        a.setStatus(status);
        a.setAmountDelta(new BigDecimal(delta));
        a.setPersonName(person);
        a.setSchemeName(domain == IntegrityDomain.BENEFICIARY ? "MYSY" : null);
        a.setEvidence(evidence);
        return a;
    }

    @Test
    void picksAnOpenCaseOverALargerResolvedOneAndWritesAHeadline() {
        IntegrityAlert open = alert("802", IntegrityDomain.BENEFICIARY, "OPEN", "5000", "Raju Nayak", Map.of("variant", "OVER_SETTLEMENT", "authorizedAmount", 10000.0, "netSettled", 15000.0));
        IntegrityAlert bigger = alert("802", IntegrityDomain.BENEFICIARY, "RESOLVED", "9000", "Old Case", Map.of("variant", "OVER_SETTLEMENT"));
        IntegrityAlert notOverSettlement = alert("802", IntegrityDomain.BENEFICIARY, "OPEN", "99999", "Mutual", Map.of("variant", "MUTUAL_EXCLUSION"));
        when(alertRepo.findAll()).thenReturn(List.of(bigger, notOverSettlement, open));

        List<StoryService.Scenario> out = service.scenarios(d -> true);
        assertEquals(1, out.size());
        assertEquals("Raju Nayak", out.get(0).personName());
        assertEquals("Raju Nayak is entitled to ₹10000 under MYSY, but ₹15000 has been paid.", out.get(0).headline());
    }

    @Test
    void tellsTheThreeStoriesAndLeavesOutPayrollForARoleThatCannotReadIt() {
        IntegrityAlert pay = alert("S01", IntegrityDomain.PAYROLL, "OPEN", "42000", "Demo Officer", Map.of("ddoA", "DDO-A", "ddoB", "DDO-B", "overlapDays", 31));
        IntegrityAlert after = alert("S02", IntegrityDomain.PAYROLL, "RESOLVED", "8500", "P Chamar", Map.of("lastPayDate", "2024-08-31", "statusSince", "2024-07-01", "post", "Clerk", "ddoCode", "DDO-X"));
        IntegrityAlert dup = alert("802", IntegrityDomain.BENEFICIARY, "OPEN", "5000", "Raju", Map.of("variant", "OVER_SETTLEMENT"));
        when(alertRepo.findAll()).thenReturn(List.of(pay, after, dup));

        List<StoryService.Scenario> all = service.scenarios(d -> true);
        assertEquals(List.of("DUPLICATE_PAYMENT", "DOUBLE_SALARY", "PAID_AFTER_STATUS_CHANGE"), all.stream().map(StoryService.Scenario::key).toList());
        assertEquals("DDO-A and DDO-B both paid Demo Officer basic salary for 31 of the same days.", all.get(1).headline());
        assertEquals("Clerk · DDO-X", all.get(2).subject());

        List<StoryService.Scenario> beneficiaryOnly = service.scenarios(d -> d == IntegrityDomain.BENEFICIARY);
        assertEquals(List.of("DUPLICATE_PAYMENT"), beneficiaryOnly.stream().map(StoryService.Scenario::key).toList());
    }

    @Test
    void theHeadlineUsesTheNameOnTheEntitlementWhenTheAlertCarriesAStaleOne() {
        IntegrityAlert stale = alert("802", IntegrityDomain.BENEFICIARY, "OPEN", "5000", "Stale Name", Map.of("variant", "OVER_SETTLEMENT", "authorizedAmount", 10000, "netSettled", 15000));
        EntitlementUnit unit = new EntitlementUnit();
        unit.setId(UUID.randomUUID());
        unit.setPersonName("Pooja Desai");
        unit.setSchemeName("Mukhyamantri Yuva Swavalamban Yojana (MYSY)");
        when(alertRepo.findAll()).thenReturn(List.of(stale));
        when(cases.resolveUnitIdsForAlert(stale)).thenReturn(List.of(unit.getId()));
        when(unitRepo.findById(unit.getId())).thenReturn(Optional.of(unit));
        StoryService.Scenario s = service.scenarios(d -> true).get(0);
        assertEquals("Pooja Desai", s.personName());
        assertTrue(s.headline().startsWith("Pooja Desai is entitled to ₹10000 under Mukhyamantri Yuva"));
        verify(alertRepo, never()).save(any());
    }

    @Test
    void aMissingScenarioIsSimplyLeftOut() {
        when(alertRepo.findAll()).thenReturn(List.of());
        assertTrue(service.scenarios(d -> true).isEmpty());
    }

    @Test
    void summaryCarriesTotalsOnly() {
        Map<String, Object> totals = new HashMap<>();
        totals.put("openAlerts", 447L);
        totals.put("flaggedAmount", new BigDecimal("520000"));
        totals.put("personName", "should never be copied");
        when(overview.overview()).thenReturn(Map.of("totals", totals));
        Map<String, Object> s = service.summary();
        assertEquals(447L, s.get("openAlerts"));
        assertFalse(s.containsKey("personName"));
    }
}
