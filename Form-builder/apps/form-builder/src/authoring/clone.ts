import type { JsonObject } from '@dg20/form-contract'
import { createAutosaveSnapshot } from '@dg20/form-renderer'

import { AuthoringError } from './types.js'

export type CloneJsonSafeResult =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly error: AuthoringError }

/**
 * Strict JSON-safe deep clone of a root object, built on the same hostile-input
 * rules as autosave (FB-B2.1): rejects cycles, accessor properties, symbol
 * keys, sparse arrays, non-finite numbers, functions, Dates/Maps/Sets/etc.,
 * and values beyond the documented depth/node bounds.
 *
 * Own keys named `__proto__`, `constructor`, and `prototype` are intentionally
 * preserved as ordinary data properties on null-prototype result objects
 * (they are not rejected and do not mutate Object.prototype). Never throws for
 * hostile input — reports a typed {@link AuthoringError} carrying the
 * machine-readable reason instead.
 *
 * Used by authoring operations (`addField` / `removeField` / `moveField`)
 * which surface failure via `AuthoringResult` rather than throwing.
 */
export function cloneJsonSafeObject(value: unknown): CloneJsonSafeResult {
  const result = createAutosaveSnapshot(value)
  if (!result.ok) {
    return {
      ok: false,
      error: new AuthoringError('unsafe_json_value', 'Value is not a JSON-safe object', {
        reason: result.reason,
      }),
    }
  }
  return { ok: true, value: result.snapshot }
}

/**
 * Throwing variant of {@link cloneJsonSafeObject} for call sites that surface
 * failure by throwing `AuthoringError` (`createAuthoringSession`,
 * `setPreviewFormData`) rather than returning an `AuthoringResult`.
 */
export function cloneJsonSafe<T>(value: T): T {
  const cloned = cloneJsonSafeObject(value)
  if (!cloned.ok) {
    throw cloned.error
  }
  return cloned.value as T
}
