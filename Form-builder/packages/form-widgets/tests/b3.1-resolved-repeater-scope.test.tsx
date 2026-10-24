import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import {
  appendArrayIndex,
  appendArrayIndexToResolvedPath,
  appendArrayTemplate,
  appendArrayTemplateToResolvedPath,
  escapeFieldPathSegment,
} from '../src/runtime/field-id.js'
import {
  NestedFieldIdentityScope,
  useNestedFieldIdentityScope,
} from '../src/runtime/nested-field-identity.js'
import type { FieldIdResolver } from '../src/runtime/field-id.js'
import type { CafPrefillAdapter } from '../src/runtime/service-ports.js'
import { WidgetRuntimeProvider } from '../src/runtime/widget-context.js'
import { useFieldChrome } from '../src/runtime/widget-helpers.js'
import { renderFamilyRepeaterHarness } from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingualResolved: BilingualContent = {
  labels: {
    family_members: { en: 'Family members', gu: 'કુટુંબ' },
    dependants: { en: 'Dependants', gu: 'આશ્રિતો' },
    'dependants[].member_name': { en: 'Dependant name', gu: 'આશ્રિત નામ' },
    'dependants[].caf_name': { en: 'CAF name', gu: 'CAF નામ' },
    households: { en: 'Households', gu: 'ઘર' },
    'households_alias[].dependants[].name': { en: 'Person name', gu: 'વ્યક્તિ નામ' },
  },
  help: {
    'dependants[].member_name': {
      en: 'Resolved-path help.',
      gu: 'રિઝોલ્વ્ડ મદદ.',
    },
  },
  errors: {
    'dependants[].member_name': {
      en: 'Dependant name required.',
      gu: 'આશ્રિત નામ જરૂરી.',
    },
  },
}

function IdentityProbe(props: { readonly name: string; readonly id?: string }): ReactElement {
  const chrome = useFieldChrome({
    name: props.name,
    id: props.id ?? `root_${props.name}`,
    idSchema: { $id: props.id ?? `root_${props.name}` },
  })
  const scope = useNestedFieldIdentityScope()
  return (
    <div
      data-testid={`probe-${props.name}`}
      data-definition={chrome.definitionFieldId}
      data-instance={chrome.instanceFieldId}
      data-scope-def={scope?.definitionPrefix ?? ''}
      data-scope-inst={scope?.instancePrefix ?? ''}
      data-label={chrome.label.text}
      data-help={chrome.help.text ?? ''}
      data-error={chrome.errorMessages.join('|')}
    />
  )
}

describe('FB-B3.1 resolved-path array helpers', () => {
  it('appends markers without escaping the resolved path', () => {
    expect(appendArrayTemplateToResolvedPath('dependants')).toBe('dependants[]')
    expect(appendArrayIndexToResolvedPath('householdMembers', 2)).toBe('householdMembers[2]')
    expect(appendArrayTemplateToResolvedPath('households_alias[].dependants')).toBe(
      'households_alias[].dependants[]',
    )
    expect(appendArrayIndexToResolvedPath('a.b[0].c', 1)).toBe('a.b[0].c[1]')
  })

  it('keeps prefix+raw-name helpers and escaping unchanged', () => {
    expect(escapeFieldPathSegment('a.b')).toBe('a\\.b')
    expect(appendArrayTemplate(null, 'family_members')).toBe('family_members[]')
    expect(appendArrayIndex(null, 'family_members', 0)).toBe('family_members[0]')
    expect(appendArrayTemplate('households[]', 'a.b')).toBe('households[].a\\.b[]')
  })
})

describe('FB-B3.1 FamilyRepeater preserves resolver output in row scopes', () => {
  it('propagates a legacy string resolver rename to children', () => {
    const resolveFieldId: FieldIdResolver = (input) =>
      input.name === 'family_members' ? 'dependants' : input.name

    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualResolved,
        formData: [{ member_name: 'A', relationship: 'Child' }],
        resolveFieldId,
      }),
    )

    expect(screen.getByText('Dependant name')).toBeTruthy()
    expect(screen.getByText('Resolved-path help.')).toBeTruthy()
  })

  it('propagates structured resolver with distinct definition and instance ids', () => {
    const resolveFieldId: FieldIdResolver = (input) => {
      if (input.name === 'family_members') {
        return {
          definitionFieldId: 'dependants',
          instanceFieldId: 'householdMembers',
        }
      }
      return input.name
    }

    render(
      <WidgetRuntimeProvider
        bilingual={bilingualResolved}
        locale="en"
        resolveFieldId={resolveFieldId}
      >
        <NestedFieldIdentityScope
          definitionPrefix={appendArrayTemplateToResolvedPath('dependants')}
          instancePrefix={appendArrayIndexToResolvedPath('householdMembers', 0)}
        >
          <IdentityProbe name="member_name" id="root_family_members_0_member_name" />
        </NestedFieldIdentityScope>
      </WidgetRuntimeProvider>,
    )

    const probe = screen.getByTestId('probe-member_name')
    expect(probe).toHaveAttribute('data-definition', 'dependants[].member_name')
    expect(probe).toHaveAttribute('data-instance', 'householdMembers[0].member_name')
    expect(probe).toHaveAttribute('data-label', 'Dependant name')
    expect(probe).toHaveAttribute('data-help', 'Resolved-path help.')
  })

  it('composes two-level nested repeaters with resolver mappings at both levels', () => {
    const resolveFieldId: FieldIdResolver = (input) => {
      if (input.name === 'households') {
        return { definitionFieldId: 'households_alias', instanceFieldId: 'households_alias' }
      }
      if (input.name === 'members') {
        return { definitionFieldId: 'dependants', instanceFieldId: 'dependants' }
      }
      return input.name
    }

    // Simulate FamilyRepeater B3.1: scopes extend resolved chrome identities.
    const outerDef = appendArrayTemplateToResolvedPath('households_alias')
    const outerInst = appendArrayIndexToResolvedPath('households_alias', 1)
    const innerChromeDef = `${outerDef}.dependants`
    const innerChromeInst = `${outerInst}.dependants`

    render(
      <WidgetRuntimeProvider
        bilingual={bilingualResolved}
        locale="en"
        resolveFieldId={resolveFieldId}
      >
        <NestedFieldIdentityScope definitionPrefix={outerDef} instancePrefix={outerInst}>
          <NestedFieldIdentityScope
            definitionPrefix={appendArrayTemplateToResolvedPath(innerChromeDef)}
            instancePrefix={appendArrayIndexToResolvedPath(innerChromeInst, 2)}
          >
            <IdentityProbe name="name" id="root_h1_m2_name" />
          </NestedFieldIdentityScope>
        </NestedFieldIdentityScope>
      </WidgetRuntimeProvider>,
    )

    const probe = screen.getByTestId('probe-name')
    expect(probe).toHaveAttribute('data-definition', 'households_alias[].dependants[].name')
    expect(probe).toHaveAttribute('data-instance', 'households_alias[1].dependants[2].name')
    expect(probe).toHaveAttribute('data-label', 'Person name')
  })

  it('uses resolved definition path for CAF binding and indexed instance for adapter', async () => {
    const seen: { requestField?: string } = {}
    const adapter: CafPrefillAdapter = {
      async resolvePrefill(request) {
        seen.requestField = request.fieldId
        return { value: 'From CAF', confidence: 0.95 }
      },
    }
    const bindings: readonly PrefillBinding[] = [
      {
        fieldId: 'dependants[].caf_name',
        cafAttribute: 'FATHER_NAME',
        confidenceMin: 0.5,
      },
    ]
    const resolveFieldId: FieldIdResolver = (input) => {
      if (input.name === 'family_members') {
        return {
          definitionFieldId: 'dependants',
          instanceFieldId: 'householdMembers',
        }
      }
      return input.name
    }

    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualResolved,
        formData: [{ caf_name: undefined }],
        itemsSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            caf_name: {
              type: 'object',
              title: 'CAF name',
              properties: {
                value: { type: 'string' },
                source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
              },
              additionalProperties: false,
            },
          },
        },
        uiSchemaItems: {
          caf_name: { 'ui:field': 'caf-prefill' },
        },
        services: { cafPrefill: adapter },
        prefillBindings: bindings,
        resolveFieldId,
      }),
    )

    await waitFor(() => {
      expect(seen.requestField).toBe('householdMembers[0].caf_name')
    })
    expect(bindings[0]?.fieldId).toBe('dependants[].caf_name')
    await waitFor(() => {
      expect(screen.getByDisplayValue('From CAF')).toBeTruthy()
    })
  })

  it('aborts stale CAF work after reindex when using custom instance paths', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (value: { value: string; confidence: number }) => void
    const firstGate = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolveFirst = resolve
    })
    const requests: string[] = []
    const adapter: CafPrefillAdapter = {
      async resolvePrefill(request) {
        requests.push(request.fieldId)
        if (request.fieldId === 'householdMembers[0].caf_name') {
          return firstGate
        }
        return { value: 'CAF-ROW-1', confidence: 0.95 }
      },
    }
    const bindings: readonly PrefillBinding[] = [
      {
        fieldId: 'dependants[].caf_name',
        cafAttribute: 'FATHER_NAME',
        confidenceMin: 0.5,
      },
    ]
    const resolveFieldId: FieldIdResolver = (input) => {
      if (input.name === 'family_members') {
        return {
          definitionFieldId: 'dependants',
          instanceFieldId: 'householdMembers',
        }
      }
      return input.name
    }
    const onChange = vi.fn()

    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualResolved,
        formData: [{ caf_name: undefined }, { caf_name: undefined }],
        itemsSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            caf_name: {
              type: 'object',
              title: 'CAF name',
              properties: {
                value: { type: 'string' },
                source: { type: 'string', enum: ['CAF', 'OVERRIDE'] },
              },
              additionalProperties: false,
            },
          },
        },
        uiSchemaItems: {
          caf_name: { 'ui:field': 'caf-prefill' },
        },
        services: { cafPrefill: adapter },
        prefillBindings: bindings,
        resolveFieldId,
        onChange,
        minItems: 0,
      }),
    )

    await waitFor(() => {
      expect(requests).toContain('householdMembers[0].caf_name')
      expect(requests).toContain('householdMembers[1].caf_name')
    })

    await user.click(screen.getAllByRole('button', { name: /Remove family member/i })[0]!)
    resolveFirst({ value: 'STALE-ROW-0', confidence: 0.99 })

    await waitFor(() => {
      const serialized = JSON.stringify(onChange.mock.calls.map((c) => c[0]))
      expect(serialized).not.toContain('STALE-ROW-0')
      expect(serialized).not.toMatch(/dependants|householdMembers|rowKey|fr-row|family_members/)
    })
  })

  it('keeps default paths unchanged', () => {
    render(
      renderFamilyRepeaterHarness({
        bilingual: {
          labels: {
            family_members: { en: 'Family members', gu: 'કુટુંબ' },
            'family_members[].member_name': { en: 'Member name', gu: 'નામ' },
          },
          help: {},
          errors: {},
        },
        formData: [{ member_name: 'A', relationship: 'Child' }],
      }),
    )
    expect(screen.getByText('Member name')).toBeTruthy()
  })
})
