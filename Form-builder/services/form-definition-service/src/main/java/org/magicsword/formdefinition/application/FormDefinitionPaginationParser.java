package org.magicsword.formdefinition.application;

/**
 * Strict pagination admission for version listing (FB-C5).
 *
 * <p>{@code afterVersion} when present and {@code limit} must be canonical positive decimals
 * {@code [1-9][0-9]*} — no signs, whitespace, decimals, exponent, or leading zeroes. {@code limit}
 * defaults to 50 and must be in 1..100.
 */
public final class FormDefinitionPaginationParser {

    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 100;

    private static final String POSITIVE_DECIMAL = "[1-9][0-9]*";

    private FormDefinitionPaginationParser() {}

    /**
     * @return exclusive lower bound; {@code 0} means start before the first version (omitted cursor)
     */
    public static int parseAfterVersion(String afterVersionText) {
        if (afterVersionText == null) {
            return 0;
        }
        return parsePositiveDecimal(afterVersionText, "afterVersion");
    }

    public static int parseLimit(String limitText) {
        if (limitText == null) {
            return DEFAULT_LIMIT;
        }
        int limit = parsePositiveDecimal(limitText, "limit");
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new InvalidPaginationException("limit must be between 1 and " + MAX_LIMIT);
        }
        return limit;
    }

    private static int parsePositiveDecimal(String text, String name) {
        if (text.isEmpty() || text.isBlank()) {
            throw new InvalidPaginationException(name + " must be nonblank when provided");
        }
        if (!text.equals(text.trim())) {
            throw new InvalidPaginationException(name + " must not have leading or trailing whitespace");
        }
        if (!text.matches(POSITIVE_DECIMAL)) {
            throw new InvalidPaginationException(name + " must be a canonical positive decimal integer");
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException ex) {
            throw new InvalidPaginationException(name + " overflows integer range");
        }
    }
}
