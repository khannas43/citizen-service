package org.citizen.formdefinition.security;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;

/**
 * JWT claim validators for officer-governance resource server (FB-E5.4.1).
 *
 * <p>Validates issuer, audience ({@code form-definition-service}), timestamps with bounded skew,
 * and non-blank unpadded {@code sub}. Does not log claim values.
 */
public final class FormDefinitionJwtValidators {

    public static final String REQUIRED_AUDIENCE = "form-definition-service";

    private FormDefinitionJwtValidators() {}

    public static OAuth2TokenValidator<Jwt> create(
            String issuerUri, String audience, Duration clockSkew) {
        Objects.requireNonNull(issuerUri, "issuerUri");
        Objects.requireNonNull(audience, "audience");
        Objects.requireNonNull(clockSkew, "clockSkew");
        List<OAuth2TokenValidator<Jwt>> validators = new ArrayList<>();
        validators.add(new JwtIssuerValidator(issuerUri));
        validators.add(new JwtTimestampValidator(clockSkew));
        validators.add(audienceValidator(audience));
        validators.add(subjectValidator());
        return new DelegatingOAuth2TokenValidator<>(validators);
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String expectedAudience) {
        return new JwtClaimValidator<>(
                JwtClaimNames.AUD,
                aud -> {
                    if (aud instanceof String s) {
                        return expectedAudience.equals(s);
                    }
                    if (aud instanceof java.util.Collection<?> collection) {
                        return collection.contains(expectedAudience);
                    }
                    return false;
                });
    }

    static OAuth2TokenValidator<Jwt> subjectValidator() {
        return jwt -> {
            String sub = jwt.getSubject();
            if (sub == null || sub.isBlank() || !sub.equals(sub.trim())) {
                return OAuth2TokenValidatorResult.failure(
                        new OAuth2Error(
                                "invalid_token",
                                "Subject is missing or invalid",
                                null));
            }
            return OAuth2TokenValidatorResult.success();
        };
    }
}
