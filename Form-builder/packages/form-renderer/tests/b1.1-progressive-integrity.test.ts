import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { admitFormDefinition } from '../src/definition-admission.js'
import {
  APPROVED_STEP_UI_ROOT_DIRECTIVES,
  buildProgressivePlan,
  deriveStepSchema,
  deriveStepUiSchema,
  normalizeStepUiOrder,
} from '../src/progressive-steps.js'
import * as validator2020 from '../src/validator-2020.js'
import {
  createProgressiveDefWithLegacyDefinitions,
  createProgressiveDefWithLocalRef,
  createProgressiveDefWithTransitiveDefs,
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
  deepFreeze,
} from './fixtures.js'

const packageSrc = join(dirname(fileURLToPath(import.meta.url)), '../src')

describe('FB-B1.1 definition bags', () => {
  it('retains complete $defs for A→B transitive refs and unused siblings', () => {
    const definition = createProgressiveDefWithTransitiveDefs()
    const rootDefs = (definition.jsonSchema as { $defs: Record<string, unknown> }).$defs
    const derived = deriveStepSchema(definition.jsonSchema, ['token'])
    expect(derived.$defs).toBe(rootDefs)
    expect(derived.$defs).toEqual(rootDefs)
    expect(derived.$defs).toHaveProperty('wrapper')
    expect(derived.$defs).toHaveProperty('leaf')
    expect(derived.$defs).toHaveProperty('unusedSibling')
    expect(validator2020.tryCompileFormSchema(derived).ok).toBe(true)
  })

  it('preserves nested JSON Pointer references inside a definition', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        payload: { $ref: '#/$defs/envelope' },
        other: { type: 'string' },
      },
      $defs: {
        envelope: {
          type: 'object',
          required: ['nested'],
          properties: {
            nested: { $ref: '#/$defs/detail' },
          },
          additionalProperties: false,
        },
        detail: { type: 'string', minLength: 1 },
      },
    }
    const derived = deriveStepSchema(schema, ['payload'])
    expect(derived.$defs).toEqual(schema.$defs)
    expect(
      (derived.$defs as { envelope: { properties: { nested: unknown } } }).envelope.properties
        .nested,
    ).toEqual({ $ref: '#/$defs/detail' })
    expect(validator2020.tryCompileFormSchema(derived).ok).toBe(true)
  })

  it('retains complete legacy definitions bag', () => {
    const definition = createProgressiveDefWithLegacyDefinitions()
    const rootDefinitions = (definition.jsonSchema as { definitions: Record<string, unknown> })
      .definitions
    const derived = deriveStepSchema(definition.jsonSchema, ['legacy_code'])
    expect(derived.definitions).toBe(rootDefinitions)
    expect(validator2020.tryCompileFormSchema(derived).ok).toBe(true)
    const admitted = admitFormDefinition(definition, { mode: 'citizen' })
    expect(admitted.ok).toBe(true)
  })

  it('does not mutate frozen root definition bags', () => {
    const definition = deepFreeze(createProgressiveDefWithTransitiveDefs())
    const before = JSON.stringify(definition.jsonSchema)
    deriveStepSchema(definition.jsonSchema, ['token'])
    buildProgressivePlan({
      jsonSchema: definition.jsonSchema,
      uiSchema: definition.uiSchema,
      progressiveSteps: definition.meta.progressiveSteps,
    })
    expect(JSON.stringify(definition.jsonSchema)).toBe(before)
    expect(Object.isFrozen((definition.jsonSchema as { $defs: object }).$defs)).toBe(true)
  })

  it('direct local $defs fixture still works with full-bag retention', () => {
    const definition = createProgressiveDefWithLocalRef()
    const schema = deriveStepSchema(definition.jsonSchema, ['code_a'])
    expect(schema.$defs).toEqual({ code: { type: 'string', minLength: 2 } })
    expect(validator2020.tryCompileFormSchema(schema).ok).toBe(true)
  })
})

describe('FB-B1.1 uiSchema allow-list and order', () => {
  it('approves only ui:order at the root', () => {
    expect([...APPROVED_STEP_UI_ROOT_DIRECTIVES]).toEqual(['ui:order'])
  })

  it('drops prohibited root ui:* directives and keeps field entries', () => {
    const ui = deriveStepUiSchema(
      {
        'ui:order': ['a', 'b'],
        'ui:field': 'rogue-root-field',
        'ui:widget': 'rogue-root-widget',
        'ui:options': { label: false },
        'ui:submitButtonOptions': { norender: true },
        'ui:rootFieldId': 'hack',
        'ui:disabled': true,
        'ui:unknown': 'nope',
        a: { 'ui:widget': 'text-short' },
        b: { 'ui:widget': 'number' },
        c: { 'ui:widget': 'yesno' },
      },
      ['a', 'b'],
    )
    expect(Object.keys(ui).filter((key) => key.startsWith('ui:'))).toEqual(['ui:order'])
    expect(ui['ui:order']).toEqual(['a', 'b'])
    expect(ui).toHaveProperty('a')
    expect(ui).toHaveProperty('b')
    expect(ui).not.toHaveProperty('c')
  })

  it('normalizeStepUiOrder covers complete, incomplete, wildcard, dupes, and junk', () => {
    expect(normalizeStepUiOrder(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeStepUiOrder(['a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(normalizeStepUiOrder(['b', '*', 'a', 'other'], ['a', 'b'])).toEqual(['b', '*', 'a'])
    expect(normalizeStepUiOrder(['*', '*', 'a'], ['a', 'b'])).toEqual(['*', 'a'])
    expect(normalizeStepUiOrder(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeStepUiOrder([1, null, 'a', {}, 'b'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeStepUiOrder(undefined, ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('FB-B1.1 admission plan reuse', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('successful single-page admission includes single_page plan', () => {
    const result = admitFormDefinition(createSamplePublishedDefinition(), { mode: 'citizen' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan).toEqual({ kind: 'single_page' })
    }
  })

  it('successful progressive admission includes validated plan with stable step schemas', () => {
    const definition = createProgressivePublishedDefinition()
    const result = admitFormDefinition(definition, { mode: 'citizen' })
    expect(result.ok).toBe(true)
    if (!result.ok || result.plan.kind !== 'progressive') {
      throw new Error('expected progressive admission')
    }
    const firstSchema = result.plan.steps[0]!.schema
    const firstUi = result.plan.steps[0]!.uiSchema
    expect(result.plan.steps[0]!.schema).toBe(firstSchema)
    expect(result.plan.steps[0]!.uiSchema).toBe(firstUi)
    expect(result.definition).toBe(definition)
  })

  it('rejects when a derived step schema fails to compile', () => {
    const definition = createProgressivePublishedDefinition()
    const originalTryCompile = validator2020.tryCompileFormSchema
    vi.spyOn(validator2020, 'tryCompileFormSchema').mockImplementation((schema: object) => {
      const asRecord = schema as { properties?: Record<string, unknown> }
      const keys = asRecord.properties ? Object.keys(asRecord.properties) : []
      // Root schema has all six fields; derived step schemas have a subset.
      if (keys.length > 0 && keys.length < 6) {
        return { ok: false, errorMessage: 'forced step compile failure' }
      }
      return originalTryCompile(schema)
    })

    const result = admitFormDefinition(definition, { mode: 'citizen' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('progressive_steps_invalid')
      expect(result.publicReasonKey).toBe('formUnavailable')
    }
  })

  it('FormRenderer does not import buildProgressivePlan', () => {
    const source = readFileSync(join(packageSrc, 'FormRenderer.tsx'), 'utf8')
    expect(source).not.toMatch(/buildProgressivePlan/)
    expect(source).toMatch(/plan/)
  })
})
