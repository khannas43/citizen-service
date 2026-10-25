package org.citizen.formdefinition.validation;

import java.util.Objects;

import org.citizen.formdefinition.validation.fieldpath.GovernedFieldGraph;
import org.citizen.formdefinition.validation.fieldpath.GovernedFieldGraphBuilder;
import org.citizen.formdefinition.validation.palette.ControlledPaletteRegistry;
import org.citizen.formdefinition.validation.stage.BilingualCompletenessValidator;
import org.citizen.formdefinition.validation.stage.BindingIntegrityValidator;
import org.citizen.formdefinition.validation.stage.JsonSchemaMetaValidator;
import org.citizen.formdefinition.validation.stage.PaletteProvenanceValidator;
import org.citizen.formdefinition.validation.stage.StructuralSanityValidator;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * FB-C1 five-stage server-side Form Definition validation pipeline (spec §6):
 *
 * <ol>
 *   <li>JSON Schema Draft 2020-12 meta-validation
 *   <li>Controlled-palette provenance
 *   <li>Bilingual (EN/GU) completeness
 *   <li>Binding integrity (prefill / integration / workflow)
 *   <li>Structural sanity
 * </ol>
 *
 * <p>Pure and deterministic: never mutates the input document, never persists or transmits
 * anything, never loads a remote resource, and never throws for a malformed user document (the
 * document is instead reflected back as {@link ValidationIssue}s). Stage order is fixed.
 */
public final class FormDefinitionValidationPipeline {

    private final ControlledPaletteRegistry paletteRegistry;
    private final JsonSchemaMetaValidator jsonSchemaMetaValidator;

    public FormDefinitionValidationPipeline() {
        this(ControlledPaletteRegistry.loadDefault(), new JsonSchemaMetaValidator());
    }

    public FormDefinitionValidationPipeline(
            ControlledPaletteRegistry paletteRegistry, JsonSchemaMetaValidator jsonSchemaMetaValidator) {
        this.paletteRegistry = Objects.requireNonNull(paletteRegistry, "paletteRegistry");
        this.jsonSchemaMetaValidator = Objects.requireNonNull(jsonSchemaMetaValidator, "jsonSchemaMetaValidator");
    }

    public ValidationResult validate(JsonNode document) {
        ValidationIssueCollector issues = new ValidationIssueCollector();

        JsonTreeLimits.Result limits = JsonTreeLimits.measure(document);
        if (limits.nodeLimitExceeded()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.traversal_node_limit_exceeded",
                            "Form Definition exceeded the maximum allowed JSON node count",
                            null));
        }
        if (limits.depthLimitExceeded()) {
            issues.offer(
                    ValidationIssue.error(
                            "structure.traversal_depth_limit_exceeded",
                            "Form Definition exceeded the maximum allowed nesting depth",
                            null));
        }
        if (limits.nodeLimitExceeded() || limits.depthLimitExceeded()) {
            // Stop further deep traversal on an oversized/adversarial document — the limit
            // issues above already make the result invalid.
            return issues.toResult();
        }

        // Stage 1 — JSON Schema Draft 2020-12 meta-validation.
        jsonSchemaMetaValidator.validate(document, issues);

        // Governed field graph feeds stages 2-5.
        GovernedFieldGraph graph = buildGovernedFieldGraph(document, issues);

        // Stage 2 — controlled-palette provenance.
        PaletteProvenanceValidator.validate(document, graph, paletteRegistry, issues);

        // Stage 3 — bilingual completeness.
        BilingualCompletenessValidator.validate(document, graph, issues);

        // Stage 4 — binding integrity.
        BindingIntegrityValidator.validate(document, graph, issues);

        // Stage 5 — structural sanity.
        StructuralSanityValidator.validate(document, graph, issues);

        return issues.toResult();
    }

    private GovernedFieldGraph buildGovernedFieldGraph(JsonNode document, ValidationIssueCollector issues) {
        if (document == null || !document.isObject()) {
            return GovernedFieldGraph.empty();
        }
        JsonNode jsonSchema = document.get("jsonSchema");
        JsonNode uiSchema = document.get("uiSchema");
        return new GovernedFieldGraphBuilder(paletteRegistry, issues).build(jsonSchema, uiSchema);
    }
}
