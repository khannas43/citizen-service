import type { AadhaarIdentifierKind } from './service-ports.js'
import { isSafeOpaqueReference } from './opaque-reference.js'
import { isValidVerhoeff } from './verhoeff.js'

export type { AadhaarIdentifierKind }

const DIGITS_ONLY = /^[0-9]+$/

/**
 * Normalizes pasted identity text: strips spaces and hyphens only.
 * Letters and other characters are retained so validation can reject them
 * (they must not become valid silently).
 */
export function normalizeIdentityPaste(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/**
 * Accepts digit-only strings after stripping spaces/hyphens.
 * Rejects when any other character remains (letters must not become valid silently).
 */
export function tryNormalizeDigitRun(
  raw: string,
  maxLength: number,
): { readonly ok: true; readonly digits: string } | { readonly ok: false } {
  const stripped = raw.replace(/[\s-]/g, '')
  if (!/^[0-9]*$/.test(stripped)) {
    return { ok: false }
  }
  return { ok: true, digits: stripped.slice(0, maxLength) }
}

export function inferAadhaarIdentifierKind(digits: string): AadhaarIdentifierKind | undefined {
  if (!DIGITS_ONLY.test(digits)) {
    return undefined
  }
  if (digits.length === 12) {
    return 'AADHAAR'
  }
  if (digits.length === 16) {
    return 'VID'
  }
  return undefined
}

export function isValidAadhaarOrVid(digits: string): boolean {
  const kind = inferAadhaarIdentifierKind(digits)
  if (kind === undefined) {
    return false
  }
  return isValidVerhoeff(digits)
}

export function lastFourDigits(digits: string): string | undefined {
  if (digits.length < 4 || !DIGITS_ONLY.test(digits)) {
    return undefined
  }
  return digits.slice(-4)
}

/** Citizen-visible mask derived from kind + lastFour (never stored). */
export function formatAadhaarMask(kind: AadhaarIdentifierKind, lastFour: string): string {
  if (kind === 'AADHAAR') {
    return `•••• •••• ${lastFour}`
  }
  return `•••• •••• •••• ${lastFour}`
}

const LAST_FOUR = /^[0-9]{4}$/

/**
 * Validates an adapter tokenization result against the submitted identifier.
 * Rejects empty tokens, wrong lastFour, and tokens that echo the raw value.
 */
export function isSafeIdentityTokenizationResult(
  rawIdentifier: string,
  result: { readonly referenceToken: string; readonly lastFour: string },
): boolean {
  if (!isSafeOpaqueReference(result.referenceToken, [rawIdentifier])) {
    return false
  }
  if (typeof result.lastFour !== 'string' || !LAST_FOUR.test(result.lastFour)) {
    return false
  }
  if (!rawIdentifier.endsWith(result.lastFour)) {
    return false
  }
  return true
}
