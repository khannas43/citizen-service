/**
 * Integration Hub binding authoring (FB-D21).
 * Mutates only meta.integrationBindings — never prefill/workflow or other sections.
 */

import type { FormDefinition, IntegrationBinding, IntegrationDirection } from '@citizen/form-contract'

import {
  bindableFieldOrderIndex,
  collectBindableFields,
  isBindableFieldId,
} from './collect-bindable-fields.js'
import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity } from './integrity.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type IntegrationBindingDraftRow = {
  /** UI-only stable key for the current draft session. Never enters FormDefinition. */
  readonly rowKey: string
  readonly fieldId: string
  readonly adapterId: string
  readonly param: string
  readonly direction: '' | IntegrationDirection
}

export type IntegrationBindingDraftContent = {
  readonly rows: readonly IntegrationBindingDraftRow[]
}

export type IntegrationBindingIssueCode =
  | 'integration_field_invalid'
  | 'integration_adapter_invalid'
  | 'integration_param_invalid'
  | 'integration_direction_invalid'
  | 'integration_duplicate_tuple'

export type IntegrationBindingIssue = {
  readonly code: IntegrationBindingIssueCode
  readonly rowKey: string
  readonly control: 'fieldId' | 'adapterId' | 'param' | 'direction' | 'row'
}

export type IntegrationBindingValidationResult =
  | { readonly ok: true; readonly bindings: readonly IntegrationBinding[] }
  | { readonly ok: false; readonly issues: readonly IntegrationBindingIssue[] }

export type IntegrationBindingDraftSurface = {
  readonly draft: IntegrationBindingDraftContent
  readonly baseline: readonly IntegrationBinding[]
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  readonly nextRowKeySeq: number
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIntegrationDirection(value: unknown): value is IntegrationDirection {
  return value === 'in' || value === 'out'
}

function integrationTupleKey(binding: {
  readonly fieldId: string
  readonly adapterId: string
  readonly param: string
  readonly direction: string
}): string {
  return `${binding.fieldId}\0${binding.adapterId}\0${binding.param}\0${binding.direction}`
}

function bindingsEqual(
  left: readonly IntegrationBinding[],
  right: readonly IntegrationBinding[],
): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!
    const b = right[i]!
    if (
      a.fieldId !== b.fieldId ||
      a.adapterId !== b.adapterId ||
      a.param !== b.param ||
      a.direction !== b.direction
    ) {
      return false
    }
  }
  return true
}

/** Read committed integration bindings as a detached list (integrity required). */
export function readIntegrationBindings(definition: FormDefinition): readonly IntegrationBinding[] {
  assertDefinitionIntegrity(definition)
  return definition.meta.integrationBindings.map((entry) => ({
    fieldId: entry.fieldId,
    adapterId: entry.adapterId,
    param: entry.param,
    direction: entry.direction,
  }))
}

export function sortIntegrationBindings(
  bindings: readonly IntegrationBinding[],
  definition: FormDefinition,
): IntegrationBinding[] {
  return [...bindings].sort((a, b) => {
    const ai = bindableFieldOrderIndex(definition, a.fieldId)
    const bi = bindableFieldOrderIndex(definition, b.fieldId)
    if (ai !== bi) {
      if (ai < 0) return 1
      if (bi < 0) return -1
      return ai - bi
    }
    const adapterCmp = a.adapterId.localeCompare(b.adapterId)
    if (adapterCmp !== 0) return adapterCmp
    const paramCmp = a.param.localeCompare(b.param)
    if (paramCmp !== 0) return paramCmp
    return a.direction.localeCompare(b.direction)
  })
}

export function draftRowsFromCommitted(
  bindings: readonly IntegrationBinding[],
  startSeq = 1,
): { readonly rows: IntegrationBindingDraftRow[]; readonly nextRowKeySeq: number } {
  const rows = bindings.map((binding, index) => ({
    rowKey: `integration-row-${startSeq + index}`,
    fieldId: binding.fieldId,
    adapterId: binding.adapterId,
    param: binding.param,
    direction: binding.direction,
  }))
  return { rows, nextRowKeySeq: startSeq + rows.length }
}

export function seedIntegrationBindingDraftSurface(
  definition: FormDefinition,
): IntegrationBindingDraftSurface {
  const baseline = readIntegrationBindings(definition)
  const { rows, nextRowKeySeq } = draftRowsFromCommitted(baseline, 1)
  return {
    draft: { rows },
    baseline,
    showValidation: false,
    showStaleGuidance: false,
    nextRowKeySeq,
  }
}

export function emptyIntegrationDraftRow(rowKey: string): IntegrationBindingDraftRow {
  return {
    rowKey,
    fieldId: '',
    adapterId: '',
    param: '',
    direction: '',
  }
}

export function validateIntegrationBindingsDraft(
  definition: FormDefinition,
  draft: IntegrationBindingDraftContent,
): IntegrationBindingValidationResult {
  const issues: IntegrationBindingIssue[] = []
  const accepted: IntegrationBinding[] = []
  const seen = new Set<string>()

  if (!Array.isArray(draft.rows)) {
    return {
      ok: false,
      issues: [{ code: 'integration_field_invalid', rowKey: '', control: 'row' }],
    }
  }

  for (const row of draft.rows) {
    if (!isPlainObject(row) || typeof row.rowKey !== 'string' || row.rowKey.length === 0) {
      issues.push({ code: 'integration_field_invalid', rowKey: '', control: 'row' })
      continue
    }
    const rowKey = row.rowKey
    if (!isExactMasterListId(row.fieldId) || !isBindableFieldId(definition, row.fieldId)) {
      issues.push({ code: 'integration_field_invalid', rowKey, control: 'fieldId' })
    }
    if (!isExactMasterListId(row.adapterId)) {
      issues.push({ code: 'integration_adapter_invalid', rowKey, control: 'adapterId' })
    }
    if (!isExactMasterListId(row.param)) {
      issues.push({ code: 'integration_param_invalid', rowKey, control: 'param' })
    }
    if (!isIntegrationDirection(row.direction)) {
      issues.push({ code: 'integration_direction_invalid', rowKey, control: 'direction' })
    }
    if (
      isExactMasterListId(row.fieldId) &&
      isExactMasterListId(row.adapterId) &&
      isExactMasterListId(row.param) &&
      isIntegrationDirection(row.direction) &&
      isBindableFieldId(definition, row.fieldId)
    ) {
      const acceptedRow = {
        fieldId: row.fieldId,
        adapterId: row.adapterId,
        param: row.param,
        direction: row.direction,
      }
      const key = integrationTupleKey(acceptedRow)
      if (seen.has(key)) {
        issues.push({ code: 'integration_duplicate_tuple', rowKey, control: 'row' })
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
    bindings: sortIntegrationBindings(accepted, definition),
  }
}

export function updateIntegrationBindings(
  state: BuilderAuthoringState,
  draft: IntegrationBindingDraftContent,
  expectedBaseline: readonly IntegrationBinding[],
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
        'Cannot update integration bindings on a non-draft definition',
      ),
    }
  }

  const live = readIntegrationBindings(state.definition)
  if (!bindingsEqual(live, expectedBaseline)) {
    return {
      ok: false,
      error: new AuthoringError('stale_editor_draft', 'Integration binding baseline is stale'),
    }
  }

  const validated = validateIntegrationBindingsDraft(state.definition, draft)
  if (!validated.ok) {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'Integration binding draft failed validation',
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
      integrationBindings: validated.bindings,
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

export function isIntegrationBindingsDraftDirty(
  baseline: readonly IntegrationBinding[],
  draft: IntegrationBindingDraftContent,
  definition: FormDefinition,
  showStaleGuidance: boolean,
): boolean {
  if (showStaleGuidance) return true
  const validated = validateIntegrationBindingsDraft(definition, draft)
  if (!validated.ok) {
    // Invalid draft still counts as dirty when it differs from baseline rows visually
    if (draft.rows.length !== baseline.length) return true
    return draft.rows.some((row, index) => {
      const committed = baseline[index]
      if (!committed) return true
      return (
        row.fieldId !== committed.fieldId ||
        row.adapterId !== committed.adapterId ||
        row.param !== committed.param ||
        row.direction !== committed.direction
      )
    })
  }
  return !bindingsEqual(baseline, validated.bindings)
}

export function isIntegrationBindingSurfaceDirty(
  surface: IntegrationBindingDraftSurface | null,
  definition: FormDefinition,
): boolean {
  if (surface === null) return false
  return (
    surface.showValidation ||
    isIntegrationBindingsDraftDirty(
      surface.baseline,
      surface.draft,
      definition,
      surface.showStaleGuidance,
    )
  )
}

/** Field IDs that should show a canvas dirty chip for an active integration draft. */
export function collectIntegrationBindingDirtyFieldIds(
  surface: IntegrationBindingDraftSurface | null,
  definition: FormDefinition,
): ReadonlySet<string> {
  const ids = new Set<string>()
  if (surface === null) return ids
  if (!isIntegrationBindingSurfaceDirty(surface, definition)) return ids
  for (const binding of surface.baseline) {
    ids.add(binding.fieldId)
  }
  for (const row of surface.draft.rows) {
    if (row.fieldId.length > 0) ids.add(row.fieldId)
  }
  return ids
}

export function liveBaselineMatchesIntegrationSurface(
  definition: FormDefinition,
  surface: IntegrationBindingDraftSurface,
): boolean {
  try {
    return bindingsEqual(readIntegrationBindings(definition), surface.baseline)
  } catch {
    return false
  }
}

export function allocateIntegrationRowKey(surface: IntegrationBindingDraftSurface): {
  readonly rowKey: string
  readonly nextRowKeySeq: number
} {
  const rowKey = `integration-row-${surface.nextRowKeySeq}`
  return { rowKey, nextRowKeySeq: surface.nextRowKeySeq + 1 }
}

export function bindableFieldOptions(definition: FormDefinition) {
  return collectBindableFields(definition)
}
