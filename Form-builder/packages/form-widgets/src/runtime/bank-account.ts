import { isSafeOpaqueReference } from './opaque-reference.js'

/** Provisional v1 account-number digit length (requires product/bank confirmation). */
export const BANK_ACCOUNT_NUMBER_MIN_DIGITS = 6
export const BANK_ACCOUNT_NUMBER_MAX_DIGITS = 20

/** IFSC: 4 letters + 0 + 6 alphanumeric (ASCII). */
export const BANK_IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

export interface BankAccountValue {
  readonly accountNumber?: string
  readonly ifsc?: string
  readonly accountHolderName?: string
  readonly verified: boolean
  readonly verificationRef?: string
}

export type BankAccountNumberParse =
  { readonly ok: true; readonly digits: string } | { readonly ok: false; readonly reason: 'chars' }

/**
 * Extracts digits from account-number typing. Spaces/hyphens are separators only.
 * Letters and other symbols are rejected (not silently stripped).
 * Length is not enforced here — use isValidBankAccountNumberDigits for verify.
 */
export function parseBankAccountNumberInput(raw: string): BankAccountNumberParse {
  if (raw.length === 0) {
    return { ok: true, digits: '' }
  }
  if (/[^0-9\s-]/.test(raw)) {
    return { ok: false, reason: 'chars' }
  }
  const digits = raw.replace(/[\s-]/g, '')
  if (digits.length === 0) {
    return { ok: true, digits: '' }
  }
  if (!/^[0-9]+$/.test(digits)) {
    return { ok: false, reason: 'chars' }
  }
  return { ok: true, digits }
}

/** True when digits alone are a complete provisional-v1 account number. */
export function isValidBankAccountNumberDigits(digits: string): boolean {
  return (
    /^[0-9]+$/.test(digits) &&
    digits.length >= BANK_ACCOUNT_NUMBER_MIN_DIGITS &&
    digits.length <= BANK_ACCOUNT_NUMBER_MAX_DIGITS
  )
}

export function normalizeBankIfscInput(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function isValidBankIfsc(value: string): boolean {
  return BANK_IFSC_PATTERN.test(value)
}

export function isNonBlankAccountHolderName(value: string): boolean {
  return value.trim().length > 0
}

export function formatBankAccountMask(accountNumberDigits: string): string {
  const lastFour =
    accountNumberDigits.length >= 4
      ? accountNumberDigits.slice(-4)
      : accountNumberDigits.padStart(4, '•')
  return `••••${lastFour}`
}

export function isSafeBankVerificationRef(
  verificationRef: unknown,
  accountNumber: string,
  ifsc: string,
  accountHolderName: string,
): boolean {
  const forbidden = [accountNumber, ifsc, accountHolderName, accountHolderName.trim()].filter(
    (item) => item.length > 0,
  )
  return isSafeOpaqueReference(verificationRef, forbidden)
}

export type BankVerificationAdapterResult =
  { readonly verified: true; readonly verificationRef: string } | { readonly verified: false }

export function acceptBankVerificationResult(
  result: BankVerificationAdapterResult,
  inputs: {
    readonly accountNumber: string
    readonly ifsc: string
    readonly accountHolderName: string
  },
): { readonly verificationRef: string } | null {
  if (!result.verified) {
    return null
  }
  if (
    !isSafeBankVerificationRef(
      result.verificationRef,
      inputs.accountNumber,
      inputs.ifsc,
      inputs.accountHolderName,
    )
  ) {
    return null
  }
  return { verificationRef: result.verificationRef.trim() }
}

const ALLOWED_KEYS = new Set([
  'accountNumber',
  'ifsc',
  'accountHolderName',
  'verified',
  'verificationRef',
])

export type BankAccountIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'present'; readonly value: BankAccountValue }

/**
 * Presentation-validates external formData. Never rewrites or emits.
 * Malformed verified payloads are not presented as verified.
 */
export function assessBankAccountIncomingValue(value: unknown): BankAccountIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { kind: 'malformed' }
    }
  }
  if (typeof record.verified !== 'boolean') {
    return { kind: 'malformed' }
  }

  let accountNumber: string | undefined
  if ('accountNumber' in record && record.accountNumber !== undefined) {
    if (typeof record.accountNumber !== 'string') {
      return { kind: 'malformed' }
    }
    accountNumber = record.accountNumber
  }
  let ifsc: string | undefined
  if ('ifsc' in record && record.ifsc !== undefined) {
    if (typeof record.ifsc !== 'string') {
      return { kind: 'malformed' }
    }
    ifsc = record.ifsc
  }
  let accountHolderName: string | undefined
  if ('accountHolderName' in record && record.accountHolderName !== undefined) {
    if (typeof record.accountHolderName !== 'string') {
      return { kind: 'malformed' }
    }
    accountHolderName = record.accountHolderName
  }

  if (record.verified) {
    if (
      typeof accountNumber !== 'string' ||
      !isValidBankAccountNumberDigits(accountNumber) ||
      typeof ifsc !== 'string' ||
      !isValidBankIfsc(ifsc) ||
      typeof accountHolderName !== 'string' ||
      !isNonBlankAccountHolderName(accountHolderName) ||
      typeof record.verificationRef !== 'string' ||
      !isSafeBankVerificationRef(record.verificationRef, accountNumber, ifsc, accountHolderName)
    ) {
      return { kind: 'malformed' }
    }
    return {
      kind: 'present',
      value: {
        accountNumber,
        ifsc,
        accountHolderName,
        verified: true,
        verificationRef: record.verificationRef.trim(),
      },
    }
  }

  if ('verificationRef' in record && record.verificationRef !== undefined) {
    return { kind: 'malformed' }
  }

  const next: {
    accountNumber?: string
    ifsc?: string
    accountHolderName?: string
    verified: false
  } = { verified: false }
  if (accountNumber !== undefined) {
    next.accountNumber = accountNumber
  }
  if (ifsc !== undefined) {
    next.ifsc = ifsc
  }
  if (accountHolderName !== undefined) {
    next.accountHolderName = accountHolderName
  }
  if (
    next.accountNumber === undefined &&
    next.ifsc === undefined &&
    next.accountHolderName === undefined
  ) {
    return { kind: 'unanswered' }
  }
  return { kind: 'present', value: next }
}

/** Builds emitted formData. Empty → undefined. verified:false never includes verificationRef.
 * verified:true is only emitted when all inputs are valid and the reference is safe.
 */
export function emitBankAccountValue(input: {
  readonly accountNumber: string
  readonly ifsc: string
  readonly accountHolderName: string
  readonly verified: boolean
  readonly verificationRef?: string
}): BankAccountValue | undefined {
  const accountNumber = input.accountNumber
  const ifsc = input.ifsc
  const accountHolderName = input.accountHolderName
  if (!accountNumber && !ifsc && !accountHolderName && !input.verified) {
    return undefined
  }
  if (
    input.verified &&
    typeof input.verificationRef === 'string' &&
    isValidBankAccountNumberDigits(accountNumber) &&
    isValidBankIfsc(ifsc) &&
    isNonBlankAccountHolderName(accountHolderName) &&
    isSafeBankVerificationRef(input.verificationRef, accountNumber, ifsc, accountHolderName)
  ) {
    return {
      accountNumber,
      ifsc,
      accountHolderName,
      verified: true,
      verificationRef: input.verificationRef.trim(),
    }
  }
  const next: {
    accountNumber?: string
    ifsc?: string
    accountHolderName?: string
    verified: false
  } = { verified: false }
  if (accountNumber) {
    next.accountNumber = accountNumber
  }
  if (ifsc) {
    next.ifsc = ifsc
  }
  if (accountHolderName) {
    next.accountHolderName = accountHolderName
  }
  if (
    next.accountNumber === undefined &&
    next.ifsc === undefined &&
    next.accountHolderName === undefined
  ) {
    return undefined
  }
  return next
}
