package org.citizen.formdefinition.application;

/** Client attempted to change immutable creation audit fields (FB-C3) → HTTP 409. */
public final class ImmutableCreationAuditChangedException extends RuntimeException {

    public ImmutableCreationAuditChangedException() {
        super("Creation audit fields are immutable");
    }
}
