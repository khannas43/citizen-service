import { describe, expect, it, vi } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  AuthoringError,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  configurationToDraft,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAddableWidgetType,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  readFieldConfiguration,
  removeField,
  selectField,
  updateFieldConfiguration,
  validateFieldConfigurationDraft,
  widgetTypeToIdStem,
} from '../src/authoring/index.js'
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

function addCitizenField(widgetType: 'email' | 'full-name' | 'dob' | 'pincode'): {
  state: ReturnType<typeof createAuthoringSession>
  fieldId: string
} {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, widgetType)
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`failed to add ${widgetType}`)
  }
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D5 authoring — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(PALETTE_WIDGET_COUNT).toBe(30)
  })

  it('uses one authoritative addable set with neutral guards', () => {
    expect(isAddableWidgetType('email')).toBe(true)
    expect(isAddableWidgetType('full-name')).toBe(true)
    expect(isAddableWidgetType('dob')).toBe(true)
    expect(isAddableWidgetType('pincode')).toBe(true)
    expect(isAddableWidgetType('aadhaar')).toBe(true)
    expect(isAddableWidgetType('mobile-otp')).toBe(true)
    expect(isAddableWidgetType('bank-account')).toBe(true)
    expect(getAuthoringTemplate('aadhaar')).toBeDefined()
    expect(isAddableWidgetType('address-block')).toBe(true)
    expect(isAddableWidgetType('photo-capture')).toBe(true)
    expect(isAddableWidgetType('doc-upload')).toBe(true)
    expect(isAddableWidgetType('digilocker-fetch')).toBe(true)
    expect(isAddableWidgetType('fee-field')).toBe(true)
    expect(isAddableWidgetType('signature-esign')).toBe(true)
    expect(getAuthoringTemplate('doc-upload')).toBeDefined()
    expect(isAddableWidgetType('caf-prefill')).toBe(true)
    expect(getAuthoringTemplate('caf-prefill')).toBeDefined()
    expect(isAddableWidgetType('family-repeater')).toBe(true)
    expect(getAuthoringTemplate('family-repeater')).toBeDefined()
  })
})

describe('FB-D5 authoring — exact citizen-field templates', () => {
  it('email template uses ui:widget with format email and no default x-dg20', () => {
    const template = getAuthoringTemplate('email')!
    expect(template.uiBinding).toBe('widget')
    expect(template.producesData).toBe(true)
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:widget': 'email' })
    expect(template.buildSchema()).toEqual({ type: 'string', format: 'email' })
    expect(template.buildSchema()).not.toHaveProperty('title')
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('full-name template uses ui:field with baked EN/GU object schema', () => {
    const template = getAuthoringTemplate('full-name')!
    expect(template.uiBinding).toBe('field')
    expect(template.producesData).toBe(true)
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'full-name' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        en: { type: 'string', minLength: 1 },
        gu: { type: 'string', minLength: 1 },
      },
      required: ['en', 'gu'],
      additionalProperties: false,
    })
  })

  it('dob template uses ui:widget with format date and no default ages', () => {
    const template = getAuthoringTemplate('dob')!
    expect(template.uiBinding).toBe('widget')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:widget': 'dob' })
    expect(template.buildSchema()).toEqual({ type: 'string', format: 'date' })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('pincode template uses ui:field with PIN pattern and optional city/district members', () => {
    const template = getAuthoringTemplate('pincode')!
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'pincode' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        pincode: { type: 'string', pattern: '^[0-9]{6}$' },
        cityCode: { type: 'string', minLength: 1 },
        districtCode: { type: 'string', minLength: 1 },
      },
      required: ['pincode'],
      additionalProperties: false,
    })
  })

  it.each(['email', 'full-name', 'dob', 'pincode'] as const)(
    'allocates deterministic field IDs for %s',
    (widgetType) => {
      const { fieldId } = addCitizenField(widgetType)
      expect(fieldId).toBe(`${widgetTypeToIdStem(widgetType)}_1`)
    },
  )

  it.each(['email', 'full-name', 'dob', 'pincode'] as const)(
    'does not seed preview formData when adding %s',
    (widgetType) => {
      const { state, fieldId } = addCitizenField(widgetType)
      expect(state.previewFormData).not.toHaveProperty(fieldId)
    },
  )
})

describe('FB-D5 authoring — add/remove/reorder/step sync', () => {
  it('adds citizen fields into the selected progressive step and preserves order sync', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    state = selectField(state, 'household_size')
    const added = addField(state, 'email')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    const order = uiOrderOf(added.state.definition)
    expect(order[order.indexOf('household_size') + 1]).toBe(fieldId)
    const step = added.state.definition.meta.progressiveSteps.find((entry) =>
      entry.fieldIds.includes(fieldId),
    )
    expect(step?.fieldIds).toContain(fieldId)
    expect(order).toEqual(
      added.state.definition.meta.progressiveSteps.flatMap((s) => [...s.fieldIds]),
    )
    assertDefinitionIntegrity(added.state.definition)
  })

  it('reorders within a step without mutating schema or preview data', () => {
    const { state, fieldId } = addCitizenField('dob')
    const selected = selectField(state, fieldId)
    const previewBefore = structuredClone(selected.previewFormData)
    const schemaBefore = structuredClone(selected.definition.jsonSchema.properties)
    const moved = moveField(selected, fieldId, 'up')
    if (!moved.ok) return
    expect(moved.state.definition.jsonSchema.properties).toEqual(schemaBefore)
    expect(moved.state.previewFormData).toEqual(previewBefore)
  })

  it('remove cleans drafts and preview value for the removed citizen field', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'add', widgetType: 'email' })
    const fieldId = ui.authoring.selectedFieldId!
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { verifyEmail: true, labelEn: 'Work email' },
    })
    ui = {
      ...ui,
      authoring: {
        ...ui.authoring,
        previewFormData: { ...ui.authoring.previewFormData, [fieldId]: 'a@b.co' },
      },
    }
    expect(ui.editorDrafts[fieldId]).toBeDefined()
    ui = authoringReducer(ui, { type: 'remove', fieldId })
    expect(ui.editorDrafts[fieldId]).toBeUndefined()
    expect(ui.authoring.previewFormData).not.toHaveProperty(fieldId)
    expect(ui.authoring.definition.jsonSchema.properties).not.toHaveProperty(fieldId)
  })
})

describe('FB-D5 authoring — email verifyEmail x-dg20', () => {
  it('Apply true writes exact verifyEmail:true; false removes the key and empty x-dg20', () => {
    const added = addCitizenField('email')
    let state = added.state
    const fieldId = added.fieldId
    const committed = readFieldConfiguration(state.definition, fieldId)
    expect(committed.verifyEmail).toBe(false)
    expect(readSchema(state.definition, fieldId)).not.toHaveProperty('x-dg20')

    const enabled = applyConfig(state, fieldId, { ...committed, verifyEmail: true })
    expect(enabled.ok).toBe(true)
    if (!enabled.ok) return
    state = enabled.state
    expect(readSchema(state.definition, fieldId)['x-dg20']).toEqual({ verifyEmail: true })

    const disabled = applyConfig(state, fieldId, {
      ...readFieldConfiguration(state.definition, fieldId),
      verifyEmail: false,
    })
    expect(disabled.ok).toBe(true)
    if (!disabled.ok) return
    expect(readSchema(disabled.state.definition, fieldId)).not.toHaveProperty('x-dg20')
  })

  it('preserves email format and never writes ui:options business config', () => {
    const { state, fieldId } = addCitizenField('email')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      verifyEmail: true,
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['format']).toBe('email')
    expect(schema['type']).toBe('string')
    const uiEntry = result.state.definition.uiSchema[fieldId] as Record<string, unknown>
    expect(uiEntry['ui:widget']).toBe('email')
    expect(uiEntry).not.toHaveProperty('ui:options')
  })
})

describe('FB-D5 authoring — DOB age gates', () => {
  it('accepts absent ages, 0, and valid bounds; writes integer x-dg20 values', () => {
    const added = addCitizenField('dob')
    let state = added.state
    const fieldId = added.fieldId
    const committed = readFieldConfiguration(state.definition, fieldId)
    expect(committed.minAge).toBe('')
    expect(committed.maxAge).toBe('')

    const withZero = applyConfig(state, fieldId, { ...committed, minAge: '0', maxAge: '120' })
    expect(withZero.ok).toBe(true)
    if (!withZero.ok) return
    state = withZero.state
    expect(readSchema(state.definition, fieldId)['x-dg20']).toEqual({ minAge: 0, maxAge: 120 })

    const cleared = applyConfig(state, fieldId, {
      ...readFieldConfiguration(state.definition, fieldId),
      minAge: '',
      maxAge: '',
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(readSchema(cleared.state.definition, fieldId)).not.toHaveProperty('x-dg20')
  })

  it.each([
    ['01', 'min_age_invalid'],
    ['-1', 'min_age_invalid'],
    ['1.5', 'min_age_invalid'],
    ['1e2', 'min_age_invalid'],
    ['+2', 'min_age_invalid'],
    [' 3', 'min_age_invalid'],
    ['9007199254740992', 'min_age_invalid'],
  ] as const)('rejects invalid minAge %s', (raw, code) => {
    const { state, fieldId } = addCitizenField('dob')
    const dob = readFieldConfiguration(state.definition, fieldId)
    const validation = validateFieldConfigurationDraft({ ...dob, minAge: raw })
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain(code)
  })

  it('rejects minAge > maxAge on Maximum age control', () => {
    const { state, fieldId } = addCitizenField('dob')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const validation = validateFieldConfigurationDraft({
      ...committed,
      minAge: '40',
      maxAge: '18',
    })
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues).toContainEqual({
      code: 'age_range_invalid',
      control: 'maxAge',
    })
    const rejected = applyConfig(state, fieldId, {
      ...committed,
      minAge: '40',
      maxAge: '18',
    })
    expect(rejected.ok).toBe(false)
    if (rejected.ok) return
    expect(rejected.error.code).toBe('configuration_invalid')
    expect(readSchema(state.definition, fieldId)).not.toHaveProperty('x-dg20')
  })

  it('does not silently trim or coerce padded age drafts', () => {
    const { state, fieldId } = addCitizenField('dob')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const validation = validateFieldConfigurationDraft({ ...committed, maxAge: '18 ' })
    expect(validation.ok).toBe(false)
    const rejected = applyConfig(state, fieldId, { ...committed, maxAge: '18 ' })
    expect(rejected.ok).toBe(false)
  })
})

describe('FB-D5 authoring — full-name and pincode baked invariants', () => {
  it('Property Apply preserves full-name inner required and additionalProperties', () => {
    const { state, fieldId } = addCitizenField('full-name')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      labelEn: 'Legal name',
      labelGu: 'કાનૂની નામ',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema).toMatchObject({
      type: 'object',
      required: ['en', 'gu'],
      additionalProperties: false,
      properties: {
        en: { type: 'string', minLength: 1 },
        gu: { type: 'string', minLength: 1 },
      },
    })
    expect(result.state.definition.uiSchema[fieldId]).toMatchObject({ 'ui:field': 'full-name' })
  })

  it('Property Apply preserves PIN pattern and required pincode member', () => {
    const { state, fieldId } = addCitizenField('pincode')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      helpEn: 'Enter your PIN',
      helpGu: 'તમારો પિન દાખલ કરો',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['required']).toEqual(['pincode'])
    expect(schema['additionalProperties']).toBe(false)
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    expect(properties.pincode).toEqual({ type: 'string', pattern: '^[0-9]{6}$' })
    expect(properties.cityCode).toEqual({ type: 'string', minLength: 1 })
    expect(properties.districtCode).toEqual({ type: 'string', minLength: 1 })
  })
})

describe('FB-D5 authoring — malformed containment and stale baselines', () => {
  it('contains typed AuthoringError for mismatched widget configuration', () => {
    const { state, fieldId } = addCitizenField('email')
    const mismatched = {
      widgetType: 'dob' as const,
      labelEn: 'Bad',
      labelGu: 'ખરાબ',
      helpEn: '',
      helpGu: '',
      required: false,
      minAge: '',
      maxAge: '',
    }
    const result = applyConfig(state, fieldId, mismatched)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(AuthoringError)
    expect(result.error.code).toBe('configuration_widget_mismatch')
  })

  it('stale_editor_draft rejects Apply when committed baseline diverged', () => {
    const added = addCitizenField('dob')
    let state = added.state
    const fieldId = added.fieldId
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(state, fieldId, { ...baseline, minAge: '18' }, baseline)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const stale = applyConfig(state, fieldId, { ...baseline, minAge: '21' }, baseline)
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')
    expect(readSchema(state.definition, fieldId)['x-dg20']).toEqual({ minAge: 18 })
  })
})

describe('FB-D5 authoring — Property/Bilingual draft isolation', () => {
  it('shares label drafts and preserves unsaved DOB constraints across Bilingual Apply', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'add', widgetType: 'dob' })
    const fieldId = ui.authoring.selectedFieldId!

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { labelEn: 'Date of birth', minAge: '18', maxAge: '65' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)

    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Invalid date', errorGu: 'અમાન્ય તારીખ' },
    })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)

    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId })
    expect(ui.authoring.definition.meta.bilingual.labels[fieldId]?.en).toBe('Date of birth')
    expect(ui.editorDrafts[fieldId]?.draft.minAge).toBe('18')
    expect(ui.editorDrafts[fieldId]?.draft.maxAge).toBe('65')
    expect(readSchema(ui.authoring.definition, fieldId)).not.toHaveProperty('x-dg20')

    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(readSchema(ui.authoring.definition, fieldId)['x-dg20']).toEqual({
      minAge: 18,
      maxAge: 65,
    })
    expect(ui.authoring.definition.meta.bilingual.errors[fieldId]).toEqual({
      en: 'Invalid date',
      gu: 'અમાન્ય તારીખ',
    })
  })

  it('Property Apply does not clear Bilingual-only error drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'add', widgetType: 'email' })
    const fieldId = ui.authoring.selectedFieldId!
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Only EN' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { verifyEmail: true },
    })
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(readSchema(ui.authoring.definition, fieldId)['x-dg20']).toEqual({ verifyEmail: true })
    expect(ui.editorDrafts[fieldId]?.errorDraft).toEqual({ en: 'Only EN', gu: '' })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
  })
})

describe('FB-D5 authoring — preview shapes and no network/storage', () => {
  it('accepts governed preview value shapes without mutating definition on preview set', () => {
    const emailAdded = addCitizenField('email')
    let state = emailAdded.state
    const emailId = emailAdded.fieldId
    let next = addField(state, 'full-name')
    expect(next.ok).toBe(true)
    if (!next.ok) return
    state = next.state
    const fullNameId = state.selectedFieldId!
    next = addField(state, 'dob')
    expect(next.ok).toBe(true)
    if (!next.ok) return
    state = next.state
    const dobId = state.selectedFieldId!
    next = addField(state, 'pincode')
    expect(next.ok).toBe(true)
    if (!next.ok) return
    state = next.state
    const pinId = state.selectedFieldId!

    const definitionBefore = structuredClone(state.definition)
    state = {
      ...state,
      previewFormData: {
        ...state.previewFormData,
        [emailId]: 'citizen@example.gov.in',
        [fullNameId]: { en: 'Sameer', gu: 'સમીર' },
        [dobId]: '1990-01-15',
        [pinId]: { pincode: '380001', cityCode: 'AHM', districtCode: 'AHM' },
      },
    }
    expect(state.definition).toEqual(definitionBefore)
    expect(typeof state.previewFormData[emailId]).toBe('string')
    expect(state.previewFormData[fullNameId]).toEqual({ en: 'Sameer', gu: 'સમીર' })
    expect(state.previewFormData[dobId]).toBe('1990-01-15')
    expect(state.previewFormData[pinId]).toEqual({
      pincode: '380001',
      cityCode: 'AHM',
      districtCode: 'AHM',
    })
  })

  it('does not call fetch or browser storage during citizen-field authoring', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    for (const widgetType of ['email', 'full-name', 'dob', 'pincode'] as const) {
      const added = addField(state, widgetType)
      expect(added.ok).toBe(true)
      if (!added.ok) continue
      state = added.state
      const fieldId = state.selectedFieldId!
      const committed = readFieldConfiguration(state.definition, fieldId)
      const draft = configurationToDraft(committed)
      expect(validateFieldConfigurationDraft(draft).ok).toBe(true)
      if (widgetType === 'email') {
        const applied = applyConfig(state, fieldId, { ...committed, verifyEmail: true })
        expect(applied.ok).toBe(true)
        if (applied.ok) state = applied.state
      }
      if (widgetType === 'dob') {
        const applied = applyConfig(state, fieldId, { ...committed, minAge: '18' })
        expect(applied.ok).toBe(true)
        if (applied.ok) state = applied.state
      }
    }
    const removed = removeField(state, state.selectedFieldId!)
    expect(removed.ok).toBe(true)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
