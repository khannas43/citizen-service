/**
 * Document Upload / DigiLocker draft policy parsing (FB-D12).
 * Never silently trims, deduplicates, or invents defaults.
 */

import { DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES } from '@dg20/form-widgets'

import { isExactMasterListId } from './master-list-schema-admission.js'

export { DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES }

export type MimeTypesTextParse =
  | { readonly ok: true; readonly allowedMimeTypes: readonly string[] }
  | {
      readonly ok: false
      readonly code: 'allowed_mime_types_invalid'
    }

/**
 * Parse one-MIME-per-line draft text.
 * - Ignores only the final empty line caused by a trailing newline
 * - Every admitted line must be nonblank and exactly unpadded
 * - Rejects duplicates (does not silently dedupe)
 * - Preserves order
 * - No comma-splitting or JSON input
 */
export function parseAllowedMimeTypesText(raw: string): MimeTypesTextParse {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'allowed_mime_types_invalid' }
  }

  let body = raw
  if (body.endsWith('\r\n')) {
    body = body.slice(0, -2)
  } else if (body.endsWith('\n')) {
    body = body.slice(0, -1)
  }

  if (body.length === 0) {
    return { ok: false, code: 'allowed_mime_types_invalid' }
  }

  const lines = body.split('\n')
  const admitted: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    // Preserve CR that is not part of a trailing CRLF strip (reject padded/hostile lines).
    if (line.length === 0 || line !== line.trim()) {
      return { ok: false, code: 'allowed_mime_types_invalid' }
    }
    if (seen.has(line)) {
      return { ok: false, code: 'allowed_mime_types_invalid' }
    }
    seen.add(line)
    admitted.push(line)
  }

  if (admitted.length === 0) {
    return { ok: false, code: 'allowed_mime_types_invalid' }
  }

  return { ok: true, allowedMimeTypes: admitted }
}

export type MaxFileSizeBytesParse =
  | { readonly ok: true; readonly maxFileSizeBytes: number }
  | { readonly ok: false; readonly code: 'max_file_size_bytes_invalid' }

/**
 * Canonical positive decimal safe integer ≤ DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES.
 * Rejects blank, padding, signs, fractions, exponent, hex, and separators.
 */
export function parseMaxFileSizeBytesDraft(raw: string): MaxFileSizeBytesParse {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'max_file_size_bytes_invalid' }
  }
  if (raw.length === 0 || raw !== raw.trim()) {
    return { ok: false, code: 'max_file_size_bytes_invalid' }
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return { ok: false, code: 'max_file_size_bytes_invalid' }
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0 || value > DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES) {
    return { ok: false, code: 'max_file_size_bytes_invalid' }
  }
  return { ok: true, maxFileSizeBytes: value }
}

/** Exact DigiLocker document type code: nonblank, unpadded, never HTTP-checked. */
export function isExactDigiLockerDocumentTypeCode(value: unknown): value is string {
  return isExactMasterListId(value)
}

/** Serialize admitted MIME list back to one-per-line draft (no trailing newline). */
export function allowedMimeTypesToDraft(types: readonly string[]): string {
  return types.join('\n')
}

/** Serialize admitted max bytes to canonical draft string. */
export function maxFileSizeBytesToDraft(value: number): string {
  return String(value)
}
