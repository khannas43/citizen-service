import { describe, expect, it } from 'vitest'

import { admitFormDefinition } from '../src/definition-admission.js'
import {
  buildProgressivePlan,
  deriveStepSchema,
  deriveStepUiSchema,
  mergeStepFormData,
  pickStepFormData,
} from '../src/progressive-steps.js'
import {
  createProgressiveDefWithLocalRef,
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
  deepFreeze,
} from './fixtures.js'

describe('FB-B1 progressive plan', () => {
  it('empty progressiveSteps produces single-page plan', () => {
    const definition = createSamplePublishedDefinition()
    const result = buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: [],
    })
    expect(result).toEqual({ ok: true, plan: { kind: 'single_page' } })
  })

  it('valid plan preserves step order', () => {
    const definition = createProgressivePublishedDefinition()
    const result = buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.plan.kind !== 'progressive') {
      throw new Error('expected progressive plan')
    }
    expect(result.plan.steps.map((step) => step.stepId)).toEqual(['identity', 'household'])
    expect(result.plan.steps[0]?.fieldIds).toEqual([
      'section_identity',
      'applicant_name',
      'caf_father_name',
    ])
  })

  it('duplicate stepId rejected', () => {
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
      },
      uiSchema: {},
      progressiveSteps: [
        { stepId: 'same', labelEn: 'One', labelGu: 'એક', fieldIds: ['a'] },
        { stepId: 'same', labelEn: 'Two', labelGu: 'બે', fieldIds: ['b'] },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('duplicate_step_id')
    }
  })

  it('blank EN/GU step label rejected', () => {
    const definition = createProgressivePublishedDefinition({
      meta: {
        ...createProgressivePublishedDefinition().meta,
        progressiveSteps: [
          {
            stepId: 'identity',
            labelEn: '   ',
            labelGu: 'ઓળખ',
            fieldIds: ['applicant_name'],
          },
        ],
      },
    })
    // Force a schema matching the incomplete steps for this rejection path.
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { applicant_name: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('blank_step_label')
    }
  })

  it('empty/duplicate fieldIds rejected', () => {
    const empty = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [{ stepId: 's', labelEn: 'S', labelGu: 'સ', fieldIds: [] }],
    })
    expect(empty.ok).toBe(false)
    if (!empty.ok) {
      expect(empty.reason).toBe('empty_field_ids')
    }

    const dup = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [{ stepId: 's', labelEn: 'S', labelGu: 'સ', fieldIds: ['a', 'a'] }],
    })
    expect(dup.ok).toBe(false)
    if (!dup.ok) {
      expect(dup.reason).toBe('duplicate_field_id_in_step')
    }
  })

  it('unknown field rejected', () => {
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [{ stepId: 's', labelEn: 'S', labelGu: 'સ', fieldIds: ['missing'] }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unknown_field')
    }
  })

  it('field assigned to two steps rejected', () => {
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [
        { stepId: 's1', labelEn: 'One', labelGu: 'એક', fieldIds: ['a'] },
        { stepId: 's2', labelEn: 'Two', labelGu: 'બે', fieldIds: ['a', 'b'] },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('field_in_multiple_steps')
    }
  })

  it('unassigned root field rejected', () => {
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [{ stepId: 's1', labelEn: 'One', labelGu: 'એક', fieldIds: ['a'] }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unassigned_root_field')
    }
  })

  it('nested-path fieldId rejected', () => {
    const result = buildProgressivePlan({
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { a: { type: 'string' } },
      },
      uiSchema: {},
      progressiveSteps: [{ stepId: 's', labelEn: 'S', labelGu: 'સ', fieldIds: ['a.nested'] }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('nested_path_field_id')
    }
  })

  it('admission returns progressive_steps_invalid', () => {
    const definition = createSamplePublishedDefinition({
      meta: {
        ...createSamplePublishedDefinition().meta,
        progressiveSteps: [
          {
            stepId: 'broken',
            labelEn: 'Broken',
            labelGu: 'ખરાબ',
            fieldIds: ['not_a_real_field'],
          },
        ],
      },
    })
    const result = admitFormDefinition(definition, { mode: 'citizen' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('progressive_steps_invalid')
      expect(result.publicReasonKey).toBe('formUnavailable')
    }
  })

  it('step schema properties and required are filtered', () => {
    const definition = createProgressivePublishedDefinition()
    const result = buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.plan.kind !== 'progressive') {
      throw new Error('expected progressive')
    }
    const first = result.plan.steps[0]!
    expect(Object.keys(first.schema.properties ?? {})).toEqual([
      'section_identity',
      'applicant_name',
      'caf_father_name',
    ])
    expect(first.schema.required).toEqual(['applicant_name'])
    expect(first.schema.required).not.toContain('agree_terms')
  })

  it('local $defs/$ref still validate in derived step schema', () => {
    const definition = createProgressiveDefWithLocalRef()
    const result = buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.plan.kind !== 'progressive') {
      throw new Error('expected progressive')
    }
    const step = result.plan.steps[0]!
    expect(step.schema.$defs).toBeDefined()
    const schema = deriveStepSchema(definition.jsonSchema, ['code_a'])
    // Full-bag retention (B1.1): entire root $defs object is kept.
    expect(schema.$defs).toEqual({ code: { type: 'string', minLength: 2 } })
    expect(schema.$defs).toBe((definition.jsonSchema as { $defs: object }).$defs)
  })

  it('original schema/uiSchema remain frozen and unchanged', () => {
    const definition = deepFreeze(createProgressivePublishedDefinition())
    const beforeSchema = JSON.stringify(definition.jsonSchema)
    const beforeUi = JSON.stringify(definition.uiSchema)
    const result = buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(definition.jsonSchema)).toBe(beforeSchema)
    expect(JSON.stringify(definition.uiSchema)).toBe(beforeUi)
    expect(Object.isFrozen(definition.jsonSchema)).toBe(true)
  })

  it('ui:order filtering keeps wildcard and step fields only; drops other root ui:*', () => {
    const ui = deriveStepUiSchema(
      {
        'ui:order': ['applicant_name', '*', 'agree_terms', 'household_size'],
        applicant_name: { 'ui:widget': 'text-short' },
        household_size: { 'ui:widget': 'number' },
        agree_terms: { 'ui:widget': 'yesno' },
        'ui:disabled': false,
      },
      ['applicant_name', 'household_size'],
    )
    expect(ui['ui:order']).toEqual(['applicant_name', '*', 'household_size'])
    expect(ui).toHaveProperty('applicant_name')
    expect(ui).toHaveProperty('household_size')
    expect(ui).not.toHaveProperty('agree_terms')
    expect(ui).not.toHaveProperty('ui:disabled')
  })

  it('mergeStepFormData preserves other steps and ignores unexpected keys', () => {
    const complete = {
      applicant_name: 'Asha',
      household_size: 3,
      contact_email: 'a@example.gov.in',
    }
    const merged = mergeStepFormData(complete, ['household_size', 'contact_email'], {
      household_size: 4,
      contact_email: undefined,
      rogue: 'nope',
    })
    expect(merged).toEqual({
      applicant_name: 'Asha',
      household_size: 4,
    })
    expect(merged).not.toHaveProperty('rogue')
    expect(pickStepFormData(merged, ['applicant_name'])).toEqual({ applicant_name: 'Asha' })
  })
})
