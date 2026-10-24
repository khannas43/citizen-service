import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'
import { PALETTE_WIDGET_COUNT } from '@dg20/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  AuthoringError,
  PENDING_COUNT,
  addField,
  admitMobileOtpXDg20,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedAadhaarSchema,
  isAdmittedBankAccountSchema,
  isAdmittedMobileOtpSchema,
  isAddableWidgetType,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  readFieldConfiguration,
  removeField,
  selectField,
  updateFieldConfiguration,
  widgetTypeToIdStem,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

type IdentityWidget = 'aadhaar' | 'mobile-otp' | 'bank-account'

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

function addIdentityField(widgetType: IdentityWidget): {
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

function withCorruptedSchema(
  state: ReturnType<typeof createAuthoringSession>,
  fieldId: string,
  mutate: (schema: Record<string, unknown>) => void,
): FormDefinition {
  const definition = structuredClone(state.definition) as FormDefinition
  mutate(readSchema(definition, fieldId))
  return definition
}

describe('FB-D8 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(isAddableWidgetType('aadhaar')).toBe(true)
    expect(isAddableWidgetType('mobile-otp')).toBe(true)
    expect(isAddableWidgetType('bank-account')).toBe(true)
  })
})

describe('FB-D8 — exact templates and ui:field bindings', () => {
  it('aadhaar template uses ui:field with reference-token surface only', () => {
    const template = getAuthoringTemplate('aadhaar')!
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'aadhaar' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        referenceToken: { type: 'string', minLength: 1 },
        identifierKind: { type: 'string', enum: ['AADHAAR', 'VID'] },
        lastFour: { type: 'string', pattern: '^[0-9]{4}$' },
      },
      required: ['referenceToken', 'identifierKind', 'lastFour'],
      additionalProperties: false,
    })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('mobile-otp template uses ui:field with canonical sms otpChannels', () => {
    const template = getAuthoringTemplate('mobile-otp')!
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'mobile-otp' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        mobileNumber: { type: 'string', pattern: '^[0-9]{10}$' },
        verified: { type: 'boolean' },
        verificationRef: { type: 'string', minLength: 1 },
      },
      required: ['mobileNumber', 'verified'],
      additionalProperties: false,
      'x-dg20': { otpChannels: ['sms'] },
    })
  })

  it('bank-account template uses ui:field with verified-required object schema', () => {
    const template = getAuthoringTemplate('bank-account')!
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'bank-account' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        accountNumber: { type: 'string', pattern: '^[0-9]{6,20}$' },
        ifsc: { type: 'string', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$' },
        accountHolderName: { type: 'string', minLength: 1 },
        verified: { type: 'boolean' },
        verificationRef: { type: 'string', minLength: 1 },
      },
      required: ['verified'],
      additionalProperties: false,
    })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it.each(['aadhaar', 'mobile-otp', 'bank-account'] as const)(
    'allocates deterministic field IDs and does not seed preview for %s',
    (widgetType) => {
      const { state, fieldId } = addIdentityField(widgetType)
      expect(fieldId).toBe(`${widgetTypeToIdStem(widgetType)}_1`)
      expect(state.previewFormData).not.toHaveProperty(fieldId)
    },
  )
})

describe('FB-D8 — add/remove/reorder and progressive-step sync', () => {
  it('adds identity fields into the selected progressive step and preserves order sync', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    state = selectField(state, 'applicant_name')
    for (const widgetType of ['aadhaar', 'mobile-otp', 'bank-account'] as const) {
      const result = addField(state, widgetType)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      state = result.state
      const fieldId = state.selectedFieldId!
      const step = state.definition.meta.progressiveSteps.find((s) =>
        s.fieldIds.includes('applicant_name'),
      )
      expect(step?.fieldIds).toContain(fieldId)
      const order = uiOrderOf(state.definition)
      const positions = step!.fieldIds.map((id) => order.indexOf(id))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('removes identity fields from every governed location', () => {
    const { state, fieldId } = addIdentityField('aadhaar')
    const withPreview = {
      ...state,
      previewFormData: {
        ...state.previewFormData,
        [fieldId]: {
          referenceToken: 'tok',
          identifierKind: 'AADHAAR',
          lastFour: '1234',
        },
      },
    }
    const removed = removeField(withPreview, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.state.definition.jsonSchema.properties).not.toHaveProperty(fieldId)
    expect(removed.state.definition.uiSchema).not.toHaveProperty(fieldId)
    expect(uiOrderOf(removed.state.definition)).not.toContain(fieldId)
    expect(removed.state.previewFormData).not.toHaveProperty(fieldId)
  })

  it('reorders identity fields with moveField', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const first = addField(state, 'aadhaar')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const aadhaarId = state.selectedFieldId!
    const second = addField(state, 'bank-account')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    state = second.state
    const bankId = state.selectedFieldId!
    const moved = moveField(state, bankId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const order = uiOrderOf(moved.state.definition)
    expect(order.indexOf(bankId)).toBeLessThan(order.indexOf(aadhaarId))
  })
})

describe('FB-D8 — schema admission', () => {
  it('admits exact Aadhaar / Mobile OTP / Bank schemas from templates', () => {
    for (const widgetType of ['aadhaar', 'mobile-otp', 'bank-account'] as const) {
      const { state, fieldId } = addIdentityField(widgetType)
      const schema = readSchema(state.definition, fieldId)
      expect(() => assertDefinitionIntegrity(state.definition)).not.toThrow()
      if (widgetType === 'aadhaar') expect(isAdmittedAadhaarSchema(schema)).toBe(true)
      if (widgetType === 'mobile-otp') {
        expect(isAdmittedMobileOtpSchema(schema)).toBe(true)
        expect(admitMobileOtpXDg20(schema)).toEqual({
          kind: 'valid',
          value: { otpChannels: ['sms'] },
        })
      }
      if (widgetType === 'bank-account') expect(isAdmittedBankAccountSchema(schema)).toBe(true)
    }
  })

  it('admits mobile-otp with absent x-dg20 and rejects other x-dg20 shapes', () => {
    const { state, fieldId } = addIdentityField('mobile-otp')
    const absent = withCorruptedSchema(state, fieldId, (schema) => {
      delete schema['x-dg20']
    })
    expect(isAdmittedMobileOtpSchema(readSchema(absent, fieldId))).toBe(true)
    expect(admitMobileOtpXDg20(readSchema(absent, fieldId)).kind).toBe('absent')

    const uppercase = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = { otpChannels: ['SMS'] }
    })
    expect(isAdmittedMobileOtpSchema(readSchema(uppercase, fieldId))).toBe(false)

    const extraKey = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = { otpChannels: ['sms'], verifyEmail: true }
    })
    expect(isAdmittedMobileOtpSchema(readSchema(extraKey, fieldId))).toBe(false)
  })

  it('rejects Aadhaar and bank-account x-dg20 business configuration', () => {
    for (const widgetType of ['aadhaar', 'bank-account'] as const) {
      const { state, fieldId } = addIdentityField(widgetType)
      const withX = withCorruptedSchema(state, fieldId, (schema) => {
        schema['x-dg20'] = { otpChannels: ['sms'] }
      })
      expect(() => assertDefinitionIntegrity(withX)).toThrow(AuthoringError)
    }
  })

  it('rejects hostile/accessor/sparse/extra members without invoking getters', () => {
    const { state, fieldId } = addIdentityField('aadhaar')
    let getterHits = 0
    const hostile = withCorruptedSchema(state, fieldId, (schema) => {
      const required: unknown[] = []
      Object.defineProperty(required, 'length', { value: 3 })
      Object.defineProperty(required, '0', {
        get() {
          getterHits += 1
          return 'referenceToken'
        },
        enumerable: true,
        configurable: true,
      })
      schema['required'] = required as never
    })
    expect(() => assertDefinitionIntegrity(hostile)).toThrow(AuthoringError)
    expect(getterHits).toBe(0)

    const extraProp = withCorruptedSchema(state, fieldId, (schema) => {
      const props = schema['properties'] as Record<string, unknown>
      props['rawAadhaar'] = { type: 'string' }
    })
    expect(isAdmittedAadhaarSchema(readSchema(extraProp, fieldId))).toBe(false)

    const { state: bankState, fieldId: bankId } = addIdentityField('bank-account')
    const wrongRequired = withCorruptedSchema(bankState, bankId, (schema) => {
      schema['required'] = ['accountNumber', 'verified']
    })
    expect(isAdmittedBankAccountSchema(readSchema(wrongRequired, bankId))).toBe(false)
  })
})

describe('FB-D8 — property Apply / Cancel / stale baseline', () => {
  it('Apply updates only labels/help/required and preserves admitted schema', () => {
    const { state, fieldId } = addIdentityField('mobile-otp')
    const before = structuredClone(readSchema(state.definition, fieldId))
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      labelEn: 'Citizen mobile',
      labelGu: 'નાગરિક મોબાઇલ',
      helpEn: 'Enter 10 digits',
      helpGu: '10 અંક દાખલ કરો',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual(before)
    expect(result.state.definition.meta.bilingual.labels[fieldId]).toEqual({
      en: 'Citizen mobile',
      gu: 'નાગરિક મોબાઇલ',
    })
    expect(result.state.definition.meta.bilingual.help[fieldId]).toEqual({
      en: 'Enter 10 digits',
      gu: '10 અંક દાખલ કરો',
    })
    expect(result.state.definition.jsonSchema.required).toContain(fieldId)
    expect(result.state.previewFormData).toEqual(state.previewFormData)
  })

  it('preserves compatible unrelated schema keywords on valid Apply', () => {
    const { state, fieldId } = addIdentityField('bank-account')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'IFSC-backed account'
    const annotatedState = { ...state, definition: annotated }
    const committed = readFieldConfiguration(annotated, fieldId)
    const result = applyConfig(annotatedState, fieldId, {
      ...committed,
      labelEn: 'Account',
      labelGu: 'ખાતું',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)['description']).toBe('IFSC-backed account')
  })

  it('stale_editor_draft rejects Apply when baseline diverged', () => {
    const added = addIdentityField('aadhaar')
    let state = added.state
    const fieldId = added.fieldId
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(state, fieldId, { ...baseline, required: true }, baseline)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const stale = applyConfig(state, fieldId, { ...baseline, labelEn: 'Stale' }, baseline)
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')
  })

  it('never clears previewFormData on Apply', () => {
    const { state, fieldId } = addIdentityField('bank-account')
    const withPreview = {
      ...state,
      previewFormData: {
        ...state.previewFormData,
        [fieldId]: {
          accountNumber: '001234',
          ifsc: 'SBIN0001234',
          accountHolderName: 'Citizen',
          verified: false,
        },
      },
    }
    const committed = readFieldConfiguration(withPreview.definition, fieldId)
    const result = applyConfig(withPreview, fieldId, {
      ...committed,
      labelEn: 'Bank',
      labelGu: 'બેંક',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.previewFormData[fieldId]).toEqual(withPreview.previewFormData[fieldId])
  })
})

describe('FB-D8 — Property/Bilingual draft isolation', () => {
  it('Property Apply preserves Bilingual-only error drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'add', widgetType: 'aadhaar' })
    const fieldId = ui.authoring.selectedFieldId!
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Token required', errorGu: '' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(ui.authoring.definition.jsonSchema.required).toContain(fieldId)
    expect(ui.editorDrafts[fieldId]?.errorDraft).toEqual({ en: 'Token required', gu: '' })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
  })

  it('Bilingual Apply preserves unsaved Property required draft', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'add', widgetType: 'mobile-otp' })
    const fieldId = ui.authoring.selectedFieldId!
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true, labelEn: 'Mobile OTP' },
    })
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Invalid mobile', errorGu: 'અમાન્ય મોબાઇલ' },
    })
    ui = authoringReducer(ui, { type: 'applyFieldBilingual', fieldId })
    expect(ui.editorDrafts[fieldId]?.draft.required).toBe(true)
    expect(ui.authoring.definition.jsonSchema.required).not.toContain(fieldId)
    expect(ui.authoring.definition.meta.bilingual.errors[fieldId]).toEqual({
      en: 'Invalid mobile',
      gu: 'અમાન્ય મોબાઇલ',
    })
  })
})

describe('FB-D8 — no sensitive values in FormDefinition', () => {
  it('templates and Apply never model raw Aadhaar, OTP, challengeId, or ETag', () => {
    for (const widgetType of ['aadhaar', 'mobile-otp', 'bank-account'] as const) {
      const { state, fieldId } = addIdentityField(widgetType)
      const serialized = JSON.stringify(state.definition)
      expect(serialized).not.toMatch(/challengeId|rawAadhaar|"otp"|ETag|If-Match/i)
      const schema = readSchema(state.definition, fieldId)
      expect(schema).not.toHaveProperty('challengeId')
      expect(JSON.stringify(schema)).not.toMatch(/rawAadhaar/)
    }
  })
})
