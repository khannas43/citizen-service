package org.magicsword.formdefinition.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.magicsword.formdefinition.api.ProblemCodes;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Path-aware {@code 403} ProblemDetail with {@code Cache-Control: no-store} (FB-E5.4.1 / E5.4.2A).
 *
 * <ul>
 *   <li>Governance paths → {@code governance_forbidden} (filter-layer; app-layer codes unchanged)
 *   <li>Technical denyAll (clone / lifecycle) → generic {@code forbidden}
 *   <li>Builder capability failures → {@code builder_forbidden}
 * </ul>
 *
 * <p>Does not leak identity material.
 */
public final class GovernanceOidcAccessDeniedHandler implements AccessDeniedHandler {

    private static final byte[] GOVERNANCE_BODY =
            ("{\"type\":\"about:blank\",\"title\":\"Governance Forbidden\","
                            + "\"status\":403,\"detail\":\"Governance capability is required\","
                            + "\"code\":\""
                            + ProblemCodes.GOVERNANCE_FORBIDDEN
                            + "\"}")
                    .getBytes(StandardCharsets.UTF_8);

    private static final byte[] BUILDER_BODY =
            ("{\"type\":\"about:blank\",\"title\":\"Builder Forbidden\","
                            + "\"status\":403,\"detail\":\"Required capability is missing\","
                            + "\"code\":\""
                            + ProblemCodes.BUILDER_FORBIDDEN
                            + "\"}")
                    .getBytes(StandardCharsets.UTF_8);

    private static final byte[] GENERIC_BODY =
            ("{\"type\":\"about:blank\",\"title\":\"Forbidden\","
                            + "\"status\":403,\"detail\":\"Request is not permitted\","
                            + "\"code\":\"forbidden\"}")
                    .getBytes(StandardCharsets.UTF_8);

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException)
            throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getOutputStream().write(bodyFor(request));
    }

    private static byte[] bodyFor(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null) {
            return GENERIC_BODY;
        }
        if (uri.contains("/form-definitions/governance")) {
            return GOVERNANCE_BODY;
        }
        // Technical identity-bearing paths remain denyAll under OIDC (FB-E5.4.1 / E5.4.2B).
        if (isTechnicalIdentityBearingPath(uri)) {
            return GENERIC_BODY;
        }
        return BUILDER_BODY;
    }

    /** Exact technical clone/lifecycle paths — not Builder or governance variants. */
    static boolean isTechnicalIdentityBearingPath(String uri) {
        return uri.contains("/form-definitions/lifecycle-transitions")
                        && !uri.contains("/builder/")
                        && !uri.contains("/governance/")
                || uri.contains("/form-definitions/drafts/from-version")
                        && !uri.contains("/builder/");
    }
}
