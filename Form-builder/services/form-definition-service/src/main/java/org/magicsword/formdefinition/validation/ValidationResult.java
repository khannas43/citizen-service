package org.magicsword.formdefinition.validation;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

/** Result aligned with {@code @dg20/form-contract} ValidationResult. */
public final class ValidationResult {

    private final boolean valid;
    private final List<ValidationIssue> issues;

    public ValidationResult(boolean valid, List<ValidationIssue> issues) {
        this.valid = valid;
        this.issues = Collections.unmodifiableList(List.copyOf(Objects.requireNonNull(issues, "issues")));
    }

    public boolean valid() {
        return valid;
    }

    public List<ValidationIssue> issues() {
        return issues;
    }
}
