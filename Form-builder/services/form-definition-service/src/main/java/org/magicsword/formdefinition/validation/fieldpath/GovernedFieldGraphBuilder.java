package org.magicsword.formdefinition.validation.fieldpath;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationIssueCollector;
import org.magicsword.formdefinition.validation.ValidationLimits;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteEntry;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteRegistry;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Builds the governed field graph using B3/B3.1 path rules.
 *
 * <p>Only {@code family-repeater} children are expanded; other composites remain one field.
 */
public final class GovernedFieldGraphBuilder {

    private final ControlledPaletteRegistry palette;
    private final ValidationIssueCollector issues;
    private int nodesVisited;

    public GovernedFieldGraphBuilder(ControlledPaletteRegistry palette, ValidationIssueCollector issues) {
        this.palette = palette;
        this.issues = issues;
    }

    public GovernedFieldGraph build(JsonNode jsonSchema, JsonNode uiSchema) {
        List<GovernedField> fields = new ArrayList<>();
        nodesVisited = 0;

        if (jsonSchema == null || !jsonSchema.isObject()) {
            return GovernedFieldGraph.empty();
        }
        JsonNode properties = jsonSchema.get("properties");
        if (properties == null || !properties.isObject()) {
            return GovernedFieldGraph.empty();
        }

        JsonNode uiRoot = uiSchema != null && uiSchema.isObject() ? uiSchema : null;

        Iterator<Map.Entry<String, JsonNode>> it = properties.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> entry = it.next();
            String propertyName = entry.getKey();
            JsonNode schemaNode = entry.getValue();
            JsonNode uiNode = uiRoot != null ? uiRoot.get(propertyName) : null;
            String fieldId = FieldPathEscaper.rootFieldId(propertyName);
            collectField(fields, fieldId, propertyName, schemaNode, uiNode, null, 0);
        }
        return new GovernedFieldGraph(fields);
    }

    private void collectField(
            List<GovernedField> fields,
            String fieldId,
            String rootFieldId,
            JsonNode schemaNode,
            JsonNode uiNode,
            String parentRepeaterFieldId,
            int depth) {
        if (depth > ValidationLimits.MAX_DEPTH) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.traversal_depth_exceeded",
                            "Form Definition traversal exceeded the configured depth limit",
                            fieldId));
            return;
        }
        if (++nodesVisited > ValidationLimits.MAX_NODES) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.node_limit_exceeded",
                            "Form Definition traversal exceeded the configured node limit",
                            fieldId));
            return;
        }

        String widgetType = resolveWidgetType(uiNode);
        ControlledPaletteEntry entry = null;
        if (widgetType != null) {
            entry = palette.find(widgetType).orElse(null);
            if (entry == null) {
                issues.offer(
                        ValidationIssue.error(
                                "palette.unknown_widget_type",
                                "uiSchema references a widgetType that is not in the controlled palette",
                                fieldId));
            }
        }

        if (entry != null) {
            fields.add(
                    new GovernedField(
                            fieldId, rootFieldId, schemaNode, uiNode, entry, parentRepeaterFieldId));
        }

        if (entry != null && "family-repeater".equals(entry.widgetType())) {
            expandFamilyRepeater(fields, fieldId, rootFieldId, schemaNode, uiNode, depth + 1);
        }
    }

    private void expandFamilyRepeater(
            List<GovernedField> fields,
            String repeaterFieldId,
            String rootFieldId,
            JsonNode schemaNode,
            JsonNode uiNode,
            int depth) {
        String childPrefix = repeaterFieldId + "[]";

        JsonNode items = schemaNode != null ? schemaNode.get("items") : null;
        JsonNode itemProps = items != null && items.isObject() ? items.get("properties") : null;
        JsonNode uiItems = uiNode != null && uiNode.isObject() ? uiNode.get("items") : null;

        if (itemProps == null || !itemProps.isObject()) {
            return;
        }

        Iterator<Map.Entry<String, JsonNode>> it = itemProps.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> entry = it.next();
            String childName = entry.getKey();
            JsonNode childSchema = entry.getValue();
            JsonNode childUi = uiItems != null && uiItems.isObject() ? uiItems.get(childName) : null;
            String childFieldId = FieldPathEscaper.nestedUnderRepeater(childPrefix, childName);
            collectField(
                    fields, childFieldId, rootFieldId, childSchema, childUi, repeaterFieldId, depth);
        }
    }

    static String resolveWidgetType(JsonNode uiNode) {
        if (uiNode == null || !uiNode.isObject()) {
            return null;
        }
        JsonNode widget = uiNode.get("ui:widget");
        JsonNode field = uiNode.get("ui:field");
        boolean hasWidget = widget != null && widget.isTextual();
        boolean hasField = field != null && field.isTextual();
        if (hasWidget && hasField) {
            return null;
        }
        if (hasWidget) {
            return widget.textValue();
        }
        if (hasField) {
            return field.textValue();
        }
        return null;
    }
}
