package org.magicsword.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.model.FamilyData;
import org.magicsword.scheme.model.GuestEligibilityOutcome;
import org.magicsword.scheme.model.GuestRuleEvaluationResult;
import org.magicsword.scheme.model.RuleCondition;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class GuestEligibilityEvaluatorTest {

    private GuestEligibilityEvaluator evaluator;
    private RuleEvaluatorService ruleEvaluatorService;

    @BeforeEach
    void setUp() {
        ruleEvaluatorService = new RuleEvaluatorService();
        evaluator = new GuestEligibilityEvaluator(ruleEvaluatorService);
    }

    @Test
    void widowPension_missingMaritalStatus_isPossible() {
        Scheme scheme = widowPension();
        FamilyData family = guestFamily("F", "OBC", 36, null, null);
        GuestRuleEvaluationResult result = evaluator.evaluateScheme(scheme, family, Set.of("gender", "casteCategory", "district", "dob"));
        assertEquals(GuestEligibilityOutcome.POSSIBLE, result.getOutcome());
        assertTrue(result.getMissingFields().contains("maritalStatus"));
    }

    @Test
    void widowPension_missingIncome_isPossibleWithIncomeMissing() {
        GuestRuleEvaluationResult result = evaluator.evaluateScheme(
                widowPension(), guestFamily("F", "OBC", 36, "WIDOWED", null),
                Set.of("gender", "casteCategory", "district", "dob", "maritalStatus"));
        assertEquals(GuestEligibilityOutcome.POSSIBLE, result.getOutcome());
        assertTrue(result.getMissingFields().contains("annualIncome"));
    }

    @Test
    void widowPension_widowedFemale_isLikelyEligible() {
        Scheme scheme = widowPension();
        FamilyData family = guestFamily("F", "OBC", 36, "WIDOWED", null);
        GuestRuleEvaluationResult result = evaluator.evaluateScheme(
                scheme, family, Set.of("gender", "casteCategory", "district", "dob", "annualIncome", "maritalStatus"));
        assertEquals(GuestEligibilityOutcome.LIKELY_ELIGIBLE, result.getOutcome());
    }

    @Test
    void pmKisan_missingEmployment_isPossible() {
        Scheme scheme = pmKisan();
        FamilyData family = guestFamily("F", "OBC", 36, null, null);
        GuestRuleEvaluationResult result = evaluator.evaluateScheme(scheme, family, Set.of("gender", "casteCategory", "district", "dob"));
        assertEquals(GuestEligibilityOutcome.POSSIBLE, result.getOutcome());
        assertTrue(result.getMissingFields().contains("employmentStatus"));
    }

    @Test
    void pmKisan_farmerEmployment_isLikelyEligible() {
        Scheme scheme = pmKisan();
        FamilyData family = guestFamily("F", "OBC", 36, null, "FARMER");
        GuestRuleEvaluationResult result = evaluator.evaluateScheme(
                scheme, family, Set.of("gender", "casteCategory", "district", "dob", "annualIncome", "employmentStatus"));
        assertEquals(GuestEligibilityOutcome.LIKELY_ELIGIBLE, result.getOutcome());
    }

    @Test
    void ruleEvaluator_missingField_isPossibleNotPass() {
        List<RuleCondition> conditions = List.of(new RuleCondition("marital_status", "=", "WIDOWED"));
        FamilyData family = guestFamily("F", "OBC", 36, null, null);
        GuestRuleEvaluationResult result = ruleEvaluatorService.evaluateGuestConditions(
                conditions, "AND", family, Set.of("gender"));
        assertEquals(GuestEligibilityOutcome.POSSIBLE, result.getOutcome());
        assertTrue(result.getMissingFields().contains("maritalStatus"));
    }

    @Test
    void ruleEvaluator_failingCondition_isNotEligible() {
        List<RuleCondition> conditions = List.of(new RuleCondition("employment", "IN", "FARMER"));
        FamilyData family = guestFamily("F", "OBC", 36, null, "UNEMPLOYED");
        GuestRuleEvaluationResult result = ruleEvaluatorService.evaluateGuestConditions(
                conditions, "AND", family, Set.of("employmentStatus"));
        assertEquals(GuestEligibilityOutcome.NOT_ELIGIBLE, result.getOutcome());
        assertTrue(result.getReasons().stream().anyMatch(r -> !r.passed()));
    }

    private static Scheme widowPension() {
        Scheme s = new Scheme();
        s.setId(UUID.fromString("a1000001-0000-0000-0000-000000000004"));
        s.setName("Widow Pension");
        s.setIncomeCeiling(150_000L);
        s.setEligibleCastes("OBC,SC,ST,NT");
        s.setMinAge(18);
        s.setGender("FEMALE");
        s.setValidFrom(LocalDate.of(2020, 1, 1));
        s.setValidTo(LocalDate.of(2030, 12, 31));
        return s;
    }

    private static Scheme pmKisan() {
        Scheme s = new Scheme();
        s.setId(UUID.fromString("b1000001-0000-0000-0000-000000000008"));
        s.setName("PM Kisan Samman Nidhi");
        s.setIncomeCeiling(400_000L);
        s.setEligibleCastes("OBC,SC,ST,NT,GENERAL");
        s.setMinAge(21);
        s.setMaxAge(70);
        s.setGender("ANY");
        s.setValidFrom(LocalDate.of(2019, 2, 1));
        s.setValidTo(LocalDate.of(2030, 12, 31));
        return s;
    }

    private static FamilyData guestFamily(String gender, String caste, int age, String marital, String employment) {
        FamilyData.MemberData head = new FamilyData.MemberData();
        head.setRelationshipToHead("HEAD");
        head.setIsAlive(true);
        head.setGender(gender);
        head.setCasteCategory(caste);
        head.setDob(LocalDate.now().minusYears(age));
        head.setMaritalStatus(marital);
        head.setEmploymentStatus(employment);
        FamilyData family = new FamilyData();
        family.setMembers(List.of(head));
        family.setDistrict("Ahmedabad");
        family.setTotalAnnualIncome(120_000L);
        return family;
    }
}
