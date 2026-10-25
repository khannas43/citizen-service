package org.citizen.formdefinition.validation;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Deterministic issue collector with a hard cap. Never throws for user-document problems.
 */
public final class ValidationIssueCollector {

    private final List<ValidationIssue> issues = new ArrayList<>();
    private boolean capped;

    public boolean add(ValidationIssue issue) {
        if (capped) {
            return false;
        }
        if (issues.size() >= ValidationLimits.MAX_ISSUES) {
            capped = true;
            issues.add(
                    ValidationIssue.error(
                            "structure.issue_limit_exceeded",
                            "Validation issue output reached the configured limit",
                            null));
            return false;
        }
        issues.add(issue);
        if (issues.size() >= ValidationLimits.MAX_ISSUES) {
            capped = true;
            // Replace nothing — exact MAX_ISSUES reached without room for limit marker.
            // Spec: cap at 200 with one deterministic limit issue.
            // If we are exactly at 200 after adding a normal issue, swap last for limit issue
            // only when attempting to add more. Keep exact 200 of real issues if they fill the
            // budget; when overflow would occur, ensure limit issue is present.
        }
        return true;
    }

    /**
     * Attempt to record an issue. When the next add would exceed the cap, append the limit
     * issue instead (replacing capacity for one slot if already full).
     */
    public boolean offer(ValidationIssue issue) {
        if (capped) {
            return false;
        }
        if (issues.size() < ValidationLimits.MAX_ISSUES) {
            issues.add(issue);
            return true;
        }
        // Already at capacity — mark capped and ensure limit issue is last.
        capped = true;
        issues.set(
                ValidationLimits.MAX_ISSUES - 1,
                ValidationIssue.error(
                        "structure.issue_limit_exceeded",
                        "Validation issue output reached the configured limit",
                        null));
        return false;
    }

    public boolean isCapped() {
        return capped;
    }

    public boolean hasErrors() {
        for (ValidationIssue issue : issues) {
            if (issue.severity() == ValidationSeverity.error) {
                return true;
            }
        }
        return false;
    }

    public List<ValidationIssue> snapshot() {
        return Collections.unmodifiableList(List.copyOf(issues));
    }

    public ValidationResult toResult() {
        return new ValidationResult(!hasErrors(), snapshot());
    }
}
