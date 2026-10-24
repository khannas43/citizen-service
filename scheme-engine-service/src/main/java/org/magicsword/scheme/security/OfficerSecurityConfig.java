package org.magicsword.scheme.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
public class OfficerSecurityConfig {

    @Value("${officer.jwks-uri:http://keycloak.egov.svc.cluster.local:8080/realms/egov/protocol/openid-connect/certs}")
    private String jwksUri;

    @Value("${officer.scheme-content.allowed-roles:SCHEME_DEPT,DEPT_ADMIN}")
    private String allowedRolesCsv;

    /** Who may run the beneficiary scan (the Scheme Management screen). */
    @Value("${officer.admin.scan-roles:SCHEME_DEPT,DEPT_ADMIN}")
    private String scanRolesCsv;

    /** Who may read scheme-overlap (fraud) signals (the Scheme Overlapping screen). */
    @Value("${officer.admin.fraud-roles:REVENUE_OFFICER,DEPT_ADMIN}")
    private String fraudRolesCsv;

    /** Who may use operations tools: ops summary, birthday check, geography backfill, and any other /v1/admin path. */
    @Value("${officer.admin.ops-roles:IT_ADMIN,DEPT_ADMIN}")
    private String opsRolesCsv;

    /** Shared key another backend service sends in X-Internal-Key (INTERNAL_SERVICE_KEY). Empty = feature off. */
    @Value("${internal.service-key:}")
    private String internalServiceKey;

    private static String[] withService(String csv) {
        String[] base = roles(csv);
        String[] out = Arrays.copyOf(base, base.length + 1);
        out[base.length] = "SERVICE";
        return out;
    }

    private static String[] roles(String csv) {
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        List<String> allowed = Arrays.stream(allowedRolesCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        String[] allowedRoleExprs = allowed.stream().map(r -> "ROLE_" + r).toArray(String[]::new);

        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/v1/admin/scheme-content/**", "/v1/admin/offices/import")
                        .hasAnyRole(allowed.toArray(new String[0]))
                        .requestMatchers("/v1/admin/run-identification").hasAnyRole(roles(scanRolesCsv))
                        // creating, editing and deactivating schemes is a scheme-management action (reads and the
                        // simulator, POST /v1/schemes/simulate, stay public)
                        // beneficiary decisions: scheme managers only; scheme-application-service may also mark a
                        // beneficiary as availing when an application is approved (bulk/** is matched first)
                        .requestMatchers("/v1/beneficiaries/bulk/**").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/beneficiaries/confirm-application", "/v1/beneficiaries/*/confirm")
                                .hasAnyRole(withService(scanRolesCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/beneficiaries/*/remove").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.PATCH, "/v1/beneficiaries/*/disburse", "/v1/beneficiaries/*/override")
                                .hasAnyRole(roles(scanRolesCsv))
                        // saved simulator rules (the simulator itself and reading rules stay open)
                        .requestMatchers(HttpMethod.POST, "/v1/rules").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.DELETE, "/v1/rules/*").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/schemes", "/v1/schemes/").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.PUT, "/v1/schemes/*").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers(HttpMethod.DELETE, "/v1/schemes/*").hasAnyRole(roles(scanRolesCsv))
                        .requestMatchers("/v1/admin/fraud-signals").hasAnyRole(roles(fraudRolesCsv))
                        // everything else under /v1/admin (ops-summary, trigger-birthday-check, backfill-geography,
                        // and any endpoint added later) is operations-only by default
                        .requestMatchers("/v1/admin/**").hasAnyRole(roles(opsRolesCsv))
                        .anyRequest().permitAll())
                .addFilterBefore(new InternalKeyFilter(internalServiceKey), BearerTokenAuthenticationFilter.class)
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                        .authenticationEntryPoint(this::writeJsonError)
                        .accessDeniedHandler(this::writeForbidden))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(this::writeJsonError)
                        .accessDeniedHandler(this::writeForbidden));

        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> OfficerRoleNormalizer.normalizedRoles(jwt).stream()
                .map(r -> "ROLE_" + r)
                .map(org.springframework.security.core.authority.SimpleGrantedAuthority::new)
                .collect(Collectors.toList()));
        return converter;
    }

    private void writeJsonError(HttpServletRequest req, HttpServletResponse res, Exception ex) throws IOException {
        res.setStatus(HttpStatus.UNAUTHORIZED.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        new ObjectMapper().writeValue(res.getOutputStream(), Map.of(
                "message", "Authentication required",
                "error", "unauthorized"));
    }

    private void writeForbidden(HttpServletRequest req, HttpServletResponse res, Exception ex) throws IOException {
        res.setStatus(HttpStatus.FORBIDDEN.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        new ObjectMapper().writeValue(res.getOutputStream(), Map.of(
                "message", "Insufficient role for this operation",
                "error", "forbidden"));
    }
}
