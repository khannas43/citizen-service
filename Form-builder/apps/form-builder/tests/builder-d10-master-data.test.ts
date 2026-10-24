import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'
import { PALETTE_WIDGET_COUNT } from '@dg20/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  AuthoringError,
  PENDING_COUNT,
  addField,
  admitCascadingXDg20,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedCascadingDropdownSchema,
  isAdmittedMultiselectSchema,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
  isExactMasterListId,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  readFieldConfiguration,
  removeField,
  updateFieldConfiguration,
} from '../src/authoring/index.js'
import {
  assessMultiselectEffectiveBounds,
  parseMultiselectBoundsDrafts,
} from '../src/authoring/multiselect-bounds.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function applyConfig(
  state: ReturnType<typeof createAuthoringSession>,
  fieldId: string,
  configuration: Parameters<typeof updateFieldConfiguration>[2],
  baseline?: Parameters<typeof updateFieldConfiguration>[3],
) {
  const expected = baseline ?? readFieldConfiguration(state.definition, fieldId)
  return updateFieldConfiguration(state, fieldId, configuration, expected)
}

function readSchema(definition: FormDefinition, fieldId: string): Record<string, unknown> {
  const properties = definition.jsonSchema['properties'] as Record<string, Record<string, unknown>>
  return properties[fieldId]!
}

function uiOrderOf(definition: FormDefinition): readonly string[] {
  return definition.uiSchema['ui:order'] as string[]
}

function addMultiselect(
  options: {
    masterListId?: string
    minItems?: number
    maxItems?: number
  } = {},
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'multiselect', {
    configured: {
      widgetType: 'multiselect',
      masterListId: options.masterListId ?? 'citizen-status-list',
      minItems: options.minItems,
      maxItems: options.maxItems,
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add multiselect')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

function addCascading(
  options: {
    parentMasterListId?: string
    childMasterListId?: string
  } = {},
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'cascading-dropdown', {
    configured: {
      widgetType: 'cascading-dropdown',
      parentMasterListId: options.parentMasterListId ?? 'parent-list',
      childMasterListId: options.childMasterListId ?? 'child-list',
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add cascading-dropdown')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D10 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('multiselect')).toBe(true)
    expect(isAddableWidgetType('cascading-dropdown')).toBe(true)
    expect(isConfiguredAddableWidgetType('multiselect')).toBe(true)
    expect(isConfiguredAddableWidgetType('cascading-dropdown')).toBe(true)
    expect(isConfiguredAddableWidgetType('email')).toBe(false)
  })
})

describe('FB-D10 — exact template bindings and schemas', () => {
  it('multiselect template is configured ui:widget with array schema', () => {
    const template = getAuthoringTemplate('multiselect')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('widget')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:widget': 'multiselect' })
    if (template.addMode !== 'configured') return
    expect(
      template.buildSchema({
        widgetType: 'multiselect',
        masterListId: 'list-a',
        minItems: 1,
        maxItems: 3,
      }),
    ).toEqual({
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      minItems: 1,
      maxItems: 3,
      'x-dg20': { masterListId: 'list-a' },
    })
    expect(
      template.buildSchema({ widgetType: 'multiselect', masterListId: 'list-a' }),
    ).not.toHaveProperty('enum')
    expect(
      template.buildSchema({ widgetType: 'multiselect', masterListId: 'list-a' }),
    ).not.toHaveProperty('minItems')
  })

  it('cascading-dropdown template is configured ui:field with parent/child codes', () => {
    const template = getAuthoringTemplate('cascading-dropdown')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'cascading-dropdown' })
    if (template.addMode !== 'configured') return
    expect(
      template.buildSchema({
        widgetType: 'cascading-dropdown',
        parentMasterListId: 'p',
        childMasterListId: 'c',
      }),
    ).toEqual({
      type: 'object',
      properties: {
        parentCode: { type: 'string', minLength: 1 },
        childCode: { type: 'string', minLength: 1 },
      },
      required: ['parentCode'],
      additionalProperties: false,
      'x-dg20': { parentMasterListId: 'p', childMasterListId: 'c' },
    })
  })

  it('rejects immediate addField for configured D10 widgets', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    for (const widgetType of ['multiselect', 'cascading-dropdown'] as const) {
      const result = addField(session, widgetType)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('configuration_invalid')
    }
  })
})

describe('FB-D10 — typed pending configured-add union', () => {
  it('beginConfiguredAdd creates discriminated empty drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'multiselect',
      masterListId: '',
      minItems: '',
      maxItems: '',
      showValidation: false,
    })
    ui = authoringReducer(ui, { type: 'cancelConfiguredAdd' })
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'cascading-dropdown' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'cascading-dropdown',
      parentMasterListId: '',
      childMasterListId: '',
      showValidation: false,
    })
  })

  it('patches preserve discriminated pending values without clearing sibling fields', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'keep', minItems: '1' },
    })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { maxItems: '4' },
    })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'multiselect',
      masterListId: 'keep',
      minItems: '1',
      maxItems: '4',
      showValidation: false,
    })
  })

  it('second begin preserves first draft; session replacement clears pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'keep-me', minItems: '2' },
    })
    const before = structuredClone(ui.pendingConfiguredAdd)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'cascading-dropdown' })
    expect(ui.pendingConfiguredAdd).toEqual(before)
    expect(ui.announcement?.key).toBe('announceConfiguredAddBlocked')

    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
  })
})

describe('FB-D10 — configured-add validation and Confirm', () => {
  it('invalid multiselect bounds focus first invalid control without mutating definition', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'ok-list', minItems: '5', maxItems: '2' },
    })
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('maxItems')
    expect(ui.pendingFocusConfiguredAdd?.requestId).toBeGreaterThan(0)
    expect(ui.authoring.definition).toEqual(before)
  })

  it('invalid cascading focuses parent then child', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'cascading-dropdown' })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('parentMasterListId')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { parentMasterListId: 'parent-ok', childMasterListId: ' padded ' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('childMasterListId')
  })

  it('Confirm atomically adds multiselect and cascading; Cancel restores palette focus', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const orderBefore = uiOrderOf(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'ms-list', minItems: '1', maxItems: '3' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    const msId = ui.authoring.selectedFieldId!
    expect(msId).toBe('multiselect_1')
    expect(ui.pendingFocusFieldId).toBe(msId)
    expect(uiOrderOf(ui.authoring.definition)).toHaveLength(orderBefore.length + 1)
    expect(readSchema(ui.authoring.definition, msId)).toEqual({
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      minItems: 1,
      maxItems: 3,
      'x-dg20': { masterListId: 'ms-list' },
    })
    expect(ui.authoring.definition.uiSchema[msId]).toEqual({ 'ui:widget': 'multiselect' })

    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'cascading-dropdown' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { parentMasterListId: 'same-list', childMasterListId: 'same-list' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    const cascadeId = ui.authoring.selectedFieldId!
    expect(cascadeId).toBe('cascading_dropdown_1')
    expect(readSchema(ui.authoring.definition, cascadeId)).toEqual({
      type: 'object',
      properties: {
        parentCode: { type: 'string', minLength: 1 },
        childCode: { type: 'string', minLength: 1 },
      },
      required: ['parentCode'],
      additionalProperties: false,
      'x-dg20': { parentMasterListId: 'same-list', childMasterListId: 'same-list' },
    })
    expect(ui.authoring.definition.uiSchema[cascadeId]).toEqual({
      'ui:field': 'cascading-dropdown',
    })

    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'multiselect' })
    const definitionBeforeCancel = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'cancelConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ui.pendingFocusPaletteWidgetType).toBe('multiselect')
    expect(ui.authoring.definition).toEqual(definitionBeforeCancel)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
  })

  it('blocks Validate/Save drafts and remove while configured-add pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'cascading-dropdown' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'remove', fieldId: 'applicant_name' })
    expect(ui.authoring.definition).toEqual(before)
    expect(ui.announcement?.key).toBe('announceConfiguredAddBlocked')
  })
})

describe('FB-D10 — bound parsing and effective-minimum rules', () => {
  it('parses blank as absent and rejects padded or decimal drafts', () => {
    expect(parseMultiselectBoundsDrafts('', '')).toEqual({
      ok: true,
      minItems: undefined,
      maxItems: undefined,
    })
    expect(parseMultiselectBoundsDrafts('0', '2').ok).toBe(true)
    expect(parseMultiselectBoundsDrafts('01', '')).toMatchObject({
      ok: false,
      firstInvalidControl: 'minItems',
    })
    expect(parseMultiselectBoundsDrafts('', '1.5')).toMatchObject({
      ok: false,
      firstInvalidControl: 'maxItems',
    })
    expect(parseMultiselectBoundsDrafts('3', '1')).toMatchObject({
      ok: false,
      firstInvalidControl: 'maxItems',
      code: 'items_range_invalid',
    })
  })

  it('requires explicit minItems >= 1 when required (no virtual minimum)', () => {
    expect(
      assessMultiselectEffectiveBounds({
        minItems: undefined,
        maxItems: undefined,
        required: true,
      }),
    ).toMatchObject({
      ok: false,
      firstInvalidControl: 'minItems',
      code: 'required_min_items_invalid',
    })
    expect(
      assessMultiselectEffectiveBounds({ minItems: 0, maxItems: 2, required: true }),
    ).toMatchObject({ ok: false, code: 'required_min_items_invalid' })
    expect(
      assessMultiselectEffectiveBounds({ minItems: undefined, maxItems: 0, required: true }),
    ).toMatchObject({
      ok: false,
      firstInvalidControl: 'minItems',
      code: 'required_min_items_invalid',
    })
    expect(
      assessMultiselectEffectiveBounds({ minItems: 1, maxItems: undefined, required: true }),
    ).toEqual({
      ok: true,
      effectiveMin: 1,
    })
    expect(assessMultiselectEffectiveBounds({ minItems: 2, maxItems: 5, required: true })).toEqual({
      ok: true,
      effectiveMin: 2,
    })
    expect(
      assessMultiselectEffectiveBounds({
        minItems: undefined,
        maxItems: undefined,
        required: false,
      }),
    ).toEqual({ ok: true, effectiveMin: 0 })
  })

  it('property Apply rejects required without minItems or with minItems below 1', () => {
    const { state, fieldId } = addMultiselect()
    const committed = readFieldConfiguration(state.definition, fieldId)

    const missing = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '',
    })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error.code).toBe('configuration_invalid')

    const zero = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '0',
    })
    expect(zero.ok).toBe(false)

    const accepted = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '1',
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(readSchema(accepted.state.definition, fieldId)).toMatchObject({
      minItems: 1,
    })
    expect(accepted.state.definition.jsonSchema.required).toContain(fieldId)

    const range = applyConfig(accepted.state, fieldId, {
      ...readFieldConfiguration(accepted.state.definition, fieldId),
      required: true,
      minItems: '2',
      maxItems: '1',
    })
    expect(range.ok).toBe(false)
  })

  it('optional Apply may omit minItems; toggling required off keeps an existing minimum', () => {
    const { state, fieldId } = addMultiselect({ minItems: 2 })
    const committed = readFieldConfiguration(state.definition, fieldId)
    expect(committed.minItems).toBe('2')

    const optional = applyConfig(state, fieldId, {
      ...committed,
      required: false,
      minItems: '',
    })
    expect(optional.ok).toBe(true)
    if (!optional.ok) return
    expect(readSchema(optional.state.definition, fieldId)).not.toHaveProperty('minItems')

    const withMin = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '2',
    })
    expect(withMin.ok).toBe(true)
    if (!withMin.ok) return
    const clearedRequired = applyConfig(withMin.state, fieldId, {
      ...readFieldConfiguration(withMin.state.definition, fieldId),
      required: false,
      minItems: '2',
    })
    expect(clearedRequired.ok).toBe(true)
    if (!clearedRequired.ok) return
    expect(readSchema(clearedRequired.state.definition, fieldId)).toMatchObject({ minItems: 2 })
    expect(clearedRequired.state.definition.jsonSchema.required ?? []).not.toContain(fieldId)
  })
})

describe('FB-D10 — schema admission and hostile values', () => {
  it('admits multiselect and cascading schemas; rejects hostile accessors', () => {
    const { state, fieldId } = addMultiselect({ masterListId: 'exact-id', minItems: 1 })
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedMultiselectSchema(schema)).toBe(true)
    expect(isExactMasterListId('exact-id')).toBe(true)

    let getterHits = 0
    const hostile = structuredClone(state.definition) as FormDefinition
    const hostileSchema = readSchema(hostile, fieldId)
    const xdg20: Record<string, unknown> = {}
    Object.defineProperty(xdg20, 'masterListId', {
      get() {
        getterHits += 1
        return 'x'
      },
      enumerable: true,
      configurable: true,
    })
    hostileSchema['x-dg20'] = xdg20
    expect(isAdmittedMultiselectSchema(hostileSchema)).toBe(false)
    expect(getterHits).toBe(0)
    expect(() => assertDefinitionIntegrity(hostile)).toThrow(AuthoringError)

    const withEnum = structuredClone(state.definition) as FormDefinition
    readSchema(withEnum, fieldId)['enum'] = ['a']
    expect(isAdmittedMultiselectSchema(readSchema(withEnum, fieldId))).toBe(false)

    const uniqueFalse = structuredClone(state.definition) as FormDefinition
    readSchema(uniqueFalse, fieldId)['uniqueItems'] = false
    expect(isAdmittedMultiselectSchema(readSchema(uniqueFalse, fieldId))).toBe(false)

    const { state: cascadeState, fieldId: cascadeId } = addCascading({
      parentMasterListId: 'p',
      childMasterListId: 'c',
    })
    const cascadeSchema = readSchema(cascadeState.definition, cascadeId)
    expect(isAdmittedCascadingDropdownSchema(cascadeSchema)).toBe(true)
    expect(admitCascadingXDg20(cascadeSchema)).toEqual({
      kind: 'valid',
      value: { parentMasterListId: 'p', childMasterListId: 'c' },
    })

    const extraX = structuredClone(cascadeState.definition) as FormDefinition
    ;(readSchema(extraX, cascadeId)['x-dg20'] as Record<string, unknown>)['extra'] = 'no'
    expect(isAdmittedCascadingDropdownSchema(readSchema(extraX, cascadeId))).toBe(false)

    const missingChild = structuredClone(cascadeState.definition) as FormDefinition
    delete (readSchema(missingChild, cascadeId)['x-dg20'] as Record<string, unknown>)[
      'childMasterListId'
    ]
    expect(isAdmittedCascadingDropdownSchema(readSchema(missingChild, cascadeId))).toBe(false)
  })
})

describe('FB-D10 — property Apply / Cancel / stale / bilingual isolation', () => {
  it('Apply writes multiselect bounds and cascading IDs; preserves annotations', () => {
    const { state, fieldId } = addMultiselect({ masterListId: 'list-old' })
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Multi pick'
    const annotatedState = { ...state, definition: annotated }
    const committed = readFieldConfiguration(annotated, fieldId)
    const result = applyConfig(annotatedState, fieldId, {
      ...committed,
      masterListId: 'list-new',
      minItems: '2',
      maxItems: '4',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual({
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      minItems: 2,
      maxItems: 4,
      description: 'Multi pick',
      'x-dg20': { masterListId: 'list-new' },
    })
    expect(result.state.definition.jsonSchema.required).toContain(fieldId)

    const cascade = addCascading({ parentMasterListId: 'old-p', childMasterListId: 'old-c' })
    const cascadeCommitted = readFieldConfiguration(cascade.state.definition, cascade.fieldId)
    const cascadeResult = applyConfig(cascade.state, cascade.fieldId, {
      ...cascadeCommitted,
      parentMasterListId: 'new-p',
      childMasterListId: 'new-c',
    })
    expect(cascadeResult.ok).toBe(true)
    if (!cascadeResult.ok) return
    expect(readSchema(cascadeResult.state.definition, cascade.fieldId)['x-dg20']).toEqual({
      parentMasterListId: 'new-p',
      childMasterListId: 'new-c',
    })
  })

  it('stale baseline rejects Apply; bilingual drafts survive Property Apply', () => {
    const added = addCascading()
    let state = added.state
    const fieldId = added.fieldId
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(
      state,
      fieldId,
      { ...baseline, parentMasterListId: 'list-b' },
      baseline,
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const stale = applyConfig(
      state,
      fieldId,
      { ...baseline, parentMasterListId: 'list-c' },
      baseline,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')

    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Pick cascade', errorGu: '' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(ui.editorDrafts[fieldId]?.errorDraft).toEqual({ en: 'Pick cascade', gu: '' })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
  })

  it('property editor patches accept multiselect bounds and cascading list IDs', () => {
    const { state, fieldId } = addMultiselect()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { minItems: '2', maxItems: '5' },
    })
    expect(ui.editorDrafts[fieldId]?.draft).toMatchObject({
      widgetType: 'multiselect',
      minItems: '2',
      maxItems: '5',
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)

    const cascade = addCascading()
    ui = createAuthoringUiState(cascade.state)
    ui = authoringReducer(ui, { type: 'select', fieldId: cascade.fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: cascade.fieldId,
      patch: { parentMasterListId: 'p2', childMasterListId: 'c2' },
    })
    expect(ui.editorDrafts[cascade.fieldId]?.draft).toMatchObject({
      widgetType: 'cascading-dropdown',
      parentMasterListId: 'p2',
      childMasterListId: 'c2',
    })
  })
})

describe('FB-D10 — progressive-step sync and remove/reorder', () => {
  it('adds configured fields into the selected progressive step', () => {
    const { state, fieldId } = addMultiselect()
    const step = state.definition.meta.progressiveSteps.find((s) => s.fieldIds.includes(fieldId))
    expect(step).toBeDefined()
    const order = uiOrderOf(state.definition)
    const positions = step!.fieldIds.map((id) => order.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('can remove and reorder after adding multiselect and cascading', () => {
    const first = addMultiselect()
    let state = first.state
    const second = addField(state, 'cascading-dropdown', {
      configured: {
        widgetType: 'cascading-dropdown',
        parentMasterListId: 'p1',
        childMasterListId: 'c1',
      },
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    state = second.state
    const cascadeId = state.selectedFieldId!
    const moved = moveField(state, cascadeId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const removed = removeField(moved.state, first.fieldId)
    expect(removed.ok).toBe(true)
  })
})
