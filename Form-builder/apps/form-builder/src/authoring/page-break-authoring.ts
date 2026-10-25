/**
 * FB-D17 page-break → progressive-step boundary authoring.
 * Never mutates jsonSchema / uiSchema / provenance / bilingual / formData —
 * only `meta.progressiveSteps`.
 */

import type { FormDefinition, ProgressiveStep } from '@citizen/form-contract'

import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity, readUiOrder } from './integrity.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import { allocateStepId, defaultStepLabels } from './step-boundaries.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type PageBreakBoundaryOption = {
  readonly afterFieldId: string
  readonly stepId: string | null
  readonly labelEn: string
  readonly labelGu: string
}

export type PendingStructuralAdd = {
  readonly widgetType: 'page-break'
  readonly afterFieldId: string
  readonly nextStepLabelEn: string
  readonly nextStepLabelGu: string
  readonly showValidation: boolean
}

export type PageBreakCreateRequest = {
  readonly stepId: string | null
  readonly afterFieldId: string
  readonly nextStepLabelEn: string
  readonly nextStepLabelGu: string
}

export type PageBreakAddFocusControl = 'afterFieldId' | 'nextStepLabelEn' | 'nextStepLabelGu'

export type PendingStructuralAddPatch = Readonly<
  Partial<{
    afterFieldId: string
    nextStepLabelEn: string
    nextStepLabelGu: string
  }>
>

function findStepIndexById(steps: readonly ProgressiveStep[], stepId: string): number {
  return steps.findIndex((step) => step.stepId === stepId)
}

function labelPairForField(
  definition: FormDefinition,
  fieldId: string,
): { readonly labelEn: string; readonly labelGu: string } {
  const pair = definition.meta.bilingual.labels[fieldId]
  return {
    labelEn: pair?.en ?? fieldId,
    labelGu: pair?.gu ?? fieldId,
  }
}

/**
 * Eligible after-field options in canvas `ui:order` order.
 * Single-page: every field except the last.
 * Progressive: every field except the last of each step.
 */
export function getPageBreakBoundaryOptions(
  definition: FormDefinition,
): readonly PageBreakBoundaryOption[] {
  try {
    assertDefinitionIntegrity(definition)
  } catch {
    return []
  }

  const steps = definition.meta.progressiveSteps
  const options: PageBreakBoundaryOption[] = []

  if (steps.length === 0) {
    const uiOrder = readUiOrder(definition)
    for (let i = 0; i < uiOrder.length - 1; i += 1) {
      const fieldId = uiOrder[i]!
      const labels = labelPairForField(definition, fieldId)
      options.push({
        afterFieldId: fieldId,
        stepId: null,
        labelEn: labels.labelEn,
        labelGu: labels.labelGu,
      })
    }
    return options
  }

  const uiOrder = readUiOrder(definition)
  const uiOrderIndex = new Map(uiOrder.map((id, index) => [id, index]))

  for (const step of steps) {
    for (let i = 0; i < step.fieldIds.length - 1; i += 1) {
      const fieldId = step.fieldIds[i]!
      const labels = labelPairForField(definition, fieldId)
      options.push({
        afterFieldId: fieldId,
        stepId: step.stepId,
        labelEn: labels.labelEn,
        labelGu: labels.labelGu,
      })
    }
  }

  // Stable canvas order among collected options.
  return [...options].sort((a, b) => {
    const ai = uiOrderIndex.get(a.afterFieldId) ?? 0
    const bi = uiOrderIndex.get(b.afterFieldId) ?? 0
    return ai - bi
  })
}

export function canCreatePageBreakBoundary(definition: FormDefinition): boolean {
  return getPageBreakBoundaryOptions(definition).length > 0
}

export function resolveDefaultPageBreakAfterFieldId(
  definition: FormDefinition,
  selectedFieldId: string | null,
): string | null {
  const options = getPageBreakBoundaryOptions(definition)
  if (options.length === 0) {
    return null
  }
  if (
    selectedFieldId !== null &&
    options.some((option) => option.afterFieldId === selectedFieldId)
  ) {
    return selectedFieldId
  }
  return options[0]!.afterFieldId
}

export function createEmptyPendingPageBreak(
  definition: FormDefinition,
  selectedFieldId: string | null,
): PendingStructuralAdd | null {
  const afterFieldId = resolveDefaultPageBreakAfterFieldId(definition, selectedFieldId)
  if (afterFieldId === null) {
    return null
  }
  return {
    widgetType: 'page-break',
    afterFieldId,
    nextStepLabelEn: '',
    nextStepLabelGu: '',
    showValidation: false,
  }
}

export function patchPendingPageBreak(
  pending: PendingStructuralAdd,
  patch: PendingStructuralAddPatch,
): PendingStructuralAdd {
  return {
    ...pending,
    ...(patch.afterFieldId !== undefined ? { afterFieldId: patch.afterFieldId } : {}),
    ...(patch.nextStepLabelEn !== undefined ? { nextStepLabelEn: patch.nextStepLabelEn } : {}),
    ...(patch.nextStepLabelGu !== undefined ? { nextStepLabelGu: patch.nextStepLabelGu } : {}),
  }
}

export function validatePendingPageBreak(
  pending: PendingStructuralAdd,
  definition: FormDefinition,
):
  | { readonly ok: true; readonly request: PageBreakCreateRequest }
  | { readonly ok: false; readonly firstInvalidControl: PageBreakAddFocusControl } {
  const options = getPageBreakBoundaryOptions(definition)
  const matched = options.find((option) => option.afterFieldId === pending.afterFieldId)
  if (matched === undefined) {
    return { ok: false, firstInvalidControl: 'afterFieldId' }
  }
  if (!isExactMasterListId(pending.nextStepLabelEn)) {
    return { ok: false, firstInvalidControl: 'nextStepLabelEn' }
  }
  if (!isExactMasterListId(pending.nextStepLabelGu)) {
    return { ok: false, firstInvalidControl: 'nextStepLabelGu' }
  }
  return {
    ok: true,
    request: {
      stepId: matched.stepId,
      afterFieldId: pending.afterFieldId,
      nextStepLabelEn: pending.nextStepLabelEn,
      nextStepLabelGu: pending.nextStepLabelGu,
    },
  }
}

/**
 * Atomically create a progressive-step boundary after `afterFieldId`.
 * Single-page: enable + split in one clone/commit (no intermediate one-step state).
 * Progressive: split the named step; existing step keeps its label; new step gets user labels.
 */
export function createPageBreakBoundary(
  state: BuilderAuthoringState,
  request: PageBreakCreateRequest,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const options = getPageBreakBoundaryOptions(state.definition)
  const matched = options.find((option) => option.afterFieldId === request.afterFieldId)
  if (
    matched === undefined ||
    matched.stepId !== request.stepId ||
    !isExactMasterListId(request.nextStepLabelEn) ||
    !isExactMasterListId(request.nextStepLabelGu)
  ) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Page-break boundary request is not eligible',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const steps = nextDefinition.meta.progressiveSteps

  let nextSteps: ProgressiveStep[]
  let newStepId: string

  if (steps.length === 0) {
    const uiOrder = readUiOrder(nextDefinition)
    const afterIndex = uiOrder.indexOf(request.afterFieldId)
    if (afterIndex < 0 || afterIndex === uiOrder.length - 1) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Page-break afterFieldId is not eligible',
        ),
      }
    }
    const retained = uiOrder.slice(0, afterIndex + 1)
    const moved = uiOrder.slice(afterIndex + 1)
    const firstStepId = allocateStepId(nextDefinition)
    const provisional: FormDefinition = {
      ...nextDefinition,
      meta: {
        ...nextDefinition.meta,
        progressiveSteps: [
          {
            stepId: firstStepId,
            labelEn: defaultStepLabels(1).labelEn,
            labelGu: defaultStepLabels(1).labelGu,
            fieldIds: [...uiOrder],
          },
        ],
      },
    }
    newStepId = allocateStepId(provisional)
    const firstLabels = defaultStepLabels(1)
    nextSteps = [
      {
        stepId: firstStepId,
        labelEn: firstLabels.labelEn,
        labelGu: firstLabels.labelGu,
        fieldIds: retained,
      },
      {
        stepId: newStepId,
        labelEn: request.nextStepLabelEn,
        labelGu: request.nextStepLabelGu,
        fieldIds: moved,
      },
    ]
  } else {
    if (request.stepId === null) {
      return {
        ok: false,
        error: new AuthoringError(
          'configuration_invalid',
          'Page-break stepId is required when progressive steps are enabled',
        ),
      }
    }
    const stepIndex = findStepIndexById(steps, request.stepId)
    if (stepIndex < 0) {
      return {
        ok: false,
        error: new AuthoringError('step_not_found', 'Progressive step was not found'),
      }
    }
    const step = steps[stepIndex]!
    const fieldIndex = step.fieldIds.indexOf(request.afterFieldId)
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
    const retained = step.fieldIds.slice(0, fieldIndex + 1)
    const moved = step.fieldIds.slice(fieldIndex + 1)
    newStepId = allocateStepId(nextDefinition)
    nextSteps = [
      ...nextDefinition.meta.progressiveSteps.slice(0, stepIndex).map((entry) => ({ ...entry })),
      {
        ...nextDefinition.meta.progressiveSteps[stepIndex]!,
        fieldIds: retained,
      },
      {
        stepId: newStepId,
        labelEn: request.nextStepLabelEn,
        labelGu: request.nextStepLabelGu,
        fieldIds: moved,
      },
      ...nextDefinition.meta.progressiveSteps.slice(stepIndex + 1).map((entry) => ({ ...entry })),
    ]
  }

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
    announcementKey: 'announcePageBreakCreated',
    announcementVars: { stepId: newStepId, afterFieldId: request.afterFieldId },
  }
}
