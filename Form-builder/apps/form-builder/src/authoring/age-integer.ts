/**
 * Parse a nonnegative safe-integer draft string for DOB ages (FB-D5).
 * Accepts only canonical forms: `0` or `[1-9][0-9]*` within Number.isSafeInteger.
 * Rejects blank (caller treats blank as absent), padded, signed, decimal,
 * exponent, leading zeros, and unsafe magnitudes. Never trims or coerces.
 */
export function parseNonnegativeSafeIntegerString(
  raw: string,
): { readonly ok: true; readonly value: number } | { readonly ok: false } {
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (raw.length === 0) {
    return { ok: false }
  }
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    return { ok: false }
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) {
    return { ok: false }
  }
  return { ok: true, value }
}

/**
 * Optional age draft: empty string means absent (ok with undefined).
 * Nonempty must be a canonical nonnegative safe integer.
 */
export function parseOptionalNonnegativeSafeIntegerString(
  raw: string,
): { readonly ok: true; readonly value: number | undefined } | { readonly ok: false } {
  if (typeof raw !== 'string') {
    return { ok: false }
  }
  if (raw.length === 0) {
    return { ok: true, value: undefined }
  }
  const parsed = parseNonnegativeSafeIntegerString(raw)
  if (!parsed.ok) {
    return { ok: false }
  }
  return { ok: true, value: parsed.value }
}
