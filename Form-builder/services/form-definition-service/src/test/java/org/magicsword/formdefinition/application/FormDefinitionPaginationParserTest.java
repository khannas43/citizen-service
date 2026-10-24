package org.magicsword.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * FB-C5 pure unit tests for {@link FormDefinitionPaginationParser}: default/omitted values,
 * the maximum limit boundary, and strict canonical-decimal admission for both
 * {@code afterVersion} and {@code limit}.
 */
class FormDefinitionPaginationParserTest {

    // ---------------------------------------------------------------- afterVersion

    @Test
    void omittedAfterVersionDefaultsToZero() {
        assertThat(FormDefinitionPaginationParser.parseAfterVersion(null)).isZero();
    }

    @Test
    void canonicalAfterVersionParsesExactly() {
        assertThat(FormDefinitionPaginationParser.parseAfterVersion("1")).isEqualTo(1);
        assertThat(FormDefinitionPaginationParser.parseAfterVersion("42")).isEqualTo(42);
        assertThat(FormDefinitionPaginationParser.parseAfterVersion(String.valueOf(Integer.MAX_VALUE)))
                .isEqualTo(Integer.MAX_VALUE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"01", "007", "+1", "-1", " 1", "1 ", " 1 ", "1.0", "1.5", "1e1", "1E1", "0", "", "   "})
    void invalidAfterVersionRejected(String raw) {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseAfterVersion(raw))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @Test
    void nonNumericAfterVersionRejected() {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseAfterVersion("abc"))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @Test
    void overflowingAfterVersionRejected() {
        assertThatThrownBy(
                        () ->
                                FormDefinitionPaginationParser.parseAfterVersion(
                                        "99999999999999999999999999"))
                .isInstanceOf(InvalidPaginationException.class);
    }

    // ---------------------------------------------------------------- limit

    @Test
    void omittedLimitDefaultsTo50() {
        assertThat(FormDefinitionPaginationParser.parseLimit(null))
                .isEqualTo(FormDefinitionPaginationParser.DEFAULT_LIMIT)
                .isEqualTo(50);
    }

    @Test
    void limitAtMaxBoundaryAccepted() {
        assertThat(FormDefinitionPaginationParser.parseLimit("100"))
                .isEqualTo(FormDefinitionPaginationParser.MAX_LIMIT)
                .isEqualTo(100);
    }

    @Test
    void limitAtMinBoundaryAccepted() {
        assertThat(FormDefinitionPaginationParser.parseLimit("1")).isEqualTo(1);
    }

    @Test
    void limitAboveMaxRejected() {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseLimit("101"))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @Test
    void limitZeroRejected() {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseLimit("0"))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"01", "007", "+50", "-50", " 50", "50 ", " 50 ", "50.0", "50.5", "5e1", "5E1", "", "   "})
    void invalidLimitTextRejected(String raw) {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseLimit(raw))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @ParameterizedTest
    @MethodSource("boundaryLimits")
    void limitsOutsideRangeRejectedEvenWhenCanonicalDecimal(String raw) {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseLimit(raw))
                .isInstanceOf(InvalidPaginationException.class);
    }

    static Stream<String> boundaryLimits() {
        return Stream.of("101", "999", String.valueOf(Integer.MAX_VALUE));
    }

    @Test
    void nonNumericLimitRejected() {
        assertThatThrownBy(() -> FormDefinitionPaginationParser.parseLimit("fifty"))
                .isInstanceOf(InvalidPaginationException.class);
    }
}
