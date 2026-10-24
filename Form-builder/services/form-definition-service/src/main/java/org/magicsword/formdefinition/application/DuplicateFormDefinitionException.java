package org.magicsword.formdefinition.application;

/**
 * Raised when create-only insert conflicts with an existing (serviceId, version) row.
 */
public class DuplicateFormDefinitionException extends RuntimeException {

    public DuplicateFormDefinitionException(String serviceId, int version, Throwable cause) {
        super("Form definition already exists for serviceId=" + serviceId + " version=" + version, cause);
    }
}
