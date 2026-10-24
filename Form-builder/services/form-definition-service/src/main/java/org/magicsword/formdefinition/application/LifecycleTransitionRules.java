package org.magicsword.formdefinition.application;

import org.magicsword.formdefinition.domain.FormDefinitionStatus;

/**
 * Allowed forward-only Form Definition lifecycle transitions (FB-C4 technical state machine).
 */
public final class LifecycleTransitionRules {

    private LifecycleTransitionRules() {}

    public static boolean isAllowed(FormDefinitionStatus from, FormDefinitionStatus to) {
        if (from == null || to == null) {
            return false;
        }
        return switch (from) {
            case draft -> to == FormDefinitionStatus.submitted;
            case submitted -> to == FormDefinitionStatus.approved;
            case approved -> to == FormDefinitionStatus.published;
            case published -> to == FormDefinitionStatus.retired;
            case retired -> false;
        };
    }

    public static boolean isCloneableSource(FormDefinitionStatus status) {
        return status == FormDefinitionStatus.published || status == FormDefinitionStatus.retired;
    }
}
