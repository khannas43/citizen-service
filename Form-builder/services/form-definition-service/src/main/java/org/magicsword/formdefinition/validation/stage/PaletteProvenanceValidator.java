package org.magicsword.formdefinition.validation.stage;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationIssueCollector;
import org.magicsword.formdefinition.validation.fieldpath.FieldPathEscaper;
import org.magicsword.formdefinition.validation.fieldpath.GovernedField;
import org.magicsword.formdefinition.validation.fieldpath.GovernedFieldGraph;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteEntry;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteRegistry;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Stage 2 — controlled-palette provenance validation (FB-C1).
 *
 * <p>Confirms {@code meta.paletteProvenance} is a faithful, one-to-one record of every governed
 * field's widget origin, that every declared widgetType is a member of the controlled palette,
 * and that the declared provenance agrees exactly with the {@code uiSchema} selection actually
 * used to render the field. Never infers or repairs provenance.
 */
public final class PaletteProvenanceValidator {

    private static final Set<String> PROVENANCE_ENTRY_KEYS = Set.of("fieldId", "widgetType");

    private PaletteProvenanceValidator() {}

    public static void validate(
            JsonNode document,
            GovernedFieldGraph graph,
            ControlledPaletteRegistry palette,
            ValidationIssueCollector issues) {
        if (document == null || !document.isObject()) {
            return;
        }
        JsonNode jsonSchema = document.get("jsonSchema");
        JsonNode uiSchema = document.get("uiSchema");

        checkFieldWidgetFieldConflicts(jsonSchema, uiSchema, graph, issues);

        JsonNode meta = document.get("meta");
        JsonNode provenance = StageSupport.isObject(meta) ? meta.get("paletteProvenance") : null;

        if (!StageSupport.isArray(provenance)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.provenance_not_array",
                            "meta.paletteProvenance must be a JSON array",
                            "meta.paletteProvenance"));
            return;
        }

        Set<String> matchedFieldIds = new HashSet<>();
        Set<String> seenFieldIds = new HashSet<>();
        int index = 0;
        for (JsonNode entry : provenance) {
            String path = "meta.paletteProvenance[" + index + "]";
            index++;
            validateEntry(entry, path, graph, palette, seenFieldIds, matchedFieldIds, issues);
        }

        for (GovernedField field : graph.fields()) {
            if (!matchedFieldIds.contains(field.fieldId())) {
                issues.offer(
                        ValidationIssue.error(
                                "palette.missing_provenance_entry",
                                "Governed field has no matching meta.paletteProvenance entry",
                                field.fieldId()));
            }
        }
    }

    private static void validateEntry(
            JsonNode entry,
            String path,
            GovernedFieldGraph graph,
            ControlledPaletteRegistry palette,
            Set<String> seenFieldIds,
            Set<String> matchedFieldIds,
            ValidationIssueCollector issues) {
        if (!StageSupport.hasExactKeys(entry, PROVENANCE_ENTRY_KEYS)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.entry_shape_invalid",
                            "paletteProvenance entry must be an object with exactly fieldId and widgetType",
                            path));
            return;
        }

        JsonNode fieldIdNode = entry.get("fieldId");
        JsonNode widgetTypeNode = entry.get("widgetType");

        if (!StageSupport.isExactNonBlankText(fieldIdNode)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.entry_field_id_blank",
                            "paletteProvenance entry fieldId must be a nonblank, unpadded string",
                            path + ".fieldId"));
            return;
        }
        if (!StageSupport.isExactNonBlankText(widgetTypeNode)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.entry_widget_type_blank",
                            "paletteProvenance entry widgetType must be a nonblank, unpadded string",
                            path + ".widgetType"));
            return;
        }

        String fieldId = fieldIdNode.textValue();
        String widgetType = widgetTypeNode.textValue();

        if (!seenFieldIds.add(fieldId)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.duplicate_provenance_entry",
                            "paletteProvenance contains more than one entry for the same fieldId",
                            fieldId));
            return;
        }

        GovernedField field = graph.find(fieldId).orElse(null);
        if (field == null) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.orphan_provenance_entry",
                            "paletteProvenance entry does not resolve to a governed field",
                            fieldId));
            return;
        }
        matchedFieldIds.add(fieldId);

        if (!palette.contains(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.provenance_unknown_widget_type",
                            "paletteProvenance widgetType is not a member of the controlled palette",
                            fieldId));
            return;
        }
        ControlledPaletteEntry declaredEntry = palette.find(widgetType).orElseThrow();

        ControlledPaletteEntry actualEntry = field.palette();
        if (actualEntry == null || !actualEntry.widgetType().equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.provenance_widget_mismatch",
                            "paletteProvenance widgetType does not match the uiSchema widget selection",
                            fieldId));
            return;
        }

        boolean usesWidgetKey =
                field.uiSchemaNode() != null
                        && field.uiSchemaNode().hasNonNull("ui:widget")
                        && field.uiSchemaNode().get("ui:widget").isTextual();
        boolean usesFieldKey =
                field.uiSchemaNode() != null
                        && field.uiSchemaNode().hasNonNull("ui:field")
                        && field.uiSchemaNode().get("ui:field").isTextual();

        if (declaredEntry.rjsfKind() == ControlledPaletteEntry.RjsfKind.widget && !usesWidgetKey) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.rjsf_kind_mismatch",
                            "Controlled palette widgetType requires an exact ui:widget selection",
                            fieldId));
        } else if (declaredEntry.rjsfKind() == ControlledPaletteEntry.RjsfKind.field && !usesFieldKey) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.rjsf_kind_mismatch",
                            "Controlled palette widgetType requires an exact ui:field selection",
                            fieldId));
        }
    }

    /**
     * Detects field-level uiSchema nodes declaring both {@code ui:widget} and {@code ui:field}.
     * The governed field graph silently omits such nodes (ambiguous widget resolution), so this
     * walk independently inspects root properties and family-repeater item children.
     */
    private static void checkFieldWidgetFieldConflicts(
            JsonNode jsonSchema, JsonNode uiSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isObject(jsonSchema)) {
            return;
        }
        JsonNode properties = jsonSchema.get("properties");
        if (!StageSupport.isObject(properties)) {
            return;
        }
        JsonNode uiRoot = StageSupport.isObject(uiSchema) ? uiSchema : null;

        Iterator<Map.Entry<String, JsonNode>> rootFields = properties.fields();
        while (rootFields.hasNext()) {
            Map.Entry<String, JsonNode> entry = rootFields.next();
            String propertyName = entry.getKey();
            JsonNode uiNode = uiRoot != null ? uiRoot.get(propertyName) : null;
            reportIfConflict(uiNode, FieldPathEscaper.rootFieldId(propertyName), issues);
        }

        for (GovernedField field : graph.fields()) {
            if (field.palette() == null || !"family-repeater".equals(field.palette().widgetType())) {
                continue;
            }
            JsonNode items = field.schemaNode() != null ? field.schemaNode().get("items") : null;
            JsonNode itemProps = StageSupport.isObject(items) ? items.get("properties") : null;
            if (!StageSupport.isObject(itemProps)) {
                continue;
            }
            JsonNode uiItems =
                    field.uiSchemaNode() != null && field.uiSchemaNode().isObject()
                            ? field.uiSchemaNode().get("items")
                            : null;
            String childPrefix = field.fieldId() + "[]";

            Iterator<Map.Entry<String, JsonNode>> childFields = itemProps.fields();
            while (childFields.hasNext()) {
                Map.Entry<String, JsonNode> child = childFields.next();
                String childName = child.getKey();
                JsonNode childUiNode =
                        StageSupport.isObject(uiItems) ? uiItems.get(childName) : null;
                reportIfConflict(
                        childUiNode, FieldPathEscaper.nestedUnderRepeater(childPrefix, childName), issues);
            }
        }
    }

    private static void reportIfConflict(JsonNode uiNode, String fieldId, ValidationIssueCollector issues) {
        if (!StageSupport.isObject(uiNode)) {
            return;
        }
        boolean hasWidget = uiNode.get("ui:widget") != null && uiNode.get("ui:widget").isTextual();
        boolean hasField = uiNode.get("ui:field") != null && uiNode.get("ui:field").isTextual();
        if (hasWidget && hasField) {
            issues.offer(
                    ValidationIssue.error(
                            "palette.field_widget_and_field_conflict",
                            "Field-level uiSchema must not specify both ui:widget and ui:field",
                            fieldId));
        }
    }
}
