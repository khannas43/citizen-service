package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.citizen.formdefinition.domain.FormDefinitionStatus;

/**
 * FB-C4 pure unit tests for {@link LifecycleTransitionRules}: exhaustive allowed/disallowed
 * transition matrix and cloneable-source predicate.
 */
class LifecycleTransitionRulesTest {

    private static final Set<Pair> ALLOWED =
            Set.of(
                    new Pair(FormDefinitionStatus.draft, FormDefinitionStatus.submitted),
                    new Pair(FormDefinitionStatus.submitted, FormDefinitionStatus.approved),
                    new Pair(FormDefinitionStatus.approved, FormDefinitionStatus.published),
                    new Pair(FormDefinitionStatus.published, FormDefinitionStatus.retired));

    private record Pair(FormDefinitionStatus from, FormDefinitionStatus to) {}

    @Test
    void exactlyFourTransitionsAreAllowedAcrossTheFullMatrix() {
        int allowedCount = 0;
        for (FormDefinitionStatus from : FormDefinitionStatus.values()) {
            for (FormDefinitionStatus to : FormDefinitionStatus.values()) {
                if (LifecycleTransitionRules.isAllowed(from, to)) {
                    allowedCount++;
                    assertThat(ALLOWED).contains(new Pair(from, to));
                }
            }
        }
        assertThat(allowedCount).isEqualTo(ALLOWED.size());
    }

    @ParameterizedTest
    @EnumSource(FormDefinitionStatus.class)
    void everyStatusPermitsAtMostTheSingleForwardStepAndNoSelfTransition(FormDefinitionStatus from) {
        for (FormDefinitionStatus to : FormDefinitionStatus.values()) {
            boolean expected = ALLOWED.contains(new Pair(from, to));
            assertThat(LifecycleTransitionRules.isAllowed(from, to))
                    .as("isAllowed(%s, %s)", from, to)
                    .isEqualTo(expected);
        }
        assertThat(LifecycleTransitionRules.isAllowed(from, from)).isFalse();
    }

    @Test
    void draftToSubmittedIsAllowed() {
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.draft, FormDefinitionStatus.submitted))
                .isTrue();
    }

    @Test
    void submittedToApprovedIsAllowed() {
        assertThat(
                        LifecycleTransitionRules.isAllowed(
                                FormDefinitionStatus.submitted, FormDefinitionStatus.approved))
                .isTrue();
    }

    @Test
    void approvedToPublishedIsAllowed() {
        assertThat(
                        LifecycleTransitionRules.isAllowed(
                                FormDefinitionStatus.approved, FormDefinitionStatus.published))
                .isTrue();
    }

    @Test
    void publishedToRetiredIsAllowed() {
        assertThat(
                        LifecycleTransitionRules.isAllowed(
                                FormDefinitionStatus.published, FormDefinitionStatus.retired))
                .isTrue();
    }

    @Test
    void retiredHasNoAllowedOutgoingTransition() {
        for (FormDefinitionStatus to : FormDefinitionStatus.values()) {
            assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.retired, to)).isFalse();
        }
    }

    @Test
    void skippingAStageIsRejected() {
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.draft, FormDefinitionStatus.approved))
                .isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.draft, FormDefinitionStatus.published))
                .isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.draft, FormDefinitionStatus.retired))
                .isFalse();
        assertThat(
                        LifecycleTransitionRules.isAllowed(
                                FormDefinitionStatus.submitted, FormDefinitionStatus.published))
                .isFalse();
        assertThat(
                        LifecycleTransitionRules.isAllowed(FormDefinitionStatus.submitted, FormDefinitionStatus.retired))
                .isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.approved, FormDefinitionStatus.retired))
                .isFalse();
    }

    @Test
    void reversingAStageIsRejected() {
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.submitted, FormDefinitionStatus.draft))
                .isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.approved, FormDefinitionStatus.submitted))
                .isFalse();
        assertThat(
                        LifecycleTransitionRules.isAllowed(
                                FormDefinitionStatus.published, FormDefinitionStatus.approved))
                .isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.retired, FormDefinitionStatus.published))
                .isFalse();
    }

    @Test
    void repeatingTheSameStatusIsRejected() {
        for (FormDefinitionStatus status : FormDefinitionStatus.values()) {
            assertThat(LifecycleTransitionRules.isAllowed(status, status)).isFalse();
        }
    }

    @Test
    void nullFromOrToIsRejected() {
        assertThat(LifecycleTransitionRules.isAllowed(null, FormDefinitionStatus.submitted)).isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(FormDefinitionStatus.draft, null)).isFalse();
        assertThat(LifecycleTransitionRules.isAllowed(null, null)).isFalse();
    }

    // ---------------------------------------------------------------- isCloneableSource

    @Test
    void publishedAndRetiredAreCloneableSources() {
        assertThat(LifecycleTransitionRules.isCloneableSource(FormDefinitionStatus.published)).isTrue();
        assertThat(LifecycleTransitionRules.isCloneableSource(FormDefinitionStatus.retired)).isTrue();
    }

    @Test
    void draftSubmittedApprovedAreNotCloneableSources() {
        assertThat(LifecycleTransitionRules.isCloneableSource(FormDefinitionStatus.draft)).isFalse();
        assertThat(LifecycleTransitionRules.isCloneableSource(FormDefinitionStatus.submitted)).isFalse();
        assertThat(LifecycleTransitionRules.isCloneableSource(FormDefinitionStatus.approved)).isFalse();
    }

    @Test
    void nullStatusIsNotCloneable() {
        assertThat(LifecycleTransitionRules.isCloneableSource(null)).isFalse();
    }

    @Test
    void everyStatusIsCoveredByEitherCloneableOrNotCloneableExactlyOnce() {
        EnumSet<FormDefinitionStatus> cloneable = EnumSet.noneOf(FormDefinitionStatus.class);
        for (FormDefinitionStatus status : FormDefinitionStatus.values()) {
            if (LifecycleTransitionRules.isCloneableSource(status)) {
                cloneable.add(status);
            }
        }
        assertThat(cloneable).containsExactlyInAnyOrder(FormDefinitionStatus.published, FormDefinitionStatus.retired);
    }
}
