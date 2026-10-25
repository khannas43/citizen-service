/**
 * Workflow stage binding authoring (FB-D21).
 * Mutates only meta.workflowBindings — never prefill/integration or other sections.
 */

import type { FormDefinition, WorkflowBinding } from '@citizen/form-contract'

import {
  bindableFieldOrderIndex,
  collectBindableFields,
  isBindableFieldId,
} from './collect-bindable-fields.js'
import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type WorkflowBindingDraftRow = {
  /** UI-only stable key for the current draft session. Never enters FormDefinition. */
  readonly rowKey: string
  readonly fieldId: string
  readonly stage: string
}

export type WorkflowBindingDraftContent = {
  readonly rows: readonly WorkflowBindingDraftRow[]
}

export type WorkflowBindingIssueCode =
  'workflow_field_invalid' | 'workflow_stage_invalid' | 'workflow_duplicate_pair'

export type WorkflowBindingIssue = {
  readonly code: WorkflowBindingIssueCode
  readonly rowKey: string
  readonly control: 'fieldId' | 'stage' | 'row'
}

export type WorkflowBindingValidationResult =
  | { readonly ok: true; readonly bindings: readonly WorkflowBinding[] }
  | { readonly ok: false; readonly issues: readonly WorkflowBindingIssue[] }

export type WorkflowBindingDraftSurface = {
  readonly draft: WorkflowBindingDraftContent
  readonly baseline: readonly WorkflowBinding[]
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  readonly nextRowKeySeq: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function workflowPairKey(binding: { readonly fieldId: string; readonly stage: string }): string {
  return `${binding.fieldId}\0${binding.stage}`
}

function bindingsEqual(
  left: readonly WorkflowBinding[],
  right: readonly WorkflowBinding[],
): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!
    const b = right[i]!
    if (a.fieldId !== b.fieldId || a.stage !== b.stage) return false
  }
  return true
}

/** Read committed workflow bindings as a detached list (integrity required). */
export function readWorkflowBindings(definition: FormDefinition): readonly WorkflowBinding[] {
  assertDefinitionIntegrity(definition)
  return definition.meta.workflowBindings.map((entry) => ({
    fieldId: entry.fieldId,
    stage: entry.stage,
  }))
}

export function sortWorkflowBindings(
  bindings: readonly WorkflowBinding[],
  definition: FormDefinition,
): WorkflowBinding[] {
  return [...bindings].sort((a, b) => {
    const ai = bindableFieldOrderIndex(definition, a.fieldId)
    const bi = bindableFieldOrderIndex(definition, b.fieldId)
    if (ai !== bi) {
      if (ai < 0) return 1
      if (bi < 0) return -1
      return ai - bi
    }
    return a.stage.localeCompare(b.stage)
  })
}

export function draftWorkflowRowsFromCommitted(
  bindings: readonly WorkflowBinding[],
  startSeq = 1,
): { readonly rows: WorkflowBindingDraftRow[]; readonly nextRowKeySeq: number } {
  const rows = bindings.map((binding, index) => ({
    rowKey: `workflow-row-${startSeq + index}`,
    fieldId: binding.fieldId,
    stage: binding.stage,
  }))
  return { rows, nextRowKeySeq: startSeq + rows.length }
}

export function seedWorkflowBindingDraftSurface(
  definition: FormDefinition,
): WorkflowBindingDraftSurface {
  const baseline = readWorkflowBindings(definition)
  const { rows, nextRowKeySeq } = draftWorkflowRowsFromCommitted(baseline, 1)
  return {
    draft: { rows },
    baseline,
    showValidation: false,
    showStaleGuidance: false,
    nextRowKeySeq,
  }
}

export function emptyWorkflowDraftRow(rowKey: string): WorkflowBindingDraftRow {
  return { rowKey, fieldId: '', stage: '' }
}

export function validateWorkflowBindingsDraft(
  definition: FormDefinition,
  draft: WorkflowBindingDraftContent,
): WorkflowBindingValidationResult {
  const issues: WorkflowBindingIssue[] = []
  const accepted: WorkflowBinding[] = []
  const seen = new Set<string>()

  if (!Array.isArray(draft.rows)) {
    return {
      ok: false,
      issues: [{ code: 'workflow_field_invalid', rowKey: '', control: 'row' }],
    }
  }

  for (const row of draft.rows) {
    if (!isPlainObject(row) || typeof row.rowKey !== 'string' || row.rowKey.length === 0) {
      issues.push({ code: 'workflow_field_invalid', rowKey: '', control: 'row' })
      continue
    }
    const rowKey = row.rowKey
    if (!isExactMasterListId(row.fieldId) || !isBindableFieldId(definition, row.fieldId)) {
      issues.push({ code: 'workflow_field_invalid', rowKey, control: 'fieldId' })
    }
    if (!isExactMasterListId(row.stage)) {
      issues.push({ code: 'workflow_stage_invalid', rowKey, control: 'stage' })
    }
    if (
      isExactMasterListId(row.fieldId) &&
      isExactMasterListId(row.stage) &&
      isBindableFieldId(definition, row.fieldId)
    ) {
      const acceptedRow = { fieldId: row.fieldId, stage: row.stage }
      const key = workflowPairKey(acceptedRow)
      if (seen.has(key)) {
        issues.push({ code: 'workflow_duplicate_pair', rowKey, control: 'row' })
      } else {
        seen.add(key)
        accepted.push(acceptedRow)
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }
  return {
    ok: true,
    bindings: sortWorkflowBindings(accepted, definition),
  }
}

export function updateWorkflowBindings(
  state: BuilderAuthoringState,
  draft: WorkflowBindingDraftContent,
  expectedBaseline: readonly WorkflowBinding[],
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
        'Cannot update workflow bindings on a non-draft definition',
      ),
    }
  }

  const live = readWorkflowBindings(state.definition)
  if (!bindingsEqual(live, expectedBaseline)) {
    return {
      ok: false,
      error: new AuthoringError('stale_editor_draft', 'Workflow binding baseline is stale'),
    }
  }

  const validated = validateWorkflowBindingsDraft(state.definition, draft)
  if (!validated.ok) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Workflow binding draft failed validation',
      ),
    }
  }

  if (bindingsEqual(live, validated.bindings)) {
    return {
      ok: true,
      state,
      announcementKey: 'announceChangesApplied',
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) return { ok: false, error: cloned.error }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      workflowBindings: validated.bindings,
    },
  }
  try {
    assertDefinitionIntegrity(definition)
  } catch (error) {
    if (error instanceof AuthoringError) return { ok: false, error }
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
  }
}

export function isWorkflowBindingsDraftDirty(
  baseline: readonly WorkflowBinding[],
  draft: WorkflowBindingDraftContent,
  definition: FormDefinition,
  showStaleGuidance: boolean,
): boolean {
  if (showStaleGuidance) return true
  const validated = validateWorkflowBindingsDraft(definition, draft)
  if (!validated.ok) {
    if (draft.rows.length !== baseline.length) return true
    return draft.rows.some((row, index) => {
      const committed = baseline[index]
      if (!committed) return true
      return row.fieldId !== committed.fieldId || row.stage !== committed.stage
    })
  }
  return !bindingsEqual(baseline, validated.bindings)
}

export function isWorkflowBindingSurfaceDirty(
  surface: WorkflowBindingDraftSurface | null,
  definition: FormDefinition,
): boolean {
  if (surface === null) return false
  return (
    surface.showValidation ||
    isWorkflowBindingsDraftDirty(
      surface.baseline,
      surface.draft,
      definition,
      surface.showStaleGuidance,
    )
  )
}

export function collectWorkflowBindingDirtyFieldIds(
  surface: WorkflowBindingDraftSurface | null,
  definition: FormDefinition,
): ReadonlySet<string> {
  const ids = new Set<string>()
  if (surface === null) return ids
  if (!isWorkflowBindingSurfaceDirty(surface, definition)) return ids
  for (const binding of surface.baseline) {
    ids.add(binding.fieldId)
  }
  for (const row of surface.draft.rows) {
    if (row.fieldId.length > 0) ids.add(row.fieldId)
  }
  return ids
}

export function liveBaselineMatchesWorkflowSurface(
  definition: FormDefinition,
  surface: WorkflowBindingDraftSurface,
): boolean {
  try {
    return bindingsEqual(readWorkflowBindings(definition), surface.baseline)
  } catch {
    return false
  }
}

export function allocateWorkflowRowKey(surface: WorkflowBindingDraftSurface): {
  readonly rowKey: string
  readonly nextRowKeySeq: number
} {
  const rowKey = `workflow-row-${surface.nextRowKeySeq}`
  return { rowKey, nextRowKeySeq: surface.nextRowKeySeq + 1 }
}

export function workflowBindableFieldOptions(definition: FormDefinition) {
  return collectBindableFields(definition)
}
