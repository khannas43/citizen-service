package org.magicsword.formdefinition.application;

/** Version allocation would overflow positive int range (FB-C4) → HTTP 409. */
public final class VersionExhaustedException extends RuntimeException {

    public VersionExhaustedException() {
        super("Form Definition version space is exhausted");
    }
}
