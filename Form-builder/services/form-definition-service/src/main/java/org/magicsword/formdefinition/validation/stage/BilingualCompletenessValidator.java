package org.magicsword.formdefinition.validation.stage;

import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationIssueCollector;
import org.magicsword.formdefinition.validation.fieldpath.GovernedField;
import org.magicsword.formdefinition.validation.fieldpath.GovernedFieldGraph;
import org.magicsword.formdefinition.validation.palette.ControlledPaletteEntry;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Stage 3 — bilingual (EN + GU) completeness validation (FB-C1).
 *
 * <p>Confirms every governed field carries an exact, unpadded EN/GU label pair, that help/error
 * strings (when present) are equally complete, and that display-only widgets requiring
 * accompanying help text ({@code info-panel}, {@code eligibility-declaration}) have it. Never
 * derives citizen-facing text from JSON Schema {@code title}/{@code description}, and never
 * trims, fills, or falls back to a default string.
 */
public final class BilingualCompletenessValidator {

    private static final Set<String> LOCALIZED_PAIR_KEYS = Set.of("en", "gu");
    private static final Set<String> HELP_MANDATORY_WIDGETS = Set.of("info-panel", "eligibility-declaration");

    private BilingualCompletenessValidator() {}

    public static void validate(JsonNode document, GovernedFieldGraph graph, ValidationIssueCollector issues) {
        if (document == null || !document.isObject()) {
            return;
        }
        JsonNode meta = document.get("meta");
        if (!StageSupport.isObject(meta)) {
            return;
        }
        JsonNode bilingual = meta.get("bilingual");
        if (!StageSupport.isObject(bilingual)) {
            issues.offer(
                    ValidationIssue.error(
                            "bilingual.section_missing",
                            "meta.bilingual must be a JSON object with labels, help, and errors",
                            "meta.bilingual"));
            return;
        }

        JsonNode labels = bilingual.get("labels");
        JsonNode help = bilingual.get("help");
        JsonNode errors = bilingual.get("errors");

        boolean labelsOk = requireSection(labels, "meta.bilingual.labels", "bilingual.labels_not_object", issues);
        boolean helpOk = requireSection(help, "meta.bilingual.help", "bilingual.help_not_object", issues);
        boolean errorsOk = requireSection(errors, "meta.bilingual.errors", "bilingual.errors_not_object", issues);

        Set<String> governedIds = new LinkedHashSet<>();
        for (GovernedField field : graph.fields()) {
            governedIds.add(field.fieldId());
        }

        if (labelsOk) {
            rejectOrphans(labels, governedIds, "meta.bilingual.labels", issues);
        }
        if (helpOk) {
            rejectOrphans(help, governedIds, "meta.bilingual.help", issues);
        }
        if (errorsOk) {
            rejectOrphans(errors, governedIds, "meta.bilingual.errors", issues);
        }

        for (GovernedField field : graph.fields()) {
            String fieldId = field.fieldId();

            if (labelsOk) {
                JsonNode entry = labels.get(fieldId);
                if (entry == null) {
                    issues.offer(
                            ValidationIssue.error(
                                    "bilingual.label_missing",
                                    "Governed field is missing a meta.bilingual.labels entry",
                                    fieldId));
                } else if (!isValidLocalizedPair(entry)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "bilingual.label_invalid",
                                    "meta.bilingual.labels entry must be an exact object with nonblank en and gu",
                                    fieldId));
                }
            }

            boolean helpMandatory = isHelpMandatory(field.palette());

            if (helpOk) {
                JsonNode entry = help.get(fieldId);
                if (entry != null) {
                    if (!isValidLocalizedPair(entry)) {
                        issues.offer(
                                ValidationIssue.error(
                                        "bilingual.help_invalid",
                                        "meta.bilingual.help entry must be an exact object with nonblank en and gu",
                                        fieldId));
                    }
                } else if (helpMandatory) {
                    issues.offer(
                            ValidationIssue.error(
                                    "bilingual.help_missing",
                                    "This widget type requires an accompanying meta.bilingual.help entry",
                                    fieldId));
                }
            }

            if (errorsOk) {
                JsonNode entry = errors.get(fieldId);
                if (entry != null && !isValidLocalizedPair(entry)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "bilingual.errors_invalid",
                                    "meta.bilingual.errors entry must be an exact object with nonblank en and gu",
                                    fieldId));
                }
            }
        }
    }

    private static boolean isHelpMandatory(ControlledPaletteEntry entry) {
        return entry != null && HELP_MANDATORY_WIDGETS.contains(entry.widgetType());
    }

    private static boolean requireSection(
            JsonNode section, String path, String code, ValidationIssueCollector issues) {
        if (StageSupport.isObject(section)) {
            return true;
        }
        issues.offer(ValidationIssue.error(code, "meta.bilingual." + lastSegment(path) + " must be a JSON object", path));
        return false;
    }

    private static String lastSegment(String path) {
        int idx = path.lastIndexOf('.');
        return idx < 0 ? path : path.substring(idx + 1);
    }

    private static void rejectOrphans(
            JsonNode section, Set<String> governedIds, String path, ValidationIssueCollector issues) {
        Iterator<Map.Entry<String, JsonNode>> fields = section.fields();
        while (fields.hasNext()) {
            String fieldId = fields.next().getKey();
            if (!governedIds.contains(fieldId)) {
                issues.offer(
                        ValidationIssue.error(
                                "bilingual.orphan_entry",
                                "Bilingual entry does not reference an existing governed field",
                                path + "." + fieldId));
            }
        }
    }

    private static boolean isValidLocalizedPair(JsonNode entry) {
        if (!StageSupport.hasExactKeys(entry, LOCALIZED_PAIR_KEYS)) {
            return false;
        }
        return StageSupport.isExactNonBlankText(entry.get("en")) && StageSupport.isExactNonBlankText(entry.get("gu"));
    }
}
