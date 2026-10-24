package org.magicsword.formdefinition.validation.fieldpath;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pure unit tests for {@link FieldPathEscaper} — the server-side mirror of the FB-B3/B3.1
 * definition field-path escaping rules. No Spring context, no I/O.
 */
class FieldPathEscaperTest {

    @Test
    void escapeSegmentLeavesPlainNamesUnchanged() {
        assertThat(FieldPathEscaper.escapeSegment("member_name")).isEqualTo("member_name");
        assertThat(FieldPathEscaper.escapeSegment("")).isEqualTo("");
    }

    @Test
    void escapeSegmentEscapesDot() {
        assertThat(FieldPathEscaper.escapeSegment("emergency.contact")).isEqualTo("emergency\\.contact");
    }

    @Test
    void escapeSegmentEscapesBrackets() {
        assertThat(FieldPathEscaper.escapeSegment("a[0]")).isEqualTo("a\\[0\\]");
    }

    @Test
    void escapeSegmentEscapesBackslash() {
        assertThat(FieldPathEscaper.escapeSegment("a\\b")).isEqualTo("a\\\\b");
    }

    @Test
    void escapeSegmentEscapesEveryReservedCharacterInOnePass() {
        // Reserved characters: backslash, dot, and both brackets.
        assertThat(FieldPathEscaper.escapeSegment("a.b[c]\\d"))
                .isEqualTo("a\\.b\\[c\\]\\\\d");
    }

    @Test
    void joinWithBlankPrefixReturnsSegmentUnchanged() {
        assertThat(FieldPathEscaper.join(null, "segment")).isEqualTo("segment");
        assertThat(FieldPathEscaper.join("", "segment")).isEqualTo("segment");
    }

    @Test
    void joinWithNonblankPrefixInsertsADot() {
        assertThat(FieldPathEscaper.join("family_members[]", "member_name"))
                .isEqualTo("family_members[].member_name");
    }

    @Test
    void rootFieldIdIsTheExactPropertyNameWithNoEscaping() {
        // Root-level property IDs are never escaped, even if they contain reserved characters —
        // only nested segments underneath a repeater are escaped.
        assertThat(FieldPathEscaper.rootFieldId("applicant_name")).isEqualTo("applicant_name");
        assertThat(FieldPathEscaper.rootFieldId("a.b")).isEqualTo("a.b");
    }

    @Test
    void nestedUnderRepeaterEscapesOnlyTheChildSegment() {
        assertThat(FieldPathEscaper.nestedUnderRepeater("family_members[]", "member_name"))
                .isEqualTo("family_members[].member_name");
        assertThat(FieldPathEscaper.nestedUnderRepeater("family_members[]", "emergency.contact"))
                .isEqualTo("family_members[].emergency\\.contact");
    }

    @Test
    void repeaterTemplatePathAppendsBracketsToTheRawSegmentWhenNotNested() {
        assertThat(FieldPathEscaper.repeaterTemplatePath(null, "family_members", false))
                .isEqualTo("family_members[]");
        assertThat(FieldPathEscaper.repeaterTemplatePath("parent", "family_members", false))
                .isEqualTo("parent.family_members[]");
    }

    @Test
    void repeaterTemplatePathEscapesTheSegmentBeforeAppendingBracketsWhenNested() {
        assertThat(FieldPathEscaper.repeaterTemplatePath("family_members[]", "emergency.contact", true))
                .isEqualTo("family_members[].emergency\\.contact[]");
    }
}
