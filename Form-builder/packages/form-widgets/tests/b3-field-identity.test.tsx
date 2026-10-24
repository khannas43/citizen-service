import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { BilingualContent, PrefillBinding } from '@dg20/form-contract'

import {
  appendArrayIndex,
  appendArrayTemplate,
  appendProperty,
  escapeFieldPathSegment,
  normalizeFieldIdResolverResult,
  resolveCanonicalFieldId,
  resolveFieldIdentity,
} from '../src/runtime/field-id.js'
import {
  NestedFieldIdentityScope,
  useNestedFieldIdentityScope,
} from '../src/runtime/nested-field-identity.js'
import { WidgetRuntimeProvider } from '../src/runtime/widget-context.js'
import { useFieldChrome } from '../src/runtime/widget-helpers.js'
import type { CafPrefillAdapter } from '../src/runtime/service-ports.js'
import { renderFamilyRepeaterHarness, renderTextShortHarness } from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingualNested: BilingualContent = {
  labels: {
    family_members: { en: 'Family members', gu: 'કુટુંબ સભ્યો' },
    'family_members[].member_name': { en: 'Member name', gu: 'સભ્ય નામ' },
    'family_members[].relationship': { en: 'Relationship', gu: 'સંબંધ' },
    'family_members[].caf_name': { en: 'CAF name', gu: 'CAF નામ' },
    'family_members[].member_email': { en: 'Member email', gu: 'સભ્ય ઇમેઇલ' },
    applicant_full_name: { en: 'Applicant', gu: 'અરજદાર' },
    'a_b-name.with[brackets]': { en: 'Odd name', gu: 'વિચિત્ર' },
  },
  help: {
    'family_members[].member_name': {
      en: 'Enter the dependent name.',
      gu: 'આશ્રિતનું નામ દાખલ કરો.',
    },
  },
  errors: {
    'family_members[].member_name': {
      en: 'Member name is required.',
      gu: 'સભ્ય નામ જરૂરી છે.',
    },
  },
}

function IdentityProbe(props: {
  readonly name: string
  readonly id?: string
  readonly label?: string
  readonly rawErrors?: string[]
}): ReactElement {
  const chrome = useFieldChrome({
    name: props.name,
    id: props.id ?? `root_${props.name}`,
    idSchema: { $id: props.id ?? `root_${props.name}` },
    label: props.label,
    rawErrors: props.rawErrors,
  })
  const scope = useNestedFieldIdentityScope()
  return (
    <div
      data-testid={`probe-${props.name}`}
      data-definition={chrome.definitionFieldId}
      data-instance={chrome.instanceFieldId}
      data-field-alias={chrome.fieldId}
      data-scope-def={scope?.definitionPrefix ?? ''}
      data-scope-inst={scope?.instancePrefix ?? ''}
      data-control-id={chrome.controlId}
      data-label={chrome.label.text}
      data-help={chrome.help.text ?? ''}
      data-error={chrome.errorMessages.join('|')}
    />
  )
}

describe('FB-B3 field path helpers', () => {
  it('escapes path metacharacters in segments', () => {
    expect(escapeFieldPathSegment('a.b')).toBe('a\\.b')
    expect(escapeFieldPathSegment('x[0]')).toBe('x\\[0\\]')
    expect(escapeFieldPathSegment('a\\b')).toBe('a\\\\b')
    expect(escapeFieldPathSegment('plain_name-ok')).toBe('plain_name-ok')
  })

  it('builds template and indexed array paths', () => {
    expect(appendArrayTemplate(null, 'family_members')).toBe('family_members[]')
    expect(appendArrayIndex(null, 'family_members', 0)).toBe('family_members[0]')
    expect(appendProperty('family_members[]', 'member_name')).toBe('family_members[].member_name')
    expect(appendArrayTemplate('households[]', 'members')).toBe('households[].members[]')
    expect(appendArrayIndex('households[1]', 'members', 2)).toBe('households[1].members[2]')
    expect(appendProperty('households[].members[]', 'name')).toBe('households[].members[].name')
  })
})

describe('FB-B3 resolveFieldIdentity', () => {
  it('keeps top-level identities exact and backward compatible', () => {
    const id = resolveFieldIdentity({ name: 'applicant_full_name' })
    expect(id).toEqual({
      definitionFieldId: 'applicant_full_name',
      instanceFieldId: 'applicant_full_name',
    })
    expect(resolveCanonicalFieldId('applicant_full_name', { $id: 'root_x' }, undefined)).toBe(
      'applicant_full_name',
    )
  })

  it('never splits underscore or hyphen names from RJSF ids', () => {
    expect(
      resolveCanonicalFieldId('address_line-1', { $id: 'root_address_line-1_extra' }, undefined),
    ).toBe('address_line-1')
    expect(
      resolveFieldIdentity({
        name: 'a_b-name.with[brackets]',
        idSchema: { $id: 'root_a_b-name.with[brackets]' },
      }),
    ).toEqual({
      definitionFieldId: 'a_b-name.with[brackets]',
      instanceFieldId: 'a_b-name.with[brackets]',
    })
  })

  it('normalizes legacy string resolver results', () => {
    expect(normalizeFieldIdResolverResult('leaf')).toEqual({
      definitionFieldId: 'leaf',
      instanceFieldId: 'leaf',
    })
    expect(
      normalizeFieldIdResolverResult({
        definitionFieldId: 'def',
        instanceFieldId: 'inst',
      }),
    ).toEqual({ definitionFieldId: 'def', instanceFieldId: 'inst' })
  })

  it('supports structured resolver results under scope', () => {
    const id = resolveFieldIdentity({
      name: 'ignored',
      resolver: () => ({
        definitionFieldId: 'custom_leaf',
        instanceFieldId: 'custom_leaf',
      }),
      definitionPrefix: 'family_members[]',
      instancePrefix: 'family_members[1]',
    })
    expect(id).toEqual({
      definitionFieldId: 'family_members[].custom_leaf',
      instanceFieldId: 'family_members[1].custom_leaf',
    })
  })

  it('returns definitionFieldId from resolveCanonicalFieldId with scope', () => {
    expect(
      resolveCanonicalFieldId('member_name', undefined, undefined, {
        definitionPrefix: 'family_members[]',
        instancePrefix: 'family_members[0]',
      }),
    ).toBe('family_members[].member_name')
  })
})

describe('FB-B3 NestedFieldIdentityScope composition', () => {
  it('composes two array levels for nested repeater scopes', () => {
    render(
      <WidgetRuntimeProvider bilingual={bilingualNested} locale="en">
        <NestedFieldIdentityScope definitionPrefix="households[]" instancePrefix="households[1]">
          <NestedFieldIdentityScope
            definitionPrefix={appendArrayTemplate('households[]', 'members')}
            instancePrefix={appendArrayIndex('households[1]', 'members', 2)}
          >
            <IdentityProbe name="name" id="root_h1_m2_name" />
          </NestedFieldIdentityScope>
        </NestedFieldIdentityScope>
      </WidgetRuntimeProvider>,
    )
    const probe = screen.getByTestId('probe-name')
    expect(probe).toHaveAttribute('data-definition', 'households[].members[].name')
    expect(probe).toHaveAttribute('data-instance', 'households[1].members[2].name')
    expect(probe).toHaveAttribute('data-field-alias', 'households[1].members[2].name')
    expect(probe).toHaveAttribute('data-control-id', 'root_h1_m2_name')
  })
})

describe('FB-B3 FamilyRepeater nested identity', () => {
  it('shares one definition template across rows with distinct instance ids', () => {
    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
        formData: [
          { member_name: 'A', relationship: 'Child' },
          { member_name: 'B', relationship: 'Spouse' },
        ],
        uiSchemaItems: {
          member_name: { 'ui:widget': 'text-short' },
          relationship: { 'ui:widget': 'text-short' },
        },
      }),
    )

    const labels = screen.getAllByText('Member name')
    expect(labels.length).toBe(2)
    const helps = screen.getAllByText('Enter the dependent name.')
    expect(helps.length).toBe(2)

    const inputs = document.querySelectorAll('input[id]')
    const ids = [...inputs].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.some((id) => id.includes('family_members'))).toBe(true)
  })

  it('uses [] definition paths for bilingual labels, help, and errors', () => {
    render(
      <WidgetRuntimeProvider bilingual={bilingualNested} locale="en">
        <NestedFieldIdentityScope
          definitionPrefix="family_members[]"
          instancePrefix="family_members[0]"
        >
          <IdentityProbe
            name="member_name"
            id="root_family_members_0_member_name"
            rawErrors={['must be string']}
          />
        </NestedFieldIdentityScope>
      </WidgetRuntimeProvider>,
    )
    const probe = screen.getByTestId('probe-member_name')
    expect(probe).toHaveAttribute('data-definition', 'family_members[].member_name')
    expect(probe).toHaveAttribute('data-instance', 'family_members[0].member_name')
    expect(probe).toHaveAttribute('data-label', 'Member name')
    expect(probe).toHaveAttribute('data-help', 'Enter the dependent name.')
    expect(probe).toHaveAttribute('data-error', 'Member name is required.')
  })

  it('looks up CAF bindings by definition path and requests with instance path', async () => {
    const seen: { requestField?: string } = {}
    const adapter: CafPrefillAdapter = {
      async resolvePrefill(request) {
        seen.requestField = request.fieldId
        return { value: 'From CAF', confidence: 0.95 }
      },
    }
    const bindings: readonly PrefillBinding[] = [
      {
        fieldId: 'family_members[].caf_name',
        cafAttribute: 'FATHER_NAME',
        confidenceMin: 0.5,
      },
    ]

    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
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
      }),
    )

    await waitFor(() => {
      expect(seen.requestField).toBe('family_members[0].caf_name')
    })
    expect(bindings[0]?.fieldId).toBe('family_members[].caf_name')
    await waitFor(() => {
      expect(screen.getByDisplayValue('From CAF')).toBeTruthy()
    })
  })

  it('aborts stale CAF requests when a row is removed and indexes shift', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (value: { value: string; confidence: number }) => void
    const firstGate = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolveFirst = resolve
    })
    const requests: string[] = []
    const adapter: CafPrefillAdapter = {
      async resolvePrefill(request) {
        requests.push(request.fieldId)
        if (request.fieldId === 'family_members[0].caf_name') {
          return firstGate
        }
        return { value: 'CAF-ROW-1', confidence: 0.95 }
      },
    }
    const bindings: readonly PrefillBinding[] = [
      {
        fieldId: 'family_members[].caf_name',
        cafAttribute: 'FATHER_NAME',
        confidenceMin: 0.5,
      },
    ]

    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
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
        onChange,
        minItems: 0,
      }),
    )

    await waitFor(() => {
      expect(requests).toContain('family_members[0].caf_name')
      expect(requests).toContain('family_members[1].caf_name')
    })

    const removeButtons = screen.getAllByRole('button', { name: /Remove family member/i })
    await user.click(removeButtons[0]!)

    resolveFirst({ value: 'STALE-ROW-0', confidence: 0.99 })

    await waitFor(() => {
      const calls = onChange.mock.calls.map((c) => c[0])
      const serialized = JSON.stringify(calls)
      expect(serialized).not.toContain('STALE-ROW-0')
      const latest = calls.at(-1) as unknown[]
      expect(Array.isArray(latest)).toBe(true)
      expect(latest).toHaveLength(1)
      expect(JSON.stringify(latest)).not.toMatch(/rowKey|fr-row|definitionFieldId|instanceFieldId/)
    })
  })

  it('regenerates row identity safely on external replacement without leaking keys', async () => {
    function Harness(): ReactElement {
      const [formData, setFormData] = useState<unknown>([
        { member_name: 'Old', relationship: 'Child' },
      ])
      return (
        <div>
          <button
            type="button"
            onClick={() => setFormData([{ member_name: 'New', relationship: 'Spouse' }])}
          >
            replace
          </button>
          {renderFamilyRepeaterHarness({
            bilingual: bilingualNested,
            formData,
            onChange: (next) => setFormData(next),
          })}
        </div>
      )
    }

    const user = userEvent.setup()
    const { container } = render(<Harness />)
    expect(screen.getByDisplayValue('Old')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'replace' }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('New')).toBeTruthy()
    })
    expect(container.innerHTML).not.toMatch(/definitionFieldId|instanceFieldId/)
  })

  it('does not put identity paths or React row keys in emitted formData', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
        formData: [],
        onChange,
        minItems: 0,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Add family member/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const emitted = onChange.mock.calls.at(-1)?.[0]
    expect(JSON.stringify(emitted)).not.toMatch(/family_members\[|\[\]|rowKey|fr-/)
    expect(Array.isArray(emitted)).toBe(true)
  })
})

describe('FB-B3 top-level chrome compatibility', () => {
  it('exposes matching definition and instance ids for top-level fields', () => {
    render(
      <WidgetRuntimeProvider bilingual={bilingualNested} locale="en">
        <IdentityProbe name="applicant_full_name" label="Applicant" />
      </WidgetRuntimeProvider>,
    )
    const probe = screen.getByTestId('probe-applicant_full_name')
    expect(probe).toHaveAttribute('data-definition', 'applicant_full_name')
    expect(probe).toHaveAttribute('data-instance', 'applicant_full_name')
    expect(probe).toHaveAttribute('data-field-alias', 'applicant_full_name')
    expect(probe).toHaveAttribute('data-label', 'Applicant')
  })

  it('keeps DOM control ids from RJSF, not canonical paths', () => {
    render(
      renderTextShortHarness({
        bilingual: bilingualNested,
        name: 'applicant_full_name',
        id: 'root_applicant_full_name',
      }),
    )
    const input = document.querySelector('input')
    expect(input?.id).toBe('root_applicant_full_name')
    expect(input?.id).not.toContain('[]')
  })
})

describe('FB-B3 unique DOM ids across FormRenderer-like dual mounts', () => {
  it('keeps control ids unique across two repeater instances', () => {
    const { container } = render(
      <div>
        {renderFamilyRepeaterHarness({
          bilingual: bilingualNested,
          formData: [{ member_name: 'A', relationship: 'Child' }],
          name: 'family_members_a',
        })}
        {renderFamilyRepeaterHarness({
          bilingual: bilingualNested,
          formData: [{ member_name: 'B', relationship: 'Child' }],
          name: 'family_members_b',
        })}
      </div>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('FB-B3 axe nested widgets', () => {
  it('has no serious a11y violations for nested EN/GU family rows', async () => {
    const en = render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
        locale: 'en',
        formData: [
          { member_name: 'A', relationship: 'Child' },
          { member_name: 'B', relationship: 'Spouse' },
        ],
      }),
    )
    expect(await axe(en.container)).toHaveNoViolations()
    en.unmount()

    const gu = render(
      renderFamilyRepeaterHarness({
        bilingual: bilingualNested,
        locale: 'gu',
        formData: [
          { member_name: 'A', relationship: 'Child' },
          { member_name: 'B', relationship: 'Spouse' },
        ],
      }),
    )
    expect(await axe(gu.container)).toHaveNoViolations()
  })
})
