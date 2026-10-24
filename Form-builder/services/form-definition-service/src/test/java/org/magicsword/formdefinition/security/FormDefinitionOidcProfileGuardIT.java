package org.magicsword.formdefinition.security;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultBootstrapContext;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.mock.env.MockEnvironment;

/**
 * FB-E5.4.1 startup guards: unsafe profile combinations and blank OIDC issuer fail before traffic.
 *
 * <p>Exercises {@link FormDefinitionSecurityProfileGuard} directly (EnvironmentPreparedEvent) and
 * via {@code META-INF/spring.factories} through a minimal {@link SpringApplicationBuilder}.
 */
class FormDefinitionOidcProfileGuardIT {

    private static final String SYNTHETIC_ISSUER = SyntheticJwtSupport.DEFAULT_ISSUER;

    @Test
    void governanceOidcCombinedWithGovernanceTechnicalFails() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("governance-oidc", "governance-technical");
        env.setProperty("form-definition.security.oidc.issuer-uri", SYNTHETIC_ISSUER);

        assertThatThrownBy(() -> fireGuard(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("governance-oidc")
                .hasMessageContaining("governance-technical");
    }

    @Test
    void productionTrueWithGovernanceTechnicalFails() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("governance-technical");
        env.setProperty("form-definition.security.production", "true");

        assertThatThrownBy(() -> fireGuard(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("governance-technical")
                .hasMessageContaining("production");
    }

    @Test
    void governanceOidcWithBlankIssuerFails() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("governance-oidc");
        env.setProperty("form-definition.security.oidc.issuer-uri", "   ");

        assertThatThrownBy(() -> fireGuard(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("issuer-uri");
    }

    @Test
    void springFactoriesWiresGuardBeforeContextRefresh() {
        assertThatThrownBy(
                        () ->
                                new SpringApplicationBuilder(GuardProbeApp.class)
                                        .web(WebApplicationType.NONE)
                                        .profiles("governance-oidc", "governance-technical")
                                        .properties(
                                                "spring.main.banner-mode=off",
                                                "spring.main.lazy-initialization=true",
                                                "form-definition.security.oidc.issuer-uri="
                                                        + SYNTHETIC_ISSUER)
                                        .run())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("governance-oidc")
                .hasMessageContaining("governance-technical");
    }

    private static void fireGuard(MockEnvironment env) {
        FormDefinitionSecurityProfileGuard guard = new FormDefinitionSecurityProfileGuard();
        ApplicationEnvironmentPreparedEvent event =
                new ApplicationEnvironmentPreparedEvent(
                        new DefaultBootstrapContext(),
                        new SpringApplication(),
                        new String[0],
                        env);
        guard.onApplicationEvent(event);
    }

    @SpringBootConfiguration
    static class GuardProbeApp {}
}
