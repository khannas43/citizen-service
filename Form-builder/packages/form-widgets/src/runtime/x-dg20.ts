/**
 * Governed JSON Schema extension object `x-dg20` (annotation/config only).
 * Not executable AJV keywords. Unknown keys are ignored.
 */

import type { OtpChannel } from './service-ports.js'

export interface Dg20SchemaExtensions {
  readonly verifyEmail?: boolean
  readonly minAge?: number
  readonly maxAge?: number
  /**
   * OTP channels for `mobile-otp`. Missing → widget defaults to `['sms']`.
   * When present, must be exactly the dense ordinary array `['sms']`.
   * Malformed / unknown / uppercase / duplicate values are rejected (no silent filter).
   */
  readonly otpChannels?: readonly OtpChannel[]
  /** Default state code for `address-block` when value has no state yet. */
  readonly defaultStateCode?: string
  /** Exact MIME allow-list for `doc-upload` (non-empty required by the widget). */
  readonly allowedMimeTypes?: readonly string[]
  /** Max upload size in bytes for `doc-upload` (positive safe integer ≤ package cap). */
  readonly maxFileSizeBytes?: number
  /** DigiLocker issued-document type code for `digilocker-fetch`. */
  readonly digiLockerDocumentTypeCode?: string
  /** Master-data list id for `dropdown-master`, `radio`, and `multiselect`. */
  readonly masterListId?: string
  /** Parent list id for `cascading-dropdown`. */
  readonly parentMasterListId?: string
  /** Child list id for `cascading-dropdown`. */
  readonly childMasterListId?: string
  /** Governed/versioned legal declaration id for `eligibility-declaration`. */
  readonly declarationId?: string
  /** Fee-engine rule id for `fee-field`. */
  readonly feeRuleId?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return undefined
  }
  if (value < 0) {
    return undefined
  }
  return value
}

function asPositiveSafeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return undefined
  }
  return value
}

function parseOtpChannels(value: unknown): readonly OtpChannel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return undefined
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return undefined
    }
    const lengthDesc = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      !lengthDesc ||
      lengthDesc.get !== undefined ||
      lengthDesc.set !== undefined ||
      typeof lengthDesc.value !== 'number' ||
      !Number.isSafeInteger(lengthDesc.value) ||
      lengthDesc.value !== 1
    ) {
      return undefined
    }
    if (!Object.prototype.hasOwnProperty.call(value, '0')) {
      return undefined
    }
    const indexDesc = Object.getOwnPropertyDescriptor(value, '0')
    if (
      !indexDesc ||
      indexDesc.get !== undefined ||
      indexDesc.set !== undefined ||
      indexDesc.enumerable !== true
    ) {
      return undefined
    }
    if (indexDesc.value !== 'sms') {
      return undefined
    }
    const names = Object.getOwnPropertyNames(value)
    if (names.length !== 2 || !names.includes('length') || !names.includes('0')) {
      return undefined
    }
    return ['sms']
  } catch {
    return undefined
  }
}

function parseAllowedMimeTypes(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const types: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return []
    }
    types.push(item.trim())
  }
  return types
}

/**
 * Safely parses `schema["x-dg20"]`. Malformed or absent content → empty object.
 */
export function parseDg20Extensions(schema: unknown): Dg20SchemaExtensions {
  if (!isPlainObject(schema)) {
    return {}
  }
  const raw = schema['x-dg20']
  if (!isPlainObject(raw)) {
    return {}
  }

  const result: {
    verifyEmail?: boolean
    minAge?: number
    maxAge?: number
    otpChannels?: readonly OtpChannel[]
    defaultStateCode?: string
    allowedMimeTypes?: readonly string[]
    maxFileSizeBytes?: number
    digiLockerDocumentTypeCode?: string
    masterListId?: string
    parentMasterListId?: string
    childMasterListId?: string
    declarationId?: string
    feeRuleId?: string
  } = {}

  if (typeof raw.verifyEmail === 'boolean') {
    result.verifyEmail = raw.verifyEmail
  }

  const minAge = asNonNegativeInteger(raw.minAge)
  if (minAge !== undefined) {
    result.minAge = minAge
  }

  const maxAge = asNonNegativeInteger(raw.maxAge)
  if (maxAge !== undefined) {
    result.maxAge = maxAge
  }

  if ('otpChannels' in raw) {
    const channels = parseOtpChannels(raw.otpChannels)
    // Present but malformed → empty sentinel so resolveOtpChannels rejects
    // (never silently filter unknown entries into a valid result).
    result.otpChannels = channels === undefined ? [] : channels
  }

  if (typeof raw.defaultStateCode === 'string' && raw.defaultStateCode.trim().length > 0) {
    result.defaultStateCode = raw.defaultStateCode.trim()
  }

  if ('allowedMimeTypes' in raw) {
    const types = parseAllowedMimeTypes(raw.allowedMimeTypes)
    if (types !== undefined) {
      result.allowedMimeTypes = types
    }
  }

  if ('maxFileSizeBytes' in raw) {
    const maxBytes = asPositiveSafeInteger(raw.maxFileSizeBytes)
    if (maxBytes !== undefined) {
      result.maxFileSizeBytes = maxBytes
    }
  }

  if (typeof raw.digiLockerDocumentTypeCode === 'string') {
    result.digiLockerDocumentTypeCode = raw.digiLockerDocumentTypeCode.trim()
  }

  if (typeof raw.masterListId === 'string') {
    result.masterListId = raw.masterListId.trim()
  }

  if (typeof raw.parentMasterListId === 'string') {
    result.parentMasterListId = raw.parentMasterListId.trim()
  }

  if (typeof raw.childMasterListId === 'string') {
    result.childMasterListId = raw.childMasterListId.trim()
  }

  if (typeof raw.declarationId === 'string') {
    result.declarationId = raw.declarationId.trim()
  }

  if (typeof raw.feeRuleId === 'string') {
    result.feeRuleId = raw.feeRuleId.trim()
  }

  return result
}

/** Resolves FB-A3 / D8 OTP channels: missing → sms; present must be exactly ["sms"]. */
export function resolveOtpChannels(
  extensions: Dg20SchemaExtensions,
): { readonly ok: true; readonly channels: readonly OtpChannel[] } | { readonly ok: false } {
  if (extensions.otpChannels === undefined) {
    return { ok: true, channels: ['sms'] }
  }
  if (extensions.otpChannels.length === 1 && extensions.otpChannels[0] === 'sms') {
    return { ok: true, channels: ['sms'] }
  }
  return { ok: false }
}
