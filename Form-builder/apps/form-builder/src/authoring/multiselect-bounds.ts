/**
 * Multiselect minItems/maxItems draft parsing and required-min rules (FB-D10 / FB-D10.1).
 * Reuses canonical nonnegative safe-integer draft grammar (no silent trim/coerce).
 *
 * JSON Schema is authoritative: a root-required multiselect must serialize an
 * explicit minItems >= 1. There is no virtual/client-only effective minimum.
 */

import { parseOptionalNonnegativeSafeIntegerString } from './age-integer.js'

export type MultiselectBoundsParse =
  | {
      readonly ok: true
      readonly minItems: number | undefined
      readonly maxItems: number | undefined
    }
  | {
      readonly ok: false
      readonly firstInvalidControl: 'minItems' | 'maxItems'
      readonly code: 'min_items_invalid' | 'max_items_invalid' | 'items_range_invalid'
    }

/**
 * Parse optional bound draft strings and enforce min <= max when both present.
 * Blank → absent. Does not invent a required minimum (caller does).
 */
export function parseMultiselectBoundsDrafts(
  minItemsDraft: string,
  maxItemsDraft: string,
): MultiselectBoundsParse {
  const minParsed = parseOptionalNonnegativeSafeIntegerString(minItemsDraft)
  if (!minParsed.ok) {
    return { ok: false, firstInvalidControl: 'minItems', code: 'min_items_invalid' }
  }
  const maxParsed = parseOptionalNonnegativeSafeIntegerString(maxItemsDraft)
  if (!maxParsed.ok) {
    return { ok: false, firstInvalidControl: 'maxItems', code: 'max_items_invalid' }
  }
  const minItems = minParsed.value
  const maxItems = maxParsed.value
  if (minItems !== undefined && maxItems !== undefined && maxItems < minItems) {
    return { ok: false, firstInvalidControl: 'maxItems', code: 'items_range_invalid' }
  }
  return { ok: true, minItems, maxItems }
}

/**
 * Required multiselect must have an explicit minItems >= 1 (FB-D10.1).
 * Missing minItems is invalid when required — never treated as a virtual minimum.
 * maxItems, when present with minItems, must be >= minItems (also enforced by parse).
 * Does not silently insert minItems=1.
 */
export function assessMultiselectEffectiveBounds(input: {
  readonly minItems: number | undefined
  readonly maxItems: number | undefined
  readonly required: boolean
}):
  | { readonly ok: true; readonly effectiveMin: number }
  | {
      readonly ok: false
      readonly firstInvalidControl: 'minItems' | 'maxItems'
      readonly code: 'items_range_invalid' | 'required_min_items_invalid'
    } {
  if (input.required) {
    if (input.minItems === undefined || input.minItems < 1) {
      return { ok: false, firstInvalidControl: 'minItems', code: 'required_min_items_invalid' }
    }
  }
  if (
    input.minItems !== undefined &&
    input.maxItems !== undefined &&
    input.maxItems < input.minItems
  ) {
    return { ok: false, firstInvalidControl: 'maxItems', code: 'items_range_invalid' }
  }
  return { ok: true, effectiveMin: input.minItems ?? 0 }
}

/**
 * Integrity helper: admitted multiselect schema under root-required must expose
 * explicit minItems >= 1. Detect only — never repairs.
 */
export function multiselectSchemaSatisfiesRootRequiredMinItems(
  schema: Readonly<Record<string, unknown>>,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(schema, 'minItems')) {
    return false
  }
  const minItems = schema['minItems']
  return typeof minItems === 'number' && Number.isSafeInteger(minItems) && minItems >= 1
}

/** Canonical draft string for a present bound (or empty when absent). */
export function boundNumberToDraft(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return ''
  }
  return String(value)
}
