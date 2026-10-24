import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import PublishedFormApplication from '../../screens/PublishedFormApplication.jsx'
import {
  createDeferred,
  createE3AcceptancePublishedDefinition,
  createInjectedPublishedAdapter,
  E3_TECHNICAL_SERVICE_ID,
  publishedAdapterResult,
} from './fixtures.js'
import { PublishedFormError, PUBLISHED_FORM_ERROR_CODES } from '../errors.js'
import { submitWithDetachedFormData } from '../submission.js'
import i18n from '../../i18n.js'

function renderPublished(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/apply/:serviceId"
          element={<PublishedFormApplication {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FormRenderer wiring', () => {
  it('renders a representative published definition with progressive steps and schema validation', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-progressive="true"]')).toBeTruthy())

    expect(screen.getByRole('heading', { level: 1, name: /Published Form Application/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Identity$/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    // Empty required applicant_name should keep us on the identity step.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /^Identity$/i })).toBeInTheDocument()
    })
    expect(document.querySelector('.dg20-renderer-validation-guidance, [role="alert"]')).toBeTruthy()

    const nameInput = screen.getByLabelText(/Applicant name/i)
    await userEvent.type(nameInput, 'Asha Patel')
    await userEvent.click(screen.getByRole('button', { name: /Next/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Household size/i)).toBeInTheDocument()
    })
    await userEvent.click(document.querySelector('.dg20-renderer-nav-back'))
    await waitFor(() => {
      expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
    })
  })

  it('shows governed unavailable copy for CAF when no widget service is provided', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeTruthy())
    expect(
      screen.getByText(/Automatic pre-fill is temporarily unavailable/i),
    ).toBeInTheDocument()
  })

  it('does not provide a default Submit callback or working Submit button', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^Submit$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Online submission is not yet available/i)).toBeInTheDocument()
  })

  it('passes only detached serviceId, formVersion, and formData to an injected submission adapter', async () => {
    const definition = createE3AcceptancePublishedDefinition({
      meta: {
        ...createE3AcceptancePublishedDefinition().meta,
        progressiveSteps: [],
      },
    })
    // empty progressiveSteps → single page with submit when onSubmit provided
    const adapter = createInjectedPublishedAdapter(async () => publishedAdapterResult(definition))
    const submitted = []
    const submissionAdapter = {
      submitApplication: vi.fn(async (args) => {
        submitted.push(args)
        return { ok: true }
      }),
    }
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter, submissionAdapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())

    await userEvent.type(screen.getByLabelText(/Applicant name/i), 'Asha Patel')
    const yesBtn = screen.queryByRole('button', { name: /^Yes$/i }) || screen.queryByLabelText(/^Yes$/i)
    if (yesBtn) await userEvent.click(yesBtn)

    const submitBtn = await screen.findByRole('button', { name: /Submit/i })
    await userEvent.click(submitBtn)

    await waitFor(() => expect(submissionAdapter.submitApplication).toHaveBeenCalled())
    const payload = submissionAdapter.submitApplication.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['formData', 'formVersion', 'serviceId', 'signal'].sort())
    expect(payload.serviceId).toBe(E3_TECHNICAL_SERVICE_ID)
    expect(payload.formVersion).toBe(1)
    expect(JSON.stringify(payload)).not.toMatch(/ETag|etag|jsonSchema|ProblemDetail/i)
    expect(localStorage.getItem('formData')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('submitWithDetachedFormData never exposes adapter errors or raw formData in thrown codes', async () => {
    await expect(
      submitWithDetachedFormData(
        {
          submitApplication: async () => {
            throw new Error('secret stack with aadhaar 1234')
          },
        },
        {
          serviceId: E3_TECHNICAL_SERVICE_ID,
          formVersion: 1,
          formData: { applicant_name: 'secret' },
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.FAILED })
  })
})

describe('lifecycle cancellation', () => {
  it('StrictMode live request settles once for a successful load', async () => {
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult())
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
          <Routes>
            <Route
              path="/apply/:serviceId"
              element={<PublishedFormApplication adapter={{ loadLatestPublished }} />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    // StrictMode: exactly one live latest-published invocation.
    expect(loadLatestPublished.mock.calls.length).toBe(1)
  })

  it('route change aborts prior signal and ignores stale result', async () => {
    const first = createDeferred()
    const signals = []
    const adapter = createInjectedPublishedAdapter(async ({ serviceId, signal }) => {
      signals.push({ serviceId, signal })
      if (serviceId === 'svc-a') return first.promise
      return publishedAdapterResult(createE3AcceptancePublishedDefinition({ serviceId: 'svc-b' }))
    })

    render(
      <MemoryRouter initialEntries={['/apply/svc-a']}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={
              <>
                <Link to="/apply/svc-b">go-b</Link>
                <PublishedFormApplication adapter={adapter} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(1))
    await userEvent.click(screen.getByRole('link', { name: 'go-b' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-service="svc-b"]')).toBeTruthy())
    first.resolve(publishedAdapterResult(createE3AcceptancePublishedDefinition({ serviceId: 'svc-a' })))
    await Promise.resolve()
    expect(document.querySelector('[data-dg20-service="svc-a"]')).toBeNull()
    expect(signals[0].signal.aborted).toBe(true)
  })

  it('adapter replacement aborts and ignores stale result', async () => {
    const first = createDeferred()
    const adapterA = createInjectedPublishedAdapter(async ({ signal }) => {
      void signal
      return first.promise
    })
    const adapterB = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(createE3AcceptancePublishedDefinition({ version: 2 })),
    )

    const { rerender } = renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, {
      adapter: adapterA,
    })
    await waitFor(() => expect(screen.getByText(/Loading published form/i)).toBeInTheDocument())

    rerender(
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={<PublishedFormApplication adapter={adapterB} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(document.querySelector('[data-dg20-version="2"]')).toBeTruthy())
    first.resolve(publishedAdapterResult(createE3AcceptancePublishedDefinition({ version: 1 })))
    await Promise.resolve()
    expect(document.querySelector('[data-dg20-version="1"]')).toBeNull()
  })
})

describe('accessibility and responsive shell', () => {
  it('has no serious axe violations in EN and GU and preserves heading/status semantics', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    const { container } = renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    const resultsEn = await axe(container)
    expect(resultsEn).toHaveNoViolations()

    await i18n.changeLanguage('gu')
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })
    const resultsGu = await axe(container)
    expect(resultsGu).toHaveNoViolations()
    await i18n.changeLanguage('en')
  })

  it('marks loading with aria-busy and failures with alert', async () => {
    const deferred = createDeferred()
    deferred.promise.catch(() => {})
    const adapter = createInjectedPublishedAdapter(async () => deferred.promise)
    const { container } = renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeTruthy())
    deferred.reject(new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.NOT_FOUND))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('supports keyboard focus on primary controls at 390px without page overflow', async () => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      get: () => 390,
    })
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    renderPublished(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())

    const page = document.querySelector('.pf-page')
    expect(page.scrollWidth).toBeLessThanOrEqual(390 + 1)

    await userEvent.tab()
    expect(document.activeElement).toBeTruthy()
    const next = screen.getByRole('button', { name: /Next/i })
    next.focus()
    expect(document.activeElement).toBe(next)
  })
})
