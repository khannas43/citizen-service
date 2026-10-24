import type { FormDefinition, ProgressiveStep } from '@dg20/form-contract'

import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity, readUiOrder } from './integrity.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type BoundaryMoveDirection = 'earlier' | 'later'

export type MergeBlockedReason = 'step_has_unsaved_bilingual_changes'

export type SplitBlockedReason =
  | 'progressive_steps_not_enabled'
  | 'step_not_found'
  | 'field_not_in_step'
  | 'split_after_last_field'

export type BoundaryMoveBlockedReason =
  'progressive_steps_not_enabled' | 'boundary_not_found' | 'boundary_move_would_empty_step'

export interface SplitFieldCapability {
  readonly stepId: string
  readonly fieldId: string
  readonly canSplitAfter: boolean
  readonly blockedReason: SplitBlockedReason | null
}

export interface BoundaryCapability {
  readonly previousStepId: string
  readonly nextStepId: string
  readonly canMoveEarlier: boolean
  readonly canMoveLater: boolean
  readonly canMerge: boolean
  readonly moveEarlierBlockedReason: BoundaryMoveBlockedReason | null
  readonly moveLaterBlockedReason: BoundaryMoveBlockedReason | null
  readonly mergeBlockedReason: MergeBlockedReason | null
}

export interface StepBoundaryCapabilities {
  readonly progressiveEnabled: boolean
  readonly canEnableProgressive: boolean
  readonly stepCount: number
  readonly fieldCount: number
  readonly splitAfterField: readonly SplitFieldCapability[]
  readonly boundaries: readonly BoundaryCapability[]
}

/** Deterministic collision-safe step IDs: step_1, step_2, … */
export function collectExistingStepIds(definition: FormDefinition): ReadonlySet<string> {
  return new Set(definition.meta.progressiveSteps.map((step) => step.stepId))
}

export function allocateStepId(definition: FormDefinition, preferredStem = 'step'): string {
  const existing = collectExistingStepIds(definition)
  let suffix = 1
  while (existing.has(`${preferredStem}_${suffix}`)) {
    suffix += 1
  }
  return `${preferredStem}_${suffix}`
}

/** Default EN/GU labels for a newly allocated step (`Step N` / `પગલું N`). */
export function defaultStepLabels(stepNumber: number): {
  readonly labelEn: string
  readonly labelGu: string
} {
  return {
    labelEn: `Step ${stepNumber}`,
    labelGu: `પગલું ${stepNumber}`,
  }
}

function findStepIndexById(steps: readonly ProgressiveStep[], stepId: string): number {
  return steps.findIndex((step) => step.stepId === stepId)
}

function findBoundaryIndex(steps: readonly ProgressiveStep[], previousStepId: string): number {
  const index = findStepIndexById(steps, previousStepId)
  if (index < 0 || index >= steps.length - 1) {
    return -1
  }
  return index
}

/**
 * Whether a step-label draft has pending bilingual work that must be
 * Applied or Cancelled before the step can be removed by a merge.
 */
export function stepHasUnsavedBilingualChanges(
  entry:
    | {
        readonly draft: { readonly labelEn: string; readonly labelGu: string }
        readonly baseline: { readonly labelEn: string; readonly labelGu: string }
        readonly showValidation: boolean
        readonly showStaleGuidance: boolean
      }
    | undefined,
): boolean {
  if (entry === undefined) {
    return false
  }
  if (entry.showStaleGuidance || entry.showValidation) {
    return true
  }
  return (
    entry.draft.labelEn !== entry.baseline.labelEn || entry.draft.labelGu !== entry.baseline.labelGu
  )
}

/**
 * Structure key for preview remount: ordered step IDs + field assignments only
 * (not labels, form values, drafts, or audit). JSON encoding is unambiguous for
 * legal IDs that contain `:`, `,`, or `|`.
 */
export function progressiveStructureKey(definition: FormDefinition): string {
  const steps = definition.meta.progressiveSteps
  if (steps.length === 0) {
    return JSON.stringify({ kind: 'single-page' as const })
  }
  return JSON.stringify(steps.map((step) => [step.stepId, [...step.fieldIds]]))
}

export function getStepBoundaryCapabilities(
  state: BuilderAuthoringState,
  stepDraftPending?: Readonly<Record<string, boolean>>,
): StepBoundaryCapabilities {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch {
    return {
      progressiveEnabled: false,
      canEnableProgressive: false,
      stepCount: 0,
      fieldCount: 0,
      splitAfterField: [],
      boundaries: [],
    }
  }

  const uiOrder = readUiOrder(state.definition)
  const steps = state.definition.meta.progressiveSteps
  const progressiveEnabled = steps.length > 0
  const splitAfterField: SplitFieldCapability[] = []
  const boundaries: BoundaryCapability[] = []

  if (!progressiveEnabled) {
    return {
      progressiveEnabled: false,
      canEnableProgressive: uiOrder.length > 0,
      stepCount: 0,
      fieldCount: uiOrder.length,
      splitAfterField: [],
      boundaries: [],
    }
  }

  for (const step of steps) {
    for (let i = 0; i < step.fieldIds.length; i += 1) {
      const fieldId = step.fieldIds[i]!
      const isLast = i === step.fieldIds.length - 1
      splitAfterField.push({
        stepId: step.stepId,
        fieldId,
        canSplitAfter: !isLast,
        blockedReason: isLast ? 'split_after_last_field' : null,
      })
    }
  }

  for (let i = 0; i < steps.length - 1; i += 1) {
    const previous = steps[i]!
    const next = steps[i + 1]!
    const canMoveEarlier = previous.fieldIds.length >= 2
    const canMoveLater = next.fieldIds.length >= 2
    const mergeBlocked =
      stepDraftPending?.[next.stepId] === true
        ? ('step_has_unsaved_bilingual_changes' as const)
        : null
    boundaries.push({
      previousStepId: previous.stepId,
      nextStepId: next.stepId,
      canMoveEarlier,
      canMoveLater,
      canMerge: mergeBlocked === null,
      moveEarlierBlockedReason: canMoveEarlier ? null : 'boundary_move_would_empty_step',
      moveLaterBlockedReason: canMoveLater ? null : 'boundary_move_would_empty_step',
      mergeBlockedReason: mergeBlocked,
    })
  }

  return {
    progressiveEnabled: true,
    canEnableProgressive: false,
    stepCount: steps.length,
    fieldCount: uiOrder.length,
    splitAfterField,
    boundaries,
  }
}

/**
 * Enable progressive mode from a single-page definition (`progressiveSteps=[]`).
 * Creates one step containing every ui:order field. Does not mutate preview data.
 */
export function enableProgressiveSteps(state: BuilderAuthoringState): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (state.definition.meta.progressiveSteps.length > 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'progressive_steps_already_enabled',
        'Progressive steps are already enabled',
      ),
    }
  }

  const uiOrder = readUiOrder(state.definition)
  if (uiOrder.length === 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Cannot enable progressive steps with no fields',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const stepId = allocateStepId(nextDefinition)
  const labels = defaultStepLabels(1)
  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      progressiveSteps: [
        {
          stepId,
          labelEn: labels.labelEn,
          labelGu: labels.labelGu,
          fieldIds: [...uiOrder],
        },
      ],
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

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceProgressiveEnabled',
    announcementVars: { stepId, count: 1 },
  }
}

/**
 * Split `stepId` after `fieldId`. Original keeps fields through fieldId;
 * a new step receives the remainder and is inserted immediately after.
 */
export function splitStepAfterField(
  state: BuilderAuthoringState,
  stepId: string,
  fieldId: string,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const steps = state.definition.meta.progressiveSteps
  if (steps.length === 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'progressive_steps_not_enabled',
        'Progressive steps are not enabled',
      ),
    }
  }

  const stepIndex = findStepIndexById(steps, stepId)
  if (stepIndex < 0) {
    return {
      ok: false,
      error: new AuthoringError('step_not_found', 'Progressive step was not found'),
    }
  }

  const step = steps[stepIndex]!
  const fieldIndex = step.fieldIds.indexOf(fieldId)
  if (fieldIndex < 0) {
    return {
      ok: false,
      error: new AuthoringError('field_not_in_step', 'Field is not in the specified step'),
    }
  }
  if (fieldIndex === step.fieldIds.length - 1) {
    return {
      ok: false,
      error: new AuthoringError(
        'split_after_last_field',
        'Cannot split after the last field in a step',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const retained = step.fieldIds.slice(0, fieldIndex + 1)
  const moved = step.fieldIds.slice(fieldIndex + 1)
  const newStepId = allocateStepId(nextDefinition)
  const labels = defaultStepLabels(stepIndex + 2)
  const newStep: ProgressiveStep = {
    stepId: newStepId,
    labelEn: labels.labelEn,
    labelGu: labels.labelGu,
    fieldIds: moved,
  }

  const nextSteps: ProgressiveStep[] = [
    ...nextDefinition.meta.progressiveSteps.slice(0, stepIndex).map((entry) => ({ ...entry })),
    {
      ...nextDefinition.meta.progressiveSteps[stepIndex]!,
      fieldIds: retained,
    },
    newStep,
    ...nextDefinition.meta.progressiveSteps.slice(stepIndex + 1).map((entry) => ({ ...entry })),
  ]

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      progressiveSteps: nextSteps,
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

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceStepSplit',
    announcementVars: { stepId: newStepId, afterFieldId: fieldId },
  }
}

/**
 * Move the boundary between `previousStepId` and the following step.
 * `earlier` transfers previous's last field to next's start.
 * `later` transfers next's first field to previous's end.
 */
export function moveStepBoundary(
  state: BuilderAuthoringState,
  previousStepId: string,
  direction: BoundaryMoveDirection,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const steps = state.definition.meta.progressiveSteps
  if (steps.length === 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'progressive_steps_not_enabled',
        'Progressive steps are not enabled',
      ),
    }
  }

  const boundaryIndex = findBoundaryIndex(steps, previousStepId)
  if (boundaryIndex < 0) {
    return {
      ok: false,
      error: new AuthoringError('boundary_not_found', 'Step boundary was not found'),
    }
  }

  const previous = steps[boundaryIndex]!
  const next = steps[boundaryIndex + 1]!

  if (direction === 'earlier') {
    if (previous.fieldIds.length < 2) {
      return {
        ok: false,
        error: new AuthoringError(
          'boundary_move_would_empty_step',
          'Moving the boundary earlier would empty the previous step',
        ),
      }
    }
  } else if (next.fieldIds.length < 2) {
    return {
      ok: false,
      error: new AuthoringError(
        'boundary_move_would_empty_step',
        'Moving the boundary later would empty the next step',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition

  let previousFields = [...previous.fieldIds]
  let nextFields = [...next.fieldIds]
  if (direction === 'earlier') {
    const transferred = previousFields[previousFields.length - 1]!
    previousFields = previousFields.slice(0, -1)
    nextFields = [transferred, ...nextFields]
  } else {
    const transferred = nextFields[0]!
    nextFields = nextFields.slice(1)
    previousFields = [...previousFields, transferred]
  }

  const nextSteps = nextDefinition.meta.progressiveSteps.map((entry, index) => {
    if (index === boundaryIndex) {
      return { ...entry, fieldIds: previousFields }
    }
    if (index === boundaryIndex + 1) {
      return { ...entry, fieldIds: nextFields }
    }
    return entry
  })

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      progressiveSteps: nextSteps,
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

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey:
      direction === 'earlier' ? 'announceBoundaryMovedEarlier' : 'announceBoundaryMovedLater',
    announcementVars: {
      previousStepId: previous.stepId,
      nextStepId: next.stepId,
    },
  }
}

/**
 * Merge the boundary after `previousStepId`: previous receives previous+next
 * fields; next is removed. Caller must ensure next has no unsaved bilingual draft.
 */
export function mergeStepBoundary(
  state: BuilderAuthoringState,
  previousStepId: string,
  options?: { readonly removedStepHasUnsavedBilingual?: boolean },
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const steps = state.definition.meta.progressiveSteps
  if (steps.length === 0) {
    return {
      ok: false,
      error: new AuthoringError(
        'progressive_steps_not_enabled',
        'Progressive steps are not enabled',
      ),
    }
  }

  const boundaryIndex = findBoundaryIndex(steps, previousStepId)
  if (boundaryIndex < 0) {
    return {
      ok: false,
      error: new AuthoringError('boundary_not_found', 'Step boundary was not found'),
    }
  }

  const previous = steps[boundaryIndex]!
  const next = steps[boundaryIndex + 1]!

  if (options?.removedStepHasUnsavedBilingual === true) {
    return {
      ok: false,
      error: new AuthoringError(
        'step_has_unsaved_bilingual_changes',
        'Apply or cancel bilingual step-label changes before merging',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const mergedFields = [...previous.fieldIds, ...next.fieldIds]
  const nextSteps = nextDefinition.meta.progressiveSteps
    .map((entry, index) => {
      if (index === boundaryIndex) {
        return { ...entry, fieldIds: mergedFields }
      }
      return entry
    })
    .filter((_, index) => index !== boundaryIndex + 1)

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      progressiveSteps: nextSteps,
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

  return {
    ok: true,
    state: {
      definition,
      selectedFieldId: state.selectedFieldId,
      previewFormData: state.previewFormData,
    },
    announcementKey: 'announceStepsMerged',
    announcementVars: {
      survivingStepId: previous.stepId,
      removedStepId: next.stepId,
    },
  }
}
