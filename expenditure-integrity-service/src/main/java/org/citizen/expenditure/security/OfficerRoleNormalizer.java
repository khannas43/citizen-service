package org.citizen.expenditure.security;

import org.springframework.security.oauth2.jwt.Jwt;

import java.util.*;

public final class OfficerRoleNormalizer {
    private static final Set<String> KNOWN = Set.of(
            "DATA_ENTRY_OFFICER", "TALATI", "REVENUE_OFFICER", "SCHEME_DEPT",
            "DEPT_ADMIN", "IT_ADMIN", "SENIOR_MGMT", "PAYROLL_REVIEWER", "FINANCE_OFFICER", "HR_OFFICER");
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("MAMLATDAR", "TALATI"),
            Map.entry("SCHEME_DEPARTMENT", "SCHEME_DEPT"),
            Map.entry("DEPARTMENT_ADMIN", "DEPT_ADMIN"),
            Map.entry("SENIOR_MANAGEMENT", "SENIOR_MGMT"));

    private OfficerRoleNormalizer() {}

    public static String normalize(String role) {
        if (role == null || role.isBlank()) return "UNKNOWN";
        String key = role.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s.-]+", "_");
        if (ALIASES.containsKey(key)) return ALIASES.get(key);
        return KNOWN.contains(key) ? key : "UNKNOWN";
    }

    @SuppressWarnings("unchecked")
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
