package org.magicsword.formdefinition.application;

/** No citizen-visible published release head for the service (FB-C5). */
public final class PublishedFormDefinitionNotFoundException extends RuntimeException {

    public PublishedFormDefinitionNotFoundException() {
        super("published form definition not found");
    }
}
