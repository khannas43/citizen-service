package org.citizen.formdefinition.builder;

import java.util.Iterator;

import org.citizen.formdefinition.application.InvalidTransitionRequestException;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Exact Builder OIDC request-body admission (FB-E5.4.2B).
 *
 * <ul>
 *   <li>Clone: exact empty object {@code {}} — rejects {@code createdBy} and any other property
 *   <li>Submit: exact {@code {"targetStatus":"submitted"}} — rejects {@code actorId} and other
 *       statuses/properties
 * </ul>
 */
public final class BuilderAuthenticatedRequestParser {

    private BuilderAuthenticatedRequestParser() {}

    /** Admit exact empty JSON object for authenticated clone. */
    public static void admitEmptyCloneBody(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new InvalidTransitionRequestException();
        }
        if (body.size() != 0) {
            throw new InvalidTransitionRequestException();
        }
        // Defensive: size() should suffice; iterate in case of exotic nodes.
        Iterator<String> names = body.fieldNames();
        if (names.hasNext()) {
            throw new InvalidTransitionRequestException();
        }
    }

    /** Admit exact submit body for authenticated Builder submission. */
    public static void admitSubmittedOnlyBody(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new InvalidTransitionRequestException();
        }
        if (body.size() != 1 || !body.has("targetStatus")) {
            throw new InvalidTransitionRequestException();
        }
        JsonNode target = body.get("targetStatus");
        if (target == null || !target.isTextual() || !"submitted".equals(target.textValue())) {
            throw new InvalidTransitionRequestException();
        }
    }
}
