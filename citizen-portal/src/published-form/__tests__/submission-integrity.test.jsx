import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PublishedFormApplication from '../../screens/PublishedFormApplication.jsx'
import {
  createDeferred,
  createE3AcceptancePublishedDefinition,
  createInjectedPublishedAdapter,
  E3_TECHNICAL_SERVICE_ID,
  publishedAdapterResult,
} from './fixtures.js'

function singlePageDefinition() {
  return createE3AcceptancePublishedDefinition({
    meta: {
      ...createE3AcceptancePublishedDefinition().meta,
      progressiveSteps: [],
    },
  })
}

function renderPublished(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/apply/:serviceId" element={<PublishedFormApplication {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit() {
  await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
  await userEvent.type(screen.getByLabelText(/Applicant name/i), 'Asha Patel')
  const yesBtn = screen.queryByRole('button', { name: /^Yes$/i }) || screen.queryByLabelText(/^Yes$/i)
  if (yesBtn) await userEvent.click(yesBtn)
  const submitBtn = await screen.findByRole('button', { name: /Submit/i })
  await userEvent.click(submitBtn)
  return submitBtn
}

describe('submission integrity (FB-E3.1)', () => {
  it('shows generic failure for malformed submission results and never exposes provider payloads', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(singlePageDefinition()),
    )
    const submissionAdapter = {
      submitApplication: vi.fn(async () => ({ ok: true, receipt: 'secret-token', etag: '"x"' })),
    }
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter, submissionAdapter })
    await fillAndSubmit()
    await waitFor(() => expect(screen.getByTestId('pf-submit-failure')).toBeInTheDocument())
    expect(screen.queryByTestId('pf-submit-success')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/secret-token|receipt|etag/i)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('invokes the submission adapter exactly once on synchronous double submit', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(singlePageDefinition()),
    )
    const submissionAdapter = {
      submitApplication: vi.fn(async () => deferred.promise),
    }
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter, submissionAdapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    await userEvent.type(screen.getByLabelText(/Applicant name/i), 'Asha Patel')
    const yesBtn = screen.queryByRole('button', { name: /^Yes$/i }) || screen.queryByLabelText(/^Yes$/i)
    if (yesBtn) await userEvent.click(yesBtn)
    const submitBtn = await screen.findByRole('button', { name: /Submit/i })
    await userEvent.click(submitBtn)
    await userEvent.click(submitBtn)
    expect(submissionAdapter.submitApplication).toHaveBeenCalledTimes(1)
    deferred.resolve({ ok: true })
    await waitFor(() => expect(screen.getByTestId('pf-submit-success')).toBeInTheDocument())
  })

  it('invalidates in-flight submission on route change so stale success cannot show', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const definitionA = singlePageDefinition()
    const definitionB = createE3AcceptancePublishedDefinition({
      serviceId: 'svc-b',
      meta: { ...createE3AcceptancePublishedDefinition().meta, progressiveSteps: [] },
    })
    const adapter = createInjectedPublishedAdapter(async ({ serviceId }) => {
      if (serviceId === 'svc-b') return publishedAdapterResult(definitionB)
      return publishedAdapterResult(definitionA)
    })
    const submissionAdapter = {
      submitApplication: vi.fn(async () => deferred.promise),
    }

    render(
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={
              <>
                <Link to="/apply/svc-b">go-b</Link>
                <PublishedFormApplication adapter={adapter} submissionAdapter={submissionAdapter} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await fillAndSubmit()
    expect(submissionAdapter.submitApplication).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('link', { name: 'go-b' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-service="svc-b"]')).toBeTruthy())
    deferred.resolve({ ok: true })
    await Promise.resolve()
    expect(screen.queryByTestId('pf-submit-success')).not.toBeInTheDocument()
  })

  it('invalidates in-flight submission on submissionAdapter replacement so stale rejection cannot show', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const definition = singlePageDefinition()
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult(definition))
    const loadAdapter = { loadLatestPublished }
    const submissionA = {
      submitApplication: vi.fn(async () => deferred.promise),
    }
    const submissionB = {
      submitApplication: vi.fn(async () => ({ ok: true })),
    }

    function Harness({ submissionAdapter }) {
      return (
        <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
          <Routes>
            <Route
              path="/apply/:serviceId"
              element={
                <PublishedFormApplication adapter={loadAdapter} submissionAdapter={submissionAdapter} />
              }
            />
          </Routes>
        </MemoryRouter>
      )
    }

    const { rerender } = render(<Harness submissionAdapter={submissionA} />)
    await fillAndSubmit()
    expect(submissionA.submitApplication).toHaveBeenCalledTimes(1)
    const callsBeforeSwap = loadLatestPublished.mock.calls.length
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()

    rerender(<Harness submissionAdapter={submissionB} />)

    deferred.reject(new Error('stale provider failure with token xyz'))
    await Promise.resolve()
    expect(screen.queryByTestId('pf-submit-failure')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/token xyz|provider failure/i)
    expect(loadLatestPublished).toHaveBeenCalledTimes(callsBeforeSwap)
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
    expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy()
  })

  it('aborts in-flight submission on unmount without success or failure UI', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(singlePageDefinition()),
    )
    const submissionAdapter = {
      submitApplication: vi.fn(async () => deferred.promise),
    }
    const { unmount } = renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, {
      adapter,
      submissionAdapter,
    })
    await fillAndSubmit()
    unmount()
    deferred.resolve({ ok: true })
    await Promise.resolve()
    expect(document.querySelector('[data-testid="pf-submit-success"]')).toBeNull()
    expect(document.querySelector('[data-testid="pf-submit-failure"]')).toBeNull()
  })
})

describe('submission-adapter lifecycle isolation (FB-E3.1.1)', () => {
  function SubmissionHarness({ adapter, submissionAdapter }) {
    return (
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={
              <PublishedFormApplication adapter={adapter} submissionAdapter={submissionAdapter} />
            }
          />
        </Routes>
      </MemoryRouter>
    )
  }

  async function typeName(value = 'Asha Patel') {
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    const nameInput = screen.getByLabelText(/Applicant name/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, value)
  }

  it('replacing submissionAdapter while idle does not reload definition or clear formData', async () => {
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult(singlePageDefinition()))
    const adapter = { loadLatestPublished }
    const submissionA = { submitApplication: vi.fn(async () => ({ ok: true })) }
    const submissionB = { submitApplication: vi.fn(async () => ({ ok: true })) }

    const { rerender } = render(
      <SubmissionHarness adapter={adapter} submissionAdapter={submissionA} />,
    )
    await typeName()
    const callsBefore = loadLatestPublished.mock.calls.length

    rerender(<SubmissionHarness adapter={adapter} submissionAdapter={submissionB} />)

    expect(loadLatestPublished).toHaveBeenCalledTimes(callsBefore)
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
    expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument()
  })

  it('replacing submissionAdapter while submitting aborts old request without definition reload', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult(singlePageDefinition()))
    const adapter = { loadLatestPublished }
    let capturedSignal
    const submissionA = {
      submitApplication: vi.fn(async ({ signal }) => {
        capturedSignal = signal
        return deferred.promise
      }),
    }
    const submissionB = { submitApplication: vi.fn(async () => ({ ok: true })) }

    const { rerender } = render(
      <SubmissionHarness adapter={adapter} submissionAdapter={submissionA} />,
    )
    await fillAndSubmit()
    expect(submissionA.submitApplication).toHaveBeenCalledTimes(1)
    const callsBefore = loadLatestPublished.mock.calls.length

    rerender(<SubmissionHarness adapter={adapter} submissionAdapter={submissionB} />)

    expect(capturedSignal.aborted).toBe(true)
    deferred.resolve({ ok: true })
    await Promise.resolve()
    expect(screen.queryByTestId('pf-submit-success')).not.toBeInTheDocument()
    expect(loadLatestPublished).toHaveBeenCalledTimes(callsBefore)
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
  })

  it('removing submissionAdapter does not reload definition and shows unavailable guidance', async () => {
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult())
    const adapter = { loadLatestPublished }
    const submissionA = { submitApplication: vi.fn(async () => ({ ok: true })) }

    const { rerender } = render(
      <SubmissionHarness adapter={adapter} submissionAdapter={submissionA} />,
    )
    await typeName('Priya Shah')
    const callsBefore = loadLatestPublished.mock.calls.length

    rerender(<SubmissionHarness adapter={adapter} submissionAdapter={undefined} />)

    expect(loadLatestPublished).toHaveBeenCalledTimes(callsBefore)
    expect(screen.getByDisplayValue('Priya Shah')).toBeInTheDocument()
    expect(screen.getByText(/Online submission is not yet available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Submit$/i })).not.toBeInTheDocument()
  })

  it('adding submissionAdapter does not reload definition and enables submission', async () => {
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult(singlePageDefinition()))
    const adapter = { loadLatestPublished }
    const submissionB = { submitApplication: vi.fn(async () => ({ ok: true })) }

    const { rerender } = render(
      <SubmissionHarness adapter={adapter} submissionAdapter={undefined} />,
    )
    await typeName('Kavita Rathod')
    expect(screen.getByText(/Online submission is not yet available/i)).toBeInTheDocument()
    const callsBefore = loadLatestPublished.mock.calls.length

    rerender(<SubmissionHarness adapter={adapter} submissionAdapter={submissionB} />)

    expect(loadLatestPublished).toHaveBeenCalledTimes(callsBefore)
    expect(screen.getByDisplayValue('Kavita Rathod')).toBeInTheDocument()
    expect(screen.queryByText(/Online submission is not yet available/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument()
  })

  it('published-definition adapter replacement still reloads definition', async () => {
    const loadA = vi.fn(async () =>
      publishedAdapterResult(createE3AcceptancePublishedDefinition({ version: 1 })),
    )
    const loadB = vi.fn(async () =>
      publishedAdapterResult(createE3AcceptancePublishedDefinition({ version: 2 })),
    )
    const submission = { submitApplication: vi.fn(async () => ({ ok: true })) }

    function DefHarness({ loadLatestPublished }) {
      return (
        <SubmissionHarness
          adapter={{ loadLatestPublished }}
          submissionAdapter={submission}
        />
      )
    }

    const { rerender } = render(<DefHarness loadLatestPublished={loadA} />)
    await waitFor(() => expect(document.querySelector('[data-dg20-version="1"]')).toBeTruthy())
    await typeName('Keep Me')

    rerender(<DefHarness loadLatestPublished={loadB} />)
    await waitFor(() => expect(document.querySelector('[data-dg20-version="2"]')).toBeTruthy())
    expect(loadB).toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Keep Me')).not.toBeInTheDocument()
  })
})
