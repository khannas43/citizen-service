package org.magicsword.formdefinition.security;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Set;

import org.magicsword.formdefinition.builder.BuilderCapability;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Converts an admitted JWT into a {@link JwtAuthenticationToken} whose authorities are exact
 * {@link BuilderCapability} names (FB-E5.4.2A).
 *
 * <p>Does not add {@code ROLE_USER}, SCOPE_*, or governance capabilities as authorities.
 * Governance remains application-layer via {@link OidcGovernancePrincipalProvider}. JWT {@code
 * sub} is preserved as the token principal name for future actor derivation.
 */
public final class FormDefinitionJwtAuthenticationConverter
        implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        Set<BuilderCapability> capabilities =
                KeycloakRealmAccessRoleMapper.mapBuilderCapabilities(jwt);
        Collection<GrantedAuthority> authorities = new ArrayList<>(capabilities.size());
        for (BuilderCapability capability : capabilities) {
            authorities.add(new SimpleGrantedAuthority(capability.name()));
        }
        return new JwtAuthenticationToken(jwt, authorities);
    }
}
