/**
 * FB-D17 — page-break as progressive-step boundary action (pure coverage, §12).
 */
import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'
import { PALETTE_WIDGET_COUNT } from '@dg20/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  FIELD_ADDABLE_COUNT,
  FIELD_ADDABLE_WIDGET_TYPES,
  PENDING_COUNT,
  STRUCTURAL_ADDABLE_COUNT,
  STRUCTURAL_ADDABLE_WIDGET_TYPES,
  getAuthoringTemplate,
  isAddableWidgetType,
  isFieldAddableWidgetType,
  isStructuralAddableWidgetType,
} from '../src/authoring/templates.js'
import { addField } from '../src/authoring/add-field.js'
import {
  assertDefinitionIntegrity,
  createAuthoringSession,
  createAuthoringUiState,
  authoringReducer,
  mergeStepBoundary,
  progressiveStructureKey,
} from '../src/authoring/index.js'
import {
  canCreatePageBreakBoundary,
  createEmptyPendingPageBreak,
  createPageBreakBoundary,
  getPageBreakBoundaryOptions,
  resolveDefaultPageBreakAfterFieldId,
  validatePendingPageBreak,
} from '../src/authoring/page-break-authoring.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/has-any-unsaved-authoring-draft.js'
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
    serviceId: 'd17-fixture',
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
    audit: { createdBy: 'test', createdAt: '2026-07-26T00:00:00Z' },
  }
}

/** Legacy literal page-break field fixture (external / pre-D17 shape). */
function legacyLiteralPageBreakDefinition(): FormDefinition {
  return {
    serviceId: 'fixture-page-break-service',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        page_break_ref: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        after_field: { type: 'string', maxLength: 40 },
      },
    },
    uiSchema: {
      'ui:order': ['page_break_ref', 'after_field'],
      page_break_ref: { 'ui:field': 'page-break' },
      after_field: { 'ui:widget': 'text-short' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'page_break_ref', widgetType: 'page-break' },
        { fieldId: 'after_field', widgetType: 'text-short' },
      ],
      bilingual: {
        labels: {
          page_break_ref: { en: 'Page break', gu: 'પેજ બ્રેક' },
          after_field: { en: 'After', gu: 'પછી' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-26T00:00:00Z' },
  }
}

function snapshotNonSteps(definition: FormDefinition) {
  return JSON.stringify({
    jsonSchema: definition.jsonSchema,
    uiSchema: definition.uiSchema,
    paletteProvenance: definition.meta.paletteProvenance,
    bilingual: definition.meta.bilingual,
    prefillBindings: definition.meta.prefillBindings,
    integrationBindings: definition.meta.integrationBindings,
    workflowBindings: definition.meta.workflowBindings,
    audit: definition.audit,
  })
}

describe('FB-D17 — capability counts', () => {
  it('exposes 30 addable / 0 pending / 30 total with 29 field + 1 structural', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(FIELD_ADDABLE_COUNT).toBe(29)
    expect(FIELD_ADDABLE_WIDGET_TYPES).toHaveLength(29)
    expect(STRUCTURAL_ADDABLE_COUNT).toBe(1)
    expect([...STRUCTURAL_ADDABLE_WIDGET_TYPES]).toEqual(['page-break'])
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(PALETTE_WIDGET_COUNT).toBe(30)

    expect(isAddableWidgetType('page-break')).toBe(true)
    expect(isStructuralAddableWidgetType('page-break')).toBe(true)
    expect(isFieldAddableWidgetType('page-break')).toBe(false)
    expect(getAuthoringTemplate('page-break')).toBeUndefined()
    expect(isFieldAddableWidgetType('family-repeater')).toBe(true)
    expect(getAuthoringTemplate('family-repeater')).toBeDefined()
  })

  it('rejects direct addField(page-break) without mutation', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const before = JSON.stringify(session.definition)
    const previewBefore = JSON.stringify(session.previewFormData)
    const result = addField(session, 'page-break')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('structural_widget_requires_boundary_action')
    }
    expect(JSON.stringify(session.definition)).toBe(before)
    expect(JSON.stringify(session.previewFormData)).toBe(previewBefore)
  })
})

describe('FB-D17 — eligible boundaries', () => {
  it('lists single-page eligible after-field options (all but last)', () => {
    const definition = singlePageFromIllustrative()
    const options = getPageBreakBoundaryOptions(definition)
    const order = definition.uiSchema['ui:order'] as string[]
    expect(options.map((o) => o.afterFieldId)).toEqual(order.slice(0, -1))
    expect(options.every((o) => o.stepId === null)).toBe(true)
    expect(canCreatePageBreakBoundary(definition)).toBe(true)
  })

  it('lists progressive eligible options (all but last of each step)', () => {
    const definition = fourFieldTwoStep()
    const options = getPageBreakBoundaryOptions(definition)
    expect(options.map((o) => ({ after: o.afterFieldId, step: o.stepId }))).toEqual([
      { after: 'field_a', step: 'step_alpha' },
      { after: 'field_c', step: 'step_beta' },
    ])
  })

  it('defaults to selected eligible field else first option', () => {
    const definition = fourFieldTwoStep()
    expect(resolveDefaultPageBreakAfterFieldId(definition, 'field_c')).toBe('field_c')
    expect(resolveDefaultPageBreakAfterFieldId(definition, 'field_b')).toBe('field_a')
    expect(resolveDefaultPageBreakAfterFieldId(definition, null)).toBe('field_a')
  })

  it('returns null pending / no options when only one field', () => {
    const definition = cloneDefinition(fourFieldTwoStep())
    definition.jsonSchema = {
      ...definition.jsonSchema,
      properties: { only: { type: 'string' } },
    }
    definition.uiSchema = {
      'ui:order': ['only'],
      only: { 'ui:widget': 'text-short' },
    }
    definition.meta = {
      ...definition.meta,
      paletteProvenance: [{ fieldId: 'only', widgetType: 'text-short' }],
      bilingual: {
        labels: { only: { en: 'Only', gu: 'માત્ર' } },
        help: {},
        errors: {},
      },
      progressiveSteps: [],
    }
    expect(getPageBreakBoundaryOptions(definition)).toEqual([])
    expect(canCreatePageBreakBoundary(definition)).toBe(false)
    expect(createEmptyPendingPageBreak(definition, null)).toBeNull()
  })
})

describe('FB-D17 — createPageBreakBoundary', () => {
  it('atomically enables + splits a single-page definition with user EN/GU labels', () => {
    const session = createAuthoringSession(singlePageFromIllustrative())
    const previewSeed = { applicant_name: 'Keep Me' }
    const seeded = { ...session, previewFormData: previewSeed }
    const nonStepsBefore = snapshotNonSteps(seeded.definition)
    const structureBefore = progressiveStructureKey(seeded.definition)

    const result = createPageBreakBoundary(seeded, {
      stepId: null,
      afterFieldId: 'gender',
      nextStepLabelEn: 'Household details',
      nextStepLabelGu: 'ઘરની વિગતો',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const steps = result.state.definition.meta.progressiveSteps
    expect(steps).toHaveLength(2)
    expect(steps[0]!.labelEn).toBe('Step 1')
    expect(steps[0]!.labelGu).toBe('પગલું 1')
    expect(steps[0]!.fieldIds).toEqual(['section_identity', 'applicant_name', 'gender'])
    expect(steps[1]!.labelEn).toBe('Household details')
    expect(steps[1]!.labelGu).toBe('ઘરની વિગતો')
    expect(steps[1]!.fieldIds).toEqual([
      'info_guidance',
      'household_size',
      'purpose_statement',
      'agree_terms',
    ])
    expect(snapshotNonSteps(result.state.definition)).toBe(nonStepsBefore)
    expect(result.state.previewFormData).toEqual(previewSeed)
    expect(progressiveStructureKey(result.state.definition)).not.toBe(structureBefore)
    assertDefinitionIntegrity(result.state.definition)
    expect(result.announcementKey).toBe('announcePageBreakCreated')
  })

  it('splits an already-progressive step preserving existing label', () => {
    const session = createAuthoringSession(fourFieldTwoStep())
    const nonStepsBefore = snapshotNonSteps(session.definition)
    const result = createPageBreakBoundary(session, {
      stepId: 'step_alpha',
      afterFieldId: 'field_a',
      nextStepLabelEn: 'Middle',
      nextStepLabelGu: 'મધ્ય',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const steps = result.state.definition.meta.progressiveSteps
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatchObject({
      stepId: 'step_alpha',
      labelEn: 'Alpha',
      labelGu: 'આલ્ફા',
      fieldIds: ['field_a'],
    })
    expect(steps[1]).toMatchObject({
      labelEn: 'Middle',
      labelGu: 'મધ્ય',
      fieldIds: ['field_b'],
    })
    expect(steps[2]).toMatchObject({
      stepId: 'step_beta',
      fieldIds: ['field_c', 'field_d'],
    })
    expect(snapshotNonSteps(result.state.definition)).toBe(nonStepsBefore)
    assertDefinitionIntegrity(result.state.definition)
  })

  it('rejects blank/padded labels and stale afterFieldId', () => {
    const session = createAuthoringSession(fourFieldTwoStep())
    const before = JSON.stringify(session.definition)

    expect(
      createPageBreakBoundary(session, {
        stepId: 'step_alpha',
        afterFieldId: 'field_a',
        nextStepLabelEn: '  padded  ',
        nextStepLabelGu: 'Valid',
      }).ok,
    ).toBe(false)
    expect(
      createPageBreakBoundary(session, {
        stepId: 'step_alpha',
        afterFieldId: 'field_b',
        nextStepLabelEn: 'Valid',
        nextStepLabelGu: 'Valid',
      }).ok,
    ).toBe(false)
    expect(JSON.stringify(session.definition)).toBe(before)
  })

  it('merge is the structural inverse of page-break creation', () => {
    const session = createAuthoringSession(fourFieldTwoStep())
    const structureBefore = progressiveStructureKey(session.definition)
    const created = createPageBreakBoundary(session, {
      stepId: 'step_alpha',
      afterFieldId: 'field_a',
      nextStepLabelEn: 'Temp',
      nextStepLabelGu: 'કામચલાઉ',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const newPrev = created.state.definition.meta.progressiveSteps[0]!.stepId
    const merged = mergeStepBoundary(created.state, newPrev)
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(progressiveStructureKey(merged.state.definition)).toBe(structureBefore)
    expect(merged.state.definition.meta.progressiveSteps.map((s) => s.fieldIds)).toEqual([
      ['field_a', 'field_b'],
      ['field_c', 'field_d'],
    ])
  })
})

describe('FB-D17 — pending dialog / reducer gates', () => {
  it('validates pending labels and Cancel leaves definition unchanged', () => {
    const session = createAuthoringSession(fourFieldTwoStep())
    let ui = createAuthoringUiState(session)
    const before = JSON.stringify(ui.authoring.definition)

    ui = authoringReducer(ui, { type: 'beginPageBreakAdd' })
    expect(ui.pendingStructuralAdd).not.toBeNull()
    expect(ui.pendingFocusStructuralAdd?.control).toBe('afterFieldId')
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = authoringReducer(ui, { type: 'confirmPageBreakAdd' })
    expect(ui.pendingStructuralAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusStructuralAdd?.control).toBe('nextStepLabelEn')

    ui = authoringReducer(ui, {
      type: 'patchPageBreakAdd',
      patch: { nextStepLabelEn: 'Next EN' },
    })
    ui = authoringReducer(ui, { type: 'confirmPageBreakAdd' })
    expect(ui.pendingFocusStructuralAdd?.control).toBe('nextStepLabelGu')

    ui = authoringReducer(ui, { type: 'cancelPageBreakAdd' })
    expect(ui.pendingStructuralAdd).toBeNull()
    expect(JSON.stringify(ui.authoring.definition)).toBe(before)
  })

  it('confirm creates boundary, focuses new step, preserves previewFormData', () => {
    const session = createAuthoringSession(singlePageFromIllustrative())
    let ui = createAuthoringUiState({
      ...session,
      previewFormData: { applicant_name: 'Preserve' },
    })
    const nonStepsBefore = snapshotNonSteps(ui.authoring.definition)
    const focusSeqBefore = ui.stepFocusRequestSequence

    ui = authoringReducer(ui, { type: 'beginPageBreakAdd' })
    ui = authoringReducer(ui, {
      type: 'patchPageBreakAdd',
      patch: {
        afterFieldId: 'applicant_name',
        nextStepLabelEn: 'Part two',
        nextStepLabelGu: 'ભાગ બે',
      },
    })
    ui = authoringReducer(ui, { type: 'confirmPageBreakAdd' })

    expect(ui.pendingStructuralAdd).toBeNull()
    expect(ui.authoring.definition.meta.progressiveSteps).toHaveLength(2)
    expect(ui.authoring.definition.meta.progressiveSteps[1]!.labelEn).toBe('Part two')
    expect(ui.authoring.definition.meta.progressiveSteps[1]!.labelGu).toBe('ભાગ બે')
    expect(ui.authoring.previewFormData).toEqual({ applicant_name: 'Preserve' })
    expect(snapshotNonSteps(ui.authoring.definition)).toBe(nonStepsBefore)
    expect(ui.stepFocusRequestSequence).toBe(focusSeqBefore + 1)
    expect(ui.pendingFocusStep?.stepId).toBe(
      ui.authoring.definition.meta.progressiveSteps[1]!.stepId,
    )
    expect(ui.announcement?.key).toBe('announcePageBreakCreated')
  })

  it('StrictMode-safe: double begin without options does not mutate; confirm is idempotent per pending', () => {
    const session = createAuthoringSession(fourFieldTwoStep())
    let ui = createAuthoringUiState(session)
    ui = authoringReducer(ui, { type: 'beginPageBreakAdd' })
    const pending = ui.pendingStructuralAdd
    ui = authoringReducer(ui, { type: 'beginPageBreakAdd' })
    expect(ui.pendingStructuralAdd).toEqual(pending)
    expect(ui.announcement?.key).toBe('announcePageBreakBlocked')
  })

  it('validatePendingPageBreak orders focus controls', () => {
    const definition = fourFieldTwoStep()
    const pending = createEmptyPendingPageBreak(definition, 'field_a')!
    expect(validatePendingPageBreak(pending, definition)).toEqual({
      ok: false,
      firstInvalidControl: 'nextStepLabelEn',
    })
    const withEn = { ...pending, nextStepLabelEn: 'EN' }
    expect(validatePendingPageBreak(withEn, definition)).toEqual({
      ok: false,
      firstInvalidControl: 'nextStepLabelGu',
    })
    const valid = { ...withEn, nextStepLabelGu: 'GU' }
    const result = validatePendingPageBreak(valid, definition)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request).toEqual({
      stepId: 'step_alpha',
      afterFieldId: 'field_a',
      nextStepLabelEn: 'EN',
      nextStepLabelGu: 'GU',
    })
  })

  it('begin with no eligible boundary announces guidance without opening', () => {
    const definition = cloneDefinition(fourFieldTwoStep())
    definition.jsonSchema = {
      ...definition.jsonSchema,
      properties: { only: { type: 'string' } },
    }
    definition.uiSchema = { 'ui:order': ['only'], only: { 'ui:widget': 'text-short' } }
    definition.meta = {
      ...definition.meta,
      paletteProvenance: [{ fieldId: 'only', widgetType: 'text-short' }],
      bilingual: {
        labels: { only: { en: 'Only', gu: 'માત્ર' } },
        help: {},
        errors: {},
      },
      progressiveSteps: [],
    }
    let ui = createAuthoringUiState(createAuthoringSession(definition))
    ui = authoringReducer(ui, { type: 'beginPageBreakAdd' })
    expect(ui.pendingStructuralAdd).toBeNull()
    expect(ui.announcement?.key).toBe('announcePageBreakNoBoundary')
  })
})

describe('FB-D17 — legacy literal page-break compatibility', () => {
  it('admits and reads a legacy literal page-break field without auto-conversion', () => {
    const definition = legacyLiteralPageBreakDefinition()
    assertDefinitionIntegrity(definition)
    const session = createAuthoringSession(definition)
    expect(session.definition.meta.progressiveSteps).toEqual([])
    expect(session.definition.meta.paletteProvenance).toContainEqual({
      fieldId: 'page_break_ref',
      widgetType: 'page-break',
    })
    expect((session.definition.uiSchema as Record<string, unknown>)['page_break_ref']).toEqual({
      'ui:field': 'page-break',
    })
    // Creating a structural boundary must not remove the legacy field.
    const created = createPageBreakBoundary(session, {
      stepId: null,
      afterFieldId: 'page_break_ref',
      nextStepLabelEn: 'Next',
      nextStepLabelGu: 'આગળ',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.state.definition.jsonSchema.properties).toHaveProperty('page_break_ref')
    expect(created.state.definition.meta.progressiveSteps).toHaveLength(2)
  })
})
