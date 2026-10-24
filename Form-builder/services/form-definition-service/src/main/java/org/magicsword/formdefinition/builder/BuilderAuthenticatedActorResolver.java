package org.magicsword.formdefinition.builder;

import java.util.Optional;

import org.magicsword.formdefinition.application.ActorIdAdmission;
import org.magicsword.formdefinition.application.InvalidActorException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Resolves the immutable Builder actor from the authenticated JWT {@code sub} (FB-E5.4.2B). Does
 * not re-parse tokens or log claims. Filter-chain capability checks remain authoritative for
 * {@link BuilderCapability}.
 */
@Component
public class BuilderAuthenticatedActorResolver {

    /**
     * @return admitted actorId from JWT {@code sub}
     * @throws InvalidActorException when no usable authenticated JWT subject exists (JWT validators
     *     normally reject bad {@code sub} before this runs)
     */
    public String requireActorId() {
        return currentActorId().orElseThrow(InvalidActorException::new);
    }

    public Optional<String> currentActorId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuth)
                || !jwtAuth.isAuthenticated()
                || jwtAuth.getToken() == null) {
            return Optional.empty();
        }
        String sub = jwtAuth.getToken().getSubject();
        if (sub == null || sub.isBlank() || !sub.equals(sub.trim())) {
            return Optional.empty();
        }
        try {
            return Optional.of(ActorIdAdmission.admit(sub));
        } catch (InvalidActorException ex) {
            return Optional.empty();
        }
    }
}
