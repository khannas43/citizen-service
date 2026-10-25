import { describe, expect, it } from 'vitest'
import { createAuthoringSession } from '../src/authoring/create-session.js'
import { addField } from '../src/authoring/add-field.js'
import { removeField } from '../src/authoring/remove-field.js'
import {
  addFamilyMember,
  getFamilyMemberCapabilities,
  removeFamilyMember,
  serializeFamilyRepeaterStructureBaseline,
} from '../src/authoring/family-repeater-authoring.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  ADDABLE_COUNT,
  PENDING_COUNT,
  isAddableWidgetType,
  isConfiguredAddableWidgetType,
} from '../src/authoring/templates.js'
import { PALETTE_WIDGET_COUNT } from '@citizen/form-widgets'
import { familyMemberDefinitionPath } from '../src/authoring/family-repeater-paths.js'

describe('FB-D16 smoke', () => {
  it('counts and add/remove family-repeater', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(isAddableWidgetType('family-repeater')).toBe(true)
    expect(isConfiguredAddableWidgetType('family-repeater')).toBe(true)
    expect(isAddableWidgetType('page-break')).toBe(true)

    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const added = addField(session, 'family-repeater', {
      configured: {
        widgetType: 'family-repeater',
        maxItems: 5,
        minItems: 0,
        initialMember: {
          widgetType: 'text-short',
          labelEn: 'Member name',
          labelGu: 'Sabhya',
          required: true,
        },
      },
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const fieldId = added.state.selectedFieldId!
    expect(added.state.definition.meta.paletteProvenance.some((p) => p.fieldId === fieldId)).toBe(
      true,
    )
    expect(
      added.state.definition.meta.paletteProvenance.some(
        (p) => p.fieldId === familyMemberDefinitionPath(fieldId, 'text_short_1'),
      ),
    ).toBe(true)
    expect(added.state.previewFormData[fieldId]).toBeUndefined()

    const caps = getFamilyMemberCapabilities(added.state.definition, fieldId)
    expect(caps.membersEditable).toBe(true)
    expect(caps.canRemoveMember).toBe(false)

    const baseline = serializeFamilyRepeaterStructureBaseline(added.state.definition, fieldId)
    const member2 = addFamilyMember(
      added.state,
      fieldId,
      { widgetType: 'email', labelEn: 'Email', labelGu: 'Email GU', required: false },
      baseline,
    )
    expect(member2.ok).toBe(true)
    if (!member2.ok) return

    const rootSchema = member2.state.definition.jsonSchema.properties?.[fieldId] as
      { items?: { properties?: Record<string, unknown> } } | undefined
    expect(Object.keys(rootSchema?.items?.properties ?? {})).toEqual(['text_short_1', 'email_1'])

    const baseline2 = serializeFamilyRepeaterStructureBaseline(member2.state.definition, fieldId)
    const blocked = removeFamilyMember(member2.state, fieldId, 'text_short_1', baseline2)
    // can remove when >1
    expect(blocked.ok).toBe(true)
    if (!blocked.ok) return
    const afterRemove = blocked.state.definition.jsonSchema.properties?.[fieldId] as
      { items?: { properties?: Record<string, unknown> } } | undefined
    expect(Object.keys(afterRemove?.items?.properties ?? {})).toEqual(['email_1'])

    const withExtra = addField(member2.state, 'text-short')
    expect(withExtra.ok).toBe(true)
    if (!withExtra.ok) return
    const removed = removeField(withExtra.state, fieldId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    const leftover = removed.state.definition.meta.paletteProvenance.filter(
      (p) => p.fieldId === fieldId || p.fieldId.startsWith(`${fieldId}[].`),
    )
    expect(leftover).toEqual([])
    expect(
      removed.state.definition.meta.bilingual.labels[`${fieldId}[].text_short_1`],
    ).toBeUndefined()
  })
})
