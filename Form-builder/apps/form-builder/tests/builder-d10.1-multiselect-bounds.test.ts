import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'
import { getDg20FormValidator } from '@citizen/form-renderer'

import {
  ADDABLE_COUNT,
  AuthoringError,
  PENDING_COUNT,
  addField,
  assertDefinitionIntegrity,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  getAuthoringTemplate,
  isPropertyEditorDirty,
  readFieldConfiguration,
  updateFieldConfiguration,
  validateFieldConfigurationDraft,
  configurationToDraft,
} from '../src/authoring/index.js'
import { assessMultiselectEffectiveBounds } from '../src/authoring/multiselect-bounds.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function applyConfig(
  state: ReturnType<typeof createAuthoringSession>,
  fieldId: string,
  configuration: Parameters<typeof updateFieldConfiguration>[2],
) {
  const expected = readFieldConfiguration(state.definition, fieldId)
  return updateFieldConfiguration(state, fieldId, configuration, expected)
}

function readSchema(definition: FormDefinition, fieldId: string): Record<string, unknown> {
  const properties = definition.jsonSchema['properties'] as Record<string, Record<string, unknown>>
  return properties[fieldId]!
}

function addOptionalMultiselect() {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'multiselect', {
    configured: { widgetType: 'multiselect', masterListId: 'status-list' },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('add failed')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D10.1 — required multiselect explicit minItems', () => {
  it('keeps counts at 30 / 0 / 30', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
  })

  it('rejects required + missing minItems on Property Apply and focuses minItems', () => {
    const { state, fieldId } = addOptionalMultiselect()
    let ui = createAuthoringUiState(state)
    ui = authoringReducer(ui, { type: 'select', fieldId })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId,
      patch: { required: true, minItems: '' },
    })
    expect(isPropertyEditorDirty(ui, fieldId)).toBe(true)
    const draft = ui.editorDrafts[fieldId]!.draft
    const validation = validateFieldConfigurationDraft(draft)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues[0]).toMatchObject({
      code: 'required_min_items_invalid',
      control: 'minItems',
    })

    ui = authoringReducer(ui, { type: 'applyEditorDraft', fieldId })
    expect(ui.pendingFocusEditorControl).toBe('minItems')
    expect(ui.editorDrafts[fieldId]?.propertyShowValidation).toBe(true)
  })

  it('rejects required + minItems 0; accepts required + minItems 1', () => {
    const { state, fieldId } = addOptionalMultiselect()
    const committed = readFieldConfiguration(state.definition, fieldId)
    expect(applyConfig(state, fieldId, { ...committed, required: true, minItems: '0' }).ok).toBe(
      false,
    )

    const accepted = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '1',
      maxItems: '3',
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(readSchema(accepted.state.definition, fieldId)).toMatchObject({
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
    })
  })

  it('rejects required + minItems 2 / maxItems 1', () => {
    const { state, fieldId } = addOptionalMultiselect()
    const committed = readFieldConfiguration(state.definition, fieldId)
    const result = applyConfig(state, fieldId, {
      ...committed,
      required: true,
      minItems: '2',
      maxItems: '1',
    })
    expect(result.ok).toBe(false)
  })

  it('accepts optional multiselect with omitted minItems', () => {
    expect(
      assessMultiselectEffectiveBounds({
        minItems: undefined,
        maxItems: undefined,
        required: false,
      }).ok,
    ).toBe(true)
    const { state, fieldId } = addOptionalMultiselect()
    expect(readSchema(state.definition, fieldId)).not.toHaveProperty('minItems')
    assertDefinitionIntegrity(state.definition)
  })

  it('integrity rejects loaded required multiselect without minItems or with minItems 0', () => {
    const { state, fieldId } = addOptionalMultiselect()
    const missing = structuredClone(state.definition) as FormDefinition
    const required = missing.jsonSchema['required']
    if (Array.isArray(required)) {
      required.push(fieldId)
    } else {
      missing.jsonSchema['required'] = [fieldId]
    }
    expect(() => assertDefinitionIntegrity(missing)).toThrow(AuthoringError)
    try {
      assertDefinitionIntegrity(missing)
    } catch (error) {
      expect(error).toBeInstanceOf(AuthoringError)
      expect((error as AuthoringError).code).toBe('inconsistent_definition')
    }

    const zero = structuredClone(missing) as FormDefinition
    readSchema(zero, fieldId)['minItems'] = 0
    expect(() => assertDefinitionIntegrity(zero)).toThrow(AuthoringError)

    const ok = structuredClone(missing) as FormDefinition
    readSchema(ok, fieldId)['minItems'] = 1
    expect(() => assertDefinitionIntegrity(ok)).not.toThrow()
  })

  it('toggling required off does not remove an existing minimum', () => {
    const { state, fieldId } = addOptionalMultiselect()
    const withMin = applyConfig(state, fieldId, {
      ...readFieldConfiguration(state.definition, fieldId),
      required: true,
      minItems: '2',
    })
    expect(withMin.ok).toBe(true)
    if (!withMin.ok) return
    const draft = configurationToDraft(readFieldConfiguration(withMin.state.definition, fieldId))
    const cleared = applyConfig(withMin.state, fieldId, {
      ...draft,
      required: false,
    })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(readSchema(cleared.state.definition, fieldId)['minItems']).toBe(2)
  })
})

describe('FB-D10.1 — AJV validates canonical required multiselect schema', () => {
  function canonicalRequiredSchema(maxItems?: number): Record<string, unknown> {
    const template = getAuthoringTemplate('multiselect')!
    if (template.addMode !== 'configured') throw new Error('expected configured')
    const fieldSchema = template.buildSchema({
      widgetType: 'multiselect',
      masterListId: 'status-list',
      minItems: 1,
      maxItems,
    })
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { choice: fieldSchema },
      required: ['choice'],
      additionalProperties: false,
    }
  }

  it('rejects [], accepts one code, rejects duplicates, respects maxItems', () => {
    const schema = canonicalRequiredSchema(2)
    const validator = getDg20FormValidator(schema)

    const empty = validator.rawValidation(schema, { choice: [] })
    expect(empty.errors?.length ?? 0).toBeGreaterThan(0)

    const one = validator.rawValidation(schema, { choice: ['A'] })
    expect(one.errors ?? []).toHaveLength(0)

    const dup = validator.rawValidation(schema, { choice: ['A', 'A'] })
    expect(dup.errors?.length ?? 0).toBeGreaterThan(0)

    const overMax = validator.rawValidation(schema, { choice: ['A', 'B', 'C'] })
    expect(overMax.errors?.length ?? 0).toBeGreaterThan(0)
  })

  it('optional multiselect may omit minItems and accept []', () => {
    const template = getAuthoringTemplate('multiselect')!
    if (template.addMode !== 'configured') throw new Error('expected configured')
    const fieldSchema = template.buildSchema({
      widgetType: 'multiselect',
      masterListId: 'status-list',
    })
    expect(fieldSchema).not.toHaveProperty('minItems')
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { choice: fieldSchema },
      additionalProperties: false,
    }
    const validator = getDg20FormValidator(schema)
    const empty = validator.rawValidation(schema, { choice: [] })
    expect(empty.errors ?? []).toHaveLength(0)
    const missing = validator.rawValidation(schema, {})
    expect(missing.errors ?? []).toHaveLength(0)
  })
})
