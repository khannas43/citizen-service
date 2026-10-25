import type { FormDefinition, JsonObject } from '@citizen/form-contract'

import { cloneJsonSafeObject } from './clone.js'
import { isRepeaterDescendantPath } from './family-repeater-paths.js'
import { assertDefinitionIntegrity, findStepIndexForField, readUiOrder } from './integrity.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type RemoveBlockingReason = 'final_form_field' | 'final_step_field'

export interface RemoveCapability {
  readonly canRemove: boolean
  readonly blockingReason: RemoveBlockingReason | null
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) {
      next[k] = v
    }
  }
  return next
}

function shouldScrubMetaFieldId(metaFieldId: string, rootFieldId: string): boolean {
  return metaFieldId === rootFieldId || isRepeaterDescendantPath(metaFieldId, rootFieldId)
}

function omitBilingualMatching(
  bucket: Readonly<Record<string, { en: string; gu: string }>>,
  rootFieldId: string,
): Record<string, { en: string; gu: string }> {
  const next: Record<string, { en: string; gu: string }> = {}
  for (const [k, v] of Object.entries(bucket)) {
    if (!shouldScrubMetaFieldId(k, rootFieldId)) {
      next[k] = v
    }
  }
  return next
}

/**
 * Whether `fieldId` can be removed from the authoring session:
 * - `final_form_field`: it is the only remaining field on the whole form.
 * - `final_step_field`: it is the only field left in its progressive step
 *   (removing it would leave that step empty, which is never allowed).
 *
 * Returns `canRemove: false, blockingReason: null` when the definition is
 * inconsistent or the field cannot be located — capability queries never
 * throw.
 */
export function getRemoveCapability(
  state: BuilderAuthoringState,
  fieldId: string | null,
): RemoveCapability {
  if (fieldId === null) {
    return { canRemove: false, blockingReason: null }
  }
  try {
    assertDefinitionIntegrity(state.definition)
  } catch {
    return { canRemove: false, blockingReason: null }
  }

  const uiOrder = readUiOrder(state.definition)
  if (!uiOrder.includes(fieldId)) {
    return { canRemove: false, blockingReason: null }
  }
  if (uiOrder.length <= 1) {
    return { canRemove: false, blockingReason: 'final_form_field' }
  }

  const steps = state.definition.meta.progressiveSteps
  const stepIndex = findStepIndexForField(steps, fieldId)
  if (stepIndex >= 0) {
    const step = steps[stepIndex]!
    if (step.fieldIds.length <= 1) {
      return { canRemove: false, blockingReason: 'final_step_field' }
    }
  }

  return { canRemove: true, blockingReason: null }
}

/**
 * Atomically remove a field from every governed location and preview formData.
 * Prevents removal of the final remaining field on the form, and prevents
 * removal of the final remaining field of any progressive step (a step must
 * never be emptied — steps are not silently deleted or merged). Rejection
 * never mutates state.
 *
 * When removing a family-repeater root, also scrubs every descendant
 * `root[].*` provenance/bilingual/bindings path without prefix collision.
 */
export function removeField(state: BuilderAuthoringState, fieldId: string): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const uiOrder = readUiOrder(state.definition)
  const index = uiOrder.indexOf(fieldId)
  if (index < 0) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }

  const capability = getRemoveCapability(state, fieldId)
  if (!capability.canRemove) {
    if (capability.blockingReason === 'final_step_field') {
      return {
        ok: false,
        error: new AuthoringError(
          'cannot_empty_progressive_step',
          'Cannot remove the last remaining field of a progressive step',
        ),
      }
    }
    return {
      ok: false,
      error: new AuthoringError(
        'cannot_remove_last_field',
        'Cannot remove the last remaining field',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const properties = omitKey(
    nextDefinition.jsonSchema.properties as Record<string, JsonObject>,
    fieldId,
  )

  const requiredRaw = nextDefinition.jsonSchema['required']
  const required = Array.isArray(requiredRaw)
    ? requiredRaw.filter((item): item is string => typeof item === 'string' && item !== fieldId)
    : undefined

  const nextUiOrder = uiOrder.filter((id) => id !== fieldId)
  const uiSchemaRecord = { ...nextDefinition.uiSchema } as Record<string, unknown>
  delete uiSchemaRecord[fieldId]
  uiSchemaRecord['ui:order'] = nextUiOrder

  const bilingual = nextDefinition.meta.bilingual
  const definition: FormDefinition = {
    ...nextDefinition,
    jsonSchema: {
      ...nextDefinition.jsonSchema,
      properties,
      ...(required !== undefined ? { required } : {}),
    },
    uiSchema: uiSchemaRecord as FormDefinition['uiSchema'],
    meta: {
      ...nextDefinition.meta,
      paletteProvenance: nextDefinition.meta.paletteProvenance.filter(
        (entry) => !shouldScrubMetaFieldId(entry.fieldId, fieldId),
      ),
      bilingual: {
        labels: omitBilingualMatching(bilingual.labels, fieldId),
        help: omitBilingualMatching(bilingual.help, fieldId),
        errors: omitBilingualMatching(bilingual.errors, fieldId),
      },
      prefillBindings: nextDefinition.meta.prefillBindings.filter(
        (b) => !shouldScrubMetaFieldId(b.fieldId, fieldId),
      ),
      integrationBindings: nextDefinition.meta.integrationBindings.filter(
        (b) => !shouldScrubMetaFieldId(b.fieldId, fieldId),
      ),
      workflowBindings: nextDefinition.meta.workflowBindings.filter(
        (b) => !shouldScrubMetaFieldId(b.fieldId, fieldId),
      ),
      progressiveSteps: nextDefinition.meta.progressiveSteps.map((step) => ({
        ...step,
        fieldIds: step.fieldIds.filter((id) => id !== fieldId),
      })),
    },
  }

  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const nearest =
    nextUiOrder[Math.min(index, nextUiOrder.length - 1)] ??
    nextUiOrder[nextUiOrder.length - 1] ??
    null

  const previewFormData = omitKey(state.previewFormData, fieldId)

  const removedLabel = state.definition.meta.bilingual.labels[fieldId]?.en ?? fieldId

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: nearest,
      previewFormData,
    },
    announcementKey: 'announceFieldRemoved',
    announcementVars: { label: removedLabel, fieldId },
  }
}
