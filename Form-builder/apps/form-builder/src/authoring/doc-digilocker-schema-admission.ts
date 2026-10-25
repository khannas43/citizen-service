/**
 * Strict doc-upload + digilocker-fetch schema admission (FB-D12).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import { DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES } from '@citizen/form-widgets'

import { isExactDigiLockerDocumentTypeCode } from './doc-digilocker-policy.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import type { XDg20AdmissionResult } from './master-list-schema-admission.js'

export type DocDigiLockerWidgetType = 'doc-upload' | 'digilocker-fetch'

const DOC_UPLOAD_PROPERTIES = [
  'objectRef',
  'fileName',
  'mimeType',
  'sizeBytes',
  'scanStatus',
] as const

const DIGILOCKER_PROPERTIES = ['issuerSignedRef', 'documentTypeCode'] as const

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

function admitExactStringEnum(node: unknown, expected: readonly string[]): boolean {
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

function admitBoundedInteger(node: unknown, minimum: number, maximum: number): boolean {
  if (!isOrdinaryJsonObject(node) || hasHostileOwnShape(node)) {
    return false
  }
  if (readOwnDataProperty(node, 'type') !== 'integer') {
    return false
  }
  const min = readOwnDataProperty(node, 'minimum')
  const max = readOwnDataProperty(node, 'maximum')
  return min === minimum && max === maximum
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

function arraysEqualExact(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function admitMimeArray(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined
  }
  try {
    if (Object.getOwnPropertySymbols(raw).length > 0) {
      return undefined
    }
    const seen = new Set<string>()
    const out: string[] = []
    for (let i = 0; i < raw.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(raw, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return undefined
      }
      const item = desc.value
      if (!isExactMasterListId(item)) {
        return undefined
      }
      if (seen.has(item)) {
        return undefined
      }
      seen.add(item)
      out.push(item)
    }
    return out
  } catch {
    return undefined
  }
}

export type AdmittedDocUploadXDg20 = {
  readonly allowedMimeTypes: readonly string[]
  readonly maxFileSizeBytes: number
}

/**
 * Admit required doc-upload x-dg20: exact `{ allowedMimeTypes, maxFileSizeBytes }`.
 */
export function admitDocUploadXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedDocUploadXDg20> {
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
  if (
    keys.length !== 2 ||
    !keys.includes('allowedMimeTypes') ||
    !keys.includes('maxFileSizeBytes')
  ) {
    return { kind: 'invalid' }
  }
  const allowedMimeTypes = admitMimeArray(readOwnDataProperty(raw, 'allowedMimeTypes'))
  if (allowedMimeTypes === undefined) {
    return { kind: 'invalid' }
  }
  const maxFileSizeBytes = readOwnDataProperty(raw, 'maxFileSizeBytes')
  if (
    typeof maxFileSizeBytes !== 'number' ||
    !Number.isSafeInteger(maxFileSizeBytes) ||
    maxFileSizeBytes <= 0 ||
    maxFileSizeBytes > DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES
  ) {
    return { kind: 'invalid' }
  }
  return {
    kind: 'valid',
    value: { allowedMimeTypes, maxFileSizeBytes },
  }
}

export function isAdmittedDocUploadSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const xdg20 = admitDocUploadXDg20(schema)
  if (xdg20.kind !== 'valid') {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, DOC_UPLOAD_PROPERTIES)
  ) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'objectRef'))) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'fileName'))) {
    return false
  }
  if (
    !admitExactStringEnum(
      readOwnDataProperty(propertiesRaw, 'mimeType'),
      xdg20.value.allowedMimeTypes,
    )
  ) {
    return false
  }
  if (
    !admitBoundedInteger(
      readOwnDataProperty(propertiesRaw, 'sizeBytes'),
      1,
      xdg20.value.maxFileSizeBytes,
    )
  ) {
    return false
  }
  if (!admitExactStringEnum(readOwnDataProperty(propertiesRaw, 'scanStatus'), ['CLEAN'])) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), DOC_UPLOAD_PROPERTIES)) {
    return false
  }
  return true
}

export type AdmittedDigiLockerXDg20 = {
  readonly digiLockerDocumentTypeCode: string
}

/**
 * Admit required digilocker-fetch x-dg20: exact `{ digiLockerDocumentTypeCode }`.
 */
export function admitDigiLockerXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<AdmittedDigiLockerXDg20> {
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
  if (keys.length !== 1 || keys[0] !== 'digiLockerDocumentTypeCode') {
    return { kind: 'invalid' }
  }
  const code = readOwnDataProperty(raw, 'digiLockerDocumentTypeCode')
  if (!isExactDigiLockerDocumentTypeCode(code)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { digiLockerDocumentTypeCode: code } }
}

export function isAdmittedDigiLockerSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const xdg20 = admitDigiLockerXDg20(schema)
  if (xdg20.kind !== 'valid') {
    return false
  }
  const propertiesRaw = readOwnDataProperty(schema, 'properties')
  if (
    !isOrdinaryJsonObject(propertiesRaw) ||
    hasHostileOwnShape(propertiesRaw) ||
    !hasExactPropertyMembers(propertiesRaw, DIGILOCKER_PROPERTIES)
  ) {
    return false
  }
  if (!admitStringMinLengthOne(readOwnDataProperty(propertiesRaw, 'issuerSignedRef'))) {
    return false
  }
  if (
    !admitExactStringConst(
      readOwnDataProperty(propertiesRaw, 'documentTypeCode'),
      xdg20.value.digiLockerDocumentTypeCode,
    )
  ) {
    return false
  }
  if (!admitExactRequiredMembers(readOwnDataProperty(schema, 'required'), DIGILOCKER_PROPERTIES)) {
    return false
  }
  return true
}

export function isDocDigiLockerWidgetType(
  widgetType: string,
): widgetType is DocDigiLockerWidgetType {
  return widgetType === 'doc-upload' || widgetType === 'digilocker-fetch'
}

export function isAdmittedDocDigiLockerSchema(widgetType: string, schema: unknown): boolean {
  if (widgetType === 'doc-upload') {
    return isAdmittedDocUploadSchema(schema)
  }
  if (widgetType === 'digilocker-fetch') {
    return isAdmittedDigiLockerSchema(schema)
  }
  return false
}

/** Exported for Apply synchronization checks (enum order must match x-dg20). */
export function mimeEnumsMatchConfigured(
  enumValues: readonly string[],
  configured: readonly string[],
): boolean {
  return arraysEqualExact(enumValues, configured)
}
