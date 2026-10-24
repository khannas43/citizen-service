package org.magicsword.scheme.service;

import org.magicsword.scheme.model.FamilyData;
import org.magicsword.scheme.model.GuestRuleEvaluationResult;
import org.magicsword.scheme.model.RuleCondition;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RuleEvaluatorService {

    private static final List<String> EDU_ORDER = List.of(
        "NONE", "PRIMARY", "SECONDARY", "MATRIC", "HIGHER_SEC", "GRADUATE", "POST_GRADUATE"
    );

    public boolean evaluate(List<RuleCondition> conditions, String logic, FamilyData family) {
        if (conditions == null || conditions.isEmpty()) return true;
        boolean isOr = "OR".equalsIgnoreCase(logic);
        for (RuleCondition c : conditions) {
            boolean r = evaluateOne(c, family);
            if (isOr && r) return true;
            if (!isOr && !r) return false;
        }
        return !isOr;
    }

    public List<String> describe(List<RuleCondition> conditions) {
        return conditions.stream().map(this::describeOne).collect(Collectors.toList());
    }

    /**
     * Guest scan: missing profile fields yield POSSIBLE (unknown), not a pass.
     */
    public GuestRuleEvaluationResult evaluateGuestConditions(
            List<RuleCondition> conditions,
            String logic,
            FamilyData family,
            Set<String> suppliedFields) {
        GuestRuleEvaluationResult result = new GuestRuleEvaluationResult();
        if (conditions == null || conditions.isEmpty()) {
            return result;
        }
        boolean isOr = "OR".equalsIgnoreCase(logic);
        if (isOr) {
            GuestRuleEvaluationResult anyPass = new GuestRuleEvaluationResult();
            GuestRuleEvaluationResult allUnknown = new GuestRuleEvaluationResult();
            boolean anyDefinitePass = false;
            for (RuleCondition c : conditions) {
                ConditionEval eval = evaluateOneGuest(c, family, suppliedFields);
                if (eval.outcome() == ConditionOutcome.PASS) {
                    anyDefinitePass = true;
                    anyPass.addReason(eval.reasonText(), true);
                } else if (eval.outcome() == ConditionOutcome.FAIL) {
                    anyPass.addReason(eval.reasonText(), false);
                } else {
                    allUnknown.addMissingField(guestFieldKey(c.field()), eval.reasonText());
                }
            }
            if (anyDefinitePass) {
                return anyPass;
            }
            if (allUnknown.getMissingFields().isEmpty()) {
                return anyPass;
            }
            return allUnknown;
        }
        for (RuleCondition c : conditions) {
            ConditionEval eval = evaluateOneGuest(c, family, suppliedFields);
            switch (eval.outcome()) {
                case PASS -> result.addReason(eval.reasonText(), true);
                case FAIL -> result.addReason(eval.reasonText(), false);
                case UNKNOWN -> result.addMissingField(guestFieldKey(c.field()), eval.reasonText());
            }
        }
        return result;
    }

    private enum ConditionOutcome { PASS, FAIL, UNKNOWN }

    private record ConditionEval(ConditionOutcome outcome, String reasonText) {}

    private ConditionEval evaluateOneGuest(RuleCondition c, FamilyData family, Set<String> suppliedFields) {
        String fieldKey = guestFieldKey(c.field());
        if (!isFieldSupplied(fieldKey, suppliedFields)) {
            return new ConditionEval(ConditionOutcome.UNKNOWN, fieldLabel(c.field()) + " required to evaluate this scheme");
        }
        boolean pass = evaluateOne(c, family);
        String text = describeOne(c);
        if (pass) {
            return new ConditionEval(ConditionOutcome.PASS, text);
        }
        return new ConditionEval(ConditionOutcome.FAIL, text + " — not met");
    }

    static String guestFieldKey(String ruleField) {
        return switch (ruleField) {
            case "marital_status" -> "maritalStatus";
            case "employment" -> "employmentStatus";
            case "education" -> "educationLevel";
            default -> ruleField;
        };
    }

    private static String fieldLabel(String ruleField) {
        return switch (ruleField) {
            case "marital_status" -> "Marital status";
            case "employment" -> "Employment / occupation";
            case "education" -> "Education level";
            case "examType" -> "Exam type";
            case "examPercentile" -> "Exam percentile";
            case "village" -> "Village";
            default -> ruleField;
        };
    }

    private static boolean isFieldSupplied(String fieldKey, Set<String> suppliedFields) {
        return suppliedFields != null && suppliedFields.contains(fieldKey);
    }

    private String describeOne(RuleCondition c) {
        return switch (c.field()) {
            case "income" -> "Income " + symbol(c.operator()) + " " + fmtAmount(parseLong(c.value(), 0));
            case "age"    -> "Age " + symbol(c.operator()) + " " + c.value() + " yrs";
            case "caste"  -> "Caste " + symbol(c.operator()) + " [" + c.value() + "]";
            case "gender" -> "Gender " + symbol(c.operator()) + " " + c.value();
            case "district" -> "District " + symbol(c.operator()) + " " + c.value();
            case "education"      -> "Education " + symbol(c.operator()) + " " + c.value();
            case "marital_status" -> "Marital status " + symbol(c.operator()) + " " + c.value();
            case "employment"     -> "Employment " + symbol(c.operator()) + " " + c.value();
            default -> c.field() + " " + c.operator() + " " + c.value();
        };
    }

    private boolean evaluateOne(RuleCondition c, FamilyData family) {
        FamilyData.MemberData head = findHead(family);
        return switch (c.field()) {
            case "income" -> {
                long income = family.getTotalAnnualIncome() != null ? family.getTotalAnnualIncome() : 0L;
                yield compareNum(income, c.operator(), parseLong(c.value(), 0));
            }
            case "age" -> {
                int target = parseInt(c.value(), 0);
                yield family.getMembers().stream()
                        .filter(m -> m.getDob() != null && Boolean.TRUE.equals(m.getIsAlive()))
                        .anyMatch(m -> compareNum(ageOf(m.getDob()), c.operator(), target));
            }
            case "caste"    -> compareStr(head != null ? head.getCasteCategory() : null, c.operator(), c.value());
            case "gender"   -> compareStr(head != null ? head.getGender() : null, c.operator(), c.value());
            case "district" -> compareStr(family.getDistrict(), c.operator(), c.value());
            case "education" -> {
                String edu = head != null ? head.getEducationLevel() : null;
                if (edu == null) yield "!=".equals(c.operator()) || "NOT_IN".equals(c.operator());
                int actualIdx = EDU_ORDER.indexOf(edu.toUpperCase());
                int targetIdx = EDU_ORDER.indexOf(c.value().trim().toUpperCase());
                if (actualIdx < 0 || targetIdx < 0) yield compareStr(edu, c.operator(), c.value());
                yield switch (c.operator()) {
                    case ">=" -> actualIdx >= targetIdx;
                    case "<=" -> actualIdx <= targetIdx;
                    case ">"  -> actualIdx > targetIdx;
                    case "<"  -> actualIdx < targetIdx;
                    default   -> compareStr(edu, c.operator(), c.value());
                };
            }
            case "marital_status" -> compareStr(head != null ? head.getMaritalStatus() : null, c.operator(), c.value());
            case "employment"     -> compareStr(head != null ? head.getEmploymentStatus() : null, c.operator(), c.value());
            default -> true;
        };
    }

    private boolean compareNum(long actual, String op, long target) {
        return switch (op) {
            case "<="  -> actual <= target;
            case ">="  -> actual >= target;
            case "="   -> actual == target;
            case "!="  -> actual != target;
            case "<"   -> actual < target;
            case ">"   -> actual > target;
            default    -> true;
        };
    }

    private boolean compareStr(String actual, String op, String value) {
        if (actual == null) return "!=".equals(op) || "NOT_IN".equals(op);
        Set<String> vs = Arrays.stream(value.split(","))
                .map(String::trim).map(String::toUpperCase).collect(Collectors.toSet());
        String up = actual.trim().toUpperCase();
        return switch (op) {
            case "="       -> up.equals(value.trim().toUpperCase());
            case "!="      -> !up.equals(value.trim().toUpperCase());
            case "IN"      -> vs.contains(up);
            case "NOT_IN"  -> !vs.contains(up);
            default        -> true;
        };
    }

    private FamilyData.MemberData findHead(FamilyData family) {
        return family.getMembers().stream()
                .filter(m -> "HEAD".equalsIgnoreCase(m.getRelationshipToHead()))
                .findFirst()
                .orElse(family.getMembers().isEmpty() ? null : family.getMembers().get(0));
    }

    private int ageOf(LocalDate dob) {
        LocalDate today = LocalDate.now();
        return today.getYear() - dob.getYear()
                - ((today.getMonthValue() < dob.getMonthValue()
                || (today.getMonthValue() == dob.getMonthValue()
                    && today.getDayOfMonth() < dob.getDayOfMonth())) ? 1 : 0);
    }

    private String symbol(String op) {
        return switch (op) {
            case "<=" -> "≤";
            case ">=" -> "≥";
            case "!=" -> "≠";
            case "IN" -> "∈";
            case "NOT_IN" -> "∉";
            default -> op;
        };
    }

    private String fmtAmount(long amount) {
        if (amount >= 100_000) return String.format("₹%.2fL", amount / 100_000.0);
        return "₹" + String.format("%,d", amount);
    }

    private long parseLong(String s, long def) {
        try { return Long.parseLong(s.trim()); } catch (Exception e) { return def; }
    }

    private int parseInt(String s, int def) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return def; }
    }
}
