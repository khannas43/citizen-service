import type { FormDefinition } from '@dg20/form-contract'

import { cloneJsonSafeObject } from './clone.js'
import {
  assertDefinitionIntegrity,
  findStepIndexForField,
  readUiOrder,
  syncStepFieldIdsToUiOrder,
} from './integrity.js'
import {
  AuthoringError,
  type AuthoringResult,
  type BuilderAuthoringState,
  type MoveDirection,
} from './types.js'

export interface MoveCapability {
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
}

export type CanvasReorderTarget = {
  readonly beforeFieldId: string | null
  readonly isNoOp: boolean
}

export type CanvasReorderRequest = {
  readonly fieldId: string
  readonly beforeFieldId: string | null
}

function scopeForField(
  definition: FormDefinition,
  fieldId: string,
): { readonly fieldIds: readonly string[]; readonly stepIndex: number | null } | null {
  const order = readUiOrder(definition)
  if (!order.includes(fieldId)) return null
  const steps = definition.meta.progressiveSteps
  if (steps.length === 0) return { fieldIds: order, stepIndex: null }
  const stepIndex = findStepIndexForField(steps, fieldId)
  if (stepIndex < 0) return null
  return {
    fieldIds: syncStepFieldIdsToUiOrder(steps[stepIndex]!.fieldIds, order),
    stepIndex,
  }
}

function reorderedScope(
  fieldIds: readonly string[],
  fieldId: string,
  beforeFieldId: string | null,
): readonly string[] | null {
  if (!fieldIds.includes(fieldId)) return null
  if (beforeFieldId !== null && !fieldIds.includes(beforeFieldId)) return null
  // Inserting a field before itself is an explicit no-op (stay in place).
  if (beforeFieldId === fieldId) return [...fieldIds]
  const without = fieldIds.filter((id) => id !== fieldId)
  if (beforeFieldId === null) return [...without, fieldId]
  const index = without.indexOf(beforeFieldId)
  if (index < 0) return null
  return [...without.slice(0, index), fieldId, ...without.slice(index)]
}

/** Return every within-scope insertion target, including no-op targets. */
export function getCanvasReorderTargets(
  definition: FormDefinition,
  fieldId: string,
): readonly CanvasReorderTarget[] {
  try {
    assertDefinitionIntegrity(definition)
    const scope = scopeForField(definition, fieldId)
    if (!scope) return []
    return [...scope.fieldIds, null].map((beforeFieldId) => {
      const next = reorderedScope(scope.fieldIds, fieldId, beforeFieldId)
      return {
        beforeFieldId,
        isNoOp: next !== null && next.every((id, index) => id === scope.fieldIds[index]),
      }
    })
  } catch {
    return []
  }
}

/**
 * Reorder a root field inside its progressive step (or the single-page canvas).
 * Gesture state belongs in the reducer; this operation only changes a definition.
 */
export function reorderFieldWithinStep(
  state: BuilderAuthoringState,
  request: CanvasReorderRequest,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) return { ok: false, error }
    throw error
  }
  if (state.definition.status !== 'draft') {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Cannot reorder fields on a non-draft definition',
      ),
    }
  }
  const scope = scopeForField(state.definition, request.fieldId)
  if (!scope) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${request.fieldId}`),
    }
  }
  if (request.beforeFieldId !== null && !scope.fieldIds.includes(request.beforeFieldId)) {
    const order = readUiOrder(state.definition)
    if (order.includes(request.beforeFieldId)) {
      return {
        ok: false,
        error: new AuthoringError(
          'move_crosses_step_boundary',
          'Cannot move field across progressive-step boundary',
        ),
      }
    }
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${request.beforeFieldId}`),
    }
  }
  const nextScope = reorderedScope(scope.fieldIds, request.fieldId, request.beforeFieldId)
  if (nextScope === null) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${request.fieldId}`),
    }
  }
  if (nextScope.every((id, index) => id === scope.fieldIds[index])) {
    return {
      ok: true,
      state,
      announcementKey: 'announceFieldReordered',
      announcementVars: {
        label: state.definition.meta.bilingual.labels[request.fieldId]?.en ?? request.fieldId,
      },
    }
  }
  const order = readUiOrder(state.definition)
  const first = order.indexOf(scope.fieldIds[0]!)
  const nextOrder = [...order]
  nextOrder.splice(first, scope.fieldIds.length, ...nextScope)
  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) return { ok: false, error: cloned.error }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const progressiveSteps =
    scope.stepIndex === null
      ? nextDefinition.meta.progressiveSteps
      : nextDefinition.meta.progressiveSteps.map((step, index) =>
          index === scope.stepIndex
            ? { ...step, fieldIds: syncStepFieldIdsToUiOrder(step.fieldIds, nextOrder) }
            : step,
        )
  const definition: FormDefinition = {
    ...nextDefinition,
    uiSchema: { ...nextDefinition.uiSchema, 'ui:order': nextOrder },
    meta: { ...nextDefinition.meta, progressiveSteps },
  }
  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) return { ok: false, error }
    throw error
  }
  const label = state.definition.meta.bilingual.labels[request.fieldId]?.en ?? request.fieldId
  return {
    ok: true,
    state: { definition, selectedFieldId: request.fieldId, previewFormData: state.previewFormData },
    announcementKey: 'announceFieldReordered',
    announcementVars: { label, fieldId: request.fieldId },
  }
}

/**
 * Whether the selected field can move within its progressive step (D1).
 * Cross-step and canvas-boundary moves are disabled.
 */
export function getMoveCapability(
  state: BuilderAuthoringState,
  fieldId: string | null,
): MoveCapability {
  if (fieldId === null) {
    return { canMoveUp: false, canMoveDown: false }
  }
  try {
    assertDefinitionIntegrity(state.definition)
  } catch {
    return { canMoveUp: false, canMoveDown: false }
  }

  const uiOrder = readUiOrder(state.definition)
  const index = uiOrder.indexOf(fieldId)
  if (index < 0) {
    return { canMoveUp: false, canMoveDown: false }
  }

  const steps = state.definition.meta.progressiveSteps
  if (steps.length === 0) {
    return {
      canMoveUp: index > 0,
      canMoveDown: index < uiOrder.length - 1,
    }
  }

  const stepIndex = findStepIndexForField(steps, fieldId)
  if (stepIndex < 0) {
    return { canMoveUp: false, canMoveDown: false }
  }
  const step = steps[stepIndex]!
  const orderedInStep = syncStepFieldIdsToUiOrder(step.fieldIds, uiOrder)
  const positionInStep = orderedInStep.indexOf(fieldId)
  return {
    canMoveUp: positionInStep > 0,
    canMoveDown: positionInStep >= 0 && positionInStep < orderedInStep.length - 1,
  }
}

/**
 * Move a field up/down within its progressive step only.
 * Updates ui:order and that step's fieldIds; preserves formData and schema.
 */
export function moveField(
  state: BuilderAuthoringState,
  fieldId: string,
  direction: MoveDirection,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const capability = getMoveCapability(state, fieldId)
  if (direction === 'up' && !capability.canMoveUp) {
    return {
      ok: false,
      error: new AuthoringError(
        'move_at_canvas_boundary',
        'Cannot move field further up within its step',
      ),
    }
  }
  if (direction === 'down' && !capability.canMoveDown) {
    return {
      ok: false,
      error: new AuthoringError(
        'move_at_canvas_boundary',
        'Cannot move field further down within its step',
      ),
    }
  }

  const uiOrder = [...readUiOrder(state.definition)]
  const index = uiOrder.indexOf(fieldId)
  if (index < 0) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }

  const steps = state.definition.meta.progressiveSteps
  const swapOffset = direction === 'up' ? -1 : 1

  let swapIndex: number
  if (steps.length === 0) {
    swapIndex = index + swapOffset
  } else {
    const stepIndex = findStepIndexForField(steps, fieldId)
    if (stepIndex < 0) {
      return {
        ok: false,
        error: new AuthoringError(
          'inconsistent_definition',
          `Field not in any progressive step: ${fieldId}`,
        ),
      }
    }
    const step = steps[stepIndex]!
    const orderedInStep = syncStepFieldIdsToUiOrder(step.fieldIds, uiOrder)
    const positionInStep = orderedInStep.indexOf(fieldId)
    const neighborId = orderedInStep[positionInStep + swapOffset]
    if (neighborId === undefined) {
      return {
        ok: false,
        error: new AuthoringError(
          'move_crosses_step_boundary',
          'Cannot move field across progressive-step boundary',
        ),
      }
    }
    swapIndex = uiOrder.indexOf(neighborId)
  }

  if (swapIndex < 0 || swapIndex >= uiOrder.length) {
    return {
      ok: false,
      error: new AuthoringError('move_at_canvas_boundary', 'Move target is out of bounds'),
    }
  }

  // Guard: swap partner must be in the same step when steps exist.
  if (steps.length > 0) {
    const stepIndex = findStepIndexForField(steps, fieldId)
    const neighborStepIndex = findStepIndexForField(steps, uiOrder[swapIndex]!)
    if (stepIndex !== neighborStepIndex) {
      return {
        ok: false,
        error: new AuthoringError(
          'move_crosses_step_boundary',
          'Cannot move field across progressive-step boundary',
        ),
      }
    }
  }

  const target = direction === 'up' ? uiOrder[swapIndex]! : (uiOrder[swapIndex + 1] ?? null)
  const reordered = reorderFieldWithinStep(state, { fieldId, beforeFieldId: target })
  if (!reordered.ok) return reordered
  return {
    ...reordered,
    announcementKey: direction === 'up' ? 'announceFieldMovedUp' : 'announceFieldMovedDown',
  }
}
