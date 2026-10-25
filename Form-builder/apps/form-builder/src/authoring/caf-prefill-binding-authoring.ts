/**
 * CAF Prefill binding authoring (FB-D15).
 * Mutates only meta.prefillBindings — never schema, uiSchema, provenance,
 * bilingual, steps, audit, previewFormData, integrationBindings, or workflowBindings.
 */

import type { FormDefinition, PrefillBinding } from '@citizen/form-contract'
import { getPaletteWidget } from '@citizen/form-widgets'

import { cloneJsonSafeObject } from './clone.js'
import { assertDefinitionIntegrity, readUiOrder } from './integrity.js'
import { parseRequiredJsonDecimal } from './json-decimal.js'
import { isExactMasterListId } from './master-list-schema-admission.js'
import { AuthoringError, type AuthoringResult, type BuilderAuthoringState } from './types.js'

export type CafPrefillBindingDraftContent = {
  readonly cafAttribute: string
  readonly confidenceMin: string
}

export type CafPrefillBindingIssueCode = 'caf_attribute_invalid' | 'confidence_min_invalid'

export type CafPrefillBindingIssue = {
  readonly code: CafPrefillBindingIssueCode
  readonly control: 'cafAttribute' | 'confidenceMin'
}

export type CafPrefillBindingValidationResult =
  | {
      readonly ok: true
      readonly binding: PrefillBinding
    }
  | {
      readonly ok: false
      readonly issues: readonly CafPrefillBindingIssue[]
    }

export type CafPrefillBindingBaseline = {
  /** Committed binding, or null when the CAF field is unbound. */
  readonly binding: PrefillBinding | null
}

export type VisibleCafBindingRow = {
  readonly fieldId: string
  readonly labelEn: string
  readonly labelGu: string
  readonly bound: boolean
  readonly committed: PrefillBinding | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function provenanceWidgetType(definition: FormDefinition, fieldId: string): string | undefined {
  return definition.meta.paletteProvenance.find((entry) => entry.fieldId === fieldId)?.widgetType
}

function confidenceMinToDraft(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

function draftFromBinding(binding: PrefillBinding | null): CafPrefillBindingDraftContent {
  if (binding === null) {
    return { cafAttribute: '', confidenceMin: '' }
  }
  return {
    cafAttribute: binding.cafAttribute,
    confidenceMin: confidenceMinToDraft(binding.confidenceMin),
  }
}

function bindingsEqual(left: PrefillBinding | null, right: PrefillBinding | null): boolean {
  if (left === null && right === null) {
    return true
  }
  if (left === null || right === null) {
    return false
  }
  return (
    left.fieldId === right.fieldId &&
    left.cafAttribute === right.cafAttribute &&
    left.confidenceMin === right.confidenceMin
  )
}

/**
 * Read the committed CAF prefill binding for a definition fieldId, or null if unbound.
 * Throws inconsistent_definition when multiple bindings target the same field.
 */
export function readCafPrefillBinding(
  definition: FormDefinition,
  fieldId: string,
): PrefillBinding | null {
  const matches = definition.meta.prefillBindings.filter((entry) => entry.fieldId === fieldId)
  if (matches.length > 1) {
    throw new AuthoringError('inconsistent_definition', 'Duplicate CAF prefill binding for field')
  }
  return matches[0] ?? null
}

export function validateCafPrefillBindingDraft(
  fieldId: string,
  draft: CafPrefillBindingDraftContent,
): CafPrefillBindingValidationResult {
  const issues: CafPrefillBindingIssue[] = []
  if (!isExactMasterListId(draft.cafAttribute)) {
    issues.push({ code: 'caf_attribute_invalid', control: 'cafAttribute' })
  }
  const confidence = parseRequiredJsonDecimal(draft.confidenceMin)
  let confidenceMinValue: number | undefined
  if (!confidence.ok || confidence.value < 0 || confidence.value > 1) {
    issues.push({ code: 'confidence_min_invalid', control: 'confidenceMin' })
  } else {
    confidenceMinValue = confidence.value
  }
  if (issues.length > 0 || confidenceMinValue === undefined) {
    return { ok: false, issues }
  }
  return {
    ok: true,
    binding: {
      fieldId,
      cafAttribute: draft.cafAttribute,
      confidenceMin: confidenceMinValue,
    },
  }
}

function sortPrefillBindings(
  bindings: readonly PrefillBinding[],
  uiOrder: readonly string[],
): PrefillBinding[] {
  const orderIndex = new Map(uiOrder.map((id, index) => [id, index]))
  return [...bindings].sort((a, b) => {
    const ai = orderIndex.get(a.fieldId)
    const bi = orderIndex.get(b.fieldId)
    if (ai === undefined && bi === undefined) {
      return a.fieldId.localeCompare(b.fieldId)
    }
    if (ai === undefined) {
      return 1
    }
    if (bi === undefined) {
      return -1
    }
    return ai - bi
  })
}

/**
 * Apply an accepted CAF prefill binding for one field.
 * Replaces any existing binding for that fieldId; preserves other binding arrays.
 */
export function updateCafPrefillBinding(
  state: BuilderAuthoringState,
  fieldId: string,
  draft: CafPrefillBindingDraftContent,
  expectedBaseline: CafPrefillBindingBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  const widgetType = provenanceWidgetType(state.definition, fieldId)
  if (widgetType === undefined) {
    return {
      ok: false,
      error: new AuthoringError('field_not_found', `Field not found: ${fieldId}`),
    }
  }
  if (widgetType !== 'caf-prefill') {
    return {
      ok: false,
      error: new AuthoringError(
        'configuration_invalid',
        'CAF prefill bindings are only valid on caf-prefill fields',
      ),
    }
  }
  const palette = getPaletteWidget(widgetType)
  if (!palette || palette.producesData !== true) {
    return {
      ok: false,
      error: new AuthoringError('inconsistent_definition', 'CAF field palette entry is invalid'),
    }
  }

  let live: PrefillBinding | null
  try {
    live = readCafPrefillBinding(state.definition, fieldId)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }
  if (!bindingsEqual(live, expectedBaseline.binding)) {
    return {
      ok: false,
      error: new AuthoringError(
        'stale_editor_draft',
        'Committed CAF binding changed since this editor draft was opened',
      ),
    }
  }

  const validated = validateCafPrefillBindingDraft(fieldId, draft)
  if (!validated.ok) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'CAF binding draft is invalid'),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const uiOrder = readUiOrder(nextDefinition)
  const withoutField = nextDefinition.meta.prefillBindings.filter(
    (entry) => entry.fieldId !== fieldId,
  )
  const nextBindings = sortPrefillBindings([...withoutField, validated.binding], uiOrder)

  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      prefillBindings: nextBindings,
      integrationBindings: nextDefinition.meta.integrationBindings,
      workflowBindings: nextDefinition.meta.workflowBindings,
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
    announcementVars: { fieldId },
  }
}

export function removeCafPrefillBinding(
  state: BuilderAuthoringState,
  fieldId: string,
  expectedBaseline: CafPrefillBindingBaseline,
): AuthoringResult {
  try {
    assertDefinitionIntegrity(state.definition)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }

  let live: PrefillBinding | null
  try {
    live = readCafPrefillBinding(state.definition, fieldId)
  } catch (error) {
    if (error instanceof AuthoringError) {
      return { ok: false, error }
    }
    throw error
  }
  if (!bindingsEqual(live, expectedBaseline.binding)) {
    return {
      ok: false,
      error: new AuthoringError(
        'stale_editor_draft',
        'Committed CAF binding changed since this editor draft was opened',
      ),
    }
  }
  if (live === null) {
    return {
      ok: false,
      error: new AuthoringError('configuration_invalid', 'No CAF binding to remove'),
    }
  }

  const cloned = cloneJsonSafeObject(state.definition)
  if (!cloned.ok) {
    return { ok: false, error: cloned.error }
  }
  const nextDefinition = cloned.value as unknown as FormDefinition
  const definition: FormDefinition = {
    ...nextDefinition,
    meta: {
      ...nextDefinition.meta,
      prefillBindings: nextDefinition.meta.prefillBindings.filter(
        (entry) => entry.fieldId !== fieldId,
      ),
      integrationBindings: nextDefinition.meta.integrationBindings,
      workflowBindings: nextDefinition.meta.workflowBindings,
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
    announcementVars: { fieldId },
  }
}

export function collectVisibleCafBindingRows(
  definition: FormDefinition,
): readonly VisibleCafBindingRow[] {
  const uiOrder = readUiOrder(definition)
  const rows: VisibleCafBindingRow[] = []
  for (const fieldId of uiOrder) {
    const widgetType = provenanceWidgetType(definition, fieldId)
    if (widgetType !== 'caf-prefill') {
      continue
    }
    const labels = definition.meta.bilingual.labels[fieldId]
    const committed = readCafPrefillBinding(definition, fieldId)
    rows.push({
      fieldId,
      labelEn: labels?.en ?? fieldId,
      labelGu: labels?.gu ?? fieldId,
      bound: committed !== null,
      committed,
    })
  }
  return rows
}

/** UI-only binding draft entry (never stored in FormDefinition). */
export type CafBindingDraftEntry = {
  readonly draft: CafPrefillBindingDraftContent
  readonly baseline: CafPrefillBindingBaseline
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
}

export type VisibleCafBindingDraft = VisibleCafBindingRow & {
  readonly draft: CafPrefillBindingDraftContent
  readonly baseline: CafPrefillBindingBaseline
  readonly showValidation: boolean
  readonly showStaleGuidance: boolean
  readonly dirty: boolean
}

export function seedCafBindingDraftEntry(
  definition: FormDefinition,
  fieldId: string,
): CafBindingDraftEntry {
  const binding = readCafPrefillBinding(definition, fieldId)
  return {
    draft: draftFromBinding(binding),
    baseline: { binding },
    showValidation: false,
    showStaleGuidance: false,
  }
}

/**
 * Visible CAF binding drafts in canvas order.
 * Uses UI draft map when present; otherwise committed (or unbound empty) content.
 */
export function collectVisibleCafBindingDrafts(
  definition: FormDefinition,
  bindingDrafts: Readonly<Record<string, CafBindingDraftEntry>>,
): readonly VisibleCafBindingDraft[] {
  return collectVisibleCafBindingRows(definition).map((row) => {
    const entry = bindingDrafts[row.fieldId]
    if (entry) {
      return {
        ...row,
        draft: entry.draft,
        baseline: entry.baseline,
        showValidation: entry.showValidation,
        showStaleGuidance: entry.showStaleGuidance,
        dirty: isCafBindingDraftDirty(entry.baseline, entry.draft, entry.showStaleGuidance),
      }
    }
    const draft = draftFromBinding(row.committed)
    const baseline: CafPrefillBindingBaseline = { binding: row.committed }
    return {
      ...row,
      draft,
      baseline,
      showValidation: false,
      showStaleGuidance: false,
      dirty: false,
    }
  })
}

export function isAnyBindingDraftDirty(
  bindingDrafts: Readonly<Record<string, CafBindingDraftEntry>>,
): boolean {
  for (const entry of Object.values(bindingDrafts)) {
    if (
      entry.showValidation ||
      isCafBindingDraftDirty(entry.baseline, entry.draft, entry.showStaleGuidance)
    ) {
      return true
    }
  }
  return false
}

export function seedCafBindingDraftContent(
  binding: PrefillBinding | null,
): CafPrefillBindingDraftContent {
  return draftFromBinding(binding)
}

export function isCafBindingContentDirty(
  baseline: CafPrefillBindingBaseline,
  draft: CafPrefillBindingDraftContent,
): boolean {
  const baselineDraft = draftFromBinding(baseline.binding)
  return (
    baselineDraft.cafAttribute !== draft.cafAttribute ||
    baselineDraft.confidenceMin !== draft.confidenceMin
  )
}

export function isCafBindingDraftDirty(
  baseline: CafPrefillBindingBaseline,
  draft: CafPrefillBindingDraftContent,
  showStaleGuidance: boolean,
): boolean {
  return showStaleGuidance || isCafBindingContentDirty(baseline, draft)
}

/** @internal helper for tests / UI — detect plain object shape without getters. */
export function isPlainJsonObject(value: unknown): boolean {
  return isPlainObject(value)
}
