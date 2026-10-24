import { describe, expect, it } from 'vitest'

import {
  ACCEPTANCE_CAF_ATTRIBUTES,
  createRepresentativeIncomeCertificateDefinition,
  deepFreezeJsonSafe,
} from '../acceptance/representative-income-certificate.js'
import { admitFormDefinition } from '../src/definition-admission.js'
import { getDg20FormValidator } from '../src/validator-2020.js'

describe('FB-B6.1 representative acceptance integrity — CAF schemas', () => {
  const definition = createRepresentativeIncomeCertificateDefinition()
  const schema = definition.jsonSchema as object
  const validator = getDg20FormValidator(schema)

  function validateCafField(fieldId: 'caf_father_name' | 'caf_mother_name', value: unknown) {
    return validator.rawValidation(schema, {
      applicant_name: 'Asha Patel',
      gender: 'F',
      caf_father_name: fieldId === 'caf_father_name' ? value : { value: 'Father', source: 'CAF' },
      caf_mother_name:
        fieldId === 'caf_mother_name' ? value : { value: 'Mother', source: 'OVERRIDE' },
      household_size: 4,
      contact_email: 'asha@example.gov.in',
      annual_income: 180000,
      purpose_statement: 'School fee concession application',
      agree_terms: true,
    })
  }

  it.each(['caf_father_name', 'caf_mother_name'] as const)(
    '%s admits a complete CAF | OVERRIDE object',
    (fieldId) => {
      const result = validateCafField(fieldId, {
        value: 'Valid Name',
        source: fieldId === 'caf_father_name' ? 'CAF' : 'OVERRIDE',
      })
      expect(result.validationError).toBeUndefined()
      expect(result.errors ?? []).toHaveLength(0)
    },
  )

  it.each(['caf_father_name', 'caf_mother_name'] as const)(
    '%s rejects empty object, missing keys, blank value, and unexpected keys',
    (fieldId) => {
      const cases: unknown[] = [
        {},
        { value: 'Only value' },
        { source: 'CAF' },
        { value: '', source: 'CAF' },
        { value: 'Name', source: 'CAF', confidence: 0.9 },
        { value: 'Name', source: 'OTHER' },
      ]
      for (const bad of cases) {
        const result = validateCafField(fieldId, bad)
        expect(result.validationError).toBeUndefined()
        expect((result.errors ?? []).length).toBeGreaterThan(0)
      }
    },
  )

  it('admits the representative definition for citizen mode', () => {
    const admission = admitFormDefinition(definition, { mode: 'citizen' })
    expect(admission.ok).toBe(true)
    expect(ACCEPTANCE_CAF_ATTRIBUTES.fatherName).toBe('goldenRecord.fatherName')
  })
})

describe('FB-B6.1 representative acceptance integrity — immutability', () => {
  it('deeply freezes nested schema and meta objects', () => {
    const definition = createRepresentativeIncomeCertificateDefinition()
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.jsonSchema)).toBe(true)
    expect(Object.isFrozen(definition.jsonSchema.properties)).toBe(true)
    expect(Object.isFrozen(definition.jsonSchema.properties!.caf_father_name)).toBe(true)
    expect(Object.isFrozen(definition.meta)).toBe(true)
    expect(Object.isFrozen(definition.meta.bilingual)).toBe(true)
    expect(Object.isFrozen(definition.meta.bilingual.labels)).toBe(true)
    expect(Object.isFrozen(definition.meta.progressiveSteps)).toBe(true)
    expect(Object.isFrozen(definition.meta.progressiveSteps![0])).toBe(true)
    expect(Object.isFrozen(definition.uiSchema)).toBe(true)
    expect(Object.isFrozen(definition.audit)).toBe(true)
  })

  it('attempted mutation cannot alter a later admission use', () => {
    const definition = createRepresentativeIncomeCertificateDefinition()
    const props = definition.jsonSchema.properties as Record<string, unknown>
    expect(() => {
      props.applicant_name = { type: 'number' }
    }).toThrow()
    expect(() => {
      ;(definition.meta.bilingual.labels as Record<string, unknown>).applicant_name = {
        en: 'MUTATED',
        gu: 'MUTATED',
      }
    }).toThrow()

    const again = createRepresentativeIncomeCertificateDefinition()
    expect(again).toBe(definition)
    const admission = admitFormDefinition(again, { mode: 'citizen' })
    expect(admission.ok).toBe(true)
    if (admission.ok) {
      expect(admission.definition.meta.bilingual.labels.applicant_name.en).toBe('Applicant name')
      expect(
        (admission.definition.jsonSchema.properties!.applicant_name as { type?: string }).type,
      ).toBe('string')
    }
  })

  it('deepFreezeJsonSafe freezes nested plain objects without throwing on frozen input', () => {
    const sample = { a: { b: [1, { c: 2 }] } }
    deepFreezeJsonSafe(sample)
    expect(Object.isFrozen(sample)).toBe(true)
    expect(Object.isFrozen(sample.a)).toBe(true)
    expect(Object.isFrozen(sample.a.b)).toBe(true)
    expect(Object.isFrozen(sample.a.b[1])).toBe(true)
    deepFreezeJsonSafe(sample)
  })
})

describe('FB-B6.1 representative acceptance integrity — schema titles', () => {
  it('omits root and property JSON Schema titles so EN titles cannot leak via RJSF', () => {
    const definition = createRepresentativeIncomeCertificateDefinition()
    expect('title' in definition.jsonSchema).toBe(false)
    const properties = definition.jsonSchema.properties ?? {}
    for (const [fieldId, schema] of Object.entries(properties)) {
      expect(schema && typeof schema === 'object' && 'title' in schema).toBe(false)
      void fieldId
    }
  })
})
