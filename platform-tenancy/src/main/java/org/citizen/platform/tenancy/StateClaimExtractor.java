package org.citizen.platform.tenancy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Reads the "state" claim from a Bearer token. It only decodes the payload; signature checks stay with
 * the service's own security (OAuth2 resource server). A forged claim therefore cannot pass where the
 * token is validated.
 */
public final class StateClaimExtractor {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private StateClaimExtractor() {}

    /** @return a valid upper-case two-letter state code, or null. */
    public static String fromAuthorization(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return null;
        }
        String[] parts = authorizationHeader.substring(7).trim().split("\\.");
        if (parts.length < 2) {
            return null;
        }
        try {
            byte[] json = Base64.getUrlDecoder().decode(parts[1]);
            JsonNode claim = MAPPER.readTree(new String(json, StandardCharsets.UTF_8)).get("state");
            String code = claim == null || !claim.isTextual() ? null : claim.asText();
            return StateContext.isValid(code) ? code : null;
        } catch (Exception e) {
            return null;
        }
    }
}
