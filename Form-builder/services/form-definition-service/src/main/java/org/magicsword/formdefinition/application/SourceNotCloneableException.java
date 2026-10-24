package org.magicsword.formdefinition.application;

/** Source version cannot be cloned into a new draft (FB-C4) → HTTP 409. */
public final class SourceNotCloneableException extends RuntimeException {

    public SourceNotCloneableException() {
        super("Source Form Definition cannot be cloned");
    }
}
