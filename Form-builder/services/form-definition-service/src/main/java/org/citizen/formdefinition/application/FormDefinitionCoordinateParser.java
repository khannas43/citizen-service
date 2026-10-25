package org.citizen.formdefinition.application;

import org.citizen.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Shared strict coordinate parser for create admission, load verification, and find lookup
 * arguments (FB-C0.1). Never silently trims or coerces values.
 */
public final class FormDefinitionCoordinateParser {

    public static final int SERVICE_ID_MAX_CODE_POINTS = 256;

    private FormDefinitionCoordinateParser() {}

    /**
     * Parse serviceId, version, and status from a top-level Form Definition JSON object.
     */
    public static FormDefinitionCoordinates parseDocument(JsonNode document) {
        requireObject(document);
        return new FormDefinitionCoordinates(
                parseServiceIdNode(document.get("serviceId")),
                parseVersionNode(document.get("version")),
                parseStatusNode(document.get("status")));
    }

    /**
     * Admit a lookup serviceId argument (never reaches the repository when invalid).
     */
    public static String admitLookupServiceId(String serviceId) {
        return admitServiceIdString(serviceId);
    }

    /**
     * Admit a lookup version argument (never reaches the repository when invalid).
     */
    public static int admitLookupVersion(int version) {
        if (version <= 0) {
            throw new FormDefinitionAdmissionException("version must be a positive integer");
        }
        return version;
    }

    private static void requireObject(JsonNode document) {
        if (document == null || document.isNull() || !document.isObject()) {
            throw new FormDefinitionAdmissionException("definition must be a top-level JSON object");
        }
    }

    private static String parseServiceIdNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            throw new FormDefinitionAdmissionException("serviceId is required");
        }
        if (!node.isTextual()) {
            throw new FormDefinitionAdmissionException("serviceId must be a JSON string");
        }
        return admitServiceIdString(node.textValue());
    }

    private static String admitServiceIdString(String serviceId) {
        if (serviceId == null) {
            throw new FormDefinitionAdmissionException("serviceId must be nonblank");
        }
        if (serviceId.isEmpty() || serviceId.isBlank()) {
            throw new FormDefinitionAdmissionException("serviceId must be nonblank");
        }
        if (!serviceId.equals(serviceId.trim())) {
            throw new FormDefinitionAdmissionException(
                    "serviceId must not have leading or trailing whitespace");
        }
        int codePoints = serviceId.codePointCount(0, serviceId.length());
        if (codePoints > SERVICE_ID_MAX_CODE_POINTS) {
            throw new FormDefinitionAdmissionException("serviceId exceeds maximum length");
        }
        return serviceId;
    }

    private static int parseVersionNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            throw new FormDefinitionAdmissionException("version is required");
        }
        if (node.isTextual() || node.isBoolean() || node.isArray() || node.isObject()) {
            throw new FormDefinitionAdmissionException("version must be a positive integral number");
        }
        if (!node.isNumber()) {
            throw new FormDefinitionAdmissionException("version must be a positive integral number");
        }
        // Reject floating-point JSON numbers even when mathematically whole (e.g. 1.0).
        if (node.isFloatingPointNumber() || !node.isIntegralNumber()) {
            throw new FormDefinitionAdmissionException("version must be a positive integral number");
        }
        if (!node.canConvertToExactIntegral() || !node.canConvertToInt()) {
            throw new FormDefinitionAdmissionException("version overflows integer range");
        }
        int version = node.intValue();
        if (version <= 0) {
            throw new FormDefinitionAdmissionException("version must be a positive integer");
        }
        return version;
    }

    private static FormDefinitionStatus parseStatusNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            throw new FormDefinitionAdmissionException("status is required");
        }
        if (!node.isTextual()) {
            throw new FormDefinitionAdmissionException("status must be a JSON string");
        }
        String raw = node.textValue();
        if (raw == null || raw.isEmpty() || raw.isBlank()) {
            throw new FormDefinitionAdmissionException("status must be a recognized lowercase value");
        }
        if (!raw.equals(raw.trim())) {
            throw new FormDefinitionAdmissionException("status must be a recognized lowercase value");
        }
        try {
            return FormDefinitionStatus.parseExact(raw);
        } catch (IllegalArgumentException ex) {
            throw new FormDefinitionAdmissionException("status must be a recognized lowercase value", ex);
        }
    }
}
