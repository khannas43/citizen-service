package org.citizen.formdefinition.api;

/** Stable machine-readable ProblemDetail {@code code} values (FB-C2 / C3). */
public final class ProblemCodes {

    public static final String MALFORMED_JSON = "malformed_json";
    public static final String INVALID_COORDINATES = "invalid_coordinates";
    public static final String VALIDATION_FAILED = "validation_failed";
    public static final String CREATE_REQUIRES_DRAFT = "create_requires_draft";
    public static final String FORM_DEFINITION_NOT_FOUND = "form_definition_not_found";
    public static final String DUPLICATE_FORM_DEFINITION = "duplicate_form_definition";
    public static final String STORED_DEFINITION_CORRUPT = "stored_definition_corrupt";

    public static final String IF_MATCH_REQUIRED = "if_match_required";
    public static final String INVALID_IF_MATCH = "invalid_if_match";
    public static final String STALE_REVISION = "stale_revision";
    public static final String DEFINITION_NOT_EDITABLE = "definition_not_editable";
    public static final String DEFINITION_COORDINATE_MISMATCH = "definition_coordinate_mismatch";
    public static final String UPDATE_REQUIRES_DRAFT = "update_requires_draft";
    public static final String IMMUTABLE_CREATION_AUDIT_CHANGED = "immutable_creation_audit_changed";

    public static final String INVALID_TRANSITION_REQUEST = "invalid_transition_request";
    public static final String INVALID_ACTOR = "invalid_actor";
    public static final String LIFECYCLE_TRANSITION_NOT_ALLOWED = "lifecycle_transition_not_allowed";
    public static final String SOURCE_NOT_CLONEABLE = "source_not_cloneable";
    public static final String VERSION_EXHAUSTED = "version_exhausted";

    public static final String PUBLISHED_FORM_DEFINITION_NOT_FOUND = "published_form_definition_not_found";
    public static final String INVALID_PAGINATION = "invalid_pagination";

    public static final String GOVERNANCE_UNAUTHENTICATED = "governance_unauthenticated";
    public static final String GOVERNANCE_FORBIDDEN = "governance_forbidden";
    public static final String INVALID_GOVERNANCE_TRANSITION_REQUEST =
            "invalid_governance_transition_request";
    public static final String GOVERNANCE_DEFINITION_NOT_FOUND = "governance_definition_not_found";

    /** Filter-chain 401 for protected Builder endpoints (FB-E5.4.2A). */
    public static final String BUILDER_UNAUTHENTICATED = "builder_unauthenticated";
    /** Filter-chain 403 when JWT lacks required Builder capability (FB-E5.4.2A). */
    public static final String BUILDER_FORBIDDEN = "builder_forbidden";

    private ProblemCodes() {}
}
