package org.citizen.platform.tenancy;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/** Puts the caller's state into {@link StateContext} for the duration of the request. */
public class StateFilter extends OncePerRequestFilter {

    public static final String STATE_HEADER = "X-State-Code";

    private final boolean trustHeader;

    public StateFilter(boolean trustHeader) {
        this.trustHeader = trustHeader;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String code = StateClaimExtractor.fromAuthorization(request.getHeader("Authorization"));
        if (code == null && trustHeader) {
            // service-to-service calls inside the cluster that carry no user token
            String header = request.getHeader(STATE_HEADER);
            code = StateContext.isValid(header) ? header : null;
        }
        StateContext.set(code);
        try {
            chain.doFilter(request, response);
        } finally {
            StateContext.clear();
        }
    }
}
