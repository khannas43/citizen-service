import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrefillBinding } from '@citizen/form-contract'
import type { CafPrefillAdapter, CafPrefillRequest, FieldIdResolver } from '@citizen/form-widgets'

import { createCafSessionCoordinator } from '../src/caf-session-coordinator.js'
import { FormRenderer } from '../src/FormRenderer.js'
import {
  createProgressivePublishedDefinition,
  createSamplePublishedDefinition,
} from './fixtures.js'
import { renderFamilyRepeaterHarness } from '../../form-widgets/tests/widget-harness.js'

import '@citizen/form-widgets/styles/tokens.css'
import '@citizen/form-widgets/styles/widgets.css'
import '../src/styles/renderer.css'

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('FB-B5.1 CAF request lifecycle isolation', () => {
  it('aborted non-indexed request whose host ignores abort does not poison cache', async () => {
    const deferred = createDeferred<{ value: string; confidence: number }>()
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => deferred.promise),
    }
    const coordinator = createCafSessionCoordinator(host)
    const caller = new AbortController()

    const pending = coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal: caller.signal,
    })
    await waitFor(() => expect(host.resolvePrefill).toHaveBeenCalledTimes(1))
    caller.abort()

    // Host ignores abort and resolves late — must not admit or cache.
    deferred.resolve({ value: 'STALE', confidence: 0.99 })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(coordinator.settledEntryCount).toBe(0)

    const nextHost = vi.fn(async () => ({ value: 'Fresh', confidence: 0.95 }))
    host.resolvePrefill = nextHost
    const result = await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ value: 'Fresh', confidence: 0.95 })
    expect(nextHost).toHaveBeenCalledTimes(1)
    expect(coordinator.settledEntryCount).toBe(1)
  })

  it('two concurrent indexed calls are lifecycle-isolated', async () => {
    const gateA = createDeferred<{ value: string; confidence: number }>()
    const gateB = createDeferred<{ value: string; confidence: number }>()
    const signals: AbortSignal[] = []
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async (request: CafPrefillRequest) => {
        signals.push(request.signal)
        if (signals.length === 1) {
          return gateA.promise
        }
        return gateB.promise
      }),
    }
    const coordinator = createCafSessionCoordinator(host)
    const callerA = new AbortController()
    const callerB = new AbortController()

    const pendingA = coordinator.resolvePrefill({
      fieldId: 'family_members[0].caf_name',
      cafAttribute: 'name',
      signal: callerA.signal,
    })
    const pendingB = coordinator.resolvePrefill({
      fieldId: 'family_members[0].caf_name',
      cafAttribute: 'name',
      signal: callerB.signal,
    })

    await waitFor(() => expect(host.resolvePrefill).toHaveBeenCalledTimes(2))
    expect(signals[0]).not.toBe(signals[1])
    expect(coordinator.activeRequestCount).toBe(2)

    callerA.abort()
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)

    gateA.resolve({ value: 'FROM-A', confidence: 0.99 })
    await expect(pendingA).rejects.toMatchObject({ name: 'AbortError' })

    gateB.resolve({ value: 'FROM-B', confidence: 0.95 })
    await expect(pendingB).resolves.toEqual({ value: 'FROM-B', confidence: 0.95 })
    expect(coordinator.settledEntryCount).toBe(0)
  })

  it('dispose aborts every active host-facing signal and blocks late cache writes', async () => {
    const deferred = createDeferred<{ value: string; confidence: number }>()
    let hostSignal: AbortSignal | undefined
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async (request) => {
        hostSignal = request.signal
        return deferred.promise
      }),
    }
    const coordinator = createCafSessionCoordinator(host)
    const pending = coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal: new AbortController().signal,
    })
    await waitFor(() => expect(hostSignal).toBeDefined())
    expect(coordinator.activeRequestCount).toBe(1)

    coordinator.dispose()
    expect(hostSignal!.aborted).toBe(true)
    expect(coordinator.activeRequestCount).toBe(0)
    expect(coordinator.settledEntryCount).toBe(0)

    deferred.resolve({ value: 'LATE', confidence: 0.99 })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(coordinator.settledEntryCount).toBe(0)

    await expect(
      coordinator.resolvePrefill({
        fieldId: 'caf_father_name',
        cafAttribute: 'fatherName',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('FamilyRepeater reindex never applies aborted row’s late CAF result', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (value: { value: string; confidence: number }) => void
    const firstGate = new Promise<{ value: string; confidence: number }>((resolve) => {
      resolveFirst = resolve
    })
    const requests: string[] = []
    const host: CafPrefillAdapter = {
      async resolvePrefill(request) {
        requests.push(request.fieldId)
        if (
          request.fieldId === 'householdMembers[0].caf_name' &&
          requests.filter((id) => id === 'householdMembers[0].caf_name').length === 1
        ) {
          return firstGate
        }
        return { value: 'CAF-SURVIVOR', confidence: 0.95 }
      },
    }
    const coordinator = createCafSessionCoordinator(host)
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
        bilingual: {
          labels: {
            family_members: { en: 'Family members', gu: 'કુટુંબ' },
            'dependants[].caf_name': { en: 'CAF name', gu: 'CAF નામ' },
          },
          help: {},
          errors: {},
        },
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
        services: { cafPrefill: coordinator },
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
      expect(screen.getByDisplayValue('CAF-SURVIVOR')).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue('STALE-ROW-0')).toBeNull()
    expect(coordinator.settledEntryCount).toBe(0)
    const serialized = JSON.stringify(onChange.mock.calls.map((c) => c[0]))
    expect(serialized).not.toContain('STALE-ROW-0')
  })
})

describe('FB-B5.1 FormRenderer regressions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const progressiveDefinition = createProgressivePublishedDefinition()
  const singlePageDefinition = createSamplePublishedDefinition()

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('FormRenderer must not call fetch')
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('StrictMode still invokes host CAF adapter exactly once', async () => {
    const adapter: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ value: 'Strict', confidence: 0.95 })),
    }
    render(
      <StrictMode>
        <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Strict')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('settled non-indexed cache still works across Back/Next', async () => {
    const user = userEvent.setup()
    const adapter: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ found: false as const })),
    }
    render(<FormRenderer definition={progressiveDefinition} services={{ cafPrefill: adapter }} />)
    await waitFor(() => expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText(/Applicant name/i), {
      target: { value: 'Asha Patel' },
    })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeInTheDocument())
    expect(adapter.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('adapter swap ignores old late success', async () => {
    const deferred = createDeferred<{ value: string; confidence: number }>()
    const first: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => deferred.promise),
    }
    const second: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ value: 'Second', confidence: 0.95 })),
    }
    function Harness(): ReactElement {
      const [adapter, setAdapter] = useState(first)
      return (
        <div>
          <button type="button" onClick={() => setAdapter(second)}>
            swap
          </button>
          <FormRenderer definition={singlePageDefinition} services={{ cafPrefill: adapter }} />
        </div>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(first.resolvePrefill).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'swap' }))
    await waitFor(() => expect(screen.getByDisplayValue('Second')).toBeInTheDocument())
    deferred.resolve({ value: 'STALE', confidence: 0.99 })
    await Promise.resolve()
    expect(screen.queryByDisplayValue('STALE')).toBeNull()
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument()
    expect(second.resolvePrefill).toHaveBeenCalledTimes(1)
  })
})
