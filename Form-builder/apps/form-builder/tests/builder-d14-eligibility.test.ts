import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedEligibilityDeclarationSchema,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
  isExactDeclarationId,
  isExactDeclarationText,
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

function readSchema(
  definition: FormDefinition,
  fieldId: string,
): Record<string, Record<string, unknown>> {
  const properties = definition.jsonSchema['properties'] as Record<string, Record<string, unknown>>
  return properties[fieldId]!
}

function addEligibility(
  declarationId = 'DECL_ELIG_V1',
  declarationTextEn = 'I confirm eligibility.',
  declarationTextGu = 'હું પાત્રતા પુષ્ટિ કરું છું.',
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'eligibility-declaration', {
    configured: {
      widgetType: 'eligibility-declaration',
      declarationId,
      declarationTextEn,
      declarationTextGu,
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add eligibility-declaration')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D14 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('eligibility-declaration')).toBe(true)
    expect(isConfiguredAddableWidgetType('eligibility-declaration')).toBe(true)
    expect(isAddableWidgetType('caf-prefill')).toBe(true)
    expect(isAddableWidgetType('family-repeater')).toBe(true)
    expect(isAddableWidgetType('page-break')).toBe(true)
    expect(getAuthoringTemplate('page-break')).toBeUndefined()
  })
})

describe('FB-D14 — exact template and configured-add', () => {
  it('eligibility-declaration template is configured ui:field with synchronized declarationId', () => {
    const template = getAuthoringTemplate('eligibility-declaration')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'eligibility-declaration' })
    if (template.addMode !== 'configured') return
    expect(
      template.buildSchema({
        widgetType: 'eligibility-declaration',
        declarationId: 'DECL_A',
        declarationTextEn: 'EN text',
        declarationTextGu: 'GU text',
      }),
    ).toEqual({
      type: 'object',
      properties: {
        declarationId: { type: 'string', const: 'DECL_A' },
        accepted: { type: 'boolean' },
        locale: { type: 'string', enum: ['en', 'gu'] },
        consentReceiptRef: { type: 'string', minLength: 1 },
      },
      required: ['declarationId', 'accepted', 'locale', 'consentReceiptRef'],
      additionalProperties: false,
      'x-dg20': { declarationId: 'DECL_A' },
    })
    expect(
      addField(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION), 'eligibility-declaration').ok,
    ).toBe(false)
  })

  it('Confirm seeds mandatory bilingual declaration help from configured texts', () => {
    const { state, fieldId } = addEligibility(
      'DECL_SEED',
      'English declaration body',
      'Gujarati declaration body',
    )
    expect(state.definition.meta.bilingual.help[fieldId]).toEqual({
      en: 'English declaration body',
      gu: 'Gujarati declaration body',
    })
    const schema = readSchema(state.definition, fieldId)
    expect(schema['x-dg20']).toEqual({ declarationId: 'DECL_SEED' })
    expect(
      (schema['properties'] as Record<string, Record<string, unknown>>)['declarationId'],
    ).toEqual({
      type: 'string',
      const: 'DECL_SEED',
    })
    expect(isAdmittedEligibilityDeclarationSchema(schema)).toBe(true)
  })

  it('pending configured-add validates focus order and blocks Validate/Save', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'eligibility-declaration' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'eligibility-declaration',
      declarationId: '',
      declarationTextEn: '',
      declarationTextGu: '',
      showValidation: false,
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('declarationId')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { declarationId: 'DECL_X' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('declarationTextEn')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { declarationTextEn: 'EN body' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('declarationTextGu')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { declarationTextGu: 'GU body' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ui.authoring.selectedFieldId).toBe('eligibility_declaration_1')
  })

  it('Cancel / Escape leaves definition unchanged', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    let ui = createAuthoringUiState(session)
    const before = JSON.stringify(ui.authoring.definition)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'eligibility-declaration' })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: {
        declarationId: 'DECL_X',
        declarationTextEn: 'EN',
        declarationTextGu: 'GU',
      },
    })
    ui = authoringReducer(ui, { type: 'cancelConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(JSON.stringify(ui.authoring.definition)).toBe(before)
  })
})

describe('FB-D14 — property Apply, stale baseline, bilingual isolation', () => {
  it('Apply synchronizes declarationId.const and x-dg20; rejects stale baseline', () => {
    const { state, fieldId } = addEligibility()
    const committed = readFieldConfiguration(state.definition, fieldId)
    const applied = applyConfig(state, fieldId, {
      ...committed,
      declarationId: 'DECL_V2',
      helpEn: committed.helpEn,
      helpGu: committed.helpGu,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const schema = readSchema(applied.state.definition, fieldId)
    expect(schema['x-dg20']).toEqual({ declarationId: 'DECL_V2' })
    expect(
      (schema['properties'] as Record<string, Record<string, unknown>>)['declarationId']?.['const'],
    ).toBe('DECL_V2')

    const stale = applyConfig(
      applied.state,
      fieldId,
      { ...committed, declarationId: 'DECL_STALE' },
      committed,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')
  })

  it('rejects padded or blank declarationId; preserves previewFormData', () => {
    expect(isExactDeclarationId('')).toBe(false)
    expect(isExactDeclarationId(' padded ')).toBe(false)
    expect(isExactDeclarationText('  ')).toBe(false)
    expect(isExactDeclarationText('ok')).toBe(true)

    const { state, fieldId } = addEligibility()
    const withPreview = {
      ...state,
      previewFormData: { [fieldId]: { accepted: false } },
    }
    const committed = readFieldConfiguration(withPreview.definition, fieldId)
    const applied = applyConfig(withPreview, fieldId, {
      ...committed,
      declarationId: 'DECL_KEEP',
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.state.previewFormData).toEqual({ [fieldId]: { accepted: false } })
  })

  it('Property/Bilingual dirty isolation and progressive-step sync', () => {
    let session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const enabled = authoringReducer(createAuthoringUiState(session), {
      type: 'enableProgressiveSteps',
    })
    session = enabled.authoring
    const added = addField(session, 'eligibility-declaration', {
      configured: {
        widgetType: 'eligibility-declaration',
        declarationId: 'DECL_STEP',
        declarationTextEn: 'EN step decl',
        declarationTextGu: 'GU step decl',
      },
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    expect(
      added.state.definition.meta.progressiveSteps.some((s) => s.fieldIds.includes(fieldId)),
    ).toBe(true)

    let ui = createAuthoringUiState(added.state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { declarationId: 'DECL_DIRTY' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Only EN' },
    })
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
  })

  it('remove/reorder preserves integrity', () => {
    const { state, fieldId } = addEligibility()
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
  })
})

describe('FB-D14 — hostile schema admission', () => {
  it('rejects missing properties, wrong required order, mismatched const, and hostile shapes', () => {
    expect(
      isAdmittedEligibilityDeclarationSchema({
        type: 'object',
        properties: {
          declarationId: { type: 'string', const: 'A' },
          accepted: { type: 'boolean' },
          locale: { type: 'string', enum: ['en', 'gu'] },
        },
        required: ['declarationId', 'accepted', 'locale'],
        additionalProperties: false,
        'x-dg20': { declarationId: 'A' },
      }),
    ).toBe(false)

    expect(
      isAdmittedEligibilityDeclarationSchema({
        type: 'object',
        properties: {
          declarationId: { type: 'string', const: 'A' },
          accepted: { type: 'boolean' },
          locale: { type: 'string', enum: ['en', 'gu'] },
          consentReceiptRef: { type: 'string', minLength: 1 },
        },
        required: ['accepted', 'declarationId', 'locale', 'consentReceiptRef'],
        additionalProperties: false,
        'x-dg20': { declarationId: 'A' },
      }),
    ).toBe(false)

    expect(
      isAdmittedEligibilityDeclarationSchema({
        type: 'object',
        properties: {
          declarationId: { type: 'string', const: 'A' },
          accepted: { type: 'boolean' },
          locale: { type: 'string', enum: ['en', 'gu'] },
          consentReceiptRef: { type: 'string', minLength: 1 },
        },
        required: ['declarationId', 'accepted', 'locale', 'consentReceiptRef'],
        additionalProperties: false,
        'x-dg20': { declarationId: 'B' },
      }),
    ).toBe(false)

    expect(
      isAdmittedEligibilityDeclarationSchema({
        type: 'object',
        properties: {
          declarationId: { type: 'string', const: 'A' },
          accepted: { type: 'boolean' },
          locale: { type: 'string', enum: ['gu', 'en'] },
          consentReceiptRef: { type: 'string', minLength: 1 },
        },
        required: ['declarationId', 'accepted', 'locale', 'consentReceiptRef'],
        additionalProperties: false,
        'x-dg20': { declarationId: 'A' },
      }),
    ).toBe(false)

    const hostile = {
      type: 'object',
      properties: {
        declarationId: { type: 'string', const: 'A' },
        accepted: { type: 'boolean' },
        locale: { type: 'string', enum: ['en', 'gu'] },
        consentReceiptRef: { type: 'string', minLength: 1 },
      },
      required: ['declarationId', 'accepted', 'locale', 'consentReceiptRef'],
      additionalProperties: false,
      'x-dg20': { declarationId: 'A' },
    }
    Object.defineProperty(hostile, 'toJSON', {
      get() {
        throw new Error('should not invoke')
      },
    })
    expect(isAdmittedEligibilityDeclarationSchema(hostile)).toBe(false)
  })

  it('counts remain exact after session replacement', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, {
      type: 'beginConfiguredAdd',
      widgetType: 'eligibility-declaration',
    })
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
  })
})
