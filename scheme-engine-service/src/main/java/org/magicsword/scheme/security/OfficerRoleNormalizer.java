package org.magicsword.scheme.security;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.*;

/** Mirrors officer-portal/src/auth.js role normalisation. */
public final class OfficerRoleNormalizer {

    private static final Set<String> KNOWN_ROLES = Set.of(
            "DATA_ENTRY_OFFICER", "TALATI", "REVENUE_OFFICER", "SCHEME_DEPT",
            "DEPT_ADMIN", "IT_ADMIN", "SENIOR_MGMT");

    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("TALATI", "TALATI"),
            Map.entry("MAMLATDAR", "TALATI"),
            Map.entry("DATA_ENTRY_OFFICER", "DATA_ENTRY_OFFICER"),
            Map.entry("DATA_ENTRY", "DATA_ENTRY_OFFICER"),
            Map.entry("REVENUE_OFFICER", "REVENUE_OFFICER"),
            Map.entry("REVENUE", "REVENUE_OFFICER"),
            Map.entry("SCHEME_DEPT", "SCHEME_DEPT"),
            Map.entry("SCHEME_DEPARTMENT", "SCHEME_DEPT"),
            Map.entry("DEPT_ADMIN", "DEPT_ADMIN"),
            Map.entry("DEPARTMENT_ADMIN", "DEPT_ADMIN"),
            Map.entry("IT_ADMIN", "IT_ADMIN"),
            Map.entry("SENIOR_MGMT", "SENIOR_MGMT"),
            Map.entry("SENIOR_MANAGEMENT", "SENIOR_MGMT")
    );

    private OfficerRoleNormalizer() {}

    public static String normalize(String role) {
        if (role == null || role.isBlank()) return "UNKNOWN";
        String key = role.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s.-]+", "_");
        if (ALIASES.containsKey(key)) return ALIASES.get(key);
        return KNOWN_ROLES.contains(key) ? key : "UNKNOWN";
    }

    @SuppressWarnings("unchecked")
    public static Optional<String> primaryOfficerRole(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (!(realmAccess instanceof Map<?, ?> map)) return Optional.empty();
        Object rolesObj = map.get("roles");
        if (!(rolesObj instanceof Collection<?> roles)) return Optional.empty();
        for (Object r : roles) {
            String normalized = normalize(String.valueOf(r));
            if (!"UNKNOWN".equals(normalized)) {
                return Optional.of(normalized);
            }
        }
        return Optional.empty();
    }

    public static List<String> normalizedRoles(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (!(realmAccess instanceof Map<?, ?> map)) return List.of();
        Object rolesObj = map.get("roles");
        if (!(rolesObj instanceof Collection<?> roles)) return List.of();
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (Object r : roles) {
            String n = normalize(String.valueOf(r));
            if (!"UNKNOWN".equals(n)) out.add(n);
        }
        return List.copyOf(out);
    }
}
