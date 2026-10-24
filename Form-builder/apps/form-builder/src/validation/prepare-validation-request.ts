import type { FormDefinition } from '@dg20/form-contract'

import { assertDefinitionIntegrity, cloneJsonSafeObject } from '../authoring/index.js'
import { AuthoringError } from '../authoring/types.js'

export type PrepareValidationRequestResult =
  | { readonly ok: true; readonly definition: FormDefinition }
  | { readonly ok: false; readonly reason: 'integrity_failed' | 'unsafe_json' }

/**
 * Detached JSON-safe snapshot of the committed FormDefinition for validation.
 * Runs integrity admission, then strict clone. Never calls the adapter.
 * Adapter mutation of the returned clone must not affect Builder state.
 */
export function prepareValidationRequest(
  definition: FormDefinition,
): PrepareValidationRequestResult {
  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, reason: 'integrity_failed' }
    }
    return { ok: false, reason: 'integrity_failed' }
  }

  const cloned = cloneJsonSafeObject(definition)
  if (!cloned.ok) {
    return { ok: false, reason: 'unsafe_json' }
  }

  try {
    assertDefinitionIntegrity(cloned.value as unknown as FormDefinition)
  } catch {
    return { ok: false, reason: 'integrity_failed' }
  }

  return { ok: true, definition: cloned.value as unknown as FormDefinition }
}
