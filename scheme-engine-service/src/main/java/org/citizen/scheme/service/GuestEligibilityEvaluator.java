package org.citizen.scheme.service;

import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.model.*;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

/**
 * Guest eligibility: scheme columns + demo overlay {@link RuleCondition}s (same model as custom rules).
 */
@Component
public class GuestEligibilityEvaluator {

    private static final UUID WIDOW_PENSION_ID = UUID.fromString("a1000001-0000-0000-0000-000000000004");
    private static final UUID PM_KISAN_ID = UUID.fromString("b1000001-0000-0000-0000-000000000008");
    private static final UUID KISAN_SURAKSHA_ID = UUID.fromString("b1000001-0000-0000-0000-000000000009");
    private static final UUID CROP_LOAN_ID = UUID.fromString("b1000001-0000-0000-0000-000000000010");
    private static final UUID PMAY_GRAMIN_ID = UUID.fromString("b1000001-0000-0000-0000-000000000013");

    private final RuleEvaluatorService ruleEvaluatorService;

    public GuestEligibilityEvaluator(RuleEvaluatorService ruleEvaluatorService) {
        this.ruleEvaluatorService = ruleEvaluatorService;
    }

    public GuestRuleEvaluationResult evaluateScheme(Scheme scheme, FamilyData family, Set<String> suppliedFields) {
        GuestRuleEvaluationResult result = new GuestRuleEvaluationResult();
        if (isStudentScheme(scheme)) {
            result.merge(evaluateStudentScheme(scheme, family, suppliedFields));
        } else {
            result.merge(evaluateSchemeColumns(scheme, family, suppliedFields));
        }
        List<RuleCondition> overlays = overlayConditions(scheme);
        if (!overlays.isEmpty()) {
            result.merge(ruleEvaluatorService.evaluateGuestConditions(overlays, "AND", family, suppliedFields));
        }
        if (PMAY_GRAMIN_ID.equals(scheme.getId()) && !suppliedFields.contains("village")) {
            result.addMissingField("village", "Village / rural address required for Gramin housing schemes");
        }
        return result;
    }

    /** Demo overlay rules applied during guest eligibility (same list used for public criteria). */
    public List<RuleCondition> overlayConditionsFor(Scheme scheme) {
        return overlayConditions(scheme);
    }

    public boolean overlayRequiresVillage(Scheme scheme) {
        return PMAY_GRAMIN_ID.equals(scheme.getId());
    }

    public boolean isStudentSchemePublic(Scheme scheme) {
        return isStudentScheme(scheme);
    }

    private List<RuleCondition> overlayConditions(Scheme scheme) {
        if (WIDOW_PENSION_ID.equals(scheme.getId())) {
            return List.of(new RuleCondition("marital_status", "=", "WIDOWED"));
        }
        if (PM_KISAN_ID.equals(scheme.getId())
                || KISAN_SURAKSHA_ID.equals(scheme.getId())
                || CROP_LOAN_ID.equals(scheme.getId())) {
            return List.of(new RuleCondition("employment", "IN", "FARMER,AGRICULTURIST"));
        }
        if (PMAY_GRAMIN_ID.equals(scheme.getId())) {
            return List.of(new RuleCondition("employment", "IN", "FARMER,AGRICULTURIST,SELF_EMPLOYED"));
        }
        return List.of();
    }

    private GuestRuleEvaluationResult evaluateStudentScheme(Scheme scheme, FamilyData family, Set<String> suppliedFields) {
        GuestRuleEvaluationResult result = new GuestRuleEvaluationResult();
        if (!suppliedFields.contains("examType")) {
            result.addMissingField("examType", "Exam type required for scholarship schemes");
            result.addMissingField("examPercentile", "Exam percentile required for scholarship schemes");
            return result;
        }
        result.merge(evaluateSchemeColumns(scheme, family, suppliedFields));
        FamilyData.MemberData student = findEligibleStudent(scheme, family);
        if (student == null) {
            result.addReason("Exam or income criteria not met for this scholarship", false);
        } else {
            result.addReason("Exam and income criteria met for scholarship", true);
        }
        return result;
    }

    private GuestRuleEvaluationResult evaluateSchemeColumns(Scheme scheme, FamilyData family, Set<String> suppliedFields) {
        GuestRuleEvaluationResult result = new GuestRuleEvaluationResult();
        LocalDate today = LocalDate.now();
        if (scheme.getValidFrom() != null && today.isBefore(scheme.getValidFrom())) {
            result.addReason("Scheme not yet active", false);
            return result;
        }
        if (scheme.getValidTo() != null && today.isAfter(scheme.getValidTo())) {
            result.addReason("Scheme validity has ended", false);
            return result;
        }
        if (scheme.getDistrictScope() != null && !scheme.getDistrictScope().isBlank()) {
            String scope = scheme.getDistrictScope().trim();
            if (!isStateWideDistrictScope(scope)) {
                if (family.getDistrict() == null || !scope.equalsIgnoreCase(family.getDistrict())) {
                    result.addReason("Scheme limited to " + scope, false);
                } else {
                    result.addReason("District " + family.getDistrict() + " within scheme scope", true);
                }
            }
        }
        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            if (!suppliedFields.contains("annualIncome")) {
                result.addMissingField("annualIncome", "Annual family income required for this scheme");
            } else if (income > scheme.getIncomeCeiling()) {
                result.addReason("Income " + formatLakh(income) + " > " + formatLakh(scheme.getIncomeCeiling()) + " (ceiling)", false);
            } else {
                result.addReason("Income " + formatLakh(income) + " < " + formatLakh(scheme.getIncomeCeiling()) + " (ceiling)", true);
            }
        }
        FamilyData.MemberData head = findHead(family);
        if (head == null) {
            result.addReason("Applicant profile required", false);
            return result;
        }
        if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank()) {
            Set<String> allowed = new HashSet<>();
            for (String caste : scheme.getEligibleCastes().split(",")) {
                allowed.add(caste.trim().toUpperCase());
            }
            String headCaste = head.getCasteCategory() != null ? head.getCasteCategory().trim().toUpperCase() : null;
            if (headCaste == null || !allowed.contains(headCaste)) {
                result.addReason("Caste " + (headCaste != null ? headCaste : "—") + " not in eligible list", false);
            } else {
                result.addReason("Caste " + headCaste + " in eligible list", true);
            }
        }
        if (scheme.getGender() != null && !"ANY".equalsIgnoreCase(scheme.getGender())) {
            String need = normalizeGender(scheme.getGender());
            String have = normalizeGender(head.getGender());
            if (have == null || !need.equals(have)) {
                result.addReason("Gender criteria not met (requires " + scheme.getGender() + ")", false);
            } else {
                result.addReason("Gender matches scheme requirement", true);
            }
        }
        if (scheme.getMinAge() != null || scheme.getMaxAge() != null) {
            FamilyData.MemberData ageMember = findAgeEligibleMember(scheme, family, head);
            if (ageMember == null || ageMember.getDob() == null) {
                result.addReason("Age outside published limits for this scheme", false);
            } else {
                int age = ageFromDob(ageMember.getDob());
                if (scheme.getMinAge() != null) {
                    boolean ok = age >= scheme.getMinAge();
                    result.addReason("Age " + age + " ≥ " + scheme.getMinAge() + " (minimum)", ok);
                }
                if (scheme.getMaxAge() != null) {
                    boolean ok = age <= scheme.getMaxAge();
                    result.addReason("Age " + age + " ≤ " + scheme.getMaxAge() + " (maximum)", ok);
                }
            }
        }
        return result;
    }

    boolean isStudentScheme(Scheme scheme) {
        return scheme.getMinPercentile() != null
                || scheme.getDiplomaMinPercentage() != null
                || Boolean.TRUE.equals(scheme.getNeetMbbsEligible());
    }

    private FamilyData.MemberData findEligibleStudent(Scheme scheme, FamilyData family) {
        if (scheme.getIncomeCeiling() != null) {
            long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
            if (income > scheme.getIncomeCeiling()) {
                return null;
            }
        }
        return family.getMembers().stream()
                .filter(m -> m.getIsAlive() == null || m.getIsAlive())
                .filter(m -> m.getExamType() != null)
                .filter(m -> meetsExamCriteria(scheme, m))
                .findFirst()
                .orElse(null);
    }

    private boolean meetsExamCriteria(Scheme scheme, FamilyData.MemberData member) {
        String examType = member.getExamType();
        if (examType == null) return false;
        if ("NEET_MBBS".equalsIgnoreCase(examType)) {
            return Boolean.TRUE.equals(scheme.getNeetMbbsEligible());
        }
        if ("DIPLOMA".equalsIgnoreCase(examType)) {
            return scheme.getDiplomaMinPercentage() != null
                    && member.getExamPercentile() != null
                    && member.getExamPercentile() >= scheme.getDiplomaMinPercentage();
        }
        if (scheme.getMinPercentile() == null || member.getExamPercentile() == null) {
            return false;
        }
        return member.getExamPercentile() >= scheme.getMinPercentile();
    }

    private FamilyData.MemberData findHead(FamilyData family) {
        return family.getMembers().stream()
                .filter(m -> "HEAD".equalsIgnoreCase(m.getRelationshipToHead()))
                .findFirst()
                .orElse(family.getMembers().isEmpty() ? null : family.getMembers().get(0));
    }

    private boolean isStateWideDistrictScope(String scope) {
        return org.citizen.platform.tenancy.StateNames.isStateWide(scope);
    }

    private FamilyData.MemberData findAgeEligibleMember(Scheme scheme, FamilyData family, FamilyData.MemberData head) {
        if (head != null && head.getDob() != null) {
            int headAge = ageFromDob(head.getDob());
            boolean headOk = (scheme.getMinAge() == null || headAge >= scheme.getMinAge())
                    && (scheme.getMaxAge() == null || headAge <= scheme.getMaxAge());
            if (headOk) return head;
        }
        return family.getMembers().stream()
                .filter(m -> m.getDob() != null)
                .filter(m -> {
                    int age = ageFromDob(m.getDob());
                    return (scheme.getMinAge() == null || age >= scheme.getMinAge())
                            && (scheme.getMaxAge() == null || age <= scheme.getMaxAge());
                })
                .findFirst()
                .orElse(head);
    }

    private String normalizeGender(String gender) {
        if (gender == null) return null;
        String g = gender.trim().toUpperCase();
        if (g.startsWith("F")) return "F";
        if (g.startsWith("M")) return "M";
        return g;
    }

    private int ageFromDob(LocalDate dob) {
        LocalDate today = LocalDate.now();
        return today.getYear() - dob.getYear()
                - ((today.getMonthValue() < dob.getMonthValue()
                || (today.getMonthValue() == dob.getMonthValue() && today.getDayOfMonth() < dob.getDayOfMonth())) ? 1 : 0);
    }

    private String formatLakh(long amount) {
        if (amount >= 100_000) return String.format("₹%.2fL", amount / 100_000.0);
        return "₹" + amount;
    }
}
