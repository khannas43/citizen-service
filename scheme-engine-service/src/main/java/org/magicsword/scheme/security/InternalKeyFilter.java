package org.magicsword.scheme.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

/**
 * Lets another backend service (for example scheme-application-service, which marks a beneficiary as availing
 * after an application is approved) call a few endpoints without an officer token. The caller sends the shared key
 * in X-Internal-Key; it gets the single authority ROLE_SERVICE, which only the rules in OfficerSecurityConfig that
 * name SERVICE accept. With no key configured the filter does nothing.
 */
public class InternalKeyFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Key";

    private final byte[] key;

    public InternalKeyFilter(String key) {
        this.key = key == null ? new byte[0] : key.trim().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String sent = req.getHeader(HEADER);
        if (key.length > 0 && sent != null
                && MessageDigest.isEqual(sent.trim().getBytes(StandardCharsets.UTF_8), key)) {
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                    "internal-service", null, List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))));
        }
        chain.doFilter(req, res);
    }
}
