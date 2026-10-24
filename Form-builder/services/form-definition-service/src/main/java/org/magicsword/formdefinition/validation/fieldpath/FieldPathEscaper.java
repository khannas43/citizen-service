package org.magicsword.formdefinition.validation.fieldpath;

/**
 * Canonical definition field-path escaping (FB-B3 / B3.1 rules mirrored on the server).
 *
 * <p>Top-level property IDs stay exact. Nested property segments escape {@code \ . [ ]}.
 */
public final class FieldPathEscaper {

    private FieldPathEscaper() {}

    public static String escapeSegment(String name) {
        StringBuilder out = new StringBuilder(name.length() + 4);
        for (int i = 0; i < name.length(); i++) {
            char ch = name.charAt(i);
            if (ch == '\\' || ch == '.' || ch == '[' || ch == ']') {
                out.append('\\');
            }
            out.append(ch);
        }
        return out.toString();
    }

    public static String join(String prefix, String segment) {
        if (prefix == null || prefix.isEmpty()) {
            return segment;
        }
        return prefix + "." + segment;
    }

    /** Root field: exact property id (no escaping). */
    public static String rootFieldId(String propertyName) {
        return propertyName;
    }

    /** Nested under a repeater template prefix ending in {@code []}. */
    public static String nestedUnderRepeater(String repeaterDefinitionPath, String childPropertyName) {
        return join(repeaterDefinitionPath, escapeSegment(childPropertyName));
    }

    public static String repeaterTemplatePath(String parentPrefix, String propertyName, boolean nested) {
        String segment = nested ? escapeSegment(propertyName) + "[]" : propertyName + "[]";
        return join(parentPrefix, segment);
    }
}
