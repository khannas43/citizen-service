package org.magicsword.scheme.model;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class GuestRuleEvaluationResult {
    private GuestEligibilityOutcome outcome = GuestEligibilityOutcome.LIKELY_ELIGIBLE;
    private final List<GuestReasonLine> reasons = new ArrayList<>();
    private final Set<String> missingFields = new LinkedHashSet<>();

    public GuestEligibilityOutcome getOutcome() { return outcome; }
    public List<GuestReasonLine> getReasons() { return reasons; }
    public Set<String> getMissingFields() { return missingFields; }

    public void addReason(String text, boolean passed) {
        reasons.add(new GuestReasonLine(text, passed));
        if (!passed) {
            outcome = GuestEligibilityOutcome.NOT_ELIGIBLE;
        }
    }

    public void addMissingField(String fieldKey, String reasonText) {
        missingFields.add(fieldKey);
        reasons.add(new GuestReasonLine(reasonText, false));
        if (outcome != GuestEligibilityOutcome.NOT_ELIGIBLE) {
            outcome = GuestEligibilityOutcome.POSSIBLE;
        }
    }

    public void merge(GuestRuleEvaluationResult other) {
        reasons.addAll(other.reasons);
        missingFields.addAll(other.missingFields);
        outcome = combine(outcome, other.outcome);
    }

    public static GuestEligibilityOutcome combine(GuestEligibilityOutcome a, GuestEligibilityOutcome b) {
        if (a == GuestEligibilityOutcome.NOT_ELIGIBLE || b == GuestEligibilityOutcome.NOT_ELIGIBLE) {
            return GuestEligibilityOutcome.NOT_ELIGIBLE;
        }
        if (a == GuestEligibilityOutcome.POSSIBLE || b == GuestEligibilityOutcome.POSSIBLE) {
            return GuestEligibilityOutcome.POSSIBLE;
        }
        return GuestEligibilityOutcome.LIKELY_ELIGIBLE;
    }
}
