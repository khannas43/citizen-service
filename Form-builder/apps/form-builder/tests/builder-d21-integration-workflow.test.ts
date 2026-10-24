import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'

import {
  addField,
  authoringReducer,
  collectBindableFields,
  collectIntegrationBindingDirtyFieldIds,
  collectWorkflowBindingDirtyFieldIds,
  createAuthoringSession,
  createAuthoringUiState,
  familyMemberDefinitionPath,
  isFieldAnyDraftDirty,
  isIntegrationBindingSurfaceDirty,
  isPropertyEditorDirty,
  isWorkflowBindingSurfaceDirty,
  moveField,
  readIntegrationBindings,
  readWorkflowBindings,
  removeField,
  seedIntegrationBindingDraftSurface,
  updateIntegrationBindings,
  updateWorkflowBindings,
  validateIntegrationBindingsDraft,
  validateWorkflowBindingsDraft,
} from '../src/authoring/index.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function addText(session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)) {
  const result = addField(session, 'text-short')
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add text-short')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

function addFamilyRepeater(session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)) {
  const result = addField(session, 'family-repeater', {
    configured: {
      widgetType: 'family-repeater',
      maxItems: 5,
      initialMember: {
        widgetType: 'text-short',
        labelEn: 'Member name',
        labelGu: 'સભ્યનું નામ',
        required: true,
      },
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add family-repeater')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D21 — collectBindableFields', () => {
  it('includes data-producing roots and excludes display/layout', () => {
    const fields = collectBindableFields(ILLUSTRATIVE_DRAFT_DEFINITION)
    const ids = fields.map((field) => field.fieldId)
    expect(ids).toContain('applicant_name')
    expect(ids).toContain('gender')
    expect(ids).not.toContain('section_identity')
    expect(ids).not.toContain('info_guidance')
    expect(fields.every((field) => field.kind === 'root')).toBe(true)
  })

  it('orders nested family members immediately after their parent', () => {
    const { state, fieldId } = addFamilyRepeater()
    const nested = familyMemberDefinitionPath(fieldId, 'member_name')
    // Default allocated property may differ — resolve from graph.
    const fields = collectBindableFields(state.definition)
    const parentIndex = fields.findIndex((field) => field.fieldId === fieldId)
    expect(parentIndex).toBeGreaterThanOrEqual(0)
    const nestedFields = fields.filter((field) => field.parentRepeaterFieldId === fieldId)
    expect(nestedFields.length).toBeGreaterThanOrEqual(1)
    expect(fields[parentIndex + 1]?.kind).toBe('nested')
    expect(fields[parentIndex + 1]?.parentRepeaterFieldId).toBe(fieldId)
    expect(fields.some((field) => field.fieldId === nested || field.kind === 'nested')).toBe(true)
  })

  it('never duplicates field IDs', () => {
    const { state } = addFamilyRepeater()
    const fields = collectBindableFields(state.definition)
    const ids = fields.map((field) => field.fieldId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('FB-D21 — integration binding authoring', () => {
  it('validates exact keys, direction, duplicates, and applies deterministically', () => {
    const first = addText()
    const second = addText(first.state)
    const a = first.fieldId
    const b = second.fieldId

    const draft = {
      rows: [
        {
          rowKey: 'integration-row-1',
          fieldId: b,
          adapterId: 'adapter-b',
          param: 'param-b',
          direction: 'out' as const,
        },
        {
          rowKey: 'integration-row-2',
          fieldId: a,
          adapterId: 'adapter-a',
          param: 'param-a',
          direction: 'in' as const,
        },
      ],
    }
    const validated = validateIntegrationBindingsDraft(second.state.definition, draft)
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    // Deterministic: bindable order then adapter/param/direction.
    expect(validated.bindings.map((entry) => entry.fieldId)).toEqual([a, b])

    const applied = updateIntegrationBindings(second.state, draft, [])
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(readIntegrationBindings(applied.state.definition)).toEqual([
      { fieldId: a, adapterId: 'adapter-a', param: 'param-a', direction: 'in' },
      { fieldId: b, adapterId: 'adapter-b', param: 'param-b', direction: 'out' },
    ])
    expect(applied.state.definition.meta.prefillBindings).toEqual(
      second.state.definition.meta.prefillBindings,
    )
    expect(applied.state.definition.meta.workflowBindings).toEqual(
      second.state.definition.meta.workflowBindings,
    )

    const duplicate = validateIntegrationBindingsDraft(applied.state.definition, {
      rows: [
        ...draft.rows,
        {
          rowKey: 'integration-row-3',
          fieldId: a,
          adapterId: 'adapter-a',
          param: 'param-a',
          direction: 'in',
        },
      ],
    })
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok) return
    expect(duplicate.issues.some((issue) => issue.code === 'integration_duplicate_tuple')).toBe(
      true,
    )

    expect(
      validateIntegrationBindingsDraft(applied.state.definition, {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId: a,
            adapterId: '  padded  ',
            param: 'param',
            direction: 'in',
          },
        ],
      }).ok,
    ).toBe(false)

    expect(
      validateIntegrationBindingsDraft(applied.state.definition, {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId: 'section_identity',
            adapterId: 'adapter',
            param: 'param',
            direction: 'in',
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('supports nested family member paths and rejects sparse/hostile rows', () => {
    const { state, fieldId } = addFamilyRepeater()
    const nested = collectBindableFields(state.definition).find(
      (field) => field.parentRepeaterFieldId === fieldId,
    )!
    const ok = validateIntegrationBindingsDraft(state.definition, {
      rows: [
        {
          rowKey: 'integration-row-1',
          fieldId: nested.fieldId,
          adapterId: 'hub-adapter',
          param: 'memberParam',
          direction: 'in',
        },
      ],
    })
    expect(ok.ok).toBe(true)

    const sparse = {
      rows: {
        length: 1,
        0: {
          rowKey: 'integration-row-1',
          fieldId: nested.fieldId,
          adapterId: 'hub',
          param: 'p',
          direction: 'in',
        },
      },
    }
    expect(
      validateIntegrationBindingsDraft(state.definition, sparse as unknown as { rows: never[] }).ok,
    ).toBe(false)
  })

  it('stale baseline rejects apply without mutating definition', () => {
    const { state, fieldId } = addText()
    const first = updateIntegrationBindings(
      state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a1',
            param: 'p1',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const stale = updateIntegrationBindings(
      first.state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a2',
            param: 'p2',
            direction: 'out',
          },
        ],
      },
      [],
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')
    expect(readIntegrationBindings(first.state.definition)).toEqual([
      { fieldId, adapterId: 'a1', param: 'p1', direction: 'in' },
    ])
  })
})

describe('FB-D21 — workflow binding authoring', () => {
  it('validates pairs, ordering, and preserves other binding arrays', () => {
    const first = addText()
    const withIntegration = updateIntegrationBindings(
      first.state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId: first.fieldId,
            adapterId: 'keep',
            param: 'me',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(withIntegration.ok).toBe(true)
    if (!withIntegration.ok) return

    const second = addText(withIntegration.state)
    const draft = {
      rows: [
        {
          rowKey: 'workflow-row-1',
          fieldId: second.fieldId,
          stage: 'review',
        },
        {
          rowKey: 'workflow-row-2',
          fieldId: first.fieldId,
          stage: 'intake',
        },
      ],
    }
    const validated = validateWorkflowBindingsDraft(second.state.definition, draft)
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    expect(validated.bindings.map((entry) => entry.fieldId)).toEqual([
      first.fieldId,
      second.fieldId,
    ])

    const applied = updateWorkflowBindings(second.state, draft, [])
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(readWorkflowBindings(applied.state.definition)).toEqual([
      { fieldId: first.fieldId, stage: 'intake' },
      { fieldId: second.fieldId, stage: 'review' },
    ])
    expect(applied.state.definition.meta.integrationBindings).toEqual(
      withIntegration.state.definition.meta.integrationBindings,
    )

    const duplicate = validateWorkflowBindingsDraft(applied.state.definition, {
      rows: [...draft.rows, { rowKey: 'workflow-row-3', fieldId: first.fieldId, stage: 'intake' }],
    })
    expect(duplicate.ok).toBe(false)
  })
})

describe('FB-D21 — reducer draft surfaces and isolation', () => {
  it('Add/Edit/Remove/Apply/Cancel integration independently of CAF and workflow', () => {
    const { state, fieldId } = addText()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    ui = authoringReducer(ui, { type: 'addIntegrationBindingRow' })
    const rowKey = ui.integrationBindingDraft!.draft.rows[0]!.rowKey
    ui = authoringReducer(ui, {
      type: 'patchIntegrationBindingRow',
      rowKey,
      patch: {
        fieldId,
        adapterId: 'adapter-1',
        param: 'param-1',
        direction: 'in',
      },
    })
    expect(
      isIntegrationBindingSurfaceDirty(ui.integrationBindingDraft, ui.authoring.definition),
    ).toBe(true)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    expect(ui.workflowBindingDraft).toBeNull()
    expect(Object.keys(ui.bindingDrafts)).toHaveLength(0)

    const before = structuredClone(ui.authoring.definition.meta.workflowBindings)
    ui = authoringReducer(ui, { type: 'applyIntegrationBindingDraft' })
    expect(ui.authoring.definition.meta.integrationBindings).toEqual([
      { fieldId, adapterId: 'adapter-1', param: 'param-1', direction: 'in' },
    ])
    expect(ui.authoring.definition.meta.workflowBindings).toEqual(before)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchIntegrationBindingRow',
      rowKey: ui.integrationBindingDraft!.draft.rows[0]!.rowKey,
      patch: { adapterId: 'changed' },
    })
    ui = authoringReducer(ui, { type: 'cancelIntegrationBindingDraft' })
    expect(ui.authoring.definition.meta.integrationBindings[0]!.adapterId).toBe('adapter-1')
    expect(ui.integrationBindingDraft!.draft.rows[0]!.adapterId).toBe('adapter-1')
  })

  it('workflow draft apply does not commit integration draft', () => {
    const { state, fieldId } = addText()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    ui = authoringReducer(ui, { type: 'addIntegrationBindingRow' })
    const integrationRow = ui.integrationBindingDraft!.draft.rows[0]!.rowKey
    ui = authoringReducer(ui, {
      type: 'patchIntegrationBindingRow',
      rowKey: integrationRow,
      patch: { fieldId, adapterId: 'draft-only', param: 'x', direction: 'out' },
    })
    ui = authoringReducer(ui, { type: 'ensureWorkflowBindingDraft' })
    ui = authoringReducer(ui, { type: 'addWorkflowBindingRow' })
    const workflowRow = ui.workflowBindingDraft!.draft.rows[0]!.rowKey
    ui = authoringReducer(ui, {
      type: 'patchWorkflowBindingRow',
      rowKey: workflowRow,
      patch: { fieldId, stage: 'stage-a' },
    })
    ui = authoringReducer(ui, { type: 'applyWorkflowBindingDraft' })
    expect(ui.authoring.definition.meta.workflowBindings).toEqual([{ fieldId, stage: 'stage-a' }])
    expect(ui.authoring.definition.meta.integrationBindings).toEqual([])
    expect(
      isIntegrationBindingSurfaceDirty(ui.integrationBindingDraft, ui.authoring.definition),
    ).toBe(true)
  })

  it('property draft stays isolated from binding surfaces', () => {
    const { state, fieldId } = addText()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { labelEn: 'Changed label' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    ui = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    ui = authoringReducer(ui, { type: 'addIntegrationBindingRow' })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(
      isIntegrationBindingSurfaceDirty(ui.integrationBindingDraft, ui.authoring.definition),
    ).toBe(true)
  })

  it('marks canvas dirty field union and clears on session replace', () => {
    const { state, fieldId } = addText()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    ui = authoringReducer(ui, { type: 'addIntegrationBindingRow' })
    const rowKey = ui.integrationBindingDraft!.draft.rows[0]!.rowKey
    ui = authoringReducer(ui, {
      type: 'patchIntegrationBindingRow',
      rowKey,
      patch: { fieldId, adapterId: 'a', param: 'p', direction: 'in' },
    })
    const dirty = collectIntegrationBindingDirtyFieldIds(
      ui.integrationBindingDraft,
      ui.authoring.definition,
    )
    expect(dirty.has(fieldId)).toBe(true)
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.integrationBindingDraft).toBeNull()
    expect(ui.workflowBindingDraft).toBeNull()
  })

  it('field removal scrubs bindings and marks active draft stale', () => {
    const { state, fieldId } = addText()
    const applied = updateIntegrationBindings(
      state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a',
            param: 'p',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    let ui = createAuthoringUiState(applied.state)
    ui = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    ui = authoringReducer(ui, {
      type: 'patchIntegrationBindingRow',
      rowKey: ui.integrationBindingDraft!.draft.rows[0]!.rowKey,
      patch: { adapterId: 'editing' },
    })
    // Keep another field so remove is allowed.
    const other = addText(ui.authoring)
    ui = { ...ui, authoring: other.state }
    ui = authoringReducer(ui, { type: 'remove', fieldId })
    expect(
      ui.authoring.definition.meta.integrationBindings.some((entry) => entry.fieldId === fieldId),
    ).toBe(false)
    expect(ui.integrationBindingDraft?.showStaleGuidance).toBe(true)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
  })

  it('family-repeater removal scrubs descendant bindings without prefix collision', () => {
    const { state, fieldId } = addFamilyRepeater()
    const nested = collectBindableFields(state.definition).find(
      (field) => field.parentRepeaterFieldId === fieldId,
    )!
    const siblingRoot = addText(state)
    const applied = updateIntegrationBindings(
      siblingRoot.state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId: nested.fieldId,
            adapterId: 'nested',
            param: 'p',
            direction: 'in',
          },
          {
            rowKey: 'integration-row-2',
            fieldId: siblingRoot.fieldId,
            adapterId: 'root',
            param: 'p',
            direction: 'out',
          },
        ],
      },
      [],
    )
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    // Prefix collision fixture: field id that shares a string prefix with the repeater.
    const removed = removeField(applied.state, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(
      removed.state.definition.meta.integrationBindings.some((entry) =>
        entry.fieldId.startsWith(`${fieldId}[].`),
      ),
    ).toBe(false)
    expect(removed.state.definition.meta.integrationBindings).toEqual([
      { fieldId: siblingRoot.fieldId, adapterId: 'root', param: 'p', direction: 'out' },
    ])
  })

  it('reorder preserves integration and workflow bindings', () => {
    const first = addText()
    const second = addText(first.state)
    const withBindings = updateIntegrationBindings(
      second.state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId: first.fieldId,
            adapterId: 'a',
            param: 'p',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(withBindings.ok).toBe(true)
    if (!withBindings.ok) return
    const withWorkflow = updateWorkflowBindings(
      withBindings.state,
      {
        rows: [
          {
            rowKey: 'workflow-row-1',
            fieldId: second.fieldId,
            stage: 'review',
          },
        ],
      },
      [],
    )
    expect(withWorkflow.ok).toBe(true)
    if (!withWorkflow.ok) return
    const beforeIntegration = structuredClone(
      withWorkflow.state.definition.meta.integrationBindings,
    )
    const beforeWorkflow = structuredClone(withWorkflow.state.definition.meta.workflowBindings)
    const moved = moveField(withWorkflow.state, first.fieldId, 'later')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.state.definition.meta.integrationBindings).toEqual(beforeIntegration)
    expect(moved.state.definition.meta.workflowBindings).toEqual(beforeWorkflow)
  })

  it('submitted definition rejects binding mutation', () => {
    const { state, fieldId } = addText()
    const submitted: FormDefinition = {
      ...state.definition,
      status: 'submitted',
      audit: { ...state.definition.audit, submittedBy: 'actor-1' },
    }
    const ui = createAuthoringUiState(createAuthoringSession(submitted))
    const next = authoringReducer(ui, { type: 'ensureIntegrationBindingDraft' })
    expect(next.integrationBindingDraft).toBeNull()
    const direct = updateIntegrationBindings(
      createAuthoringSession(submitted),
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a',
            param: 'p',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(direct.ok).toBe(false)
  })

  it('no-op apply keeps definition reference identity for equal bindings', () => {
    const { state, fieldId } = addText()
    const first = updateIntegrationBindings(
      state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a',
            param: 'p',
            direction: 'in',
          },
        ],
      },
      [],
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const noop = updateIntegrationBindings(
      first.state,
      {
        rows: [
          {
            rowKey: 'integration-row-1',
            fieldId,
            adapterId: 'a',
            param: 'p',
            direction: 'in',
          },
        ],
      },
      first.state.definition.meta.integrationBindings,
    )
    expect(noop.ok).toBe(true)
    if (!noop.ok) return
    expect(noop.state).toBe(first.state)
  })
})

describe('FB-D21 — dirty helpers', () => {
  it('seeded matching surface is not dirty; workflow dirty ids tracked', () => {
    const { state, fieldId } = addText()
    const surface = seedIntegrationBindingDraftSurface(state.definition)
    expect(isIntegrationBindingSurfaceDirty(surface, state.definition)).toBe(false)
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'ensureWorkflowBindingDraft' })
    ui = authoringReducer(ui, { type: 'addWorkflowBindingRow' })
    const rowKey = ui.workflowBindingDraft!.draft.rows[0]!.rowKey
    ui = authoringReducer(ui, {
      type: 'patchWorkflowBindingRow',
      rowKey,
      patch: { fieldId, stage: 's1' },
    })
    expect(isWorkflowBindingSurfaceDirty(ui.workflowBindingDraft, ui.authoring.definition)).toBe(
      true,
    )
    expect(
      collectWorkflowBindingDirtyFieldIds(ui.workflowBindingDraft, ui.authoring.definition).has(
        fieldId,
      ),
    ).toBe(true)
    expect(isFieldAnyDraftDirty(ui, fieldId)).toBe(false)
  })
})
