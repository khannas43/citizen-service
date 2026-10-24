import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getCanvasReorderTargets,
  getMoveCapability,
  hasActiveCanvasReorderGesture,
  moveField,
  progressiveStructureKey,
  reorderFieldWithinStep,
} from '../src/authoring/index.js'
import { isAuthoringInteractionBlocked } from '../src/validation/is-authoring-interaction-blocked.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function uiOrderOf(definition: FormDefinition): readonly string[] {
  return definition.uiSchema['ui:order'] as readonly string[]
}

function fourFieldTwoStep(): FormDefinition {
  return {
    serviceId: 'd20-two-step',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        'field.a': { type: 'string', maxLength: 40 },
        'field.b': { type: 'string', maxLength: 40 },
        'field.c': { type: 'string', maxLength: 40 },
        'field.d': { type: 'string', maxLength: 40 },
      },
    },
    uiSchema: {
      'ui:order': ['field.a', 'field.b', 'field.c', 'field.d'],
      'field.a': { 'ui:widget': 'text-short' },
      'field.b': { 'ui:widget': 'text-short' },
      'field.c': { 'ui:widget': 'text-short' },
      'field.d': { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'field.a', widgetType: 'text-short' },
        { fieldId: 'field.b', widgetType: 'text-short' },
        { fieldId: 'field.c', widgetType: 'text-short' },
        { fieldId: 'field.d', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          'field.a': { en: 'A', gu: 'એ' },
          'field.b': { en: 'B', gu: 'બી' },
          'field.c': { en: 'C', gu: 'સી' },
          'field.d': { en: 'D', gu: 'ડી' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [{ fieldId: 'field.b', cafAttribute: 'x.y', confidenceMin: 0.5 }],
      integrationBindings: [
        { fieldId: 'field.b', adapterId: 'adapter-1', param: 'p', direction: 'in' },
      ],
      workflowBindings: [{ fieldId: 'field.b', stage: 'review' }],
      progressiveSteps: [
        {
          stepId: 'step_a',
          labelEn: 'Step A',
          labelGu: 'પગલું A',
          fieldIds: ['field.a', 'field.b'],
        },
        {
          stepId: 'step_b',
          labelEn: 'Step B',
          labelGu: 'પગલું B',
          fieldIds: ['field.c', 'field.d'],
        },
      ],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-16T00:00:00Z' },
  }
}

function singlePageThree(): FormDefinition {
  const base = fourFieldTwoStep()
  return {
    ...base,
    serviceId: 'd20-single-page',
    jsonSchema: {
      ...base.jsonSchema,
      properties: {
        'field.a': { type: 'string', maxLength: 40 },
        'field.b': { type: 'string', maxLength: 40 },
        'field.c': { type: 'string', maxLength: 40 },
      },
    },
    uiSchema: {
      'ui:order': ['field.a', 'field.b', 'field.c'],
      'field.a': { 'ui:widget': 'text-short' },
      'field.b': { 'ui:widget': 'text-short' },
      'field.c': { 'ui:widget': 'text-short' },
    },
    meta: {
      ...base.meta,
      paletteProvenance: [
        { fieldId: 'field.a', widgetType: 'text-short' },
        { fieldId: 'field.b', widgetType: 'text-short' },
        { fieldId: 'field.c', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          'field.a': { en: 'A', gu: 'એ' },
          'field.b': { en: 'B', gu: 'બી' },
          'field.c': { en: 'C', gu: 'સી' },
        },
        help: {},
        errors: {},
      },
      progressiveSteps: [],
    },
  }
}

describe('FB-D20 — getCanvasReorderTargets', () => {
  it('returns within-step targets including end and marks no-ops for punctuation IDs', () => {
    const definition = fourFieldTwoStep()
    const targets = getCanvasReorderTargets(definition, 'field.b')
    expect(targets.map((t) => t.beforeFieldId)).toEqual(['field.a', 'field.b', null])
    expect(targets.find((t) => t.beforeFieldId === 'field.b')?.isNoOp).toBe(true)
    expect(targets.find((t) => t.beforeFieldId === 'field.a')?.isNoOp).toBe(false)
    expect(targets.find((t) => t.beforeFieldId === null)?.isNoOp).toBe(true)
  })

  it('excludes cross-step insertion locations', () => {
    const definition = fourFieldTwoStep()
    const targets = getCanvasReorderTargets(definition, 'field.b')
    expect(targets.some((t) => t.beforeFieldId === 'field.c')).toBe(false)
    expect(targets.some((t) => t.beforeFieldId === 'field.d')).toBe(false)
  })

  it('scopes single-page forms to the full ui:order', () => {
    const definition = singlePageThree()
    const targets = getCanvasReorderTargets(definition, 'field.a')
    expect(targets.map((t) => t.beforeFieldId)).toEqual(['field.a', 'field.b', 'field.c', null])
  })
})

describe('FB-D20 — reorderFieldWithinStep', () => {
  it('reorders within a progressive step and syncs ui:order + step fieldIds', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const previewBefore = state.previewFormData
    const jsonBefore = structuredClone(state.definition.jsonSchema)
    const bilingualBefore = structuredClone(state.definition.meta.bilingual)
    const provenanceBefore = structuredClone(state.definition.meta.paletteProvenance)
    const bindingsBefore = {
      prefill: structuredClone(state.definition.meta.prefillBindings),
      integration: structuredClone(state.definition.meta.integrationBindings),
      workflow: structuredClone(state.definition.meta.workflowBindings),
    }
    const auditBefore = structuredClone(state.definition.audit)
    const structureBefore = progressiveStructureKey(state.definition)

    const result = reorderFieldWithinStep(state, {
      fieldId: 'field.b',
      beforeFieldId: 'field.a',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(uiOrderOf(result.state.definition)).toEqual(['field.b', 'field.a', 'field.c', 'field.d'])
    expect(result.state.definition.meta.progressiveSteps[0]!.fieldIds).toEqual([
      'field.b',
      'field.a',
    ])
    expect(result.state.definition.meta.progressiveSteps[1]!.fieldIds).toEqual([
      'field.c',
      'field.d',
    ])
    expect(result.state.definition.meta.progressiveSteps.map((s) => s.stepId)).toEqual([
      'step_a',
      'step_b',
    ])
    expect(result.state.definition.jsonSchema).toEqual(jsonBefore)
    expect(result.state.definition.meta.bilingual).toEqual(bilingualBefore)
    expect(result.state.definition.meta.paletteProvenance).toEqual(provenanceBefore)
    expect(result.state.definition.meta.prefillBindings).toEqual(bindingsBefore.prefill)
    expect(result.state.definition.meta.integrationBindings).toEqual(bindingsBefore.integration)
    expect(result.state.definition.meta.workflowBindings).toEqual(bindingsBefore.workflow)
    expect(result.state.definition.audit).toEqual(auditBefore)
    expect(result.state.previewFormData).toBe(previewBefore)
    expect(result.state.selectedFieldId).toBe('field.b')
    expect(progressiveStructureKey(result.state.definition)).not.toBe(structureBefore)
    expect(result.state.definition.meta.progressiveSteps.flatMap((s) => s.fieldIds)).toEqual(
      uiOrderOf(result.state.definition),
    )
  })

  it('supports first, middle, and end positions on a single-page form', () => {
    let state = createAuthoringSession(singlePageThree())
    const toEnd = reorderFieldWithinStep(state, { fieldId: 'field.a', beforeFieldId: null })
    expect(toEnd.ok).toBe(true)
    if (!toEnd.ok) return
    expect(uiOrderOf(toEnd.state.definition)).toEqual(['field.b', 'field.c', 'field.a'])
    state = toEnd.state

    const toMiddle = reorderFieldWithinStep(state, {
      fieldId: 'field.a',
      beforeFieldId: 'field.c',
    })
    expect(toMiddle.ok).toBe(true)
    if (!toMiddle.ok) return
    expect(uiOrderOf(toMiddle.state.definition)).toEqual(['field.b', 'field.a', 'field.c'])
    state = toMiddle.state

    const toFirst = reorderFieldWithinStep(state, {
      fieldId: 'field.c',
      beforeFieldId: 'field.b',
    })
    expect(toFirst.ok).toBe(true)
    if (!toFirst.ok) return
    expect(uiOrderOf(toFirst.state.definition)).toEqual(['field.c', 'field.b', 'field.a'])
  })

  it('rejects cross-step targets without mutation', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const before = state.definition
    const result = reorderFieldWithinStep(state, {
      fieldId: 'field.b',
      beforeFieldId: 'field.c',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('move_crosses_step_boundary')
    expect(state.definition).toBe(before)
    expect(uiOrderOf(state.definition)).toEqual(['field.a', 'field.b', 'field.c', 'field.d'])
  })

  it('returns an explicit no-op without cloning when order is unchanged', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const result = reorderFieldWithinStep(state, {
      fieldId: 'field.b',
      beforeFieldId: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toBe(state)
    expect(result.state.definition).toBe(state.definition)
  })

  it('does not mutate the input session object graph', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const snapshot = structuredClone(state.definition)
    reorderFieldWithinStep(state, { fieldId: 'field.b', beforeFieldId: 'field.a' })
    expect(state.definition).toEqual(snapshot)
  })

  it('guards submitted definitions', () => {
    const submitted = {
      ...fourFieldTwoStep(),
      status: 'submitted' as const,
    }
    const state = createAuthoringSession(submitted)
    const result = reorderFieldWithinStep(state, {
      fieldId: 'field.b',
      beforeFieldId: 'field.a',
    })
    expect(result.ok).toBe(false)
  })
})

describe('FB-D20 — moveField delegates to reorderFieldWithinStep', () => {
  it('produces the same within-step adjacent order as the canonical reorder', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const viaMove = moveField(state, 'field.b', 'up')
    const viaReorder = reorderFieldWithinStep(state, {
      fieldId: 'field.b',
      beforeFieldId: 'field.a',
    })
    expect(viaMove.ok).toBe(true)
    expect(viaReorder.ok).toBe(true)
    if (!viaMove.ok || !viaReorder.ok) return
    expect(uiOrderOf(viaMove.state.definition)).toEqual(uiOrderOf(viaReorder.state.definition))
    expect(viaMove.state.definition.meta.progressiveSteps).toEqual(
      viaReorder.state.definition.meta.progressiveSteps,
    )
    expect(getMoveCapability(state, 'field.a').canMoveUp).toBe(false)
  })
})

describe('FB-D20 — ephemeral gesture reducer', () => {
  it('lifts without dirtying the definition and commits exactly once', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    const definitionBefore = ui.authoring.definition
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'keyboard',
    })
    expect(hasActiveCanvasReorderGesture(ui)).toBe(true)
    expect(isAuthoringInteractionBlocked(ui)).toBe(true)
    expect(ui.authoring.definition).toBe(definitionBefore)
    expect(ui.announcement?.key).toBe('announceCanvasReorderLifted')

    ui = authoringReducer(ui, { type: 'proposeCanvasReorder', beforeFieldId: 'field.a' })
    expect(ui.authoring.definition).toBe(definitionBefore)
    expect(ui.announcement?.key).toBe('announceCanvasReorderProposedFirst')

    const seq = ui.announcement!.id
    ui = authoringReducer(ui, { type: 'commitCanvasReorder' })
    expect(hasActiveCanvasReorderGesture(ui)).toBe(false)
    expect(ui.authoring.definition).not.toBe(definitionBefore)
    expect(uiOrderOf(ui.authoring.definition)).toEqual(['field.b', 'field.a', 'field.c', 'field.d'])
    expect(ui.announcement?.key).toBe('announceCanvasReorderDropped')
    expect(ui.announcement?.id).toBeGreaterThan(seq)
    expect(ui.pendingFocusEditorControl).toBe('canvas-reorder-handle:field.b')
  })

  it('cancels without mutation and restores action eligibility', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    const definitionBefore = ui.authoring.definition
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'pointer',
    })
    expect(isAuthoringInteractionBlocked(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelCanvasReorder' })
    expect(hasActiveCanvasReorderGesture(ui)).toBe(false)
    expect(ui.authoring.definition).toBe(definitionBefore)
    expect(isAuthoringInteractionBlocked(ui)).toBe(false)
    expect(ui.announcement?.key).toBe('announceCanvasReorderCancelled')
  })

  it('blocks Validate/Save-related actions while the gesture is active', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.a',
      mode: 'keyboard',
    })
    const blockedAdd = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown' })
    expect(blockedAdd.canvasReorderGesture).not.toBeNull()
    expect(blockedAdd.authoring.definition).toBe(ui.authoring.definition)
    const blockedMove = authoringReducer(ui, {
      type: 'move',
      fieldId: 'field.a',
      direction: 'down',
    })
    expect(blockedMove.authoring.definition).toBe(ui.authoring.definition)
  })

  it('rejects cross-step propose and keeps Home/End inside the step', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'keyboard',
    })
    const rejected = authoringReducer(ui, {
      type: 'proposeCanvasReorder',
      beforeFieldId: 'field.c',
    })
    expect(rejected.canvasReorderGesture?.proposedBeforeFieldId).toBe(
      ui.canvasReorderGesture?.proposedBeforeFieldId,
    )

    ui = authoringReducer(ui, { type: 'proposeCanvasReorder', beforeFieldId: 'field.a' })
    ui = authoringReducer(ui, { type: 'proposeCanvasReorder', beforeFieldId: null })
    expect(ui.canvasReorderGesture?.proposedBeforeFieldId).toBe(null)
    expect(ui.announcement?.key).toBe('announceCanvasReorderProposedEnd')
  })

  it('no-op commit retains the same definition reference', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    const definitionBefore = ui.authoring.definition
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'keyboard',
    })
    ui = authoringReducer(ui, { type: 'commitCanvasReorder' })
    expect(ui.authoring.definition).toBe(definitionBefore)
  })

  it('preserves editor drafts across a successful reorder', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    ui = authoringReducer(ui, { type: 'select', fieldId: 'field.a' })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'field.a',
      patch: { labelEn: 'Draft A' },
    })
    expect(ui.editorDrafts['field.a']).toBeDefined()
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'keyboard',
    })
    ui = authoringReducer(ui, { type: 'proposeCanvasReorder', beforeFieldId: 'field.a' })
    ui = authoringReducer(ui, { type: 'commitCanvasReorder' })
    expect(ui.editorDrafts['field.a']?.draft.labelEn).toBe('Draft A')
  })

  it('ignores lift on submitted definitions via the reducer guard', () => {
    const submitted = { ...fourFieldTwoStep(), status: 'submitted' as const }
    let ui = createAuthoringUiState(createAuthoringSession(submitted))
    ui = authoringReducer(ui, {
      type: 'beginCanvasReorder',
      fieldId: 'field.b',
      mode: 'keyboard',
    })
    expect(ui.canvasReorderGesture).toBeNull()
  })
})

describe('FB-D20 — illustrative regression smoke', () => {
  it('still moves within a progressive step via moveField', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const order = uiOrderOf(state.definition)
    const second = order[1]!
    const result = moveField(state, second, 'up')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(uiOrderOf(result.state.definition)[0]).toBe(second)
  })
})
