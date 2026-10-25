import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES, PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  AuthoringError,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isAdmittedDigiLockerSchema,
  isAdmittedDocUploadSchema,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  parseAllowedMimeTypesText,
  parseMaxFileSizeBytesDraft,
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

function addDocUpload(
  options: {
    allowedMimeTypes?: readonly string[]
    maxFileSizeBytes?: number
  } = {},
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'doc-upload', {
    configured: {
      widgetType: 'doc-upload',
      allowedMimeTypes: options.allowedMimeTypes ?? ['application/pdf', 'image/jpeg'],
      maxFileSizeBytes: options.maxFileSizeBytes ?? 1_048_576,
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add doc-upload')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

function addDigiLocker(code = 'AADHAAR') {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'digilocker-fetch', {
    configured: {
      widgetType: 'digilocker-fetch',
      digiLockerDocumentTypeCode: code,
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add digilocker-fetch')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D12 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('doc-upload')).toBe(true)
    expect(isAddableWidgetType('digilocker-fetch')).toBe(true)
    expect(isConfiguredAddableWidgetType('doc-upload')).toBe(true)
    expect(isConfiguredAddableWidgetType('digilocker-fetch')).toBe(true)
    expect(isConfiguredAddableWidgetType('address-block')).toBe(false)
  })
})

describe('FB-D12 — MIME line parser and byte-size drafts', () => {
  it('admits one MIME per line and ignores only a trailing newline empty line', () => {
    expect(parseAllowedMimeTypesText('application/pdf\nimage/png\n')).toEqual({
      ok: true,
      allowedMimeTypes: ['application/pdf', 'image/png'],
    })
  })

  it('rejects blank, padded, duplicate, and empty drafts without silent repair', () => {
    expect(parseAllowedMimeTypesText('').ok).toBe(false)
    expect(parseAllowedMimeTypesText(' application/pdf').ok).toBe(false)
    expect(parseAllowedMimeTypesText('application/pdf\n\nimage/png').ok).toBe(false)
    expect(parseAllowedMimeTypesText('application/pdf\napplication/pdf').ok).toBe(false)
  })

  it('parses exact positive byte sizes within the global 25 MiB cap', () => {
    expect(parseMaxFileSizeBytesDraft('1048576')).toEqual({
      ok: true,
      maxFileSizeBytes: 1_048_576,
    })
    expect(parseMaxFileSizeBytesDraft(String(DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES))).toEqual({
      ok: true,
      maxFileSizeBytes: DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES,
    })
    expect(parseMaxFileSizeBytesDraft('0').ok).toBe(false)
    expect(parseMaxFileSizeBytesDraft('01').ok).toBe(false)
    expect(parseMaxFileSizeBytesDraft('+1').ok).toBe(false)
    expect(parseMaxFileSizeBytesDraft('1.5').ok).toBe(false)
    expect(parseMaxFileSizeBytesDraft('1e6').ok).toBe(false)
    expect(parseMaxFileSizeBytesDraft(String(DOCUMENT_UPLOAD_GLOBAL_MAX_BYTES + 1)).ok).toBe(false)
  })
})

describe('FB-D12 — exact templates and configured-add Confirm', () => {
  it('doc-upload template is configured ui:field with synchronized policy', () => {
    const template = getAuthoringTemplate('doc-upload')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'doc-upload' })
    if (template.addMode !== 'configured') return
    const schema = template.buildSchema({
      widgetType: 'doc-upload',
      allowedMimeTypes: ['application/pdf', 'image/jpeg'],
      maxFileSizeBytes: 2_097_152,
    })
    expect(schema).toEqual({
      type: 'object',
      properties: {
        objectRef: { type: 'string', minLength: 1 },
        fileName: { type: 'string', minLength: 1 },
        mimeType: { type: 'string', enum: ['application/pdf', 'image/jpeg'] },
        sizeBytes: { type: 'integer', minimum: 1, maximum: 2_097_152 },
        scanStatus: { type: 'string', enum: ['CLEAN'] },
      },
      required: ['objectRef', 'fileName', 'mimeType', 'sizeBytes', 'scanStatus'],
      additionalProperties: false,
      'x-dg20': {
        allowedMimeTypes: ['application/pdf', 'image/jpeg'],
        maxFileSizeBytes: 2_097_152,
      },
    })
    expect(addField(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION), 'doc-upload').ok).toBe(
      false,
    )
  })

  it('digilocker-fetch template synchronizes const and x-dg20', () => {
    const template = getAuthoringTemplate('digilocker-fetch')!
    expect(template.addMode).toBe('configured')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'digilocker-fetch' })
    if (template.addMode !== 'configured') return
    expect(
      template.buildSchema({
        widgetType: 'digilocker-fetch',
        digiLockerDocumentTypeCode: 'PAN',
      }),
    ).toEqual({
      type: 'object',
      properties: {
        issuerSignedRef: { type: 'string', minLength: 1 },
        documentTypeCode: { type: 'string', const: 'PAN' },
      },
      required: ['issuerSignedRef', 'documentTypeCode'],
      additionalProperties: false,
      'x-dg20': { digiLockerDocumentTypeCode: 'PAN' },
    })
  })

  it('configured-add Confirm is atomic and focuses first invalid control', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'doc-upload' })
    expect(ui.pendingConfiguredAdd).toEqual({
      widgetType: 'doc-upload',
      allowedMimeTypesText: '',
      maxFileSizeBytes: '',
      showValidation: false,
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd?.showValidation).toBe(true)
    expect(ui.pendingFocusConfiguredAdd?.control).toBe('allowedMimeTypesText')

    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { allowedMimeTypesText: 'application/pdf', maxFileSizeBytes: '1048576' },
    })
    ui = authoringReducer(ui, { type: 'confirmConfiguredAdd' })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(ui.authoring.selectedFieldId).toMatch(/^doc_upload_/)
    const schema = readSchema(ui.authoring.definition, ui.authoring.selectedFieldId!)
    expect(isAdmittedDocUploadSchema(schema)).toBe(true)
  })

  it('blocks second configured Add and clears pending on session replacement', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'digilocker-fetch' })
    const before = structuredClone(ui.pendingConfiguredAdd)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'doc-upload' })
    expect(ui.pendingConfiguredAdd).toEqual(before)
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
  })

  it('blocks Validate while configured-add is pending', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'doc-upload' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
  })
})

describe('FB-D12 — schema admission and hostile values', () => {
  it('admits synchronized doc-upload and digilocker schemas', () => {
    const doc = addDocUpload()
    expect(isAdmittedDocUploadSchema(readSchema(doc.state.definition, doc.fieldId))).toBe(true)
    const digi = addDigiLocker('DL-CARD')
    expect(isAdmittedDigiLockerSchema(readSchema(digi.state.definition, digi.fieldId))).toBe(true)
  })

  it('rejects MIME/x-dg20 desync and hostile accessors without getter invocation', () => {
    const { state, fieldId } = addDocUpload()
    const schema = structuredClone(readSchema(state.definition, fieldId)) as Record<string, unknown>
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    properties['mimeType'] = { type: 'string', enum: ['image/png'] }
    expect(isAdmittedDocUploadSchema(schema)).toBe(false)

    let getterHits = 0
    const hostile = {
      type: 'object',
      get properties() {
        getterHits += 1
        return {}
      },
    }
    expect(isAdmittedDocUploadSchema(hostile)).toBe(false)
    expect(getterHits).toBe(0)

    const digi = addDigiLocker('AADHAAR')
    const digiSchema = structuredClone(readSchema(digi.state.definition, digi.fieldId)) as Record<
      string,
      unknown
    >
    const digiProps = digiSchema['properties'] as Record<string, Record<string, unknown>>
    digiProps['documentTypeCode'] = { type: 'string', const: 'OTHER' }
    expect(isAdmittedDigiLockerSchema(digiSchema)).toBe(false)
  })
})

describe('FB-D12 — property Apply / Cancel / isolation', () => {
  it('Apply rewrites MIME enum, size max, and x-dg20 atomically', () => {
    const { state, fieldId } = addDocUpload()
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...baseline,
      allowedMimeTypesText: 'application/pdf\nimage/png',
      maxFileSizeBytes: '2097152',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['x-dg20']).toEqual({
      allowedMimeTypes: ['application/pdf', 'image/png'],
      maxFileSizeBytes: 2_097_152,
    })
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    expect(properties['mimeType']?.['enum']).toEqual(['application/pdf', 'image/png'])
    expect(properties['sizeBytes']?.['maximum']).toBe(2_097_152)
  })

  it('Apply synchronizes DigiLocker const and x-dg20; stale draft is rejected', () => {
    const { state, fieldId } = addDigiLocker('AADHAAR')
    const baseline = readFieldConfiguration(state.definition, fieldId)
    const first = applyConfig(state, fieldId, {
      ...baseline,
      digiLockerDocumentTypeCode: 'PAN',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const schema = readSchema(first.state.definition, fieldId)
    expect(schema['x-dg20']).toEqual({ digiLockerDocumentTypeCode: 'PAN' })
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    expect(properties['documentTypeCode']?.['const']).toBe('PAN')

    const stale = applyConfig(
      first.state,
      fieldId,
      { ...baseline, digiLockerDocumentTypeCode: 'DL' },
      baseline,
    )
    expect(stale.ok).toBe(false)
    if (!stale.ok) {
      expect(stale.error).toBeInstanceOf(AuthoringError)
      expect(stale.error.code).toBe('stale_editor_draft')
    }
  })

  it('Property and Bilingual drafts stay isolated', () => {
    const { state, fieldId } = addDocUpload()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { maxFileSizeBytes: '2048' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(false)
  })

  it('remove/reorder and progressive steps stay intact', () => {
    const first = addDocUpload()
    const second = addField(first.state, 'digilocker-fetch', {
      configured: {
        widgetType: 'digilocker-fetch',
        digiLockerDocumentTypeCode: 'AADHAAR',
      },
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const digiId = second.state.selectedFieldId!
    const moved = moveField(second.state, digiId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const order = uiOrderOf(moved.state.definition)
    expect(order.indexOf(digiId)).toBeLessThan(order.indexOf(first.fieldId))
    const removed = removeField(moved.state, first.fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    assertDefinitionIntegrity(removed.state.definition)
  })

  it('counts remain exact after session replacement', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'doc-upload' })
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ui.pendingConfiguredAdd).toBeNull()
  })
})
