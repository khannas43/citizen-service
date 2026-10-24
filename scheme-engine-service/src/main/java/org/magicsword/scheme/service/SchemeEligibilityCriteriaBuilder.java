package org.magicsword.scheme.service;

import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.model.RuleCondition;
import org.magicsword.scheme.model.SchemePublicCriterion;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class SchemeEligibilityCriteriaBuilder {

    private final GuestEligibilityEvaluator guestEligibilityEvaluator;

    public SchemeEligibilityCriteriaBuilder(GuestEligibilityEvaluator guestEligibilityEvaluator) {
        this.guestEligibilityEvaluator = guestEligibilityEvaluator;
    }

    public List<SchemePublicCriterion> build(Scheme scheme) {
        List<SchemePublicCriterion> out = new ArrayList<>();

        if (scheme.getMinAge() != null || scheme.getMaxAge() != null) {
            String value;
            if (scheme.getMinAge() != null && scheme.getMaxAge() != null) {
                value = scheme.getMinAge() + " to " + scheme.getMaxAge() + " years";
            } else if (scheme.getMinAge() != null) {
                value = "At least " + scheme.getMinAge() + " years";
            } else {
                value = "Up to " + scheme.getMaxAge() + " years";
            }
            out.add(new SchemePublicCriterion(
                    "age", "Age", "ઉંમર", value, "range", "SCHEME"));
        }

        if (scheme.getGender() != null && !scheme.getGender().isBlank()) {
            String g = scheme.getGender().trim();
            String human = "ANY".equalsIgnoreCase(g) ? "Any" : humanGender(g);
            out.add(new SchemePublicCriterion(
                    "gender", "Gender", "લિંગ", human, "=", "SCHEME"));
        }

        if (scheme.getEligibleCastes() != null && !scheme.getEligibleCastes().isBlank()) {
            String castes = String.join(", ", scheme.getEligibleCastes().split(",")).trim().toUpperCase(Locale.ROOT);
            out.add(new SchemePublicCriterion(
                    "casteCategory", "Caste category", "જાતિ શ્રેણી", castes, "one of", "SCHEME"));
        }

        if (scheme.getIncomeCeiling() != null) {
            out.add(new SchemePublicCriterion(
                    "annualIncome", "Annual family income", "વાર્ષિક કુટુંબ આવક",
                    "Up to " + formatLakh(scheme.getIncomeCeiling()), "<=", "SCHEME"));
        }

        if (scheme.getDistrictScope() != null && !scheme.getDistrictScope().isBlank()) {
            String scope = scheme.getDistrictScope().trim();
            String human = isStateWide(scope) ? "Gujarat (state-wide)" : scope;
            out.add(new SchemePublicCriterion(
                    "district", "District / area", "જિલ્લો / વિસ્તાર", human, "=", "SCHEME"));
        }

        for (RuleCondition c : guestEligibilityEvaluator.overlayConditionsFor(scheme)) {
            out.add(fromOverlayRule(c));
        }

        if (guestEligibilityEvaluator.overlayRequiresVillage(scheme)) {
            out.add(new SchemePublicCriterion(
                    "village", "Rural residence", "ગ્રામીણ સરનામું",
                    "Village address required", "required", "OVERLAY"));
        }

        if (guestEligibilityEvaluator.isStudentSchemePublic(scheme)) {
            if (Boolean.TRUE.equals(scheme.getNeetMbbsEligible())) {
                out.add(new SchemePublicCriterion(
                        "examType", "Exam type", "પરીક્ષા પ્રકાર",
                        "NEET (MBBS admission)", "one of", "STUDENT"));
            }
            if (scheme.getMinPercentile() != null) {
                out.add(new SchemePublicCriterion(
                        "examPercentile", "Minimum exam percentile", "ન્યૂનતમ પરીક્ષા પર્સેન્ટાઈલ",
                        "At least " + trimNum(scheme.getMinPercentile()) + "%", ">=", "STUDENT"));
            }
            if (scheme.getDiplomaMinPercentage() != null) {
                out.add(new SchemePublicCriterion(
                        "examPercentile", "Diploma minimum marks", "ડિપ્લોમા ન્યૂનતમ ટકાવારી",
                        "At least " + trimNum(scheme.getDiplomaMinPercentage()) + "% (D-to-D diploma)", ">=", "STUDENT"));
            }
            out.add(new SchemePublicCriterion(
                    "examType", "Scholarship exam details", "શિષ્યવૃત્તિ પરીક્ષા વિગત",
                    "Exam type and percentile required when checking scholarships", "required", "STUDENT"));
        }

        return out;
    }

    private SchemePublicCriterion fromOverlayRule(RuleCondition c) {
        String field = c.field() != null ? c.field() : "";
        return switch (field) {
            case "marital_status" -> new SchemePublicCriterion(
                    "maritalStatus", "Marital status", "વૈવાહિક સ્થિતિ",
                    humanizeRuleValue(c), humanOperator(c.operator()), "OVERLAY");
            case "employment" -> new SchemePublicCriterion(
                    "employmentStatus", "Employment / occupation", "રોજગાર",
                    humanizeRuleValue(c), humanOperator(c.operator()), "OVERLAY");
            default -> new SchemePublicCriterion(
                    field, humanField(field), null,
                    humanizeRuleValue(c), humanOperator(c.operator()), "OVERLAY");
        };
    }

    static String formatLakh(long amount) {
        if (amount >= 100_000) {
            return String.format("₹%.2f lakh", amount / 100_000.0);
        }
        return "₹" + amount;
    }

    private static boolean isStateWide(String scope) {
        return "Gujarat".equalsIgnoreCase(scope) || "ગુજરાત".equals(scope);
    }

    private static String humanGender(String g) {
        if (g.toUpperCase(Locale.ROOT).startsWith("F")) return "Female";
        if (g.toUpperCase(Locale.ROOT).startsWith("M")) return "Male";
        return g;
    }

    private static String humanOperator(String op) {
        if (op == null) return "";
        return switch (op) {
            case "<=" -> "up to";
            case ">=" -> "at least";
            case "=" -> "must be";
            case "!=" -> "must not be";
            case "IN" -> "one of";
            case "NOT_IN" -> "not one of";
            default -> op;
        };
    }

    private static String humanizeRuleValue(RuleCondition c) {
        if ("IN".equals(c.operator()) || "NOT_IN".equals(c.operator())) {
            return String.join(", ", c.value().split(",")).replace('_', ' ').trim();
        }
        return c.value().replace('_', ' ').trim();
    }

    private static String humanField(String field) {
        return switch (field) {
            case "education" -> "Education";
            case "marital_status" -> "Marital status";
            case "employment" -> "Employment";
            default -> field;
        };
    }

    private static String trimNum(double n) {
        if (n == Math.rint(n)) return String.valueOf((long) n);
        return String.valueOf(n);
    }
}
