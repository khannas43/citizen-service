package org.magicsword.formdefinition.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C1 pure unit tests for {@link FormDefinitionValidationPipeline}.
 *
 * <p>Deliberately plain JUnit 5 — no {@code @SpringBootTest}, no Spring {@code ApplicationContext},
 * no database, and no Testcontainers. Every fixture is either loaded from
 * {@code src/test/resources/validation/} or built in-memory with a Jackson {@link ObjectMapper}.
 */
class FormDefinitionValidationPipelineTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final FormDefinitionValidationPipeline PIPELINE = new FormDefinitionValidationPipeline();

    private static JsonNode fixture(String name) throws IOException {
        try (InputStream in = FormDefinitionValidationPipelineTest.class.getResourceAsStream("/validation/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Missing test fixture: " + name);
            }
            return MAPPER.readTree(in);
        }
    }

    private static List<String> codes(ValidationResult result) {
        return result.issues().stream().map(ValidationIssue::code).toList();
    }

    // ---------------------------------------------------------------- happy paths (1-3)

    @Test
    void validSinglePagePassesAllStages() throws IOException {
        ValidationResult result = PIPELINE.validate(fixture("valid-single-page.json"));

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    @Test
    void validProgressivePassesAllStages() throws IOException {
        ValidationResult result = PIPELINE.validate(fixture("valid-progressive.json"));

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    @Test
    void validFamilyRepeaterPassesAllStages() throws IOException {
        ValidationResult result = PIPELINE.validate(fixture("valid-family-repeater.json"));

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    // ---------------------------------------------------------------- stage 1: JSON Schema meta-validation

    @Test
    void stage1RejectsInvalidMetaSchema() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantName = (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        // "type" must be a string or array of strings per the Draft 2020-12 meta-schema.
        applicantName.put("type", 123);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("schema.meta_invalid");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "https://example.com/schema.json",
                "http://localhost:8080/schema.json",
                "file:///etc/passwd",
                "classpath:some/schema.json",
                "custom-scheme://resource"
            })
    void stage1RejectsRemoteAndLocalRefsWithoutMakingAnOutboundCall(String disallowedRef) throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantName = (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        applicantName.put("$ref", disallowedRef);

        // No network access is configured anywhere in this test (no proxy, no mocked HTTP
        // server) — a passing assertion here proves the $ref pre-scan short-circuits before any
        // resolution attempt, since JsonSchemaMetaValidator is also built with
        // fetchRemoteResources(false).
        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("schema.remote_ref_forbidden");
    }

    // ---------------------------------------------------------------- stage 2: controlled-palette provenance

    @Test
    void stage2RejectsUnknownWidgetTypeInProvenance() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode entry = (ObjectNode) doc.get("meta").get("paletteProvenance").get(0);
        entry.put("widgetType", "not-a-real-widget");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.provenance_unknown_widget_type");
    }

    @Test
    void stage2RejectsMissingProvenanceEntry() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode provenance = (ArrayNode) doc.get("meta").get("paletteProvenance");
        provenance.remove(2); // drops the page_break_1 entry

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.missing_provenance_entry");
    }

    @Test
    void stage2RejectsDuplicateProvenanceEntry() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode provenance = (ArrayNode) doc.get("meta").get("paletteProvenance");
        provenance.add(provenance.get(0).deepCopy());

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.duplicate_provenance_entry");
    }

    @Test
    void stage2RejectsOrphanProvenanceEntry() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode provenance = (ArrayNode) doc.get("meta").get("paletteProvenance");
        ObjectNode orphan = MAPPER.createObjectNode();
        orphan.put("fieldId", "ghost_field");
        orphan.put("widgetType", "text-short");
        provenance.add(orphan);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.orphan_provenance_entry");
    }

    @Test
    void stage2RejectsProvenanceWidgetTypeMismatchedWithUiSchema() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode entry = (ObjectNode) doc.get("meta").get("paletteProvenance").get(0);
        entry.put("widgetType", "number"); // uiSchema still selects text-short

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.provenance_widget_mismatch");
    }

    // ---------------------------------------------------------------- stage 3: bilingual completeness

    @Test
    void stage3RejectsIncompleteBilingualCopy() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode entry = (ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name");
        entry.remove("gu");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("bilingual.label_invalid");
    }

    @Test
    void stage3RejectsOrphanBilingualCopy() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode labels = (ObjectNode) doc.get("meta").get("bilingual").get("labels");
        ObjectNode orphanEntry = MAPPER.createObjectNode();
        orphanEntry.put("en", "Ghost");
        orphanEntry.put("gu", "ભૂત");
        labels.set("ghost_field", orphanEntry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("bilingual.orphan_entry");
    }

    // ---------------------------------------------------------------- stage 4: binding integrity

    @Test
    void stage4RejectsPrefillBindingOnNonCafPrefillWidget() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", "applicant_name"); // text-short, not caf-prefill
        entry.put("cafAttribute", "caf.applicant.name");
        entry.put("confidenceMin", 0.9);
        prefill.add(entry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.prefill_wrong_widget");
    }

    @Test
    void stage4RejectsPrefillBindingWithOrphanFieldId() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", "nonexistent_field");
        entry.put("cafAttribute", "caf.x");
        entry.put("confidenceMin", 0.5);
        prefill.add(entry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.prefill_field_not_found");
    }

    @Test
    void stage4RejectsPrefillBindingWithOutOfRangeConfidenceMin() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", "applicant_name");
        entry.put("cafAttribute", "caf.applicant.name");
        entry.put("confidenceMin", 1.5);
        prefill.add(entry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.prefill_confidence_invalid");
    }

    @Test
    void stage4RejectsDuplicatePrefillBindingField() throws IOException {
        JsonNode doc = cafPrefillDocument(true);
        ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
        ObjectNode duplicate = MAPPER.createObjectNode();
        duplicate.put("fieldId", "applicant_ref");
        duplicate.put("cafAttribute", "caf.applicant.other");
        duplicate.put("confidenceMin", 0.7);
        prefill.add(duplicate);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.prefill_duplicate_field");
    }

    @Test
    void stage4RejectsDuplicateIntegrationBindingTuple() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode integrations = (ArrayNode) doc.get("meta").get("integrationBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", "applicant_name");
        entry.put("adapterId", "adapter-x");
        entry.put("param", "p1");
        entry.put("direction", "out");
        integrations.add(entry);
        integrations.add(entry.deepCopy());

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.integration_duplicate_tuple");
    }

    @Test
    void stage4RejectsIntegrationBindingTargetingDisplayWidget() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode integrations = (ArrayNode) doc.get("meta").get("integrationBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", "form_section_intro"); // section-header: does not produce data
        entry.put("adapterId", "adapter-x");
        entry.put("param", "p1");
        entry.put("direction", "out");
        integrations.add(entry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.integration_field_not_data_producing");
    }

    @Test
    void stage4RejectsBindingWithPaddedFieldId() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
        ObjectNode entry = MAPPER.createObjectNode();
        entry.put("fieldId", " applicant_name");
        entry.put("cafAttribute", "caf.applicant.name");
        entry.put("confidenceMin", 0.5);
        prefill.add(entry);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("binding.prefill_field_id_blank");
    }

    // ---------------------------------------------------------------- stage 5: structural sanity

    @Test
    void stage5RejectsRequiredEntryOnWidgetThatDoesNotSupportRequired() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ((ObjectNode) doc.get("jsonSchema")).putArray("required").add("form_section_intro");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.required_not_supported");
    }

    @Test
    void stage5RejectsMalformedUiSchemaFieldNode() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ((ObjectNode) doc.get("uiSchema").get("applicant_name")).put("classNames", "extra-not-allowed");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.uischema_field_unexpected_key");
    }

    @Test
    void stage5RejectsMalformedProgressiveStep() throws IOException {
        JsonNode doc = fixture("valid-progressive.json");
        ArrayNode steps = (ArrayNode) doc.get("meta").get("progressiveSteps");
        ((ObjectNode) steps.get(0)).put("extraKey", "not-allowed");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.progressive_step_shape_invalid");
    }

    @Test
    void stage5RejectsMalformedAudit() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ((ObjectNode) doc.get("audit")).remove("createdBy");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.audit_created_by_invalid");
    }

    @Test
    void stage5RejectsUnknownXDg20Key() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantSchema = (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        ObjectNode xdg20 = applicantSchema.putObject("x-dg20");
        xdg20.put("notAGovernedKey", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_unknown_key");
    }

    @Test
    void stage5RejectsMalformedFamilyRepeater() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members")).remove("maxItems");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_max_items_required");
    }

    // ---------------------------------------------------------------- FB-D16 family-repeater strengthenings

    @Test
    void stage5RejectsFamilyRepeaterRootXDg20() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members"))
                .putObject("x-dg20")
                .put("notAllowed", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_x_dg20_forbidden");
    }

    @Test
    void stage5RejectsFamilyRepeaterMaxItemsOutOfRange() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members")).put("maxItems", 21);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_max_items_out_of_range");
    }

    @Test
    void stage5AcceptsFamilyRepeaterMaxItemsAtCap() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members")).put("maxItems", 20);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    @Test
    void stage5RejectsFamilyRepeaterMinItemsAboveMax() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode family = (ObjectNode) doc.get("jsonSchema").get("properties").get("family_members");
        family.put("maxItems", 3);
        family.put("minItems", 4);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_min_items_out_of_range");
    }

    @Test
    void stage5RejectsFamilyRepeaterEmptyProperties() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode items =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items");
        items.set("properties", MAPPER.createObjectNode());
        items.remove("required");
        ((ObjectNode) doc.get("uiSchema").get("family_members")).set("items", MAPPER.createObjectNode());
        // Drop nested provenance/labels so earlier stages do not obscure the structural error.
        ArrayNode provenance = (ArrayNode) doc.get("meta").get("paletteProvenance");
        provenance.remove(2);
        provenance.remove(1);
        ObjectNode labels = (ObjectNode) doc.get("meta").get("bilingual").get("labels");
        labels.remove("family_members[].member_name");
        labels.remove("family_members[].emergency\\.contact");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_items_properties_empty");
    }

    @Test
    void stage5RejectsFamilyRepeaterAdditionalPropertiesNotFalse() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items"))
                .put("additionalProperties", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_items_additional_properties_not_false");
    }

    @Test
    void stage5RejectsFamilyRepeaterItemsRequiredUnknownAndDuplicate() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode items =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items");
        items.putArray("required").add("member_name").add("member_name").add("not_a_child");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result))
                .contains(
                        "structure.repeater_items_required_duplicate_entry",
                        "structure.repeater_items_required_unknown_property");
    }

    @Test
    void stage5RejectsFamilyRepeaterItemsRequiredNotArray() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items"))
                .put("required", "member_name");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.repeater_items_required_not_array");
    }

    @Test
    void stage5AcceptsFamilyRepeaterDenseKnownRequired() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items"))
                .putArray("required")
                .add("member_name");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    @Test
    void stage5RejectsFamilyRepeaterUiItemsMissingCoverage() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode uiItems = (ObjectNode) doc.get("uiSchema").get("family_members").get("items");
        uiItems.remove("emergency.contact");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.uischema_repeater_item_missing");
    }

    @Test
    void stage5RejectsFamilyRepeaterUiItemsObjectMissing() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("uiSchema").get("family_members")).remove("items");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.uischema_repeater_items_missing");
    }

    @Test
    void stage5RejectsFamilyRepeaterNestedProvenanceWidgetMismatch() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode nested = (ObjectNode) doc.get("meta").get("paletteProvenance").get(1);
        nested.put("widgetType", "email");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("palette.provenance_widget_mismatch");
    }

    @Test
    void stage5AllowsNonFamilyMemberChildOnServer() throws IOException {
        // Server must NOT impose Builder-only FAMILY_MEMBER whitelist — full-name is palette-legal.
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode items =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("family_members").get("items");
        ObjectNode properties = (ObjectNode) items.get("properties");
        properties.set(
                "full_name_1",
                MAPPER.readTree(
                        """
                        {
                          "type": "object",
                          "properties": {
                            "en": { "type": "string", "minLength": 1 },
                            "gu": { "type": "string", "minLength": 1 }
                          },
                          "required": ["en", "gu"],
                          "additionalProperties": false
                        }
                        """));
        ((ObjectNode) doc.get("uiSchema").get("family_members").get("items"))
                .set("full_name_1", MAPPER.readTree("{ \"ui:field\": \"full-name\" }"));
        ((ArrayNode) doc.get("meta").get("paletteProvenance"))
                .addObject()
                .put("fieldId", "family_members[].full_name_1")
                .put("widgetType", "full-name");
        ((ObjectNode) doc.get("meta").get("bilingual").get("labels"))
                .set(
                        "family_members[].full_name_1",
                        MAPPER.readTree("{ \"en\": \"Full name\", \"gu\": \"પૂરું નામ\" }"));

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isTrue();
        assertThat(result.issues()).isEmpty();
    }

    // ---------------------------------------------------------------- supportsRequired=false enforcement

    @Test
    void supportsRequiredFalseEnforcedForCafPrefillWidget() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ((ObjectNode) doc.get("jsonSchema")).putArray("required").add("applicant_ref");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.required_not_supported");
    }

    // ---------------------------------------------------------------- nested escaped field paths

    @Test
    void nestedFieldPathWithDotIsEscapedConsistentlyAcrossStages() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ObjectNode labels = (ObjectNode) doc.get("meta").get("bilingual").get("labels");
        // The fixture keys this exact escaped path — remove it to prove the pipeline requires
        // and reports on precisely the FieldPathEscaper-computed path (backslash before the dot).
        boolean removed = labels.remove("family_members[].emergency\\.contact") != null;
        assertThat(removed).isTrue();

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(result.issues())
                .anySatisfy(
                        issue -> {
                            assertThat(issue.code()).isEqualTo("bilingual.label_missing");
                            assertThat(issue.path()).isEqualTo("family_members[].emergency\\.contact");
                        });
    }

    // ---------------------------------------------------------------- determinism, immutability, purity

    @Test
    void issueOrderingCodesAndPathsAreDeterministicAcrossRuns() {
        JsonNode doc = MAPPER.createObjectNode(); // maximally malformed: triggers many stages at once

        ValidationResult first = PIPELINE.validate(doc);
        ValidationResult second = PIPELINE.validate(doc);

        assertThat(first.valid()).isEqualTo(second.valid());
        assertThat(first.issues()).hasSameSizeAs(second.issues());
        List<String> firstTuples = tuples(first);
        List<String> secondTuples = tuples(second);
        assertThat(firstTuples).containsExactlyElementsOf(secondTuples);
    }

    private static List<String> tuples(ValidationResult result) {
        return result.issues().stream()
                .map(issue -> issue.severity() + "|" + issue.code() + "|" + issue.path() + "|" + issue.message())
                .toList();
    }

    @Test
    void returnedIssuesListIsImmutable() throws IOException {
        ValidationResult result = PIPELINE.validate(fixture("valid-single-page.json"));

        assertThatThrownBy(() -> result.issues().add(ValidationIssue.error("x.code", "message", null)))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void inputDocumentIsNeverMutatedByAValidPass() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        JsonNode before = doc.deepCopy();

        PIPELINE.validate(doc);

        assertThat(doc).isEqualTo(before);
        assertThat(doc.toString()).isEqualTo(before.toString());
    }

    @Test
    void inputDocumentIsNeverMutatedByAFailingPass() throws IOException {
        JsonNode doc = fixture("valid-family-repeater.json");
        ((ObjectNode) doc.get("jsonSchema").get("properties").get("family_members")).remove("maxItems");
        JsonNode before = doc.deepCopy();

        PIPELINE.validate(doc);

        assertThat(doc).isEqualTo(before);
        assertThat(doc.toString()).isEqualTo(before.toString());
    }

    // ---------------------------------------------------------------- depth / node / issue limits

    @Test
    void oversizedNodeCountIsReportedWithoutThrowing() {
        ObjectNode doc = MAPPER.createObjectNode();
        ArrayNode bloat = doc.putArray("bloat");
        for (int i = 0; i < 10_500; i++) {
            bloat.addNull();
        }

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.traversal_node_limit_exceeded");
    }

    @Test
    void oversizedNestingDepthIsReportedWithoutThrowing() {
        ObjectNode doc = MAPPER.createObjectNode();
        doc.set("bloat", nestedChain(100));

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.traversal_depth_limit_exceeded");
    }

    private static ObjectNode nestedChain(int depth) {
        ObjectNode node = MAPPER.createObjectNode();
        if (depth <= 0) {
            node.put("leaf", true);
            return node;
        }
        node.set("child", nestedChain(depth - 1));
        return node;
    }

    // ---------------------------------------------------------------- FB-D8 otpChannels (sms only)

    private static JsonNode mobileOtpDocument(ArrayNode otpChannels) throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-mobile-otp-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "citizen_mobile": {
                        "type": "object",
                        "properties": {
                          "mobileNumber": { "type": "string", "pattern": "^[0-9]{10}$" },
                          "verified": { "type": "boolean" },
                          "verificationRef": { "type": "string", "minLength": 1 }
                        },
                        "required": ["mobileNumber", "verified"],
                        "additionalProperties": false,
                        "x-dg20": {}
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "citizen_mobile": { "ui:field": "mobile-otp" },
                    "ui:order": ["citizen_mobile"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "citizen_mobile", "widgetType": "mobile-otp" }
                    ],
                    "bilingual": {
                      "labels": { "citizen_mobile": { "en": "Mobile", "gu": "મોબાઇલ" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode xdg20 =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("citizen_mobile").get("x-dg20");
        if (otpChannels == null) {
            ((ObjectNode) doc.get("jsonSchema").get("properties").get("citizen_mobile")).remove("x-dg20");
        } else {
            xdg20.set("otpChannels", otpChannels);
        }
        return doc;
    }

    @Test
    void stage5AcceptsMobileOtpWithExactLowercaseSmsChannels() throws IOException {
        ArrayNode channels = MAPPER.createArrayNode();
        channels.add("sms");
        ValidationResult result = PIPELINE.validate(mobileOtpDocument(channels));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsMobileOtpWithAbsentOtpChannels() throws IOException {
        ValidationResult result = PIPELINE.validate(mobileOtpDocument(null));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsUppercaseSmsOtpChannel() throws IOException {
        ArrayNode channels = MAPPER.createArrayNode();
        channels.add("SMS");
        ValidationResult result = PIPELINE.validate(mobileOtpDocument(channels));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_otp_channel_unsupported");
        assertThat(result.issues())
                .anySatisfy(issue -> assertThat(issue.message()).contains("\"sms\""));
        assertThat(result.issues())
                .noneSatisfy(issue -> assertThat(issue.message()).contains("\"SMS\""));
    }

    @Test
    void stage5RejectsDuplicateAndEmptyOtpChannels() throws IOException {
        ArrayNode duplicates = MAPPER.createArrayNode();
        duplicates.add("sms");
        duplicates.add("sms");
        ValidationResult dupResult = PIPELINE.validate(mobileOtpDocument(duplicates));
        assertThat(dupResult.valid()).isFalse();
        assertThat(codes(dupResult)).contains("structure.x_dg20_otp_channel_unsupported");

        ValidationResult emptyResult = PIPELINE.validate(mobileOtpDocument(MAPPER.createArrayNode()));
        assertThat(emptyResult.valid()).isFalse();
        assertThat(codes(emptyResult)).contains("structure.x_dg20_otp_channels_empty");
    }

    @Test
    void stage5RejectsOtpChannelsOnNonMobileOtpWidget() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantSchema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        ObjectNode xdg20 = applicantSchema.putObject("x-dg20");
        ArrayNode channels = xdg20.putArray("otpChannels");
        channels.add("sms");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_wrong_widget");
    }

    // ---------------------------------------------------------------- FB-D9 masterListId required

    private static JsonNode masterListDocument(String widgetType, String masterListId, boolean includeXdg20)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-master-list-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "choice_field": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "choice_field": { "ui:widget": "PLACEHOLDER" },
                    "ui:order": ["choice_field"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "choice_field", "widgetType": "PLACEHOLDER" }
                    ],
                    "bilingual": {
                      "labels": { "choice_field": { "en": "Choice", "gu": "પસંદગી" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """
                        .replace("PLACEHOLDER", widgetType);
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("choice_field");
        if (includeXdg20) {
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (masterListId != null) {
                xdg20.put("masterListId", masterListId);
            }
        }
        return doc;
    }

    @Test
    void stage5AcceptsDropdownMasterWithExactMasterListId() throws IOException {
        ValidationResult result = PIPELINE.validate(masterListDocument("dropdown-master", "status-list", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsRadioWithExactMasterListId() throws IOException {
        ValidationResult result = PIPELINE.validate(masterListDocument("radio", "choice-list", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsMasterListWidgetMissingXDg20() throws IOException {
        ValidationResult result = PIPELINE.validate(masterListDocument("dropdown-master", null, false));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_master_list_id_required");
    }

    @Test
    void stage5RejectsMasterListWidgetMissingMasterListIdKey() throws IOException {
        ValidationResult result = PIPELINE.validate(masterListDocument("radio", null, true));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_master_list_id_required");
    }

    @Test
    void stage5RejectsBlankAndPaddedMasterListId() throws IOException {
        assertThat(codes(PIPELINE.validate(masterListDocument("dropdown-master", "", true))))
                .contains("structure.x_dg20_master_list_id_blank");
        assertThat(codes(PIPELINE.validate(masterListDocument("dropdown-master", " padded ", true))))
                .contains("structure.x_dg20_master_list_id_blank");
    }

    @Test
    void stage5RejectsMasterListIdOnWrongWidget() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantSchema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        ObjectNode xdg20 = applicantSchema.putObject("x-dg20");
        xdg20.put("masterListId", "should-not-be-here");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_wrong_widget");
    }

    @Test
    void stage5RejectsMultiselectMissingMasterListIdEvenThoughBuilderPending() throws IOException {
        ValidationResult result = PIPELINE.validate(masterListDocument("multiselect", null, false));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_master_list_id_required");
    }

    // ---------------------------------------------------------------- FB-D10 multiselect bounds + cascading master lists

    private static JsonNode multiselectDocument(
            String masterListId,
            boolean includeXdg20,
            Integer minItems,
            Integer maxItems,
            boolean rootRequired)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-multiselect-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "choice_field": {
                        "type": "array",
                        "items": { "type": "string" },
                        "uniqueItems": true
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "choice_field": { "ui:widget": "multiselect" },
                    "ui:order": ["choice_field"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "choice_field", "widgetType": "multiselect" }
                    ],
                    "bilingual": {
                      "labels": { "choice_field": { "en": "Choices", "gu": "પસંદગીઓ" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode jsonSchema = (ObjectNode) doc.get("jsonSchema");
        ObjectNode schema = (ObjectNode) jsonSchema.get("properties").get("choice_field");
        if (includeXdg20) {
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (masterListId != null) {
                xdg20.put("masterListId", masterListId);
            }
        }
        if (minItems != null) {
            schema.put("minItems", minItems);
        }
        if (maxItems != null) {
            schema.put("maxItems", maxItems);
        }
        if (rootRequired) {
            jsonSchema.putArray("required").add("choice_field");
        }
        return doc;
    }

    private static JsonNode cascadingDocument(
            String parentMasterListId, String childMasterListId, boolean includeXdg20)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-cascading-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "cascade_field": {
                        "type": "object",
                        "properties": {
                          "parentCode": { "type": "string", "minLength": 1 },
                          "childCode": { "type": "string", "minLength": 1 }
                        },
                        "required": ["parentCode"],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "cascade_field": { "ui:field": "cascading-dropdown" },
                    "ui:order": ["cascade_field"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "cascade_field", "widgetType": "cascading-dropdown" }
                    ],
                    "bilingual": {
                      "labels": { "cascade_field": { "en": "Cascade", "gu": "કાસ્કેડ" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("cascade_field");
        if (includeXdg20) {
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (parentMasterListId != null) {
                xdg20.put("parentMasterListId", parentMasterListId);
            }
            if (childMasterListId != null) {
                xdg20.put("childMasterListId", childMasterListId);
            }
        }
        return doc;
    }

    @Test
    void stage5AcceptsMultiselectWithMasterListIdAndOptionalBounds() throws IOException {
        ValidationResult result =
                PIPELINE.validate(multiselectDocument("status-list", true, 1, 5, false));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsCascadingDropdownWithBothMasterListIds() throws IOException {
        ValidationResult result =
                PIPELINE.validate(cascadingDocument("state-list", "district-list", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsCascadingDropdownWithEqualParentAndChildIds() throws IOException {
        ValidationResult result = PIPELINE.validate(cascadingDocument("same-list", "same-list", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsCascadingDropdownMissingXDg20() throws IOException {
        ValidationResult result = PIPELINE.validate(cascadingDocument(null, null, false));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_cascading_master_lists_required");
    }

    @Test
    void stage5RejectsCascadingDropdownMissingOneMasterListId() throws IOException {
        ValidationResult missingChild = PIPELINE.validate(cascadingDocument("parent-only", null, true));
        assertThat(missingChild.valid()).isFalse();
        assertThat(codes(missingChild)).contains("structure.x_dg20_cascading_master_lists_required");

        ValidationResult missingParent = PIPELINE.validate(cascadingDocument(null, "child-only", true));
        assertThat(missingParent.valid()).isFalse();
        assertThat(codes(missingParent)).contains("structure.x_dg20_cascading_master_lists_required");
    }

    @Test
    void stage5RejectsCascadingBlankAndPaddedMasterListIds() throws IOException {
        assertThat(codes(PIPELINE.validate(cascadingDocument("", "child-list", true))))
                .contains("structure.x_dg20_cascading_master_lists_invalid");
        assertThat(codes(PIPELINE.validate(cascadingDocument(" padded ", "child-list", true))))
                .contains("structure.x_dg20_cascading_master_lists_invalid");
        assertThat(codes(PIPELINE.validate(cascadingDocument("parent-list", " padded ", true))))
                .contains("structure.x_dg20_cascading_master_lists_invalid");
    }

    @Test
    void stage5RejectsCascadingKeysOnWrongWidget() throws IOException {
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode applicantSchema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_name");
        ObjectNode xdg20 = applicantSchema.putObject("x-dg20");
        xdg20.put("parentMasterListId", "should-not-be-here");
        xdg20.put("childMasterListId", "also-wrong");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_wrong_widget");
    }

    @Test
    void stage5RejectsMultiselectMinGreaterThanMax() throws IOException {
        ValidationResult result = PIPELINE.validate(multiselectDocument("status-list", true, 5, 2, false));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.multiselect_items_range_invalid");
    }

    @Test
    void stage5RejectsRequiredMultiselectWithMinItemsZero() throws IOException {
        ValidationResult result = PIPELINE.validate(multiselectDocument("status-list", true, 0, 5, true));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.multiselect_required_min_items_invalid");
    }

    @Test
    void stage5RejectsRequiredMultiselectMissingMinItems() throws IOException {
        ValidationResult result = PIPELINE.validate(multiselectDocument("status-list", true, null, 5, true));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.multiselect_required_min_items_invalid");
        assertThat(codes(result)).doesNotContain("structure.multiselect_items_range_invalid");
    }

    @Test
    void stage5RejectsRequiredMultiselectWithMaxItemsBelowMinItems() throws IOException {
        ValidationResult result = PIPELINE.validate(multiselectDocument("status-list", true, 2, 1, true));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.multiselect_items_range_invalid");
    }

    @Test
    void stage5AcceptsRequiredMultiselectWithExplicitMinItems() throws IOException {
        ValidationResult result = PIPELINE.validate(multiselectDocument("status-list", true, 1, 5, true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsMultiselectMissingItems() throws IOException {
        JsonNode doc = multiselectDocument("status-list", true, null, null, false);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("choice_field");
        schema.remove("items");
        ValidationResult result = PIPELINE.validate(doc);
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.multiselect_items_missing");
    }

    @Test
    void stage5RejectsMultiselectWrongItemsTypeAndItemsEnum() throws IOException {
        JsonNode wrongType = multiselectDocument("status-list", true, null, null, false);
        ObjectNode schema = (ObjectNode) wrongType.get("jsonSchema").get("properties").get("choice_field");
        ObjectNode items = schema.putObject("items");
        items.put("type", "number");
        assertThat(codes(PIPELINE.validate(wrongType))).contains("structure.multiselect_items_type_not_string");

        JsonNode withEnum = multiselectDocument("status-list", true, null, null, false);
        ObjectNode enumSchema =
                (ObjectNode) withEnum.get("jsonSchema").get("properties").get("choice_field");
        ObjectNode enumItems = enumSchema.putObject("items");
        enumItems.put("type", "string");
        enumItems.putArray("enum").add("A");
        assertThat(codes(PIPELINE.validate(withEnum))).contains("structure.multiselect_items_enum_forbidden");
    }

    @Test
    void stage5RejectsMultiselectMissingOrFalseUniqueItems() throws IOException {
        JsonNode missing = multiselectDocument("status-list", true, null, null, false);
        ((ObjectNode) missing.get("jsonSchema").get("properties").get("choice_field")).remove("uniqueItems");
        assertThat(codes(PIPELINE.validate(missing))).contains("structure.multiselect_unique_items_not_true");

        JsonNode falsy = multiselectDocument("status-list", true, null, null, false);
        ((ObjectNode) falsy.get("jsonSchema").get("properties").get("choice_field")).put("uniqueItems", false);
        assertThat(codes(PIPELINE.validate(falsy))).contains("structure.multiselect_unique_items_not_true");
    }

    // ---------------------------------------------------------------- FB-D11 address-block + photo-capture

    private static JsonNode addressBlockDocument(String defaultStateCode, boolean includeXdg20)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-address-block-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "address_ref": {
                        "type": "object",
                        "properties": {
                          "stateCode": { "type": "string", "minLength": 1 },
                          "districtCode": { "type": "string", "minLength": 1 },
                          "talukaCode": { "type": "string", "minLength": 1 },
                          "villageCode": { "type": "string", "minLength": 1 }
                        },
                        "required": ["stateCode"],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "address_ref": { "ui:field": "address-block" },
                    "ui:order": ["address_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "address_ref", "widgetType": "address-block" }
                    ],
                    "bilingual": {
                      "labels": { "address_ref": { "en": "Address", "gu": "સરનામું" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        if (includeXdg20) {
            ObjectNode schema =
                    (ObjectNode) doc.get("jsonSchema").get("properties").get("address_ref");
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (defaultStateCode != null) {
                xdg20.put("defaultStateCode", defaultStateCode);
            }
        }
        return doc;
    }

    private static JsonNode photoCaptureDocument() throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-photo-capture-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "photo_ref": {
                        "type": "object",
                        "properties": {
                          "objectRef": { "type": "string", "minLength": 1 },
                          "mimeType": {
                            "type": "string",
                            "enum": ["image/jpeg", "image/png"]
                          },
                          "sizeBytes": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5242880
                          },
                          "width": {
                            "type": "integer",
                            "minimum": 300,
                            "maximum": 4096
                          },
                          "height": {
                            "type": "integer",
                            "minimum": 300,
                            "maximum": 4096
                          },
                          "scanStatus": { "type": "string", "enum": ["CLEAN"] }
                        },
                        "required": [
                          "objectRef",
                          "mimeType",
                          "sizeBytes",
                          "width",
                          "height",
                          "scanStatus"
                        ],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "photo_ref": { "ui:field": "photo-capture" },
                    "ui:order": ["photo_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "photo_ref", "widgetType": "photo-capture" }
                    ],
                    "bilingual": {
                      "labels": { "photo_ref": { "en": "Photo", "gu": "ફોટો" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        return MAPPER.readTree(json);
    }

    @Test
    void stage5AcceptsAddressBlockWithoutXDg20() throws IOException {
        ValidationResult result = PIPELINE.validate(addressBlockDocument(null, false));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsAddressBlockWithDefaultStateCode() throws IOException {
        ValidationResult result = PIPELINE.validate(addressBlockDocument("GJ", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsAddressBlockPaddedDefaultStateCode() throws IOException {
        ValidationResult result = PIPELINE.validate(addressBlockDocument(" GJ ", true));
        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.x_dg20_default_state_code_blank");
    }

    @Test
    void stage5RejectsAddressBlockWrongPropertyAndMissingRequiredStateCode() throws IOException {
        JsonNode wrongProperty = addressBlockDocument(null, false);
        ObjectNode schema =
                (ObjectNode) wrongProperty.get("jsonSchema").get("properties").get("address_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("villageCode");
        properties.putObject("extraCode").put("type", "string").put("minLength", 1);
        assertThat(codes(PIPELINE.validate(wrongProperty)))
                .contains("structure.address_block_properties_invalid");

        JsonNode missingRequired = addressBlockDocument(null, false);
        ObjectNode missingSchema =
                (ObjectNode) missingRequired.get("jsonSchema").get("properties").get("address_ref");
        missingSchema.putArray("required");
        assertThat(codes(PIPELINE.validate(missingRequired)))
                .contains("structure.address_block_required_invalid");
    }

    @Test
    void stage5AcceptsPhotoCaptureMatchingPolicy() throws IOException {
        ValidationResult result = PIPELINE.validate(photoCaptureDocument());
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsPhotoCaptureWrongMimeMaxBytesMissingPropertyXDg20() throws IOException {
        JsonNode wrongMime = photoCaptureDocument();
        ObjectNode mimeSchema =
                (ObjectNode) wrongMime.get("jsonSchema").get("properties").get("photo_ref");
        ((ObjectNode) mimeSchema.get("properties").get("mimeType"))
                .putArray("enum")
                .add("image/jpeg")
                .add("image/gif");
        assertThat(codes(PIPELINE.validate(wrongMime)))
                .contains("structure.photo_capture_mime_type_invalid");

        JsonNode wrongMax = photoCaptureDocument();
        ObjectNode sizeSchema =
                (ObjectNode) wrongMax.get("jsonSchema").get("properties").get("photo_ref");
        ((ObjectNode) sizeSchema.get("properties").get("sizeBytes"))
                .put("maximum", ValidationLimits.PHOTO_CAPTURE_MAX_BYTES + 1);
        assertThat(codes(PIPELINE.validate(wrongMax)))
                .contains("structure.photo_capture_size_bytes_invalid");

        JsonNode missingProperty = photoCaptureDocument();
        ObjectNode missingSchema =
                (ObjectNode) missingProperty.get("jsonSchema").get("properties").get("photo_ref");
        ((ObjectNode) missingSchema.get("properties")).remove("height");
        ArrayNode required = missingSchema.putArray("required");
        required.add("objectRef");
        required.add("mimeType");
        required.add("sizeBytes");
        required.add("width");
        required.add("scanStatus");
        assertThat(codes(PIPELINE.validate(missingProperty)))
                .contains("structure.photo_capture_properties_invalid");

        JsonNode withXdg20 = photoCaptureDocument();
        ObjectNode xdg20Schema =
                (ObjectNode) withXdg20.get("jsonSchema").get("properties").get("photo_ref");
        xdg20Schema.putObject("x-dg20").put("defaultStateCode", "GJ");
        assertThat(codes(PIPELINE.validate(withXdg20)))
                .contains("structure.photo_capture_x_dg20_forbidden");

        // uniqueItems is irrelevant for photo-capture object schemas — must remain valid.
        JsonNode withUniqueItems = photoCaptureDocument();
        ((ObjectNode) withUniqueItems.get("jsonSchema").get("properties").get("photo_ref"))
                .put("uniqueItems", true);
        assertThat(PIPELINE.validate(withUniqueItems).valid()).isTrue();
    }

    // ---------------------------------------------------------------- FB-D12 doc-upload + digilocker-fetch

    private static JsonNode docUploadDocument(List<String> allowedMimeTypes, Long maxFileSizeBytes, boolean includeXdg20)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-doc-upload-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "doc_ref": {
                        "type": "object",
                        "properties": {
                          "objectRef": { "type": "string", "minLength": 1 },
                          "fileName": { "type": "string", "minLength": 1 },
                          "mimeType": {
                            "type": "string",
                            "enum": ["application/pdf", "image/jpeg"]
                          },
                          "sizeBytes": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10485760
                          },
                          "scanStatus": { "type": "string", "enum": ["CLEAN"] }
                        },
                        "required": [
                          "objectRef",
                          "fileName",
                          "mimeType",
                          "sizeBytes",
                          "scanStatus"
                        ],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "doc_ref": { "ui:field": "doc-upload" },
                    "ui:order": ["doc_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "doc_ref", "widgetType": "doc-upload" }
                    ],
                    "bilingual": {
                      "labels": { "doc_ref": { "en": "Document", "gu": "દસ્તાવેજ" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("doc_ref");
        if (includeXdg20) {
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (allowedMimeTypes != null) {
                ArrayNode mimeArray = xdg20.putArray("allowedMimeTypes");
                allowedMimeTypes.forEach(mimeArray::add);
            }
            if (maxFileSizeBytes != null) {
                xdg20.put("maxFileSizeBytes", maxFileSizeBytes);
            }
        }
        return doc;
    }

    private static JsonNode digiLockerDocument(String documentTypeCode, boolean includeXdg20) throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-digilocker-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "digilocker_ref": {
                        "type": "object",
                        "properties": {
                          "issuerSignedRef": { "type": "string", "minLength": 1 },
                          "documentTypeCode": { "type": "string", "const": "CAF_INCOME_CERTIFICATE" }
                        },
                        "required": ["issuerSignedRef", "documentTypeCode"],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "digilocker_ref": { "ui:field": "digilocker-fetch" },
                    "ui:order": ["digilocker_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "digilocker_ref", "widgetType": "digilocker-fetch" }
                    ],
                    "bilingual": {
                      "labels": { "digilocker_ref": { "en": "DigiLocker document", "gu": "ડિજિલોકर દસ્તાવેજ" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("digilocker_ref");
        if (includeXdg20) {
            ObjectNode xdg20 = schema.putObject("x-dg20");
            if (documentTypeCode != null) {
                xdg20.put("digiLockerDocumentTypeCode", documentTypeCode);
            }
        }
        return doc;
    }

    @Test
    void stage5AcceptsDocUploadMatchingPolicy() throws IOException {
        ValidationResult result =
                PIPELINE.validate(docUploadDocument(List.of("application/pdf", "image/jpeg"), 10_485_760L, true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsDocUploadMimeEnumMismatchWithXDg20() throws IOException {
        JsonNode doc = docUploadDocument(List.of("application/pdf", "image/jpeg"), 10_485_760L, true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("doc_ref");
        ((ObjectNode) schema.get("properties").get("mimeType"))
                .putArray("enum")
                .add("image/jpeg")
                .add("application/pdf"); // same set, wrong order vs x-dg20.allowedMimeTypes

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_mime_type_invalid");
    }

    @Test
    void stage5RejectsDocUploadSizeMaxMismatchWithXDg20() throws IOException {
        JsonNode doc = docUploadDocument(List.of("application/pdf", "image/jpeg"), 10_485_760L, true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("doc_ref");
        ((ObjectNode) schema.get("properties").get("sizeBytes")).put("maximum", 10_485_761L);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_size_bytes_invalid");
    }

    @Test
    void stage5RejectsDocUploadMissingXDg20() throws IOException {
        ValidationResult result =
                PIPELINE.validate(docUploadDocument(List.of("application/pdf", "image/jpeg"), 10_485_760L, false));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_x_dg20_required");
    }

    @Test
    void stage5RejectsDocUploadEmptyAllowedMimeTypes() throws IOException {
        ValidationResult result = PIPELINE.validate(docUploadDocument(List.of(), 10_485_760L, true));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_allowed_mime_types_invalid");
    }

    @Test
    void stage5RejectsDocUploadPaddedAllowedMimeType() throws IOException {
        ValidationResult result =
                PIPELINE.validate(docUploadDocument(List.of("application/pdf", " image/jpeg "), 10_485_760L, true));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_allowed_mime_types_invalid");
    }

    @Test
    void stage5RejectsDocUploadDuplicateAllowedMimeType() throws IOException {
        ValidationResult result =
                PIPELINE.validate(
                        docUploadDocument(List.of("application/pdf", "application/pdf"), 10_485_760L, true));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_allowed_mime_types_invalid");
    }

    @Test
    void stage5RejectsDocUploadMaxFileSizeOverCap() throws IOException {
        ValidationResult result =
                PIPELINE.validate(
                        docUploadDocument(
                                List.of("application/pdf", "image/jpeg"),
                                ValidationLimits.DOC_UPLOAD_MAX_BYTES_CAP + 1,
                                true));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.doc_upload_max_file_size_invalid");
    }

    @Test
    void stage5AcceptsDigiLockerFetchMatchingPolicy() throws IOException {
        ValidationResult result = PIPELINE.validate(digiLockerDocument("CAF_INCOME_CERTIFICATE", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsDigiLockerConstNotEqualToXDg20() throws IOException {
        JsonNode doc = digiLockerDocument("CAF_INCOME_CERTIFICATE", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("digilocker_ref");
        ((ObjectNode) schema.get("properties").get("documentTypeCode")).put("const", "SOME_OTHER_CODE");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.digilocker_document_type_code_const_invalid");
    }

    @Test
    void stage5RejectsDigiLockerMissingAndPaddedDocumentTypeCode() throws IOException {
        // "Missing" here means the key is present but blank — an entirely absent key instead
        // trips the exact-key x-dg20 shape check (structure.digilocker_x_dg20_invalid).
        ValidationResult blank = PIPELINE.validate(digiLockerDocument("", true));
        assertThat(blank.valid()).isFalse();
        assertThat(codes(blank)).contains("structure.digilocker_document_type_code_blank");

        ValidationResult padded = PIPELINE.validate(digiLockerDocument(" CAF_INCOME_CERTIFICATE ", true));
        assertThat(padded.valid()).isFalse();
        assertThat(codes(padded)).contains("structure.digilocker_document_type_code_blank");
    }

    @Test
    void stage5RejectsDigiLockerWrongPropertyMembership() throws IOException {
        JsonNode doc = digiLockerDocument("CAF_INCOME_CERTIFICATE", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("digilocker_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("issuerSignedRef");
        properties.putObject("extraRef").put("type", "string").put("minLength", 1);
        ArrayNode required = (ArrayNode) schema.get("required");
        required.removeAll();
        required.add("extraRef");
        required.add("documentTypeCode");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.digilocker_properties_invalid");
    }

    // ---------------------------------------------------------------- FB-D13 fee-field + signature-esign

    private static JsonNode feeFieldDocument(String feeRuleId, boolean includeXdg20) throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-fee-field-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "fee_ref": {
                        "type": "object",
                        "properties": {
                          "feeRuleId": { "type": "string", "const": "FEE_RULE_APPLICATION" },
                          "contextRevision": { "type": "string", "minLength": 1 },
                          "currency": { "type": "string", "const": "INR" },
                          "amountMinor": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 9007199254740991
                          },
                          "quoteRef": { "type": "string", "minLength": 1 }
                        },
                        "required": [
                          "feeRuleId",
                          "contextRevision",
                          "currency",
                          "amountMinor",
                          "quoteRef"
                        ],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "fee_ref": { "ui:field": "fee-field" },
                    "ui:order": ["fee_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "fee_ref", "widgetType": "fee-field" }
                    ],
                    "bilingual": {
                      "labels": { "fee_ref": { "en": "Application fee", "gu": "અરજી ફી" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("properties").get("feeRuleId")).put("const", feeRuleId);
        if (includeXdg20) {
            schema.putObject("x-dg20").put("feeRuleId", feeRuleId);
        }
        return doc;
    }

    private static JsonNode signatureEsignDocument(boolean includeXdg20) throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-signature-esign-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "signature_ref": {
                        "type": "object",
                        "properties": {
                          "contextRevision": { "type": "string", "minLength": 1 },
                          "signedArtefactRef": { "type": "string", "minLength": 1 }
                        },
                        "required": ["contextRevision", "signedArtefactRef"],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "signature_ref": { "ui:field": "signature-esign" },
                    "ui:order": ["signature_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "signature_ref", "widgetType": "signature-esign" }
                    ],
                    "bilingual": {
                      "labels": { "signature_ref": { "en": "Signature", "gu": "સહી" } },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        if (includeXdg20) {
            ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("signature_ref");
            schema.putObject("x-dg20").put("someKey", "someValue");
        }
        return doc;
    }

    @Test
    void stage5AcceptsFeeFieldMatchingPolicy() throws IOException {
        ValidationResult result = PIPELINE.validate(feeFieldDocument("FEE_RULE_APPLICATION", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsFeeFieldMissingXDg20() throws IOException {
        ValidationResult result = PIPELINE.validate(feeFieldDocument("FEE_RULE_APPLICATION", false));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_x_dg20_required");
    }

    @Test
    void stage5RejectsFeeFieldXDg20ExtraKey() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("x-dg20")).put("contextRevision", "rev-1");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_x_dg20_invalid");
    }

    @Test
    void stage5RejectsFeeFieldXDg20BlankAndPaddedFeeRuleId() throws IOException {
        // "Missing" here means the key is present but blank — an entirely absent key instead
        // trips the exact-key x-dg20 shape check (structure.fee_field_x_dg20_invalid).
        ValidationResult blank = PIPELINE.validate(feeFieldDocument("", true));
        assertThat(blank.valid()).isFalse();
        assertThat(codes(blank)).contains("structure.fee_field_fee_rule_id_blank");

        ValidationResult padded = PIPELINE.validate(feeFieldDocument(" FEE_RULE_APPLICATION ", true));
        assertThat(padded.valid()).isFalse();
        assertThat(codes(padded)).contains("structure.fee_field_fee_rule_id_blank");
    }

    @Test
    void stage5RejectsFeeFieldConstNotEqualToXDg20() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("properties").get("feeRuleId")).put("const", "FEE_RULE_OTHER");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_fee_rule_id_const_invalid");
    }

    @Test
    void stage5RejectsFeeFieldCurrencyNotInr() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("properties").get("currency")).put("const", "USD");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_currency_invalid");
    }

    @Test
    void stage5RejectsFeeFieldWrongPropertyMembership() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("quoteRef");
        properties.putObject("extraRef").put("type", "string").put("minLength", 1);
        ArrayNode required = (ArrayNode) schema.get("required");
        required.removeAll();
        required.add("feeRuleId");
        required.add("contextRevision");
        required.add("currency");
        required.add("amountMinor");
        required.add("extraRef");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_properties_invalid");
    }

    @Test
    void stage5RejectsFeeFieldAdditionalPropertiesNotFalse() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        schema.put("additionalProperties", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_additional_properties_not_false");
    }

    @Test
    void stage5AcceptsFeeFieldAmountMinorAtZeroAndMaxBoundaries() throws IOException {
        // Base fixture already declares minimum 0 / maximum FEE_AMOUNT_MINOR_MAX exactly — the
        // FB-D13 amountMinor boundary case where both 0 and MAX are OK.
        ValidationResult result = PIPELINE.validate(feeFieldDocument("FEE_RULE_APPLICATION", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsFeeFieldAmountMinorMaximumAboveCap() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("properties").get("amountMinor"))
                .put("maximum", ValidationLimits.FEE_AMOUNT_MINOR_MAX + 1);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_amount_minor_invalid");
    }

    @Test
    void stage5RejectsFeeFieldAmountMinorMinimumNegative() throws IOException {
        JsonNode doc = feeFieldDocument("FEE_RULE_APPLICATION", true);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("fee_ref");
        ((ObjectNode) schema.get("properties").get("amountMinor")).put("minimum", -1);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.fee_field_amount_minor_invalid");
    }

    @Test
    void stage5AcceptsSignatureEsignMatchingPolicy() throws IOException {
        ValidationResult result = PIPELINE.validate(signatureEsignDocument(false));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsSignatureEsignXDg20Forbidden() throws IOException {
        ValidationResult result = PIPELINE.validate(signatureEsignDocument(true));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.signature_esign_x_dg20_forbidden");
    }

    @Test
    void stage5RejectsSignatureEsignWrongPropertyMembership() throws IOException {
        JsonNode doc = signatureEsignDocument(false);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("signature_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("signedArtefactRef");
        properties.putObject("extraRef").put("type", "string").put("minLength", 1);
        ArrayNode required = (ArrayNode) schema.get("required");
        required.removeAll();
        required.add("contextRevision");
        required.add("extraRef");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.signature_esign_properties_invalid");
    }

    @Test
    void stage5RejectsSignatureEsignMissingRequired() throws IOException {
        JsonNode doc = signatureEsignDocument(false);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("signature_ref");
        schema.putArray("required").add("contextRevision");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.signature_esign_required_invalid");
    }

    @Test
    void stage5RejectsSignatureEsignAdditionalPropertiesNotFalse() throws IOException {
        JsonNode doc = signatureEsignDocument(false);
        ObjectNode schema = (ObjectNode) doc.get("jsonSchema").get("properties").get("signature_ref");
        schema.put("additionalProperties", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.signature_esign_additional_properties_not_false");
    }

    // ---------------------------------------------------------------- FB-D14 eligibility-declaration

    private static JsonNode eligibilityDeclarationDocument(String declarationId, boolean includeXdg20)
            throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-eligibility-declaration-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "eligibility_ref": {
                        "type": "object",
                        "properties": {
                          "declarationId": { "type": "string", "const": "DECL_ELIG_V1" },
                          "accepted": { "type": "boolean" },
                          "locale": { "type": "string", "enum": ["en", "gu"] },
                          "consentReceiptRef": { "type": "string", "minLength": 1 }
                        },
                        "required": [
                          "declarationId",
                          "accepted",
                          "locale",
                          "consentReceiptRef"
                        ],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "eligibility_ref": { "ui:field": "eligibility-declaration" },
                    "ui:order": ["eligibility_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "eligibility_ref", "widgetType": "eligibility-declaration" }
                    ],
                    "bilingual": {
                      "labels": {
                        "eligibility_ref": {
                          "en": "Eligibility declaration",
                          "gu": "પાત્રતા ઘોષણા"
                        }
                      },
                      "help": {
                        "eligibility_ref": {
                          "en": "I confirm I meet the eligibility criteria.",
                          "gu": "હું પુષ્ટિ કરું છું કે હું પાત્રતા માપદંડ પૂરા કરું છું."
                        }
                      },
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        ((ObjectNode) schema.get("properties").get("declarationId")).put("const", declarationId);
        if (includeXdg20) {
            schema.putObject("x-dg20").put("declarationId", declarationId);
        }
        return doc;
    }

    @Test
    void stage5AcceptsEligibilityDeclarationMatchingPolicy() throws IOException {
        ValidationResult result =
                PIPELINE.validate(eligibilityDeclarationDocument("DECL_ELIG_V1", true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsEligibilityDeclarationMissingXDg20() throws IOException {
        ValidationResult result =
                PIPELINE.validate(eligibilityDeclarationDocument("DECL_ELIG_V1", false));

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.eligibility_declaration_x_dg20_required");
    }

    @Test
    void stage5RejectsEligibilityDeclarationConstMismatch() throws IOException {
        JsonNode doc = eligibilityDeclarationDocument("DECL_ELIG_V1", true);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        ((ObjectNode) schema.get("properties").get("declarationId")).put("const", "OTHER_DECL");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.eligibility_declaration_id_const_invalid");
    }

    @Test
    void stage5RejectsEligibilityDeclarationLocaleEnumWrong() throws IOException {
        JsonNode doc = eligibilityDeclarationDocument("DECL_ELIG_V1", true);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        ArrayNode localeEnum = ((ObjectNode) schema.get("properties").get("locale")).putArray("enum");
        localeEnum.add("gu");
        localeEnum.add("en");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.eligibility_declaration_locale_invalid");
    }

    @Test
    void stage5RejectsEligibilityDeclarationWrongPropertyMembership() throws IOException {
        JsonNode doc = eligibilityDeclarationDocument("DECL_ELIG_V1", true);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("consentReceiptRef");
        properties.putObject("extraRef").put("type", "string").put("minLength", 1);
        ArrayNode required = (ArrayNode) schema.get("required");
        required.removeAll();
        required.add("declarationId");
        required.add("accepted");
        required.add("locale");
        required.add("extraRef");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.eligibility_declaration_properties_invalid");
    }

    @Test
    void stage5RejectsEligibilityDeclarationAdditionalPropertiesNotFalse() throws IOException {
        JsonNode doc = eligibilityDeclarationDocument("DECL_ELIG_V1", true);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        schema.put("additionalProperties", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result))
                .contains("structure.eligibility_declaration_additional_properties_not_false");
    }

    @Test
    void stage5RejectsEligibilityDeclarationBlankDeclarationId() throws IOException {
        JsonNode doc = eligibilityDeclarationDocument("DECL_ELIG_V1", true);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("eligibility_ref");
        ((ObjectNode) schema.get("x-dg20")).put("declarationId", "  ");
        ((ObjectNode) schema.get("properties").get("declarationId")).put("const", "  ");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result))
                .containsAnyOf(
                        "structure.eligibility_declaration_id_blank",
                        "structure.x_dg20_declaration_id_blank");
    }

    // ---------------------------------------------------------------- FB-D15 caf-prefill

    /**
     * @param withPrefillBinding when true, attaches one valid meta.prefillBindings entry; when
     *     false, leaves bindings empty (unbound CAF widgets must still pass structural checks).
     */
    private static JsonNode cafPrefillDocument(boolean withPrefillBinding) throws IOException {
        String json =
                """
                {
                  "serviceId": "illustrative-caf-prefill-service",
                  "version": 1,
                  "status": "draft",
                  "jsonSchema": {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                      "applicant_ref": {
                        "type": "object",
                        "properties": {
                          "value": { "type": "string", "minLength": 1 },
                          "source": { "type": "string", "enum": ["CAF", "OVERRIDE"] }
                        },
                        "required": ["value", "source"],
                        "additionalProperties": false
                      }
                    },
                    "additionalProperties": false
                  },
                  "uiSchema": {
                    "applicant_ref": { "ui:field": "caf-prefill" },
                    "ui:order": ["applicant_ref"]
                  },
                  "meta": {
                    "paletteProvenance": [
                      { "fieldId": "applicant_ref", "widgetType": "caf-prefill" }
                    ],
                    "bilingual": {
                      "labels": {
                        "applicant_ref": { "en": "Applicant reference", "gu": "અરજદાર સંદર્ભ" }
                      },
                      "help": {},
                      "errors": {}
                    },
                    "prefillBindings": [],
                    "integrationBindings": [],
                    "workflowBindings": [],
                    "progressiveSteps": []
                  },
                  "audit": { "createdBy": "svc-account", "createdAt": "2026-01-01T00:00:00Z" }
                }
                """;
        JsonNode doc = MAPPER.readTree(json);
        if (withPrefillBinding) {
            ArrayNode prefill = (ArrayNode) doc.get("meta").get("prefillBindings");
            ObjectNode entry = MAPPER.createObjectNode();
            entry.put("fieldId", "applicant_ref");
            entry.put("cafAttribute", "caf.applicant.name");
            entry.put("confidenceMin", 0.85);
            prefill.add(entry);
        }
        return doc;
    }

    @Test
    void stage5AcceptsCafPrefillMatchingPolicyWithoutBinding() throws IOException {
        ValidationResult result = PIPELINE.validate(cafPrefillDocument(false));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5AcceptsCafPrefillMatchingPolicyWithOptionalPrefillBinding() throws IOException {
        ValidationResult result = PIPELINE.validate(cafPrefillDocument(true));
        assertThat(result.valid()).isTrue();
    }

    @Test
    void stage5RejectsCafPrefillXDg20Forbidden() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        schema.putObject("x-dg20").put("someKey", "someValue");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_x_dg20_forbidden");
    }

    @Test
    void stage5RejectsCafPrefillWrongPropertyMembership() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        ObjectNode properties = (ObjectNode) schema.get("properties");
        properties.remove("source");
        properties.putObject("extraRef").put("type", "string").put("minLength", 1);
        ArrayNode required = (ArrayNode) schema.get("required");
        required.removeAll();
        required.add("value");
        required.add("extraRef");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_properties_invalid");
    }

    @Test
    void stage5RejectsCafPrefillSourceEnumWrong() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        ArrayNode sourceEnum = ((ObjectNode) schema.get("properties").get("source")).putArray("enum");
        sourceEnum.add("OVERRIDE");
        sourceEnum.add("CAF");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_source_invalid");
    }

    @Test
    void stage5RejectsCafPrefillRequiredOrderWrong() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        ArrayNode required = schema.putArray("required");
        required.add("source");
        required.add("value");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_required_invalid");
    }

    @Test
    void stage5RejectsCafPrefillAdditionalPropertiesNotFalse() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        schema.put("additionalProperties", true);

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_additional_properties_not_false");
    }

    @Test
    void stage5RejectsCafPrefillValueWithoutMinLength() throws IOException {
        JsonNode doc = cafPrefillDocument(false);
        ObjectNode schema =
                (ObjectNode) doc.get("jsonSchema").get("properties").get("applicant_ref");
        ((ObjectNode) schema.get("properties").get("value")).remove("minLength");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("structure.caf_prefill_value_invalid");
    }

    // ---------------------------------------------------------------- controlled palette manifest

    @Test
    void controlledPaletteManifestHasExactlyThirtyUniqueWidgetTypes() {
        assertThat(ControlledPaletteRegistry.loadDefault().size()).isEqualTo(30);
    }

    // ---------------------------------------------------------------- no raw values leak into messages

    @Test
    void issueMessagesNeverEchoRawUserSuppliedText() throws IOException {
        String secret = "UNIQUE_SECRET_XYZ";
        JsonNode doc = fixture("valid-single-page.json");
        ObjectNode label = (ObjectNode) doc.get("meta").get("bilingual").get("labels").get("applicant_name");
        // Trailing whitespace makes this an invalid localized pair (StageSupport rejects padded
        // text), while embedding a distinctive secret string that must never leak into a message.
        label.put("en", secret + " ");

        ValidationResult result = PIPELINE.validate(doc);

        assertThat(result.valid()).isFalse();
        assertThat(codes(result)).contains("bilingual.label_invalid");
        assertThat(result.issues()).noneSatisfy(issue -> assertThat(issue.message()).contains(secret));
    }

    // ---------------------------------------------------------------- no Spring context required
    //
    // This entire test class is plain JUnit 5: no @SpringBootTest, no @ExtendWith(SpringExtension),
    // and no ApplicationContext is ever started. FormDefinitionValidationPipeline is constructed
    // directly with `new`, proving the FB-C1 validators are pure and framework-free.
}
