import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'
import { AUTOSAVE_SNAPSHOT_MAX_DEPTH } from '@citizen/form-renderer'

import {
  AuthoringError,
  D1_ADDABLE_COUNT,
  D1_ADDABLE_WIDGET_TYPES,
  D1_PENDING_COUNT,
  addField,
  allocateFieldId,
  assertDefinitionIntegrity,
  authoringReducer,
  cloneJsonSafe,
  cloneJsonSafeObject,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  getMoveCapability,
  getRemoveCapability,
  isD1AddableWidgetType,
  isExactLocalizedPair,
  moveField,
  removeField,
  selectField,
  setPreviewFormData,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function uiOrderOf(definition: FormDefinition): readonly string[] {
  return definition.uiSchema['ui:order'] as readonly string[]
}

function buildFixtureDefinition(): FormDefinition {
  return {
    serviceId: 'fixture-service',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['field_a', 'field_b'],
      additionalProperties: false,
      properties: {
        field_a: { type: 'string', maxLength: 10 },
        field_b: { type: 'number' },
      },
    },
    uiSchema: {
      'ui:order': ['field_a', 'field_b'],
      field_a: { 'ui:widget': 'text-short' },
      field_b: { 'ui:widget': 'number' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'field_a', widgetType: 'text-short' },
        { fieldId: 'field_b', widgetType: 'number' },
      ],
      bilingual: {
        labels: {
          field_a: { en: 'Field A', gu: 'ફિલ્ડ એ' },
          field_b: { en: 'Field B', gu: 'ફિલ્ડ બી' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [{ fieldId: 'field_b', cafAttribute: 'x.y', confidenceMin: 0.5 }],
      integrationBindings: [
        { fieldId: 'field_b', adapterId: 'adapter-1', param: 'p', direction: 'in' },
      ],
      workflowBindings: [{ fieldId: 'field_b', stage: 'review' }],
      progressiveSteps: [
        {
          stepId: 'step1',
          labelEn: 'Step 1',
          labelGu: 'પગલું 1',
          fieldIds: ['field_a', 'field_b'],
        },
      ],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-24T00:00:00Z' },
  }
}

function buildTwoStepFixtureDefinition(): FormDefinition {
  return {
    serviceId: 'fixture-two-step-service',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['field_a', 'field_c'],
      additionalProperties: false,
      properties: {
        field_a: { type: 'string', maxLength: 10 },
        field_b: { type: 'string', maxLength: 10 },
        field_c: { type: 'number' },
      },
    },
    uiSchema: {
      'ui:order': ['field_a', 'field_b', 'field_c'],
      field_a: { 'ui:widget': 'text-short' },
      field_b: { 'ui:widget': 'text-short' },
      field_c: { 'ui:widget': 'number' },
    },
    meta: {
      paletteProvenance: [
        { fieldId: 'field_a', widgetType: 'text-short' },
        { fieldId: 'field_b', widgetType: 'text-short' },
        { fieldId: 'field_c', widgetType: 'number' },
      ],
      bilingual: {
        labels: {
          field_a: { en: 'Field A', gu: 'ફિલ્ડ એ' },
          field_b: { en: 'Field B', gu: 'ફિલ્ડ બી' },
          field_c: { en: 'Field C', gu: 'ફિલ્ડ સી' },
        },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [
        {
          stepId: 'step1',
          labelEn: 'Step 1',
          labelGu: 'પગલું 1',
          fieldIds: ['field_a', 'field_b'],
        },
        {
          stepId: 'step2',
          labelEn: 'Step 2',
          labelGu: 'પગલું 2',
          fieldIds: ['field_c'],
        },
      ],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-24T00:00:00Z' },
  }
}

describe('FB-D1 authoring — session lifecycle and purity', () => {
  it('never mutates the baseline definition across a sequence of operations', () => {
    const snapshot = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION)

    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'text-short')
    expect(added.ok).toBe(true)
    if (added.ok) state = added.state
    const moved = moveField(state, state.selectedFieldId!, 'up')
    if (moved.ok) state = moved.state
    const removed = removeField(state, state.selectedFieldId!)
    if (removed.ok) state = removed.state

    expect(ILLUSTRATIVE_DRAFT_DEFINITION).toEqual(snapshot)
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION)).toBe(true)
  })

  it('creates a detached clone: definition reference differs from the source', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(state.definition).not.toBe(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(state.definition).toEqual(ILLUSTRATIVE_DRAFT_DEFINITION)
  })

  it('selects the first ui:order field by default', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(state.selectedFieldId).toBe(uiOrderOf(ILLUSTRATIVE_DRAFT_DEFINITION)[0])
  })

  it('throws AuthoringError for a malformed definition without mutating it', () => {
    const malformed = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
    ;(malformed.uiSchema as { 'ui:order': string[] })['ui:order'] = ['applicant_name']
    const beforeCopy = structuredClone(malformed)

    expect(() => createAuthoringSession(malformed)).toThrow(AuthoringError)
    expect(malformed).toEqual(beforeCopy)
  })
})

describe('FB-D1 authoring — field IDs', () => {
  it('allocates deterministic, collision-safe snake_case IDs with lowest available suffix', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const first = addField(state, 'text-short')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.selectedFieldId).toBe('text_short_1')
    state = first.state

    const second = addField(state, 'text-short')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.selectedFieldId).toBe('text_short_2')
  })

  it('allocateFieldId skips existing suffixes', () => {
    const definition = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
    ;(definition.jsonSchema.properties as Record<string, unknown>)['number_1'] = {
      type: 'number',
    }
    expect(allocateFieldId(definition, 'number')).toBe('number_2')
  })
})

describe('FB-D1 authoring — addable widget templates (exactly 9)', () => {
  it('exposes exactly 30 addable and 0 pending of 30 total palette widgets', () => {
    expect(D1_ADDABLE_COUNT).toBe(30)
    expect(D1_ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(D1_PENDING_COUNT).toBe(0)
    expect(D1_ADDABLE_COUNT + D1_PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
  })

  it('treats page-break as structural addable without a field template', () => {
    expect(isD1AddableWidgetType('family-repeater')).toBe(true)
    expect(getAuthoringTemplate('family-repeater')).toBeDefined()
    expect(isD1AddableWidgetType('page-break')).toBe(true)
    expect(getAuthoringTemplate('page-break')).toBeUndefined()

    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const before = JSON.stringify(state.definition)
    const result = addField(state, 'page-break')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('structural_widget_requires_boundary_action')
    }
    expect(JSON.stringify(state.definition)).toBe(before)
  })

  const DATA_WIDGETS = [
    'text-short',
    'text-long',
    'number',
    'currency-inr',
    'percentage',
    'gender',
    'yesno',
  ] as const
  const DISPLAY_WIDGETS = ['section-header', 'info-panel'] as const

  it.each(DATA_WIDGETS)(
    'template for %s produces a data-schema and ui:widget binding',
    (widgetType) => {
      const template = getAuthoringTemplate(widgetType)
      expect(template).toBeDefined()
      if (!template) return
      expect(template.uiBinding).toBe('widget')
      expect(template.producesData).toBe(true)
      const schema = template.buildSchema()
      expect(schema['type']).toBeDefined()
      const uiEntry = template.buildUiSchemaEntry()
      expect(uiEntry['ui:widget']).toBe(widgetType)
      expect(uiEntry['ui:field']).toBeUndefined()
    },
  )

  it.each(DISPLAY_WIDGETS)(
    'template for %s produces a display-schema and ui:field binding',
    (widgetType) => {
      const template = getAuthoringTemplate(widgetType)
      expect(template).toBeDefined()
      if (!template) return
      expect(template.uiBinding).toBe('field')
      expect(template.producesData).toBe(false)
      const schema = template.buildSchema()
      expect(schema['type']).toBe('object')
      expect(schema['properties']).toEqual({})
      const uiEntry = template.buildUiSchemaEntry()
      expect(uiEntry['ui:field']).toBe(widgetType)
      expect(uiEntry['ui:widget']).toBeUndefined()
    },
  )

  it('includes D1–D17 addable widgets in the authoritative set', () => {
    expect(new Set(D1_ADDABLE_WIDGET_TYPES)).toEqual(
      new Set([
        ...DATA_WIDGETS,
        ...DISPLAY_WIDGETS,
        'email',
        'full-name',
        'dob',
        'pincode',
        'aadhaar',
        'mobile-otp',
        'bank-account',
        'dropdown-master',
        'radio',
        'multiselect',
        'cascading-dropdown',
        'address-block',
        'photo-capture',
        'doc-upload',
        'digilocker-fetch',
        'fee-field',
        'signature-esign',
        'eligibility-declaration',
        'caf-prefill',
        'family-repeater',
        'page-break',
      ]),
    )
  })
})

describe('FB-D1 authoring — addField', () => {
  it('inserts immediately after the selected field', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const selected = selectField(state, 'applicant_name')
    const result = addField(selected, 'number')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = uiOrderOf(result.state.definition)
    const idx = order.indexOf('applicant_name')
    expect(order[idx + 1]).toBe(result.state.selectedFieldId)
  })

  it('appends to the end when no field is selected', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const noSelection = { ...state, selectedFieldId: null }
    const result = addField(noSelection, 'yesno')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = uiOrderOf(result.state.definition)
    expect(order[order.length - 1]).toBe(result.state.selectedFieldId)
  })

  it('never adds display-field IDs to required, and never seeds previewFormData for them', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = addField(state, 'section-header')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const required = (result.state.definition.jsonSchema['required'] as string[]) ?? []
    expect(required).not.toContain(result.state.selectedFieldId)
    expect(Object.keys(result.state.previewFormData)).not.toContain(result.state.selectedFieldId)
  })

  it('adds the new field to the progressive step containing the selected field, in order', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const selected = selectField(state, 'household_size')
    const result = addField(selected, 'currency-inr')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const householdStep = result.state.definition.meta.progressiveSteps.find(
      (step) => step.stepId === 'household',
    )
    expect(householdStep?.fieldIds).toContain(result.state.selectedFieldId)
    const order = uiOrderOf(result.state.definition)
    const stepOrderPositions = householdStep!.fieldIds.map((id) => order.indexOf(id))
    expect(stepOrderPositions).toEqual([...stepOrderPositions].sort((a, b) => a - b))
  })

  it('appends to the last progressive step when nothing is selected', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const noSelection = { ...state, selectedFieldId: null }
    const result = addField(noSelection, 'text-long')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lastStep =
      result.state.definition.meta.progressiveSteps[
        result.state.definition.meta.progressiveSteps.length - 1
      ]
    expect(lastStep?.fieldIds).toContain(result.state.selectedFieldId)
  })
})

describe('FB-D1 authoring — removeField', () => {
  it('cleans every governed location: properties, required, uiSchema, order, provenance, bilingual, bindings, steps, previewFormData', () => {
    const fixture = buildFixtureDefinition()
    let state = createAuthoringSession(fixture)
    state = setPreviewFormData(state, { field_a: 'x', field_b: 5 })

    const result = removeField(state, 'field_b')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { definition, previewFormData } = result.state

    expect(definition.jsonSchema.properties).not.toHaveProperty('field_b')
    expect(definition.jsonSchema['required']).not.toContain('field_b')
    expect(definition.uiSchema).not.toHaveProperty('field_b')
    expect(uiOrderOf(definition)).not.toContain('field_b')
    expect(definition.meta.paletteProvenance.some((p) => p.fieldId === 'field_b')).toBe(false)
    expect(definition.meta.bilingual.labels).not.toHaveProperty('field_b')
    expect(definition.meta.prefillBindings).toHaveLength(0)
    expect(definition.meta.integrationBindings).toHaveLength(0)
    expect(definition.meta.workflowBindings).toHaveLength(0)
    expect(definition.meta.progressiveSteps[0]?.fieldIds).not.toContain('field_b')
    expect(previewFormData).not.toHaveProperty('field_b')
  })

  it('selects the nearest remaining field after removal', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = removeField(state, 'gender')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = uiOrderOf(result.state.definition)
    expect(order).toContain(result.state.selectedFieldId)
    expect(result.state.selectedFieldId).not.toBe('gender')
  })

  it('refuses to remove the last remaining field', () => {
    const fixture = buildFixtureDefinition()
    let state = createAuthoringSession(fixture)
    const first = removeField(state, 'field_b')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state

    const second = removeField(state, 'field_a')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('cannot_remove_last_field')
    // Definition unchanged after the rejected removal.
    expect(state.definition.jsonSchema.properties).toHaveProperty('field_a')
  })
})

describe('FB-D1 authoring — moveField', () => {
  it('moves a field up within its progressive step, preserving formData', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    state = setPreviewFormData(state, { applicant_name: 'Foo' })
    const before = uiOrderOf(state.definition)
    const idx = before.indexOf('applicant_name')

    const result = moveField(state, 'applicant_name', 'up')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const after = uiOrderOf(result.state.definition)
    expect(after[idx - 1]).toBe('applicant_name')
    expect(after[idx]).toBe(before[idx - 1])
    expect(result.state.previewFormData).toEqual({ applicant_name: 'Foo' })
  })

  it('reorder does not touch jsonSchema.properties (formData/schema preserved)', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = moveField(state, 'applicant_name', 'down')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.jsonSchema.properties).toEqual(
      ILLUSTRATIVE_DRAFT_DEFINITION.jsonSchema.properties,
    )
  })

  it('disables and rejects moves that would cross a progressive-step boundary', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    // 'section_identity' is first in the 'identity' step: cannot move up (canvas/step boundary).
    const capability = getMoveCapability(state, 'section_identity')
    expect(capability.canMoveUp).toBe(false)

    const result = moveField(state, 'section_identity', 'up')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(['move_at_canvas_boundary', 'move_crosses_step_boundary']).toContain(result.error.code)
  })

  it('disables moving the last field in a step further down', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    // 'agree_terms' is last in the 'household' step and last overall.
    const capability = getMoveCapability(state, 'agree_terms')
    expect(capability.canMoveDown).toBe(false)

    const result = moveField(state, 'agree_terms', 'down')
    expect(result.ok).toBe(false)
  })
})

describe('FB-D1.1 authoring — empty progressive step protection', () => {
  it('rejects removing the last field of a progressive step without mutating state', () => {
    const fixture = buildTwoStepFixtureDefinition()
    const state = createAuthoringSession(fixture)
    const before = structuredClone(state.definition)

    const result = removeField(state, 'field_c')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('cannot_empty_progressive_step')
    // Referentially unchanged: no clone/mutation performed on rejection.
    expect(state.definition).toEqual(before)
  })

  it('does not silently delete or merge the emptied step — the step still exists afterwards', () => {
    const fixture = buildTwoStepFixtureDefinition()
    const state = createAuthoringSession(fixture)
    removeField(state, 'field_c')
    expect(state.definition.meta.progressiveSteps).toHaveLength(2)
    expect(state.definition.meta.progressiveSteps[1]?.fieldIds).toEqual(['field_c'])
  })

  it('getRemoveCapability reports final_step_field for the sole field of a step', () => {
    const fixture = buildTwoStepFixtureDefinition()
    const state = createAuthoringSession(fixture)
    expect(getRemoveCapability(state, 'field_c')).toEqual({
      canRemove: false,
      blockingReason: 'final_step_field',
    })
    expect(getRemoveCapability(state, 'field_a').canRemove).toBe(true)
  })

  it('getRemoveCapability reports final_form_field (not final_step_field) when only one field remains overall', () => {
    let state = createAuthoringSession(buildFixtureDefinition())
    const first = removeField(state, 'field_b')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    expect(getRemoveCapability(state, 'field_a')).toEqual({
      canRemove: false,
      blockingReason: 'final_form_field',
    })
  })

  it('getRemoveCapability returns a neutral result for a null or unknown fieldId', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(getRemoveCapability(state, null)).toEqual({ canRemove: false, blockingReason: null })
    expect(getRemoveCapability(state, 'does_not_exist')).toEqual({
      canRemove: false,
      blockingReason: null,
    })
  })
})

describe('FB-D1.1 authoring — strict JSON cloning (cloneJsonSafeObject / cloneJsonSafe)', () => {
  it('accepts a plain JSON-safe object, preserving Unicode content, as a detached clone', () => {
    const value = { name: 'ગુજરાત સરકાર', nested: { list: [1, 2, 3], flag: true, empty: null } }
    const result = cloneJsonSafeObject(value)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual(value)
    expect(result.value).not.toBe(value)
  })

  it('rejects functions', () => {
    const result = cloneJsonSafeObject({ fn: () => 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('unsafe_json_value')
    expect(result.error.reason).toBe('prohibited_type')
  })

  it('rejects symbol-keyed properties', () => {
    const obj: Record<string, unknown> = { a: 1 }
    ;(obj as Record<symbol, unknown>)[Symbol('x')] = 'y'
    const result = cloneJsonSafeObject(obj)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe('symbol_key')
  })

  it('rejects Map, Set, and Date instances', () => {
    expect(cloneJsonSafeObject({ m: new Map() }).ok).toBe(false)
    expect(cloneJsonSafeObject({ s: new Set() }).ok).toBe(false)
    expect(cloneJsonSafeObject({ d: new Date() }).ok).toBe(false)
  })

  it('rejects getter (accessor) properties', () => {
    const obj: Record<string, unknown> = {}
    Object.defineProperty(obj, 'x', { get: () => 1, enumerable: true, configurable: true })
    const result = cloneJsonSafeObject(obj)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe('accessor_property')
  })

  it('rejects a Proxy that hides a hostile accessor behind ownKeys/getOwnPropertyDescriptor traps', () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => ['x'],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, get: () => 1 }),
      },
    )
    const result = cloneJsonSafeObject(proxy)
    expect(result.ok).toBe(false)
  })

  it('rejects cyclic references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj['self'] = obj
    const result = cloneJsonSafeObject(obj)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe('cycle')
  })

  it('rejects values exceeding the documented depth bound', () => {
    const root: Record<string, unknown> = {}
    let cursor = root
    for (let i = 0; i < AUTOSAVE_SNAPSHOT_MAX_DEPTH + 5; i += 1) {
      const next: Record<string, unknown> = {}
      cursor['child'] = next
      cursor = next
    }
    const result = cloneJsonSafeObject(root)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe('depth_exceeded')
  })

  it('clones fields shaped like prototype-pollution payloads as ordinary data, never touching Object.prototype', () => {
    const beforeProto = Object.prototype
    // Object.create(null) avoids invoking Object.prototype's __proto__ setter
    // accessor on assignment — these become ordinary own data properties.
    const hostile = Object.create(null) as Record<string, unknown>
    hostile['__proto__'] = { polluted: true }
    hostile['constructor'] = { prototype: { polluted: true } }
    hostile['ok'] = true

    const result = cloneJsonSafeObject(hostile)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.getPrototypeOf(result.value)).toBe(null)
    expect(Object.prototype.hasOwnProperty.call(result.value, '__proto__')).toBe(true)
    expect((result.value as { __proto__: unknown })['__proto__']).toEqual({ polluted: true })
    expect(Object.prototype).toBe(beforeProto)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('cloneJsonSafe throws AuthoringError code unsafe_json_value carrying the machine-readable reason', () => {
    expect(() => cloneJsonSafe({ fn: () => 1 })).toThrow(AuthoringError)
    try {
      cloneJsonSafe({ fn: () => 1 })
      throw new Error('expected cloneJsonSafe to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      if (error instanceof AuthoringError) {
        expect(error.code).toBe('unsafe_json_value')
        expect(error.reason).toBe('prohibited_type')
      }
    }
  })

  it('cloneJsonSafe returns a detached, deeply-equal clone for JSON-safe input', () => {
    const value = { a: 1, b: { c: [1, 2, 3] } }
    const cloned = cloneJsonSafe(value)
    expect(cloned).toEqual(value)
    expect(cloned).not.toBe(value)
  })
})

describe('FB-D1.1 authoring — strengthened assertDefinitionIntegrity', () => {
  it('accepts a well-formed fixture definition', () => {
    expect(() => assertDefinitionIntegrity(buildFixtureDefinition())).not.toThrow()
  })

  it('accepts the illustrative baseline, including info-panel help', () => {
    expect(() => assertDefinitionIntegrity(ILLUSTRATIVE_DRAFT_DEFINITION)).not.toThrow()
    expect(ILLUSTRATIVE_DRAFT_DEFINITION.meta.bilingual.help['info_guidance']).toBeDefined()
  })

  it('rejects empty jsonSchema.properties', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.jsonSchema as unknown as { properties: Record<string, unknown> }).properties = {}
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects paletteProvenance widgetType outside the controlled palette', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.paletteProvenance as { fieldId: string; widgetType: string }[])[0]!.widgetType =
      'not-a-real-widget'
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a uiSchema entry using ui:field for a widget-registry type', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.uiSchema as Record<string, unknown>)['field_a'] = { 'ui:field': 'text-short' }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a uiSchema entry declaring both ui:widget and ui:field', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.uiSchema as Record<string, unknown>)['field_a'] = {
      'ui:widget': 'text-short',
      'ui:field': 'text-short',
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects required referencing an unknown field', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.jsonSchema as unknown as { required: string[] }).required = ['field_a', 'ghost_field']
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a duplicate required entry', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.jsonSchema as unknown as { required: string[] }).required = ['field_a', 'field_a']
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects required on a widget type that does not support required', () => {
    const def = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
    ;(def.jsonSchema as unknown as { required: string[] }).required = [
      ...(def.jsonSchema['required'] as string[]),
      'info_guidance',
    ]
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects bilingual.labels with an orphan key not present in properties', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.bilingual.labels as Record<string, unknown>)['ghost_field'] = {
      en: 'x',
      gu: 'y',
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects bilingual.help with an orphan key not present in properties', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.bilingual.help as Record<string, unknown>)['ghost_field'] = { en: 'x', gu: 'y' }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a padded (non-trimmed) bilingual.help value', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.bilingual.help as Record<string, unknown>)['field_a'] = {
      en: ' padded ',
      gu: 'ટેક્સ્ટ',
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a blank bilingual.errors value', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.bilingual.errors as Record<string, unknown>)['field_a'] = { en: '', gu: 'x' }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a progressive step with a blank stepId', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.progressiveSteps as { stepId: string }[])[0]!.stepId = '   '
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects duplicate progressive step ids', () => {
    const def = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION) as FormDefinition
    const steps = def.meta.progressiveSteps as { stepId: string }[]
    steps[1]!.stepId = steps[0]!.stepId
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects a progressive step with zero fieldIds', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.progressiveSteps as { fieldIds: string[] }[])[0]!.fieldIds = []
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects progressive steps that do not cover every property exactly once', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.progressiveSteps as { fieldIds: string[] }[])[0]!.fieldIds = ['field_a']
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })
})

describe('FB-D1.1 authoring — info-panel bilingual help', () => {
  it('adding info-panel atomically sets a nonblank EN/GU label and a nonblank EN/GU help entry', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = addField(state, 'info-panel')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const fieldId = result.state.selectedFieldId!
    const label = result.state.definition.meta.bilingual.labels[fieldId]
    const help = result.state.definition.meta.bilingual.help[fieldId]
    expect(label && label.en.trim().length > 0 && label.gu.trim().length > 0).toBe(true)
    expect(help && help.en.trim().length > 0 && help.gu.trim().length > 0).toBe(true)
    expect(() => assertDefinitionIntegrity(result.state.definition)).not.toThrow()
  })

  it('does not seed bilingual.help for widget types that do not require it', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const result = addField(state, 'text-short')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.bilingual.help).not.toHaveProperty(
      result.state.selectedFieldId!,
    )
  })

  it('removing an info-panel field cleans both its label and its help entry', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'info-panel')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!

    const removed = removeField(added.state, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.state.definition.meta.bilingual.labels).not.toHaveProperty(fieldId)
    expect(removed.state.definition.meta.bilingual.help).not.toHaveProperty(fieldId)
  })
})

describe('FB-D1.1 authoring — pure reducer', () => {
  it('rapid sequential add dispatches allocate text_short_1 then text_short_2, in order', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'text-short' })
    expect(uiState.authoring.selectedFieldId).toBe('text_short_1')
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'text-short' })
    expect(uiState.authoring.selectedFieldId).toBe('text_short_2')
  })

  it('is pure: two calls with identical (state, action) inputs produce structurally identical output', () => {
    const initial = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const action = { type: 'add', widgetType: 'number' } as const

    const first = authoringReducer(initial, action)
    const second = authoringReducer(initial, action)

    expect(second).toEqual(first)
    // The input state passed to the reducer itself must not have been mutated.
    expect(initial.authoring.definition).toEqual(ILLUSTRATIVE_DRAFT_DEFINITION)
  })

  it('derives a monotonically increasing announcement id across successive dispatches', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'text-short' })
    const firstId = uiState.announcement?.id
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'number' })
    const secondId = uiState.announcement?.id

    expect(firstId).toBeDefined()
    expect(secondId).toBeGreaterThan(firstId as number)
  })

  it('a rejected remove (cannot_empty_progressive_step) leaves authoring state referentially unchanged', () => {
    const initial = createAuthoringUiState(createAuthoringSession(buildTwoStepFixtureDefinition()))
    const next = authoringReducer(initial, { type: 'remove', fieldId: 'field_c' })

    expect(next.authoring).toBe(initial.authoring)
    expect(next.announcement?.key).toBe('announceCannotEmptyStep')
  })

  it('select and setPreviewFormData round-trip through the reducer', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, { type: 'select', fieldId: 'gender' })
    expect(uiState.authoring.selectedFieldId).toBe('gender')

    uiState = authoringReducer(uiState, {
      type: 'setPreviewFormData',
      formData: { applicant_name: 'Test User' },
    })
    expect(uiState.authoring.previewFormData).toEqual({ applicant_name: 'Test User' })
  })
})

describe('FB-D1.2 authoring — exact localized pairs', () => {
  it('isExactLocalizedPair accepts only exact {en, gu} nonblank unpadded strings', () => {
    expect(isExactLocalizedPair({ en: 'Hello', gu: 'નમસ્તે' })).toBe(true)
    expect(isExactLocalizedPair(Object.create(null))).toBe(false)
    const nullProto = Object.assign(Object.create(null), { en: 'a', gu: 'b' })
    expect(isExactLocalizedPair(nullProto)).toBe(true)

    expect(isExactLocalizedPair({ en: 'a', gu: 'b', hi: 'c' })).toBe(false)
    expect(isExactLocalizedPair({ en: 'a' })).toBe(false)
    expect(isExactLocalizedPair({ gu: 'b' })).toBe(false)
    expect(isExactLocalizedPair({ en: 'a', gu: 'b', __extra: true })).toBe(false)
    expect(isExactLocalizedPair(['a', 'b'])).toBe(false)
    expect(isExactLocalizedPair(null)).toBe(false)
    expect(isExactLocalizedPair('en')).toBe(false)
    expect(isExactLocalizedPair(1)).toBe(false)
    expect(isExactLocalizedPair({ en: ' padded ', gu: 'b' })).toBe(false)
    expect(isExactLocalizedPair({ en: '', gu: 'b' })).toBe(false)
  })

  it('rejects bilingual.labels pairs with unexpected keys', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.bilingual.labels as Record<string, unknown>)['field_a'] = {
      en: 'A',
      gu: 'એ',
      hi: 'अ',
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
    try {
      assertDefinitionIntegrity(def)
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('inconsistent_definition')
    }
  })

  it('rejects bilingual.help / bilingual.errors pairs missing gu or en', () => {
    const missingGu = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(missingGu.meta.bilingual.help as Record<string, unknown>)['field_a'] = { en: 'Help' }
    expect(() => assertDefinitionIntegrity(missingGu)).toThrow(AuthoringError)

    const missingEn = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(missingEn.meta.bilingual.errors as Record<string, unknown>)['field_a'] = { gu: 'ભૂલ' }
    expect(() => assertDefinitionIntegrity(missingEn)).toThrow(AuthoringError)
  })
})

describe('FB-D1.2 authoring — exact governed entry shapes', () => {
  it('rejects paletteProvenance entries with unexpected keys', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.paletteProvenance as Record<string, unknown>[])[0] = {
      fieldId: 'field_a',
      widgetType: 'text-short',
      extra: true,
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects progressiveSteps entries with unexpected keys', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.meta.progressiveSteps as Record<string, unknown>[])[0] = {
      stepId: 'step_1',
      labelEn: 'Step',
      labelGu: 'પગલું',
      fieldIds: ['field_a', 'field_b'],
      note: 'nope',
    }
    expect(() => assertDefinitionIntegrity(def)).toThrow(AuthoringError)
  })

  it('rejects blank/padded property IDs, provenance fieldIds, required IDs, and step fieldIds', () => {
    const paddedProperty = structuredClone(buildFixtureDefinition()) as FormDefinition
    const props = paddedProperty.jsonSchema['properties'] as Record<string, unknown>
    props[' field_a'] = props['field_a']
    delete props['field_a']
    expect(() => assertDefinitionIntegrity(paddedProperty)).toThrow(AuthoringError)

    const paddedProvenance = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(paddedProvenance.meta.paletteProvenance as { fieldId: string }[])[0]!.fieldId = 'field_a '
    expect(() => assertDefinitionIntegrity(paddedProvenance)).toThrow(AuthoringError)

    const paddedRequired = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(paddedRequired.jsonSchema as unknown as { required: string[] }).required = [' field_a']
    expect(() => assertDefinitionIntegrity(paddedRequired)).toThrow(AuthoringError)

    const paddedStepField = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(paddedStepField.meta.progressiveSteps as { fieldIds: string[] }[])[0]!.fieldIds = [
      'field_a ',
      'field_b',
    ]
    expect(() => assertDefinitionIntegrity(paddedStepField)).toThrow(AuthoringError)
  })

  it('rejects non-array paletteProvenance / progressiveSteps / required safely', () => {
    const badProvenance = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(badProvenance.meta as { paletteProvenance: unknown }).paletteProvenance = {
      fieldId: 'field_a',
    }
    expect(() => assertDefinitionIntegrity(badProvenance)).toThrow(AuthoringError)

    const badSteps = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(badSteps.meta as { progressiveSteps: unknown }).progressiveSteps = null
    expect(() => assertDefinitionIntegrity(badSteps)).toThrow(AuthoringError)

    const badRequired = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(badRequired.jsonSchema as Record<string, unknown>)['required'] = 'field_a'
    expect(() => assertDefinitionIntegrity(badRequired)).toThrow(AuthoringError)
  })

  it('still accepts legitimate extra uiSchema presentation keys beside the binding', () => {
    const def = structuredClone(buildFixtureDefinition()) as FormDefinition
    ;(def.uiSchema as Record<string, unknown>)['field_a'] = {
      'ui:widget': 'text-short',
      'ui:placeholder': 'Type here',
    }
    expect(() => assertDefinitionIntegrity(def)).not.toThrow()
  })
})

describe('FB-D1.2 authoring — typed integrity failure containment', () => {
  function expectInconsistentOnly(input: unknown): void {
    try {
      assertDefinitionIntegrity(input as FormDefinition)
      expect.unreachable('expected AuthoringError')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('inconsistent_definition')
      expect(String((error as AuthoringError).message)).not.toMatch(/\[object Object\]/)
    }
  }

  it('contains missing/null/wrong-type top-level sections as AuthoringError only', () => {
    expectInconsistentOnly(null)
    expectInconsistentOnly(undefined)
    expectInconsistentOnly('hostile')
    expectInconsistentOnly(42)
    expectInconsistentOnly([])
    expectInconsistentOnly({ jsonSchema: null, uiSchema: {}, meta: {} })
    expectInconsistentOnly({ jsonSchema: {}, uiSchema: null, meta: {} })
    expectInconsistentOnly({ jsonSchema: {}, uiSchema: {}, meta: null })
    expectInconsistentOnly({
      jsonSchema: { properties: { a: { type: 'string' } } },
      uiSchema: { 'ui:order': ['a'], a: { 'ui:widget': 'text-short' } },
      meta: { bilingual: null, paletteProvenance: [], progressiveSteps: [] },
    })
  })

  it('does not invoke accessors while inspecting bilingual pairs', () => {
    let accessed = false
    const pair = {}
    Object.defineProperty(pair, 'en', {
      enumerable: true,
      get() {
        accessed = true
        return 'x'
      },
    })
    Object.defineProperty(pair, 'gu', {
      enumerable: true,
      get() {
        accessed = true
        return 'y'
      },
    })
    expect(isExactLocalizedPair(pair)).toBe(false)
    expect(accessed).toBe(false)
  })
})
