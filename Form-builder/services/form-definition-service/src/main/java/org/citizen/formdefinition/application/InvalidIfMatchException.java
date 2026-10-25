package org.citizen.formdefinition.application;

/** Malformed, weak, wildcard, multiple, or padded If-Match (FB-C3) → HTTP 400. */
public final class InvalidIfMatchException extends RuntimeException {

    public InvalidIfMatchException() {
        super("If-Match header is invalid");
    }
}
