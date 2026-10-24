package org.magicsword.formdefinition.application;

/** Raised when a requested Form Definition coordinate does not exist. */
public final class FormDefinitionNotFoundException extends RuntimeException {

    public FormDefinitionNotFoundException(String serviceId, int version) {
        super("Form definition not found");
        // Intentionally omit coordinates from the message used by HTTP mapping.
    }
}
