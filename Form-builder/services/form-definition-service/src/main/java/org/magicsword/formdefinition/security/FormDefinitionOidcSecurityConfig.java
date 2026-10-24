package org.magicsword.formdefinition.security;

import java.time.Duration;

import org.magicsword.formdefinition.builder.BuilderCapability;
import org.magicsword.formdefinition.governance.GovernancePrincipalProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * OAuth2 Resource Server filter chain (profile {@code governance-oidc}).
 *
 * <p>FB-E5.4.1: governance Bearer JWT + technical lifecycle denyAll.
 * FB-E5.4.2A: Builder capability authorities on draft/validation/version routes.
 * FB-E5.4.2B: authenticated {@code /builder/…} clone + submit; technical identity-bearing
 * clone/lifecycle remain denyAll.
 *
 * <p>RS256 JWTs only are trusted in practice. Tests inject a local RSA {@link JwtDecoder} and
 * never call live discovery/JWKS.
 */
@Configuration
@Profile("governance-oidc")
@EnableWebSecurity
@EnableConfigurationProperties(FormDefinitionSecurityProperties.class)
public class FormDefinitionOidcSecurityConfig {

    @Bean
    @Primary
    GovernancePrincipalProvider oidcGovernancePrincipalProvider() {
        return new OidcGovernancePrincipalProvider();
    }

    @Bean
    FormDefinitionJwtAuthenticationConverter formDefinitionJwtAuthenticationConverter() {
        return new FormDefinitionJwtAuthenticationConverter();
    }

    @Bean
    @ConditionalOnMissingBean(JwtDecoder.class)
    @ConditionalOnProperty(
            prefix = "form-definition.security.oidc",
            name = "discovery-enabled",
            havingValue = "true",
            matchIfMissing = true)
    JwtDecoder formDefinitionJwtDecoder(FormDefinitionSecurityProperties properties) {
        FormDefinitionSecurityProperties.Oidc oidc = properties.getOidc();
        String issuer = oidc.getIssuerUri() == null ? "" : oidc.getIssuerUri().trim();
        String audience = oidc.getAudience() == null ? "" : oidc.getAudience().trim();
        if (issuer.isEmpty()) {
            throw new IllegalStateException(
                    "governance-oidc requires form-definition.security.oidc.issuer-uri");
        }
        if (audience.isEmpty()) {
            throw new IllegalStateException(
                    "governance-oidc requires form-definition.security.oidc.audience");
        }
        int skewSeconds = oidc.getClockSkewSeconds();
        if (skewSeconds < 0 || skewSeconds > 300) {
            throw new IllegalStateException(
                    "form-definition.security.oidc.clock-skew-seconds must be between 0 and 300");
        }

        NimbusJwtDecoder decoder = (NimbusJwtDecoder) JwtDecoders.fromIssuerLocation(issuer);
        decoder.setJwtValidator(
                FormDefinitionJwtValidators.create(
                        issuer, audience, Duration.ofSeconds(skewSeconds)));
        return decoder;
    }

    @Bean
    SecurityFilterChain governanceOidcSecurityFilterChain(
            HttpSecurity http,
            FormDefinitionJwtAuthenticationConverter jwtAuthenticationConverter)
            throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(
                        ex ->
                                ex.authenticationEntryPoint(
                                                new GovernanceOidcAuthenticationEntryPoint())
                                        .accessDeniedHandler(
                                                new GovernanceOidcAccessDeniedHandler()))
                .authorizeHttpRequests(
                        auth ->
                                auth.requestMatchers(
                                                HttpMethod.GET,
                                                "/api/v1/form-definitions/published/latest",
                                                "/api/v1/form-definitions/published/latest/")
                                        .permitAll()
                                        .requestMatchers(
                                                "/actuator/health",
                                                "/actuator/health/**",
                                                "/actuator/info")
                                        .permitAll()
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions/lifecycle-transitions",
                                                "/api/v1/form-definitions/lifecycle-transitions/")
                                        .denyAll()
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions/drafts/from-version",
                                                "/api/v1/form-definitions/drafts/from-version/")
                                        .denyAll()
                                        .requestMatchers(
                                                "/api/v1/form-definitions/governance/**")
                                        .authenticated()
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions/validation",
                                                "/api/v1/form-definitions/validation/")
                                        .hasAuthority(
                                                BuilderCapability.VALIDATE_FORM_DEFINITION.name())
                                        .requestMatchers(
                                                HttpMethod.GET,
                                                "/api/v1/form-definitions/versions",
                                                "/api/v1/form-definitions/versions/")
                                        .hasAuthority(
                                                BuilderCapability.LIST_FORM_DEFINITION_VERSIONS
                                                        .name())
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions",
                                                "/api/v1/form-definitions/")
                                        .hasAuthority(
                                                BuilderCapability.CREATE_FORM_DEFINITION_DRAFT
                                                        .name())
                                        .requestMatchers(
                                                HttpMethod.GET,
                                                "/api/v1/form-definitions",
                                                "/api/v1/form-definitions/")
                                        .hasAuthority(
                                                BuilderCapability.READ_FORM_DEFINITION_COORDINATE
                                                        .name())
                                        .requestMatchers(
                                                HttpMethod.PUT,
                                                "/api/v1/form-definitions",
                                                "/api/v1/form-definitions/")
                                        .hasAuthority(
                                                BuilderCapability.REPLACE_FORM_DEFINITION_DRAFT
                                                        .name())
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions/builder/drafts/from-version",
                                                "/api/v1/form-definitions/builder/drafts/from-version/")
                                        .hasAuthority(
                                                BuilderCapability.CLONE_FORM_DEFINITION_DRAFT
                                                        .name())
                                        .requestMatchers(
                                                HttpMethod.POST,
                                                "/api/v1/form-definitions/builder/lifecycle-transitions",
                                                "/api/v1/form-definitions/builder/lifecycle-transitions/")
                                        .hasAuthority(
                                                BuilderCapability.SUBMIT_FORM_DEFINITION.name())
                                        .anyRequest()
                                        .permitAll())
                .oauth2ResourceServer(
                        oauth2 ->
                                oauth2
                                        .authenticationEntryPoint(
                                                new GovernanceOidcAuthenticationEntryPoint())
                                        .jwt(
                                                jwt ->
                                                        jwt.jwtAuthenticationConverter(
                                                                jwtAuthenticationConverter)));
        return http.build();
    }
}
