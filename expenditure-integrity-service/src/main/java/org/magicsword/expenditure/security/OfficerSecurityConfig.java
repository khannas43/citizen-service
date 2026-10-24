package org.magicsword.expenditure.security;

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
import org.springframework.security.web.SecurityFilterChain;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
public class OfficerSecurityConfig {

    @Value("${officer.jwks-uri}")
    private String jwksUri;

    @Value("${officer.integrity.allowed-roles}")
    private String allowedCsv;

    @Value("${officer.integrity.admin-roles}")
    private String adminCsv;

    /** Who may assign a case and record a decision on it (not IT_ADMIN: they run the system, they do not rule on cases). */
    @Value("${officer.integrity.review-roles}")
    private String reviewCsv;

    /** Who may record a master correction, payment adjustment or recovery. */
    @Value("${officer.integrity.action-roles}")
    private String actionCsv;

    /** Who may open the legacy scheme-overlap screen served through this service (mirrors scheme-engine). */
    @Value("${officer.integrity.fraud-roles}")
    private String fraudCsv;

    /** Who may upload a payment file to the pre-payment gate and release or confirm its holds. */
    @Value("${officer.integrity.gate-roles}")
    private String gateCsv;

    @Value("${officer.integrity.beneficiary-read-roles}")
    private String beneficiaryReadCsv;

    /** Who may read the money overview (totals only): case readers and senior management. */
    @Value("${officer.integrity.overview-roles}")
    private String overviewCsv;

    private static String[] roles(String csv) {
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        String[] allowed = roles(allowedCsv);
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health/**").permitAll()
                        .requestMatchers("/v1/admin/fraud-signals").hasAnyRole(roles(fraudCsv))
                        .requestMatchers("/v1/admin/**").hasAnyRole(roles(adminCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/cases/*/assign", "/v1/cases/*/decision")
                                .hasAnyRole(roles(reviewCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/cases/*/actions/*/approve", "/v1/cases/*/actions/*/reject")
                                .hasAnyRole(roles(actionCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/cases/*/actions", "/v1/cases/*/verify-closed",
                                "/v1/cases/*/notice/issue", "/v1/cases/*/notice/response").hasAnyRole(roles(actionCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/cases/*/reopen").hasRole("DEPT_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/v1/cases/*/notice").hasAnyRole(roles(reviewCsv))
                        .requestMatchers(HttpMethod.POST, "/v1/payment-gate/**").hasAnyRole(roles(gateCsv))
                        .requestMatchers("/v1/payment-gate/**").hasAnyRole(roles(beneficiaryReadCsv))
                        .requestMatchers("/v1/overview/**").hasAnyRole(roles(overviewCsv))
                        .requestMatchers("/v1/**").hasAnyRole(allowed)
                        .anyRequest().permitAll())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(j -> j.jwtAuthenticationConverter(converter()))
                        .authenticationEntryPoint(this::unauthorized)
                        .accessDeniedHandler(this::forbidden))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(this::unauthorized)
                        .accessDeniedHandler(this::forbidden));
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
    }

    private JwtAuthenticationConverter converter() {
        JwtAuthenticationConverter c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(jwt -> OfficerRoleNormalizer.normalizedRoles(jwt).stream()
                .map(r -> "ROLE_" + r)
                .map(org.springframework.security.core.authority.SimpleGrantedAuthority::new)
                .collect(Collectors.toList()));
        return c;
    }

    private void unauthorized(HttpServletRequest req, HttpServletResponse res, Exception ex) throws IOException {
        res.setStatus(HttpStatus.UNAUTHORIZED.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        new ObjectMapper().writeValue(res.getOutputStream(), Map.of("message", "Authentication required", "error", "unauthorized"));
    }

    private void forbidden(HttpServletRequest req, HttpServletResponse res, Exception ex) throws IOException {
        res.setStatus(HttpStatus.FORBIDDEN.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        new ObjectMapper().writeValue(res.getOutputStream(), Map.of("message", "Insufficient role", "error", "forbidden"));
    }
}
