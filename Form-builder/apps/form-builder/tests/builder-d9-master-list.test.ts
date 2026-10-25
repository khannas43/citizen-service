import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  AuthoringError,
  PENDING_COUNT,
  addField,
  admitMasterListXDg20,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedDropdownMasterSchema,
  isAdmittedRadioSchema,
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

function addMasterField(
  widgetType: 'dropdown-master' | 'radio',
  masterListId = 'citizen-status-list',
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, widgetType, { configured: { widgetType, masterListId } })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`failed to add ${widgetType}`)
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D9 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('dropdown-master')).toBe(true)
    expect(isAddableWidgetType('radio')).toBe(true)
    expect(isConfiguredAddableWidgetType('dropdown-master')).toBe(true)
    expect(isConfiguredAddableWidgetType('email')).toBe(false)
  })
})

describe('FB-D9 — exact templates and ui:widget bindings', () => {
  it.each(['dropdown-master', 'radio'] as const)(
    '%s template is configured ui:widget with masterListId x-dg20',
    (widgetType) => {
      const template = getAuthoringTemplate(widgetType)!
      expect(template.addMode).toBe('configured')
      expect(template.uiBinding).toBe('widget')
      expect(template.buildUiSchemaEntry()).toEqual({ 'ui:widget': widgetType })
      if (template.addMode !== 'configured') return
      expect(template.buildSchema({ widgetType, masterListId: 'list-a' })).toEqual({
        type: 'string',
        'x-dg20': { masterListId: 'list-a' },
      })
      expect(template.buildSchema({ widgetType, masterListId: 'list-a' })).not.toHaveProperty(
        'enum',
      )
    },
  )

  it('immediate-add widgets retain one-click add without configured input', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = addField(session, 'email')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, result.state.selectedFieldId!)).not.toHaveProperty(
      'x-dg20',
    )
  })

  it('rejects immediate addField for configured widgets without masterListId', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = addField(session, 'radio')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('configuration_invalid')
  })
})

describe('FB-D9 — configured-add reducer workflow', () => {
  it('beginConfiguredAdd does not mutate the definition', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown-master' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'dropdown-master',
      masterListId: '',
      showValidation: false,
    })
    expect(ui.authoring.definition).toEqual(before)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
  })

  it('invalid Confirm shows validation and does not mutate definition', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'radio' })
    ui = authoringReducer(ui, { type: 'patchConfiguredAdd', patch: { masterListId: ' padded ' } })
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('masterListId')
    expect(ui.pendingFocusConfiguredAdd?.requestId).toBeGreaterThan(0)
    expect(ui.authoring.definition).toEqual(before)
  })

  it('Cancel clears pending state without definition mutation and restores palette focus', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown-master' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'status-codes' },
    })
    ui = authoringReducer(ui, { type: 'cancelConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ui.pendingFocusPaletteWidgetType).toBe('dropdown-master')
    expect(ui.authoring.definition).toEqual(before)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
  })

  it('successful Confirm atomically adds the configured field and selects it', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const orderBefore = uiOrderOf(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'radio' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'gender-master' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    const fieldId = ui.authoring.selectedFieldId!
    expect(fieldId).toBe('radio_1')
    expect(ui.pendingFocusFieldId).toBe(fieldId)
    expect(uiOrderOf(ui.authoring.definition)).toHaveLength(orderBefore.length + 1)
    expect(readSchema(ui.authoring.definition, fieldId)).toEqual({
      type: 'string',
      'x-dg20': { masterListId: 'gender-master' },
    })
    expect(ui.authoring.definition.uiSchema[fieldId]).toEqual({ 'ui:widget': 'radio' })
  })

  it('blocks remove/reorder while configured-add is pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown-master' })
    const before = structuredClone(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'remove', fieldId: 'applicant_name' })
    expect(ui.authoring.definition).toEqual(before)
    expect(ui.announcement?.key).toBe('announceConfiguredAddBlocked')
    ui = authoringReducer(ui, { type: 'move', fieldId: 'applicant_name', direction: 'down' })
    expect(ui.authoring.definition).toEqual(before)
  })

  it('session replacement clears pending configured add', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'radio' })
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
  })

  it('rapid begin preserves the first draft; second begin is ignored', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'dropdown-master' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { masterListId: 'keep-me' },
    })
    const before = structuredClone(ui.pendingConfiguredAdd)
    const definitionBefore = structuredClone(ui.authoring.definition)
    const selectionBefore = ui.authoring.selectedFieldId
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'radio' })
    expect(ui.pendingConfiguredAdd).toEqual(before)
    expect(ui.authoring.definition).toEqual(definitionBefore)
    expect(ui.authoring.selectedFieldId).toBe(selectionBefore)
    expect(ui.announcement?.key).toBe('announceConfiguredAddBlocked')
    expect(ui.pendingFocusPaletteWidgetType).toBeNull()

    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    const twice = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.authoring.definition).toEqual(twice.authoring.definition)
    expect(
      Object.keys(ui.authoring.definition.jsonSchema.properties as object).filter((id) =>
        id.startsWith('dropdown_master_'),
      ),
    ).toHaveLength(1)
    expect(
      Object.keys(ui.authoring.definition.jsonSchema.properties as object).filter((id) =>
        id.startsWith('radio_'),
      ),
    ).toHaveLength(0)
  })
})

describe('FB-D9 — progressive-step sync', () => {
  it('adds configured fields into the selected progressive step', () => {
    const { state, fieldId } = addMasterField('dropdown-master')
    const step = state.definition.meta.progressiveSteps.find((s) => s.fieldIds.includes(fieldId))
    expect(step).toBeDefined()
    const order = uiOrderOf(state.definition)
    const positions = step!.fieldIds.map((id) => order.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('FB-D9 — schema admission', () => {
  it('admits exact masterListId schemas and rejects hostile shapes without getters', () => {
    const { state, fieldId } = addMasterField('dropdown-master', 'exact-id')
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedDropdownMasterSchema(schema)).toBe(true)
    expect(admitMasterListXDg20(schema)).toEqual({
      kind: 'valid',
      value: { masterListId: 'exact-id' },
    })
    expect(isExactMasterListId('exact-id')).toBe(true)
    expect(isExactMasterListId(' padded ')).toBe(false)
    expect(isExactMasterListId('')).toBe(false)

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
    expect(isAdmittedDropdownMasterSchema(hostileSchema)).toBe(false)
    expect(getterHits).toBe(0)
    expect(() => assertDefinitionIntegrity(hostile)).toThrow(AuthoringError)

    const withEnum = structuredClone(state.definition) as FormDefinition
    readSchema(withEnum, fieldId)['enum'] = ['a']
    expect(isAdmittedDropdownMasterSchema(readSchema(withEnum, fieldId))).toBe(false)

    const { state: radioState, fieldId: radioId } = addMasterField('radio')
    expect(isAdmittedRadioSchema(readSchema(radioState.definition, radioId))).toBe(true)
  })
})

describe('FB-D9 — property Apply / Cancel / stale / bilingual isolation', () => {
  it('Apply writes canonical masterListId and preserves unrelated annotations', () => {
    const { state, fieldId } = addMasterField('dropdown-master', 'list-old')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Master select'
    const annotatedState = { ...state, definition: annotated }
    const committed = readFieldConfiguration(annotated, fieldId)
    const result = applyConfig(annotatedState, fieldId, {
      ...committed,
      masterListId: 'list-new',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual({
      type: 'string',
      description: 'Master select',
      'x-dg20': { masterListId: 'list-new' },
    })
    expect(result.state.definition.jsonSchema.required).toContain(fieldId)
  })

  it('stale baseline rejects Apply; bilingual error drafts survive Property Apply', () => {
    const added = addMasterField('radio', 'list-a')
    let state = added.state
    const fieldId = added.fieldId
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(state, fieldId, { ...baseline, masterListId: 'list-b' }, baseline)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const stale = applyConfig(state, fieldId, { ...baseline, masterListId: 'list-c' }, baseline)
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')

    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Pick one', errorGu: '' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(ui.editorDrafts[fieldId]?.errorDraft).toEqual({ en: 'Pick one', gu: '' })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
  })
})

describe('FB-D9 — remove/reorder still work after configured add', () => {
  it('can remove and reorder master-list fields', () => {
    const first = addMasterField('dropdown-master')
    let state = first.state
    const second = addField(state, 'radio', {
      configured: { widgetType: 'radio', masterListId: 'r1' },
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    state = second.state
    const radioId = state.selectedFieldId!
    const moved = moveField(state, radioId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const removed = removeField(moved.state, first.fieldId)
    expect(removed.ok).toBe(true)
  })
})
