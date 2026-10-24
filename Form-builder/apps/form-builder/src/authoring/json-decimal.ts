/**
 * Strict finite JSON-decimal lexical admission (FB-D2.1).
 *
 * Accepts: 0, -1, 0.5, 10.25, 1e3, -2.5E-2
 * Rejects: 0x10, 0b10, 1_000, NaN, Infinity, padded, partial/non-numeric
 */
const JSON_DECIMAL_LEXEME = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

export type OptionalJsonDecimalParse =
  { readonly ok: true; readonly value: number | undefined } | { readonly ok: false }

/**
 * Parse an optional constraint string. Empty string → undefined (constraint absent).
 * Non-empty must match the strict JSON-decimal grammar and be finite.
 */
export function parseOptionalJsonDecimal(raw: string): OptionalJsonDecimalParse {
  if (raw === '') {
    return { ok: true, value: undefined }
  }
  if (raw !== raw.trim()) {
    return { ok: false }
  }
  if (!JSON_DECIMAL_LEXEME.test(raw)) {
    return { ok: false }
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return { ok: false }
  }
  return { ok: true, value }
}

/** Require a present finite JSON decimal (non-empty). */
export function parseRequiredJsonDecimal(raw: string): { ok: true; value: number } | { ok: false } {
  const parsed = parseOptionalJsonDecimal(raw)
  if (!parsed.ok || parsed.value === undefined) {
    return { ok: false }
  }
  return { ok: true, value: parsed.value }
}
