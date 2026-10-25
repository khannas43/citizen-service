package org.citizen.formdefinition.application;

/** Missing If-Match on a conditional draft update (FB-C3) → HTTP 428. */
public final class IfMatchRequiredException extends RuntimeException {

    public IfMatchRequiredException() {
        super("If-Match header is required");
    }
}
