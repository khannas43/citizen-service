package org.magicsword.formdefinition.validation.stage;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.magicsword.formdefinition.application.FormDefinitionAdmissionException;
import org.magicsword.formdefinition.application.FormDefinitionCoordinateParser;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationIssueCollector;
import org.magicsword.formdefinition.validation.ValidationLimits;
import org.magicsword.formdefinition.validation.fieldpath.GovernedField;
import org.magicsword.formdefinition.validation.fieldpath.GovernedFieldGraph;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteEntry;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Stage 5 — structural sanity validation (FB-C1).
 *
 * <p>The final, broadest stage: top-level document shape, JSON Schema root shape, uiSchema root
 * and field-node shape, progressive-step coverage, audit-trail lifecycle coherence, governed
 * {@code x-dg20} widget configuration, and family-repeater structural rules. Reuses
 * {@link FormDefinitionCoordinateParser} for the persistence-safety coordinate checks rather than
 * re-implementing them.
 */
public final class StructuralSanityValidator {

    private static final Set<String> TOP_LEVEL_KEYS =
            Set.of("serviceId", "version", "status", "jsonSchema", "uiSchema", "meta", "audit");

    private static final Set<String> PROGRESSIVE_STEP_KEYS =
            Set.of("stepId", "labelEn", "labelGu", "fieldIds");

    private static final Set<String> KNOWN_X_DG20_KEYS =
            Set.of(
                    "verifyEmail",
                    "minAge",
                    "maxAge",
                    "otpChannels",
                    "defaultStateCode",
                    "allowedMimeTypes",
                    "maxFileSizeBytes",
                    "digiLockerDocumentTypeCode",
                    "masterListId",
                    "parentMasterListId",
                    "childMasterListId",
                    "declarationId",
                    "feeRuleId");

    private static final Set<String> MASTER_LIST_WIDGETS = Set.of("dropdown-master", "radio", "multiselect");

    private static final Set<String> ADDRESS_BLOCK_CODE_PROPERTIES =
            Set.of("stateCode", "districtCode", "talukaCode", "villageCode");

    private static final Set<String> PHOTO_CAPTURE_PROPERTIES =
            Set.of("objectRef", "mimeType", "sizeBytes", "width", "height", "scanStatus");

    private static final Set<String> ADDRESS_BLOCK_X_DG20_KEYS = Set.of("defaultStateCode");

    private static final List<String> SCAN_STATUS_CLEAN_ENUM = List.of("CLEAN");

    private static final Set<String> DOC_UPLOAD_PROPERTIES =
            Set.of("objectRef", "fileName", "mimeType", "sizeBytes", "scanStatus");

    private static final Set<String> DOC_UPLOAD_X_DG20_KEYS = Set.of("allowedMimeTypes", "maxFileSizeBytes");

    private static final Set<String> DIGILOCKER_PROPERTIES = Set.of("issuerSignedRef", "documentTypeCode");

    private static final Set<String> DIGILOCKER_X_DG20_KEYS = Set.of("digiLockerDocumentTypeCode");

    private static final Set<String> FEE_FIELD_PROPERTIES =
            Set.of("feeRuleId", "contextRevision", "currency", "amountMinor", "quoteRef");

    private static final Set<String> FEE_FIELD_X_DG20_KEYS = Set.of("feeRuleId");

    private static final Set<String> SIGNATURE_ESIGN_PROPERTIES =
            Set.of("contextRevision", "signedArtefactRef");

    private static final List<String> ELIGIBILITY_DECLARATION_PROPERTIES =
            List.of("declarationId", "accepted", "locale", "consentReceiptRef");

    private static final Set<String> ELIGIBILITY_DECLARATION_X_DG20_KEYS = Set.of("declarationId");

    private static final List<String> ELIGIBILITY_LOCALE_ENUM = List.of("en", "gu");

    private static final Set<String> CAF_PREFILL_PROPERTIES = Set.of("value", "source");

    private static final List<String> CAF_PREFILL_REQUIRED = List.of("value", "source");

    private static final List<String> CAF_PREFILL_SOURCE_ENUM = List.of("CAF", "OVERRIDE");

    private StructuralSanityValidator() {}

    public static void validate(JsonNode document, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        validateTopLevel(document, issues);
        if (document == null || !document.isObject()) {
            return;
        }

        JsonNode jsonSchema = document.get("jsonSchema");
        JsonNode uiSchema = document.get("uiSchema");
        JsonNode meta = document.get("meta");
        JsonNode audit = document.get("audit");
        JsonNode statusNode = document.get("status");

        validateJsonSchemaRoot(jsonSchema, graph, issues);
        validateUiSchemaRoot(jsonSchema, uiSchema, graph, issues);
        if (StageSupport.isObject(meta)) {
            validateProgressiveSteps(meta.get("progressiveSteps"), jsonSchema, issues);
        }
        validateAudit(audit, statusNode, issues);
        validateXDg20(graph, issues);
        validateFamilyRepeaters(graph, issues);
        validateMultiselectBounds(jsonSchema, graph, issues);
        validateAddressBlockSchemas(jsonSchema, graph, issues);
        validatePhotoCaptureSchemas(jsonSchema, graph, issues);
        validateDocUploadSchemas(jsonSchema, graph, issues);
        validateDigiLockerSchemas(jsonSchema, graph, issues);
        validateFeeFieldSchemas(jsonSchema, graph, issues);
        validateSignatureEsignSchemas(jsonSchema, graph, issues);
        validateEligibilityDeclarationSchemas(jsonSchema, graph, issues);
        validateCafPrefillSchemas(jsonSchema, graph, issues);
    }

    // ---------------------------------------------------------------- top level

    private static void validateTopLevel(JsonNode document, ValidationIssueCollector issues) {
        if (document == null || !document.isObject()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.root_not_object", "Form Definition must be a JSON object", null));
            return;
        }

        Iterator<String> names = document.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!TOP_LEVEL_KEYS.contains(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.unexpected_top_level_key",
                                "Form Definition contains a key outside the fixed top-level shape",
                                name));
            }
        }
        for (String expected : TOP_LEVEL_KEYS) {
            if (!document.has(expected)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.missing_top_level_key",
                                "Form Definition is missing a required top-level key",
                                expected));
            }
        }

        try {
            FormDefinitionCoordinateParser.parseDocument(document);
        } catch (FormDefinitionAdmissionException ex) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.coordinates_invalid",
                            "Form Definition coordinates failed admission: " + ex.getMessage(),
                            null));
        }

        JsonNode uiSchema = document.get("uiSchema");
        if (StageSupport.isPresent(uiSchema) && !StageSupport.isObject(uiSchema)) {
            issues.offer(
                    ValidationIssue.error("structure.uischema_not_object", "uiSchema must be a JSON object", "uiSchema"));
        }
        JsonNode meta = document.get("meta");
        if (StageSupport.isPresent(meta) && !StageSupport.isObject(meta)) {
            issues.offer(ValidationIssue.error("structure.meta_not_object", "meta must be a JSON object", "meta"));
        }
        JsonNode audit = document.get("audit");
        if (StageSupport.isPresent(audit) && !StageSupport.isObject(audit)) {
            issues.offer(ValidationIssue.error("structure.audit_not_object", "audit must be a JSON object", "audit"));
        }
    }

    // ---------------------------------------------------------------- json schema root

    private static void validateJsonSchemaRoot(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isObject(jsonSchema)) {
            return;
        }

        JsonNode type = jsonSchema.get("type");
        if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.schema_root_type_invalid",
                            "jsonSchema.type must be exactly \"object\"",
                            "jsonSchema.type"));
        }

        JsonNode properties = jsonSchema.get("properties");
        if (!StageSupport.isObject(properties) || properties.isEmpty()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.schema_properties_empty",
                            "jsonSchema.properties must be a nonempty JSON object",
                            "jsonSchema.properties"));
        }

        JsonNode additionalProperties = jsonSchema.get("additionalProperties");
        if (additionalProperties == null || !additionalProperties.isBoolean() || additionalProperties.booleanValue()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.schema_additional_properties_not_false",
                            "jsonSchema.additionalProperties must be exactly false",
                            "jsonSchema.additionalProperties"));
        }

        validateRequiredArray(jsonSchema, graph, issues);
    }

    private static void validateRequiredArray(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        JsonNode required = jsonSchema.get("required");
        if (!StageSupport.isPresent(required)) {
            return;
        }
        if (!StageSupport.isArray(required)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.required_not_array", "jsonSchema.required must be a JSON array", "jsonSchema.required"));
            return;
        }

        Set<String> rootPropertyNames = new HashSet<>(StageSupport.rootPropertyNames(jsonSchema));
        Map<String, GovernedField> rootFieldsById = new HashMap<>();
        for (GovernedField field : graph.rootFields()) {
            rootFieldsById.put(field.fieldId(), field);
        }

        Set<String> seen = new HashSet<>();
        for (JsonNode entry : required) {
            if (!StageSupport.isExactNonBlankText(entry)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.required_entry_blank",
                                "jsonSchema.required entries must be nonblank, unpadded strings",
                                "jsonSchema.required"));
                continue;
            }
            String name = entry.textValue();
            if (!rootPropertyNames.contains(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.required_unknown_property",
                                "jsonSchema.required references a property that does not exist at the root",
                                name));
                continue;
            }
            if (!seen.add(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.required_duplicate_entry",
                                "jsonSchema.required contains a duplicate property name",
                                name));
                continue;
            }
            GovernedField field = rootFieldsById.get(name);
            ControlledPaletteEntry palette = field != null ? field.palette() : null;
            if (palette != null && (palette.isDisplayOrLayout() || !palette.supportsRequired())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.required_not_supported",
                                "jsonSchema.required references a widget type that does not support the required flag",
                                name));
            }
        }
    }

    // ---------------------------------------------------------------- uiSchema root + field nodes

    private static void validateUiSchemaRoot(
            JsonNode jsonSchema, JsonNode uiSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isObject(uiSchema)) {
            return;
        }

        List<String> rootPropertyNames = StageSupport.rootPropertyNames(jsonSchema);
        Set<String> rootPropertySet = new HashSet<>(rootPropertyNames);

        Map<String, GovernedField> rootFieldsById = new HashMap<>();
        for (GovernedField field : graph.rootFields()) {
            rootFieldsById.put(field.fieldId(), field);
        }

        Iterator<String> uiRootNames = uiSchema.fieldNames();
        while (uiRootNames.hasNext()) {
            String key = uiRootNames.next();
            if ("ui:order".equals(key)) {
                continue;
            }
            if (key.startsWith("ui:")) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.uischema_root_directive_forbidden",
                                "uiSchema root permits only ui:order as a presentation directive",
                                key));
                continue;
            }
            if (!rootPropertySet.contains(key)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.uischema_root_unknown_key",
                                "uiSchema root key does not correspond to a jsonSchema root property",
                                key));
            }
        }

        for (String propertyName : rootPropertyNames) {
            if (!uiSchema.has(propertyName)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.root_field_missing_ui_entry",
                                "jsonSchema root property has no corresponding uiSchema entry",
                                propertyName));
                continue;
            }
            GovernedField field = rootFieldsById.get(propertyName);
            if (field == null) {
                // Unresolved widget selection is reported by earlier stages (unknown widget type,
                // or a ui:widget/ui:field conflict). Structural field-node shape cannot be checked
                // without a resolved palette entry.
                continue;
            }
            validateFieldUiShape(field, issues);
        }

        validateUiOrder(uiSchema.get("ui:order"), rootPropertyNames, issues);
    }

    private static void validateFieldUiShape(GovernedField field, ValidationIssueCollector issues) {
        JsonNode uiNode = field.uiSchemaNode();
        if (!StageSupport.isObject(uiNode)) {
            return;
        }
        ControlledPaletteEntry palette = field.palette();
        boolean isRepeater = palette != null && "family-repeater".equals(palette.widgetType());

        boolean usesWidget = uiNode.get("ui:widget") != null && uiNode.get("ui:widget").isTextual();
        Set<String> allowedKeys = usesWidget ? Set.of("ui:widget") : Set.of("ui:field");
        if (isRepeater) {
            allowedKeys = usesWidget ? Set.of("ui:widget", "items") : Set.of("ui:field", "items");
        }

        Iterator<String> keys = uiNode.fieldNames();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!allowedKeys.contains(key)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.uischema_field_unexpected_key",
                                "uiSchema field node permits only its resolved widget selection"
                                        + (isRepeater ? " and items" : ""),
                                field.fieldId() + "." + key));
            }
        }

        if (isRepeater) {
            validateRepeaterItemsUiShape(field, issues);
        }
    }

    private static void validateRepeaterItemsUiShape(GovernedField field, ValidationIssueCollector issues) {
        JsonNode items = field.schemaNode() != null ? field.schemaNode().get("items") : null;
        JsonNode itemProperties = StageSupport.isObject(items) ? items.get("properties") : null;
        if (!StageSupport.isObject(itemProperties)) {
            return;
        }
        JsonNode uiItems = field.uiSchemaNode().get("items");
        if (!StageSupport.isObject(uiItems)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.uischema_repeater_items_missing",
                            "family-repeater uiSchema.items must be a JSON object covering every item property",
                            field.fieldId()));
            return;
        }

        Set<String> itemPropertyNames = new HashSet<>();
        itemProperties.fieldNames().forEachRemaining(itemPropertyNames::add);

        Iterator<String> uiItemKeys = uiItems.fieldNames();
        while (uiItemKeys.hasNext()) {
            String key = uiItemKeys.next();
            if (!itemPropertyNames.contains(key)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.uischema_repeater_item_unknown_field",
                                "uiSchema.items key does not correspond to a repeater item schema property",
                                field.fieldId() + "[]." + key));
            }
        }

        // Exact coverage: every items.properties key must appear in uiSchema.items (FB-D16).
        for (String propertyName : itemPropertyNames) {
            if (!uiItems.has(propertyName)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.uischema_repeater_item_missing",
                                "uiSchema.items must cover every repeater item schema property exactly once",
                                field.fieldId() + "[]." + propertyName));
            }
        }
    }

    private static void validateUiOrder(JsonNode uiOrder, List<String> rootPropertyNames, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(uiOrder)) {
            return;
        }
        if (!StageSupport.isArray(uiOrder)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.ui_order_not_array", "uiSchema.ui:order must be a JSON array", "uiSchema.ui:order"));
            return;
        }

        Set<String> rootPropertySet = new HashSet<>(rootPropertyNames);
        Set<String> seenFields = new HashSet<>();
        boolean sawWildcard = false;
        int wildcardCount = 0;

        for (JsonNode entry : uiOrder) {
            if (!entry.isTextual()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.ui_order_entry_invalid",
                                "uiSchema.ui:order entries must be strings",
                                "uiSchema.ui:order"));
                continue;
            }
            String value = entry.textValue();
            if ("*".equals(value)) {
                wildcardCount++;
                sawWildcard = true;
                continue;
            }
            if (!rootPropertySet.contains(value)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.ui_order_unknown_field",
                                "uiSchema.ui:order references a field that is not a jsonSchema root property",
                                value));
                continue;
            }
            if (!seenFields.add(value)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.ui_order_duplicate_field",
                                "uiSchema.ui:order references the same field more than once",
                                value));
            }
        }

        if (wildcardCount > 1) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.ui_order_multiple_wildcards",
                            "uiSchema.ui:order may contain at most one \"*\" entry",
                            "uiSchema.ui:order"));
        }

        if (!sawWildcard && !seenFields.equals(rootPropertySet)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.ui_order_incomplete_coverage",
                            "uiSchema.ui:order without a wildcard must cover every root field exactly once",
                            "uiSchema.ui:order"));
        }
    }

    // ---------------------------------------------------------------- progressive steps

    private static void validateProgressiveSteps(
            JsonNode progressiveSteps, JsonNode jsonSchema, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(progressiveSteps)) {
            return;
        }
        if (!StageSupport.isArray(progressiveSteps)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.progressive_steps_not_array",
                            "meta.progressiveSteps must be a JSON array",
                            "meta.progressiveSteps"));
            return;
        }
        if (progressiveSteps.isEmpty()) {
            return;
        }

        List<String> rootPropertyNames = StageSupport.rootPropertyNames(jsonSchema);
        Set<String> rootPropertySet = new HashSet<>(rootPropertyNames);

        Set<String> seenStepIds = new HashSet<>();
        Set<String> assignedFields = new HashSet<>();
        int stepIndex = 0;

        for (JsonNode step : progressiveSteps) {
            String path = "meta.progressiveSteps[" + stepIndex + "]";
            stepIndex++;

            if (!StageSupport.hasExactKeys(step, PROGRESSIVE_STEP_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_shape_invalid",
                                "progressiveSteps entry must be an object with exactly stepId, labelEn, labelGu, fieldIds",
                                path));
                continue;
            }

            JsonNode stepIdNode = step.get("stepId");
            if (!StageSupport.isExactNonBlankText(stepIdNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_id_blank",
                                "progressiveSteps stepId must be a nonblank, unpadded string",
                                path + ".stepId"));
                continue;
            }
            String stepId = stepIdNode.textValue();
            if (!seenStepIds.add(stepId)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_id_duplicate",
                                "progressiveSteps contains a duplicate stepId",
                                stepId));
                continue;
            }

            if (!StageSupport.isExactNonBlankText(step.get("labelEn"))
                    || !StageSupport.isExactNonBlankText(step.get("labelGu"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_label_invalid",
                                "progressiveSteps labelEn and labelGu must both be nonblank, unpadded strings",
                                stepId));
            }

            JsonNode fieldIds = step.get("fieldIds");
            if (!StageSupport.isArray(fieldIds) || fieldIds.isEmpty()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_field_ids_empty",
                                "progressiveSteps fieldIds must be a nonempty JSON array",
                                stepId));
                continue;
            }

            Set<String> seenInStep = new HashSet<>();
            for (JsonNode fieldIdNode : fieldIds) {
                if (!StageSupport.isExactNonBlankText(fieldIdNode)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.progressive_step_field_id_blank",
                                    "progressiveSteps fieldIds entries must be nonblank, unpadded strings",
                                    stepId));
                    continue;
                }
                String fieldId = fieldIdNode.textValue();
                if (!rootPropertySet.contains(fieldId)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.progressive_step_field_unknown",
                                    "progressiveSteps fieldIds entry is not a jsonSchema root property",
                                    fieldId));
                    continue;
                }
                if (!seenInStep.add(fieldId)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.progressive_step_field_duplicate_in_step",
                                    "progressiveSteps fieldIds contains a duplicate entry within one step",
                                    fieldId));
                    continue;
                }
                if (!assignedFields.add(fieldId)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.progressive_step_field_assigned_twice",
                                    "A root field may be assigned to only one progressive step",
                                    fieldId));
                }
            }
        }

        for (String propertyName : rootPropertyNames) {
            if (!assignedFields.contains(propertyName)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.progressive_step_field_unassigned",
                                "Root field is not assigned to any progressive step",
                                propertyName));
            }
        }
    }

    // ---------------------------------------------------------------- audit

    private static void validateAudit(JsonNode audit, JsonNode statusNode, ValidationIssueCollector issues) {
        if (!StageSupport.isObject(audit)) {
            return;
        }

        // Exact governed audit key set (FB-C4). Unexpected keys are hard errors.
        java.util.Set<String> allowed =
                java.util.Set.of("createdBy", "createdAt", "submittedBy", "approvedBy", "publishedAt");
        java.util.Iterator<String> names = audit.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!allowed.contains(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.audit_unexpected_key",
                                "audit contains a key outside the governed FormAudit shape",
                                "audit." + name));
            }
        }

        boolean createdByOk = StageSupport.isExactNonBlankText(audit.get("createdBy"));
        if (!createdByOk) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.audit_created_by_invalid",
                            "audit.createdBy is required and must be a nonblank, unpadded string",
                            "audit.createdBy"));
        }

        Instant createdAt = requireInstant(audit.get("createdAt"), true, "audit.createdAt", issues, "structure.audit_created_at_invalid");

        checkOptionalNonBlank(audit, "submittedBy", issues, "structure.audit_submitted_by_invalid");
        checkOptionalNonBlank(audit, "approvedBy", issues, "structure.audit_approved_by_invalid");
        Instant publishedAt =
                requireInstant(audit.get("publishedAt"), false, "audit.publishedAt", issues, "structure.audit_published_at_invalid");

        FormDefinitionStatus status = parseStatusOrNull(statusNode);
        int ordinal = status != null ? status.ordinal() : -1;

        boolean requiresSubmittedBy = ordinal >= FormDefinitionStatus.submitted.ordinal();
        boolean requiresApprovedBy = ordinal >= FormDefinitionStatus.approved.ordinal();
        boolean requiresPublishedAt = ordinal >= FormDefinitionStatus.published.ordinal();

        if (requiresSubmittedBy && !StageSupport.isExactNonBlankText(audit.get("submittedBy"))) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.audit_submitted_by_required",
                            "audit.submittedBy is required once a Form Definition has been submitted",
                            "audit.submittedBy"));
        }
        if (requiresApprovedBy && !StageSupport.isExactNonBlankText(audit.get("approvedBy"))) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.audit_approved_by_required",
                            "audit.approvedBy is required once a Form Definition has been approved",
                            "audit.approvedBy"));
        }
        if (requiresPublishedAt && publishedAt == null) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.audit_published_at_required",
                            "audit.publishedAt is required once a Form Definition has been published or retired",
                            "audit.publishedAt"));
        }
        if (createdAt != null && publishedAt != null && publishedAt.isBefore(createdAt)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.audit_published_before_created",
                            "audit.publishedAt must not precede audit.createdAt",
                            "audit.publishedAt"));
        }
    }

    private static FormDefinitionStatus parseStatusOrNull(JsonNode statusNode) {
        if (statusNode == null || !statusNode.isTextual()) {
            return null;
        }
        try {
            return FormDefinitionStatus.parseExact(statusNode.textValue());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static void checkOptionalNonBlank(
            JsonNode audit, String field, ValidationIssueCollector issues, String code) {
        JsonNode node = audit.get(field);
        if (!StageSupport.isPresent(node)) {
            return;
        }
        if (!StageSupport.isExactNonBlankText(node)) {
            issues.offer(
                    ValidationIssue.error(
                            code, "audit." + field + " must be a nonblank, unpadded string when present", "audit." + field));
        }
    }

    private static Instant requireInstant(
            JsonNode node, boolean required, String path, ValidationIssueCollector issues, String code) {
        if (!StageSupport.isPresent(node)) {
            if (required) {
                issues.offer(ValidationIssue.error(code, path + " is required and must be an ISO-8601 instant", path));
            }
            return null;
        }
        if (!node.isTextual()) {
            issues.offer(ValidationIssue.error(code, path + " must be an ISO-8601 instant string", path));
            return null;
        }
        Instant instant = StageSupport.parseInstantOrNull(node.textValue());
        if (instant == null) {
            issues.offer(ValidationIssue.error(code, path + " must be a parseable ISO-8601 instant", path));
        }
        return instant;
    }

    // ---------------------------------------------------------------- x-dg20

    private static void validateXDg20(GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();
            String widgetType = field.palette() != null ? field.palette().widgetType() : null;
            JsonNode xdg20 = schemaNode.get("x-dg20");
            if (!StageSupport.isPresent(xdg20)) {
                if (widgetType != null && MASTER_LIST_WIDGETS.contains(widgetType)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.x_dg20_master_list_id_required",
                                    "x-dg20.masterListId is required on dropdown-master, radio, and multiselect widgets",
                                    fieldId));
                }
                if ("cascading-dropdown".equals(widgetType)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.x_dg20_cascading_master_lists_required",
                                    "x-dg20.parentMasterListId and childMasterListId are required on cascading-dropdown widgets",
                                    fieldId));
                }
                continue;
            }
            if (!StageSupport.isObject(xdg20)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_not_object", "x-dg20 must be a JSON object", fieldId));
                continue;
            }

            Iterator<String> keys = xdg20.fieldNames();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!KNOWN_X_DG20_KEYS.contains(key)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.x_dg20_unknown_key",
                                    "x-dg20 declares a key outside the governed extension vocabulary",
                                    fieldId + ".x-dg20." + key));
                }
            }

            validateVerifyEmail(xdg20, widgetType, fieldId, issues);
            validateAgeRange(xdg20, widgetType, fieldId, issues);
            validateOtpChannels(xdg20, widgetType, fieldId, issues);
            validateDefaultStateCode(xdg20, widgetType, fieldId, issues);
            validateDocUpload(xdg20, widgetType, fieldId, issues);
            validateDigiLockerDocumentType(xdg20, widgetType, fieldId, issues);
            validateMasterListId(xdg20, widgetType, fieldId, issues);
            validateCascadingMasterLists(xdg20, widgetType, fieldId, issues);
            validateDeclarationId(xdg20, widgetType, fieldId, issues);
            validateFeeRuleId(xdg20, widgetType, fieldId, issues);
        }
    }

    private static void validateVerifyEmail(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("verifyEmail");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"email".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.verifyEmail is only valid on an email widget",
                            fieldId));
            return;
        }
        if (!value.isBoolean()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_verify_email_invalid",
                            "x-dg20.verifyEmail must be a boolean",
                            fieldId));
        }
    }

    private static void validateAgeRange(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode minAge = xdg20.get("minAge");
        JsonNode maxAge = xdg20.get("maxAge");
        boolean hasMin = StageSupport.isPresent(minAge);
        boolean hasMax = StageSupport.isPresent(maxAge);
        if (!hasMin && !hasMax) {
            return;
        }
        if (!"dob".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.minAge/maxAge is only valid on a dob widget",
                            fieldId));
            return;
        }
        Long minValue = hasMin ? StageSupport.integerValueOrNull(minAge) : null;
        if (hasMin && (minValue == null || minValue < 0)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_min_age_invalid",
                            "x-dg20.minAge must be a nonnegative integer",
                            fieldId));
            minValue = null;
        }
        Long maxValue = hasMax ? StageSupport.integerValueOrNull(maxAge) : null;
        if (hasMax && (maxValue == null || maxValue < 0)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_max_age_invalid",
                            "x-dg20.maxAge must be a nonnegative integer",
                            fieldId));
            maxValue = null;
        }
        if (minValue != null && maxValue != null && minValue > maxValue) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_age_range_invalid",
                            "x-dg20.minAge must be less than or equal to x-dg20.maxAge",
                            fieldId));
        }
    }

    private static void validateOtpChannels(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("otpChannels");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"mobile-otp".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.otpChannels is only valid on a mobile-otp widget",
                            fieldId));
            return;
        }
        if (!StageSupport.isArray(value) || value.isEmpty()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_otp_channels_empty",
                            "x-dg20.otpChannels must be a nonempty JSON array",
                            fieldId));
            return;
        }
        if (value.size() != 1
                || !value.get(0).isTextual()
                || !"sms".equals(value.get(0).textValue())) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_otp_channel_unsupported",
                            "x-dg20.otpChannels supports only \"sms\" for v1",
                            fieldId));
        }
    }

    private static void validateDefaultStateCode(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("defaultStateCode");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"address-block".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.defaultStateCode is only valid on an address-block widget",
                            fieldId));
            return;
        }
        if (!StageSupport.isExactNonBlankText(value)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_default_state_code_blank",
                            "x-dg20.defaultStateCode must be a nonblank, unpadded string",
                            fieldId));
        }
    }

    private static void validateDocUpload(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode allowedMimeTypes = xdg20.get("allowedMimeTypes");
        JsonNode maxFileSizeBytes = xdg20.get("maxFileSizeBytes");
        boolean hasMime = StageSupport.isPresent(allowedMimeTypes);
        boolean hasSize = StageSupport.isPresent(maxFileSizeBytes);
        if (!hasMime && !hasSize) {
            return;
        }
        if (!"doc-upload".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.allowedMimeTypes/maxFileSizeBytes is only valid on a doc-upload widget",
                            fieldId));
            return;
        }
        if (hasMime) {
            if (!StageSupport.isArray(allowedMimeTypes) || allowedMimeTypes.isEmpty()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_allowed_mime_types_empty",
                                "x-dg20.allowedMimeTypes must be a nonempty JSON array",
                                fieldId));
            } else {
                Set<String> seen = new HashSet<>();
                for (JsonNode mime : allowedMimeTypes) {
                    if (!StageSupport.isExactNonBlankText(mime)) {
                        issues.offer(
                                ValidationIssue.error(
                                        "structure.x_dg20_allowed_mime_type_blank",
                                        "x-dg20.allowedMimeTypes entries must be nonblank, unpadded strings",
                                        fieldId));
                        continue;
                    }
                    if (!seen.add(mime.textValue())) {
                        issues.offer(
                                ValidationIssue.error(
                                        "structure.x_dg20_allowed_mime_type_duplicate",
                                        "x-dg20.allowedMimeTypes contains a duplicate MIME type",
                                        fieldId));
                    }
                }
            }
        }
        if (hasSize) {
            Long size = StageSupport.integerValueOrNull(maxFileSizeBytes);
            if (size == null || size <= 0 || size > ValidationLimits.DOC_UPLOAD_MAX_BYTES_CAP) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_max_file_size_invalid",
                                "x-dg20.maxFileSizeBytes must be a positive integer not exceeding 25 MiB",
                                fieldId));
            }
        }
    }

    private static void validateDigiLockerDocumentType(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("digiLockerDocumentTypeCode");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"digilocker-fetch".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.digiLockerDocumentTypeCode is only valid on a digilocker-fetch widget",
                            fieldId));
            return;
        }
        if (!StageSupport.isExactNonBlankText(value)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_digilocker_document_type_blank",
                            "x-dg20.digiLockerDocumentTypeCode must be a nonblank, unpadded string",
                            fieldId));
        }
    }

    private static void validateMasterListId(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("masterListId");
        boolean masterWidget = widgetType != null && MASTER_LIST_WIDGETS.contains(widgetType);
        if (!StageSupport.isPresent(value)) {
            if (masterWidget) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_master_list_id_required",
                                "x-dg20.masterListId is required on dropdown-master, radio, and multiselect widgets",
                                fieldId));
            }
            return;
        }
        if (!masterWidget) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.masterListId is only valid on dropdown-master, radio, or multiselect widgets",
                            fieldId));
            return;
        }
        if (!StageSupport.isExactNonBlankText(value)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_master_list_id_blank",
                            "x-dg20.masterListId must be a nonblank, unpadded string",
                            fieldId));
        }
    }

    private static void validateCascadingMasterLists(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode parent = xdg20.get("parentMasterListId");
        JsonNode child = xdg20.get("childMasterListId");
        boolean hasParent = StageSupport.isPresent(parent);
        boolean hasChild = StageSupport.isPresent(child);

        if ("cascading-dropdown".equals(widgetType)) {
            if (!hasParent || !hasChild) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_cascading_master_lists_required",
                                "x-dg20.parentMasterListId and childMasterListId are required on cascading-dropdown widgets",
                                fieldId));
                return;
            }
            if (!StageSupport.isExactNonBlankText(parent) || !StageSupport.isExactNonBlankText(child)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.x_dg20_cascading_master_lists_invalid",
                                "x-dg20.parentMasterListId and childMasterListId must both be nonblank, unpadded strings",
                                fieldId));
            }
            return;
        }

        if (!hasParent && !hasChild) {
            return;
        }
        issues.offer(
                ValidationIssue.error(
                        "structure.x_dg20_wrong_widget",
                        "x-dg20.parentMasterListId/childMasterListId is only valid on a cascading-dropdown widget",
                        fieldId));
    }

    private static void validateDeclarationId(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("declarationId");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"eligibility-declaration".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.declarationId is only valid on an eligibility-declaration widget",
                            fieldId));
            return;
        }
        if (!StageSupport.isExactNonBlankText(value)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_declaration_id_blank",
                            "x-dg20.declarationId must be a nonblank, unpadded string",
                            fieldId));
        }
    }

    private static void validateFeeRuleId(
            JsonNode xdg20, String widgetType, String fieldId, ValidationIssueCollector issues) {
        JsonNode value = xdg20.get("feeRuleId");
        if (!StageSupport.isPresent(value)) {
            return;
        }
        if (!"fee-field".equals(widgetType)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_wrong_widget",
                            "x-dg20.feeRuleId is only valid on a fee-field widget",
                            fieldId));
            return;
        }
        if (!StageSupport.isExactNonBlankText(value)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.x_dg20_fee_rule_id_blank",
                            "x-dg20.feeRuleId must be a nonblank, unpadded string",
                            fieldId));
        }
    }

    // ---------------------------------------------------------------- family repeater

    /**
     * Structural rules for {@code family-repeater} roots (FB-D16 Unit C alignment).
     *
     * <p>Enforces array/items shape, nonempty {@code items.properties}, {@code
     * additionalProperties: false}, required {@code maxItems} 1..20, optional {@code minItems}
     * 0..maxItems, dense unique known {@code items.required}, and forbids root {@code x-dg20}.
     * Nested provenance ↔ uiSchema matching and bilingual labels are enforced by {@link
     * PaletteProvenanceValidator} and {@link BilingualCompletenessValidator}. Does <em>not</em>
     * impose the Builder-only {@code FAMILY_MEMBER} whitelist — server admits any controlled-palette
     * child widget.
     */
    private static void validateFamilyRepeaters(GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"family-repeater".equals(palette.widgetType())) {
                continue;
            }
            JsonNode schemaNode = field.schemaNode();
            String fieldId = field.fieldId();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }

            if (StageSupport.isPresent(schemaNode.get("x-dg20"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_x_dg20_forbidden",
                                "family-repeater must not declare x-dg20",
                                fieldId));
            }

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"array".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_type_not_array",
                                "family-repeater schema type must be exactly \"array\"",
                                fieldId));
            }

            JsonNode items = schemaNode.get("items");
            Long maxItems = null;
            if (!StageSupport.isObject(items)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_items_not_object",
                                "family-repeater schema.items must be a JSON object",
                                fieldId));
            } else {
                JsonNode itemsType = items.get("type");
                if (itemsType == null || !itemsType.isTextual() || !"object".equals(itemsType.textValue())) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.repeater_items_type_not_object",
                                    "family-repeater schema.items.type must be exactly \"object\"",
                                    fieldId));
                }
                JsonNode itemProperties = items.get("properties");
                if (!StageSupport.isObject(itemProperties) || itemProperties.isEmpty()) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.repeater_items_properties_empty",
                                    "family-repeater schema.items.properties must be a nonempty JSON object",
                                    fieldId));
                } else {
                    validateRepeaterItemsRequired(items.get("required"), itemProperties, fieldId, issues);
                }
                JsonNode itemAdditionalProperties = items.get("additionalProperties");
                if (itemAdditionalProperties == null
                        || !itemAdditionalProperties.isBoolean()
                        || itemAdditionalProperties.booleanValue()) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.repeater_items_additional_properties_not_false",
                                    "family-repeater schema.items.additionalProperties must be exactly false",
                                    fieldId));
                }
            }

            JsonNode maxItemsNode = schemaNode.get("maxItems");
            if (!StageSupport.isPresent(maxItemsNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_max_items_required",
                                "family-repeater schema.maxItems is required",
                                fieldId));
            } else {
                maxItems = StageSupport.integerValueOrNull(maxItemsNode);
                if (maxItems == null || maxItems < 1 || maxItems > ValidationLimits.FAMILY_REPEATER_MAX_ITEMS_CAP) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.repeater_max_items_out_of_range",
                                    "family-repeater schema.maxItems must be an integer between 1 and 20 inclusive",
                                    fieldId));
                    maxItems = null;
                }
            }

            JsonNode minItemsNode = schemaNode.get("minItems");
            if (StageSupport.isPresent(minItemsNode)) {
                Long minItems = StageSupport.integerValueOrNull(minItemsNode);
                long upperBound = maxItems != null ? maxItems : ValidationLimits.FAMILY_REPEATER_MAX_ITEMS_CAP;
                if (minItems == null || minItems < 0 || minItems > upperBound) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.repeater_min_items_out_of_range",
                                    "family-repeater schema.minItems must be a nonnegative integer not exceeding maxItems",
                                    fieldId));
                }
            }
        }
    }

    /**
     * {@code items.required} when present must be a dense array of unique, known, nonblank child
     * property IDs (no Builder-only member whitelist).
     */
    private static void validateRepeaterItemsRequired(
            JsonNode required, JsonNode itemProperties, String fieldId, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(required)) {
            return;
        }
        if (!StageSupport.isArray(required)) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.repeater_items_required_not_array",
                            "family-repeater schema.items.required must be a JSON array when present",
                            fieldId));
            return;
        }

        Set<String> knownPropertyNames = new HashSet<>();
        itemProperties.fieldNames().forEachRemaining(knownPropertyNames::add);

        Set<String> seen = new HashSet<>();
        for (JsonNode entry : required) {
            if (!StageSupport.isExactNonBlankText(entry)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_items_required_entry_blank",
                                "family-repeater schema.items.required entries must be nonblank, unpadded strings",
                                fieldId));
                continue;
            }
            String name = entry.textValue();
            if (!knownPropertyNames.contains(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_items_required_unknown_property",
                                "family-repeater schema.items.required references an unknown item property",
                                fieldId + "[]." + name));
                continue;
            }
            if (!seen.add(name)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.repeater_items_required_duplicate_entry",
                                "family-repeater schema.items.required contains a duplicate property name",
                                fieldId + "[]." + name));
            }
        }
    }

    // ---------------------------------------------------------------- multiselect bounds

    private static void validateMultiselectBounds(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        Set<String> rootRequired = rootRequiredPropertyNames(jsonSchema);

        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"multiselect".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"array".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_type_not_array",
                                "multiselect schema type must be exactly \"array\"",
                                fieldId));
            }

            JsonNode items = schemaNode.get("items");
            if (!StageSupport.isPresent(items)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_items_missing",
                                "multiselect schema.items must be present as an object",
                                fieldId));
            } else if (!StageSupport.isObject(items)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_items_missing",
                                "multiselect schema.items must be present as an object",
                                fieldId));
            } else {
                JsonNode itemsType = items.get("type");
                if (itemsType == null || !itemsType.isTextual() || !"string".equals(itemsType.textValue())) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.multiselect_items_type_not_string",
                                    "multiselect schema.items.type must be exactly \"string\"",
                                    fieldId));
                }
                if (StageSupport.isPresent(items.get("enum"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.multiselect_items_enum_forbidden",
                                    "multiselect schema.items must not declare enum",
                                    fieldId));
                }
            }

            JsonNode uniqueItems = schemaNode.get("uniqueItems");
            if (!StageSupport.isPresent(uniqueItems)
                    || !uniqueItems.isBoolean()
                    || !uniqueItems.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_unique_items_not_true",
                                "multiselect schema.uniqueItems must be present and exactly true",
                                fieldId));
            }

            JsonNode minItemsNode = schemaNode.get("minItems");
            JsonNode maxItemsNode = schemaNode.get("maxItems");
            boolean hasMin = StageSupport.isPresent(minItemsNode);
            boolean hasMax = StageSupport.isPresent(maxItemsNode);
            Long minItems = hasMin ? StageSupport.integerValueOrNull(minItemsNode) : null;
            Long maxItems = hasMax ? StageSupport.integerValueOrNull(maxItemsNode) : null;

            if (hasMin && (minItems == null || minItems < 0)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_min_items_invalid",
                                "multiselect schema.minItems must be a nonnegative integer when present",
                                fieldId));
                minItems = null;
                hasMin = false;
            }
            if (hasMax && (maxItems == null || maxItems < 0)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_max_items_invalid",
                                "multiselect schema.maxItems must be a nonnegative integer when present",
                                fieldId));
                maxItems = null;
                hasMax = false;
            }
            if (minItems != null && maxItems != null && minItems > maxItems) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.multiselect_items_range_invalid",
                                "multiselect schema.minItems must be less than or equal to maxItems",
                                fieldId));
            }

            if (rootRequired.contains(field.rootFieldId())) {
                // FB-D10.1: JSON Schema is authoritative — require explicit minItems >= 1.
                // Do not invent a virtual minimum. Range min<=max is already reported above.
                if (!hasMin || minItems == null || minItems < 1) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.multiselect_required_min_items_invalid",
                                    "multiselect schema.minItems must be present and at least 1 when the field is required",
                                    fieldId));
                }
            }
        }
    }

    private static Set<String> rootRequiredPropertyNames(JsonNode jsonSchema) {
        if (!StageSupport.isObject(jsonSchema)) {
            return Set.of();
        }
        JsonNode required = jsonSchema.get("required");
        if (!StageSupport.isArray(required)) {
            return Set.of();
        }
        Set<String> names = new HashSet<>();
        for (JsonNode entry : required) {
            if (StageSupport.isExactNonBlankText(entry)) {
                names.add(entry.textValue());
            }
        }
        return names;
    }

    // ---------------------------------------------------------------- address-block (FB-D11)

    private static void validateAddressBlockSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"address-block".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.address_block_type_not_object",
                                "address-block schema type must be exactly \"object\"",
                                fieldId));
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, ADDRESS_BLOCK_CODE_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.address_block_properties_invalid",
                                "address-block schema.properties must be exactly"
                                        + " stateCode, districtCode, talukaCode, villageCode",
                                fieldId));
            } else {
                for (String codeProperty : ADDRESS_BLOCK_CODE_PROPERTIES) {
                    if (!isStringMinLengthOne(properties.get(codeProperty))) {
                        issues.offer(
                                ValidationIssue.error(
                                        "structure.address_block_code_property_invalid",
                                        "address-block code properties must be string with minLength 1",
                                        fieldId + "." + codeProperty));
                    }
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), Set.of("stateCode"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.address_block_required_invalid",
                                "address-block schema.required must be exactly [\"stateCode\"] once",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.address_block_additional_properties_not_false",
                                "address-block schema.additionalProperties must be exactly false",
                                fieldId));
            }

            JsonNode xdg20 = schemaNode.get("x-dg20");
            if (StageSupport.isPresent(xdg20)) {
                // Absent is allowed. When present: exact { defaultStateCode } only.
                // Blank/padded defaultStateCode is reported by validateDefaultStateCode.
                if (!StageSupport.hasExactKeys(xdg20, ADDRESS_BLOCK_X_DG20_KEYS)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.address_block_x_dg20_invalid",
                                    "address-block x-dg20 must be absent or exactly { defaultStateCode }",
                                    fieldId));
                }
            }
        }
    }

    // ---------------------------------------------------------------- photo-capture (FB-D11)

    private static void validatePhotoCaptureSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"photo-capture".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.photo_capture_type_not_object",
                                "photo-capture schema type must be exactly \"object\"",
                                fieldId));
            }

            if (StageSupport.isPresent(schemaNode.get("x-dg20"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.photo_capture_x_dg20_forbidden",
                                "photo-capture must not declare x-dg20",
                                fieldId));
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, PHOTO_CAPTURE_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.photo_capture_properties_invalid",
                                "photo-capture schema.properties must be exactly"
                                        + " objectRef, mimeType, sizeBytes, width, height, scanStatus",
                                fieldId));
            } else {
                if (!isStringMinLengthOne(properties.get("objectRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_object_ref_invalid",
                                    "photo-capture objectRef must be string with minLength 1",
                                    fieldId));
                }

                if (!hasExactStringEnum(
                        properties.get("mimeType"),
                        Arrays.asList(ValidationLimits.PHOTO_CAPTURE_ALLOWED_MIME_TYPES))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_mime_type_invalid",
                                    "photo-capture mimeType enum must be exactly image/jpeg and image/png once each",
                                    fieldId));
                }

                if (!isBoundedInteger(
                        properties.get("sizeBytes"), 1L, ValidationLimits.PHOTO_CAPTURE_MAX_BYTES)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_size_bytes_invalid",
                                    "photo-capture sizeBytes must be integer with minimum 1 and maximum"
                                            + " PHOTO_CAPTURE_MAX_BYTES",
                                    fieldId));
                }

                if (!isBoundedInteger(
                        properties.get("width"),
                        ValidationLimits.PHOTO_CAPTURE_MIN_DIMENSION,
                        ValidationLimits.PHOTO_CAPTURE_MAX_DIMENSION)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_dimension_invalid",
                                    "photo-capture width must be integer within PHOTO_CAPTURE dimension bounds",
                                    fieldId + ".width"));
                }
                if (!isBoundedInteger(
                        properties.get("height"),
                        ValidationLimits.PHOTO_CAPTURE_MIN_DIMENSION,
                        ValidationLimits.PHOTO_CAPTURE_MAX_DIMENSION)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_dimension_invalid",
                                    "photo-capture height must be integer within PHOTO_CAPTURE dimension bounds",
                                    fieldId + ".height"));
                }

                if (!hasExactStringEnum(properties.get("scanStatus"), SCAN_STATUS_CLEAN_ENUM)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.photo_capture_scan_status_invalid",
                                    "photo-capture scanStatus enum must be exactly [\"CLEAN\"]",
                                    fieldId));
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), PHOTO_CAPTURE_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.photo_capture_required_invalid",
                                "photo-capture schema.required must list all six properties exactly once each",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.photo_capture_additional_properties_not_false",
                                "photo-capture schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- doc-upload (FB-D12)

    /**
     * Full authoritative shape for the {@code doc-upload} widget's field schema.
     *
     * <p>Unlike address-block/photo-capture, {@code x-dg20} is required here (not optional or
     * forbidden): {@code allowedMimeTypes} and {@code maxFileSizeBytes} govern the
     * {@code mimeType} enum and {@code sizeBytes} maximum respectively, so the two must be
     * cross-checked against each other. The existing {@link #validateDocUpload} walk helper keeps
     * reporting wrong-widget placement and blank/duplicate/empty {@code x-dg20} entries wherever
     * they occur in the document; this method is the authoritative full-shape check for
     * doc-upload fields specifically. Deliberately performs no object-store or malware-scan
     * existence lookup — this stage is pure, offline structural validation only.
     */
    private static void validateDocUploadSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"doc-upload".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_type_not_object",
                                "doc-upload schema type must be exactly \"object\"",
                                fieldId));
            }

            JsonNode xdg20 = schemaNode.get("x-dg20");
            List<String> allowedMimeTypes = null;
            Long maxFileSizeBytes = null;
            if (!StageSupport.isPresent(xdg20)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_x_dg20_required",
                                "doc-upload schema.x-dg20 is required with allowedMimeTypes and maxFileSizeBytes",
                                fieldId));
            } else if (!StageSupport.hasExactKeys(xdg20, DOC_UPLOAD_X_DG20_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_x_dg20_invalid",
                                "doc-upload x-dg20 must be exactly { allowedMimeTypes, maxFileSizeBytes }",
                                fieldId));
            } else {
                allowedMimeTypes = exactNonBlankTextList(xdg20.get("allowedMimeTypes"));
                if (allowedMimeTypes == null || hasDuplicates(allowedMimeTypes)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_allowed_mime_types_invalid",
                                    "doc-upload x-dg20.allowedMimeTypes must be a nonempty array of unique,"
                                            + " nonblank, unpadded strings",
                                    fieldId));
                    allowedMimeTypes = null;
                }

                Long size = StageSupport.integerValueOrNull(xdg20.get("maxFileSizeBytes"));
                if (size == null || size <= 0 || size > ValidationLimits.DOC_UPLOAD_MAX_BYTES_CAP) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_max_file_size_invalid",
                                    "doc-upload x-dg20.maxFileSizeBytes must be a positive integer not exceeding"
                                            + " DOC_UPLOAD_MAX_BYTES_CAP",
                                    fieldId));
                } else {
                    maxFileSizeBytes = size;
                }
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, DOC_UPLOAD_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_properties_invalid",
                                "doc-upload schema.properties must be exactly"
                                        + " objectRef, fileName, mimeType, sizeBytes, scanStatus",
                                fieldId));
            } else {
                if (!isStringMinLengthOne(properties.get("objectRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_string_property_invalid",
                                    "doc-upload objectRef must be string with minLength 1",
                                    fieldId + ".objectRef"));
                }
                if (!isStringMinLengthOne(properties.get("fileName"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_string_property_invalid",
                                    "doc-upload fileName must be string with minLength 1",
                                    fieldId + ".fileName"));
                }

                if (allowedMimeTypes == null
                        || !hasExactOrderedStringEnum(properties.get("mimeType"), allowedMimeTypes)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_mime_type_invalid",
                                    "doc-upload mimeType enum must exactly match x-dg20.allowedMimeTypes in the"
                                            + " same order",
                                    fieldId));
                }

                if (maxFileSizeBytes == null
                        || !isBoundedInteger(properties.get("sizeBytes"), 1L, maxFileSizeBytes)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_size_bytes_invalid",
                                    "doc-upload sizeBytes must be integer with minimum 1 and maximum exactly"
                                            + " x-dg20.maxFileSizeBytes",
                                    fieldId));
                }

                if (!hasExactStringEnum(properties.get("scanStatus"), SCAN_STATUS_CLEAN_ENUM)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.doc_upload_scan_status_invalid",
                                    "doc-upload scanStatus enum must be exactly [\"CLEAN\"]",
                                    fieldId));
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), DOC_UPLOAD_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_required_invalid",
                                "doc-upload schema.required must list all five properties exactly once each",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.doc_upload_additional_properties_not_false",
                                "doc-upload schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- digilocker-fetch (FB-D12)

    /**
     * Full authoritative shape for the {@code digilocker-fetch} widget's field schema.
     *
     * <p>{@code x-dg20} is required (mirrors doc-upload, not the optional/forbidden address-block
     * / photo-capture pattern): {@code digiLockerDocumentTypeCode} governs the
     * {@code documentTypeCode} property's {@code const}. The existing {@link
     * #validateDigiLockerDocumentType} walk helper keeps reporting wrong-widget placement and
     * blank/padded {@code x-dg20.digiLockerDocumentTypeCode} wherever it occurs in the document;
     * this method is the authoritative full-shape check for digilocker-fetch fields specifically.
     * Deliberately performs no provider or document-type existence lookup — this stage is pure,
     * offline structural validation only.
     */
    private static void validateDigiLockerSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"digilocker-fetch".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_type_not_object",
                                "digilocker-fetch schema type must be exactly \"object\"",
                                fieldId));
            }

            JsonNode xdg20 = schemaNode.get("x-dg20");
            String documentTypeCode = null;
            if (!StageSupport.isPresent(xdg20)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_x_dg20_required",
                                "digilocker-fetch schema.x-dg20 is required with digiLockerDocumentTypeCode",
                                fieldId));
            } else if (!StageSupport.hasExactKeys(xdg20, DIGILOCKER_X_DG20_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_x_dg20_invalid",
                                "digilocker-fetch x-dg20 must be exactly { digiLockerDocumentTypeCode }",
                                fieldId));
            } else {
                JsonNode codeNode = xdg20.get("digiLockerDocumentTypeCode");
                if (!StageSupport.isExactNonBlankText(codeNode)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.digilocker_document_type_code_blank",
                                    "digilocker-fetch x-dg20.digiLockerDocumentTypeCode must be a nonblank,"
                                            + " unpadded string",
                                    fieldId));
                } else {
                    documentTypeCode = codeNode.textValue();
                }
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, DIGILOCKER_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_properties_invalid",
                                "digilocker-fetch schema.properties must be exactly"
                                        + " issuerSignedRef, documentTypeCode",
                                fieldId));
            } else {
                if (!isStringMinLengthOne(properties.get("issuerSignedRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.digilocker_issuer_signed_ref_invalid",
                                    "digilocker-fetch issuerSignedRef must be string with minLength 1",
                                    fieldId));
                }

                if (documentTypeCode == null
                        || !isStringConstExactly(properties.get("documentTypeCode"), documentTypeCode)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.digilocker_document_type_code_const_invalid",
                                    "digilocker-fetch documentTypeCode const must exactly equal"
                                            + " x-dg20.digiLockerDocumentTypeCode",
                                    fieldId));
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), DIGILOCKER_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_required_invalid",
                                "digilocker-fetch schema.required must list both properties exactly once each",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.digilocker_additional_properties_not_false",
                                "digilocker-fetch schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- fee-field (FB-D13)

    /**
     * Full authoritative shape for the {@code fee-field} widget's field schema.
     *
     * <p>Like doc-upload/digilocker-fetch (not the optional/forbidden address-block /
     * photo-capture pattern), {@code x-dg20} is required: {@code feeRuleId} governs the {@code
     * feeRuleId} property's {@code const}. The existing {@link #validateFeeRuleId} walk helper
     * keeps reporting wrong-widget placement and blank/padded {@code x-dg20.feeRuleId} wherever it
     * occurs in the document; this method is the authoritative full-shape check for fee-field
     * fields specifically. {@code amountMinor}'s ceiling is {@link
     * ValidationLimits#FEE_AMOUNT_MINOR_MAX} — a provisional cross-package contract with Unit A's
     * {@code isValidFeeAmountMinor} / {@code Number.MAX_SAFE_INTEGER}, see that constant's
     * Javadoc. Deliberately performs no fee-engine/fee-rule lookup — this stage is pure, offline
     * structural validation only.
     */
    private static void validateFeeFieldSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"fee-field".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_type_not_object",
                                "fee-field schema type must be exactly \"object\"",
                                fieldId));
            }

            JsonNode xdg20 = schemaNode.get("x-dg20");
            String feeRuleId = null;
            if (!StageSupport.isPresent(xdg20)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_x_dg20_required",
                                "fee-field schema.x-dg20 is required with feeRuleId",
                                fieldId));
            } else if (!StageSupport.hasExactKeys(xdg20, FEE_FIELD_X_DG20_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_x_dg20_invalid",
                                "fee-field x-dg20 must be exactly { feeRuleId }",
                                fieldId));
            } else {
                JsonNode feeRuleIdNode = xdg20.get("feeRuleId");
                if (!StageSupport.isExactNonBlankText(feeRuleIdNode)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_fee_rule_id_blank",
                                    "fee-field x-dg20.feeRuleId must be a nonblank, unpadded string",
                                    fieldId));
                } else {
                    feeRuleId = feeRuleIdNode.textValue();
                }
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, FEE_FIELD_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_properties_invalid",
                                "fee-field schema.properties must be exactly"
                                        + " feeRuleId, contextRevision, currency, amountMinor, quoteRef",
                                fieldId));
            } else {
                if (feeRuleId == null || !isStringConstExactly(properties.get("feeRuleId"), feeRuleId)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_fee_rule_id_const_invalid",
                                    "fee-field feeRuleId const must exactly equal x-dg20.feeRuleId",
                                    fieldId));
                }

                if (!isStringMinLengthOne(properties.get("contextRevision"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_string_property_invalid",
                                    "fee-field contextRevision must be string with minLength 1",
                                    fieldId + ".contextRevision"));
                }

                if (!isStringConstExactly(properties.get("currency"), "INR")) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_currency_invalid",
                                    "fee-field currency const must be exactly \"INR\"",
                                    fieldId));
                }

                if (!isBoundedInteger(properties.get("amountMinor"), 0L, ValidationLimits.FEE_AMOUNT_MINOR_MAX)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_amount_minor_invalid",
                                    "fee-field amountMinor must be integer with minimum 0 and maximum exactly"
                                            + " FEE_AMOUNT_MINOR_MAX",
                                    fieldId));
                }

                if (!isStringMinLengthOne(properties.get("quoteRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.fee_field_string_property_invalid",
                                    "fee-field quoteRef must be string with minLength 1",
                                    fieldId + ".quoteRef"));
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), FEE_FIELD_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_required_invalid",
                                "fee-field schema.required must list all five properties exactly once each",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.fee_field_additional_properties_not_false",
                                "fee-field schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- signature-esign (FB-D13)

    /**
     * Full authoritative shape for the {@code signature-esign} widget's field schema.
     *
     * <p>Unlike fee-field/doc-upload/digilocker-fetch, {@code x-dg20} is forbidden here (mirrors
     * the address-block / photo-capture forbidden pattern) — signature capture has no governed
     * extension surface today. Deliberately performs no eSign-provider lookup — this stage is
     * pure, offline structural validation only.
     */
    private static void validateSignatureEsignSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"signature-esign".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.signature_esign_type_not_object",
                                "signature-esign schema type must be exactly \"object\"",
                                fieldId));
            }

            if (StageSupport.isPresent(schemaNode.get("x-dg20"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.signature_esign_x_dg20_forbidden",
                                "signature-esign must not declare x-dg20",
                                fieldId));
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, SIGNATURE_ESIGN_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.signature_esign_properties_invalid",
                                "signature-esign schema.properties must be exactly"
                                        + " contextRevision, signedArtefactRef",
                                fieldId));
            } else {
                if (!isStringMinLengthOne(properties.get("contextRevision"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.signature_esign_string_property_invalid",
                                    "signature-esign contextRevision must be string with minLength 1",
                                    fieldId + ".contextRevision"));
                }
                if (!isStringMinLengthOne(properties.get("signedArtefactRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.signature_esign_string_property_invalid",
                                    "signature-esign signedArtefactRef must be string with minLength 1",
                                    fieldId + ".signedArtefactRef"));
                }
            }

            if (!hasExactRequiredMembers(schemaNode.get("required"), SIGNATURE_ESIGN_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.signature_esign_required_invalid",
                                "signature-esign schema.required must list both properties exactly once each",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.signature_esign_additional_properties_not_false",
                                "signature-esign schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- eligibility-declaration (FB-D14)

    /**
     * Full authoritative shape for the {@code eligibility-declaration} widget's field schema.
     *
     * <p>Requires exact four-property consent-receipt reference object, synchronized
     * {@code declarationId.const} with {@code x-dg20.declarationId}, locale enum exactly
     * {@code ["en","gu"]}, and {@code additionalProperties: false}. Deliberately performs no
     * consent-ledger or declaration-text HTTP lookup — this stage is pure, offline structural
     * validation only. Declaration copy itself lives in bilingual help (validated separately).
     */
    private static void validateEligibilityDeclarationSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"eligibility-declaration".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_type_not_object",
                                "eligibility-declaration schema type must be exactly \"object\"",
                                fieldId));
            }

            JsonNode xdg20 = schemaNode.get("x-dg20");
            String declarationId = null;
            if (!StageSupport.isPresent(xdg20)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_x_dg20_required",
                                "eligibility-declaration schema.x-dg20 is required with declarationId",
                                fieldId));
            } else if (!StageSupport.hasExactKeys(xdg20, ELIGIBILITY_DECLARATION_X_DG20_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_x_dg20_invalid",
                                "eligibility-declaration x-dg20 must be exactly { declarationId }",
                                fieldId));
            } else {
                JsonNode declarationIdNode = xdg20.get("declarationId");
                if (!StageSupport.isExactNonBlankText(declarationIdNode)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.eligibility_declaration_id_blank",
                                    "eligibility-declaration x-dg20.declarationId must be a nonblank, unpadded string",
                                    fieldId));
                } else {
                    declarationId = declarationIdNode.textValue();
                }
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, new HashSet<>(ELIGIBILITY_DECLARATION_PROPERTIES))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_properties_invalid",
                                "eligibility-declaration schema.properties must be exactly"
                                        + " declarationId, accepted, locale, consentReceiptRef",
                                fieldId));
            } else {
                if (declarationId == null
                        || !isStringConstExactly(properties.get("declarationId"), declarationId)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.eligibility_declaration_id_const_invalid",
                                    "eligibility-declaration declarationId const must exactly equal x-dg20.declarationId",
                                    fieldId));
                }

                JsonNode accepted = properties.get("accepted");
                if (!StageSupport.isObject(accepted)
                        || accepted.get("type") == null
                        || !accepted.get("type").isTextual()
                        || !"boolean".equals(accepted.get("type").textValue())) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.eligibility_declaration_accepted_invalid",
                                    "eligibility-declaration accepted must be type boolean",
                                    fieldId + ".accepted"));
                }

                if (!hasExactOrderedStringEnum(properties.get("locale"), ELIGIBILITY_LOCALE_ENUM)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.eligibility_declaration_locale_invalid",
                                    "eligibility-declaration locale enum must be exactly [\"en\", \"gu\"]",
                                    fieldId));
                }

                if (!isStringMinLengthOne(properties.get("consentReceiptRef"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.eligibility_declaration_receipt_ref_invalid",
                                    "eligibility-declaration consentReceiptRef must be string with minLength 1",
                                    fieldId + ".consentReceiptRef"));
                }
            }

            if (!hasExactOrderedRequiredMembers(
                    schemaNode.get("required"), ELIGIBILITY_DECLARATION_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_required_invalid",
                                "eligibility-declaration schema.required must list all four properties"
                                        + " exactly once each in order",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.eligibility_declaration_additional_properties_not_false",
                                "eligibility-declaration schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    // ---------------------------------------------------------------- caf-prefill (FB-D15)

    /**
     * Full authoritative shape for the {@code caf-prefill} widget's field schema.
     *
     * <p>Like {@code signature-esign}, {@code x-dg20} is forbidden — CAF attribute binding lives in
     * {@code meta.prefillBindings}, not on the field schema. Requires exact {@code value}/{@code
     * source} object with ordered source enum {@code ["CAF","OVERRIDE"]} and {@code
     * additionalProperties: false}. Deliberately performs no CAF Golden Record lookup — this stage
     * is pure, offline structural validation only. Prefill bindings themselves are optional and
     * validated separately by {@link BindingIntegrityValidator}.
     */
    private static void validateCafPrefillSchemas(
            JsonNode jsonSchema, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        for (GovernedField field : graph.fields()) {
            if (field.isNested()) {
                continue;
            }
            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !"caf-prefill".equals(palette.widgetType())) {
                continue;
            }

            JsonNode schemaNode = field.schemaNode();
            if (!StageSupport.isObject(schemaNode)) {
                continue;
            }
            String fieldId = field.fieldId();

            JsonNode type = schemaNode.get("type");
            if (type == null || !type.isTextual() || !"object".equals(type.textValue())) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.caf_prefill_type_not_object",
                                "caf-prefill schema type must be exactly \"object\"",
                                fieldId));
            }

            if (StageSupport.isPresent(schemaNode.get("x-dg20"))) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.caf_prefill_x_dg20_forbidden",
                                "caf-prefill must not declare x-dg20",
                                fieldId));
            }

            JsonNode properties = schemaNode.get("properties");
            if (!StageSupport.hasExactKeys(properties, CAF_PREFILL_PROPERTIES)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.caf_prefill_properties_invalid",
                                "caf-prefill schema.properties must be exactly value, source",
                                fieldId));
            } else {
                if (!isStringMinLengthOne(properties.get("value"))) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.caf_prefill_value_invalid",
                                    "caf-prefill value must be string with minLength 1",
                                    fieldId + ".value"));
                }
                if (!hasExactOrderedStringEnum(properties.get("source"), CAF_PREFILL_SOURCE_ENUM)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "structure.caf_prefill_source_invalid",
                                    "caf-prefill source enum must be exactly [\"CAF\", \"OVERRIDE\"]",
                                    fieldId));
                }
            }

            if (!hasExactOrderedRequiredMembers(schemaNode.get("required"), CAF_PREFILL_REQUIRED)) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.caf_prefill_required_invalid",
                                "caf-prefill schema.required must list value, source exactly once each in order",
                                fieldId));
            }

            JsonNode additionalProperties = schemaNode.get("additionalProperties");
            if (additionalProperties == null
                    || !additionalProperties.isBoolean()
                    || additionalProperties.booleanValue()) {
                issues.offer(
                        ValidationIssue.error(
                                "structure.caf_prefill_additional_properties_not_false",
                                "caf-prefill schema.additionalProperties must be exactly false",
                                fieldId));
            }
        }
    }

    private static boolean isStringMinLengthOne(JsonNode propertySchema) {
        if (!StageSupport.isObject(propertySchema)) {
            return false;
        }
        JsonNode type = propertySchema.get("type");
        if (type == null || !type.isTextual() || !"string".equals(type.textValue())) {
            return false;
        }
        Long minLength = StageSupport.integerValueOrNull(propertySchema.get("minLength"));
        return minLength != null && minLength == 1L;
    }

    private static boolean isBoundedInteger(JsonNode propertySchema, long minimum, long maximum) {
        if (!StageSupport.isObject(propertySchema)) {
            return false;
        }
        JsonNode type = propertySchema.get("type");
        if (type == null || !type.isTextual() || !"integer".equals(type.textValue())) {
            return false;
        }
        Long min = StageSupport.integerValueOrNull(propertySchema.get("minimum"));
        Long max = StageSupport.integerValueOrNull(propertySchema.get("maximum"));
        return min != null && max != null && min == minimum && max == maximum;
    }

    /**
     * String property with {@code enum} containing each expected value exactly once (order
     * independent).
     */
    private static boolean hasExactStringEnum(JsonNode propertySchema, List<String> expectedValues) {
        if (!StageSupport.isObject(propertySchema)) {
            return false;
        }
        JsonNode type = propertySchema.get("type");
        if (type == null || !type.isTextual() || !"string".equals(type.textValue())) {
            return false;
        }
        return hasExactRequiredMembers(propertySchema.get("enum"), new HashSet<>(expectedValues));
    }

    /**
     * String property with {@code enum} matching {@code expectedInOrder} value-for-value,
     * position-for-position (unlike {@link #hasExactStringEnum}, order matters here because the
     * enum mirrors an author-ordered {@code x-dg20.allowedMimeTypes} array).
     */
    private static boolean hasExactOrderedStringEnum(JsonNode propertySchema, List<String> expectedInOrder) {
        if (!StageSupport.isObject(propertySchema)) {
            return false;
        }
        JsonNode type = propertySchema.get("type");
        if (type == null || !type.isTextual() || !"string".equals(type.textValue())) {
            return false;
        }
        JsonNode enumNode = propertySchema.get("enum");
        if (!StageSupport.isArray(enumNode) || enumNode.size() != expectedInOrder.size()) {
            return false;
        }
        for (int i = 0; i < expectedInOrder.size(); i++) {
            JsonNode entry = enumNode.get(i);
            if (!entry.isTextual() || !expectedInOrder.get(i).equals(entry.textValue())) {
                return false;
            }
        }
        return true;
    }

    /** String property with {@code const} exactly equal to {@code expectedValue}. */
    private static boolean isStringConstExactly(JsonNode propertySchema, String expectedValue) {
        if (!StageSupport.isObject(propertySchema)) {
            return false;
        }
        JsonNode type = propertySchema.get("type");
        if (type == null || !type.isTextual() || !"string".equals(type.textValue())) {
            return false;
        }
        JsonNode constNode = propertySchema.get("const");
        return constNode != null && constNode.isTextual() && expectedValue.equals(constNode.textValue());
    }

    /**
     * Nonempty array of exact nonblank, unpadded text entries, or {@code null} if the array is
     * absent, empty, or contains any non-conforming entry.
     */
    private static List<String> exactNonBlankTextList(JsonNode arrayNode) {
        if (!StageSupport.isArray(arrayNode) || arrayNode.isEmpty()) {
            return null;
        }
        List<String> values = new ArrayList<>();
        for (JsonNode entry : arrayNode) {
            if (!StageSupport.isExactNonBlankText(entry)) {
                return null;
            }
            values.add(entry.textValue());
        }
        return values;
    }

    private static boolean hasDuplicates(List<String> values) {
        return new HashSet<>(values).size() != values.size();
    }

    /** Required array whose string members match {@code expectedInOrder} position-for-position. */
    private static boolean hasExactOrderedRequiredMembers(JsonNode arrayNode, List<String> expectedInOrder) {
        if (!StageSupport.isArray(arrayNode) || arrayNode.size() != expectedInOrder.size()) {
            return false;
        }
        for (int i = 0; i < expectedInOrder.size(); i++) {
            JsonNode entry = arrayNode.get(i);
            if (!entry.isTextual() || !expectedInOrder.get(i).equals(entry.textValue())) {
                return false;
            }
        }
        return true;
    }

    /** Required/enum array whose string members are exactly {@code expected} once each. */
    private static boolean hasExactRequiredMembers(JsonNode arrayNode, Set<String> expected) {
        if (!StageSupport.isArray(arrayNode) || arrayNode.size() != expected.size()) {
            return false;
        }
        Set<String> seen = new HashSet<>();
        for (JsonNode entry : arrayNode) {
            if (!entry.isTextual()) {
                return false;
            }
            String value = entry.textValue();
            if (!expected.contains(value) || !seen.add(value)) {
                return false;
            }
        }
        return seen.size() == expected.size();
    }
}
