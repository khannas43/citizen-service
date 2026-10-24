package org.magicsword.formdefinition.validation.stage;

import java.net.URI;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationIssueCollector;

import com.fasterxml.jackson.databind.JsonNode;
import com.networknt.schema.Error;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
/**
 * Stage 1 — JSON Schema Draft 2020-12 meta-validation (offline, no remote retrieval).
 *
 * <p>Uses the classpath-bundled Draft 2020-12 dialect and meta-schema shipped inside the
 * {@code json-schema-validator} artifact itself — no bundled resource file of our own and no
 * network access are required or permitted.
 */
public final class JsonSchemaMetaValidator {

    public static final String SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";
    public static final String SCHEMA_2020_12_HASH = "https://json-schema.org/draft/2020-12/schema#";

    private final SchemaRegistry registry;
    private final Schema metaSchema;

    public JsonSchemaMetaValidator() {
        this.registry =
                SchemaRegistry.withDefaultDialect(
                        SpecificationVersion.DRAFT_2020_12,
                        builder ->
                                builder.schemaLoader(
                                        schemaLoader -> schemaLoader.fetchRemoteResources(false)));
        this.metaSchema = registry.getSchema(SchemaLocation.of(SCHEMA_2020_12));
    }

    public void validate(JsonNode formDefinition, ValidationIssueCollector issues) {
        if (formDefinition == null || !formDefinition.isObject()) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.root_not_object",
                            "Form Definition must be a JSON object",
                            null));
            return;
        }

        JsonNode jsonSchema = formDefinition.get("jsonSchema");
        if (jsonSchema == null || jsonSchema.isNull() || jsonSchema.isMissingNode()) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.jsonSchema_missing", "jsonSchema is required", "jsonSchema"));
            return;
        }
        if (!jsonSchema.isObject()) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.jsonSchema_not_object",
                            "jsonSchema must be a JSON object",
                            "jsonSchema"));
            return;
        }

        JsonNode schemaDialect = jsonSchema.get("$schema");
        if (schemaDialect == null || !schemaDialect.isTextual()) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.dialect_missing",
                            "$schema must be the Draft 2020-12 schema URI",
                            "jsonSchema.$schema"));
            return;
        }
        String dialect = schemaDialect.textValue();
        if (!SCHEMA_2020_12.equals(dialect) && !SCHEMA_2020_12_HASH.equals(dialect)) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.dialect_unsupported",
                            "$schema must be exactly the Draft 2020-12 schema URI",
                            "jsonSchema.$schema"));
            return;
        }

        if (containsDisallowedRef(jsonSchema, issues)) {
            return;
        }

        try {
            List<Error> errors = metaSchema.validate(jsonSchema);
            for (Error error : errors) {
                issues.offer(
                        ValidationIssue.error(
                                "schema.meta_invalid",
                                "jsonSchema failed Draft 2020-12 meta-schema validation",
                                pathFromError(error)));
            }
        } catch (RuntimeException ex) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.meta_compile_failed",
                            "jsonSchema could not be validated against Draft 2020-12",
                            "jsonSchema"));
        }

        // Compile the user schema offline to surface unresolved local refs / invalid keywords.
        try {
            Schema compiled = registry.getSchema(jsonSchema);
            compiled.initializeValidators();
        } catch (RuntimeException ex) {
            issues.offer(
                    ValidationIssue.error(
                            "schema.compile_failed",
                            "jsonSchema failed offline Draft 2020-12 compilation",
                            "jsonSchema"));
        }
    }

    private static boolean containsDisallowedRef(JsonNode node, ValidationIssueCollector issues) {
        return scanRefs(node, "jsonSchema", issues);
    }

    private static boolean scanRefs(JsonNode node, String path, ValidationIssueCollector issues) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return false;
        }
        boolean found = false;
        if (node.isObject()) {
            JsonNode ref = node.get("$ref");
            if (ref != null && ref.isTextual()) {
                String value = ref.textValue();
                if (isDisallowedRef(value)) {
                    issues.offer(
                            ValidationIssue.error(
                                    "schema.remote_ref_forbidden",
                                    "jsonSchema must not use remote, file, classpath, or custom-scheme $ref",
                                    path + ".$ref"));
                    found = true;
                }
            }
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String childPath =
                        "$ref".equals(entry.getKey())
                                ? path
                                : path + "." + entry.getKey();
                found = scanRefs(entry.getValue(), childPath, issues) || found;
            }
        } else if (node.isArray()) {
            int i = 0;
            for (JsonNode child : node) {
                found = scanRefs(child, path + "[" + i + "]", issues) || found;
                i++;
            }
        }
        return found;
    }

    static boolean isDisallowedRef(String value) {
        if (value == null || value.isEmpty()) {
            return true;
        }
        // Local JSON Pointer / same-document refs are allowed.
        if (value.startsWith("#")) {
            return false;
        }
        // Relative fragment-only or empty — treat non-# absolute as disallowed.
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            if (scheme == null) {
                // Relative path refs (not #) are treated as external and rejected.
                return true;
            }
            // Any scheme (http, https, file, classpath, custom) is forbidden.
            return true;
        } catch (IllegalArgumentException ex) {
            return true;
        }
    }

    private static String pathFromError(Error error) {
        Object path = error.getInstanceLocation();
        String raw = path != null ? path.toString() : null;
        if (raw == null || raw.isBlank() || "$".equals(raw)) {
            return "jsonSchema";
        }
        if (raw.startsWith("$")) {
            return "jsonSchema" + raw.substring(1);
        }
        return "jsonSchema." + raw;
    }
}
