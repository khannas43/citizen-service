package org.citizen.formdefinition.validation;

/** Hard limits for pure Form Definition validation (FB-C1). */
public final class ValidationLimits {

    public static final int MAX_ISSUES = 200;
    public static final int MAX_DEPTH = 64;
    public static final int MAX_NODES = 10_000;
    public static final int FAMILY_REPEATER_MAX_ITEMS_CAP = 20;

    /**
     * Hard cap (25 MiB) on {@code x-dg20.maxFileSizeBytes} for {@code doc-upload} widgets
     * (FB-D12).
     *
     * <p>Cross-package contract with Unit A {@code @citizen/form-widgets} {@code file-storage.ts}
     * {@code DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES} (also 25 MiB). Keep in sync — Unit C's structural
     * validation is a separate, authoritative enforcement point and must not silently drift from
     * Unit A's runtime policy ceiling.
     */
    public static final long DOC_UPLOAD_MAX_BYTES_CAP = 25L * 1024L * 1024L;

    /**
     * Provisional photo-capture MIME types (FB-D11 / FB-A5).
     *
     * <p>Cross-package contract with Unit A {@code @citizen/form-widgets} {@code file-storage.ts}
     * {@code PHOTO_CAPTURE_ALLOWED_MIME_TYPES}: JPEG ({@code image/jpeg}) and PNG
     * ({@code image/png}). Keep in sync; values are provisional pending product/security
     * confirmation.
     */
    public static final String[] PHOTO_CAPTURE_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png"};

    /**
     * Provisional photo-capture max bytes (5 MiB). Mirrors Unit A
     * {@code PHOTO_CAPTURE_MAX_BYTES} in {@code @citizen/form-widgets} {@code file-storage.ts}.
     */
    public static final long PHOTO_CAPTURE_MAX_BYTES = 5L * 1024L * 1024L;

    /**
     * Provisional photo-capture minimum pixel dimension. Mirrors Unit A
     * {@code PHOTO_CAPTURE_MIN_DIMENSION}.
     */
    public static final int PHOTO_CAPTURE_MIN_DIMENSION = 300;

    /**
     * Provisional photo-capture maximum pixel dimension. Mirrors Unit A
     * {@code PHOTO_CAPTURE_MAX_DIMENSION}.
     */
    public static final int PHOTO_CAPTURE_MAX_DIMENSION = 4096;

    /**
     * Provisional cap on {@code fee-field} {@code amountMinor} (FB-D13): {@code 2^53 - 1}, the
     * largest integer exactly representable by an IEEE-754 double.
     *
     * <p>Cross-package contract with Unit A {@code @citizen/form-widgets} {@code fee-field.ts}
     * {@code isValidFeeAmountMinor}, which bounds the same value against JavaScript's {@code
     * Number.MAX_SAFE_INTEGER}. Keep in sync — Unit C's structural validation is a separate,
     * authoritative enforcement point and must not silently drift from Unit A's runtime policy
     * ceiling. Provisional pending product/finance confirmation of a currency-specific ceiling.
     */
    public static final long FEE_AMOUNT_MINOR_MAX = 9_007_199_254_740_991L;

    private ValidationLimits() {}
}
