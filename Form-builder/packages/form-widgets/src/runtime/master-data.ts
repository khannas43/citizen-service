import type { MasterDataOption, PincodeLookupResult } from './service-ports.js'

/**
 * Validates master-data options from a host adapter (geography or master lists).
 * Rejects empty codes, blank bilingual labels, and duplicate codes.
 * Preserves adapter ordering when valid.
 */
export function validateMasterDataOptions(
  options: unknown,
): { readonly ok: true; readonly options: readonly MasterDataOption[] } | { readonly ok: false } {
  if (!Array.isArray(options)) {
    return { ok: false }
  }
  const seen = new Set<string>()
  const validated: MasterDataOption[] = []
  for (const item of options) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false }
    }
    const record = item as {
      code?: unknown
      labelEn?: unknown
      labelGu?: unknown
    }
    if (typeof record.code !== 'string' || record.code.trim().length === 0) {
      return { ok: false }
    }
    if (typeof record.labelEn !== 'string' || record.labelEn.trim().length === 0) {
      return { ok: false }
    }
    if (typeof record.labelGu !== 'string' || record.labelGu.trim().length === 0) {
      return { ok: false }
    }
    if (seen.has(record.code)) {
      return { ok: false }
    }
    seen.add(record.code)
    validated.push({
      code: record.code,
      labelEn: record.labelEn,
      labelGu: record.labelGu,
    })
  }
  return { ok: true, options: validated }
}

/**
 * Resolves `x-dg20.masterListId` for dropdown-master and radio.
 * Missing, blank, or non-string → invalid configuration.
 */
export function resolveMasterListId(
  value: string | undefined,
): { readonly ok: true; readonly masterListId: string } | { readonly ok: false } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false }
  }
  return { ok: true, masterListId: value.trim() }
}

export function masterDataOptionLabel(option: MasterDataOption, locale: 'en' | 'gu'): string {
  return locale === 'gu' ? option.labelGu : option.labelEn
}

export function isKnownMasterDataCode(
  code: unknown,
  options: readonly MasterDataOption[],
): code is string {
  return typeof code === 'string' && options.some((option) => option.code === code)
}

/**
 * Classifies externally supplied dropdown/radio formData before presentation.
 * Unanswered: undefined, null (RJSF), or empty string.
 * Candidate: non-empty string (checked against loaded options when ready/empty).
 * Malformed: any other type (number, boolean, object, array, …).
 */
export type MasterChoiceIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'candidate'; readonly code: string }

export function assessMasterChoiceIncomingValue(value: unknown): MasterChoiceIncomingAssessment {
  if (value === undefined || value === null || value === '') {
    return { kind: 'unanswered' }
  }
  if (typeof value === 'string') {
    return { kind: 'candidate', code: value }
  }
  return { kind: 'malformed' }
}

/**
 * Whether to show the localized invalid-value error for an incoming value.
 * Unknown codes are only claimed once the list is ready or confirmed empty.
 */
export function shouldShowMasterChoiceInvalidValue(input: {
  readonly assessment: MasterChoiceIncomingAssessment
  readonly loadStatus: MasterDataLoadStatusLike
  readonly options: readonly MasterDataOption[]
}): boolean {
  if (input.assessment.kind === 'malformed') {
    return true
  }
  if (input.assessment.kind !== 'candidate') {
    return false
  }
  if (input.loadStatus !== 'ready' && input.loadStatus !== 'empty') {
    return false
  }
  return !isKnownMasterDataCode(input.assessment.code, input.options)
}

export function resolveMasterChoiceSelectedCode(input: {
  readonly assessment: MasterChoiceIncomingAssessment
  readonly loadStatus: MasterDataLoadStatusLike
  readonly options: readonly MasterDataOption[]
}): string | undefined {
  if (input.loadStatus !== 'ready' || input.assessment.kind !== 'candidate') {
    return undefined
  }
  return isKnownMasterDataCode(input.assessment.code, input.options)
    ? input.assessment.code
    : undefined
}

type MasterDataLoadStatusLike =
  'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'invalid-config' | 'failed'

function asNonNegativeSafeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return undefined
  }
  return value
}

/**
 * Resolves JSON Schema minItems/maxItems for multiselect.
 * Absent bounds are allowed; present but invalid or max < min → invalid config.
 */
export function resolveMultiselectItemBounds(schema: {
  readonly minItems?: unknown
  readonly maxItems?: unknown
}):
  | { readonly ok: true; readonly minItems?: number; readonly maxItems?: number }
  | { readonly ok: false } {
  let minItems: number | undefined
  let maxItems: number | undefined
  if ('minItems' in schema && schema.minItems !== undefined) {
    minItems = asNonNegativeSafeInteger(schema.minItems)
    if (minItems === undefined) {
      return { ok: false }
    }
  }
  if ('maxItems' in schema && schema.maxItems !== undefined) {
    maxItems = asNonNegativeSafeInteger(schema.maxItems)
    if (maxItems === undefined) {
      return { ok: false }
    }
  }
  if (minItems !== undefined && maxItems !== undefined && maxItems < minItems) {
    return { ok: false }
  }
  return { ok: true, minItems, maxItems }
}

export type MultiselectIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'candidate'; readonly codes: readonly string[] }

export function assessMultiselectIncomingValue(value: unknown): MultiselectIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (!Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  const seen = new Set<string>()
  const codes: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) {
      return { kind: 'malformed' }
    }
    if (seen.has(item)) {
      return { kind: 'malformed' }
    }
    seen.add(item)
    codes.push(item)
  }
  return { kind: 'candidate', codes }
}

export function shouldShowMultiselectInvalidValue(input: {
  readonly assessment: MultiselectIncomingAssessment
  readonly loadStatus: MasterDataLoadStatusLike
  readonly options: readonly MasterDataOption[]
  readonly maxItems?: number
}): boolean {
  if (input.assessment.kind === 'malformed') {
    return true
  }
  if (input.assessment.kind !== 'candidate') {
    return false
  }
  if (input.loadStatus !== 'ready' && input.loadStatus !== 'empty') {
    return false
  }
  if (input.maxItems !== undefined && input.assessment.codes.length > input.maxItems) {
    return true
  }
  return input.assessment.codes.some((code) => !isKnownMasterDataCode(code, input.options))
}

/** Selected codes presented only when the incoming array is fully valid against the list. */
export function resolveMultiselectSelectedCodes(input: {
  readonly assessment: MultiselectIncomingAssessment
  readonly loadStatus: MasterDataLoadStatusLike
  readonly options: readonly MasterDataOption[]
  readonly maxItems?: number
}): readonly string[] {
  if (
    input.loadStatus !== 'ready' ||
    input.assessment.kind !== 'candidate' ||
    shouldShowMultiselectInvalidValue(input)
  ) {
    return []
  }
  return orderCodesByOptions(input.assessment.codes, input.options)
}

export function orderCodesByOptions(
  codes: readonly string[],
  options: readonly MasterDataOption[],
): string[] {
  const selected = new Set(codes)
  return options.map((option) => option.code).filter((code) => selected.has(code))
}

export function emitMultiselectCodes(codes: readonly string[]): string[] | undefined {
  return codes.length === 0 ? undefined : [...codes]
}

export function resolveCascadingListIds(input: {
  readonly parentMasterListId?: string
  readonly childMasterListId?: string
}):
  | {
      readonly ok: true
      readonly parentMasterListId: string
      readonly childMasterListId: string
    }
  | { readonly ok: false } {
  const parent = resolveMasterListId(input.parentMasterListId)
  const child = resolveMasterListId(input.childMasterListId)
  if (!parent.ok || !child.ok) {
    return { ok: false }
  }
  return {
    ok: true,
    parentMasterListId: parent.masterListId,
    childMasterListId: child.masterListId,
  }
}

export interface CascadingDropdownValue {
  readonly parentCode: string
  readonly childCode?: string
}

export type CascadingIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | {
      readonly kind: 'candidate'
      readonly parentCode: string
      readonly childCode?: string
    }

export function assessCascadingIncomingValue(value: unknown): CascadingIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  for (const key of keys) {
    if (key !== 'parentCode' && key !== 'childCode') {
      return { kind: 'malformed' }
    }
  }
  if (typeof record.parentCode !== 'string' || record.parentCode.length === 0) {
    return { kind: 'malformed' }
  }
  if (!('childCode' in record) || record.childCode === undefined) {
    return { kind: 'candidate', parentCode: record.parentCode }
  }
  if (typeof record.childCode !== 'string' || record.childCode.length === 0) {
    return { kind: 'malformed' }
  }
  return { kind: 'candidate', parentCode: record.parentCode, childCode: record.childCode }
}

export function isSafePincodeLookupFound(
  result: Extract<PincodeLookupResult, { found: true }>,
): boolean {
  const fields = [
    result.cityCode,
    result.districtCode,
    result.cityLabelEn,
    result.cityLabelGu,
    result.districtLabelEn,
    result.districtLabelGu,
  ]
  return fields.every((value) => typeof value === 'string' && value.trim().length > 0)
}
