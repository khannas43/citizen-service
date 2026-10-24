package org.magicsword.formdefinition.application;

/**
 * Persistence-safety rejection for Form Definition coordinate admission (FB-C0).
 * Not a substitute for the five-stage Unit C validator.
 */
public class FormDefinitionAdmissionException extends RuntimeException {

    public FormDefinitionAdmissionException(String message) {
        super(message);
    }

    public FormDefinitionAdmissionException(String message, Throwable cause) {
        super(message, cause);
    }
}
