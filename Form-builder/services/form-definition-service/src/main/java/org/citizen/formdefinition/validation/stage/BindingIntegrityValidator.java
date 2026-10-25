package org.citizen.formdefinition.validation.stage;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.citizen.formdefinition.validation.ValidationIssue;
import org.citizen.formdefinition.validation.ValidationIssueCollector;
import org.citizen.formdefinition.validation.fieldpath.GovernedField;
import org.citizen.formdefinition.validation.fieldpath.GovernedFieldGraph;
import org.citizen.formdefinition.validation.palette.ControlledPaletteEntry;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Stage 4 — binding integrity validation (FB-C1).
 *
 * <p>Confirms {@code prefillBindings}, {@code integrationBindings}, and {@code workflowBindings}
 * reference real, data-producing governed fields with well-formed values, and contain no
 * duplicate or orphaned entries. Never infers or repairs a binding and never reaches out to a
 * live adapter, workflow engine, or CAF service.
 */
public final class BindingIntegrityValidator {

    private static final String CAF_PREFILL_WIDGET = "caf-prefill";
    private static final Set<String> PREFILL_KEYS = Set.of("fieldId", "cafAttribute", "confidenceMin");
    private static final Set<String> INTEGRATION_KEYS = Set.of("fieldId", "adapterId", "param", "direction");
    private static final Set<String> WORKFLOW_KEYS = Set.of("fieldId", "stage");

    private BindingIntegrityValidator() {}

    public static void validate(JsonNode document, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (document == null || !document.isObject()) {
            return;
        }
        JsonNode meta = document.get("meta");
        if (!StageSupport.isObject(meta)) {
            return;
        }

        validatePrefillBindings(meta.get("prefillBindings"), graph, issues);
        validateIntegrationBindings(meta.get("integrationBindings"), graph, issues);
        validateWorkflowBindings(meta.get("workflowBindings"), graph, issues);
    }

    private static void validatePrefillBindings(
            JsonNode bindings, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(bindings)) {
            return;
        }
        if (!StageSupport.isArray(bindings)) {
            issues.offer(
                    ValidationIssue.error(
                            "binding.prefill_not_array",
                            "meta.prefillBindings must be a JSON array",
                            "meta.prefillBindings"));
            return;
        }

        Set<String> seenFieldIds = new HashSet<>();
        int index = 0;
        for (JsonNode entry : bindings) {
            String path = "meta.prefillBindings[" + index + "]";
            index++;

            if (!StageSupport.hasExactKeys(entry, PREFILL_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_entry_shape_invalid",
                                "prefillBindings entry must be an object with exactly fieldId, cafAttribute, confidenceMin",
                                path));
                continue;
            }

            JsonNode fieldIdNode = entry.get("fieldId");
            if (!StageSupport.isExactNonBlankText(fieldIdNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_field_id_blank",
                                "prefillBindings entry fieldId must be a nonblank, unpadded string",
                                path + ".fieldId"));
                continue;
            }
            String fieldId = fieldIdNode.textValue();

            if (!seenFieldIds.add(fieldId)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_duplicate_field",
                                "A field may have at most one prefillBindings entry",
                                fieldId));
                continue;
            }

            GovernedField field = graph.find(fieldId).orElse(null);
            if (field == null) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_field_not_found",
                                "prefillBindings entry does not reference an existing governed field",
                                fieldId));
                continue;
            }

            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !CAF_PREFILL_WIDGET.equals(palette.widgetType())) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_wrong_widget",
                                "prefillBindings target field must be a caf-prefill widget",
                                fieldId));
            }

            if (!StageSupport.isExactNonBlankText(entry.get("cafAttribute"))) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_attribute_blank",
                                "prefillBindings cafAttribute must be a nonblank, unpadded string",
                                fieldId));
            }

            JsonNode confidenceMin = entry.get("confidenceMin");
            if (!StageSupport.isFiniteNumber(confidenceMin)
                    || confidenceMin.asDouble() < 0.0
                    || confidenceMin.asDouble() > 1.0) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.prefill_confidence_invalid",
                                "prefillBindings confidenceMin must be a finite number between 0 and 1 inclusive",
                                fieldId));
            }
        }
    }

    private static void validateIntegrationBindings(
            JsonNode bindings, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(bindings)) {
            return;
        }
        if (!StageSupport.isArray(bindings)) {
            issues.offer(
                    ValidationIssue.error(
                            "binding.integration_not_array",
                            "meta.integrationBindings must be a JSON array",
                            "meta.integrationBindings"));
            return;
        }

        Set<List<String>> seenTuples = new HashSet<>();
        int index = 0;
        for (JsonNode entry : bindings) {
            String path = "meta.integrationBindings[" + index + "]";
            index++;

            if (!StageSupport.hasExactKeys(entry, INTEGRATION_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_entry_shape_invalid",
                                "integrationBindings entry must be an object with exactly fieldId, adapterId, param, direction",
                                path));
                continue;
            }

            JsonNode fieldIdNode = entry.get("fieldId");
            if (!StageSupport.isExactNonBlankText(fieldIdNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_field_id_blank",
                                "integrationBindings entry fieldId must be a nonblank, unpadded string",
                                path + ".fieldId"));
                continue;
            }
            String fieldId = fieldIdNode.textValue();

            GovernedField field = graph.find(fieldId).orElse(null);
            if (field == null) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_field_not_found",
                                "integrationBindings entry does not reference an existing governed field",
                                fieldId));
                continue;
            }

            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !palette.producesData()) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_field_not_data_producing",
                                "integrationBindings target field must be a data-producing widget",
                                fieldId));
            }

            JsonNode adapterIdNode = entry.get("adapterId");
            JsonNode paramNode = entry.get("param");
            JsonNode directionNode = entry.get("direction");

            if (!StageSupport.isExactNonBlankText(adapterIdNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_adapter_id_blank",
                                "integrationBindings adapterId must be a nonblank, unpadded string",
                                fieldId));
            }
            if (!StageSupport.isExactNonBlankText(paramNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_param_blank",
                                "integrationBindings param must be a nonblank, unpadded string",
                                fieldId));
            }
            boolean directionValid =
                    directionNode != null
                            && directionNode.isTextual()
                            && ("in".equals(directionNode.textValue()) || "out".equals(directionNode.textValue()));
            if (!directionValid) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_direction_invalid",
                                "integrationBindings direction must be exactly \"in\" or \"out\"",
                                fieldId));
            }

            String adapterId = StageSupport.textOf(adapterIdNode);
            String param = StageSupport.textOf(paramNode);
            String direction = StageSupport.textOf(directionNode);
            List<String> tuple = List.of(
                    fieldId,
                    adapterId == null ? "" : adapterId,
                    param == null ? "" : param,
                    direction == null ? "" : direction);
            if (!seenTuples.add(tuple)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.integration_duplicate_tuple",
                                "integrationBindings contains a duplicate fieldId/adapterId/param/direction tuple",
                                fieldId));
            }
        }
    }

    private static void validateWorkflowBindings(
            JsonNode bindings, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (!StageSupport.isPresent(bindings)) {
            return;
        }
        if (!StageSupport.isArray(bindings)) {
            issues.offer(
                    ValidationIssue.error(
                            "binding.workflow_not_array",
                            "meta.workflowBindings must be a JSON array",
                            "meta.workflowBindings"));
            return;
        }

        Set<List<String>> seenPairs = new HashSet<>();
        int index = 0;
        for (JsonNode entry : bindings) {
            String path = "meta.workflowBindings[" + index + "]";
            index++;

            if (!StageSupport.hasExactKeys(entry, WORKFLOW_KEYS)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_entry_shape_invalid",
                                "workflowBindings entry must be an object with exactly fieldId, stage",
                                path));
                continue;
            }

            JsonNode fieldIdNode = entry.get("fieldId");
            if (!StageSupport.isExactNonBlankText(fieldIdNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_field_id_blank",
                                "workflowBindings entry fieldId must be a nonblank, unpadded string",
                                path + ".fieldId"));
                continue;
            }
            String fieldId = fieldIdNode.textValue();

            GovernedField field = graph.find(fieldId).orElse(null);
            if (field == null) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_field_not_found",
                                "workflowBindings entry does not reference an existing governed field",
                                fieldId));
                continue;
            }

            ControlledPaletteEntry palette = field.palette();
            if (palette == null || !palette.producesData()) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_field_not_data_producing",
                                "workflowBindings target field must be a data-producing widget",
                                fieldId));
            }

            JsonNode stageNode = entry.get("stage");
            if (!StageSupport.isExactNonBlankText(stageNode)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_stage_blank",
                                "workflowBindings stage must be a nonblank, unpadded string",
                                fieldId));
                continue;
            }
            String stage = stageNode.textValue();

            List<String> pair = List.of(fieldId, stage);
            if (!seenPairs.add(pair)) {
                issues.offer(
                        ValidationIssue.error(
                                "binding.workflow_duplicate_field_stage",
                                "workflowBindings contains a duplicate fieldId/stage pair",
                                fieldId));
            }
        }
    }
}
