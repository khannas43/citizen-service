package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * FB-C2 pure unit tests for {@link FormDefinitionQueryCoordinateParser#parseVersionQuery(String)}.
 */
class FormDefinitionQueryCoordinateParserTest {

    @ParameterizedTest
    @ValueSource(strings = {"1", "42"})
    void acceptsCanonicalPositiveDecimalIntegers(String versionText) {
        assertThat(FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText))
                .isEqualTo(Integer.parseInt(versionText));
    }

    @Test
    void rejectsNull() {
        assertThatThrownBy(() -> FormDefinitionQueryCoordinateParser.parseVersionQuery(null))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "0", "01", "+1", "-1", "1.0", "1e2", "1 ", " 1"})
    void rejectsNonCanonicalText(String versionText) {
        assertThatThrownBy(() -> FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"99999999999999999999", "2147483648"}) // Integer.MAX_VALUE + 1 and beyond
    void rejectsOverflowBeyondIntRange(String versionText) {
        assertThatThrownBy(() -> FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void acceptsIntegerMaxValueExactly() {
        assertThat(FormDefinitionQueryCoordinateParser.parseVersionQuery(String.valueOf(Integer.MAX_VALUE)))
                .isEqualTo(Integer.MAX_VALUE);
    }
}
