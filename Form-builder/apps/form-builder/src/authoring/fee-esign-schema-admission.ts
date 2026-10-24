/**
 * Strict fee-field + signature-esign schema admission (FB-D13).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import { isExactMasterListId } from './master-list-schema-admission.js'
import type { XDg20AdmissionResult } from './master-list-schema-admission.js'

/** Cross-package with Unit A isValidFeeAmountMinor / Number.MAX_SAFE_INTEGER. */
export const FEE_AMOUNT_MINOR_MAX = Number.MAX_SAFE_INTEGER

export type FeeEsignWidgetType = 'fee-field' | 'signature-esign'

const FEE_PROPERTIES = [
  'feeRuleId',
  'contextRevision',
  'currency',
  'amountMinor',
  'quoteRef',
] as const

const SIGNATURE_PROPERTIES = ['contextRevision', 'signedArtefactRef'] as const

function isOrdinaryJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  } catch {
    return false
  }
}

function readOwnDataProperty(obj: object, key: string): unknown {
  try {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc || desc.get !== undefined || desc.set !== undefined) {
      return undefined
    }
    return desc.value
  } catch {
    return undefined
  }
}

function hasHostileOwnShape(obj: object): boolean {
  try {
    if (Object.getOwnPropertySymbols(obj).length > 0) {
      return true
    }
    const names = Object.getOwnPropertyNames(obj)
    const enumerable = Object.keys(obj)
    if (names.length !== enumerable.length) {
      return true
    }
    for (const key of names) {
      const desc = Object.getOwnPropertyDescriptor(obj, key)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return true
      }
    }
    return false
  } catch {
    return true
  }
}

function hasExactPropertyMembers(
  properties: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(properties)
  if (keys.length !== expected.length) {
    return false
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      return false
    }
  }
  return true
}

function admitExactRequiredMembers(
  requiredRaw: unknown,
  expectedMembers: readonly string[],
): boolean {
  if (!Array.isArray(requiredRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(requiredRaw).length > 0) {
      return false
    }
    if (requiredRaw.length !== expectedMembers.length) {
      return false
    }
    const seen = new Set<string>()
    for (let i = 0; i < requiredRaw.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      const item = desc.value
      if (typeof item !== 'string' || item !== expectedMembers[i]) {
        return false
      }
      if (seen.has(item)) {
        return false
      }
      seen.add(item)
    }
    return seen.size === expectedMembers.length
  } catch {
    return false
  }
}

function admitStringMinLengthOne(node: unknown): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  return (
    readOwnDataProperty(node, 'type') === 'string' && readOwnDataProperty(node, 'minLength') === 1
  )
}

function admitExactStringConst(node: unknown, expected: string): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  return (
    readOwnDataProperty(node, 'type') === 'string' &&
    readOwnDataProperty(node, 'const') === expected
  )
}

function admitAmountMinor(node: unknown): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  if (readOwnDataProperty(node, 'type') !== 'integer') {
    return false
  }
  return (
    readOwnDataProperty(node, 'minimum') === 0 &&
    readOwnDataProperty(node, 'maximum') === FEE_AMOUNT_MINOR_MAX
  )
}

/** Exact feeRuleId: nonblank, unpadded, never a URL, never HTTP-resolved. */
export function isExactFeeRuleId(value: unknown): value is string {
  return isExactMasterListId(value)
}

export type AdmittedFeeFieldXDg20 = {
  readonly feeRuleId: string
}

export function admitFeeFieldXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedFeeFieldXDg20> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1 || keys[0] !== 'feeRuleId') {
    return { kind: 'invalid' }
  }
  const feeRuleId = readOwnDataProperty(raw, 'feeRuleId')
  if (!isExactFeeRuleId(feeRuleId)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { feeRuleId } }
}

export function isAdmittedFeeFieldSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const xdg20 = admitFeeFieldXDg20(schema)
  if (xdg20.kind !== 'valid') {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, FEE_PROPERTIES)
  ) {
    return false
  }
  if (
    !admitExactStringConst(readOwnDataProperty(propertiesRaw, 'feeRuleId'), xdg20.value.feeRuleId)
  ) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'contextRevision'))) {
    return false
  }
  if (!admitExactStringConst(readOwnDataProperty(propertiesRaw, 'currency'), 'INR')) {
    return false
  }
  if (!admitAmountMinor(readOwnDataProperty(propertiesRaw, 'amountMinor'))) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'quoteRef'))) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), FEE_PROPERTIES)) {
    return false
  }
  return true
}

export function isAdmittedSignatureEsignSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, SIGNATURE_PROPERTIES)
  ) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'contextRevision'))) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'signedArtefactRef'))) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), SIGNATURE_PROPERTIES)) {
    return false
  }
  return true
}

export function isFeeEsignWidgetType(widgetType: string): widgetType is FeeEsignWidgetType {
  return widgetType === 'fee-field' || widgetType === 'signature-esign'
}

export function isAdmittedFeeEsignSchema(widgetType: string, schema: unknown): boolean {
  if (widgetType === 'fee-field') {
    return isAdmittedFeeFieldSchema(schema)
  }
  if (widgetType === 'signature-esign') {
    return isAdmittedSignatureEsignSchema(schema)
  }
  return false
}
