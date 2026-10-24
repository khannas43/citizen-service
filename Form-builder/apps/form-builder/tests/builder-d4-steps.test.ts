import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'

import {
  AuthoringError,
  allocateStepId,
  assertDefinitionIntegrity,
  authoringReducer,
  computeBilingualCompleteness,
  createAuthoringSession,
  createAuthoringUiState,
  enableProgressiveSteps,
  getStepBoundaryCapabilities,
  mergeStepBoundary,
  moveStepBoundary,
  progressiveStructureKey,
  readAllFieldBilingualContent,
  readAllStepBilingualContent,
  splitStepAfterField,
  stepHasUnsavedBilingualChanges,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function cloneDefinition(definition: FormDefinition): FormDefinition {
  return structuredClone(definition) as FormDefinition
}

function singlePageFromIllustrative(): FormDefinition {
  const definition = cloneDefinition(ILLUSTRATIVE_DRAFT_DEFINITION)
  return {
    ...definition,
    meta: {
      ...definition.meta,
      progressiveSteps: [],
    },
  }
}

function fourFieldTwoStep(): FormDefinition {
  return {
    serviceId: 'd4-fixture',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        field_a: { type: 'string', maxLength: 40 },
        field_b: { type: 'string', maxLength: 40 },
        field_c: { type: 'string', maxLength: 40 },
        field_d: { type: 'string', maxLength: 40 },
      },
    },
    uiSchema: {
      'ui:order': ['field_a', 'field_b', 'field_c', 'field_d'],
      field_a: { 'ui:widget': 'text-short' },
      field_b: { 'ui:widget': 'text-short' },
      field_c: { 'ui:widget': 'text-short' },
      field_d: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'field_a', widgetType: 'text-short' },
        { fieldId: 'field_b', widgetType: 'text-short' },
        { fieldId: 'field_c', widgetType: 'text-short' },
        { fieldId: 'field_d', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          field_a: { en: 'A', gu: 'એ' },
          field_b: { en: 'B', gu: 'બી' },
          field_c: { en: 'C', gu: 'સી' },
          field_d: { en: 'D', gu: 'ડી' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'step_alpha',
          labelEn: 'Alpha',
          labelGu: 'આલ્ફા',
          fieldIds: ['field_a', 'field_b'],
        },
        {
          stepId: 'step_beta',
          labelEn: 'Beta',
          labelGu: 'બીટા',
          fieldIds: ['field_c', 'field_d'],
        },
      ],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-16T00:00:00Z' },
  }
}

function concatStepFields(definition: FormDefinition): string[] {
  return definition.meta.progressiveSteps.flatMap((step) => [...step.fieldIds])
}

function freezeBaseline(definition: FormDefinition): FormDefinition {
  return Object.freeze(structuredClone(definition)) as FormDefinition
}

describe('FB-D4 — progressive step-boundary authoring (pure)', () => {
  it('rejects progressiveSteps whose concatenation does not equal ui:order', () => {
    const definition = fourFieldTwoStep()
    const broken: FormDefinition = {
      ...definition,
      meta: {
        ...definition.meta,
        progressiveSteps: [
          {
            stepId: 'step_alpha',
            labelEn: 'Alpha',
            labelGu: 'આલ્ફા',
            fieldIds: ['field_b', 'field_a'],
          },
          {
            stepId: 'step_beta',
            labelEn: 'Beta',
            labelGu: 'બીટા',
            fieldIds: ['field_c', 'field_d'],
          },
        ],
      },
    }
    expect(() => assertDefinitionIntegrity(broken)).toThrow(AuthoringError)
    try {
      assertDefinitionIntegrity(broken)
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('inconsistent_step_boundaries')
    }
  })

  it('enables progressive steps from single-page with one covering step', () => {
    const baseline = freezeBaseline(singlePageFromIllustrative())
    const state = createAuthoringSession(baseline)
    const previewBefore = structuredClone(state.previewFormData)
    const result = enableProgressiveSteps(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.state.definition.meta.progressiveSteps).toHaveLength(1)
    const step = result.state.definition.meta.progressiveSteps[0]!
    expect(step.stepId).toBe('step_1')
    expect(step.labelEn.length).toBeGreaterThan(0)
    expect(step.labelGu.length).toBeGreaterThan(0)
    expect([...step.fieldIds]).toEqual([...(baseline.uiSchema['ui:order'] as string[])])
    expect(result.state.previewFormData).toEqual(previewBefore)
    expect(baseline.meta.progressiveSteps).toEqual([])
    assertDefinitionIntegrity(result.state.definition)
  })

  it('allocates collision-safe step IDs', () => {
    const definition = fourFieldTwoStep()
    const withTaken = {
      ...definition,
      meta: {
        ...definition.meta,
        progressiveSteps: [
          ...definition.meta.progressiveSteps,
          // force allocateStepId to skip step_1 conceptually by adding step_1 id elsewhere
        ],
      },
    }
    // Existing IDs are step_alpha / step_beta — step_1 is free
    expect(allocateStepId(withTaken)).toBe('step_1')

    const withStep1: FormDefinition = {
      ...definition,
      meta: {
        ...definition.meta,
        progressiveSteps: [
          {
            stepId: 'step_1',
            labelEn: 'One',
            labelGu: 'એક',
            fieldIds: ['field_a', 'field_b'],
          },
          {
            stepId: 'step_2',
            labelEn: 'Two',
            labelGu: 'બે',
            fieldIds: ['field_c', 'field_d'],
          },
        ],
      },
    }
    expect(allocateStepId(withStep1)).toBe('step_3')
  })

  it('splits after first and middle fields; rejects last field', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const first = splitStepAfterField(state, 'step_alpha', 'field_a')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.definition.meta.progressiveSteps).toHaveLength(3)
    expect([...first.state.definition.meta.progressiveSteps[0]!.fieldIds]).toEqual(['field_a'])
    expect([...first.state.definition.meta.progressiveSteps[1]!.fieldIds]).toEqual(['field_b'])
    expect(concatStepFields(first.state.definition)).toEqual([
      'field_a',
      'field_b',
      'field_c',
      'field_d',
    ])

    const middle = splitStepAfterField(state, 'step_alpha', 'field_b')
    expect(middle.ok).toBe(false)
    if (middle.ok) return
    // field_b is last in step_alpha
    expect(middle.error.code).toBe('split_after_last_field')

    // Use a 4-field single step to split middle
    const enabled = enableProgressiveSteps(createAuthoringSession(singlePageFromIllustrative()))
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    const order = enabled.state.definition.uiSchema['ui:order'] as string[]
    const midField = order[2]!
    const split = splitStepAfterField(enabled.state, 'step_1', midField)
    expect(split.ok).toBe(true)
    if (!split.ok) return
    expect(split.state.definition.meta.progressiveSteps).toHaveLength(2)
    expect(concatStepFields(split.state.definition)).toEqual(order)

    const rejectLast = splitStepAfterField(enabled.state, 'step_1', order[order.length - 1]!)
    expect(rejectLast.ok).toBe(false)
    if (rejectLast.ok) return
    expect(rejectLast.error.code).toBe('split_after_last_field')
  })

  it('moves boundary earlier/later without emptying steps or changing ui:order', () => {
    const baseline = freezeBaseline(fourFieldTwoStep())
    const state = createAuthoringSession(baseline)
    const uiOrder = [...(baseline.uiSchema['ui:order'] as string[])]

    const earlier = moveStepBoundary(state, 'step_alpha', 'earlier')
    expect(earlier.ok).toBe(true)
    if (!earlier.ok) return
    expect([...earlier.state.definition.meta.progressiveSteps[0]!.fieldIds]).toEqual(['field_a'])
    expect([...earlier.state.definition.meta.progressiveSteps[1]!.fieldIds]).toEqual([
      'field_b',
      'field_c',
      'field_d',
    ])
    expect([...(earlier.state.definition.uiSchema['ui:order'] as string[])]).toEqual(uiOrder)
    expect(earlier.state.definition.meta.progressiveSteps[0]!.stepId).toBe('step_alpha')
    expect(earlier.state.definition.meta.progressiveSteps[0]!.labelEn).toBe('Alpha')

    const blocked = moveStepBoundary(earlier.state, 'step_alpha', 'earlier')
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.error.code).toBe('boundary_move_would_empty_step')

    const later = moveStepBoundary(earlier.state, 'step_alpha', 'later')
    expect(later.ok).toBe(true)
    if (!later.ok) return
    expect([...later.state.definition.meta.progressiveSteps[0]!.fieldIds]).toEqual([
      'field_a',
      'field_b',
    ])
    expect([...later.state.definition.meta.progressiveSteps[1]!.fieldIds]).toEqual([
      'field_c',
      'field_d',
    ])
    expect(baseline.meta.progressiveSteps[0]!.fieldIds).toEqual(['field_a', 'field_b'])
  })

  it('merges steps preserving surviving identity and preview/bindings', () => {
    const definition = fourFieldTwoStep()
    const state = createAuthoringSession(definition)
    const preview = { field_a: 'keep', field_c: 3 }
    const withPreview = { ...state, previewFormData: preview }

    const merged = mergeStepBoundary(withPreview, 'step_alpha')
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(merged.state.definition.meta.progressiveSteps).toHaveLength(1)
    expect(merged.state.definition.meta.progressiveSteps[0]!.stepId).toBe('step_alpha')
    expect(merged.state.definition.meta.progressiveSteps[0]!.labelEn).toBe('Alpha')
    expect([...merged.state.definition.meta.progressiveSteps[0]!.fieldIds]).toEqual([
      'field_a',
      'field_b',
      'field_c',
      'field_d',
    ])
    expect(merged.state.previewFormData).toEqual(preview)
    expect(merged.state.definition.audit).toEqual(definition.audit)
    expect(merged.state.definition.meta.prefillBindings).toEqual(definition.meta.prefillBindings)
    expect(merged.state.definition.meta.paletteProvenance).toEqual(
      definition.meta.paletteProvenance,
    )
  })

  it('blocks merge when removed step has unsaved bilingual changes', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const blocked = mergeStepBoundary(state, 'step_alpha', {
      removedStepHasUnsavedBilingual: true,
    })
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.error.code).toBe('step_has_unsaved_bilingual_changes')
  })

  it('detects step draft pending via stepHasUnsavedBilingualChanges', () => {
    expect(stepHasUnsavedBilingualChanges(undefined)).toBe(false)
    expect(
      stepHasUnsavedBilingualChanges({
        draft: { labelEn: 'A', labelGu: 'એ' },
        baseline: { labelEn: 'A', labelGu: 'એ' },
        showValidation: false,
        showStaleGuidance: false,
      }),
    ).toBe(false)
    expect(
      stepHasUnsavedBilingualChanges({
        draft: { labelEn: 'Changed', labelGu: 'એ' },
        baseline: { labelEn: 'A', labelGu: 'એ' },
        showValidation: false,
        showStaleGuidance: false,
      }),
    ).toBe(true)
    expect(
      stepHasUnsavedBilingualChanges({
        draft: { labelEn: 'A', labelGu: 'એ' },
        baseline: { labelEn: 'A', labelGu: 'એ' },
        showValidation: true,
        showStaleGuidance: false,
      }),
    ).toBe(true)
  })

  it('preserves schema/provenance/bindings and structure key ignores labels', () => {
    const state = createAuthoringSession(fourFieldTwoStep())
    const beforeKey = progressiveStructureKey(state.definition)
    const split = splitStepAfterField(state, 'step_alpha', 'field_a')
    expect(split.ok).toBe(true)
    if (!split.ok) return
    expect(split.state.definition.meta.paletteProvenance).toEqual(
      state.definition.meta.paletteProvenance,
    )
    expect(split.state.definition.jsonSchema).toEqual(state.definition.jsonSchema)
    expect(progressiveStructureKey(split.state.definition)).not.toBe(beforeKey)

    const labelOnly: FormDefinition = {
      ...state.definition,
      meta: {
        ...state.definition.meta,
        progressiveSteps: state.definition.meta.progressiveSteps.map((step) =>
          step.stepId === 'step_alpha' ? { ...step, labelEn: 'Renamed' } : step,
        ),
      },
    }
    expect(progressiveStructureKey(labelOnly)).toBe(beforeKey)
  })

  it('getStepBoundaryCapabilities reflects enable/split/merge/move rules', () => {
    const single = createAuthoringSession(singlePageFromIllustrative())
    const capsSingle = getStepBoundaryCapabilities(single)
    expect(capsSingle.canEnableProgressive).toBe(true)
    expect(capsSingle.progressiveEnabled).toBe(false)

    const two = createAuthoringSession(fourFieldTwoStep())
    const caps = getStepBoundaryCapabilities(two, { step_beta: true })
    expect(caps.boundaries).toHaveLength(1)
    expect(caps.boundaries[0]!.canMerge).toBe(false)
    expect(caps.boundaries[0]!.mergeBlockedReason).toBe('step_has_unsaved_bilingual_changes')
    expect(caps.boundaries[0]!.canMoveEarlier).toBe(true)
    expect(caps.boundaries[0]!.canMoveLater).toBe(true)
    const lastInAlpha = caps.splitAfterField.find(
      (entry) => entry.stepId === 'step_alpha' && entry.fieldId === 'field_b',
    )
    expect(lastInAlpha?.canSplitAfter).toBe(false)
  })

  it('reducer cleans removed step draft after merge and blocks dirty merge', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'step_beta',
      patch: { labelEn: 'Dirty beta' },
    })
    expect(stepHasUnsavedBilingualChanges(ui.stepEditorDrafts.step_beta)).toBe(true)

    const blocked = authoringReducer(ui, {
      type: 'mergeStepBoundary',
      previousStepId: 'step_alpha',
    })
    expect(blocked.stepsActionAlertCode).toBe('step_has_unsaved_bilingual_changes')
    expect(blocked.authoring.definition.meta.progressiveSteps).toHaveLength(2)

    ui = authoringReducer(ui, { type: 'cancelStepBilingual', stepId: 'step_beta' })
    const merged = authoringReducer(ui, {
      type: 'mergeStepBoundary',
      previousStepId: 'step_alpha',
    })
    expect(merged.authoring.definition.meta.progressiveSteps).toHaveLength(1)
    expect(merged.stepEditorDrafts.step_beta).toBeUndefined()
    expect(merged.pendingFocusStep).toEqual({
      requestId: expect.any(Number),
      stepId: 'step_alpha',
    })
  })

  it('keeps stepFocusRequestSequence monotonic across clears and boundary moves', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    expect(ui.stepFocusRequestSequence).toBe(0)

    ui = authoringReducer(ui, {
      type: 'splitStepAfterField',
      stepId: 'step_alpha',
      fieldId: 'field_a',
    })
    const afterSplit = ui.pendingFocusStep!
    expect(afterSplit.requestId).toBe(1)
    expect(ui.stepFocusRequestSequence).toBe(1)
    const insertedStepId = afterSplit.stepId

    // Move the boundary after the inserted step (next step still has two fields).
    ui = authoringReducer(ui, {
      type: 'moveStepBoundary',
      previousStepId: insertedStepId,
      direction: 'later',
    })
    const afterMove = ui.pendingFocusStep!
    expect(afterMove.stepId).toBe(insertedStepId)
    expect(afterMove.requestId).toBe(2)
    expect(ui.stepFocusRequestSequence).toBe(2)

    // Failed merge (dirty removed step) clears pending but must not reset sequence.
    const nextStepId = ui.authoring.definition.meta.progressiveSteps[1]!.stepId
    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: nextStepId,
      patch: { labelEn: 'Dirty' },
    })
    const beforeFail = ui.stepFocusRequestSequence
    ui = authoringReducer(ui, {
      type: 'mergeStepBoundary',
      previousStepId: 'step_alpha',
    })
    expect(ui.pendingFocusStep).toBeNull()
    expect(ui.stepFocusRequestSequence).toBe(beforeFail)
    expect(ui.stepsActionAlertCode).toBe('step_has_unsaved_bilingual_changes')

    ui = authoringReducer(ui, { type: 'cancelStepBilingual', stepId: nextStepId })
    ui = authoringReducer(ui, { type: 'mergeStepBoundary', previousStepId: 'step_alpha' })
    expect(ui.pendingFocusStep?.stepId).toBe('step_alpha')
    expect(ui.pendingFocusStep!.requestId).toBe(3)
    expect(ui.stepFocusRequestSequence).toBe(3)
    expect(ui.pendingFocusStep!.requestId).toBeGreaterThan(afterMove.requestId)
  })

  it('increments focus requestId when the same stepId is focused again', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    ui = authoringReducer(ui, { type: 'mergeStepBoundary', previousStepId: 'step_alpha' })
    const first = ui.pendingFocusStep
    expect(first?.stepId).toBe('step_alpha')
    ui = authoringReducer(ui, {
      type: 'splitStepAfterField',
      stepId: 'step_alpha',
      fieldId: 'field_a',
    })
    const newStepId = ui.pendingFocusStep?.stepId
    expect(newStepId).toBeTruthy()
    ui = authoringReducer(ui, {
      type: 'mergeStepBoundary',
      previousStepId: 'step_alpha',
    })
    expect(ui.pendingFocusStep?.stepId).toBe('step_alpha')
    expect(ui.pendingFocusStep?.requestId).toBeGreaterThan(first!.requestId)
    expect(ui.stepFocusRequestSequence).toBe(ui.pendingFocusStep!.requestId)
  })

  it('uses collision-free structure keys for IDs containing delimiters', () => {
    const base = fourFieldTwoStep()
    const structureA: FormDefinition = {
      ...base,
      meta: {
        ...base.meta,
        progressiveSteps: [
          {
            stepId: 'a:b',
            labelEn: 'One',
            labelGu: 'એક',
            fieldIds: ['field_a', 'field_b'],
          },
          {
            stepId: 'c|d',
            labelEn: 'Two',
            labelGu: 'બે',
            fieldIds: ['field_c', 'field_d'],
          },
        ],
      },
    }
    // Under the old `stepId:fields|…` encoding this collides with structureA:
    // "a:b:field_a,field_b|c|d:field_c,field_d"
    const collidingUnderOldEncoding: FormDefinition = {
      ...base,
      meta: {
        ...base.meta,
        progressiveSteps: [
          {
            stepId: 'a',
            labelEn: 'One',
            labelGu: 'એક',
            fieldIds: ['b:field_a', 'field_b'],
          },
          {
            stepId: 'c',
            labelEn: 'Two',
            labelGu: 'બે',
            fieldIds: ['d:field_c', 'field_d'],
          },
        ],
      },
    }
    const keyA = progressiveStructureKey(structureA)
    const keyB = progressiveStructureKey(collidingUnderOldEncoding)
    expect(keyA).not.toBe(keyB)
    expect(JSON.parse(keyA)).toEqual([
      ['a:b', ['field_a', 'field_b']],
      ['c|d', ['field_c', 'field_d']],
    ])
    expect(progressiveStructureKey(singlePageFromIllustrative())).toBe(
      JSON.stringify({ kind: 'single-page' }),
    )
    const labelOnly: FormDefinition = {
      ...structureA,
      meta: {
        ...structureA.meta,
        progressiveSteps: structureA.meta.progressiveSteps.map((step) => ({
          ...step,
          labelEn: 'Renamed',
        })),
      },
    }
    expect(progressiveStructureKey(labelOnly)).toBe(keyA)
  })

  it('label drafts survive boundary moves; completeness updates after split', () => {
    let ui = createAuthoringUiState(createAuthoringSession(fourFieldTwoStep()))
    const before = computeBilingualCompleteness(
      readAllFieldBilingualContent(ui.authoring.definition),
      readAllStepBilingualContent(ui.authoring.definition),
    )
    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'step_alpha',
      patch: { labelEn: 'Draft Alpha' },
    })
    ui = authoringReducer(ui, {
      type: 'moveStepBoundary',
      previousStepId: 'step_alpha',
      direction: 'later',
    })
    expect(ui.stepEditorDrafts.step_alpha?.draft.labelEn).toBe('Draft Alpha')
    expect(ui.stepEditorDrafts.step_alpha?.showStaleGuidance).toBe(false)

    ui = authoringReducer(ui, {
      type: 'splitStepAfterField',
      stepId: 'step_alpha',
      fieldId: 'field_a',
    })
    const after = computeBilingualCompleteness(
      readAllFieldBilingualContent(ui.authoring.definition),
      readAllStepBilingualContent(ui.authoring.definition),
    )
    expect(after.activePairs).toBeGreaterThan(before.activePairs)
  })

  it('StrictMode-safe rapid sequential reducer actions', () => {
    let ui = createAuthoringUiState(createAuthoringSession(singlePageFromIllustrative()))
    ui = authoringReducer(ui, { type: 'enableProgressiveSteps' })
    const stepId = ui.authoring.definition.meta.progressiveSteps[0]!.stepId
    const order = ui.authoring.definition.uiSchema['ui:order'] as string[]
    ui = authoringReducer(ui, {
      type: 'splitStepAfterField',
      stepId,
      fieldId: order[1]!,
    })
    ui = authoringReducer(ui, {
      type: 'moveStepBoundary',
      previousStepId: stepId,
      direction: 'later',
    })
    ui = authoringReducer(ui, { type: 'mergeStepBoundary', previousStepId: stepId })
    expect(ui.authoring.definition.meta.progressiveSteps).toHaveLength(1)
    assertDefinitionIntegrity(ui.authoring.definition)
    expect(concatStepFields(ui.authoring.definition)).toEqual(order)
  })

  it('add/remove/reorder preserve contiguous step coverage', async () => {
    const { addField, removeField, moveField } = await import('../src/authoring/index.js')
    let state = createAuthoringSession(fourFieldTwoStep())
    const added = addField(state, 'text-short')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    state = added.state
    assertDefinitionIntegrity(state.definition)
    expect(concatStepFields(state.definition)).toEqual([
      ...(state.definition.uiSchema['ui:order'] as string[]),
    ])

    const newId = state.selectedFieldId!
    const moved = moveField(state, newId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    state = moved.state
    expect(concatStepFields(state.definition)).toEqual([
      ...(state.definition.uiSchema['ui:order'] as string[]),
    ])

    const removed = removeField(state, newId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(concatStepFields(removed.state.definition)).toEqual([
      ...(removed.state.definition.uiSchema['ui:order'] as string[]),
    ])
  })
})
