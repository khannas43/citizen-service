import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'
import { PALETTE_WIDGET_COUNT } from '@dg20/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  collectVisibleCafBindingDrafts,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedCafPrefillSchema,
  isAddableWidgetType,
  isAnyBindingDraftDirty,
  isConfiguredAddableWidgetType,
  isFieldBindingDraftDirty,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  readCafPrefillBinding,
  removeCafPrefillBinding,
  removeField,
  updateCafPrefillBinding,
  validateCafPrefillBindingDraft,
} from '../src/authoring/index.js'
import {
  createEmptyPendingConfiguredAdd,
  validatePendingConfiguredAdd,
} from '../src/authoring/configured-add.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function readSchema(definition: FormDefinition, fieldId: string): Record<string, unknown> {
  const properties = definition.jsonSchema['properties'] as Record<string, Record<string, unknown>>
  return properties[fieldId]!
}

function addCaf(cafAttribute = 'citizen.fullName', confidenceMin = 0.8) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'caf-prefill', {
    configured: {
      widgetType: 'caf-prefill',
      cafAttribute,
      confidenceMin,
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add caf-prefill')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D15 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('caf-prefill')).toBe(true)
    expect(isConfiguredAddableWidgetType('caf-prefill')).toBe(true)
    expect(isAddableWidgetType('family-repeater')).toBe(true)
    expect(isAddableWidgetType('page-break')).toBe(true)
    expect(getAuthoringTemplate('page-break')).toBeUndefined()
  })
})

describe('FB-D15 — exact template and configured-add', () => {
  it('caf-prefill template is configured ui:field with canonical object value/source (no x-dg20)', () => {
    const template = getAuthoringTemplate('caf-prefill')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'caf-prefill' })
    if (template.addMode !== 'configured') return
    expect(
      template.buildSchema({
        widgetType: 'caf-prefill',
        cafAttribute: 'citizen.fullName',
        confidenceMin: 0.8,
      }),
    ).toEqual({
      type: 'object',
      properties: {
        value: { type: 'string', minLength: 1 },
        source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
    })
    expect(addField(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION), 'caf-prefill').ok).toBe(
      false,
    )
  })

  it('Confirm creates field + exactly one PrefillBinding; attribute not in schema/uiSchema', () => {
    const { state, fieldId } = addCaf('citizen.fullName', 0.75)
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedCafPrefillSchema(schema)).toBe(true)
    expect(schema).not.toHaveProperty('x-dg20')
    expect(JSON.stringify(schema)).not.toMatch(/cafAttribute|confidenceMin|citizen\.fullName/)
    const uiEntry = (state.definition.uiSchema as Record<string, unknown>)[fieldId]
    expect(uiEntry).toEqual({ 'ui:field': 'caf-prefill' })
    expect(JSON.stringify(uiEntry)).not.toMatch(/cafAttribute|confidenceMin/)

    expect(state.definition.meta.prefillBindings).toEqual([
      { fieldId, cafAttribute: 'citizen.fullName', confidenceMin: 0.75 },
    ])
    expect(readCafPrefillBinding(state.definition, fieldId)).toEqual({
      fieldId,
      cafAttribute: 'citizen.fullName',
      confidenceMin: 0.75,
    })
  })

  it('invalid cafAttribute and confidence fail Confirm via validatePendingConfiguredAdd / validateCafPrefillBindingDraft', () => {
    const blank = createEmptyPendingConfiguredAdd('caf-prefill')
    expect(validatePendingConfiguredAdd(blank)).toEqual({
      ok: false,
      firstInvalidControl: 'cafAttribute',
    })
    expect(validatePendingConfiguredAdd({ ...blank, cafAttribute: ' padded ' })).toEqual({
      ok: false,
      firstInvalidControl: 'cafAttribute',
    })

    const withAttr = { ...blank, cafAttribute: 'citizen.fullName' }
    for (const confidenceMin of ['0x10', '1_000', 'NaN', 'Infinity', ' 0.5 ', '-0.1', '1.01', '']) {
      expect(
        validatePendingConfiguredAdd({ ...withAttr, confidenceMin }),
        `pending confidence ${JSON.stringify(confidenceMin)}`,
      ).toEqual({ ok: false, firstInvalidControl: 'confidenceMin' })
    }

    expect(
      validateCafPrefillBindingDraft('caf_1', { cafAttribute: '', confidenceMin: '0.5' }),
    ).toEqual({
      ok: false,
      issues: [{ code: 'caf_attribute_invalid', control: 'cafAttribute' }],
    })
    expect(
      validateCafPrefillBindingDraft('caf_1', { cafAttribute: ' padded ', confidenceMin: '0.5' }),
    ).toEqual({
      ok: false,
      issues: [{ code: 'caf_attribute_invalid', control: 'cafAttribute' }],
    })
    for (const confidenceMin of ['0x10', '1_000', 'NaN', 'Infinity', ' 0.5 ', '-0.1', '1.01', '']) {
      const result = validateCafPrefillBindingDraft('caf_1', {
        cafAttribute: 'citizen.fullName',
        confidenceMin,
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.issues.some((i) => i.control === 'confidenceMin')).toBe(true)
    }
  })

  it('strict decimal 0 and 1 boundaries are accepted', () => {
    expect(
      validatePendingConfiguredAdd({
        ...createEmptyPendingConfiguredAdd('caf-prefill'),
        cafAttribute: 'citizen.fullName',
        confidenceMin: '0',
      }),
    ).toEqual({
      ok: true,
      configured: {
        widgetType: 'caf-prefill',
        cafAttribute: 'citizen.fullName',
        confidenceMin: 0,
      },
    })
    expect(
      validatePendingConfiguredAdd({
        ...createEmptyPendingConfiguredAdd('caf-prefill'),
        cafAttribute: 'citizen.fullName',
        confidenceMin: '1',
      }),
    ).toEqual({
      ok: true,
      configured: {
        widgetType: 'caf-prefill',
        cafAttribute: 'citizen.fullName',
        confidenceMin: 1,
      },
    })
    expect(
      validateCafPrefillBindingDraft('caf_1', {
        cafAttribute: 'citizen.fullName',
        confidenceMin: '0',
      }),
    ).toEqual({
      ok: true,
      binding: { fieldId: 'caf_1', cafAttribute: 'citizen.fullName', confidenceMin: 0 },
    })
    expect(
      validateCafPrefillBindingDraft('caf_1', {
        cafAttribute: 'citizen.fullName',
        confidenceMin: '1',
      }),
    ).toEqual({
      ok: true,
      binding: { fieldId: 'caf_1', cafAttribute: 'citizen.fullName', confidenceMin: 1 },
    })

    const zero = addCaf('citizen.fullName', 0)
    expect(readCafPrefillBinding(zero.state.definition, zero.fieldId)?.confidenceMin).toBe(0)
    const one = addCaf('citizen.fullName', 1)
    expect(readCafPrefillBinding(one.state.definition, one.fieldId)?.confidenceMin).toBe(1)
  })

  it('pending configured-add validates focus order cafAttribute then confidenceMin', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'caf-prefill' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'caf-prefill',
      cafAttribute: '',
      confidenceMin: '',
      showValidation: false,
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('cafAttribute')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { cafAttribute: 'citizen.fullName' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('confidenceMin')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { confidenceMin: '0.8' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ui.authoring.selectedFieldId).toBe('caf_prefill_1')
    expect(ui.authoring.definition.meta.prefillBindings).toHaveLength(1)
  })
})

describe('FB-D15 — hostile schema admission', () => {
  it('rejects extra props, wrong required order, x-dg20, getters/symbols', () => {
    expect(
      isAdmittedCafPrefillSchema({
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
          extra: { type: 'string' },
        },
        required: ['value', 'source'],
        additionalProperties: false,
      }),
    ).toBe(false)

    expect(
      isAdmittedCafPrefillSchema({
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
        },
        required: ['source', 'value'],
        additionalProperties: false,
      }),
    ).toBe(false)

    expect(
      isAdmittedCafPrefillSchema({
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
        },
        required: ['value', 'source'],
        additionalProperties: false,
        'x-dg20': { cafAttribute: 'x' },
      }),
    ).toBe(false)

    expect(
      isAdmittedCafPrefillSchema({
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['OVERRIDE', 'CAF'] },
        },
        required: ['value', 'source'],
        additionalProperties: false,
      }),
    ).toBe(false)

    const withGetter = {
      type: 'object',
      properties: {
        value: { type: 'string', minLength: 1 },
        source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
    }
    Object.defineProperty(withGetter, 'toJSON', {
      get() {
        throw new Error('should not invoke')
      },
    })
    expect(isAdmittedCafPrefillSchema(withGetter)).toBe(false)

    const withSymbol = {
      type: 'object',
      properties: {
        value: { type: 'string', minLength: 1 },
        source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
      },
      required: ['value', 'source'],
      additionalProperties: false,
      [Symbol('hostile')]: true,
    }
    expect(isAdmittedCafPrefillSchema(withSymbol)).toBe(false)

    expect(
      isAdmittedCafPrefillSchema({
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
        },
        required: ['value', 'source'],
        additionalProperties: false,
      }),
    ).toBe(true)
  })
})

describe('FB-D15 — binding authoring and reducer', () => {
  it('read/apply/cancel/remove via reducer + authoring functions', () => {
    const { state, fieldId } = addCaf('citizen.fullName', 0.8)
    expect(readCafPrefillBinding(state.definition, fieldId)).toEqual({
      fieldId,
      cafAttribute: 'citizen.fullName',
      confidenceMin: 0.8,
    })

    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { cafAttribute: 'citizen.motherName', confidenceMin: '0.9' },
    })
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(true)
    expect(isAnyBindingDraftDirty(ui.bindingDrafts)).toBe(true)

    ui = authoringReducer(ui, { type: 'applyBindingDraft', fieldId })
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(false)
    expect(readCafPrefillBinding(ui.authoring.definition, fieldId)).toEqual({
      fieldId,
      cafAttribute: 'citizen.motherName',
      confidenceMin: 0.9,
    })

    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { confidenceMin: '0.5' },
    })
    ui = authoringReducer(ui, { type: 'cancelBindingDraft', fieldId })
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(false)
    expect(readCafPrefillBinding(ui.authoring.definition, fieldId)?.confidenceMin).toBe(0.9)

    ui = authoringReducer(ui, { type: 'removeBinding', fieldId })
    expect(readCafPrefillBinding(ui.authoring.definition, fieldId)).toBeNull()
    expect(ui.authoring.definition.meta.prefillBindings).toEqual([])
  })

  it('unbound CAF field can create binding via updateCafPrefillBinding', () => {
    const { state, fieldId } = addCaf()
    const removed = removeCafPrefillBinding(state, fieldId, {
      binding: readCafPrefillBinding(state.definition, fieldId),
    })
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(readCafPrefillBinding(removed.state.definition, fieldId)).toBeNull()

    const created = updateCafPrefillBinding(
      removed.state,
      fieldId,
      { cafAttribute: 'citizen.fatherName', confidenceMin: '0.55' },
      { binding: null },
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(readCafPrefillBinding(created.state.definition, fieldId)).toEqual({
      fieldId,
      cafAttribute: 'citizen.fatherName',
      confidenceMin: 0.55,
    })
  })

  it('wrong-widget and duplicate binding prevention', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const text = addField(session, 'text-short')
    expect(text.ok).toBe(true)
    if (!text.ok) return
    const textId = text.state.selectedFieldId!
    const wrong = updateCafPrefillBinding(
      text.state,
      textId,
      { cafAttribute: 'citizen.fullName', confidenceMin: '0.5' },
      { binding: null },
    )
    expect(wrong.ok).toBe(false)
    if (wrong.ok) return
    expect(wrong.error.code).toBe('configuration_invalid')

    const { state, fieldId } = addCaf('citizen.fullName', 0.8)
    const dupDef: FormDefinition = {
      ...state.definition,
      meta: {
        ...state.definition.meta,
        prefillBindings: [
          { fieldId, cafAttribute: 'a', confidenceMin: 0.1 },
          { fieldId, cafAttribute: 'b', confidenceMin: 0.2 },
        ],
      },
    }
    expect(() => readCafPrefillBinding(dupDef, fieldId)).toThrow()
  })

  it('stable binding order follows canvas order after moveField', () => {
    const first = addCaf('attr.one', 0.1)
    const second = addField(first.state, 'caf-prefill', {
      configured: {
        widgetType: 'caf-prefill',
        cafAttribute: 'attr.two',
        confidenceMin: 0.2,
      },
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const id1 = first.fieldId
    const id2 = second.state.selectedFieldId!
    expect(second.state.definition.meta.prefillBindings.map((b) => b.fieldId)).toEqual([id1, id2])

    const moved = moveField(second.state, id1, 'down')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    assertDefinitionIntegrity(moved.state.definition)

    const resorted = updateCafPrefillBinding(
      moved.state,
      id2,
      { cafAttribute: 'attr.two', confidenceMin: '0.25' },
      { binding: readCafPrefillBinding(moved.state.definition, id2) },
    )
    expect(resorted.ok).toBe(true)
    if (!resorted.ok) return
    expect(resorted.state.definition.meta.prefillBindings.map((b) => b.fieldId)).toEqual([id2, id1])

    const rows = collectVisibleCafBindingDrafts(resorted.state.definition, {})
    expect(rows.map((r) => r.fieldId)).toEqual([id2, id1])
  })

  it('stale baseline yields stale_editor_draft', () => {
    const { state, fieldId } = addCaf('citizen.fullName', 0.8)
    const live = readCafPrefillBinding(state.definition, fieldId)!
    const stale = updateCafPrefillBinding(
      state,
      fieldId,
      { cafAttribute: 'citizen.other', confidenceMin: '0.5' },
      { binding: { ...live, confidenceMin: 0.1 } },
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')

    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { confidenceMin: '0.4' },
    })
    // External commit diverges from draft baseline.
    const diverged = updateCafPrefillBinding(
      ui.authoring,
      fieldId,
      { cafAttribute: 'citizen.fullName', confidenceMin: '0.99' },
      { binding: live },
    )
    expect(diverged.ok).toBe(true)
    if (!diverged.ok) return
    ui = { ...ui, authoring: diverged.state }
    ui = authoringReducer(ui, { type: 'applyBindingDraft', fieldId })
    expect(ui.bindingDrafts[fieldId]?.showStaleGuidance).toBe(true)
  })

  it('Property/Bilingual/Binding draft isolation', () => {
    const { state, fieldId } = addCaf()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })

    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { confidenceMin: '0.33' },
    })
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(true)
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(false)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { labelEn: 'CAF renamed' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(true)

    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Only EN' },
    })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(true)

    const bindingBefore = readCafPrefillBinding(ui.authoring.definition, fieldId)
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(false)
    expect(isFieldBindingDraftDirty(ui, fieldId)).toBe(true)
    expect(readCafPrefillBinding(ui.authoring.definition, fieldId)).toEqual(bindingBefore)
    expect(ui.bindingDrafts[fieldId]?.draft.confidenceMin).toBe('0.33')
  })

  it('unsaved binding draft → hasAnyUnsavedAuthoringDraft true', () => {
    const { state, fieldId } = addCaf()
    let ui = createAuthoringUiState(state)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { cafAttribute: 'citizen.dirty' },
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    expect(isAnyBindingDraftDirty(ui.bindingDrafts)).toBe(true)
  })

  it('field removal cleans binding + draft', () => {
    const { state, fieldId } = addCaf()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { confidenceMin: '0.2' },
    })
    expect(ui.bindingDrafts[fieldId]).toBeDefined()
    ui = authoringReducer(ui, { type: 'remove', fieldId })
    expect(ui.authoring.definition.meta.prefillBindings.some((b) => b.fieldId === fieldId)).toBe(
      false,
    )
    expect(ui.bindingDrafts[fieldId]).toBeUndefined()
  })

  it('session replace clears obsolete binding drafts', () => {
    const { state, fieldId } = addCaf()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { confidenceMin: '0.2' },
    })
    expect(Object.keys(ui.bindingDrafts).length).toBeGreaterThan(0)
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.bindingDrafts).toEqual({})
    expect(ui.pendingConfiguredAdd).toBeNull()
  })

  it('patchBindingDraft does not mutate input definition', () => {
    const { state, fieldId } = addCaf()
    const before = JSON.stringify(state.definition)
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, {
      type: 'patchBindingDraft',
      fieldId,
      patch: { cafAttribute: 'typing.now', confidenceMin: '0.1' },
    })
    expect(JSON.stringify(ui.authoring.definition)).toBe(before)
    expect(JSON.stringify(state.definition)).toBe(before)
  })

  it('preview definition carries prefillBindings (no fake adapter)', () => {
    const { state, fieldId } = addCaf('citizen.fullName', 0.8)
    expect(state.definition.meta.prefillBindings).toEqual([
      { fieldId, cafAttribute: 'citizen.fullName', confidenceMin: 0.8 },
    ])
    // Unit surface only asserts the definition payload the preview will receive.
    expect(state.previewFormData[fieldId]).toBeUndefined()
  })

  it('remove/reorder preserves integrity', () => {
    const { state, fieldId } = addCaf()
    const withSig = addField(state, 'signature-esign')
    expect(withSig.ok).toBe(true)
    if (!withSig.ok) return
    const moved = moveField(withSig.state, fieldId, 'down')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    assertDefinitionIntegrity(moved.state.definition)
    const removed = removeField(moved.state, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    assertDefinitionIntegrity(removed.state.definition)
    expect(removed.state.definition.meta.prefillBindings).toEqual([])
  })
})
