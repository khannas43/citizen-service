package org.citizen.formdefinition.security;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;

/**
 * FB-E5.4.1 startup guards: reject unsafe profile combinations before the context serves traffic.
 *
 * <p>Registered via {@code META-INF/spring.factories}. Does not log secrets or principal material.
 */
public final class FormDefinitionSecurityProfileGuard
        implements ApplicationListener<ApplicationEnvironmentPreparedEvent>, Ordered {

    static final String PROFILE_OIDC = "governance-oidc";
    static final String PROFILE_TECHNICAL = "governance-technical";

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        Environment env = event.getEnvironment();
        Set<String> profiles = new HashSet<>(Arrays.asList(env.getActiveProfiles()));
        boolean production =
                Boolean.parseBoolean(env.getProperty("form-definition.security.production", "false"))
                        || profilesContainsIgnoreCase(profiles, "prod")
                        || profilesContainsIgnoreCase(profiles, "production");

        if (profiles.contains(PROFILE_OIDC) && profiles.contains(PROFILE_TECHNICAL)) {
            throw new IllegalStateException(
                    "Unsafe profile combination: governance-oidc cannot be combined with"
                            + " governance-technical");
        }
        if (production && profiles.contains(PROFILE_TECHNICAL)) {
            throw new IllegalStateException(
                    "Unsafe profile combination: governance-technical is prohibited in production");
        }
        if (profiles.contains(PROFILE_OIDC)) {
            String issuer = trimToEmpty(env.getProperty("form-definition.security.oidc.issuer-uri"));
            if (issuer.isEmpty()) {
                issuer = trimToEmpty(env.getProperty("FDS_OIDC_ISSUER_URI"));
            }
            if (issuer.isEmpty()) {
                throw new IllegalStateException(
                        "governance-oidc requires form-definition.security.oidc.issuer-uri"
                                + " (FDS_OIDC_ISSUER_URI)");
            }
            String audience =
                    trimToEmpty(env.getProperty("form-definition.security.oidc.audience"));
            if (audience.isEmpty()) {
                audience = trimToEmpty(env.getProperty("FDS_OIDC_AUDIENCE"));
            }
            if (audience.isEmpty()) {
                // Default is applied later by binder; treat explicit blank as failure.
                String raw = env.getProperty("form-definition.security.oidc.audience");
                if (raw != null && raw.trim().isEmpty()) {
                    throw new IllegalStateException(
                            "governance-oidc requires a non-blank"
                                    + " form-definition.security.oidc.audience"
                                    + " (FDS_OIDC_AUDIENCE)");
                }
            }
            if (rawBlankAudience(env)) {
                throw new IllegalStateException(
                        "governance-oidc requires a non-blank"
                                + " form-definition.security.oidc.audience (FDS_OIDC_AUDIENCE)");
            }
            int skew =
                    env.getProperty(
                            "form-definition.security.oidc.clock-skew-seconds", Integer.class, 60);
            if (skew < 0 || skew > 300) {
                throw new IllegalStateException(
                        "form-definition.security.oidc.clock-skew-seconds must be between 0 and 300");
            }
        }
        if (production && !profiles.contains(PROFILE_OIDC)) {
            // Production without OIDC is allowed to boot fail-closed, but technical is already
            // rejected above. Missing OIDC in production with form-definition.security.production=true
            // is an operator choice (fail-closed governance); do not auto-enable OIDC.
        }
        if (Boolean.parseBoolean(env.getProperty("form-definition.security.production", "false"))
                && profiles.contains(PROFILE_OIDC)) {
            String issuer = trimToEmpty(env.getProperty("form-definition.security.oidc.issuer-uri"));
            if (issuer.isEmpty()) {
                throw new IllegalStateException(
                        "production OIDC mode requires form-definition.security.oidc.issuer-uri");
            }
        }
    }

    private static boolean rawBlankAudience(Environment env) {
        String raw = env.getProperty("form-definition.security.oidc.audience");
        return raw != null && raw.trim().isEmpty();
    }

    private static boolean profilesContainsIgnoreCase(Set<String> profiles, String name) {
        for (String p : profiles) {
            if (p != null && p.equalsIgnoreCase(name)) {
                return true;
            }
        }
        return false;
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 20;
    }
}
