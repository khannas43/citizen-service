package org.magicsword.scheme.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Basic per-IP rate limit for public guest eligibility (60 requests / minute / IP). A backend service that sends the
 * shared internal key (X-Internal-Key) is not limited: the limit is there for the public, and a detection run in
 * expenditure-integrity-service asks once per entitlement.
 */
@Component
public class GuestEligibilityRateLimitFilter implements Filter {

    private static final int MAX_PER_MINUTE = 60;
    private static final long WINDOW_MS = 60_000L;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final byte[] internalKey;

    public GuestEligibilityRateLimitFilter(@Value("${internal.service-key:}") String internalKey) {
        this.internalKey = internalKey == null ? new byte[0] : internalKey.trim().getBytes(StandardCharsets.UTF_8);
    }

    private boolean isInternalCaller(HttpServletRequest req) {
        String sent = req.getHeader("X-Internal-Key");
        return internalKey.length > 0 && sent != null
                && MessageDigest.isEqual(sent.trim().getBytes(StandardCharsets.UTF_8), internalKey);
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest httpReq)) {
            chain.doFilter(request, response);
            return;
        }
        String path = httpReq.getRequestURI();
        if (path == null || !shouldRateLimit(path, httpReq.getMethod()) || isInternalCaller(httpReq)) {
            chain.doFilter(request, response);
            return;
        }
        String ip = clientIp(httpReq);
        long now = System.currentTimeMillis();
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> now - e.getValue().startMs > WINDOW_MS);
        }
        Window w = windows.compute(ip, (k, v) -> {
            if (v == null || now - v.startMs > WINDOW_MS) {
                return new Window(now, new AtomicInteger(0));
            }
            return v;
        });
        if (w.count.incrementAndGet() > MAX_PER_MINUTE) {
            HttpServletResponse httpRes = (HttpServletResponse) response;
            httpRes.setStatus(429);
            httpRes.setContentType(MediaType.APPLICATION_JSON_VALUE);
            httpRes.getWriter().write("{\"message\":\"Too many eligibility checks. Please wait a minute and try again.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static String clientIp(HttpServletRequest req) {
        // Use the LAST X-Forwarded-For hop (appended by our ingress); earlier hops are client-controlled.
        String forwarded = req.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] hops = forwarded.split(",");
            return hops[hops.length - 1].trim();
        }
        return req.getRemoteAddr() != null ? req.getRemoteAddr() : "unknown";
    }

    private static boolean shouldRateLimit(String path, String method) {
        if ("POST".equalsIgnoreCase(method) && path.endsWith("/v1/eligibility/guest")) {
            return true;
        }
        if ("GET".equalsIgnoreCase(method) && path.contains("/v1/schemes/") && path.endsWith("/public-details")) {
            return true;
        }
        return "GET".equalsIgnoreCase(method) && path.startsWith("/v1/offices/");
    }

    private record Window(long startMs, AtomicInteger count) {}
}
