package org.magicsword.formdefinition.governance;

import java.util.Iterator;
import java.util.Set;

import org.magicsword.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Exact governance lifecycle body admission (FB-E1): {@code {"targetStatus":"approved"|"published"}}
 * only — no {@code actorId}.
 */
public final class GovernanceTransitionRequestParser {

    private static final Set<String> REQUEST_KEYS = Set.of("targetStatus");

    private GovernanceTransitionRequestParser() {}

    public static FormDefinitionStatus parseTargetStatus(JsonNode body) {
        if (body == null || !body.isObject()) {
            throw new InvalidGovernanceTransitionRequestException();
        }
        int count = 0;
        Iterator<String> names = body.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!REQUEST_KEYS.contains(name)) {
                throw new InvalidGovernanceTransitionRequestException();
            }
            count++;
        }
        if (count != REQUEST_KEYS.size()) {
            throw new InvalidGovernanceTransitionRequestException();
        }
        JsonNode targetNode = body.get("targetStatus");
        if (targetNode == null || !targetNode.isTextual()) {
            throw new InvalidGovernanceTransitionRequestException();
        }
        FormDefinitionStatus target;
        try {
            target = FormDefinitionStatus.parseExact(targetNode.textValue());
        } catch (IllegalArgumentException ex) {
            throw new InvalidGovernanceTransitionRequestException();
        }
        if (target != FormDefinitionStatus.approved && target != FormDefinitionStatus.published) {
            throw new InvalidGovernanceTransitionRequestException();
        }
        return target;
    }
}
