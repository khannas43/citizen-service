import { StrictMode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, NavLink } from 'react-router-dom'
import { axe } from 'vitest-axe'
import FormDefinitionGovernance from '../../screens/FormDefinitionGovernance.jsx'
import {
  GovernanceAdapterError,
  GOVERNANCE_ERROR_CODES,
  formatStrongEtagForTests,
} from '../index.js'
import { createMemoryGovernanceAdapter, makeDefinition } from './fixtures.js'

function renderGovernance(adapter, { route = '/form-definitions' } = {}) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>
        <nav>
          <NavLink to="/tasks">Task Queue</NavLink>
          <NavLink to="/form-definitions">Form Definitions</NavLink>
        </nav>
        <Routes>
          <Route path="/tasks" element={<div>Tasks screen intact</div>} />
          <Route
            path="/form-definitions"
            element={<FormDefinitionGovernance adapter={adapter} />}
          />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('Form Definition Governance UI', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads queue, reviews detail, and keeps /tasks intact', async () => {
    const user = userEvent.setup()
    const { adapter } = createMemoryGovernanceAdapter()
    renderGovernance(adapter)

    expect(await screen.findByRole('heading', { name: 'Form Definitions' })).toBeInTheDocument()
    expect(screen.getByText(/not a DST inbox/i)).toBeInTheDocument()
    expect(await screen.findByText('svc-a')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Task Queue' }))
    expect(screen.getByText('Tasks screen intact')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Form Definitions' }))
    expect(await screen.findByText('svc-a')).toBeInTheDocument()

    const reviewButtons = await screen.findAllByRole('button', { name: 'Review' })
    await user.click(reviewButtons[0])
    expect(await screen.findByRole('heading', { name: /Governed definition review/i })).toBeInTheDocument()
    expect(screen.getByText(/Ordered field count/i)).toBeInTheDocument()
    expect(screen.queryByText(formatStrongEtagForTests(1))).not.toBeInTheDocument()
  })

  it('shows loading, empty, failure, retry, 401 and 403 states', async () => {
    const user = userEvent.setup()
    const empty = createMemoryGovernanceAdapter({ items: [] })
    renderGovernance(empty.adapter)
    expect(await screen.findByText(/No submitted or approved/i)).toBeInTheDocument()

    const failing = createMemoryGovernanceAdapter()
    failing.state.failQueueWith = new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FAILED)
    const view = renderGovernance(failing.adapter)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    failing.state.failQueueWith = null
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('svc-a')).toBeInTheDocument())
    view.unmount()

    const unauth = createMemoryGovernanceAdapter()
    unauth.state.failQueueWith = new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.UNAUTHENTICATED)
    renderGovernance(unauth.adapter)
    expect(await screen.findByText(/Authentication is required/i)).toBeInTheDocument()

    const forbidden = createMemoryGovernanceAdapter()
    forbidden.state.failQueueWith = new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.FORBIDDEN)
    renderGovernance(forbidden.adapter)
    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument()
  })

  it('requires confirmation for approve/publish; Cancel/Escape make zero calls; never auto-publishes', async () => {
    const user = userEvent.setup()
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    renderGovernance(adapter)

    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('dialog', { name: /Approve Form Definition/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(state.transitionCalls).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state.transitionCalls).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    expect(await screen.findByText(/Definition approved/i)).toBeInTheDocument()
    expect(state.transitionCalls).toHaveLength(1)
    expect(state.transitionCalls[0].targetStatus).toBe('approved')
    expect(state.transitionCalls[0].body).toEqual({ targetStatus: 'approved' })
    expect(JSON.stringify(state.transitionCalls[0])).not.toContain('actorId')

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByText(/not DST acknowledgement/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm Publish' }))
    expect(await screen.findByText(/Definition published/i)).toBeInTheDocument()
    expect(state.transitionCalls).toHaveLength(2)
    expect(state.transitionCalls[1].targetStatus).toBe('published')
  })

  it('handles stale 412 guidance and reload', async () => {
    const user = userEvent.setup()
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    renderGovernance(adapter)
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await screen.findByRole('button', { name: 'Approve' })
    state.failTransitionWith = new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.STALE_REVISION)
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    expect(await screen.findByText(/changed since it was loaded/i)).toBeInTheDocument()
    state.failTransitionWith = null
    const reloadButtons = screen.getAllByRole('button', { name: 'Reload Detail' })
    await user.click(reloadButtons[reloadButtons.length - 1])
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('paginates without duplicates and ignores stale detail after selecting another row', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 3 }, (_, index) => ({
      serviceId: `svc-${String.fromCharCode(97 + index)}`,
      version: index + 1,
      status: 'submitted',
    }))
    const { adapter, state } = createMemoryGovernanceAdapter({ items, pageSize: 2 })
    adapter.listQueue = async ({ afterServiceId, afterVersion, limit = 2, signal }) => {
      state.listCalls.push({ afterServiceId, afterVersion, limit })
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      let start = 0
      if (afterServiceId !== undefined) {
        start =
          items.findIndex(
            (item) => item.serviceId === afterServiceId && item.version === afterVersion,
          ) + 1
      }
      const slice = items.slice(start, start + 2)
      return {
        items: slice.map((item) => ({ ...item })),
        nextCursor:
          start + 2 < items.length
            ? {
                serviceId: slice[slice.length - 1].serviceId,
                version: slice[slice.length - 1].version,
              }
            : null,
      }
    }
    renderGovernance(adapter)
    expect(await screen.findByText('svc-a')).toBeInTheDocument()
    expect(screen.getByText('svc-b')).toBeInTheDocument()
    expect(screen.queryByText('svc-c')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load More' }))
    expect(await screen.findByText('svc-c')).toBeInTheDocument()
    expect(screen.getAllByText('svc-a')).toHaveLength(1)

    let releaseFirst
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve
    })
    const originalLoad = adapter.loadDetail.bind(adapter)
    let calls = 0
    adapter.loadDetail = async (args) => {
      calls += 1
      if (calls === 1) {
        await firstGate
      }
      return originalLoad(args)
    }
    const reviewButtons = screen.getAllByRole('button', { name: 'Review' })
    await user.click(reviewButtons[0])
    await user.click(await screen.findByRole('button', { name: 'Back to Queue' }))
    const nextButtons = await screen.findAllByRole('button', { name: 'Review' })
    await user.click(nextButtons[1])
    releaseFirst()
    await waitFor(() => {
      expect(within(screen.getByRole('article')).getByText('svc-b')).toBeInTheDocument()
    })
  })

  it('allows only one mutation in flight and keeps secrets out of the DOM', async () => {
    const user = userEvent.setup()
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: 'svc-a', version: 1, status: 'submitted' }],
    })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const original = adapter.transition.bind(adapter)
    adapter.transition = async (args) => {
      await gate
      return original(args)
    }
    renderGovernance(adapter)
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    expect(screen.getByRole('button', { name: 'Confirm Approve' })).toBeDisabled()
    release()
    expect(await screen.findByText(/Definition approved/i)).toBeInTheDocument()
    expect(state.transitionCalls).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/actorId|READ_FORM_DEFINITION|Bearer |capability/i)
    expect(document.body.innerHTML).not.toContain(formatStrongEtagForTests(1))
  })

  it('passes accessibility checks and fits 390px structure', async () => {
    const { adapter } = createMemoryGovernanceAdapter()
    const { container } = renderGovernance(adapter)
    await screen.findByText('svc-a')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    window.dispatchEvent(new Event('resize'))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
    expect(container.querySelector('.fdg-page')).toBeTruthy()
  })
})

describe('HTTP transition body contract', () => {
  it('posts exact targetStatus body with If-Match and no actorId', async () => {
    const fetchImpl = vi.fn(async () => {
      const snap = makeDefinition({ status: 'approved', etagRevision: 2 })
      return new Response(JSON.stringify(snap.definition), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: snap.etag,
        },
      })
    })
    const { createHttpFormDefinitionGovernanceAdapter } = await import('../adapter.js')
    const http = createHttpFormDefinitionGovernanceAdapter({
      baseUrl: '/form-definition-service',
      fetchImpl,
      accessTokenProvider: () => 'e541-synthetic-ui-token',
    })
    await http.transition({
      serviceId: 'svc-caste',
      version: 1,
      etag: formatStrongEtagForTests(1),
      targetStatus: 'approved',
      signal: new AbortController().signal,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const init = fetchImpl.mock.calls[0][1]
    expect(init.headers['If-Match']).toBe(formatStrongEtagForTests(1))
    expect(init.headers.Authorization).toBe('Bearer e541-synthetic-ui-token')
    expect(init.cache).toBe('no-store')
    expect(JSON.parse(init.body)).toEqual({ targetStatus: 'approved' })
    expect(init.body).not.toContain('actorId')
    expect(document.body?.textContent ?? '').not.toContain('e541-synthetic-ui-token')  })
})
