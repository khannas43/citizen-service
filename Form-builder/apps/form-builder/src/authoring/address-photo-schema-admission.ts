/**
 * Strict address-block + photo-capture schema admission (FB-D11).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import {
  PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
  PHOTO_CAPTURE_MAX_BYTES,
  PHOTO_CAPTURE_MAX_DIMENSION,
  PHOTO_CAPTURE_MIN_DIMENSION,
} from '@citizen/form-widgets'

import { isExactMasterListId } from './master-list-schema-admission.js'
import type { XDg20AdmissionResult } from './master-list-schema-admission.js'

const ADDRESS_CODE_PROPERTIES = ['stateCode', 'districtCode', 'talukaCode', 'villageCode'] as const

const PHOTO_PROPERTIES = [
  'objectRef',
  'mimeType',
  'sizeBytes',
  'width',
  'height',
  'scanStatus',
] as const

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
    for (let index = 0; index < requiredRaw.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(requiredRaw, index)) {
        return false
      }
      const desc = Object.getOwnPropertyDescriptor(requiredRaw, index)
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
      const value = desc.value
      if (typeof value !== 'string') {
        return false
      }
      if (!expectedMembers.includes(value) || seen.has(value)) {
        return false
      }
      seen.add(value)
    }
    return seen.size === expectedMembers.length
  } catch {
    return false
  }
}

function admitStringMinLengthOne(properties: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  if (readOwnDataProperty(member, 'type') !== 'string') {
    return false
  }
  return readOwnDataProperty(member, 'minLength') === 1
}

function admitExactStringEnum(
  properties: Record<string, unknown>,
  key: string,
  expectedEnum: readonly string[],
): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  if (readOwnDataProperty(member, 'type') !== 'string') {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(member, 'enum'), expectedEnum)
}

function admitBoundedInteger(
  properties: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(properties, key)) {
    return false
  }
  const member = readOwnDataProperty(properties, key)
  if (!isOrdinaryJsonObject(member) || hasHostileOwnShape(member)) {
    return false
  }
  if (readOwnDataProperty(member, 'type') !== 'integer') {
    return false
  }
  const min = readOwnDataProperty(member, 'minimum')
  const max = readOwnDataProperty(member, 'maximum')
  return min === minimum && max === maximum
}

/**
 * Admit address-block x-dg20: absent, or exact `{ defaultStateCode }` (nonblank, unpadded).
 */
export function admitAddressBlockXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<{ readonly defaultStateCode: string }> {
  if (!Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'absent' }
  }
  const raw = readOwnDataProperty(schema as object, 'x-dg20')
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, 'x-dg20')) {
    return { kind: 'invalid' }
  }
  if (!isOrdinaryJsonObject(raw) || hasHostileOwnShape(raw)) {
    return { kind: 'invalid' }
  }
  const keys = Object.keys(raw)
  if (keys.length !== 1 || keys[0] !== 'defaultStateCode') {
    return { kind: 'invalid' }
  }
  const code = readOwnDataProperty(raw, 'defaultStateCode')
  if (!isExactMasterListId(code)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { defaultStateCode: code } }
}

/** Geography codes only; optional exact defaultStateCode x-dg20. */
export function isAdmittedAddressBlockSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, ADDRESS_CODE_PROPERTIES)) {
    return false
  }
  for (const key of ADDRESS_CODE_PROPERTIES) {
    if (!admitStringMinLengthOne(propertiesRaw, key)) {
      return false
    }
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), ['stateCode'])) {
    return false
  }
  return admitAddressBlockXDg20(schema).kind !== 'invalid'
}

/** Reference metadata only; x-dg20 must be absent; policy matches Unit A constants. */
export function isAdmittedPhotoCaptureSchema(schema: unknown): boolean {
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
  if (!isOrdinaryJsonObject(propertiesRaw) || hasHostileOwnShape(propertiesRaw)) {
    return false
  }
  if (!hasExactPropertyMembers(propertiesRaw, PHOTO_PROPERTIES)) {
    return false
  }
  if (!admitStringMinLengthOne(propertiesRaw, 'objectRef')) {
    return false
  }
  if (!admitExactStringEnum(propertiesRaw, 'mimeType', PHOTO_CAPTURE_ALLOWED_MIME_TYPES)) {
    return false
  }
  if (!admitBoundedInteger(propertiesRaw, 'sizeBytes', 1, PHOTO_CAPTURE_MAX_BYTES)) {
    return false
  }
  if (
    !admitBoundedInteger(
      propertiesRaw,
      'width',
      PHOTO_CAPTURE_MIN_DIMENSION,
      PHOTO_CAPTURE_MAX_DIMENSION,
    )
  ) {
    return false
  }
  if (
    !admitBoundedInteger(
      propertiesRaw,
      'height',
      PHOTO_CAPTURE_MIN_DIMENSION,
      PHOTO_CAPTURE_MAX_DIMENSION,
    )
  ) {
    return false
  }
  if (!admitExactStringEnum(propertiesRaw, 'scanStatus', ['CLEAN'])) {
    return false
  }
  return admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), PHOTO_PROPERTIES)
}

export type AddressPhotoWidgetType = 'address-block' | 'photo-capture'

export function isAddressPhotoWidgetType(widgetType: string): widgetType is AddressPhotoWidgetType {
  return widgetType === 'address-block' || widgetType === 'photo-capture'
}

export function isAdmittedAddressPhotoSchema(
  widgetType: AddressPhotoWidgetType,
  schema: unknown,
): boolean {
  switch (widgetType) {
    case 'address-block':
      return isAdmittedAddressBlockSchema(schema)
    case 'photo-capture':
      return isAdmittedPhotoCaptureSchema(schema)
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return false
    }
  }
}
