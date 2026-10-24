/**
 * Family repeater helpers (FB-A12).
 * Configuration is authoritative JSON Schema on the array field — no x-dg20 / ui:options.
 */

import type { RJSFSchema, StrictRJSFSchema } from '@rjsf/utils'

/** Provisional governed ceiling; Unit C must enforce the same at publish. Requires product confirmation. */
export const FAMILY_REPEATER_GLOBAL_MAX_ROWS = 20

export type FamilyRepeaterConfigFailureReason =
  | 'not-array'
  | 'items-not-object'
  | 'items-tuple'
  | 'items-empty-properties'
  | 'additional-properties-not-false'
  | 'min-items-invalid'
  | 'max-items-invalid'
  | 'min-exceeds-max'
  | 'max-exceeds-global'

export type FamilyRepeaterConfigResolution =
  | {
      readonly ok: true
      readonly itemsSchema: StrictRJSFSchema
      readonly minItems: number
      readonly maxItems: number
      readonly propertyKeys: readonly string[]
    }
  | {
      readonly ok: false
      readonly reason: FamilyRepeaterConfigFailureReason
    }

function isPlainObjectSchema(value: unknown): value is StrictRJSFSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * Resolves family-repeater configuration from the field JSON Schema.
 * Member fields = items.properties; bounds = minItems/maxItems.
 */
export function resolveFamilyRepeaterConfig(
  schema: RJSFSchema | StrictRJSFSchema | undefined,
): FamilyRepeaterConfigResolution {
  if (!schema || schema.type !== 'array') {
    return { ok: false, reason: 'not-array' }
  }

  const items = schema.items
  if (Array.isArray(items)) {
    return { ok: false, reason: 'items-tuple' }
  }
  if (!isPlainObjectSchema(items) || items.type !== 'object') {
    return { ok: false, reason: 'items-not-object' }
  }

  const properties = items.properties
  if (
    typeof properties !== 'object' ||
    properties === null ||
    Array.isArray(properties) ||
    Object.keys(properties).length === 0
  ) {
    return { ok: false, reason: 'items-empty-properties' }
  }

  if (items.additionalProperties !== false) {
    return { ok: false, reason: 'additional-properties-not-false' }
  }

  const minRaw = schema.minItems
  const minItems = minRaw === undefined ? 0 : minRaw
  if (!isNonNegativeSafeInteger(minItems)) {
    return { ok: false, reason: 'min-items-invalid' }
  }

  const maxItems = schema.maxItems
  if (!isPositiveSafeInteger(maxItems)) {
    return { ok: false, reason: 'max-items-invalid' }
  }

  if (minItems > maxItems) {
    return { ok: false, reason: 'min-exceeds-max' }
  }

  if (maxItems > FAMILY_REPEATER_GLOBAL_MAX_ROWS) {
    return { ok: false, reason: 'max-exceeds-global' }
  }

  return {
    ok: true,
    itemsSchema: items,
    minItems,
    maxItems,
    propertyKeys: Object.keys(properties),
  }
}

export type FamilyRepeaterIncomingAssessment =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'oversized'; readonly length: number }
  | { readonly kind: 'valid'; readonly value: readonly Record<string, unknown>[] }

function isPlainRowObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Presentation-validates external formData. Never rewrites or emits.
 * Oversized arrays are rejected wholly (no partial render).
 */
export function assessFamilyRepeaterIncomingValue(
  value: unknown,
  maxItems: number,
): FamilyRepeaterIncomingAssessment {
  if (value === undefined || value === null) {
    return { kind: 'unanswered' }
  }
  if (!Array.isArray(value)) {
    return { kind: 'malformed' }
  }
  for (const row of value) {
    if (!isPlainRowObject(row)) {
      return { kind: 'malformed' }
    }
  }
  if (value.length > maxItems) {
    return { kind: 'oversized', length: value.length }
  }
  return {
    kind: 'valid',
    value: value as readonly Record<string, unknown>[],
  }
}

/** Emit helper — never injects row keys or UI metadata. */
export function emitFamilyRepeaterValue(
  rows: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] | undefined {
  if (rows.length === 0) {
    return undefined
  }
  return rows.map((row) => ({ ...row }))
}

export function createFamilyRepeaterRowKey(seed: number): string {
  return `fr-row-${seed}`
}

/**
 * Reconcile local React keys to an array length without persisting keys.
 * Preserves surviving keys when length grows/shrinks (internal Add/Remove).
 */
export function reconcileFamilyRepeaterRowKeys(
  previousKeys: readonly string[],
  length: number,
  nextSeed: () => number,
): string[] {
  if (length <= 0) {
    return []
  }
  if (previousKeys.length === length) {
    return [...previousKeys]
  }
  if (previousKeys.length < length) {
    const keys = [...previousKeys]
    while (keys.length < length) {
      keys.push(createFamilyRepeaterRowKey(nextSeed()))
    }
    return keys
  }
  return previousKeys.slice(0, length)
}

/** Fresh keys for a genuine external formData replacement (never guess by index). */
export function regenerateFamilyRepeaterRowKeys(length: number, nextSeed: () => number): string[] {
  return reconcileFamilyRepeaterRowKeys([], length, nextSeed)
}

export type FamilyRepeaterSchemaUtils = {
  retrieveSchema: (schema: StrictRJSFSchema, formData?: unknown) => StrictRJSFSchema
  toIdSchema: (
    schema: StrictRJSFSchema,
    id?: string,
    formData?: unknown,
    idPrefix?: string,
    idSeparator?: string,
  ) => { readonly $id?: string } & Record<string, unknown>
}

/**
 * Builds per-row resolved schema + idSchema matching RJSF ArrayField argument order.
 * Never passes rootSchema as row formData.
 */
export function buildFamilyRepeaterItemIdentity(input: {
  readonly schemaUtils: FamilyRepeaterSchemaUtils
  readonly itemsSchema: StrictRJSFSchema
  readonly row: Record<string, unknown>
  readonly parentId: string
  readonly index: number
  readonly idPrefix?: string
  readonly idSeparator?: string
}): {
  readonly resolvedItemSchema: StrictRJSFSchema
  readonly itemIdPrefix: string
  readonly itemIdSchema: { readonly $id?: string } & Record<string, unknown>
} {
  const idSeparator = input.idSeparator ?? '_'
  const resolvedItemSchema = input.schemaUtils.retrieveSchema(input.itemsSchema, input.row)
  const itemIdPrefix = `${input.parentId}${idSeparator}${input.index}`
  const itemIdSchema = input.schemaUtils.toIdSchema(
    resolvedItemSchema,
    itemIdPrefix,
    input.row,
    input.idPrefix,
    idSeparator,
  )
  return { resolvedItemSchema, itemIdPrefix, itemIdSchema }
}
