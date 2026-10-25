import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  FEE_AMOUNT_MINOR_MAX,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedFeeFieldSchema,
  isAdmittedSignatureEsignSchema,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
  isExactFeeRuleId,
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

function addFee(feeRuleId = 'service-fee-v1') {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'fee-field', {
    configured: { widgetType: 'fee-field', feeRuleId },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add fee-field')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

function addSignature() {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'signature-esign')
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add signature-esign')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D13 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('fee-field')).toBe(true)
    expect(isAddableWidgetType('signature-esign')).toBe(true)
    expect(isConfiguredAddableWidgetType('fee-field')).toBe(true)
    expect(isConfiguredAddableWidgetType('signature-esign')).toBe(false)
  })
})

describe('FB-D13 — exact templates and configured-add', () => {
  it('fee-field template is configured ui:field with synchronized feeRuleId', () => {
    const template = getAuthoringTemplate('fee-field')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'fee-field' })
    if (template.addMode !== 'configured') return
    expect(template.buildSchema({ widgetType: 'fee-field', feeRuleId: 'rule-a' })).toEqual({
      type: 'object',
      properties: {
        feeRuleId: { type: 'string', const: 'rule-a' },
        contextRevision: { type: 'string', minLength: 1 },
        currency: { type: 'string', const: 'INR' },
        amountMinor: {
          type: 'integer',
          minimum: 0,
          maximum: FEE_AMOUNT_MINOR_MAX,
        },
        quoteRef: { type: 'string', minLength: 1 },
      },
      required: ['feeRuleId', 'contextRevision', 'currency', 'amountMinor', 'quoteRef'],
      additionalProperties: false,
      'x-dg20': { feeRuleId: 'rule-a' },
    })
    expect(addField(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION), 'fee-field').ok).toBe(
      false,
    )
  })

  it('signature-esign is immediate ui:field with no x-dg20', () => {
    const template = getAuthoringTemplate('signature-esign')!
    expect(template.addMode).toBe('immediate')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'signature-esign' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        contextRevision: { type: 'string', minLength: 1 },
        signedArtefactRef: { type: 'string', minLength: 1 },
      },
      required: ['contextRevision', 'signedArtefactRef'],
      additionalProperties: false,
    })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('fee configured-add Confirm focuses feeRuleId then adds atomically', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'fee-field' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'fee-field',
      feeRuleId: '',
      showValidation: false,
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('feeRuleId')
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { feeRuleId: 'fee-rule-1' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    const schema = readSchema(ui.authoring.definition, ui.authoring.selectedFieldId!)
    expect(isAdmittedFeeFieldSchema(schema)).toBe(true)
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
  })

  it('rejects padded feeRuleId drafts', () => {
    expect(isExactFeeRuleId('')).toBe(false)
    expect(isExactFeeRuleId(' rule')).toBe(false)
    expect(isExactFeeRuleId('rule ')).toBe(false)
    expect(isExactFeeRuleId('rule-a')).toBe(true)
  })
})

describe('FB-D13 — admission and Apply', () => {
  it('admits fee/signature schemas and rejects hostile accessors', () => {
    const fee = addFee()
    expect(isAdmittedFeeFieldSchema(readSchema(fee.state.definition, fee.fieldId))).toBe(true)
    const sig = addSignature()
    expect(isAdmittedSignatureEsignSchema(readSchema(sig.state.definition, sig.fieldId))).toBe(true)

    let getterHits = 0
    const hostile = {
      type: 'object',
      get properties() {
        getterHits += 1
        return {}
      },
    }
    expect(isAdmittedFeeFieldSchema(hostile)).toBe(false)
    expect(isAdmittedSignatureEsignSchema(hostile)).toBe(false)
    expect(getterHits).toBe(0)

    const feeBad = structuredClone(readSchema(fee.state.definition, fee.fieldId)) as Record<
      string,
      unknown
    >
    feeBad['x-dg20'] = { feeRuleId: 'other' }
    expect(isAdmittedFeeFieldSchema(feeBad)).toBe(false)

    const sigBad = structuredClone(readSchema(sig.state.definition, sig.fieldId)) as Record<
      string,
      unknown
    >
    sigBad['x-dg20'] = { feeRuleId: 'nope' }
    expect(isAdmittedSignatureEsignSchema(sigBad)).toBe(false)
  })

  it('fee Apply synchronizes const and x-dg20; stale draft rejected', () => {
    const { state, fieldId } = addFee('old-rule')
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(state, fieldId, { ...baseline, feeRuleId: 'new-rule' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const schema = readSchema(first.state.definition, fieldId)
    expect(schema['x-dg20']).toEqual({ feeRuleId: 'new-rule' })
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    expect(properties['feeRuleId']?.['const']).toBe('new-rule')
    expect(properties['amountMinor']?.['maximum']).toBe(FEE_AMOUNT_MINOR_MAX)

    const stale = applyConfig(first.state, fieldId, { ...baseline, feeRuleId: 'stale' }, baseline)
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.error.code).toBe('stale_editor_draft')
  })

  it('signature required toggle preserves admitted schema', () => {
    const { state, fieldId } = addSignature()
    const baseline = readFieldConfiguration(state.definition, fieldId)
    expect(baseline.required).toBe(false)
    const result = applyConfig(state, fieldId, { ...baseline, required: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readFieldConfiguration(result.state.definition, fieldId).required).toBe(true)
    expect(isAdmittedSignatureEsignSchema(readSchema(result.state.definition, fieldId))).toBe(true)
  })

  it('Property/Bilingual isolation, remove/reorder, and session counts', () => {
    const fee = addFee()
    let ui = createAuthoringUiState(fee.state)
    ui = authoringReducer(ui, { type: 'select', fieldId: fee.fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: fee.fieldId,
      patch: { feeRuleId: 'edited' },
    })
    expect(isPropertyEditorDirty(ui, fee.fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fee.fieldId)).toBe(false)

    const withSig = addField(fee.state, 'signature-esign')
    expect(withSig.ok).toBe(true)
    if (!withSig.ok) return
    const sigId = withSig.state.selectedFieldId!
    const moved = moveField(withSig.state, sigId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const removed = removeField(moved.state, fee.fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    assertDefinitionIntegrity(removed.state.definition)

    ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'fee-field' })
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
  })

  it('amountMinor bounds use Number.MAX_SAFE_INTEGER', () => {
    expect(FEE_AMOUNT_MINOR_MAX).toBe(Number.MAX_SAFE_INTEGER)
    expect(FEE_AMOUNT_MINOR_MAX).toBe(9007199254740991)
  })
})
