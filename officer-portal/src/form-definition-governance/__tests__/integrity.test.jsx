import { describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FormDefinitionGovernance from '../../screens/FormDefinitionGovernance.jsx'
import {
  admitAdapterQueueEnvelope,
  admitDetailAdapterEnvelope,
  admitDetailDefinition,
  admitGovernanceQueue,
  admitTransitionDefinition,
  appendQueuePage,
  cloneJsonSafe,
  createAdmittingFormDefinitionGovernanceAdapter,
  formatStrongEtagForTests,
  isExactDenseDataArray,
  GOVERNANCE_ERROR_CODES,
  GovernanceAdapterError,
} from '../index.js'
import { createMemoryGovernanceAdapter, makeDefinition } from './fixtures.js'

describe('cloneJsonSafe / array admission', () => {
  it('rejects sparse arrays, accessor indexes, extras, symbols, custom prototypes', () => {
    const sparse = []
    sparse[1] = 'x'
    expect(isExactDenseDataArray(sparse)).toBe(false)

    const accessor = ['a']
    Object.defineProperty(accessor, 0, {
      get() {
        return 'a'
      },
      enumerable: true,
      configurable: true,
    })
    expect(isExactDenseDataArray(accessor)).toBe(false)

    const enumerableExtra = ['a']
    Object.defineProperty(enumerableExtra, 'extra', {
      value: 1,
      enumerable: true,
      configurable: true,
    })
    expect(isExactDenseDataArray(enumerableExtra)).toBe(false)

    const nonEnumExtra = ['a']
    Object.defineProperty(nonEnumExtra, 'hidden', {
      value: 1,
      enumerable: false,
      configurable: true,
    })
    expect(isExactDenseDataArray(nonEnumExtra)).toBe(false)

    const withSymbol = ['a']
    Object.defineProperty(withSymbol, Symbol('s'), {
      value: 1,
      enumerable: false,
      configurable: true,
    })
    expect(isExactDenseDataArray(withSymbol)).toBe(false)

    const customProto = Object.setPrototypeOf(['a'], Object.create(Array.prototype))
    expect(isExactDenseDataArray(customProto)).toBe(false)

    const arr = ['a']
    const originalDescriptor = Object.getOwnPropertyDescriptor.bind(Object)
    const spy = vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((target, prop) => {
      if (target === arr && prop === 'length') {
        return { value: 1, enumerable: true, configurable: false, writable: true }
      }
      return originalDescriptor(target, prop)
    })
    expect(isExactDenseDataArray(arr)).toBe(false)
    spy.mockRestore()

    expect(isExactDenseDataArray(['a', 'b'])).toBe(true)
  })

  it('never invokes root accessors or nested toJSON; rejects hostile Proxy generically', () => {
    let hits = 0
    const hostile = {
      get items() {
        hits += 1
        return []
      },
      get nextCursor() {
        hits += 1
        return null
      },
    }
    expect(admitAdapterQueueEnvelope(hostile).ok).toBe(false)
    expect(hits).toBe(0)

    const snap = makeDefinition({ status: 'submitted' })
    let toJsonHits = 0
    snap.definition.toJSON = () => {
      toJsonHits += 1
      return snap.definition
    }
    Object.defineProperty(snap.definition.meta, 'evil', {
      get() {
        hits += 1
        return true
      },
      enumerable: true,
    })
    // enumerable accessor on meta should fail clone/admission without invoking when clone inspects descriptors
    const cloned = cloneJsonSafe(snap.definition)
    expect(cloned.ok).toBe(false)
    expect(hits).toBe(0)
    expect(toJsonHits).toBe(0)

    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap')
        },
        getOwnPropertyDescriptor() {
          throw new Error('trap')
        },
      },
    )
    expect(cloneJsonSafe(proxy).ok).toBe(false)
    expect(admitGovernanceQueue(proxy).ok).toBe(false)
  })

  it('detaches so adapter-owned post-resolution mutation cannot alter admitted state', async () => {
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    const admitting = createAdmittingFormDefinitionGovernanceAdapter(adapter)
    const page = await admitting.listQueue({ signal: new AbortController().signal })
    state.items[0].serviceId = 'mutated'
    expect(page.items[0].serviceId).toBe('svc-a')

    const detail = await admitting.loadDetail({
      serviceId: 'svc-a',
      version: 1,
      signal: new AbortController().signal,
    })
    const owned = state.details.get(`svc-a\0${1}`)
    owned.definition.serviceId = 'mutated'
    owned.definition.meta.paletteProvenance[0].widgetType = 'hacked'
    expect(detail.definition.serviceId).toBe('svc-a')
    expect(detail.definition.meta.paletteProvenance[0].widgetType).toBe('text-input')
  })
})

describe('exact envelopes and audit', () => {
  it('requires exact queue/detail/transition envelopes and audit keys', () => {
    expect(
      admitAdapterQueueEnvelope({
        items: [{ serviceId: 'a', version: 1, status: 'submitted' }],
      }).ok,
    ).toBe(false)

    expect(
      admitAdapterQueueEnvelope({
        items: [{ serviceId: 'a', version: 1, status: 'submitted' }],
        nextCursor: null,
      }).ok,
    ).toBe(true)

    const submitted = makeDefinition({ status: 'submitted', etagRevision: 1 })
    expect(
      admitDetailDefinition({
        body: submitted.definition,
        etagHeader: submitted.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
      }).ok,
    ).toBe(true)

    const missingSubmittedBy = structuredClone(submitted.definition)
    delete missingSubmittedBy.audit.submittedBy
    expect(
      admitDetailDefinition({
        body: missingSubmittedBy,
        etagHeader: submitted.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
      }).ok,
    ).toBe(false)

    const approved = makeDefinition({ status: 'approved', etagRevision: 2 })
    expect(
      admitTransitionDefinition({
        body: approved.definition,
        etagHeader: approved.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
        expectedStatus: 'approved',
      }).ok,
    ).toBe(true)

    const published = makeDefinition({ status: 'published', etagRevision: 3 })
    expect(
      admitTransitionDefinition({
        body: published.definition,
        etagHeader: published.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
        expectedStatus: 'published',
      }).ok,
    ).toBe(true)

    const publishedMissing = structuredClone(published.definition)
    delete publishedMissing.audit.publishedAt
    expect(
      admitTransitionDefinition({
        body: publishedMissing,
        etagHeader: published.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
        expectedStatus: 'published',
      }).ok,
    ).toBe(false)

    const envelope = admitDetailAdapterEnvelope(
      {
        definition: submitted.definition,
        etag: submitted.etag,
        fieldOrder: ['wrong'],
      },
      { expectedServiceId: 'svc-caste', expectedVersion: 1 },
    )
    expect(envelope.ok).toBe(false)
  })

  it('rejects replayed/overlapping Load More pages', () => {
    const existing = [
      { serviceId: 'a', version: 1, status: 'submitted' },
      { serviceId: 'b', version: 1, status: 'submitted' },
    ]
    const cursor = { serviceId: 'b', version: 1 }
    expect(
      appendQueuePage(existing, [{ serviceId: 'b', version: 1, status: 'submitted' }], cursor).ok,
    ).toBe(false)
    expect(
      appendQueuePage(existing, [{ serviceId: 'a', version: 2, status: 'submitted' }], cursor).ok,
    ).toBe(false)
    expect(
      appendQueuePage(existing, [{ serviceId: 'c', version: 1, status: 'submitted' }], cursor).ok,
    ).toBe(true)
  })
})

describe('mutation sequence integrity', () => {
  it('ignores late transition success/reject after Back and adapter replacement; unmount is safe', async () => {
    const user = userEvent.setup()
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    const original = adapter.transition.bind(adapter)
    adapter.transition = async (args) => {
      await gate
      return original(args)
    }

    const view = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/form-definitions']}>
          <Routes>
            <Route
              path="/form-definitions"
              element={<FormDefinitionGovernance adapter={adapter} />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )

    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    await user.click(screen.getByRole('button', { name: 'Back to Queue' }))
    const callsBefore = state.transitionCalls.length
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(state.transitionCalls.length).toBeGreaterThanOrEqual(callsBefore)
    expect(screen.queryByText(/Definition approved/i)).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(formatStrongEtagForTests(1))
    view.unmount()
  })

  it('ignores late transition reject after Back', async () => {
    const user = userEvent.setup()
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const { adapter } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    adapter.transition = async () => {
      await gate
      throw new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
    }
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/form-definitions']}>
          <Routes>
            <Route
              path="/form-definitions"
              element={<FormDefinitionGovernance adapter={adapter} />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    await user.click(screen.getByRole('button', { name: 'Back to Queue' }))
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('keeps busy state for the current sequence only and rejects overlapping Load More in UI', async () => {
    const user = userEvent.setup()
    const items = [
      { serviceId: 'svc-a', version: 1, status: 'submitted' },
      { serviceId: 'svc-b', version: 1, status: 'submitted' },
      { serviceId: 'svc-c', version: 1, status: 'submitted' },
    ]
    const { adapter, state } = createMemoryGovernanceAdapter({ items })
    adapter.listQueue = async ({ afterServiceId, afterVersion, signal }) => {
      state.listCalls.push({ afterServiceId, afterVersion })
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!afterServiceId) {
        return {
          items: items.slice(0, 2),
          nextCursor: { serviceId: 'svc-b', version: 1 },
        }
      }
      // Overlapping/replayed page
      return {
        items: items.slice(0, 2),
        nextCursor: { serviceId: 'svc-b', version: 1 },
      }
    }
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/form-definitions']}>
          <Routes>
            <Route
              path="/form-definitions"
              element={<FormDefinitionGovernance adapter={adapter} />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    expect(await screen.findByText('svc-a')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load More' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText(/The governance service returned a response that could not be admitted safely/i),
    ).toBeInTheDocument()
  })
})
