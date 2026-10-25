package org.citizen.formdefinition.application;

/** Disallowed lifecycle transition (skip/reverse/repeat/retired) (FB-C4) → HTTP 409. */
public final class LifecycleTransitionNotAllowedException extends RuntimeException {

    public LifecycleTransitionNotAllowedException() {
        super("Lifecycle transition is not allowed");
    }
}
