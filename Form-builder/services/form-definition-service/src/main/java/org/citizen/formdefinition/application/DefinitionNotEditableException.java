package org.citizen.formdefinition.application;

/** Stored definition is not a draft and cannot be updated (FB-C3) → HTTP 409. */
public final class DefinitionNotEditableException extends RuntimeException {

    public DefinitionNotEditableException() {
        super("Form definition is not editable");
    }
}
