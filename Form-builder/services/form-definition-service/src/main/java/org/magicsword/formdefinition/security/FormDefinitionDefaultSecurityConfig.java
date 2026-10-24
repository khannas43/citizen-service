package org.magicsword.formdefinition.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Default security when {@code governance-oidc} is inactive (FB-E5.4.1).
 *
 * <p>Permits all HTTP at the filter layer so existing application-layer fail-closed governance and
 * technical APIs retain prior semantics. Spring Security is on the classpath for OIDC readiness.
 */
@Configuration
@Profile("!governance-oidc")
@EnableWebSecurity
public class FormDefinitionDefaultSecurityConfig {

    @Bean
    SecurityFilterChain defaultPermitAllSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
