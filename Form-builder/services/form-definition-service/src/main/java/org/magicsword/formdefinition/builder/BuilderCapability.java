package org.magicsword.formdefinition.builder;

/**
 * Exact Builder/operator capability identifiers (FB-E5.4.2A / E5.4.2B).
 *
 * <p>Mapped from Keycloak {@code realm_access.roles} independently of officer governance
 * capabilities. No capability implies another. {@link #CLONE_FORM_DEFINITION_DRAFT} and {@link
 * #SUBMIT_FORM_DEFINITION} authorize the authenticated {@code /builder/…} endpoints; technical
 * identity-bearing clone/lifecycle HTTP routes remain denyAll under {@code governance-oidc}.
 */
public enum BuilderCapability {
    VALIDATE_FORM_DEFINITION,
    CREATE_FORM_DEFINITION_DRAFT,
    READ_FORM_DEFINITION_COORDINATE,
    REPLACE_FORM_DEFINITION_DRAFT,
    LIST_FORM_DEFINITION_VERSIONS,
    CLONE_FORM_DEFINITION_DRAFT,
    SUBMIT_FORM_DEFINITION
}
