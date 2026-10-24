/**
 * Strict eligibility-declaration schema admission (FB-D14).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import { isExactMasterListId } from './master-list-schema-admission.js'
import type { XDg20AdmissionResult } from './master-list-schema-admission.js'

export type EligibilityDeclarationWidgetType = 'eligibility-declaration'

const ELIGIBILITY_PROPERTIES = ['declarationId', 'accepted', 'locale', 'consentReceiptRef'] as const

const LOCALE_ENUM = ['en', 'gu'] as const

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

function admitBooleanType(node: unknown): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  return readOwnDataProperty(node, 'type') === 'boolean'
}

function admitExactOrderedStringEnum(node: unknown, expected: readonly string[]): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  if (readOwnDataProperty(node, 'type') !== 'string') {
    return false
  }
  const enumRaw = readOwnDataProperty(node, 'enum')
  if (!Array.isArray(enumRaw)) {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(enumRaw).length > 0) {
      return false
    }
    if (enumRaw.length !== expected.length) {
      return false
    }
    for (let i = 0; i < expected.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(enumRaw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      if (desc.value !== expected[i]) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/** Exact declarationId: nonblank, unpadded, never a URL, never HTTP-resolved. */
export function isExactDeclarationId(value: unknown): value is string {
  return isExactMasterListId(value)
}

/** Exact declaration text: nonblank, unpadded. */
export function isExactDeclarationText(value: unknown): value is string {
  return isExactMasterListId(value)
}

export type AdmittedEligibilityDeclarationXDg20 = {
  readonly declarationId: string
}

export function admitEligibilityDeclarationXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedEligibilityDeclarationXDg20> {
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
  if (keys.length !== 1 || keys[0] !== 'declarationId') {
    return { kind: 'invalid' }
  }
  const declarationId = readOwnDataProperty(raw, 'declarationId')
  if (!isExactDeclarationId(declarationId)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { declarationId } }
}

export function isAdmittedEligibilityDeclarationSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const xdg20 = admitEligibilityDeclarationXDg20(schema)
  if (xdg20.kind !== 'valid') {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, ELIGIBILITY_PROPERTIES)
  ) {
    return false
  }
  if (
    !admitExactStringConst(
      readOwnDataProperty(propertiesRaw, 'declarationId'),
      xdg20.value.declarationId,
    )
  ) {
    return false
  }
  if (!admitBooleanType(readOwnDataProperty(propertiesRaw, 'accepted'))) {
    return false
  }
  if (!admitExactOrderedStringEnum(readOwnDataProperty(propertiesRaw, 'locale'), LOCALE_ENUM)) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'consentReceiptRef'))) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), ELIGIBILITY_PROPERTIES)) {
    return false
  }
  return true
}

export function isEligibilityDeclarationWidgetType(
  widgetType: string,
): widgetType is EligibilityDeclarationWidgetType {
  return widgetType === 'eligibility-declaration'
}
