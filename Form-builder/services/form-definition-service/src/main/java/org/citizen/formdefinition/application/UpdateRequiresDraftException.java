package org.citizen.formdefinition.application;

/** PUT body status is not draft (FB-C3) → HTTP 422. */
public final class UpdateRequiresDraftException extends RuntimeException {

    public UpdateRequiresDraftException() {
        super("Draft update requires status draft");
    }
}
