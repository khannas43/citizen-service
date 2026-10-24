package org.magicsword.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * FB-C4 pure unit tests for {@link ActorIdAdmission}: blank/pad/overflow/null/valid matrix for the
 * provisional {@code actorId} / {@code createdBy} assertion.
 */
class ActorIdAdmissionTest {

    @Test
    void nullActorIdThrowsInvalidActor() {
        assertThatThrownBy(() -> ActorIdAdmission.admit(null)).isInstanceOf(InvalidActorException.class);
    }

    @Test
    void emptyStringThrowsInvalidActor() {
        assertThatThrownBy(() -> ActorIdAdmission.admit("")).isInstanceOf(InvalidActorException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {" ", "\t", "\n", "   "})
    void blankOrWhitespaceOnlyThrowsInvalidActor(String blank) {
        assertThatThrownBy(() -> ActorIdAdmission.admit(blank)).isInstanceOf(InvalidActorException.class);
    }

    @Test
    void nonBreakingSpaceIsNotTreatedAsBlankOrTrimmableAndIsAdmitted() {
        // java.lang.String#trim() and #isBlank() intentionally exclude U+00A0 (non-breaking
        // space) from the ASCII/whitespace ranges they strip, so a lone NBSP is neither blank
        // nor "padded" by ActorIdAdmission's definition and is accepted as-is.
        String nbsp = "\u00A0";
        assertThat(ActorIdAdmission.admit(nbsp)).isEqualTo(nbsp);
    }

    @ParameterizedTest
    @ValueSource(strings = {" alice", "alice ", " alice ", "\talice", "alice\n"})
    void leadingOrTrailingWhitespacePaddingThrowsInvalidActor(String padded) {
        assertThatThrownBy(() -> ActorIdAdmission.admit(padded)).isInstanceOf(InvalidActorException.class);
    }

    @Test
    void exactlyMaxCodePointsIsAccepted() {
        String maxLength = "a".repeat(ActorIdAdmission.MAX_CODE_POINTS);
        assertThat(ActorIdAdmission.admit(maxLength)).isEqualTo(maxLength);
    }

    @Test
    void overflowingMaxCodePointsByOneThrowsInvalidActor() {
        String overflow = "a".repeat(ActorIdAdmission.MAX_CODE_POINTS + 1);
        assertThatThrownBy(() -> ActorIdAdmission.admit(overflow)).isInstanceOf(InvalidActorException.class);
    }

    @Test
    void overflowCountsUnicodeCodePointsNotUtf16Chars() {
        // Each surrogate-pair emoji is one code point but two UTF-16 chars; 256 of them must be
        // accepted (256 code points), and 257 must be rejected.
        String emoji = "\uD83D\uDE00"; // 😀, one code point, two chars
        String atLimit = emoji.repeat(ActorIdAdmission.MAX_CODE_POINTS);
        assertThat(atLimit.codePointCount(0, atLimit.length())).isEqualTo(ActorIdAdmission.MAX_CODE_POINTS);
        assertThat(ActorIdAdmission.admit(atLimit)).isEqualTo(atLimit);

        String overLimit = emoji.repeat(ActorIdAdmission.MAX_CODE_POINTS + 1);
        assertThatThrownBy(() -> ActorIdAdmission.admit(overLimit)).isInstanceOf(InvalidActorException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"alice", "svc-account", "user@example.gov.in", "a", "actor.with.dots-and_underscores"})
    void validNonBlankUnpaddedWithinLimitIsAdmittedUnchanged(String actorId) {
        assertThat(ActorIdAdmission.admit(actorId)).isEqualTo(actorId);
    }

    @Test
    void internalWhitespaceIsPreservedAndAccepted() {
        String actorId = "alice smith";
        assertThat(ActorIdAdmission.admit(actorId)).isEqualTo(actorId);
    }
}
