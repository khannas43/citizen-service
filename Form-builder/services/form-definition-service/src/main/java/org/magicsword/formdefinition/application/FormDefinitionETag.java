package org.magicsword.formdefinition.application;

import java.nio.ByteBuffer;
import java.util.Base64;

/**
 * Strong opaque ETag encoding for Form Definition revisions (FB-C3 / C4).
 *
 * <p>Tokens are quoted strong validators. Parsing accepts only the exact unpadded Base64URL
 * encoding produced by {@link #format(long)} (decode → re-encode equality). Negative revisions
 * are rejected. Clients must treat tokens as opaque.
 */
public final class FormDefinitionETag {

    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private FormDefinitionETag() {}

    /** Format a strong ETag header value (including surrounding quotes). */
    public static String format(long revision) {
        if (revision < 0) {
            throw new IllegalArgumentException("revision must be non-negative");
        }
        return "\"" + encodeOpaque(revision) + "\"";
    }

    /**
     * Parse a single strong If-Match token into the internal revision.
     *
     * @throws IfMatchRequiredException when {@code ifMatch} is null
     * @throws InvalidIfMatchException when the token is weak, wildcard, multiple, padded,
     *     non-canonical, negative, or otherwise malformed
     */
    public static long parseIfMatch(String ifMatch) {
        if (ifMatch == null) {
            throw new IfMatchRequiredException();
        }
        if (!ifMatch.equals(ifMatch.trim()) || ifMatch.isEmpty()) {
            throw new InvalidIfMatchException();
        }
        if (ifMatch.regionMatches(true, 0, "W/", 0, 2)) {
            throw new InvalidIfMatchException();
        }
        if ("*".equals(ifMatch)) {
            throw new InvalidIfMatchException();
        }
        if (ifMatch.indexOf(',') >= 0) {
            throw new InvalidIfMatchException();
        }
        if (ifMatch.length() < 2
                || ifMatch.charAt(0) != '"'
                || ifMatch.charAt(ifMatch.length() - 1) != '"') {
            throw new InvalidIfMatchException();
        }
        String opaque = ifMatch.substring(1, ifMatch.length() - 1);
        if (opaque.isEmpty() || opaque.indexOf('"') >= 0 || opaque.indexOf('=') >= 0) {
            throw new InvalidIfMatchException();
        }
        try {
            byte[] decoded = DECODER.decode(opaque);
            if (decoded.length != 8) {
                throw new InvalidIfMatchException();
            }
            String canonical = ENCODER.encodeToString(decoded);
            if (!opaque.equals(canonical)) {
                throw new InvalidIfMatchException();
            }
            long revision = ByteBuffer.wrap(decoded).getLong();
            if (revision < 0) {
                throw new InvalidIfMatchException();
            }
            return revision;
        } catch (IllegalArgumentException ex) {
            throw new InvalidIfMatchException();
        }
    }

    private static String encodeOpaque(long revision) {
        byte[] bytes = ByteBuffer.allocate(8).putLong(revision).array();
        return ENCODER.encodeToString(bytes);
    }
}
