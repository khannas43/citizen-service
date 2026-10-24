import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@dg20/form-contract'

import {
  AuthoringError,
  addField,
  admitDobXDg20,
  admitEmailXDg20,
  assertDefinitionIntegrity,
  createAuthoringSession,
  readFieldConfiguration,
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

function addCitizen(widgetType: 'email' | 'full-name' | 'dob' | 'pincode'): {
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
  const schema = readSchema(definition, fieldId)
  mutate(schema)
  return definition
}

function expectMalformedContainment(
  definition: FormDefinition,
  fieldId: string,
  state: ReturnType<typeof createAuthoringSession>,
): void {
  const before = structuredClone(definition)
  expect(() => assertDefinitionIntegrity(definition)).toThrow(AuthoringError)
  try {
    assertDefinitionIntegrity(definition)
    expect.unreachable('expected AuthoringError')
  } catch (error) {
    expect(error).toBeInstanceOf(AuthoringError)
    expect((error as AuthoringError).code).toBe('inconsistent_definition')
  }
  expect(definition).toEqual(before)

  expect(() => readFieldConfiguration(definition, fieldId)).toThrow(AuthoringError)
  try {
    readFieldConfiguration(definition, fieldId)
    expect.unreachable('expected AuthoringError')
  } catch (error) {
    expect(error).toBeInstanceOf(AuthoringError)
    expect((error as AuthoringError).code).toBe('inconsistent_definition')
  }
  expect(definition).toEqual(before)

  // Session pointed at malformed clone — Apply must fail before mutation.
  const malformedState = { ...state, definition }
  const previewBefore = structuredClone(malformedState.previewFormData)
  const dummy = {
    widgetType: 'email' as const,
    labelEn: 'X',
    labelGu: 'વાય',
    helpEn: '',
    helpGu: '',
    required: false,
    verifyEmail: false,
  }
  const applied = updateFieldConfiguration(malformedState, fieldId, dummy, dummy)
  expect(applied.ok).toBe(false)
  if (applied.ok) return
  expect(applied.error.code).toBe('inconsistent_definition')
  expect(malformedState.definition).toEqual(before)
  expect(malformedState.previewFormData).toEqual(previewBefore)
}

describe('FB-D5.1 — email x-dg20 and schema admission', () => {
  it.each([
    ['string', 'not-an-object'],
    ['null', null],
    ['array', []],
  ] as const)('rejects x-dg20 %s', (_label, value) => {
    const { state, fieldId } = addCitizen('email')
    const definition = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = value as never
    })
    expect(admitEmailXDg20(readSchema(definition, fieldId)).kind).toBe('invalid')
    expectMalformedContainment(definition, fieldId, state)
  })

  it('rejects verifyEmail string and unexpected minAge', () => {
    const { state, fieldId } = addCitizen('email')
    const asString = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = { verifyEmail: 'true' }
    })
    expectMalformedContainment(asString, fieldId, state)

    const withMinAge = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = { verifyEmail: true, minAge: 18 }
    })
    expectMalformedContainment(withMinAge, fieldId, state)
  })

  it('rejects wrong type/format', () => {
    const { state, fieldId } = addCitizen('email')
    const wrongType = withCorruptedSchema(state, fieldId, (schema) => {
      schema['type'] = 'number'
    })
    expectMalformedContainment(wrongType, fieldId, state)

    const wrongFormat = withCorruptedSchema(state, fieldId, (schema) => {
      schema['format'] = 'uri'
    })
    expectMalformedContainment(wrongFormat, fieldId, state)
  })

  it('explicit verifyEmail false canonicalizes to absence only on valid Apply', () => {
    const { state, fieldId } = addCitizen('email')
    const seeded = structuredClone(state.definition) as FormDefinition
    readSchema(seeded, fieldId)['x-dg20'] = { verifyEmail: false }
    assertDefinitionIntegrity(seeded)
    expect(admitEmailXDg20(readSchema(seeded, fieldId))).toEqual({
      kind: 'valid',
      value: { verifyEmail: false },
    })
    const session = { ...state, definition: seeded }
    const committed = readFieldConfiguration(session.definition, fieldId)
    expect(committed.verifyEmail).toBe(false)
    const result = applyConfig(session, fieldId, { ...committed, verifyEmail: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).not.toHaveProperty('x-dg20')
  })

  it('preserves compatible unrelated schema keywords on valid email Apply', () => {
    const { state, fieldId } = addCitizen('email')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Citizen email contact'
    readSchema(annotated, fieldId)['maxLength'] = 254
    assertDefinitionIntegrity(annotated)
    const session = { ...state, definition: annotated }
    const committed = readFieldConfiguration(session.definition, fieldId)
    const result = applyConfig(session, fieldId, { ...committed, verifyEmail: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['description']).toBe('Citizen email contact')
    expect(schema['maxLength']).toBe(254)
    expect(schema['format']).toBe('email')
    expect(schema['x-dg20']).toEqual({ verifyEmail: true })
  })
})

describe('FB-D5.1 — DOB x-dg20 and schema admission', () => {
  it.each([
    [{ minAge: 1.5 }, 'fractional'],
    [{ minAge: -1 }, 'negative'],
    [{ minAge: Number.MAX_SAFE_INTEGER + 1 }, 'unsafe'],
    [{ minAge: '18' }, 'string'],
    [{ verifyEmail: true }, 'unexpected verifyEmail'],
    [{ minAge: 40, maxAge: 18 }, 'min>max'],
  ] as const)('rejects DOB x-dg20 %s (%s)', (ext) => {
    const { state, fieldId } = addCitizen('dob')
    const definition = withCorruptedSchema(state, fieldId, (schema) => {
      schema['x-dg20'] = { ...ext }
    })
    expect(admitDobXDg20(readSchema(definition, fieldId)).kind).toBe('invalid')
    expectMalformedContainment(definition, fieldId, state)
  })

  it('rejects wrong DOB type/format', () => {
    const { state, fieldId } = addCitizen('dob')
    const wrongFormat = withCorruptedSchema(state, fieldId, (schema) => {
      schema['format'] = 'date-time'
    })
    expectMalformedContainment(wrongFormat, fieldId, state)
  })

  it('preserves compatible unrelated DOB schema keywords on valid Apply', () => {
    const { state, fieldId } = addCitizen('dob')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Date of birth gate'
    assertDefinitionIntegrity(annotated)
    const session = { ...state, definition: annotated }
    const committed = readFieldConfiguration(session.definition, fieldId)
    const result = applyConfig(session, fieldId, { ...committed, minAge: '18', maxAge: '65' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = readSchema(result.state.definition, fieldId)
    expect(schema['description']).toBe('Date of birth gate')
    expect(schema['format']).toBe('date')
    expect(schema['x-dg20']).toEqual({ minAge: 18, maxAge: 65 })
  })
})

describe('FB-D5.1 — full-name baked invariant containment', () => {
  it('rejects missing en/gu, duplicate required, additionalProperties true, weakened members', () => {
    const { state, fieldId } = addCitizen('full-name')

    const missingEn = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, unknown>
      delete properties['en']
    })
    expectMalformedContainment(missingEn, fieldId, state)

    const missingRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['en']
    })
    expectMalformedContainment(missingRequired, fieldId, state)

    const duplicateRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['en', 'gu', 'en']
    })
    expectMalformedContainment(duplicateRequired, fieldId, state)

    const additionalTrue = withCorruptedSchema(state, fieldId, (schema) => {
      schema['additionalProperties'] = true
    })
    expectMalformedContainment(additionalTrue, fieldId, state)

    const weakenedMin = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, Record<string, unknown>>
      properties.en!['minLength'] = 0
    })
    expectMalformedContainment(weakenedMin, fieldId, state)

    const wrongType = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, Record<string, unknown>>
      properties.gu!['type'] = 'number'
    })
    expectMalformedContainment(wrongType, fieldId, state)
  })

  it('Property Apply preserves admitted full-name schema byte-for-JSON and compatible keys', () => {
    const { state, fieldId } = addCitizen('full-name')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'Legal name pair'
    const properties = readSchema(annotated, fieldId)['properties'] as Record<
      string,
      Record<string, unknown>
    >
    properties.en!['minLength'] = 2
    assertDefinitionIntegrity(annotated)
    const schemaBefore = structuredClone(readSchema(annotated, fieldId))
    const session = { ...state, definition: annotated }
    const committed = readFieldConfiguration(session.definition, fieldId)
    const result = applyConfig(session, fieldId, {
      ...committed,
      labelEn: 'Legal name',
      labelGu: 'કાનૂની નામ',
      required: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual(schemaBefore)
  })
})

describe('FB-D5.1 — pincode baked invariant containment', () => {
  it('rejects weakened pattern, missing required, bad shapes, additionalProperties true', () => {
    const { state, fieldId } = addCitizen('pincode')

    const weakPattern = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, Record<string, unknown>>
      properties.pincode!['pattern'] = '^[0-9]+$'
    })
    expectMalformedContainment(weakPattern, fieldId, state)

    const missingRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = []
    })
    expectMalformedContainment(missingRequired, fieldId, state)

    const missingCity = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, unknown>
      delete properties['cityCode']
    })
    expectMalformedContainment(missingCity, fieldId, state)

    const badDistrict = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, Record<string, unknown>>
      properties.districtCode!['minLength'] = 0
    })
    expectMalformedContainment(badDistrict, fieldId, state)

    const additionalTrue = withCorruptedSchema(state, fieldId, (schema) => {
      schema['additionalProperties'] = true
    })
    expectMalformedContainment(additionalTrue, fieldId, state)
  })

  it('Property Apply preserves admitted PIN schema and does not reconstruct nested properties', () => {
    const { state, fieldId } = addCitizen('pincode')
    const annotated = structuredClone(state.definition) as FormDefinition
    readSchema(annotated, fieldId)['description'] = 'PIN with enrichment'
    const properties = readSchema(annotated, fieldId)['properties'] as Record<
      string,
      Record<string, unknown>
    >
    properties.cityCode!['minLength'] = 3
    assertDefinitionIntegrity(annotated)
    const schemaBefore = structuredClone(readSchema(annotated, fieldId))
    const session = { ...state, definition: annotated }
    const committed = readFieldConfiguration(session.definition, fieldId)
    const result = applyConfig(session, fieldId, {
      ...committed,
      helpEn: 'Enter PIN',
      helpGu: 'પિન દાખલ કરો',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual(schemaBefore)
  })
})

describe('FB-D5.1.1 — exact composite schema membership', () => {
  it('rejects full-name extra property and hostile required arrays', () => {
    const { state, fieldId } = addCitizen('full-name')

    const extraProp = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, unknown>
      properties['middle'] = { type: 'string', minLength: 1 }
    })
    expectMalformedContainment(extraProp, fieldId, state)

    const extraRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['en', 'gu', 'middle']
    })
    expectMalformedContainment(extraRequired, fieldId, state)

    const nonStringRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['en', 1]
    })
    expectMalformedContainment(nonStringRequired, fieldId, state)

    const sparseRequired = withCorruptedSchema(state, fieldId, (schema) => {
      const required: unknown[] = ['en']
      required.length = 2
      schema['required'] = required
    })
    expectMalformedContainment(sparseRequired, fieldId, state)

    let fullNameGetterInvoked = false
    const accessorRequired = withCorruptedSchema(state, fieldId, (schema) => {
      const required: unknown[] = []
      Object.defineProperty(required, 0, {
        value: 'en',
        enumerable: true,
        configurable: true,
        writable: true,
      })
      Object.defineProperty(required, 1, {
        get() {
          fullNameGetterInvoked = true
          return 'gu'
        },
        enumerable: true,
        configurable: true,
      })
      schema['required'] = required
    })
    expect(() => assertDefinitionIntegrity(accessorRequired)).toThrow(AuthoringError)
    expect(fullNameGetterInvoked).toBe(false)
  })

  it('rejects PIN extra property and hostile required arrays', () => {
    const { state, fieldId } = addCitizen('pincode')

    const extraProp = withCorruptedSchema(state, fieldId, (schema) => {
      const properties = schema['properties'] as Record<string, unknown>
      properties['stateCode'] = { type: 'string', minLength: 1 }
    })
    expectMalformedContainment(extraProp, fieldId, state)

    const extraRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['pincode', 'cityCode']
    })
    expectMalformedContainment(extraRequired, fieldId, state)

    const duplicateRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = ['pincode', 'pincode']
    })
    expectMalformedContainment(duplicateRequired, fieldId, state)

    const nonStringRequired = withCorruptedSchema(state, fieldId, (schema) => {
      schema['required'] = [380001]
    })
    expectMalformedContainment(nonStringRequired, fieldId, state)

    const sparseRequired = withCorruptedSchema(state, fieldId, (schema) => {
      const required: unknown[] = []
      required.length = 1
      schema['required'] = required
    })
    expectMalformedContainment(sparseRequired, fieldId, state)

    let pinGetterInvoked = false
    const accessorRequired = withCorruptedSchema(state, fieldId, (schema) => {
      const required: unknown[] = []
      Object.defineProperty(required, 0, {
        get() {
          pinGetterInvoked = true
          return 'pincode'
        },
        enumerable: true,
        configurable: true,
      })
      schema['required'] = required
    })
    expect(() => assertDefinitionIntegrity(accessorRequired)).toThrow(AuthoringError)
    expect(pinGetterInvoked).toBe(false)
  })

  it('keeps compatible root/member constraints through Property Apply', () => {
    const { state, fieldId } = addCitizen('full-name')
    const annotated = structuredClone(state.definition) as FormDefinition
    const schema = readSchema(annotated, fieldId)
    schema['description'] = 'Legal name'
    const properties = schema['properties'] as Record<string, Record<string, unknown>>
    properties.en!['minLength'] = 2
    properties.gu!['pattern'] = '^[\\u0A80-\\u0AFF ]+$'
    assertDefinitionIntegrity(annotated)
    const before = structuredClone(schema)
    const session = { ...state, definition: annotated }
    const committed = readFieldConfiguration(session.definition, fieldId)
    const result = applyConfig(session, fieldId, {
      ...committed,
      labelEn: 'Full legal name',
      labelGu: 'પૂરું કાનૂની નામ',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readSchema(result.state.definition, fieldId)).toEqual(before)
  })
})
