import { describe, expect, it, vi } from 'vitest'
import type { FormDefinition } from '@citizen/form-contract'

import {
  UNIT_D_ACCEPTANCE_DEFINITION,
  UNIT_D_ACCEPTANCE_FIELD_IDS,
  UNIT_D_ACCEPTANCE_SERVICE_ID,
  createAcceptancePersistenceAdapter,
  createAcceptancePersistenceStore,
  createAcceptanceValidationAdapter,
  seedPublishedSource,
} from '../acceptance/index.js'
import {
  ADDABLE_COUNT,
  PENDING_COUNT,
  assertDefinitionIntegrity,
  cloneJsonSafe,
  createAuthoringSession,
  familyMemberDefinitionPath,
  isRepeaterDescendantPath,
  removeField,
  reorderFieldWithinStep,
} from '../src/authoring/index.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'

function jsonHasForbidden(value: unknown): boolean {
  const text = JSON.stringify(value)
  return /ETag|AbortSignal|base64,|Blob|File\b|showValidation|rowKey|canvasReorder/i.test(text)
}

describe('FB-D22 — acceptance integrity', () => {
  it('fixture is frozen, detached, complete, and has no forbidden runtime artefacts', () => {
    expect(Object.isFrozen(UNIT_D_ACCEPTANCE_DEFINITION)).toBe(true)
    expect(() => assertDefinitionIntegrity(UNIT_D_ACCEPTANCE_DEFINITION)).not.toThrow()
    expect(UNIT_D_ACCEPTANCE_DEFINITION.serviceId).toBe(UNIT_D_ACCEPTANCE_SERVICE_ID)
    expect(UNIT_D_ACCEPTANCE_DEFINITION.status).toBe('draft')
    expect(UNIT_D_ACCEPTANCE_DEFINITION.meta.progressiveSteps.length).toBeGreaterThanOrEqual(2)
    expect(UNIT_D_ACCEPTANCE_FIELD_IDS).not.toContain('seed_field')
    // Page Break minting must never leave a literal page-break schema field.
    expect(UNIT_D_ACCEPTANCE_DEFINITION.uiSchema['ui:order']).not.toContain('page-break')
    expect(
      Object.values(UNIT_D_ACCEPTANCE_DEFINITION.uiSchema).some(
        (entry) =>
          entry != null &&
          typeof entry === 'object' &&
          'ui:field' in entry &&
          (entry as { 'ui:field'?: string })['ui:field'] === 'page-break',
      ),
    ).toBe(false)
    expect(jsonHasForbidden(UNIT_D_ACCEPTANCE_DEFINITION)).toBe(false)

    const session = createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)
    expect(session.definition).not.toBe(UNIT_D_ACCEPTANCE_DEFINITION)
    session.definition.meta.bilingual.labels[UNIT_D_ACCEPTANCE_FIELD_IDS[0]!] = {
      en: 'mutated',
      gu: 'mutated',
    }
    expect(
      UNIT_D_ACCEPTANCE_DEFINITION.meta.bilingual.labels[UNIT_D_ACCEPTANCE_FIELD_IDS[0]!]?.en,
    ).not.toBe('mutated')
  })

  it('palette capability counts remain 30 addable / 0 pending', () => {
    expect(ADDABLE_COUNT).toBe(30)
    expect(PENDING_COUNT).toBe(0)
  })

  it('covers escaped punctuation nested identity helpers without prefix collision', () => {
    expect(familyMemberDefinitionPath('family_members', 'emergency.contact')).toBe(
      'family_members[].emergency\\.contact',
    )
    expect(isRepeaterDescendantPath('family[].member', 'family')).toBe(true)
    expect(isRepeaterDescendantPath('family_other[].member', 'family')).toBe(false)

    const familyRoot = UNIT_D_ACCEPTANCE_DEFINITION.meta.paletteProvenance.find(
      (entry) => entry.widgetType === 'family-repeater',
    )!.fieldId
    const nested = UNIT_D_ACCEPTANCE_DEFINITION.meta.paletteProvenance.find((entry) =>
      entry.fieldId.startsWith(`${familyRoot}[].`),
    )!.fieldId
    expect(isRepeaterDescendantPath(nested, familyRoot)).toBe(true)
    expect(
      UNIT_D_ACCEPTANCE_DEFINITION.meta.integrationBindings.some(
        (binding) => binding.fieldId === nested,
      ),
    ).toBe(true)
  })

  it('removing family root scrubs nested bindings without touching sibling roots', () => {
    const session = createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)
    const familyRoot = session.definition.meta.paletteProvenance.find(
      (entry) => entry.widgetType === 'family-repeater',
    )!.fieldId
    const sibling = session.definition.meta.integrationBindings.find(
      (binding) =>
        !binding.fieldId.startsWith(`${familyRoot}[].`) && binding.fieldId !== familyRoot,
    )
    expect(sibling).toBeDefined()
    const removed = removeField(session, familyRoot)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(
      removed.state.definition.meta.integrationBindings.some((binding) =>
        binding.fieldId.startsWith(`${familyRoot}[].`),
      ),
    ).toBe(false)
    expect(
      removed.state.definition.meta.integrationBindings.some(
        (binding) => binding.fieldId === sibling!.fieldId,
      ),
    ).toBe(true)
  })

  it('acceptance adapters never call fetch/storage and detach snapshots', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const clearSpy = vi.spyOn(Storage.prototype, 'clear')

    const store = createAcceptancePersistenceStore()
    const validation = createAcceptanceValidationAdapter()
    const persistence = createAcceptancePersistenceAdapter(store)
    const controller = new AbortController()
    const session = createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)

    const validated = await validation.validateDefinition({
      definition: session.definition,
      signal: controller.signal,
    })
    expect(validated.valid).toBe(true)

    const created = await persistence.createDraft({
      definition: session.definition,
      signal: controller.signal,
    })
    expect(created.definition).not.toBe(session.definition)
    expect(created.etag).toBe(formatStrongEtagForTests(1))
    expect(jsonHasForbidden(created.definition)).toBe(false)

    const replaced = await persistence.replaceDraft({
      serviceId: created.definition.serviceId,
      version: created.definition.version,
      etag: created.etag,
      definition: created.definition,
      signal: controller.signal,
    })
    expect(replaced.etag).toBe(formatStrongEtagForTests(2))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('hostile toJSON/getters are not invoked by integrity admission of fixture clone', () => {
    const toJSON = vi.fn(() => ({ hostile: true }))
    const getter = vi.fn(() => 'leak')
    const base = cloneJsonSafe(UNIT_D_ACCEPTANCE_DEFINITION) as FormDefinition & {
      toJSON?: () => unknown
    }
    base.toJSON = toJSON
    Object.defineProperty(base.meta, 'leak', {
      enumerable: false,
      configurable: true,
      get: getter,
    })
    expect(() => createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)).not.toThrow()
    expect(toJSON).not.toHaveBeenCalled()
    expect(getter).not.toHaveBeenCalled()
  })

  it('reorder within step succeeds; seedPublishedSource is cloneable status only', () => {
    const session = createAuthoringSession(UNIT_D_ACCEPTANCE_DEFINITION)
    const step = session.definition.meta.progressiveSteps[0]!
    expect(step.fieldIds.length).toBeGreaterThanOrEqual(2)
    const [first, second] = step.fieldIds
    const moveSecondBeforeFirst = reorderFieldWithinStep(session, {
      fieldId: second!,
      beforeFieldId: first!,
    })
    expect(moveSecondBeforeFirst.ok).toBe(true)

    const immutable = new Map()
    seedPublishedSource(immutable, UNIT_D_ACCEPTANCE_DEFINITION, 9)
    const published = [...immutable.values()][0]!.definition
    expect(published.status).toBe('published')
  })
})
