package org.citizen.formdefinition.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * FB-E5.4.1 OIDC resource-server settings (environment-backed; no secrets in repo).
 *
 * <p>Active under profile {@code governance-oidc}. Issuer and audience are mandatory when that
 * profile is active.
 */
@ConfigurationProperties(prefix = "form-definition.security")
public class FormDefinitionSecurityProperties {

    /** When true, reject governance-technical and require safe OIDC posture. */
    private boolean production = false;

    private final Oidc oidc = new Oidc();

    public boolean isProduction() {
        return production;
    }

    public void setProduction(boolean production) {
        this.production = production;
    }

    public Oidc getOidc() {
        return oidc;
    }

    public static final class Oidc {
        private String issuerUri = "";
        private String audience = "form-definition-service";
        private int clockSkewSeconds = 60;
        private boolean discoveryEnabled = true;

        public String getIssuerUri() {
            return issuerUri;
        }

        public void setIssuerUri(String issuerUri) {
            this.issuerUri = issuerUri;
        }

        public String getAudience() {
            return audience;
        }

        public void setAudience(String audience) {
            this.audience = audience;
        }

        public int getClockSkewSeconds() {
            return clockSkewSeconds;
        }

        public void setClockSkewSeconds(int clockSkewSeconds) {
            this.clockSkewSeconds = clockSkewSeconds;
        }

        public boolean isDiscoveryEnabled() {
            return discoveryEnabled;
        }

        public void setDiscoveryEnabled(boolean discoveryEnabled) {
            this.discoveryEnabled = discoveryEnabled;
        }
    }
}