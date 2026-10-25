import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import {
  PALETTE_WIDGET_COUNT,
  PHOTO_CAPTURE_ALLOWED_MIME_TYPES,
  PHOTO_CAPTURE_MAX_BYTES,
  PHOTO_CAPTURE_MAX_DIMENSION,
  PHOTO_CAPTURE_MIN_DIMENSION,
} from '@citizen/form-widgets'

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
  isAdmittedAddressBlockSchema,
  isAdmittedPhotoCaptureSchema,
  isAddableWidgetType,
  isFieldBilingualEditorDirty,
  isPropertyEditorDirty,
  moveField,
  readFieldConfiguration,
  removeField,
  updateFieldConfiguration,
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

function addImmediate(widgetType: 'address-block' | 'photo-capture') {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, widgetType)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`failed to add ${widgetType}`)
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D11 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(isAddableWidgetType('address-block')).toBe(true)
    expect(isAddableWidgetType('photo-capture')).toBe(true)
  })
})

describe('FB-D11 — exact templates and ui:field', () => {
  it('address-block is immediate ui:field with geography codes only', () => {
    const template = getAuthoringTemplate('address-block')!
    expect(template.addMode).toBe('immediate')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'address-block' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        stateCode: { type: 'string', minLength: 1 },
        districtCode: { type: 'string', minLength: 1 },
        talukaCode: { type: 'string', minLength: 1 },
        villageCode: { type: 'string', minLength: 1 },
      },
      required: ['stateCode'],
      additionalProperties: false,
    })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('photo-capture is immediate ui:field with Unit A policy constants', () => {
    const template = getAuthoringTemplate('photo-capture')!
    expect(template.addMode).toBe('immediate')
    expect(template.uiBinding).toBe('field')
    expect(template.buildUiSchemaEntry()).toEqual({ 'ui:field': 'photo-capture' })
    expect(template.buildSchema()).toEqual({
      type: 'object',
      properties: {
        objectRef: { type: 'string', minLength: 1 },
        mimeType: { type: 'string', enum: [...PHOTO_CAPTURE_ALLOWED_MIME_TYPES] },
        sizeBytes: { type: 'integer', minimum: 1, maximum: PHOTO_CAPTURE_MAX_BYTES },
        width: {
          type: 'integer',
          minimum: PHOTO_CAPTURE_MIN_DIMENSION,
          maximum: PHOTO_CAPTURE_MAX_DIMENSION,
        },
        height: {
          type: 'integer',
          minimum: PHOTO_CAPTURE_MIN_DIMENSION,
          maximum: PHOTO_CAPTURE_MAX_DIMENSION,
        },
        scanStatus: { type: 'string', enum: ['CLEAN'] },
      },
      required: ['objectRef', 'mimeType', 'sizeBytes', 'width', 'height', 'scanStatus'],
      additionalProperties: false,
    })
    expect(template.buildSchema()).not.toHaveProperty('x-dg20')
  })

  it('one-click Add works without configured input', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    for (const widgetType of ['address-block', 'photo-capture'] as const) {
      const result = addField(session, widgetType)
      expect(result.ok).toBe(true)
    }
  })
})

describe('FB-D11 — progressive-step sync', () => {
  it('adds address and photo into the selected progressive step', () => {
    const { state, fieldId } = addImmediate('address-block')
    const step = state.definition.meta.progressiveSteps.find((s) => s.fieldIds.includes(fieldId))
    expect(step).toBeDefined()
    const order = uiOrderOf(state.definition)
    const positions = step!.fieldIds.map((id) => order.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('FB-D11 — address schema admission and defaultStateCode Apply', () => {
  it('admits exact schemas and rejects hostile accessors', () => {
    const { state, fieldId } = addImmediate('address-block')
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedAddressBlockSchema(schema)).toBe(true)

    let getterHits = 0
    const hostile = structuredClone(state.definition) as FormDefinition
    const hostileSchema = readSchema(hostile, fieldId)
    const xdg20: Record<string, unknown> = {}
    Object.defineProperty(xdg20, 'defaultStateCode', {
      get() {
        getterHits += 1
        return 'GJ'
      },
      enumerable: true,
      configurable: true,
    })
    hostileSchema['x-dg20'] = xdg20
    expect(isAdmittedAddressBlockSchema(hostileSchema)).toBe(false)
    expect(getterHits).toBe(0)
    expect(() => assertDefinitionIntegrity(hostile)).toThrow(AuthoringError)
  })

  it('Apply writes/removes defaultStateCode; stale baseline rejects; bilingual survives', () => {
    const { state, fieldId } = addImmediate('address-block')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Address'
    const annotatedState = { ...state, definition: annotated }
    const committed = readFieldConfiguration(annotated, fieldId)

    const applied = applyConfig(annotatedState, fieldId, {
      ...committed,
      defaultStateCode: 'GJ',
      required: true,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(readSchema(applied.state.definition, fieldId)).toEqual({
      type: 'object',
      description: 'Address',
      properties: {
        stateCode: { type: 'string', minLength: 1 },
        districtCode: { type: 'string', minLength: 1 },
        talukaCode: { type: 'string', minLength: 1 },
        villageCode: { type: 'string', minLength: 1 },
      },
      required: ['stateCode'],
      additionalProperties: false,
      'x-dg20': { defaultStateCode: 'GJ' },
    })

    const cleared = applyConfig(applied.state, fieldId, {
      ...readFieldConfiguration(applied.state.definition, fieldId),
      defaultStateCode: '',
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(readSchema(cleared.state.definition, fieldId)).not.toHaveProperty('x-dg20')

    const padded = applyConfig(state, fieldId, { ...committed, defaultStateCode: ' GJ ' })
    expect(padded.ok).toBe(false)

    const first = applyConfig(state, fieldId, { ...committed, defaultStateCode: 'MH' }, committed)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const stale = applyConfig(
      first.state,
      fieldId,
      { ...committed, defaultStateCode: 'KA' },
      committed,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.code).toBe('stale_editor_draft')

    let ui = createAuthoringUiState(first.state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId,
      patch: { errorEn: 'Pick address', errorGu: '' },
    })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    expect(isFieldBilingualEditorDirty(ui, fieldId)).toBe(true)
    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(ui.editorDrafts[fieldId]?.errorDraft).toEqual({ en: 'Pick address', gu: '' })
  })
})

describe('FB-D11 — photo schema admission and locked policy', () => {
  it('admits photo schema and rejects x-dg20 / policy mismatch / hostile shapes', () => {
    const { state, fieldId } = addImmediate('photo-capture')
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedPhotoCaptureSchema(schema)).toBe(true)

    const withX = structuredClone(state.definition) as FormDefinition
    readSchema(withX, fieldId)['x-dg20'] = { unexpected: true }
    expect(isAdmittedPhotoCaptureSchema(readSchema(withX, fieldId))).toBe(false)

    const wrongMime = structuredClone(state.definition) as FormDefinition
    ;(readSchema(wrongMime, fieldId)['properties'] as Record<string, Record<string, unknown>>)[
      'mimeType'
    ] = { type: 'string', enum: ['image/gif'] }
    expect(isAdmittedPhotoCaptureSchema(readSchema(wrongMime, fieldId))).toBe(false)

    let getterHits = 0
    const hostile = structuredClone(state.definition) as FormDefinition
    const props = readSchema(hostile, fieldId)['properties'] as Record<string, unknown>
    Object.defineProperty(props, 'objectRef', {
      get() {
        getterHits += 1
        return { type: 'string', minLength: 1 }
      },
      enumerable: true,
      configurable: true,
    })
    expect(isAdmittedPhotoCaptureSchema(readSchema(hostile, fieldId))).toBe(false)
    expect(getterHits).toBe(0)
  })

  it('Apply preserves admitted photo schema without File/Blob/base64', () => {
    const { state, fieldId } = addImmediate('photo-capture')
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      labelEn: 'Applicant photo',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema).not.toHaveProperty('x-dg20')
    expect(JSON.stringify(schema)).not.toMatch(/data:|blob:|base64|File|Blob/i)
    expect(result.state.previewFormData).not.toMatchObject({
      [fieldId]: expect.anything(),
    })
  })
})

describe('FB-D11 — remove/reorder and locale/session counts', () => {
  it('can remove and reorder after adding address and photo', () => {
    const first = addImmediate('address-block')
    let state = first.state
    const second = addField(state, 'photo-capture')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    state = second.state
    const photoId = state.selectedFieldId!
    const moved = moveField(state, photoId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const removed = removeField(moved.state, first.fieldId)
    expect(removed.ok).toBe(true)
  })

  it('counts remain 22/8/30 after session replacement', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const added = addField(ui.authoring, 'address-block')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    ui = { ...ui, authoring: added.state }
    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
  })
})
