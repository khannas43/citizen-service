package org.citizen.formdefinition.validation.palette;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Pure unit tests for {@link ControlledPaletteRegistry}. No Spring context, no I/O beyond the
 * classpath manifest / in-memory Jackson trees built for negative cases.
 */
class ControlledPaletteRegistryTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Set<String> WIDGET_KIND_TYPES =
            Set.of(
                    "email", "dob", "gender", "dropdown-master", "radio", "multiselect", "yesno",
                    "text-short", "text-long", "number", "currency-inr", "percentage");

    private static final Set<String> FIELD_KIND_TYPES =
            Set.of(
                    "aadhaar", "mobile-otp", "full-name", "caf-prefill", "address-block", "pincode",
                    "doc-upload", "digilocker-fetch", "photo-capture", "cascading-dropdown",
                    "bank-account", "family-repeater", "eligibility-declaration", "fee-field",
                    "signature-esign", "section-header", "info-panel", "page-break");

    private static final Set<String> SUPPORTS_REQUIRED_FALSE_TYPES =
            Set.of(
                    "caf-prefill", "family-repeater", "eligibility-declaration", "fee-field",
                    "section-header", "info-panel", "page-break");

    @Test
    void loadDefaultHasExactlyThirtyUniqueWidgetTypes() {
        ControlledPaletteRegistry registry = ControlledPaletteRegistry.loadDefault();

        assertThat(registry.size()).isEqualTo(ControlledPaletteRegistry.EXPECTED_COUNT);
        assertThat(registry.size()).isEqualTo(30);
        assertThat(registry.entries().keySet()).hasSize(30);
    }

    @Test
    void loadDefaultCoversExactlyTheDocumentedPalette() {
        ControlledPaletteRegistry registry = ControlledPaletteRegistry.loadDefault();

        Set<String> all = registry.entries().keySet();
        assertThat(all).containsExactlyInAnyOrderElementsOf(
                java.util.stream.Stream.concat(WIDGET_KIND_TYPES.stream(), FIELD_KIND_TYPES.stream()).toList());
    }

    @Test
    void loadDefaultAssignsWidgetRjsfKindOnlyToTheDocumentedWidgetSet() {
        ControlledPaletteRegistry registry = ControlledPaletteRegistry.loadDefault();

        for (String widgetType : WIDGET_KIND_TYPES) {
            ControlledPaletteEntry entry = registry.find(widgetType).orElseThrow();
            assertThat(entry.rjsfKind())
                    .as("widgetType=%s", widgetType)
                    .isEqualTo(ControlledPaletteEntry.RjsfKind.widget);
        }
        for (String widgetType : FIELD_KIND_TYPES) {
            ControlledPaletteEntry entry = registry.find(widgetType).orElseThrow();
            assertThat(entry.rjsfKind())
                    .as("widgetType=%s", widgetType)
                    .isEqualTo(ControlledPaletteEntry.RjsfKind.field);
        }
    }

    @Test
    void loadDefaultMarksExactlyTheDocumentedWidgetsAsNotSupportingRequired() {
        ControlledPaletteRegistry registry = ControlledPaletteRegistry.loadDefault();

        for (ControlledPaletteEntry entry : registry.entries().values()) {
            boolean expectedSupportsRequired = !SUPPORTS_REQUIRED_FALSE_TYPES.contains(entry.widgetType());
            assertThat(entry.supportsRequired())
                    .as("widgetType=%s", entry.widgetType())
                    .isEqualTo(expectedSupportsRequired);
        }
    }

    @Test
    void containsAndFindAreConsistentForKnownAndUnknownTypes() {
        ControlledPaletteRegistry registry = ControlledPaletteRegistry.loadDefault();

        assertThat(registry.contains("text-short")).isTrue();
        assertThat(registry.find("text-short")).isPresent();

        assertThat(registry.contains("not-a-real-widget")).isFalse();
        assertThat(registry.find("not-a-real-widget")).isEmpty();
    }

    @Test
    void fromJsonRejectsForbiddenWidgetTypes() throws Exception {
        JsonNode manifest =
                MAPPER.readTree(
                        """
                        {
                          "version": 1,
                          "widgets": [
                            { "widgetType": "custom-field", "category": "data", "producesData": true, "supportsRequired": true, "rjsfKind": "widget" }
                          ]
                        }
                        """);

        assertThatThrownBy(() -> ControlledPaletteRegistry.fromJson(manifest))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Forbidden widgetType");
    }

    @Test
    void fromJsonRejectsDuplicateWidgetTypes() throws Exception {
        JsonNode manifest =
                MAPPER.readTree(
                        """
                        {
                          "version": 1,
                          "widgets": [
                            { "widgetType": "text-short", "category": "data", "producesData": true, "supportsRequired": true, "rjsfKind": "widget" },
                            { "widgetType": "text-short", "category": "data", "producesData": true, "supportsRequired": true, "rjsfKind": "widget" }
                          ]
                        }
                        """);

        assertThatThrownBy(() -> ControlledPaletteRegistry.fromJson(manifest))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Duplicate widgetType");
    }

    @Test
    void fromJsonRejectsInconsistentDisplayWidgetThatSupportsRequired() throws Exception {
        JsonNode manifest =
                MAPPER.readTree(
                        """
                        {
                          "version": 1,
                          "widgets": [
                            { "widgetType": "section-header", "category": "display", "producesData": false, "supportsRequired": true, "rjsfKind": "field" }
                          ]
                        }
                        """);

        assertThatThrownBy(() -> ControlledPaletteRegistry.fromJson(manifest))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void fromJsonRejectsEmptyWidgetsArray() throws Exception {
        JsonNode manifest = MAPPER.readTree("{ \"version\": 1, \"widgets\": [] }");

        assertThatThrownBy(() -> ControlledPaletteRegistry.fromJson(manifest))
                .isInstanceOf(IllegalStateException.class);
    }
}
