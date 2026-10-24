import { describe, expect, it } from 'vitest'

import * as renderer from '../src/index.js'
import { admitFormDefinition } from '../src/definition-admission.js'
import {
  createDg20FormValidator,
  getDg20FormValidator,
  resetDg20FormValidatorForTests,
  tryCompileFormSchema,
} from '../src/validator-2020.js'
import { createSamplePublishedDefinition } from './fixtures.js'

describe('FB-B0 public exports', () => {
  it('exports FormRenderer and supporting admission/validator APIs', () => {
    expect(typeof renderer.FormRenderer).toBe('function')
    expect(typeof renderer.admitFormDefinition).toBe('function')
    expect(typeof renderer.createDg20FormValidator).toBe('function')
    expect(typeof renderer.getDg20FormValidator).toBe('function')
    expect(typeof renderer.resolveRendererMessage).toBe('function')
    expect(typeof renderer.getRendererMessageCatalogue).toBe('function')
  })

  it('does not expose registry or validator override hooks on FormRendererProps', () => {
    type Forbidden = 'widgets' | 'fields' | 'validator' | 'registry' | 'templates'
    type PropsKeys = keyof renderer.FormRendererProps
    type Collision = Extract<PropsKeys, Forbidden>
    const assertNoCollision: Collision extends never ? true : false = true
    expect(assertNoCollision).toBe(true)
  })
})

describe('FB-B0 definition admission', () => {
  it('admits a valid published definition in citizen mode', () => {
    const result = admitFormDefinition(createSamplePublishedDefinition(), { mode: 'citizen' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.definition.serviceId).toBe('income-certificate-sample')
      expect(result.definition.status).toBe('published')
    }
  })

  it('rejects draft in citizen mode', () => {
    const result = admitFormDefinition(createSamplePublishedDefinition({ status: 'draft' }), {
      mode: 'citizen',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'citizen_status_not_published',
      publicReasonKey: 'formUnpublished',
    })
  })

  it('allows draft in preview mode', () => {
    const result = admitFormDefinition(createSamplePublishedDefinition({ status: 'draft' }), {
      mode: 'preview',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects retired in citizen mode', () => {
    const result = admitFormDefinition(createSamplePublishedDefinition({ status: 'retired' }), {
      mode: 'citizen',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('citizen_status_not_published')
    }
  })

  it('fails closed on malformed runtime definition', () => {
    expect(admitFormDefinition(null, { mode: 'citizen' }).ok).toBe(false)
    expect(admitFormDefinition('nope', { mode: 'citizen' }).ok).toBe(false)
    expect(admitFormDefinition([], { mode: 'citizen' }).ok).toBe(false)
    const missingService = createSamplePublishedDefinition()
    const result = admitFormDefinition({ ...missingService, serviceId: '  ' }, { mode: 'citizen' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_service_id')
    }
  })

  it('rejects wrong or missing schema dialect', () => {
    const missing = createSamplePublishedDefinition({
      jsonSchema: {
        type: 'object',
        properties: {},
      },
    })
    const missingResult = admitFormDefinition(missing, { mode: 'citizen' })
    expect(missingResult.ok).toBe(false)
    if (!missingResult.ok) {
      expect(missingResult.reason).toBe('unsupported_schema_dialect')
    }

    const draft7 = createSamplePublishedDefinition({
      jsonSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {},
      },
    })
    const draft7Result = admitFormDefinition(draft7, { mode: 'citizen' })
    expect(draft7Result.ok).toBe(false)
    if (!draft7Result.ok) {
      expect(draft7Result.reason).toBe('unsupported_schema_dialect')
    }
  })

  it('accepts 2020-12 URI with trailing hash', () => {
    const definition = createSamplePublishedDefinition({
      jsonSchema: {
        ...createSamplePublishedDefinition().jsonSchema,
        $schema: 'https://json-schema.org/draft/2020-12/schema#',
      },
    })
    expect(admitFormDefinition(definition, { mode: 'citizen' }).ok).toBe(true)
  })

  it('rejects non-object root schema', () => {
    const result = admitFormDefinition(
      createSamplePublishedDefinition({
        jsonSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          items: { type: 'string' },
        },
      }),
      { mode: 'citizen' },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('json_schema_root_not_object_type')
    }
  })

  it('rejects invalid uiSchema', () => {
    const result = admitFormDefinition(
      {
        ...createSamplePublishedDefinition(),
        uiSchema: ['not', 'an', 'object'],
      },
      { mode: 'citizen' },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('ui_schema_invalid')
    }
  })

  it('handles schema compilation failure without throwing', () => {
    const result = admitFormDefinition(
      createSamplePublishedDefinition({
        jsonSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            n: { type: 'number', exclusiveMinimum: 'not-a-number' },
          },
        },
      }),
      { mode: 'citizen' },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('schema_compile_failed')
      expect(result.publicReasonKey).toBe('formUnavailable')
    }
  })
})

describe('FB-B0 Ajv2020 validator', () => {
  it('enforces unevaluatedProperties (2020-12 keyword), not merely $schema string', () => {
    resetDg20FormValidatorForTests()
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        known: { type: 'string' },
      },
      unevaluatedProperties: false,
    }

    const validator = createDg20FormValidator()
    const valid = validator.rawValidation(schema, { known: 'ok' })
    expect(valid.validationError).toBeUndefined()
    expect(valid.errors ?? []).toHaveLength(0)

    const invalid = validator.rawValidation(schema, { known: 'ok', surprise: 1 })
    expect(invalid.validationError).toBeUndefined()
    const keywords = (invalid.errors ?? []).map((error) => {
      const record = error as { keyword?: string }
      return record.keyword
    })
    expect(keywords).toContain('unevaluatedProperties')
  })

  it('validates local $defs / $ref', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        person: { $ref: '#/$defs/person' },
      },
      required: ['person'],
      $defs: {
        person: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }

    const validator = getDg20FormValidator(schema)
    const bad = validator.rawValidation(schema, { person: {} })
    expect(bad.validationError).toBeUndefined()
    expect((bad.errors ?? []).length).toBeGreaterThan(0)

    const good = validator.rawValidation(schema, { person: { name: 'Asha' } })
    expect(good.validationError).toBeUndefined()
    expect(good.errors ?? []).toHaveLength(0)
  })

  it('tolerates custom x-dg20 keywords', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        mobile: {
          type: 'string',
          'x-dg20': { otpChannels: ['sms'] },
        },
      },
      additionalProperties: false,
    }
    expect(tryCompileFormSchema(schema).ok).toBe(true)
    const validator = getDg20FormValidator(schema)
    const result = validator.rawValidation(schema, { mobile: '9876543210' })
    expect(result.validationError).toBeUndefined()
    expect(result.errors ?? []).toHaveLength(0)
  })

  it('memoizes getDg20FormValidator by schema object identity', () => {
    resetDg20FormValidatorForTests()
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {},
    }
    const a = getDg20FormValidator(schema)
    const b = getDg20FormValidator(schema)
    expect(a).toBe(b)
  })
})
