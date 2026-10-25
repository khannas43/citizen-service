package org.citizen.formdefinition.config;

import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

import org.citizen.formdefinition.governance.FailClosedGovernancePrincipalProvider;
import org.citizen.formdefinition.governance.GovernanceCapability;
import org.citizen.formdefinition.governance.GovernancePrincipal;
import org.citizen.formdefinition.governance.GovernancePrincipalProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

/**
 * FB-E1 governance principal wiring.
 *
 * <p>Default: fail-closed (no principal). Profile {@code governance-technical} may enable an
 * explicit non-production technical principal from configuration properties — never use in
 * production. Prefer test {@code @Bean} injection for automated tests.
 */
@Configuration
public class FormDefinitionGovernanceConfig {

    @Bean
    @ConditionalOnMissingBean(GovernancePrincipalProvider.class)
    GovernancePrincipalProvider failClosedGovernancePrincipalProvider() {
        return new FailClosedGovernancePrincipalProvider();
    }

    /**
     * Technical local-only principal. Active only with profile {@code governance-technical} and a
     * non-blank {@code form-definition.governance.technical.actor-id}. Does not read HTTP headers.
     * PROHIBITED in production.
     */
    @Bean
    @Profile("governance-technical")
    @ConditionalOnExpression(
            "!'${form-definition.governance.technical.actor-id:}'.trim().isEmpty()")
    @Primary
    GovernancePrincipalProvider technicalGovernancePrincipalProvider(
            @Value("${form-definition.governance.technical.actor-id}") String actorId,
            @Value(
                            "${form-definition.governance.technical.capabilities:READ_FORM_DEFINITION_GOVERNANCE,APPROVE_FORM_DEFINITION,PUBLISH_FORM_DEFINITION}")
                    String capabilitiesCsv) {
        Set<GovernanceCapability> capabilities = EnumSet.noneOf(GovernanceCapability.class);
        for (String part : capabilitiesCsv.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            capabilities.add(GovernanceCapability.valueOf(trimmed));
        }
        GovernancePrincipal principal = GovernancePrincipal.of(actorId, capabilities);
        return () -> Optional.of(principal);
    }
}
