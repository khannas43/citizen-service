package org.citizen.formdefinition.validation.stage;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Null-safe Jackson helpers shared by the FB-C1 stage 2-5 validators.
 *
 * <p>Package-private: not part of the public validation API.
 */
final class StageSupport {

    private StageSupport() {}

    static boolean isPresent(JsonNode node) {
        return node != null && !node.isMissingNode() && !node.isNull();
    }

    static boolean isObject(JsonNode node) {
        return node != null && node.isObject();
    }

    static boolean isArray(JsonNode node) {
        return node != null && node.isArray();
    }

    /** Rejects blank text and text with leading/trailing whitespace (no silent trim). */
    static boolean isExactNonBlankText(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return false;
        }
        String value = node.textValue();
        if (value == null || value.isBlank()) {
            return false;
        }
        return value.equals(value.trim());
    }

    static boolean isExactNonBlankText(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        return value.equals(value.trim());
    }

    static String textOf(JsonNode node) {
        return node != null && node.isTextual() ? node.textValue() : null;
    }

    /** Object whose field-name set is exactly {@code expectedKeys} (no missing, no extra). */
    static boolean hasExactKeys(JsonNode node, Set<String> expectedKeys) {
        if (!isObject(node)) {
            return false;
        }
        if (node.size() != expectedKeys.size()) {
            return false;
        }
        var names = node.fieldNames();
        while (names.hasNext()) {
            if (!expectedKeys.contains(names.next())) {
                return false;
            }
        }
        return true;
    }

    /** Strict JSON integer (rejects floating-point numbers such as {@code 1.0}). */
    static Long integerValueOrNull(JsonNode node) {
        if (node == null || !node.isIntegralNumber()) {
            return null;
        }
        if (!node.canConvertToLong()) {
            return null;
        }
        return node.longValue();
    }

    static boolean isFiniteNumber(JsonNode node) {
        if (node == null || !node.isNumber()) {
            return false;
        }
        double value = node.asDouble();
        return Double.isFinite(value);
    }

    static Instant parseInstantOrNull(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    /** Root property names from {@code jsonSchema.properties}, in declaration order. */
    static List<String> rootPropertyNames(JsonNode jsonSchema) {
        List<String> names = new ArrayList<>();
        if (!isObject(jsonSchema)) {
            return names;
        }
        JsonNode properties = jsonSchema.get("properties");
        if (!isObject(properties)) {
            return names;
        }
        properties.fieldNames().forEachRemaining(names::add);
        return names;
    }
}
