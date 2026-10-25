package org.citizen.formdefinition.application;

/**
 * Strict query-parameter coordinate admission for GET (FB-C2).
 *
 * <p>{@code version} must be canonical positive decimal text {@code [1-9][0-9]*} with no leading
 * zeroes, signs, decimals, exponent notation, padding, or overflow. {@code serviceId} reuses
 * {@link FormDefinitionCoordinateParser} without trimming or coercion.
 */
public final class FormDefinitionQueryCoordinateParser {

    private static final String VERSION_PATTERN = "[1-9][0-9]*";

    private FormDefinitionQueryCoordinateParser() {}

    public static String admitServiceId(String serviceId) {
        return FormDefinitionCoordinateParser.admitLookupServiceId(serviceId);
    }

    public static int parseVersionQuery(String versionText) {
        if (versionText == null) {
            throw new FormDefinitionAdmissionException("version query parameter is required");
        }
        if (versionText.isEmpty() || versionText.isBlank()) {
            throw new FormDefinitionAdmissionException("version query parameter must be nonblank");
        }
        if (!versionText.equals(versionText.trim())) {
            throw new FormDefinitionAdmissionException(
                    "version query parameter must not have leading or trailing whitespace");
        }
        if (!versionText.matches(VERSION_PATTERN)) {
            throw new FormDefinitionAdmissionException(
                    "version query parameter must be a canonical positive decimal integer");
        }
        try {
            return Integer.parseInt(versionText);
        } catch (NumberFormatException ex) {
            throw new FormDefinitionAdmissionException("version query parameter overflows integer range", ex);
        }
    }
}
