package org.magicsword.formdefinition.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.magicsword.formdefinition.api.ProblemCodes;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Path-aware {@code 401} ProblemDetail with {@code Cache-Control: no-store} (FB-E5.4.1 / E5.4.2A).
 * Governance paths keep {@code governance_unauthenticated}; other protected paths use {@code
 * builder_unauthenticated}. Never includes token, claims, subject, roles, or capabilities.
 */
public final class GovernanceOidcAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final byte[] GOVERNANCE_BODY =
            ("{\"type\":\"about:blank\",\"title\":\"Governance Unauthenticated\","
                            + "\"status\":401,\"detail\":\"Governance authentication is required\","
                            + "\"code\":\""
                            + ProblemCodes.GOVERNANCE_UNAUTHENTICATED
                            + "\"}")
                    .getBytes(StandardCharsets.UTF_8);

    private static final byte[] BUILDER_BODY =
            ("{\"type\":\"about:blank\",\"title\":\"Builder Unauthenticated\","
                            + "\"status\":401,\"detail\":\"Authentication is required\","
                            + "\"code\":\""
                            + ProblemCodes.BUILDER_UNAUTHENTICATED
                            + "\"}")
                    .getBytes(StandardCharsets.UTF_8);

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        byte[] body = isGovernancePath(request) ? GOVERNANCE_BODY : BUILDER_BODY;
        response.getOutputStream().write(body);
    }

    static boolean isGovernancePath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri != null && uri.contains("/form-definitions/governance");
    }
}
