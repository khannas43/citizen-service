/**
 * Strict multiselect + cascading-dropdown schema admission (FB-D10).
 * Never repairs; never invokes accessors; never embeds hostile values in messages.
 */

import {
  admitMasterListXDg20,
  isAdmittedMasterListWidgetSchema,
  isExactMasterListId,
  type XDg20AdmissionResult,
} from './master-list-schema-admission.js'

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

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function admitOptionalBound(
  schema: Readonly<Record<string, unknown>>,
  key: 'minItems' | 'maxItems',
): { readonly ok: true; readonly value: number | undefined } | { readonly ok: false } {
  if (!Object.prototype.hasOwnProperty.call(schema, key)) {
    return { ok: true, value: undefined }
  }
  const raw = readOwnDataProperty(schema as object, key)
  if (raw === undefined && Object.prototype.hasOwnProperty.call(schema, key)) {
    return { ok: false }
  }
  if (!isNonnegativeSafeInteger(raw)) {
    return { ok: false }
  }
  return { ok: true, value: raw }
}

/**
 * Admit cascading x-dg20: exact `{ parentMasterListId, childMasterListId }`.
 * Parent and child may be equal. Absent is invalid for cascading-dropdown.
 */
export function admitCascadingXDg20(
  schema: Readonly<Record<string, unknown>>,
): XDg20AdmissionResult<{
  readonly parentMasterListId: string
  readonly childMasterListId: string
}> {
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
  const keySet = new Set(Object.keys(raw))
  if (keySet.size !== 2 || !keySet.has('parentMasterListId') || !keySet.has('childMasterListId')) {
    return { kind: 'invalid' }
  }
  const parentMasterListId = readOwnDataProperty(raw, 'parentMasterListId')
  const childMasterListId = readOwnDataProperty(raw, 'childMasterListId')
  if (!isExactMasterListId(parentMasterListId) || !isExactMasterListId(childMasterListId)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', value: { parentMasterListId, childMasterListId } }
}

function isAdmittedStringItems(items: unknown): boolean {
  if (!isOrdinaryJsonObject(items) || hasHostileOwnShape(items)) {
    return false
  }
  const keys = Object.keys(items)
  if (keys.length !== 1 || keys[0] !== 'type') {
    return false
  }
  return readOwnDataProperty(items, 'type') === 'string'
}

export function isAdmittedMultiselectSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'array') {
    return false
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'enum')) {
    return false
  }
  if (readOwnDataProperty(schema, 'uniqueItems') !== true) {
    return false
  }
  if (!isAdmittedStringItems(readOwnDataProperty(schema, 'items'))) {
    return false
  }
  if (admitMasterListXDg20(schema).kind !== 'valid') {
    return false
  }
  const min = admitOptionalBound(schema, 'minItems')
  const max = admitOptionalBound(schema, 'maxItems')
  if (!min.ok || !max.ok) {
    return false
  }
  if (min.value !== undefined && max.value !== undefined && max.value < min.value) {
    return false
  }
  return true
}

function isAdmittedCodeProperty(prop: unknown): boolean {
  if (!isOrdinaryJsonObject(prop) || hasHostileOwnShape(prop)) {
    return false
  }
  if (readOwnDataProperty(prop, 'type') !== 'string') {
    return false
  }
  if (readOwnDataProperty(prop, 'minLength') !== 1) {
    return false
  }
  const keys = new Set(Object.keys(prop))
  return keys.has('type') && keys.has('minLength')
}

export function isAdmittedCascadingDropdownSchema(schema: unknown): boolean {
  if (!isOrdinaryJsonObject(schema) || hasHostileOwnShape(schema)) {
    return false
  }
  if (readOwnDataProperty(schema, 'type') !== 'object') {
    return false
  }
  if (readOwnDataProperty(schema, 'additionalProperties') !== false) {
    return false
  }
  const properties = readOwnDataProperty(schema, 'properties')
  if (!isOrdinaryJsonObject(properties) || hasHostileOwnShape(properties)) {
    return false
  }
  const propKeySet = new Set(Object.keys(properties))
  if (propKeySet.size !== 2 || !propKeySet.has('parentCode') || !propKeySet.has('childCode')) {
    return false
  }
  if (
    !isAdmittedCodeProperty(readOwnDataProperty(properties, 'parentCode')) ||
    !isAdmittedCodeProperty(readOwnDataProperty(properties, 'childCode'))
  ) {
    return false
  }
  const required = readOwnDataProperty(schema, 'required')
  if (!Array.isArray(required) || Object.getPrototypeOf(required) !== Array.prototype) {
    return false
  }
  if (required.length !== 1 || required[0] !== 'parentCode') {
    return false
  }
  try {
    if (Object.getOwnPropertySymbols(required).length > 0) {
      return false
    }
    for (let i = 0; i < required.length; i += 1) {
      const desc = Object.getOwnPropertyDescriptor(required, String(i))
      if (!desc || desc.get !== undefined || desc.set !== undefined) {
        return false
      }
    }
  } catch {
    return false
  }
  return admitCascadingXDg20(schema).kind === 'valid'
}

export type GovernedMasterDataWidgetType =
  'dropdown-master' | 'radio' | 'multiselect' | 'cascading-dropdown'

export function isGovernedMasterDataWidgetType(
  widgetType: string,
): widgetType is GovernedMasterDataWidgetType {
  return (
    widgetType === 'dropdown-master' ||
    widgetType === 'radio' ||
    widgetType === 'multiselect' ||
    widgetType === 'cascading-dropdown'
  )
}

export function isAdmittedGovernedMasterDataSchema(
  widgetType: GovernedMasterDataWidgetType,
  schema: unknown,
): boolean {
  switch (widgetType) {
    case 'dropdown-master':
    case 'radio':
      return isAdmittedMasterListWidgetSchema(widgetType, schema)
    case 'multiselect':
      return isAdmittedMultiselectSchema(schema)
    case 'cascading-dropdown':
      return isAdmittedCascadingDropdownSchema(schema)
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return false
    }
  }
}
