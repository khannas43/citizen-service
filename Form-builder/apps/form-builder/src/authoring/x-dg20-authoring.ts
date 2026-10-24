import type { JsonObject } from '@dg20/form-contract'

import {
  admitDobXDg20,
  admitEmailXDg20,
  type AdmittedDobXDg20,
  type AdmittedEmailXDg20,
  type XDg20AdmissionResult,
} from './citizen-schema-admission.js'
import { admitCascadingXDg20 } from './master-data-schema-admission.js'
import { admitMasterListXDg20 } from './master-list-schema-admission.js'
import { admitAddressBlockXDg20 } from './address-photo-schema-admission.js'
import { admitDigiLockerXDg20, admitDocUploadXDg20 } from './doc-digilocker-schema-admission.js'
import { allowedMimeTypesToDraft, maxFileSizeBytesToDraft } from './doc-digilocker-policy.js'
import { admitFeeFieldXDg20, FEE_AMOUNT_MINOR_MAX } from './fee-esign-schema-admission.js'
import { admitEligibilityDeclarationXDg20 } from './eligibility-declaration-schema-admission.js'
import { boundNumberToDraft } from './multiselect-bounds.js'
import { AuthoringError } from './types.js'

export type { AdmittedDobXDg20, AdmittedEmailXDg20, XDg20AdmissionResult }
export {
  admitDobXDg20,
  admitEmailXDg20,
  admitMasterListXDg20,
  admitCascadingXDg20,
  admitAddressBlockXDg20,
  admitDocUploadXDg20,
  admitDigiLockerXDg20,
  admitFeeFieldXDg20,
  admitEligibilityDeclarationXDg20,
}

/**
 * Read verifyEmail from an already-admitted email schema.
 * Throws {@link AuthoringError} `inconsistent_definition` when x-dg20 is malformed.
 * Absent or verifyEmail !== true → false (explicit false is valid but reads as false).
 */
export function readVerifyEmail(schema: Readonly<Record<string, unknown>>): boolean {
  const admission = admitEmailXDg20(schema)
  if (admission.kind === 'invalid') {
    throw new AuthoringError('inconsistent_definition', 'Field email extension is invalid')
  }
  if (admission.kind === 'absent') {
    return false
  }
  return admission.value.verifyEmail === true
}

/**
 * Read a DOB age extension as a canonical draft string.
 * Throws when x-dg20 is malformed. Absent key → empty string.
 */
export function readAgeExtension(
  schema: Readonly<Record<string, unknown>>,
  key: 'minAge' | 'maxAge',
): string {
  const admission = admitDobXDg20(schema)
  if (admission.kind === 'invalid') {
    throw new AuthoringError('inconsistent_definition', 'Field date-of-birth extension is invalid')
  }
  if (admission.kind === 'absent') {
    return ''
  }
  const value = admission.value[key]
  return value === undefined ? '' : String(value)
}

/**
 * Read masterListId from an admitted dropdown-master / radio schema.
 * Throws when x-dg20 is malformed or missing.
 */
export function readMasterListId(schema: Readonly<Record<string, unknown>>): string {
  const admission = admitMasterListXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError('inconsistent_definition', 'Field master-list extension is invalid')
  }
  return admission.value.masterListId
}

/**
 * Canonical email x-dg20 Apply: true → `{ verifyEmail: true }`; false → remove x-dg20.
 * Never merges foreign keys. Preserves all other schema keywords.
 */
export function applyCanonicalEmailXDg20(schema: JsonObject, verifyEmail: boolean): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  if (verifyEmail === true) {
    next['x-dg20'] = { verifyEmail: true }
  } else {
    delete next['x-dg20']
  }
  return next as JsonObject
}

/**
 * Canonical DOB x-dg20 Apply: only present nonnegative safe-integer ages.
 * Both absent → remove x-dg20. Never merges foreign keys.
 */
export function applyCanonicalDobXDg20(
  schema: JsonObject,
  ages: Readonly<{ minAge?: number; maxAge?: number }>,
): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  const ext: Record<string, number> = {}
  if (ages.minAge !== undefined) {
    ext['minAge'] = ages.minAge
  }
  if (ages.maxAge !== undefined) {
    ext['maxAge'] = ages.maxAge
  }
  if (Object.keys(ext).length === 0) {
    delete next['x-dg20']
  } else {
    next['x-dg20'] = ext
  }
  return next as JsonObject
}

/**
 * Canonical master-list x-dg20 Apply: exact `{ masterListId }`.
 * Never merges foreign keys. Preserves all other schema keywords.
 */
export function applyCanonicalMasterListXDg20(
  schema: JsonObject,
  masterListId: string,
): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'string'
  delete next['enum']
  next['x-dg20'] = { masterListId }
  return next as JsonObject
}

/**
 * Canonical multiselect Apply: array + uniqueItems + items + exact masterListId x-dg20.
 * Optional minItems/maxItems; blank drafts omit the keywords.
 */
export function applyCanonicalMultiselectSchema(
  schema: JsonObject,
  input: {
    readonly masterListId: string
    readonly minItems?: number
    readonly maxItems?: number
  },
): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'array'
  next['items'] = { type: 'string' }
  next['uniqueItems'] = true
  delete next['enum']
  next['x-dg20'] = { masterListId: input.masterListId }
  if (input.minItems !== undefined) {
    next['minItems'] = input.minItems
  } else {
    delete next['minItems']
  }
  if (input.maxItems !== undefined) {
    next['maxItems'] = input.maxItems
  } else {
    delete next['maxItems']
  }
  return next as JsonObject
}

export function readCascadingMasterListIds(schema: Readonly<Record<string, unknown>>): {
  readonly parentMasterListId: string
  readonly childMasterListId: string
} {
  const admission = admitCascadingXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError('inconsistent_definition', 'Field cascading extension is invalid')
  }
  return admission.value
}

/**
 * Canonical cascading Apply: object shape + exact parent/child x-dg20.
 * Preserves compatible unrelated annotations on the root schema object only
 * by copying non-governed keys; governed members are rewritten canonically.
 */
export function applyCanonicalCascadingSchema(
  schema: JsonObject,
  input: {
    readonly parentMasterListId: string
    readonly childMasterListId: string
  },
): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  const previousProperties =
    schema['properties'] !== null &&
    typeof schema['properties'] === 'object' &&
    !Array.isArray(schema['properties'])
      ? (schema['properties'] as Record<string, unknown>)
      : {}
  const previousParent =
    previousProperties['parentCode'] !== null &&
    typeof previousProperties['parentCode'] === 'object' &&
    !Array.isArray(previousProperties['parentCode'])
      ? (previousProperties['parentCode'] as Record<string, unknown>)
      : {}
  const previousChild =
    previousProperties['childCode'] !== null &&
    typeof previousProperties['childCode'] === 'object' &&
    !Array.isArray(previousProperties['childCode'])
      ? (previousProperties['childCode'] as Record<string, unknown>)
      : {}

  next['type'] = 'object'
  next['additionalProperties'] = false
  next['required'] = ['parentCode']
  next['properties'] = {
    parentCode: { ...previousParent, type: 'string', minLength: 1 },
    childCode: { ...previousChild, type: 'string', minLength: 1 },
  }
  next['x-dg20'] = {
    parentMasterListId: input.parentMasterListId,
    childMasterListId: input.childMasterListId,
  }
  return next as JsonObject
}

export function readMultiselectBoundDrafts(schema: Readonly<Record<string, unknown>>): {
  readonly minItems: string
  readonly maxItems: string
} {
  return {
    minItems: boundNumberToDraft(schema['minItems']),
    maxItems: boundNumberToDraft(schema['maxItems']),
  }
}

/**
 * Read optional defaultStateCode draft from an address-block schema.
 * Absent → ''; malformed → AuthoringError inconsistent_definition.
 */
export function readDefaultStateCodeDraft(schema: Readonly<Record<string, unknown>>): string {
  const admission = admitAddressBlockXDg20(schema)
  if (admission.kind === 'invalid') {
    throw new AuthoringError('inconsistent_definition', 'Field address-block extension is invalid')
  }
  if (admission.kind === 'absent') {
    return ''
  }
  return admission.value.defaultStateCode
}

/**
 * Canonical address-block x-dg20 Apply: blank draft removes x-dg20;
 * otherwise exact `{ defaultStateCode }`. Never writes an empty x-dg20 object.
 * Preserves other schema keywords.
 */
export function applyCanonicalAddressBlockXDg20(
  schema: JsonObject,
  defaultStateCodeDraft: string,
): JsonObject {
  const next: Record<string, unknown> = { ...schema }
  if (defaultStateCodeDraft.length === 0) {
    delete next['x-dg20']
  } else {
    next['x-dg20'] = { defaultStateCode: defaultStateCodeDraft }
  }
  return next as JsonObject
}

/**
 * Read doc-upload policy drafts from an admitted schema.
 * Malformed → AuthoringError inconsistent_definition.
 */
export function readDocUploadPolicyDrafts(schema: Readonly<Record<string, unknown>>): {
  readonly allowedMimeTypesText: string
  readonly maxFileSizeBytes: string
} {
  const admission = admitDocUploadXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError('inconsistent_definition', 'Field doc-upload extension is invalid')
  }
  return {
    allowedMimeTypesText: allowedMimeTypesToDraft(admission.value.allowedMimeTypes),
    maxFileSizeBytes: maxFileSizeBytesToDraft(admission.value.maxFileSizeBytes),
  }
}

/**
 * Canonical doc-upload Apply: rewrite mime enum, sizeBytes.maximum, and x-dg20
 * so they always agree. Preserves unrelated schema annotations on sibling keys.
 */
export function applyCanonicalDocUploadSchema(
  schema: JsonObject,
  input: {
    readonly allowedMimeTypes: readonly string[]
    readonly maxFileSizeBytes: number
  },
): JsonObject {
  const previous = isPlainObject(schema['properties'])
    ? (schema['properties'] as Record<string, unknown>)
    : {}
  const previousObjectRef = isPlainObject(previous['objectRef'])
    ? { ...(previous['objectRef'] as Record<string, unknown>) }
    : {}
  const previousFileName = isPlainObject(previous['fileName'])
    ? { ...(previous['fileName'] as Record<string, unknown>) }
    : {}
  const previousMime = isPlainObject(previous['mimeType'])
    ? { ...(previous['mimeType'] as Record<string, unknown>) }
    : {}
  const previousSize = isPlainObject(previous['sizeBytes'])
    ? { ...(previous['sizeBytes'] as Record<string, unknown>) }
    : {}
  const previousScan = isPlainObject(previous['scanStatus'])
    ? { ...(previous['scanStatus'] as Record<string, unknown>) }
    : {}

  const allowedMimeTypes = [...input.allowedMimeTypes]
  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'object'
  next['additionalProperties'] = false
  next['required'] = ['objectRef', 'fileName', 'mimeType', 'sizeBytes', 'scanStatus']
  next['properties'] = {
    objectRef: { ...previousObjectRef, type: 'string', minLength: 1 },
    fileName: { ...previousFileName, type: 'string', minLength: 1 },
    mimeType: { ...previousMime, type: 'string', enum: allowedMimeTypes },
    sizeBytes: {
      ...previousSize,
      type: 'integer',
      minimum: 1,
      maximum: input.maxFileSizeBytes,
    },
    scanStatus: { ...previousScan, type: 'string', enum: ['CLEAN'] },
  }
  next['x-dg20'] = {
    allowedMimeTypes,
    maxFileSizeBytes: input.maxFileSizeBytes,
  }
  return next as JsonObject
}

/**
 * Read DigiLocker document type draft from an admitted schema.
 */
export function readDigiLockerDocumentTypeCodeDraft(
  schema: Readonly<Record<string, unknown>>,
): string {
  const admission = admitDigiLockerXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError(
      'inconsistent_definition',
      'Field digilocker-fetch extension is invalid',
    )
  }
  return admission.value.digiLockerDocumentTypeCode
}

/**
 * Canonical digilocker-fetch Apply: synchronize documentTypeCode.const and x-dg20.
 */
export function applyCanonicalDigiLockerSchema(
  schema: JsonObject,
  digiLockerDocumentTypeCode: string,
): JsonObject {
  const previous = isPlainObject(schema['properties'])
    ? (schema['properties'] as Record<string, unknown>)
    : {}
  const previousIssuer = isPlainObject(previous['issuerSignedRef'])
    ? { ...(previous['issuerSignedRef'] as Record<string, unknown>) }
    : {}
  const previousDocType = isPlainObject(previous['documentTypeCode'])
    ? { ...(previous['documentTypeCode'] as Record<string, unknown>) }
    : {}

  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'object'
  next['additionalProperties'] = false
  next['required'] = ['issuerSignedRef', 'documentTypeCode']
  next['properties'] = {
    issuerSignedRef: { ...previousIssuer, type: 'string', minLength: 1 },
    documentTypeCode: {
      ...previousDocType,
      type: 'string',
      const: digiLockerDocumentTypeCode,
    },
  }
  next['x-dg20'] = { digiLockerDocumentTypeCode }
  return next as JsonObject
}

/**
 * Read feeRuleId draft from an admitted fee-field schema.
 */
export function readFeeRuleIdDraft(schema: Readonly<Record<string, unknown>>): string {
  const admission = admitFeeFieldXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError('inconsistent_definition', 'Field fee-field extension is invalid')
  }
  return admission.value.feeRuleId
}

/**
 * Canonical fee-field Apply: synchronize feeRuleId.const and x-dg20.feeRuleId.
 * Preserves currency INR const and amountMinor bounds.
 */
export function applyCanonicalFeeFieldSchema(schema: JsonObject, feeRuleId: string): JsonObject {
  const previous = isPlainObject(schema['properties'])
    ? (schema['properties'] as Record<string, unknown>)
    : {}
  const previousFeeRule = isPlainObject(previous['feeRuleId'])
    ? { ...(previous['feeRuleId'] as Record<string, unknown>) }
    : {}
  const previousContext = isPlainObject(previous['contextRevision'])
    ? { ...(previous['contextRevision'] as Record<string, unknown>) }
    : {}
  const previousCurrency = isPlainObject(previous['currency'])
    ? { ...(previous['currency'] as Record<string, unknown>) }
    : {}
  const previousAmount = isPlainObject(previous['amountMinor'])
    ? { ...(previous['amountMinor'] as Record<string, unknown>) }
    : {}
  const previousQuote = isPlainObject(previous['quoteRef'])
    ? { ...(previous['quoteRef'] as Record<string, unknown>) }
    : {}

  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'object'
  next['additionalProperties'] = false
  next['required'] = ['feeRuleId', 'contextRevision', 'currency', 'amountMinor', 'quoteRef']
  next['properties'] = {
    feeRuleId: { ...previousFeeRule, type: 'string', const: feeRuleId },
    contextRevision: { ...previousContext, type: 'string', minLength: 1 },
    currency: { ...previousCurrency, type: 'string', const: 'INR' },
    amountMinor: {
      ...previousAmount,
      type: 'integer',
      minimum: 0,
      maximum: FEE_AMOUNT_MINOR_MAX,
    },
    quoteRef: { ...previousQuote, type: 'string', minLength: 1 },
  }
  next['x-dg20'] = { feeRuleId }
  return next as JsonObject
}

/**
 * Read declarationId draft from an admitted eligibility-declaration schema.
 */
export function readDeclarationIdDraft(schema: Readonly<Record<string, unknown>>): string {
  const admission = admitEligibilityDeclarationXDg20(schema)
  if (admission.kind !== 'valid') {
    throw new AuthoringError(
      'inconsistent_definition',
      'Field eligibility-declaration extension is invalid',
    )
  }
  return admission.value.declarationId
}

/**
 * Canonical eligibility-declaration Apply: synchronize declarationId.const and
 * x-dg20.declarationId while preserving the exact governed reference shape.
 */
export function applyCanonicalEligibilityDeclarationSchema(
  schema: JsonObject,
  declarationId: string,
): JsonObject {
  const previous = isPlainObject(schema['properties'])
    ? (schema['properties'] as Record<string, unknown>)
    : {}
  const previousDeclarationId = isPlainObject(previous['declarationId'])
    ? { ...(previous['declarationId'] as Record<string, unknown>) }
    : {}
  const previousAccepted = isPlainObject(previous['accepted'])
    ? { ...(previous['accepted'] as Record<string, unknown>) }
    : {}
  const previousLocale = isPlainObject(previous['locale'])
    ? { ...(previous['locale'] as Record<string, unknown>) }
    : {}
  const previousReceipt = isPlainObject(previous['consentReceiptRef'])
    ? { ...(previous['consentReceiptRef'] as Record<string, unknown>) }
    : {}

  const next: Record<string, unknown> = { ...schema }
  next['type'] = 'object'
  next['additionalProperties'] = false
  next['required'] = ['declarationId', 'accepted', 'locale', 'consentReceiptRef']
  next['properties'] = {
    declarationId: { ...previousDeclarationId, type: 'string', const: declarationId },
    accepted: { ...previousAccepted, type: 'boolean' },
    locale: { ...previousLocale, type: 'string', enum: ['en', 'gu'] },
    consentReceiptRef: { ...previousReceipt, type: 'string', minLength: 1 },
  }
  next['x-dg20'] = { declarationId }
  return next as JsonObject
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
