package org.magicsword.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * FB-C3 pure unit tests for {@link FormDefinitionETag}: strong opaque ETag formatting and strict
 * If-Match parsing.
 */
class FormDefinitionETagTest {

    // ---------------------------------------------------------------- format/parse roundtrip

    @Test
    void formatProducesQuotedOpaqueTokenAndParseRoundTripsToSameRevision() {
        long revision = 42L;
        String etag = FormDefinitionETag.format(revision);

        assertThat(etag).startsWith("\"").endsWith("\"");
        assertThat(etag.length()).isGreaterThan(2);

        long parsed = FormDefinitionETag.parseIfMatch(etag);
        assertThat(parsed).isEqualTo(revision);
    }

    @Test
    void roundTripHoldsForNonNegativeRevisions() {
        long[] revisions = {0L, 1L, 42L, Long.MAX_VALUE, 123456789L};
        for (long revision : revisions) {
            String etag = FormDefinitionETag.format(revision);
            assertThat(FormDefinitionETag.parseIfMatch(etag)).isEqualTo(revision);
        }
    }

    @Test
    void formatRejectsNegativeRevision() {
        assertThatThrownBy(() -> FormDefinitionETag.format(-1L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void paddedBase64UrlTokenIsRejected() {
        String opaque = FormDefinitionETag.format(1L);
        String inner = opaque.substring(1, opaque.length() - 1);
        // Force '=' padding (non-canonical for our withoutPadding encoder).
        String padded = "\"" + inner + "===\"";
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(padded))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void nonCanonicalAlternativeEncodingIsRejected() {
        // Decode a valid token, then inject a non-canonical Base64URL variant if possible.
        // Using a token with URL-safe alphabet substituted incorrectly should fail re-encode equality.
        String valid = FormDefinitionETag.format(7L);
        String inner = valid.substring(1, valid.length() - 1);
        // Upper/lower variants that decode equivalently are rare for our 8-byte payloads; instead
        // prepend a character that still base64-decodes after strip — simplest: duplicate last char
        // in a way that changes length → rejected by length check, or use padded stripped form.
        if (!inner.isEmpty()) {
            // RFC4648 alphabet alternate: replace nothing if empty; use standard base64 (+/) if present
            String alt = inner.replace('-', '+').replace('_', '/');
            if (!alt.equals(inner)) {
                assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"" + alt + "\""))
                        .isInstanceOf(InvalidIfMatchException.class);
            }
        }
        // Always assert padded canonical-looking token with '=' is rejected (already covered) and
        // a manually crafted 8-byte encoding that re-encodes differently:
        byte[] raw = new byte[] {0, 0, 0, 0, 0, 0, 0, 1};
        String withPad = java.util.Base64.getUrlEncoder().encodeToString(raw); // includes padding
        assertThat(withPad).contains("=");
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"" + withPad + "\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void negativeDecodedRevisionIsRejected() {
        byte[] bytes = java.nio.ByteBuffer.allocate(8).putLong(-5L).array();
        String opaque = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"" + opaque + "\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void snapshotDefinitionAccessorReturnsDefensiveDeepCopy() {
        com.fasterxml.jackson.databind.node.ObjectNode node =
                new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode().put("k", "v");
        FormDefinitionSnapshot snapshot =
                new FormDefinitionSnapshot(
                        node,
                        1L,
                        org.magicsword.formdefinition.domain.FormDefinitionStatus.draft,
                        java.time.Instant.parse("2026-01-01T00:00:00Z"));
        com.fasterxml.jackson.databind.JsonNode first = snapshot.definition();
        com.fasterxml.jackson.databind.JsonNode second = snapshot.definition();
        assertThat(first).isEqualTo(second);
        assertThat(first).isNotSameAs(second);
        ((com.fasterxml.jackson.databind.node.ObjectNode) first).put("k", "mutated");
        assertThat(snapshot.definition().get("k").asText()).isEqualTo("v");
    }

    @Test
    void formatNeverExposesRawRevisionDigitsInToken() {
        // The opaque token must not simply be the decimal string of the revision — it is
        // base64url encoded 8-byte big-endian, so for small values it won't look like the number.
        String etag = FormDefinitionETag.format(7L);
        assertThat(etag).doesNotContain("\"7\"");
    }

    // ---------------------------------------------------------------- IfMatchRequiredException

    @Test
    void nullIfMatchThrowsIfMatchRequired() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(null))
                .isInstanceOf(IfMatchRequiredException.class);
    }

    // ---------------------------------------------------------------- InvalidIfMatchException

    @Test
    void weakValidatorIsRejected() {
        String weak = "W/\"" + opaqueFor(1L) + "\"";
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(weak))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void weakValidatorLowercasePrefixIsAlsoRejected() {
        String weak = "w/\"" + opaqueFor(1L) + "\"";
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(weak))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void wildcardIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("*"))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void multipleCommaSeparatedTokensAreRejected() {
        String multi = "\"" + opaqueFor(1L) + "\", \"" + opaqueFor(2L) + "\"";
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(multi))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void leadingOrTrailingWhitespacePaddingIsRejected() {
        String padded = " \"" + opaqueFor(1L) + "\" ";
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(padded))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void unquotedTokenIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(opaqueFor(1L)))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void emptyOpaqueBodyIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void garbageOpaqueBodyIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"not-valid-base64url!!!\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void emptyStringIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void singleQuoteCharacterIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @Test
    void embeddedQuoteInOpaqueBodyIsRejected() {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch("\"a\"b\""))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"short\"", "\"" + "AAAAAAAAAAAAAAAAAAAA" + "\""})
    void wrongDecodedByteLengthIsRejected(String token) {
        assertThatThrownBy(() -> FormDefinitionETag.parseIfMatch(token))
                .isInstanceOf(InvalidIfMatchException.class);
    }

    private static String opaqueFor(long revision) {
        String formatted = FormDefinitionETag.format(revision);
        return formatted.substring(1, formatted.length() - 1);
    }
}
