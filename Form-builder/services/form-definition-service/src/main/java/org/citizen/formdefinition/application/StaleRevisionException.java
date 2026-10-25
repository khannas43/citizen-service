package org.citizen.formdefinition.application;

/** Stale optimistic revision (explicit ETag mismatch or JPA lock failure) → HTTP 412. */
public final class StaleRevisionException extends RuntimeException {

    public StaleRevisionException() {
        super("Form definition revision is stale");
    }

    public StaleRevisionException(Throwable cause) {
        super("Form definition revision is stale", cause);
    }
}
