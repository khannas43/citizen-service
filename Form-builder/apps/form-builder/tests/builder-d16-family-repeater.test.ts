import { describe, expect, it } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'
import { FAMILY_REPEATER_GLOBAL_MAX_ROWS, PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'

import {
  ADDABLE_COUNT,
  ADDABLE_WIDGET_TYPES,
  FAMILY_MEMBER_WIDGET_TYPES,
  FIELD_ADDABLE_COUNT,
  PENDING_COUNT,
  STRUCTURAL_ADDABLE_COUNT,
  addFamilyMember,
  addField,
  allocateMemberPropertyId,
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  familyMemberDefinitionPath,
  getAuthoringTemplate,
  getFamilyMemberCapabilities,
  isAddableWidgetType,
  isAdmittedFamilyRepeaterSchema,
  isConfiguredAddableWidgetType,
  isFamilyMemberWidgetType,
  isFamilyRepeaterDraftDirty,
  isRepeaterDescendantPath,
  isStructuralAddableWidgetType,
  moveFamilyMember,
  readFamilyRepeaterDraftContent,
  removeFamilyMember,
  removeField,
  seedFamilyRepeaterDraftContent,
  serializeFamilyRepeaterStructureBaseline,
  updateFamilyRepeaterConfiguration,
  validateFamilyRepeaterDraftContent,
} from '../src/authoring/index.js'
import {
  createEmptyPendingConfiguredAdd,
  patchPendingConfiguredAdd,
  validatePendingConfiguredAdd,
} from '../src/authoring/configured-add.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'

function readSchema(definition: FormDefinition, fieldId: string): Record<string, unknown> {
  const properties = definition.jsonSchema['properties'] as Record<string, Record<string, unknown>>
  return properties[fieldId]!
}

function addFamilyRepeater(
  options: {
    maxItems?: number
    minItems?: number | undefined
    memberWidget?: (typeof FAMILY_MEMBER_WIDGET_TYPES)[number]
    labelEn?: string
    labelGu?: string
    required?: boolean
  } = {},
) {
  const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
  const result = addField(session, 'family-repeater', {
    configured: {
      widgetType: 'family-repeater',
      maxItems: options.maxItems ?? 5,
      minItems: options.minItems,
      initialMember: {
        widgetType: options.memberWidget ?? 'text-short',
        labelEn: options.labelEn ?? 'Member name',
        labelGu: options.labelGu ?? 'સભ્યનું નામ',
        required: options.required ?? true,
      },
    },
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('failed to add family-repeater')
  return { state: result.state, fieldId: result.state.selectedFieldId! }
}

describe('FB-D16 — addable registry counts', () => {
  it('exposes exactly 30 addable, 0 pending, and 30 total', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(ADDABLE_WIDGET_TYPES).toHaveLength(30)
    expect(ADDABLE_COUNT + PENDING_COUNT).toBe(PALETTE_WIDGET_COUNT)
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(isAddableWidgetType('family-repeater')).toBe(true)
    expect(isConfiguredAddableWidgetType('family-repeater')).toBe(true)
    expect(isAddableWidgetType('page-break')).toBe(true)
    expect(isStructuralAddableWidgetType('page-break')).toBe(true)
    expect(getAuthoringTemplate('page-break')).toBeUndefined()
    expect(FIELD_ADDABLE_COUNT).toBe(29)
    expect(STRUCTURAL_ADDABLE_COUNT).toBe(1)
  })

  it('exposes explicit FAMILY_MEMBER_WIDGET_TYPES only (not inferred from category)', () => {
    expect([...FAMILY_MEMBER_WIDGET_TYPES]).toEqual([
      'text-short',
      'text-long',
      'number',
      'currency-inr',
      'percentage',
      'email',
      'dob',
      'gender',
      'yesno',
    ])
    expect(isFamilyMemberWidgetType('full-name')).toBe(false)
    expect(isFamilyMemberWidgetType('family-repeater')).toBe(false)
    expect(isFamilyMemberWidgetType('caf-prefill')).toBe(false)
  })
})

describe('FB-D16 — configured-add invalid/valid', () => {
  it('rejects invalid bounds and blank member labels; accepts valid Confirm payload', () => {
    const blank = createEmptyPendingConfiguredAdd('family-repeater')
    expect(validatePendingConfiguredAdd(blank)).toEqual({
      ok: false,
      firstInvalidControl: 'maxItems',
    })

    let pending = patchPendingConfiguredAdd(blank, { maxItems: '21' })
    expect(validatePendingConfiguredAdd(pending)).toEqual({
      ok: false,
      firstInvalidControl: 'maxItems',
    })

    pending = patchPendingConfiguredAdd(blank, { maxItems: '0' })
    expect(validatePendingConfiguredAdd(pending)).toEqual({
      ok: false,
      firstInvalidControl: 'maxItems',
    })

    pending = patchPendingConfiguredAdd(blank, { maxItems: '5', minItems: '6' })
    expect(validatePendingConfiguredAdd(pending)).toEqual({
      ok: false,
      firstInvalidControl: 'minItems',
    })

    pending = patchPendingConfiguredAdd(blank, {
      maxItems: '5',
      minItems: '0',
      initialMemberWidgetType: '',
    })
    expect(validatePendingConfiguredAdd(pending)).toEqual({
      ok: false,
      firstInvalidControl: 'initialMemberWidgetType',
    })

    pending = patchPendingConfiguredAdd(blank, {
      maxItems: '5',
      initialMemberWidgetType: 'text-short',
      initialMemberLabelEn: '  padded',
      initialMemberLabelGu: 'GU',
    })
    expect(validatePendingConfiguredAdd(pending)).toEqual({
      ok: false,
      firstInvalidControl: 'initialMemberLabelEn',
    })

    pending = patchPendingConfiguredAdd(blank, {
      maxItems: '20',
      minItems: '0',
      initialMemberWidgetType: 'email',
      initialMemberLabelEn: 'Email',
      initialMemberLabelGu: 'ઈમેલ',
      initialMemberRequired: false,
    })
    const valid = validatePendingConfiguredAdd(pending)
    expect(valid.ok).toBe(true)
    if (!valid.ok) return
    expect(valid.configured).toEqual({
      widgetType: 'family-repeater',
      minItems: 0,
      maxItems: 20,
      initialMember: {
        widgetType: 'email',
        labelEn: 'Email',
        labelGu: 'ઈમેલ',
        required: false,
      },
    })
  })

  it('accepts blank minItems (effective 0) and maxItems at 1 and 20', () => {
    for (const maxItems of ['1', '20'] as const) {
      const pending = patchPendingConfiguredAdd(
        createEmptyPendingConfiguredAdd('family-repeater'),
        {
          maxItems,
          minItems: '',
          initialMemberWidgetType: 'yesno',
          initialMemberLabelEn: 'Yes/No',
          initialMemberLabelGu: 'હા/ના',
        },
      )
      expect(validatePendingConfiguredAdd(pending).ok).toBe(true)
    }
  })
})

describe('FB-D16 — exact root/child schema and nested IDs', () => {
  it('Confirm creates exact root + initial child schema, ui, provenance, bilingual; no preview rows', () => {
    const { state, fieldId } = addFamilyRepeater({ maxItems: 5, minItems: 0, required: true })
    const schema = readSchema(state.definition, fieldId)
    expect(isAdmittedFamilyRepeaterSchema(schema)).toBe(true)
    expect(schema).not.toHaveProperty('x-dg20')
    expect(schema.type).toBe('array')
    expect(schema.maxItems).toBe(5)
    expect(schema.minItems).toBe(0)
    const items = schema.items as Record<string, unknown>
    expect(items.type).toBe('object')
    expect(items.additionalProperties).toBe(false)
    expect(items.required).toEqual(['text_short_1'])
    expect(Object.keys(items.properties as object)).toEqual(['text_short_1'])
    expect((items.properties as Record<string, unknown>)['text_short_1']).toEqual({
      type: 'string',
      maxLength: 120,
    })

    const nestedPath = familyMemberDefinitionPath(fieldId, 'text_short_1')
    expect(nestedPath).toBe(`${fieldId}[].text_short_1`)
    const uiEntry = state.definition.uiSchema[fieldId] as Record<string, unknown>
    expect(uiEntry['ui:field']).toBe('family-repeater')
    expect(uiEntry.items).toEqual({
      text_short_1: { 'ui:widget': 'text-short' },
    })
    expect(
      state.definition.meta.paletteProvenance.filter(
        (p) => p.fieldId === fieldId || p.fieldId === nestedPath,
      ),
    ).toEqual([
      { fieldId, widgetType: 'family-repeater' },
      { fieldId: nestedPath, widgetType: 'text-short' },
    ])
    expect(state.definition.meta.bilingual.labels[fieldId]).toBeDefined()
    expect(state.definition.meta.bilingual.labels[nestedPath]).toEqual({
      en: 'Member name',
      gu: 'સભ્યનું નામ',
    })
    expect(state.previewFormData[fieldId]).toBeUndefined()
    expect(JSON.stringify(state.definition)).not.toMatch(/__rowKey|rowKey|ETag/)
  })

  it('allocates deterministic nested IDs within the repeater only', () => {
    expect(allocateMemberPropertyId(new Set(), 'text-short')).toBe('text_short_1')
    expect(allocateMemberPropertyId(new Set(['text_short_1']), 'text-short')).toBe('text_short_2')
    expect(allocateMemberPropertyId(new Set(['email_1']), 'email')).toBe('email_2')
  })
})

describe('FB-D16 — member add/remove/reorder and last-member block', () => {
  it('adds, reorders, and removes members; blocks last-member removal', () => {
    const { state, fieldId } = addFamilyRepeater()
    const baseline0 = serializeFamilyRepeaterStructureBaseline(state.definition, fieldId)
    const caps0 = getFamilyMemberCapabilities(state.definition, fieldId)
    expect(caps0.canRemoveMember).toBe(false)
    expect(caps0.membersEditable).toBe(true)

    const blocked = removeFamilyMember(state, fieldId, 'text_short_1', baseline0)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('configuration_invalid')

    const added = addFamilyMember(
      state,
      fieldId,
      { widgetType: 'email', labelEn: 'Email', labelGu: 'ઈમેલ', required: false },
      baseline0,
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const props = (readSchema(added.state.definition, fieldId).items as { properties: object })
      .properties
    expect(Object.keys(props)).toEqual(['text_short_1', 'email_1'])

    const baseline1 = serializeFamilyRepeaterStructureBaseline(added.state.definition, fieldId)
    const moved = moveFamilyMember(added.state, fieldId, 'email_1', 'earlier', baseline1)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(
      Object.keys(
        (readSchema(moved.state.definition, fieldId).items as { properties: object }).properties,
      ),
    ).toEqual(['email_1', 'text_short_1'])

    const baseline2 = serializeFamilyRepeaterStructureBaseline(moved.state.definition, fieldId)
    const removed = removeFamilyMember(moved.state, fieldId, 'text_short_1', baseline2)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(
      Object.keys(
        (readSchema(removed.state.definition, fieldId).items as { properties: object }).properties,
      ),
    ).toEqual(['email_1'])
    expect(
      removed.state.definition.meta.paletteProvenance.some(
        (p) => p.fieldId === familyMemberDefinitionPath(fieldId, 'text_short_1'),
      ),
    ).toBe(false)
  })
})

describe('FB-D16 — child requiredness, constraints, and draft validation', () => {
  it('validates draft bounds 0/1/20 and rejects 21; previewRowCount blocks max below rows', () => {
    const { state, fieldId } = addFamilyRepeater({ maxItems: 5 })
    const draft = seedFamilyRepeaterDraftContent(state.definition, fieldId)

    expect(validateFamilyRepeaterDraftContent({ ...draft, maxItems: '1', minItems: '0' }).ok).toBe(
      true,
    )
    expect(validateFamilyRepeaterDraftContent({ ...draft, maxItems: '20', minItems: '' }).ok).toBe(
      true,
    )
    expect(validateFamilyRepeaterDraftContent({ ...draft, maxItems: '21' }).ok).toBe(false)
    expect(validateFamilyRepeaterDraftContent({ ...draft, maxItems: '0' }).ok).toBe(false)
    expect(
      validateFamilyRepeaterDraftContent({ ...draft, maxItems: '2' }, { previewRowCount: 3 }).ok,
    ).toBe(false)
  })

  it('updateFamilyRepeaterConfiguration applies member constraints and requiredness', () => {
    const { state, fieldId } = addFamilyRepeater({ required: false })
    const baseline = serializeFamilyRepeaterStructureBaseline(state.definition, fieldId)
    const draft = readFamilyRepeaterDraftContent(state.definition, fieldId)
    const member = draft.members[0]!
    const updated = updateFamilyRepeaterConfiguration(
      state,
      fieldId,
      {
        labelEn: draft.labelEn,
        labelGu: draft.labelGu,
        helpEn: '',
        helpGu: '',
        minItems: 1,
        maxItems: 4,
        members: [
          {
            propertyName: member.propertyName,
            configuration: {
              widgetType: 'text-short',
              labelEn: 'Renamed',
              labelGu: 'નામ',
              helpEn: '',
              helpGu: '',
              required: true,
              maxLength: '80',
              pattern: '',
            },
          },
        ],
      },
      baseline,
    )
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    const schema = readSchema(updated.state.definition, fieldId)
    expect(schema.minItems).toBe(1)
    expect(schema.maxItems).toBe(4)
    const items = schema.items as {
      required: string[]
      properties: Record<string, { maxLength?: number }>
    }
    expect(items.required).toEqual(['text_short_1'])
    expect(items.properties['text_short_1']!.maxLength).toBe(80)
    expect(
      updated.state.definition.meta.bilingual.labels[
        familyMemberDefinitionPath(fieldId, 'text_short_1')
      ],
    ).toEqual({ en: 'Renamed', gu: 'નામ' })
  })
})

describe('FB-D16 — escaped nested paths', () => {
  it('familyMemberDefinitionPath escapes punctuation-loaded property names once', () => {
    expect(familyMemberDefinitionPath('family_members', 'emergency.contact')).toBe(
      'family_members[].emergency\\.contact',
    )
    expect(familyMemberDefinitionPath('family_members', 'a\\b')).toBe('family_members[].a\\\\b')
  })
})

describe('FB-D16 — preview cleanup, max below rows, min no autofill', () => {
  it('member removal scrubs child keys from preview rows only; min increase does not autofill', () => {
    const { state, fieldId } = addFamilyRepeater({ maxItems: 5 })
    const baseline0 = serializeFamilyRepeaterStructureBaseline(state.definition, fieldId)
    const withMember = addFamilyMember(
      state,
      fieldId,
      { widgetType: 'gender', labelEn: 'Gender', labelGu: 'લિંગ', required: false },
      baseline0,
    )
    expect(withMember.ok).toBe(true)
    if (!withMember.ok) return

    const withPreview = {
      ...withMember.state,
      previewFormData: {
        ...withMember.state.previewFormData,
        [fieldId]: [
          { text_short_1: 'A', gender_1: 'M' },
          { text_short_1: 'B', gender_1: 'F' },
        ],
      },
    }
    const baseline1 = serializeFamilyRepeaterStructureBaseline(withPreview.definition, fieldId)
    const removed = removeFamilyMember(withPreview, fieldId, 'gender_1', baseline1)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.state.previewFormData[fieldId]).toEqual([
      { text_short_1: 'A' },
      { text_short_1: 'B' },
    ])

    const draft = readFamilyRepeaterDraftContent(removed.state.definition, fieldId)
    const baseline2 = serializeFamilyRepeaterStructureBaseline(removed.state.definition, fieldId)
    const raisedMin = updateFamilyRepeaterConfiguration(
      removed.state,
      fieldId,
      {
        labelEn: draft.labelEn,
        labelGu: draft.labelGu,
        helpEn: '',
        helpGu: '',
        minItems: 5,
        maxItems: 5,
        members: draft.members.map((m) => ({
          propertyName: m.propertyName,
          configuration: {
            widgetType: 'text-short',
            labelEn: m.configuration.labelEn,
            labelGu: m.configuration.labelGu,
            helpEn: m.configuration.helpEn,
            helpGu: m.configuration.helpGu,
            required: Boolean(
              (
                readSchema(removed.state.definition, fieldId).items as { required?: string[] }
              ).required?.includes(m.propertyName),
            ),
            maxLength: '120',
            pattern: '',
          },
        })),
      },
      baseline2,
    )
    expect(raisedMin.ok).toBe(true)
    if (!raisedMin.ok) return
    // Still two preview rows — no autofill for minItems.
    expect((raisedMin.state.previewFormData[fieldId] as unknown[]).length).toBe(2)

    const blockedMax = updateFamilyRepeaterConfiguration(
      raisedMin.state,
      fieldId,
      {
        labelEn: draft.labelEn,
        labelGu: draft.labelGu,
        helpEn: '',
        helpGu: '',
        minItems: 0,
        maxItems: 1,
        members: draft.members.map((m) => ({
          propertyName: m.propertyName,
          configuration: {
            widgetType: 'text-short',
            labelEn: m.configuration.labelEn,
            labelGu: m.configuration.labelGu,
            helpEn: '',
            helpGu: '',
            required: false,
            maxLength: '120',
            pattern: '',
          },
        })),
      },
      serializeFamilyRepeaterStructureBaseline(raisedMin.state.definition, fieldId),
    )
    expect(blockedMax.ok).toBe(false)
    if (!blockedMax.ok) expect(blockedMax.error.code).toBe('configuration_invalid')
  })
})

describe('FB-D16 — root removal, prefix collision, stale baselines', () => {
  it('root removal scrubs descendants; path helpers reject prefix collisions', () => {
    expect(isRepeaterDescendantPath('family[].member', 'family')).toBe(true)
    expect(isRepeaterDescendantPath('family_other[].member', 'family')).toBe(false)
    expect(isRepeaterDescendantPath('family_other', 'family')).toBe(false)
    expect(isRepeaterDescendantPath('family', 'family')).toBe(false)

    const { state, fieldId } = addFamilyRepeater()
    const withExtra = addField(state, 'text-short')
    expect(withExtra.ok).toBe(true)
    if (!withExtra.ok) return

    const session = {
      ...withExtra.state,
      selectedFieldId: fieldId,
      previewFormData: {
        ...withExtra.state.previewFormData,
        [fieldId]: [{ text_short_1: 'x' }],
      },
    }
    const removed = removeField(session, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(
      removed.state.definition.meta.paletteProvenance.filter(
        (p) => p.fieldId === fieldId || isRepeaterDescendantPath(p.fieldId, fieldId),
      ),
    ).toEqual([])
    expect(
      removed.state.definition.meta.bilingual.labels[`${fieldId}[].text_short_1`],
    ).toBeUndefined()
    expect(removed.state.previewFormData[fieldId]).toBeUndefined()
    // Sibling text-short remains.
    expect(
      Object.keys(removed.state.definition.jsonSchema.properties as object).length,
    ).toBeGreaterThan(0)
  })

  it('stale structure baseline rejects member mutations; inputs are never mutated', () => {
    const { state, fieldId } = addFamilyRepeater()
    const baseline = serializeFamilyRepeaterStructureBaseline(state.definition, fieldId)
    const snap = structuredClone(state.definition)
    const next = addFamilyMember(
      state,
      fieldId,
      { widgetType: 'number', labelEn: 'Age', labelGu: 'ઉંમર', required: false },
      baseline,
    )
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(state.definition).toEqual(snap)

    const stale = addFamilyMember(
      next.state,
      fieldId,
      { widgetType: 'dob', labelEn: 'DOB', labelGu: 'જન્મ', required: false },
      baseline,
    )
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.error.code).toBe('stale_editor_draft')
  })
})

describe('FB-D16 — isolation, unsaved gates, session replace, rapid reducer', () => {
  it('pendingConfiguredAdd family-repeater blocks unsaved gates; session replace clears it', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    let ui = createAuthoringUiState(session)
    ui = authoringReducer(ui, {
      type: 'beginConfiguredAdd',
      widgetType: 'family-repeater',
    })
    expect(ui.pendingConfiguredAdd?.widgetType).toBe('family-repeater')
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = authoringReducer(ui, {
      type: 'replaceAuthoringSession',
      definition: ILLUSTRATIVE_DRAFT_DEFINITION,
      previewPolicy: 'clear',
    })
    expect(ui.pendingConfiguredAdd).toBeNull()
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
  })

  it('draft dirty detection is pure; reducer member-draft map is a known gap', () => {
    const { state, fieldId } = addFamilyRepeater()
    const baseline = seedFamilyRepeaterDraftContent(state.definition, fieldId)
    const dirty = { ...baseline, maxItems: '9' }
    expect(isFamilyRepeaterDraftDirty(dirty, baseline)).toBe(true)
    expect(isFamilyRepeaterDraftDirty(baseline, baseline)).toBe(false)

    // Gap: FamilyRepeaterEditor / reducer member-draft map not wired — isolation with
    // Property/Bilingual/Bindings Apply is covered for pendingConfiguredAdd only here.
    const ui = createAuthoringUiState(state)
    expect(ui.bindingDrafts).toEqual({})
    expect(FAMILY_REPEATER_GLOBAL_MAX_ROWS).toBe(20)
  })

  it('rapid reducer configured-add patches serialize without mutating prior pending snapshots', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    let ui = createAuthoringUiState(session)
    ui = authoringReducer(ui, { type: 'beginConfiguredAdd', widgetType: 'family-repeater' })
    const first = ui.pendingConfiguredAdd
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { maxItems: '5' },
    })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { initialMemberWidgetType: 'text-short', initialMemberLabelEn: 'A' },
    })
    ui = authoringReducer(ui, {
      type: 'patchConfiguredAdd',
      patch: { initialMemberLabelGu: 'અ' },
    })
    expect(first).not.toBe(ui.pendingConfiguredAdd)
    expect(ui.pendingConfiguredAdd).toMatchObject({
      widgetType: 'family-repeater',
      maxItems: '5',
      initialMemberWidgetType: 'text-short',
      initialMemberLabelEn: 'A',
      initialMemberLabelGu: 'અ',
    })
  })
})
