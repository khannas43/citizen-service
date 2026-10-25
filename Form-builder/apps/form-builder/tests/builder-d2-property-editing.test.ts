import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'

import {
  AuthoringError,
  FIELD_ADDABLE_WIDGET_TYPES,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  configurationToDraft,
  createAuthoringSession,
  createAuthoringUiState,
  isConfigurationDirty,
  isConfiguredAddableWidgetType,
  isEditableWidgetType,
  isFieldEditorDirty,
  moveField,
  previewValueMayBeInvalid,
  readFieldConfiguration,
  removeField,
  schemaHasOwnKey,
  setPreviewFormData,
  updateFieldConfiguration,
  validateFieldConfigurationDraft,
  type ConfiguredAddTemplateInput,
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

function requiredOf(definition: FormDefinition): readonly string[] {
  const required = definition.jsonSchema['required']
  return Array.isArray(required) ? (required as string[]) : []
}

/** Fixture with an editable text-short field carrying an unrelated schema key and bindings on the other field. */
function buildEditableFixtureDefinition(): FormDefinition {
  return {
    serviceId: 'fixture-editable-service',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['field_a'],
      additionalProperties: false,
      properties: {
        field_a: {
          type: 'string',
          maxLength: 40,
          description: 'Do-not-touch unrelated schema annotation',
        },
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

/** Fixture with a legacy literal page-break field (no property editor; not Builder-generated). */
function buildPendingWidgetFixtureDefinition(): FormDefinition {
  return {
    serviceId: 'fixture-page-break-service',
    version: 1,
    status: 'draft',
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        page_break_ref: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    uiSchema: {
      'ui:order': ['page_break_ref'],
      page_break_ref: { 'ui:field': 'page-break' },
    },
    meta: {
      paletteProvenance: [{ fieldId: 'page_break_ref', widgetType: 'page-break' }],
      bilingual: {
        labels: { page_break_ref: { en: 'Page break', gu: 'Page break' } },
        help: {},
        errors: {},
      },
      prefillBindings: [],
      integrationBindings: [],
      workflowBindings: [],
      progressiveSteps: [],
    },
    audit: { createdBy: 'test', createdAt: '2026-07-24T00:00:00Z' },
  }
}

function configuredAddForRoundTrip(widgetType: string): ConfiguredAddTemplateInput | undefined {
  if (!isConfiguredAddableWidgetType(widgetType)) {
    return undefined
  }
  switch (widgetType) {
    case 'dropdown-master':
    case 'radio':
      return { widgetType, masterListId: 'demo-master-list' }
    case 'multiselect':
      return { widgetType: 'multiselect', masterListId: 'demo-master-list' }
    case 'cascading-dropdown':
      return {
        widgetType: 'cascading-dropdown',
        parentMasterListId: 'demo-parent-list',
        childMasterListId: 'demo-child-list',
      }
    case 'doc-upload':
      return {
        widgetType: 'doc-upload',
        allowedMimeTypes: ['application/pdf'],
        maxFileSizeBytes: 1_048_576,
      }
    case 'digilocker-fetch':
      return {
        widgetType: 'digilocker-fetch',
        digiLockerDocumentTypeCode: 'AADHAAR',
      }
    case 'fee-field':
      return {
        widgetType: 'fee-field',
        feeRuleId: 'service-fee-v1',
      }
    case 'eligibility-declaration':
      return {
        widgetType: 'eligibility-declaration',
        declarationId: 'DECL_ELIG_V1',
        declarationTextEn: 'I confirm eligibility.',
        declarationTextGu: 'હું પાત્રતા પુષ્ટિ કરું છું.',
      }
    case 'caf-prefill':
      return {
        widgetType: 'caf-prefill',
        cafAttribute: 'citizen.fullName',
        confidenceMin: 0.8,
      }
    case 'family-repeater':
      return {
        widgetType: 'family-repeater',
        maxItems: 5,
        initialMember: {
          widgetType: 'text-short',
          labelEn: 'Member name',
          labelGu: 'સભ્યનું નામ',
          required: false,
        },
      }
    default: {
      const _exhaustive: never = widgetType
      void _exhaustive
      return undefined
    }
  }
}

describe('FB-D2 authoring — round-trip property read for all field-addable widgets', () => {
  it.each(FIELD_ADDABLE_WIDGET_TYPES)(
    'readFieldConfiguration + configurationToDraft + validateFieldConfigurationDraft round-trips a freshly added %s',
    (widgetType) => {
      const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
      const configured = configuredAddForRoundTrip(widgetType)
      const added = configured
        ? addField(state, widgetType, { configured })
        : addField(state, widgetType)
      expect(added.ok).toBe(true)
      if (!added.ok) return
      const fieldId = added.state.selectedFieldId!

      if (!isEditableWidgetType(widgetType)) {
        return
      }

      const committed = readFieldConfiguration(added.state.definition, fieldId)
      expect(committed.widgetType).toBe(widgetType)

      const draft = configurationToDraft(committed)
      expect(draft).toEqual(committed)
      expect(draft).not.toBe(committed)

      const validation = validateFieldConfigurationDraft(draft)
      expect(validation.ok).toBe(true)
      if (!validation.ok) return
      expect(validation.configuration).toEqual(committed)
    },
  )
})

describe('FB-D2 authoring — label and help validation rules', () => {
  it('rejects blank EN and/or GU labels', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const draft = { ...configurationToDraft(committed), labelEn: '', labelGu: '' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    const codes = validation.issues.map((issue) => issue.code)
    expect(codes).toContain('label_en_required')
    expect(codes).toContain('label_gu_required')
  })

  it('rejects a padded (leading/trailing whitespace) EN label', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const draft = { ...configurationToDraft(committed), labelEn: ' Padded label ' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('label_en_padded')
  })

  it('removes the help entry entirely when both EN and GU help are blanked and applied', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(state.definition.meta.bilingual.help['applicant_name']).toBeDefined()
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), helpEn: '', helpGu: '' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'applicant_name', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.bilingual.help).not.toHaveProperty('applicant_name')
  })

  it('treats a one-sided blank help pair as invalid (help_pair_incomplete)', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const draft = { ...configurationToDraft(committed), helpEn: '', helpGu: committed.helpGu }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('help_pair_incomplete')
  })

  it('never copies an EN label edit onto the committed GU label', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), labelEn: 'Updated English label only' }
    expect(draft.labelGu).toBe(committed.labelGu)

    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'applicant_name', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.definition.meta.bilingual.labels['applicant_name']).toEqual({
      en: 'Updated English label only',
      gu: committed.labelGu,
    })
  })
})

describe('FB-D2 authoring — required ordering follows ui:order', () => {
  it('inserts a newly required field into jsonSchema.required at its ui:order position, regardless of edit sequence', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(requiredOf(state.definition)).toEqual([
      'applicant_name',
      'gender',
      'household_size',
      'agree_terms',
    ])

    const committed = readFieldConfiguration(state.definition, 'purpose_statement')
    expect(committed.required).toBe(false)
    const draft = { ...configurationToDraft(committed), required: true }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'purpose_statement', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    state = result.state

    expect(requiredOf(state.definition)).toEqual([
      'applicant_name',
      'gender',
      'household_size',
      'purpose_statement',
      'agree_terms',
    ])
  })

  it('keeps remaining required fields in ui:order after un-requiring one of them', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const first = applyConfig(state, 'purpose_statement', {
      ...readFieldConfiguration(state.definition, 'purpose_statement'),
      required: true,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state

    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const second = applyConfig(state, 'applicant_name', {
      ...committed,
      required: false,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(requiredOf(second.state.definition)).toEqual([
      'gender',
      'household_size',
      'purpose_statement',
      'agree_terms',
    ])
  })
})

describe('FB-D2 authoring — text-short constraints (maxLength, pattern, minLength preserved)', () => {
  it('updates maxLength and compiles a pattern into the schema while preserving an existing minLength', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(readSchema(state.definition, 'applicant_name')['minLength']).toBe(1)

    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), maxLength: '60', pattern: '^[A-Za-z ]+$' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'applicant_name', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const schema = readSchema(result.state.definition, 'applicant_name')
    expect(schema['maxLength']).toBe(60)
    expect(schema['pattern']).toBe('^[A-Za-z ]+$')
    expect(schema['minLength']).toBe(1)
  })

  it('removes the pattern from the schema when the pattern field is cleared', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const withPattern = applyConfig(state, 'applicant_name', {
      ...readFieldConfiguration(state.definition, 'applicant_name'),
      pattern: '^[A-Za-z]+$',
    })
    expect(withPattern.ok).toBe(true)
    if (!withPattern.ok) return
    expect(schemaHasOwnKey(withPattern.state.definition, 'applicant_name', 'pattern')).toBe(true)

    const cleared = applyConfig(withPattern.state, 'applicant_name', {
      ...readFieldConfiguration(withPattern.state.definition, 'applicant_name'),
      pattern: '',
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(schemaHasOwnKey(cleared.state.definition, 'applicant_name', 'pattern')).toBe(false)
  })

  it('rejects a regular expression that fails to compile, without touching the definition', () => {
    const before = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    const draft = { ...configurationToDraft(committed), pattern: '(unterminated' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('pattern_invalid')
    expect(ILLUSTRATIVE_DRAFT_DEFINITION).toEqual(before)
  })

  it('rejects a maxLength that is not a positive whole number', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    for (const badMaxLength of ['', '-5', '12.5', '  8', 'abc']) {
      const draft = { ...configurationToDraft(committed), maxLength: badMaxLength }
      const validation = validateFieldConfigurationDraft(draft)
      expect(validation.ok).toBe(false)
      if (validation.ok) continue
      expect(validation.issues.map((issue) => issue.code)).toContain('max_length_invalid')
    }
  })
})

describe('FB-D2 authoring — text-long constraints (maxLength, minLength preserved)', () => {
  it('updates maxLength while preserving an existing minLength', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    expect(readSchema(state.definition, 'purpose_statement')['minLength']).toBe(1)

    const committed = readFieldConfiguration(state.definition, 'purpose_statement')
    const draft = { ...configurationToDraft(committed), maxLength: '250' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'purpose_statement', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const schema = readSchema(result.state.definition, 'purpose_statement')
    expect(schema['maxLength']).toBe(250)
    expect(schema['minLength']).toBe(1)
  })

  it('rejects a blank maxLength', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'purpose_statement')
    const draft = { ...configurationToDraft(committed), maxLength: '' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('max_length_invalid')
  })
})

describe('FB-D2 authoring — number constraints (minimum / maximum / step)', () => {
  it('applies minimum, maximum, and step (as multipleOf) to the schema', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'household_size')
    const draft = { ...configurationToDraft(committed), minimum: '5', maximum: '25', step: '0.5' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'household_size', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const schema = readSchema(result.state.definition, 'household_size')
    expect(schema['minimum']).toBe(5)
    expect(schema['maximum']).toBe(25)
    expect(schema['multipleOf']).toBe(0.5)
  })

  it('blanking minimum/maximum/step removes those constraints from the schema entirely', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'household_size')
    const draft = { ...configurationToDraft(committed), minimum: '', maximum: '', step: '' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'household_size', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(schemaHasOwnKey(result.state.definition, 'household_size', 'minimum')).toBe(false)
    expect(schemaHasOwnKey(result.state.definition, 'household_size', 'maximum')).toBe(false)
    expect(schemaHasOwnKey(result.state.definition, 'household_size', 'multipleOf')).toBe(false)
  })

  it('rejects minimum greater than maximum (range_invalid)', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'household_size')
    const draft = { ...configurationToDraft(committed), minimum: '20', maximum: '5' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('range_invalid')
    expect(validation.issues.find((issue) => issue.code === 'range_invalid')?.control).toBe(
      'maximum',
    )
  })

  it('rejects non-finite and padded numeric input', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'household_size')

    const nonFinite = validateFieldConfigurationDraft({
      ...configurationToDraft(committed),
      minimum: 'abc',
    })
    expect(nonFinite.ok).toBe(false)
    if (!nonFinite.ok) {
      expect(nonFinite.issues.map((issue) => issue.code)).toContain('minimum_invalid')
    }

    const padded = validateFieldConfigurationDraft({
      ...configurationToDraft(committed),
      minimum: ' 5',
    })
    expect(padded.ok).toBe(false)
    if (!padded.ok) {
      expect(padded.issues.map((issue) => issue.code)).toContain('minimum_invalid')
    }
  })
})

describe('FB-D2 authoring — currency-inr constraints (nonnegative, fixed 0.01 precision)', () => {
  it('a positive minimum is applied while multipleOf stays fixed at 0.01', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'currency-inr')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    expect(readFieldConfiguration(added.state.definition, fieldId).minimum).toBe('')

    const committed = readFieldConfiguration(added.state.definition, fieldId)
    const draft = { ...configurationToDraft(committed), minimum: '15', maximum: '5000' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(added.state, fieldId, validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['minimum']).toBe(15)
    expect(schema['maximum']).toBe(5000)
    expect(schema['multipleOf']).toBe(0.01)
  })

  it('a blank minimum commits back to the baked nonnegative floor of 0', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'currency-inr')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!

    const withMinimum = applyConfig(added.state, fieldId, {
      ...readFieldConfiguration(added.state.definition, fieldId),
      minimum: '15',
    })
    expect(withMinimum.ok).toBe(true)
    if (!withMinimum.ok) return
    expect(readSchema(withMinimum.state.definition, fieldId)['minimum']).toBe(15)

    const blanked = applyConfig(withMinimum.state, fieldId, {
      ...readFieldConfiguration(withMinimum.state.definition, fieldId),
      minimum: '',
    })
    expect(blanked.ok).toBe(true)
    if (!blanked.ok) return
    expect(readSchema(blanked.state.definition, fieldId)['minimum']).toBe(0)
    expect(readSchema(blanked.state.definition, fieldId)['multipleOf']).toBe(0.01)
  })

  it('rejects a negative minimum (currency_minimum_negative) and minimum greater than maximum', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'currency-inr')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const committed = readFieldConfiguration(added.state.definition, added.state.selectedFieldId!)

    const negative = validateFieldConfigurationDraft({
      ...configurationToDraft(committed),
      minimum: '-1',
    })
    expect(negative.ok).toBe(false)
    if (!negative.ok) {
      expect(negative.issues.map((issue) => issue.code)).toContain('currency_minimum_negative')
    }

    const outOfRange = validateFieldConfigurationDraft({
      ...configurationToDraft(committed),
      minimum: '100',
      maximum: '10',
    })
    expect(outOfRange.ok).toBe(false)
    if (!outOfRange.ok) {
      expect(outOfRange.issues.map((issue) => issue.code)).toContain('range_invalid')
      expect(outOfRange.issues.find((issue) => issue.code === 'range_invalid')?.control).toBe(
        'maximum',
      )
    }

    const blankMinNegativeMax = validateFieldConfigurationDraft({
      ...configurationToDraft(committed),
      minimum: '',
      maximum: '-1',
    })
    expect(blankMinNegativeMax.ok).toBe(false)
    if (!blankMinNegativeMax.ok) {
      expect(blankMinNegativeMax.issues.map((issue) => issue.code)).toContain('range_invalid')
      expect(
        blankMinNegativeMax.issues.find((issue) => issue.code === 'range_invalid')?.control,
      ).toBe('maximum')
    }
  })
})

describe('FB-D2 authoring — baked-in constraints are preserved (percentage / gender / yesno)', () => {
  it('percentage schema stays fixed at minimum 0 / maximum 100 across an unrelated edit', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'percentage')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    const committed = readFieldConfiguration(added.state.definition, fieldId)
    const draft = { ...configurationToDraft(committed), labelEn: 'Completion percentage' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(added.state, fieldId, validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['minimum']).toBe(0)
    expect(schema['maximum']).toBe(100)
  })

  it('gender schema stays fixed at enum [M, F, OTHER] across an unrelated edit', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'gender')
    const draft = { ...configurationToDraft(committed), labelEn: 'Gender identity' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'gender', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, 'gender')['enum']).toEqual(['M', 'F', 'OTHER'])
  })

  it('yesno schema stays boolean, with no enum key, across an unrelated edit', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'agree_terms')
    const draft = { ...configurationToDraft(committed), labelEn: 'I confirm the declaration' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'agree_terms', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, 'agree_terms')
    expect(schema['type']).toBe('boolean')
    expect(schema).not.toHaveProperty('enum')
  })
})

describe('FB-D2 authoring — section-header / info-panel special cases', () => {
  it('section-header configurations never carry a required flag and are never added to jsonSchema.required', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'section-header')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    const committed = readFieldConfiguration(added.state.definition, fieldId)
    expect(committed).not.toHaveProperty('required')
    expect(requiredOf(added.state.definition)).not.toContain(fieldId)
  })

  it('info-panel requires nonblank EN and GU help — blank help is invalid (help_required)', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'info_guidance')
    const draft = { ...configurationToDraft(committed), helpEn: '', helpGu: '' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues.map((issue) => issue.code)).toContain('help_required')
  })

  it('applying a change to an info-panel field leaves jsonSchema.required untouched', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const before = requiredOf(state.definition)
    const committed = readFieldConfiguration(state.definition, 'info_guidance')
    const draft = { ...configurationToDraft(committed), labelEn: 'Updated guidance heading' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'info_guidance', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(requiredOf(result.state.definition)).toEqual(before)
  })
})

describe('FB-D2 authoring — unrelated schema keys, bindings, ui:order, and progressive steps are preserved', () => {
  it('preserves an unrelated schema annotation, bindings, order, and steps across an apply', () => {
    const fixture = buildEditableFixtureDefinition()
    const state = createAuthoringSession(fixture)
    const committed = readFieldConfiguration(state.definition, 'field_a')
    const draft = { ...configurationToDraft(committed), maxLength: '80' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'field_a', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { definition } = result.state

    expect(schemaHasOwnKey(definition, 'field_a', 'description')).toBe(true)
    expect(readSchema(definition, 'field_a')['description']).toBe(
      'Do-not-touch unrelated schema annotation',
    )
    expect(definition.uiSchema['ui:order']).toEqual(['field_a', 'field_b'])
    expect(definition.meta.prefillBindings).toEqual(fixture.meta.prefillBindings)
    expect(definition.meta.integrationBindings).toEqual(fixture.meta.integrationBindings)
    expect(definition.meta.workflowBindings).toEqual(fixture.meta.workflowBindings)
    expect(definition.meta.progressiveSteps).toEqual(fixture.meta.progressiveSteps)
  })
})

describe('FB-D2 authoring — preview formData is preserved and only flagged, never cleared', () => {
  it('an existing preview value survives an apply that tightens constraints, and is flagged as possibly invalid', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    state = setPreviewFormData(state, { applicant_name: 'A very long previously entered name' })
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), maxLength: '5' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    expect(
      previewValueMayBeInvalid(
        state.definition,
        'applicant_name',
        validation.configuration,
        state.previewFormData,
      ),
    ).toBe(true)

    const result = applyConfig(state, 'applicant_name', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.previewFormData).toEqual(state.previewFormData)
    expect(result.state.previewFormData['applicant_name']).toBe(
      'A very long previously entered name',
    )
  })

  it('reports no warning while the preview value still satisfies the new constraints', () => {
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    state = setPreviewFormData(state, { applicant_name: 'Short' })
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), maxLength: '40' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(
      previewValueMayBeInvalid(
        state.definition,
        'applicant_name',
        validation.configuration,
        state.previewFormData,
      ),
    ).toBe(false)
  })
})

describe('FB-D2 authoring — typed failure surfaces', () => {
  it('readFieldConfiguration throws field_not_found for an unknown field id', () => {
    expect(() => readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'does_not_exist')).toThrow(
      AuthoringError,
    )
    try {
      readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'does_not_exist')
      expect.unreachable('expected AuthoringError')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('field_not_found')
    }
  })

  it('readFieldConfiguration throws unsupported_property_editor for a controlled-palette widget outside the editable set', () => {
    const fixture = buildPendingWidgetFixtureDefinition()
    try {
      readFieldConfiguration(fixture, 'page_break_ref')
      expect.unreachable('expected AuthoringError')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('unsupported_property_editor')
    }
  })

  it('updateFieldConfiguration rejects a configuration whose widgetType does not match provenance', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const mismatched = {
      widgetType: 'number' as const,
      labelEn: 'Mismatch',
      labelGu: 'મેળ ખાતું નથી',
      helpEn: '',
      helpGu: '',
      required: false,
      minimum: '',
      maximum: '',
      step: '',
    }
    const result = applyConfig(state, 'applicant_name', mismatched)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('configuration_widget_mismatch')
  })

  it('updateFieldConfiguration rejects field_not_found for an unknown field id', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const result = updateFieldConfiguration(state, 'does_not_exist', committed, committed)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('field_not_found')
  })

  it('updateFieldConfiguration rejects a structurally-invalid accepted configuration (configuration_invalid)', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const invalid = { ...committed, labelEn: '' }
    const result = applyConfig(state, 'applicant_name', invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('configuration_invalid')
  })
})

describe('FB-D2 authoring — strict cloning and no mutation of input state', () => {
  it('updateFieldConfiguration never mutates the input state and returns a detached, internally-consistent clone', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const before = structuredClone(state.definition)
    const committed = readFieldConfiguration(state.definition, 'applicant_name')
    const draft = { ...configurationToDraft(committed), maxLength: '60' }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const result = applyConfig(state, 'applicant_name', validation.configuration)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(state.definition).toEqual(before)
    expect(result.state.definition).not.toBe(state.definition)
    expect(() => assertDefinitionIntegrity(result.state.definition)).not.toThrow()
  })

  it('the illustrative baseline is never mutated across a full add/edit/apply/move/remove sequence', () => {
    const snapshot = structuredClone(ILLUSTRATIVE_DRAFT_DEFINITION)
    let state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'text-short')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    state = added.state
    const fieldId = state.selectedFieldId!

    const beforeMove = readFieldConfiguration(state.definition, fieldId)
    const moved = moveField(state, fieldId, 'up')
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    state = moved.state
    // moveField only reorders — the field's own configuration is untouched.
    expect(readFieldConfiguration(state.definition, fieldId)).toEqual(beforeMove)

    const draft = {
      ...configurationToDraft(beforeMove),
      labelEn: 'Edited',
      labelGu: beforeMove.labelGu,
    }
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    const applied = applyConfig(state, fieldId, validation.configuration)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    state = applied.state

    const removed = removeField(state, fieldId)
    expect(removed.ok).toBe(true)

    expect(ILLUSTRATIVE_DRAFT_DEFINITION).toEqual(snapshot)
    expect(Object.isFrozen(ILLUSTRATIVE_DRAFT_DEFINITION)).toBe(true)
  })

  it('removeField deletes a field configuration entirely — a later read reports field_not_found', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const removed = removeField(state, 'gender')
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(() => readFieldConfiguration(removed.state.definition, 'gender')).toThrow(AuthoringError)
  })
})

describe('FB-D2 authoring — dirty detection and apply/cancel via the reducer', () => {
  it('isConfigurationDirty detects any changed governed field and nothing else', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'applicant_name')
    expect(isConfigurationDirty(committed, { ...committed })).toBe(false)
    expect(isConfigurationDirty(committed, { ...committed, labelEn: 'Changed' })).toBe(true)
  })

  it('patchEditorDraft marks the field dirty; applyEditorDraft commits and clears dirty', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '60' },
    })
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(true)

    uiState = authoringReducer(uiState, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(false)
    expect(readSchema(uiState.authoring.definition, 'applicant_name')['maxLength']).toBe(60)
    expect(uiState.announcement?.key).toBe('announceChangesApplied')
  })

  it('cancelEditorDraft discards the patch and restores the committed draft', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Temporary' },
    })
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(true)

    uiState = authoringReducer(uiState, { type: 'cancelEditorDraft', fieldId: 'applicant_name' })
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(false)
    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('Applicant full name')
    expect(uiState.announcement?.key).toBe('announceChangesCancelled')
  })

  it('an invalid apply sets showValidation, focuses the first invalid control, and never commits', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: '' },
    })
    uiState = authoringReducer(uiState, { type: 'applyEditorDraft', fieldId: 'applicant_name' })

    expect(uiState.editorDrafts['applicant_name']?.propertyShowValidation).toBe(true)
    expect(uiState.pendingFocusEditorControl).toBe('labelEn')
    expect(uiState.announcement?.key).toBe('announceConfigurationInvalid')
    expect(uiState.authoring.definition.meta.bilingual.labels['applicant_name']?.en).toBe(
      'Applicant full name',
    )
  })
})

describe('FB-D2 authoring — editor draft retention across selection, removal, add, and reorder', () => {
  it('retains an unapplied draft for field A across selecting field B and back to A', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Draft label A' },
    })
    uiState = authoringReducer(uiState, { type: 'select', fieldId: 'gender' })
    uiState = authoringReducer(uiState, { type: 'select', fieldId: 'applicant_name' })

    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('Draft label A')
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(true)
  })

  it('removing a field cleans up its editor draft', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'gender',
      patch: { labelEn: 'Temp' },
    })
    uiState = authoringReducer(uiState, { type: 'remove', fieldId: 'gender' })
    expect(uiState.editorDrafts).not.toHaveProperty('gender')
  })

  it('adding a new field preserves an unrelated field draft', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'gender',
      patch: { labelEn: 'Temp' },
    })
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'text-short' })
    expect(uiState.editorDrafts['gender']?.draft.labelEn).toBe('Temp')
  })

  it('reordering a field preserves an unrelated field draft', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'gender',
      patch: { labelEn: 'Temp' },
    })
    uiState = authoringReducer(uiState, {
      type: 'move',
      fieldId: 'applicant_name',
      direction: 'down',
    })
    expect(uiState.editorDrafts['gender']?.draft.labelEn).toBe('Temp')
  })
})

describe('FB-D2 authoring — rapid reducer application and purity', () => {
  it('two applyEditorDraft dispatches with identical (state, action) inputs produce structurally identical output', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '99' },
    })
    const action = { type: 'applyEditorDraft', fieldId: 'applicant_name' } as const
    const first = authoringReducer(uiState, action)
    const second = authoringReducer(uiState, action)

    expect(second).toEqual(first)
    // The input state passed to the reducer itself must not have been mutated.
    expect(uiState.authoring.definition.jsonSchema.properties).toEqual(
      ILLUSTRATIVE_DRAFT_DEFINITION.jsonSchema.properties,
    )
  })

  it('rapid sequential patch dispatches accumulate onto the same draft without dropping earlier fields', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'First' },
    })
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { maxLength: '77' },
    })
    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('First')
    expect(uiState.editorDrafts['applicant_name']?.draft.maxLength).toBe('77')
  })
})

describe('FB-D2.1 authoring — strict JSON-decimal lexical admission', () => {
  it('accepts finite JSON-decimal lexemes and rejects hex/binary/underscore/NaN/Infinity/padded', async () => {
    const { parseOptionalJsonDecimal } = await import('../src/authoring/json-decimal.js')
    for (const raw of ['0', '-1', '0.5', '10.25', '1e3', '-2.5E-2']) {
      const parsed = parseOptionalJsonDecimal(raw)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value).toBe(Number(raw))
    }
    for (const raw of [
      '0x10',
      '0b10',
      '1_000',
      'NaN',
      'Infinity',
      '-Infinity',
      ' 1',
      '1 ',
      '1.',
      '.5',
      '',
    ]) {
      if (raw === '') {
        expect(parseOptionalJsonDecimal(raw)).toEqual({ ok: true, value: undefined })
        continue
      }
      expect(parseOptionalJsonDecimal(raw).ok).toBe(false)
    }
  })

  it('rejects non-JSON-decimal number constraint drafts at validation', () => {
    const committed = readFieldConfiguration(ILLUSTRATIVE_DRAFT_DEFINITION, 'household_size')
    for (const bad of ['0x10', '1_000', 'Infinity']) {
      const validation = validateFieldConfigurationDraft({
        ...configurationToDraft(committed),
        minimum: bad,
      })
      expect(validation.ok).toBe(false)
      if (!validation.ok) {
        expect(validation.issues.map((issue) => issue.code)).toContain('minimum_invalid')
      }
    }
  })
})

describe('FB-D2.1 authoring — currency effective range cannot commit impossible schemas', () => {
  it('updateFieldConfiguration rejects blank-min + maximum -1 as configuration_invalid without mutation', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(state, 'currency-inr')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    const before = structuredClone(added.state.definition)
    const committed = readFieldConfiguration(added.state.definition, fieldId)
    const invalid = { ...committed, minimum: '', maximum: '-1' }
    const result = applyConfig(added.state, fieldId, invalid)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('configuration_invalid')
    expect(added.state.definition).toEqual(before)
  })
})

describe('FB-D2.1 authoring — genuine stale_editor_draft baseline contract', () => {
  it('Apply with an outdated baseline returns stale_editor_draft and does not mutate', () => {
    const state = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const baseline = readFieldConfiguration(state.definition, 'applicant_name')
    const concurrent = applyConfig(state, 'applicant_name', {
      ...baseline,
      labelEn: 'Concurrent label',
      maxLength: '80',
    })
    expect(concurrent.ok).toBe(true)
    if (!concurrent.ok) return

    const staleAttempt = updateFieldConfiguration(
      concurrent.state,
      'applicant_name',
      { ...baseline, labelEn: 'Stale draft label', maxLength: '50' },
      baseline,
    )
    expect(staleAttempt.ok).toBe(false)
    if (staleAttempt.ok) return
    expect(staleAttempt.error.code).toBe('stale_editor_draft')
    expect(staleAttempt.error.message).not.toMatch(/Concurrent|Stale draft/)
    expect(concurrent.state.definition.meta.bilingual.labels['applicant_name']?.en).toBe(
      'Concurrent label',
    )
    expect(readSchema(concurrent.state.definition, 'applicant_name')['maxLength']).toBe(80)
  })

  it('reducer retains dirty draft + stale guidance; Cancel rebases; Apply after rebase succeeds', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'My draft label' },
    })
    const baseline = uiState.editorDrafts['applicant_name']!.baseline

    // Simulate concurrent committed change outside this draft's apply path.
    const concurrent = applyConfig(uiState.authoring, 'applicant_name', {
      ...baseline,
      labelEn: 'Other commit',
      maxLength: '90',
    })
    expect(concurrent.ok).toBe(true)
    if (!concurrent.ok) return
    uiState = { ...uiState, authoring: concurrent.state }

    uiState = authoringReducer(uiState, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(uiState.announcement?.key).toBe('announceEditorDraftStale')
    expect(uiState.editorDrafts['applicant_name']?.propertyShowStaleGuidance).toBe(true)
    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('My draft label')
    expect(isFieldEditorDirty(uiState, 'applicant_name')).toBe(true)
    expect(uiState.authoring.definition.meta.bilingual.labels['applicant_name']?.en).toBe(
      'Other commit',
    )

    uiState = authoringReducer(uiState, { type: 'cancelEditorDraft', fieldId: 'applicant_name' })
    expect(uiState.editorDrafts['applicant_name']?.propertyShowStaleGuidance).toBe(false)
    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('Other commit')
    expect(uiState.editorDrafts['applicant_name']?.baseline.labelEn).toBe('Other commit')

    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Rebased edit' },
    })
    uiState = authoringReducer(uiState, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(uiState.announcement?.key).toBe('announceChangesApplied')
    expect(uiState.authoring.definition.meta.bilingual.labels['applicant_name']?.en).toBe(
      'Rebased edit',
    )
  })

  it('ordinary add/reorder does not falsely stale an unrelated draft', () => {
    let uiState = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    uiState = authoringReducer(uiState, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Still mine' },
    })
    uiState = authoringReducer(uiState, { type: 'add', widgetType: 'number' })
    uiState = authoringReducer(uiState, {
      type: 'move',
      fieldId: 'gender',
      direction: 'up',
    })
    expect(uiState.editorDrafts['applicant_name']?.draft.labelEn).toBe('Still mine')
    expect(uiState.editorDrafts['applicant_name']?.propertyShowStaleGuidance).toBeFalsy()

    uiState = authoringReducer(uiState, { type: 'applyEditorDraft', fieldId: 'applicant_name' })
    expect(uiState.announcement?.key).toBe('announceChangesApplied')
    expect(uiState.authoring.definition.meta.bilingual.labels['applicant_name']?.en).toBe(
      'Still mine',
    )
  })
})
