package org.magicsword.formdefinition.validation.fieldpath;

import org.magicsword.formdefinition.validation.palette.ControlledPaletteEntry;

import com.fasterxml.jackson.databind.JsonNode;

/** One governed field in the definition field graph. */
public final class GovernedField {

    private final String fieldId;
    private final String rootFieldId;
    private final JsonNode schemaNode;
    private final JsonNode uiSchemaNode;
    private final ControlledPaletteEntry palette;
    private final String parentRepeaterFieldId;

    public GovernedField(
            String fieldId,
            String rootFieldId,
            JsonNode schemaNode,
            JsonNode uiSchemaNode,
            ControlledPaletteEntry palette,
            String parentRepeaterFieldId) {
        this.fieldId = fieldId;
        this.rootFieldId = rootFieldId;
        this.schemaNode = schemaNode;
        this.uiSchemaNode = uiSchemaNode;
        this.palette = palette;
        this.parentRepeaterFieldId = parentRepeaterFieldId;
    }

    public String fieldId() {
        return fieldId;
    }

    public String rootFieldId() {
        return rootFieldId;
    }

    public JsonNode schemaNode() {
        return schemaNode;
    }

    public JsonNode uiSchemaNode() {
        return uiSchemaNode;
    }

    public ControlledPaletteEntry palette() {
        return palette;
    }

    public String parentRepeaterFieldId() {
        return parentRepeaterFieldId;
    }

    public boolean isNested() {
        return parentRepeaterFieldId != null;
    }
}
