package org.citizen.formdefinition.application;

/** Invalid lifecycle/new-draft actor or createdBy assertion (FB-C4) → HTTP 400. */
public final class InvalidActorException extends RuntimeException {

    public InvalidActorException() {
        super("Actor identity is invalid");
    }
}
