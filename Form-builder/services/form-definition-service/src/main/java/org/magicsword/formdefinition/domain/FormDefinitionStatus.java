package org.magicsword.formdefinition.domain;

/**
 * Form Definition lifecycle status — exact lowercase values matching
 * {@code @dg20/form-contract} {@code FORM_STATUSES}.
 */
public enum FormDefinitionStatus {
    draft,
    submitted,
    approved,
    published,
    retired;

    public static FormDefinitionStatus parseExact(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("status is required");
        }
        for (FormDefinitionStatus status : values()) {
            if (status.name().equals(raw)) {
                return status;
            }
        }
        throw new IllegalArgumentException("unrecognized status: " + raw);
    }
}
