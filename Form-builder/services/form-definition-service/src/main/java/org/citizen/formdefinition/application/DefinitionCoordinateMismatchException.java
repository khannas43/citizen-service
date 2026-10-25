package org.citizen.formdefinition.application;

/** Body coordinates do not exactly match the targeted resource (FB-C3) → HTTP 409. */
public final class DefinitionCoordinateMismatchException extends RuntimeException {

    public DefinitionCoordinateMismatchException() {
        super("Form definition coordinates do not match");
    }
}
