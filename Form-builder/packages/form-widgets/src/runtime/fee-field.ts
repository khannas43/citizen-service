/**
 * Fee field helpers (FB-A10).
 * Provisional fee-engine contract — host owns rule inputs, quotes, tax/rounding.
 */

import type { WidgetLocale } from './localized-text.js'

export interface FeeFieldValue {
  readonly feeRuleId: string
  readonly contextRevision: string
  readonly currency: 'INR'
  readonly amountMinor: number
  readonly quoteRef: string
}

export function resolveFeeRuleId(
  value: string | undefined,
): { readonly ok: true; readonly feeRuleId: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, feeRuleId: value.trim() }
}

export function resolveFeeContextRevision(
  value: string | undefined,
): { readonly ok: true; readonly contextRevision: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, contextRevision: value.trim() }
}

export function isValidFeeAmountMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isSafeFeeQuoteRef(
  quoteRef: unknown,
  inputs: {
    readonly feeRuleId: string
    readonly contextRevision: string
  },
): boolean {
  if (typeof quoteRef !== 'string') {
    return false
  }
  const trimmed = quoteRef.trim()
  if (trimmed.length === 0) {
    return false
  }
  if (inputs.feeRuleId.length > 0 && trimmed === inputs.feeRuleId) {
    return false
  }
  if (inputs.contextRevision.length > 0 && trimmed === inputs.contextRevision) {
    return false
  }
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  ) {
    return false
  }
  return true
}

function isStructurallyValidFeeValue(record: Record<string, unknown>): FeeFieldValue | null {
  if (typeof record.feeRuleId !== 'string' || record.feeRuleId.trim().length === 0) {
    return null
  }
  if (typeof record.contextRevision !== 'string' || record.contextRevision.trim().length === 0) {
    return null
  }
  if (record.currency !== 'INR') {
    return null
  }
  if (!isValidFeeAmountMinor(record.amountMinor)) {
    return null
  }
  if (
    !isSafeFeeQuoteRef(record.quoteRef, {
      feeRuleId: record.feeRuleId.trim(),
      contextRevision: record.contextRevision.trim(),
    })
  ) {
    return null
  }
  return {
    feeRuleId: record.feeRuleId.trim(),
    contextRevision: record.contextRevision.trim(),
    currency: 'INR',
    amountMinor: record.amountMinor,
    quoteRef: (record.quoteRef as string).trim(),
  }
}

export function acceptFeeComputationResult(
  result: unknown,
  request: {
    readonly feeRuleId: string
    readonly contextRevision: string
  },
): FeeFieldValue | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return null
  }
  const record = result as Record<string, unknown>
  if (record.feeRuleId !== request.feeRuleId) {
    return null
  }
  if (record.contextRevision !== request.contextRevision) {
    return null
  }
  if (record.currency !== 'INR') {
    return null
  }
  if (!isValidFeeAmountMinor(record.amountMinor)) {
    return null
  }
  if (
    !isSafeFeeQuoteRef(record.quoteRef, {
      feeRuleId: request.feeRuleId,
      contextRevision: request.contextRevision,
    })
  ) {
    return null
  }
  return {
    feeRuleId: request.feeRuleId,
    contextRevision: request.contextRevision,
    currency: 'INR',
    amountMinor: record.amountMinor,
    quoteRef: (record.quoteRef as string).trim(),
  }
}

const ALLOWED_KEYS = new Set([
  'feeRuleId',
  'contextRevision',
  'currency',
  'amountMinor',
  'quoteRef',
])

export type FeeFieldIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'stale'; readonly value: FeeFieldValue }
  | { readonly kind: 'current'; readonly value: FeeFieldValue }

/**
 * Presentation-validates external formData. Never rewrites or emits.
 * Stale = structurally valid quote for a different rule/revision.
 */
export function assessFeeFieldIncomingValue(
  value: unknown,
  feeRuleId: string | undefined,
  contextRevision: string | undefined,
): FeeFieldIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { kind: 'malformed' }
    }
  }
  const structural = isStructurallyValidFeeValue(record)
  if (!structural) {
    return { kind: 'malformed' }
  }
  if (
    typeof feeRuleId === 'string' &&
    feeRuleId.length > 0 &&
    typeof contextRevision === 'string' &&
    contextRevision.length > 0 &&
    structural.feeRuleId === feeRuleId &&
    structural.contextRevision === contextRevision
  ) {
    return { kind: 'current', value: structural }
  }
  return { kind: 'stale', value: structural }
}

export function emitFeeFieldValue(value: FeeFieldValue): FeeFieldValue | undefined {
  if (!resolveFeeRuleId(value.feeRuleId).ok) {
    return undefined
  }
  if (!resolveFeeContextRevision(value.contextRevision).ok) {
    return undefined
  }
  if (value.currency !== 'INR') {
    return undefined
  }
  if (!isValidFeeAmountMinor(value.amountMinor)) {
    return undefined
  }
  if (
    !isSafeFeeQuoteRef(value.quoteRef, {
      feeRuleId: value.feeRuleId,
      contextRevision: value.contextRevision,
    })
  ) {
    return undefined
  }
  return {
    feeRuleId: value.feeRuleId,
    contextRevision: value.contextRevision,
    currency: 'INR',
    amountMinor: value.amountMinor,
    quoteRef: value.quoteRef.trim(),
  }
}

/** Formats amountMinor (paise) as INR for display only — never persist the result. */
export function formatFeeAmountInr(amountMinor: number, locale: WidgetLocale): string {
  const major = amountMinor / 100
  return new Intl.NumberFormat(locale === 'gu' ? 'gu-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(major)
}
