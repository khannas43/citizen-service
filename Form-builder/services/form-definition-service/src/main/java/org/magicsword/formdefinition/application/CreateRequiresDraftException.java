package org.magicsword.formdefinition.application;

/** Raised when an external create targets a non-draft lifecycle status (FB-C2). */
public final class CreateRequiresDraftException extends RuntimeException {

    public CreateRequiresDraftException() {
        super("External create requires status draft");
    }
}
