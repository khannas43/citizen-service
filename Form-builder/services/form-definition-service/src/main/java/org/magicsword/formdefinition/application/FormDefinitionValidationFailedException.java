package org.magicsword.formdefinition.application;

import java.util.List;

import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationResult;

/**
 * Raised when an external create is rejected by {@code FormDefinitionValidationPipeline}.
 */
public final class FormDefinitionValidationFailedException extends RuntimeException {

    private final ValidationResult result;

    public FormDefinitionValidationFailedException(ValidationResult result) {
        super("Form Definition validation failed");
        this.result = result;
    }

    public ValidationResult result() {
        return result;
    }

    public List<ValidationIssue> issues() {
        return result.issues();
    }
}
