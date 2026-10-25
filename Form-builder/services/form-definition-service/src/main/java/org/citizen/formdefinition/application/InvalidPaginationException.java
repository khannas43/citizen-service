package org.citizen.formdefinition.application;

/** Invalid version-list pagination parameters (FB-C5). */
public final class InvalidPaginationException extends RuntimeException {

    public InvalidPaginationException() {
        super("invalid pagination");
    }

    public InvalidPaginationException(String message) {
        super(message);
    }
}
