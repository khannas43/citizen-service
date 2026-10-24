package org.magicsword.formdefinition.application;

/** Malformed lifecycle transition request body (FB-C4) → HTTP 400. */
public final class InvalidTransitionRequestException extends RuntimeException {

    public InvalidTransitionRequestException() {
        super("Lifecycle transition request is invalid");
    }
}
