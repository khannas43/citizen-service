package org.citizen.formdefinition.security;

import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.citizen.formdefinition.builder.BuilderCapability;
import org.citizen.formdefinition.governance.GovernanceCapability;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Maps Keycloak {@code realm_access.roles} to FDS capabilities (FB-E5.4.1 / E5.4.2A).
 *
 * <p>Selected claim path (officer realm evidence): {@code realm_access.roles}. Unknown roles
 * (including Officer UI roles such as {@code IT_ADMIN}) are ignored. Governance and Builder role
 * spaces are independent — neither grants capabilities in the other.
 *
 * <p>Governance:
 *
 * <ul>
 *   <li>{@code FDS_GOVERNANCE_READER} → {@link GovernanceCapability#READ_FORM_DEFINITION_GOVERNANCE}
 *   <li>{@code FDS_FORM_APPROVER} → {@link GovernanceCapability#APPROVE_FORM_DEFINITION}
 *   <li>{@code FDS_FORM_PUBLISHER} → {@link GovernanceCapability#PUBLISH_FORM_DEFINITION}
 * </ul>
 *
 * <p>Builder (FB-E5.4.2A):
 *
 * <ul>
 *   <li>{@code FDS_DEFINITION_VALIDATOR} → {@link BuilderCapability#VALIDATE_FORM_DEFINITION}
 *   <li>{@code FDS_DRAFT_CREATOR} → {@link BuilderCapability#CREATE_FORM_DEFINITION_DRAFT}
 *   <li>{@code FDS_DEFINITION_READER} → {@link BuilderCapability#READ_FORM_DEFINITION_COORDINATE}
 *   <li>{@code FDS_DRAFT_EDITOR} → {@link BuilderCapability#REPLACE_FORM_DEFINITION_DRAFT}
 *   <li>{@code FDS_VERSION_READER} → {@link BuilderCapability#LIST_FORM_DEFINITION_VERSIONS}
 *   <li>{@code FDS_DRAFT_CLONER} → {@link BuilderCapability#CLONE_FORM_DEFINITION_DRAFT}
 *   <li>{@code FDS_FORM_SUBMITTER} → {@link BuilderCapability#SUBMIT_FORM_DEFINITION}
 * </ul>
 *
 * <p>No role implies another. Approve does not imply publish. Do not log roles, claims, or
 * capabilities.
 */
public final class KeycloakRealmAccessRoleMapper {

    public static final String ROLE_READER = "FDS_GOVERNANCE_READER";
    public static final String ROLE_APPROVER = "FDS_FORM_APPROVER";
    public static final String ROLE_PUBLISHER = "FDS_FORM_PUBLISHER";

    public static final String ROLE_DEFINITION_VALIDATOR = "FDS_DEFINITION_VALIDATOR";
    public static final String ROLE_DRAFT_CREATOR = "FDS_DRAFT_CREATOR";
    public static final String ROLE_DEFINITION_READER = "FDS_DEFINITION_READER";
    public static final String ROLE_DRAFT_EDITOR = "FDS_DRAFT_EDITOR";
    public static final String ROLE_VERSION_READER = "FDS_VERSION_READER";
    public static final String ROLE_DRAFT_CLONER = "FDS_DRAFT_CLONER";
    public static final String ROLE_FORM_SUBMITTER = "FDS_FORM_SUBMITTER";

    private KeycloakRealmAccessRoleMapper() {}

    /**
     * @return admitted governance capabilities; empty when roles missing/malformed. Never throws
     *     on malformed structures.
     */
    public static Set<GovernanceCapability> mapCapabilities(Jwt jwt) {
        EnumSet<GovernanceCapability> capabilities = EnumSet.noneOf(GovernanceCapability.class);
        for (String roleName : roleNames(jwt)) {
            switch (roleName) {
                case ROLE_READER ->
                        capabilities.add(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);
                case ROLE_APPROVER -> capabilities.add(GovernanceCapability.APPROVE_FORM_DEFINITION);
                case ROLE_PUBLISHER -> capabilities.add(GovernanceCapability.PUBLISH_FORM_DEFINITION);
                default -> {
                    /* ignore Builder / unknown / UI roles */
                }
            }
        }
        return capabilities;
    }

    /**
     * @return admitted Builder capabilities; empty when roles missing/malformed. Never throws on
     *     malformed structures. Does not include governance capabilities.
     */
    public static Set<BuilderCapability> mapBuilderCapabilities(Jwt jwt) {
        EnumSet<BuilderCapability> capabilities = EnumSet.noneOf(BuilderCapability.class);
        for (String roleName : roleNames(jwt)) {
            switch (roleName) {
                case ROLE_DEFINITION_VALIDATOR ->
                        capabilities.add(BuilderCapability.VALIDATE_FORM_DEFINITION);
                case ROLE_DRAFT_CREATOR ->
                        capabilities.add(BuilderCapability.CREATE_FORM_DEFINITION_DRAFT);
                case ROLE_DEFINITION_READER ->
                        capabilities.add(BuilderCapability.READ_FORM_DEFINITION_COORDINATE);
                case ROLE_DRAFT_EDITOR ->
                        capabilities.add(BuilderCapability.REPLACE_FORM_DEFINITION_DRAFT);
                case ROLE_VERSION_READER ->
                        capabilities.add(BuilderCapability.LIST_FORM_DEFINITION_VERSIONS);
                case ROLE_DRAFT_CLONER ->
                        capabilities.add(BuilderCapability.CLONE_FORM_DEFINITION_DRAFT);
                case ROLE_FORM_SUBMITTER ->
                        capabilities.add(BuilderCapability.SUBMIT_FORM_DEFINITION);
                default -> {
                    /* ignore governance / unknown / UI roles */
                }
            }
        }
        return capabilities;
    }

    /** Visible for tests — duplicate roles are harmless. */
    static Set<GovernanceCapability> mapRoleNames(List<String> roleNames) {
        EnumSet<GovernanceCapability> capabilities = EnumSet.noneOf(GovernanceCapability.class);
        if (roleNames == null) {
            return capabilities;
        }
        for (String roleName : roleNames) {
            if (ROLE_READER.equals(roleName)) {
                capabilities.add(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);
            } else if (ROLE_APPROVER.equals(roleName)) {
                capabilities.add(GovernanceCapability.APPROVE_FORM_DEFINITION);
            } else if (ROLE_PUBLISHER.equals(roleName)) {
                capabilities.add(GovernanceCapability.PUBLISH_FORM_DEFINITION);
            }
        }
        return capabilities;
    }

    /** Visible for tests — Builder role name mapping. */
    static Set<BuilderCapability> mapBuilderRoleNames(List<String> roleNames) {
        EnumSet<BuilderCapability> capabilities = EnumSet.noneOf(BuilderCapability.class);
        if (roleNames == null) {
            return capabilities;
        }
        for (String roleName : roleNames) {
            if (ROLE_DEFINITION_VALIDATOR.equals(roleName)) {
                capabilities.add(BuilderCapability.VALIDATE_FORM_DEFINITION);
            } else if (ROLE_DRAFT_CREATOR.equals(roleName)) {
                capabilities.add(BuilderCapability.CREATE_FORM_DEFINITION_DRAFT);
            } else if (ROLE_DEFINITION_READER.equals(roleName)) {
                capabilities.add(BuilderCapability.READ_FORM_DEFINITION_COORDINATE);
            } else if (ROLE_DRAFT_EDITOR.equals(roleName)) {
                capabilities.add(BuilderCapability.REPLACE_FORM_DEFINITION_DRAFT);
            } else if (ROLE_VERSION_READER.equals(roleName)) {
                capabilities.add(BuilderCapability.LIST_FORM_DEFINITION_VERSIONS);
            } else if (ROLE_DRAFT_CLONER.equals(roleName)) {
                capabilities.add(BuilderCapability.CLONE_FORM_DEFINITION_DRAFT);
            } else if (ROLE_FORM_SUBMITTER.equals(roleName)) {
                capabilities.add(BuilderCapability.SUBMIT_FORM_DEFINITION);
            }
        }
        return capabilities;
    }

    private static List<String> roleNames(Jwt jwt) {
        if (jwt == null) {
            return List.of();
        }
        Object realmAccess = jwt.getClaim("realm_access");
        if (!(realmAccess instanceof Map<?, ?> map)) {
            return List.of();
        }
        Object rolesObj = map.get("roles");
        if (!(rolesObj instanceof Collection<?> roles)) {
            return List.of();
        }
        List<String> names = new java.util.ArrayList<>();
        for (Object role : roles) {
            if (role instanceof String roleName) {
                names.add(roleName);
            }
        }
        return names;
    }
}
