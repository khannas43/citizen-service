import type { FormDefinition } from '@dg20/form-contract'

import { cloneJsonSafeObject } from '../authoring/index.js'
import { admitClonedDraftFormDefinition } from './admit-persistence-response.js'

export type PreparePersistenceRequestResult =
  | { readonly ok: true; readonly definition: FormDefinition }
  | { readonly ok: false; readonly reason: 'integrity_failed' | 'unsafe_json' | 'not_draft' }

/**
 * Detached JSON-safe draft FormDefinition for create/replace (FB-D7 / D7.1.1).
 * Clones before any inspection of the caller-owned object.
 */
export function preparePersistenceRequest(
  definition: FormDefinition,
): PreparePersistenceRequestResult {
  try {
    const cloned = cloneJsonSafeObject(definition)
    if (!cloned.ok) {
      return { ok: false, reason: 'unsafe_json' }
    }

    const admitted = admitClonedDraftFormDefinition(cloned.value)
    if (!admitted.ok) {
      if (admitted.reason === 'not_draft') {
        return { ok: false, reason: 'not_draft' }
      }
      return { ok: false, reason: 'integrity_failed' }
    }

    return { ok: true, definition: admitted.definition }
  } catch {
    return { ok: false, reason: 'unsafe_json' }
  }
}
