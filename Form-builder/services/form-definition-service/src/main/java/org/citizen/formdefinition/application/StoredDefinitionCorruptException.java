package org.citizen.formdefinition.application;

/**
 * Raised when a persisted row fails strict coordinate verification (safe 500 path).
 * Must never expose SQL, stack traces, or definition content through HTTP mapping.
 */
public final class StoredDefinitionCorruptException extends RuntimeException {

    public StoredDefinitionCorruptException() {
        super("Stored form definition is corrupt");
    }

    public StoredDefinitionCorruptException(Throwable cause) {
        super("Stored form definition is corrupt", cause);
    }
}
