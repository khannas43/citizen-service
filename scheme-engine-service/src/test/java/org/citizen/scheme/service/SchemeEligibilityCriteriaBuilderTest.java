package org.citizen.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.model.SchemePublicCriterion;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class SchemeEligibilityCriteriaBuilderTest {

    private SchemeEligibilityCriteriaBuilder builder;

    @BeforeEach
    void setUp() {
        GuestEligibilityEvaluator evaluator = new GuestEligibilityEvaluator(new RuleEvaluatorService());
        builder = new SchemeEligibilityCriteriaBuilder(evaluator);
    }

    @Test
    void columnOnlyScheme_includesAgeGenderCasteIncomeDistrict() {
        Scheme scheme = baseScheme();
        scheme.setMinAge(18);
        scheme.setMaxAge(60);
        scheme.setGender("FEMALE");
        scheme.setEligibleCastes("SC,ST,OBC");
        scheme.setIncomeCeiling(150_000L);
        scheme.setDistrictScope("Ahmedabad");

        List<SchemePublicCriterion> criteria = builder.build(scheme);
        assertTrue(criteria.stream().anyMatch(c -> "age".equals(c.key()) && c.value().contains("18")));
        assertTrue(criteria.stream().anyMatch(c -> "gender".equals(c.key()) && c.value().contains("Female")));
        assertTrue(criteria.stream().anyMatch(c -> "casteCategory".equals(c.key()) && c.value().contains("OBC")));
        assertTrue(criteria.stream().anyMatch(c -> "annualIncome".equals(c.key()) && c.value().contains("lakh")));
        assertTrue(criteria.stream().anyMatch(c -> "district".equals(c.key()) && c.value().contains("Ahmedabad")));
    }

    @Test
    void widowPension_includesMaritalOverlay() {
        Scheme scheme = baseScheme();
        scheme.setId(UUID.fromString("a1000001-0000-0000-0000-000000000004"));
        scheme.setName("Widow Pension");

        List<SchemePublicCriterion> criteria = builder.build(scheme);
        SchemePublicCriterion marital = criteria.stream()
                .filter(c -> "maritalStatus".equals(c.key()))
                .findFirst()
                .orElseThrow();
        assertEquals("OVERLAY", marital.source());
        assertTrue(marital.value().toUpperCase().contains("WIDOWED"));
    }

    @Test
    void studentScheme_includesPercentileCriteria() {
        Scheme scheme = baseScheme();
        scheme.setMinPercentile(80.0);
        scheme.setNeetMbbsEligible(true);

        List<SchemePublicCriterion> criteria = builder.build(scheme);
        assertTrue(criteria.stream().anyMatch(c -> "examPercentile".equals(c.key()) && c.value().contains("80")));
        assertTrue(criteria.stream().anyMatch(c -> "examType".equals(c.key()) && c.value().contains("NEET")));
    }

    @Test
    void stateWideDistrict_showsGujaratLabel() {
        Scheme scheme = baseScheme();
        scheme.setDistrictScope("Gujarat");

        List<SchemePublicCriterion> criteria = builder.build(scheme);
        SchemePublicCriterion district = criteria.stream()
                .filter(c -> "district".equals(c.key()))
                .findFirst()
                .orElseThrow();
        assertTrue(district.value().contains("state-wide"));
    }

    private static Scheme baseScheme() {
        Scheme s = new Scheme();
        s.setId(UUID.randomUUID());
        s.setName("Test Scheme");
        s.setIsActive(true);
        s.setValidFrom(LocalDate.now().minusYears(1));
        s.setValidTo(LocalDate.now().plusYears(1));
        return s;
    }
}
