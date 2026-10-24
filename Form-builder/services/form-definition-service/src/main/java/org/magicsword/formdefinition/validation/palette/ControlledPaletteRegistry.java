package org.magicsword.formdefinition.validation.palette;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Immutable controlled palette registry loaded from classpath
 * {@code validation/controlled-palette-v1.json}.
 */
public final class ControlledPaletteRegistry {

    public static final String RESOURCE_PATH = "validation/controlled-palette-v1.json";
    public static final int EXPECTED_COUNT = 30;

    private static final Set<String> FORBIDDEN = Set.of("custom-field", "raw-json");

    private final Map<String, ControlledPaletteEntry> byType;

    private ControlledPaletteRegistry(Map<String, ControlledPaletteEntry> byType) {
        this.byType = Collections.unmodifiableMap(byType);
    }

    public static ControlledPaletteRegistry loadDefault() {
        try (InputStream in =
                ControlledPaletteRegistry.class.getClassLoader().getResourceAsStream(RESOURCE_PATH)) {
            if (in == null) {
                throw new IllegalStateException("Missing palette manifest: " + RESOURCE_PATH);
            }
            return fromJson(new ObjectMapper().readTree(in));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to load palette manifest", ex);
        }
    }

    public static ControlledPaletteRegistry fromJson(JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new IllegalStateException("Palette manifest must be a JSON object");
        }
        JsonNode widgets = root.get("widgets");
        if (widgets == null || !widgets.isArray() || widgets.isEmpty()) {
            throw new IllegalStateException("Palette manifest widgets must be a nonempty array");
        }

        Map<String, ControlledPaletteEntry> map = new LinkedHashMap<>();
        for (JsonNode node : widgets) {
            ControlledPaletteEntry entry = parseEntry(node);
            if (FORBIDDEN.contains(entry.widgetType())) {
                throw new IllegalStateException("Forbidden widgetType in manifest: " + entry.widgetType());
            }
            if (map.containsKey(entry.widgetType())) {
                throw new IllegalStateException("Duplicate widgetType in manifest: " + entry.widgetType());
            }
            validateConsistency(entry);
            map.put(entry.widgetType(), entry);
        }
        if (map.isEmpty()) {
            throw new IllegalStateException("Palette registry is empty");
        }
        return new ControlledPaletteRegistry(map);
    }

    private static ControlledPaletteEntry parseEntry(JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new IllegalStateException("Palette widget entry must be an object");
        }
        String widgetType = requireNonblankText(node, "widgetType");
        ControlledPaletteEntry.Category category = parseCategory(requireNonblankText(node, "category"));
        boolean producesData = requireBoolean(node, "producesData");
        boolean supportsRequired = requireBoolean(node, "supportsRequired");
        ControlledPaletteEntry.RjsfKind kind = parseKind(requireNonblankText(node, "rjsfKind"));
        return new ControlledPaletteEntry(widgetType, category, producesData, supportsRequired, kind);
    }

    private static void validateConsistency(ControlledPaletteEntry entry) {
        if (entry.category() == ControlledPaletteEntry.Category.data && !entry.producesData()) {
            // All current data widgets produce data; reject inconsistent manifests.
            throw new IllegalStateException(
                    "Inconsistent producesData/category for " + entry.widgetType());
        }
        if (entry.isDisplayOrLayout() && entry.producesData()) {
            throw new IllegalStateException(
                    "Display/layout widgets must not produce data: " + entry.widgetType());
        }
        if (entry.isDisplayOrLayout() && entry.supportsRequired()) {
            throw new IllegalStateException(
                    "Display/layout widgets must not support required: " + entry.widgetType());
        }
    }

    private static ControlledPaletteEntry.Category parseCategory(String raw) {
        try {
            return ControlledPaletteEntry.Category.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("Unknown palette category: " + raw, ex);
        }
    }

    private static ControlledPaletteEntry.RjsfKind parseKind(String raw) {
        try {
            return ControlledPaletteEntry.RjsfKind.valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("Unknown rjsfKind: " + raw, ex);
        }
    }

    private static String requireNonblankText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual()) {
            throw new IllegalStateException("Palette entry." + field + " must be a string");
        }
        String text = value.textValue();
        if (text == null || text.isBlank()) {
            throw new IllegalStateException("Palette entry." + field + " must be nonblank");
        }
        return text;
    }

    private static boolean requireBoolean(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) {
            throw new IllegalStateException("Palette entry." + field + " must be a boolean");
        }
        return value.booleanValue();
    }

    public Optional<ControlledPaletteEntry> find(String widgetType) {
        return Optional.ofNullable(byType.get(widgetType));
    }

    public boolean contains(String widgetType) {
        return byType.containsKey(widgetType);
    }

    public Map<String, ControlledPaletteEntry> entries() {
        return byType;
    }

    public int size() {
        return byType.size();
    }
}
