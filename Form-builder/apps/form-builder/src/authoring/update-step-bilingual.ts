import type { FormDefinition } from '@dg20/form-contract'

import type { StepBilingualContent } from './bilingual-types.js'
import { isStepBilingualDirty, readStepBilingualContent } from './bilingual-types.js'
import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'
import { validateStepBilingualDraft } from './validate-field-bilingual.js'

/**
 * Apply validated progressive-step bilingual labels only.
 * Uses a genuine step bilingual baseline for `stale_editor_draft` (FB-D3).
 */
export function updateStepBilingualContent(
  state: BuilderAuthoringState,
  stepId: string,
  content: StepBilingualContent,
  expectedBaseline: StepBilingualContent,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (content.stepId !== stepId || expectedBaseline.stepId !== stepId) {
    return {
      ok: false,
      error: new AuthoringError(
        'inconsistent_definition',
        'Step bilingual content stepId does not match Apply target',
      ),
    }
  }

  const validation = validateStepBilingualDraft(content)
  if (!validation.ok) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        `Step bilingual content is invalid: ${validation.issues.map((i) => i.code).join(', ')}`,
      ),
    }
  }

  let committed: StepBilingualContent
  try {
    committed = readStepBilingualContent(state.definition, stepId)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  if (isStepBilingualDirty(committed, expectedBaseline)) {
    return {
      ok: false,
      error: new AuthoringError(
        'stale_editor_draft',
        'Committed progressive-step labels changed since this editor draft was opened',
      ),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition

  const index = nextDefinition.meta.progressiveSteps.findIndex((step) => step.stepId === stepId)
  if (index < 0) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Progressive step not found: ${stepId}`),
    }
  }

  const existing = nextDefinition.meta.progressiveSteps[index]!
  const progressiveSteps = nextDefinition.meta.progressiveSteps.map((step, stepIndex) =>
    stepIndex === index
      ? {
          ...existing,
          labelEn: validation.content.labelEn,
          labelGu: validation.content.labelGu,
        }
      : step,
  )

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      progressiveSteps,
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
    announcementKey: 'announceChangesApplied',
    announcementVars: { label: validation.content.labelEn },
  }
}
