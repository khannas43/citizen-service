import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldProps } from '@rjsf/utils'

import type { BilingualContent } from '@dg20/form-contract'

import {
  FAMILY_REPEATER_GLOBAL_MAX_ROWS,
  assessFamilyRepeaterIncomingValue,
  buildFamilyRepeaterItemIdentity,
  emitFamilyRepeaterValue,
  reconcileFamilyRepeaterRowKeys,
  regenerateFamilyRepeaterRowKeys,
  resolveFamilyRepeaterConfig,
} from '../src/runtime/family-repeater.js'
import { renderFamilyRepeaterHarness } from './widget-harness.js'

const bilingual: BilingualContent = {
  labels: {
    family_members: { en: 'Family members', gu: 'કુટુંબ સભ્યો' },
    member_name: { en: 'Name', gu: 'નામ' },
    relationship: { en: 'Relationship', gu: 'સંબંધ' },
  },
  help: {
    family_members: {
      en: 'Add each dependent family member.',
      gu: 'દરેક આશ્રિત કુટુંબ સભ્ય ઉમેરો.',
    },
  },
  errors: {
    family_members: {
      en: 'Family list has errors.',
      gu: 'કુટુંબ યાદીમાં ભૂલો છે.',
    },
  },
}

const validItems = {
  type: 'object' as const,
  additionalProperties: false as const,
  properties: {
    member_name: { type: 'string' as const, title: 'Name', default: 'New member' },
    relationship: { type: 'string' as const, title: 'Relationship' },
  },
}

describe('FB-A12 family-repeater helpers', () => {
  it('resolves valid configuration', () => {
    const resolved = resolveFamilyRepeaterConfig({
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: validItems,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) {
      return
    }
    expect(resolved.minItems).toBe(1)
    expect(resolved.maxItems).toBe(5)
    expect(resolved.propertyKeys).toEqual(['member_name', 'relationship'])
  })

  it('rejects every invalid configuration case', () => {
    expect(resolveFamilyRepeaterConfig({ type: 'object' }).reason).toBe('not-array')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        maxItems: 5,
        items: [{ type: 'object' }, { type: 'object' }],
      }).reason,
    ).toBe('items-tuple')
    expect(
      resolveFamilyRepeaterConfig({ type: 'array', maxItems: 5, items: { type: 'string' } }).reason,
    ).toBe('items-not-object')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        maxItems: 5,
        items: { type: 'object', additionalProperties: false, properties: {} },
      }).reason,
    ).toBe('items-empty-properties')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        maxItems: 5,
        items: { type: 'object', properties: { a: { type: 'string' } } },
      }).reason,
    ).toBe('additional-properties-not-false')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        minItems: -1,
        maxItems: 5,
        items: validItems,
      }).reason,
    ).toBe('min-items-invalid')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        items: validItems,
      }).reason,
    ).toBe('max-items-invalid')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        minItems: 6,
        maxItems: 5,
        items: validItems,
      }).reason,
    ).toBe('min-exceeds-max')
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        maxItems: FAMILY_REPEATER_GLOBAL_MAX_ROWS + 1,
        items: validItems,
      }).reason,
    ).toBe('max-exceeds-global')
  })

  it('enforces the provisional 20-row global maximum constant', () => {
    expect(FAMILY_REPEATER_GLOBAL_MAX_ROWS).toBe(20)
    expect(
      resolveFamilyRepeaterConfig({
        type: 'array',
        maxItems: 20,
        items: validItems,
      }).ok,
    ).toBe(true)
  })

  it('classifies unanswered, malformed, oversized, and valid incoming values', () => {
    expect(assessFamilyRepeaterIncomingValue(undefined, 5).kind).toBe('unanswered')
    expect(assessFamilyRepeaterIncomingValue(null, 5).kind).toBe('unanswered')
    expect(assessFamilyRepeaterIncomingValue(true, 5).kind).toBe('malformed')
    expect(assessFamilyRepeaterIncomingValue([null], 5).kind).toBe('malformed')
    expect(assessFamilyRepeaterIncomingValue([[]], 5).kind).toBe('malformed')
    expect(assessFamilyRepeaterIncomingValue(['x'], 5).kind).toBe('malformed')
    expect(assessFamilyRepeaterIncomingValue([{}, {}, {}], 2).kind).toBe('oversized')
    expect(assessFamilyRepeaterIncomingValue([{ a: 1 }], 5)).toEqual({
      kind: 'valid',
      value: [{ a: 1 }],
    })
    expect(emitFamilyRepeaterValue([])).toBeUndefined()
    expect(emitFamilyRepeaterValue([{ a: 1 }])).toEqual([{ a: 1 }])
  })

  it('reconciles local row keys without using values as keys', () => {
    let seed = 0
    const keys = reconcileFamilyRepeaterRowKeys([], 2, () => ++seed)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toEqual(keys[1])
    expect(reconcileFamilyRepeaterRowKeys(keys, 2, () => ++seed)).toEqual(keys)
    expect(reconcileFamilyRepeaterRowKeys(keys, 1, () => ++seed)).toEqual([keys[0]])
  })

  it('builds item identity with ArrayField toIdSchema argument order', () => {
    const row = { member_name: 'Asha' }
    const rootSchema = { type: 'object' as const, properties: {} }
    const retrieveSchema = vi.fn((_schema: unknown, formData?: unknown) => {
      expect(formData).toBe(row)
      return {
        type: 'object',
        additionalProperties: false,
        properties: { member_name: { type: 'string' } },
        title: 'resolved',
      }
    })
    const toIdSchema = vi.fn(
      (
        schema: unknown,
        id?: string,
        formData?: unknown,
        idPrefix?: string,
        idSeparator?: string,
      ) => {
        expect(schema).toEqual(expect.objectContaining({ title: 'resolved' }))
        expect(id).toBe('root_family_members/0')
        expect(formData).toBe(row)
        expect(formData).not.toBe(rootSchema)
        expect(idPrefix).toBe('root')
        expect(idSeparator).toBe('/')
        return { $id: id }
      },
    )
    const identity = buildFamilyRepeaterItemIdentity({
      schemaUtils: { retrieveSchema, toIdSchema },
      itemsSchema: validItems,
      row,
      parentId: 'root_family_members',
      index: 0,
      idPrefix: 'root',
      idSeparator: '/',
    })
    expect(retrieveSchema).toHaveBeenCalledWith(validItems, row)
    expect(toIdSchema).toHaveBeenCalledTimes(1)
    expect(identity.itemIdPrefix).toBe('root_family_members/0')
    expect(identity.resolvedItemSchema).toEqual(expect.objectContaining({ title: 'resolved' }))
  })

  it('regenerates all keys for external replacement length', () => {
    let seed = 0
    const first = regenerateFamilyRepeaterRowKeys(2, () => ++seed)
    const second = regenerateFamilyRepeaterRowKeys(2, () => ++seed)
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(first).not.toEqual(second)
  })
})

describe('FamilyRepeaterWidget', () => {
  it('renders invalid configuration as a single alert without rows or controls', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        itemsSchema: { type: 'string' },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/misconfigured/i)
    expect(screen.queryByRole('button', { name: /Add family member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('unanswered value shows Add and does not auto-add rows', () => {
    const onChange = vi.fn()
    render(renderFamilyRepeaterHarness({ bilingual, minItems: 0, maxItems: 3, onChange }))
    expect(screen.getByRole('button', { name: /Add family member/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('malformed non-array values alert without rewrite', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: true,
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.queryByRole('heading', { name: /Family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects null/array/primitive rows as malformed', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [null, 'x', []],
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects oversized external arrays without partial render', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        maxItems: 2,
        formData: [{ member_name: 'a' }, { member_name: 'b' }, { member_name: 'c' }],
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.queryByRole('heading', { name: /Family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Add emits one default object only after explicit action', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderFamilyRepeaterHarness({ bilingual, onChange, itemsSchema: validItems }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Add family member/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    const emitted = onChange.mock.calls[0]?.[0] as Record<string, unknown>[]
    expect(Array.isArray(emitted)).toBe(true)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toEqual(expect.objectContaining({ member_name: 'New member' }))
    expect(JSON.stringify(emitted)).not.toMatch(/fr-row|React|key/i)
  })

  it('Remove deletes the correct index and last row emits undefined', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'One', relationship: 'A' },
          { member_name: 'Two', relationship: 'B' },
        ],
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Remove family member 1/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([{ member_name: 'Two', relationship: 'B' }])
    })
    await user.click(screen.getByRole('button', { name: /Remove family member 1/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(undefined)
    })
  })

  it('minItems prevents removal and below-minimum is not auto-filled', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        minItems: 2,
        maxItems: 5,
        formData: [{ member_name: 'Only', relationship: 'Child' }],
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/at least 2/i)
    expect(screen.queryByRole('button', { name: /Remove family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('heading', { name: /Family member/i })).toHaveLength(1)
  })

  it('maxItems prevents Add', () => {
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        maxItems: 1,
        formData: [{ member_name: 'Only', relationship: 'Child' }],
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Maximum of 1/i)
    expect(screen.queryByRole('button', { name: /Add family member/i })).not.toBeInTheDocument()
  })

  it('nested SchemaField renders member controls and child uiSchema widgets', () => {
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'Asha', relationship: 'Spouse' }],
        uiSchemaItems: {
          member_name: { 'ui:widget': 'text-short' },
          relationship: { 'ui:widget': 'text-short' },
        },
      }),
    )
    expect(screen.getByDisplayValue('Asha')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Spouse')).toBeInTheDocument()
    expect(document.querySelectorAll('.dg20-family-row .dg20-control').length).toBeGreaterThan(0)
  })

  it('editing a child updates only that row and preserves other values', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'One', relationship: 'A', age: 10 },
          { member_name: 'Two', relationship: 'B', age: 20 },
        ],
        itemsSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            member_name: { type: 'string' },
            relationship: { type: 'string' },
            age: { type: 'number' },
          },
        },
        onChange,
      }),
    )
    const firstName = screen.getByDisplayValue('One')
    await user.clear(firstName)
    await user.type(firstName, 'Updated')
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>[]
    expect(last[0]).toEqual(expect.objectContaining({ member_name: 'Updated', relationship: 'A' }))
    expect(last[1]).toEqual({ member_name: 'Two', relationship: 'B', age: 20 })
  })

  it('external rerender does not emit onChange', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'A', relationship: 'X' }],
        onChange,
      }),
    )
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'B', relationship: 'Y' }],
        onChange,
      }),
    )
    expect(screen.getByDisplayValue('B')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled and readonly hide mutation actions', () => {
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        disabled: true,
        formData: [{ member_name: 'A', relationship: 'X' }],
      }),
    )
    expect(screen.queryByRole('button', { name: /Add family member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove family member/i })).not.toBeInTheDocument()
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        readonly: true,
        formData: [{ member_name: 'A', relationship: 'X' }],
      }),
    )
    expect(screen.queryByRole('button', { name: /Add family member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove family member/i })).not.toBeInTheDocument()
  })

  it('localizes EN/GU row and action copy', () => {
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        locale: 'en',
        formData: [{ member_name: 'A', relationship: 'X' }],
      }),
    )
    expect(screen.getByRole('heading', { name: /Family member 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add family member/i })).toBeInTheDocument()
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        locale: 'gu',
        formData: [{ member_name: 'A', relationship: 'X' }],
      }),
    )
    expect(screen.getByRole('heading', { name: /કુટુંબ સભ્ય 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /કુટુંબ સભ્ય ઉમેરો/i })).toBeInTheDocument()
  })

  it('keeps unique row and nested-control IDs', () => {
    const { container } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'A', relationship: 'X' },
          { member_name: 'B', relationship: 'Y' },
        ],
      }),
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('presents raw bilingual errors without duplicate alerts', () => {
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'A', relationship: 'X' }],
        rawErrors: ['Family list has errors.'],
      }),
    )
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(/Family list has errors/i)
  })

  it('does not write local row keys into native FormData', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <form data-testid="family-form">{renderFamilyRepeaterHarness({ bilingual, onChange })}</form>,
    )
    await user.click(screen.getByRole('button', { name: /Add family member/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const fd = new FormData(screen.getByTestId('family-form') as HTMLFormElement)
    expect([...fd.keys()].every((k) => !k.includes('fr-row'))).toBe(true)
  })
})

describe('FB-A12.1 family-repeater identity integrity', () => {
  function TrackingSchemaFieldFactory(tracker: {
    mounts: { id: string; instance: number }[]
    schemas: unknown[]
    idSchemas: unknown[]
  }) {
    let nextInstance = 0
    return function TrackingSchemaField(props: FieldProps): ReactElement {
      const instance = useMemo(() => ++nextInstance, [])
      useEffect(() => {
        tracker.mounts.push({ id: String(props.idSchema?.$id ?? ''), instance })
        tracker.schemas.push(props.schema)
        tracker.idSchemas.push(props.idSchema)
      }, [instance, props.idSchema, props.schema])
      return (
        <div data-testid={`track-${props.idSchema?.$id ?? 'unknown'}`}>
          <span>
            {typeof props.formData === 'object' && props.formData !== null
              ? String((props.formData as { member_name?: unknown }).member_name ?? '')
              : ''}
          </span>
        </div>
      )
    }
  }

  it('passes resolved item schema and correct toIdSchema args through SchemaField', () => {
    const retrieveSchema = vi.fn((schema: unknown, formData?: unknown) => ({
      ...(schema as object),
      title: `resolved:${JSON.stringify(formData)}`,
    }))
    const toIdSchema = vi.fn(
      (
        _schema: unknown,
        id?: string,
        _formData?: unknown,
        _idPrefix?: string,
        _idSeparator?: string,
      ) => ({
        $id: id,
      }),
    )
    const tracker = { mounts: [], schemas: [] as unknown[], idSchemas: [] as unknown[] }
    const row = { member_name: 'Asha', relationship: 'Spouse' }
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [row],
        idPrefix: 'root',
        idSeparator: '/',
        SchemaField: TrackingSchemaFieldFactory(tracker),
        schemaUtils: {
          retrieveSchema: retrieveSchema as never,
          toIdSchema: toIdSchema as never,
        },
      }),
    )
    expect(retrieveSchema).toHaveBeenCalledWith(expect.objectContaining({ type: 'object' }), row)
    expect(toIdSchema).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('resolved:') }),
      'root_family_members/0',
      row,
      'root',
      '/',
    )
    expect(tracker.schemas[0]).toEqual(
      expect.objectContaining({ title: expect.stringContaining('resolved:') }),
    )
  })

  it('internal Add retains existing row instance identity', async () => {
    const user = userEvent.setup()
    const tracker = { mounts: [] as { id: string; instance: number }[], schemas: [], idSchemas: [] }
    const SchemaField = TrackingSchemaFieldFactory(tracker)
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'One', relationship: 'A' }],
        SchemaField,
      }),
    )
    await waitFor(() => expect(tracker.mounts.length).toBeGreaterThan(0))
    const firstInstance = tracker.mounts[0]?.instance
    await user.click(screen.getByRole('button', { name: /Add family member/i }))
    await waitFor(() => expect(tracker.mounts.length).toBeGreaterThanOrEqual(2))
    const remountsOfFirst = tracker.mounts.filter((m) => m.id.endsWith('_0') || m.id.endsWith('/0'))
    // Surviving first row keeps the same React instance (no remount with new instance id).
    expect(remountsOfFirst.some((m) => m.instance === firstInstance)).toBe(true)
    expect(remountsOfFirst.filter((m) => m.instance !== firstInstance)).toHaveLength(0)
  })

  it('internal removal retains surviving row instance identity', async () => {
    const user = userEvent.setup()
    const tracker = { mounts: [] as { id: string; instance: number }[], schemas: [], idSchemas: [] }
    const SchemaField = TrackingSchemaFieldFactory(tracker)
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'One', relationship: 'A' },
          { member_name: 'Two', relationship: 'B' },
        ],
        SchemaField,
      }),
    )
    await waitFor(() => expect(tracker.mounts.length).toBeGreaterThanOrEqual(2))
    const secondBefore = tracker.mounts.find((m) => m.id.endsWith('_1') || m.id.endsWith('/1'))
    expect(secondBefore).toBeDefined()
    await user.click(screen.getByRole('button', { name: /Remove family member 1/i }))
    await waitFor(() => {
      expect(screen.getByText('Two')).toBeInTheDocument()
    })
    const surviving = tracker.mounts.filter((m) => m.instance === secondBefore?.instance)
    expect(surviving.length).toBeGreaterThan(0)
  })

  it('same-length external replacement regenerates row keys (remounts children)', async () => {
    const tracker = { mounts: [] as { id: string; instance: number }[], schemas: [], idSchemas: [] }
    const SchemaField = TrackingSchemaFieldFactory(tracker)
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'Old', relationship: 'A' }],
        SchemaField,
      }),
    )
    await waitFor(() => expect(tracker.mounts.length).toBeGreaterThan(0))
    const before = tracker.mounts[0]?.instance
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'New', relationship: 'B' }],
        SchemaField,
      }),
    )
    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument()
    })
    const afterInstances = tracker.mounts.map((m) => m.instance)
    expect(afterInstances.some((id) => id !== before)).toBe(true)
  })

  it('external deletion does not transfer transient child state by index', async () => {
    const user = userEvent.setup()
    function StatefulChild(props: FieldProps): ReactElement {
      const [draft, setDraft] = useState(() =>
        typeof props.formData === 'object' && props.formData !== null
          ? String((props.formData as { member_name?: unknown }).member_name ?? '')
          : '',
      )
      return (
        <input
          aria-label={`member-${props.idSchema?.$id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      )
    }
    const onChange = vi.fn()
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'Keep', relationship: 'A' },
          { member_name: 'Drop', relationship: 'B' },
        ],
        SchemaField: StatefulChild,
        onChange,
      }),
    )
    const first = screen.getByLabelText(/member-root_family_members_0/)
    await user.clear(first)
    await user.type(first, 'EditedKeep')
    expect(first).toHaveValue('EditedKeep')
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'Only surviving external', relationship: 'A' }],
        SchemaField: StatefulChild,
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue('Only surviving external')).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue('EditedKeep')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('key reconciliation never calls onChange', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'A', relationship: 'X' }],
        onChange,
      }),
    )
    rerender(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'B', relationship: 'Y' }],
        onChange,
      }),
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores invalid nested child emissions', async () => {
    const onChange = vi.fn()
    function BadChild(props: FieldProps): ReactElement {
      useEffect(() => {
        props.onChange(null as never)
        props.onChange(['nope'] as never)
        props.onChange('primitive' as never)
      }, [props])
      return <div>bad-child</div>
    }
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'Safe', relationship: 'A' }],
        SchemaField: BadChild,
        onChange,
      }),
    )
    await waitFor(() => expect(screen.getByText('bad-child')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('missing SchemaField fails safely without rows or onChange', () => {
    const onChange = vi.fn()
    render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [{ member_name: 'A', relationship: 'X' }],
        omitSchemaField: true,
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/misconfigured/i)
    expect(screen.queryByRole('button', { name: /Add family member/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Family member/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps unique nested IDs after identity hotfix', () => {
    const { container } = render(
      renderFamilyRepeaterHarness({
        bilingual,
        formData: [
          { member_name: 'A', relationship: 'X' },
          { member_name: 'B', relationship: 'Y' },
        ],
        idSeparator: '_',
      }),
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
