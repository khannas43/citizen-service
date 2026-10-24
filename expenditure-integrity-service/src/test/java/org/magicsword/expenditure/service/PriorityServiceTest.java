package org.magicsword.expenditure.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.expenditure.entity.IntegrityAlert;
import org.magicsword.expenditure.repository.IntegrityAlertRepository;
import org.magicsword.expenditure.repository.IntegrityCaseRepository;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PriorityServiceTest {

    IntegrityAlertRepository alertRepo = mock(IntegrityAlertRepository.class);
    IntegrityCaseRepository caseRepo = mock(IntegrityCaseRepository.class);
    OverviewService overview = mock(OverviewService.class);
    PriorityService service = new PriorityService(alertRepo, caseRepo, overview);

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(service, "noAmountWeight", 5000L);
        when(alertRepo.findAll()).thenReturn(List.of());
        when(caseRepo.findAll()).thenReturn(List.of());
        when(overview.ruleHealth(anyList(), anyMap())).thenReturn(List.of(
                Map.of("ruleCode", "802", "reviewed", 50L, "confirmed", 36L, "precisionPercent", 72.0, "enoughEvidence", true),
                Map.of("ruleCode", "805", "reviewed", 3L, "confirmed", 1L, "precisionPercent", 33.3, "enoughEvidence", false)
        ));
    }

    IntegrityAlert openAlert(String rule, BigDecimal amount, String severity, LocalDateTime detectedAt) {
        IntegrityAlert a = new IntegrityAlert();
        a.setStatus("OPEN");
        a.setRuleCode(rule);
        a.setAmountDelta(amount);
        a.setSeverity(severity);
        a.setDetectedAt(detectedAt);
        return a;
    }

    @Test
    void scoreIsAmountTimesRulePrecisionWhenEnoughEvidence() {
        IntegrityAlert a = openAlert("802", new BigDecimal("10000"), "HIGH", LocalDateTime.now());
        service.applyPriority(List.of(a));
        assertEquals(7200L, a.getPriority());
        assertFalse(a.getPriorityEstimated());
        assertTrue(a.getPriorityReason().contains("72%"));
        assertTrue(a.getPriorityReason().contains("10,000"));
    }

    @Test
    void fallsBackToOverallPrecisionWhenRuleHasThinEvidence() {
        IntegrityAlert a = openAlert("805", new BigDecimal("10000"), "MEDIUM", LocalDateTime.now());
        service.applyPriority(List.of(a));
        // overall: (36+1)/(50+3) = 37/53 ≈ 69.8%
        assertTrue(a.getPriorityEstimated());
        assertTrue(a.getPriorityReason().contains("overall checks"));
        assertTrue(a.getPriority() > 6000 && a.getPriority() < 7500);
    }

    @Test
    void noAmountUsesFixedWeight() {
        IntegrityAlert a = openAlert("805", null, "LOW", LocalDateTime.now());
        service.applyPriority(List.of(a));
        assertNotNull(a.getPriority());
        assertTrue(a.getPriorityReason().contains("fixed weight"));
    }

    @Test
    void compareAlertsUsesScoreThenSeverityThenAge() {
        LocalDateTime older = LocalDateTime.of(2026, 1, 1, 0, 0);
        LocalDateTime newer = LocalDateTime.of(2026, 6, 1, 0, 0);
        IntegrityAlert high = openAlert("802", new BigDecimal("10000"), "HIGH", older);
        IntegrityAlert low = openAlert("802", new BigDecimal("10000"), "LOW", newer);
        service.applyPriority(List.of(high, low));
        assertTrue(PriorityService.compareAlerts(high, low) < 0);
        IntegrityAlert sameSevOld = openAlert("802", new BigDecimal("10000"), "HIGH", older);
        IntegrityAlert sameSevNew = openAlert("802", new BigDecimal("10000"), "HIGH", newer);
        service.applyPriority(List.of(sameSevOld, sameSevNew));
        assertTrue(PriorityService.compareAlerts(sameSevOld, sameSevNew) < 0);
    }

    @Test
    void resolvedAlertsAreNotScored() {
        IntegrityAlert a = openAlert("802", new BigDecimal("1000"), "HIGH", LocalDateTime.now());
        a.setStatus("RESOLVED");
        service.applyPriority(List.of(a));
        assertNull(a.getPriority());
    }
}
