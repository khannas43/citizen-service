package org.citizen.formdefinition.validation;

import java.util.Objects;

/** Issue aligned with {@code @citizen/form-contract} ValidationIssue. */
public final class ValidationIssue {

    private final String code;
    private final String message;
    private final ValidationSeverity severity;
    private final String path;

    public ValidationIssue(String code, String message, ValidationSeverity severity, String path) {
        this.code = Objects.requireNonNull(code, "code");
        this.message = Objects.requireNonNull(message, "message");
        this.severity = Objects.requireNonNull(severity, "severity");
        this.path = path;
    }

    public static ValidationIssue error(String code, String message, String path) {
        return new ValidationIssue(code, message, ValidationSeverity.error, path);
    }

    public String code() {
        return code;
    }

    public String message() {
        return message;
    }

    public ValidationSeverity severity() {
        return severity;
    }

    public String path() {
        return path;
    }
}
