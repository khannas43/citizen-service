/**
 * Eligibility declaration helpers (FB-A9).
 * Provisional consent-logging contract — not a claim of full DPDP legal compliance.
 */

export interface EligibilityDeclarationValue {
  readonly declarationId: string
  readonly accepted: boolean
  readonly locale: 'en' | 'gu'
  readonly consentReceiptRef: string
}

export function resolveDeclarationId(
  value: string | undefined,
): { readonly ok: true; readonly declarationId: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, declarationId: value.trim() }
}

export function isWidgetLocale(value: unknown): value is 'en' | 'gu' {
  return value === 'en' || value === 'gu'
}

export function isSafeConsentReceiptRef(
  consentReceiptRef: unknown,
  inputs: {
    readonly declarationId: string
    readonly fieldId: string
  },
): boolean {
  if (typeof consentReceiptRef !== 'string') {
    return false
  }
  const trimmed = consentReceiptRef.trim()
  if (trimmed.length === 0) {
    return false
  }
  // Exact identifier echoes are not receipts; composites that embed them are allowed.
  if (inputs.declarationId.length > 0 && trimmed === inputs.declarationId) {
    return false
  }
  if (inputs.fieldId.length > 0 && trimmed === inputs.fieldId) {
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

export function acceptConsentLoggingResult(
  result: unknown,
  request: {
    readonly declarationId: string
    readonly accepted: boolean
    readonly locale: 'en' | 'gu'
    readonly fieldId: string
  },
): EligibilityDeclarationValue | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return null
  }
  const record = result as Record<string, unknown>
  if (record.declarationId !== request.declarationId) {
    return null
  }
  if (record.accepted !== request.accepted) {
    return null
  }
  if (record.locale !== request.locale) {
    return null
  }
  if (
    !isSafeConsentReceiptRef(record.consentReceiptRef, {
      declarationId: request.declarationId,
      fieldId: request.fieldId,
    })
  ) {
    return null
  }
  return {
    declarationId: request.declarationId,
    accepted: request.accepted,
    locale: request.locale,
    consentReceiptRef: (record.consentReceiptRef as string).trim(),
  }
}

const ALLOWED_KEYS = new Set(['declarationId', 'accepted', 'locale', 'consentReceiptRef'])

export type EligibilityDeclarationIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'present'; readonly value: EligibilityDeclarationValue }

/**
 * Presentation-validates external formData. Never rewrites or emits.
 * Malformed payloads are not presented as a recorded decision.
 */
export function assessEligibilityDeclarationIncomingValue(
  value: unknown,
  configuredDeclarationId: string | undefined,
  fieldId = '',
): EligibilityDeclarationIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (typeof value === 'boolean') {
    return { kind: 'malformed' }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  if (typeof configuredDeclarationId !== 'string' || configuredDeclarationId.length === 0) {
    return { kind: 'malformed' }
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { kind: 'malformed' }
    }
  }
  if (
    typeof record.declarationId !== 'string' ||
    record.declarationId !== configuredDeclarationId
  ) {
    return { kind: 'malformed' }
  }
  if (typeof record.accepted !== 'boolean') {
    return { kind: 'malformed' }
  }
  if (!isWidgetLocale(record.locale)) {
    return { kind: 'malformed' }
  }
  if (
    !isSafeConsentReceiptRef(record.consentReceiptRef, {
      declarationId: configuredDeclarationId,
      fieldId,
    })
  ) {
    return { kind: 'malformed' }
  }
  return {
    kind: 'present',
    value: {
      declarationId: configuredDeclarationId,
      accepted: record.accepted,
      locale: record.locale,
      consentReceiptRef: (record.consentReceiptRef as string).trim(),
    },
  }
}

/** Builds emitted formData only when a complete receipt-backed value is valid. */
export function emitEligibilityDeclarationValue(
  value: EligibilityDeclarationValue,
  fieldId: string,
): EligibilityDeclarationValue | undefined {
  if (!resolveDeclarationId(value.declarationId).ok) {
    return undefined
  }
  if (!isWidgetLocale(value.locale)) {
    return undefined
  }
  if (typeof value.accepted !== 'boolean') {
    return undefined
  }
  if (
    !isSafeConsentReceiptRef(value.consentReceiptRef, {
      declarationId: value.declarationId,
      fieldId,
    })
  ) {
    return undefined
  }
  return {
    declarationId: value.declarationId,
    accepted: value.accepted,
    locale: value.locale,
    consentReceiptRef: value.consentReceiptRef.trim(),
  }
}
