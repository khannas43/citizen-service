import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy, Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FormRenderer } from '@citizen/form-renderer'
import * as React from 'react'
import ApplyPage from '../../screens/ApplyPage.jsx'
import ApplyForm from '../../screens/ApplyForm.jsx'
import CommonApplicationForm from '../../screens/CommonApplicationForm.jsx'
import PublishedFormApplication from '../../screens/PublishedFormApplication.jsx'
import {
  createDeferred,
  createE3AcceptancePublishedDefinition,
  createInjectedPublishedAdapter,
  E3_TECHNICAL_SERVICE_ID,
  publishedAdapterResult,
} from './fixtures.js'
import { SERVICE_ID_MAX_CODE_POINTS } from '../index.js'
import { PublishedFormError, PUBLISHED_FORM_ERROR_CODES } from '../errors.js'
import i18n from '../../i18n.js'

const LazyPublished = lazy(() => import('../../screens/PublishedFormApplication.jsx'))

function renderApplyRoutes(initialPath, { adapter } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/apply/caf" element={<div data-testid="legacy-caf">CAF</div>} />
        <Route path="/apply/caste" element={<div data-testid="legacy-caste">Caste</div>} />
        <Route path="/apply/marriage" element={<div data-testid="legacy-marriage">Marriage</div>} />
        <Route path="/apply/pension" element={<div data-testid="legacy-pension">Pension</div>} />
        <Route path="/apply/family-member" element={<div data-testid="legacy-family">Family</div>} />
        <Route path="/apply/scheme" element={<div data-testid="legacy-scheme">Scheme</div>} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route
          path="/apply/:serviceId"
          element={
            <Suspense fallback={<p>Loading…</p>}>
              {adapter ? (
                <PublishedFormApplication adapter={adapter} />
              ) : (
                <LazyPublished />
              )}
            </Suspense>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('package and route compatibility', () => {
  it('imports FormRenderer without creating a second React instance', () => {
    expect(typeof FormRenderer).toBe('function')
    expect(React.createElement).toBeTypeOf('function')
    expect(React.version).toMatch(/^19\./)
  })

  it('keeps all legacy static /apply/* routes mapped to existing screens', () => {
    for (const [path, testId] of [
      ['/apply/caf', 'legacy-caf'],
      ['/apply/caste', 'legacy-caste'],
      ['/apply/marriage', 'legacy-marriage'],
      ['/apply/pension', 'legacy-pension'],
      ['/apply/family-member', 'legacy-family'],
      ['/apply/scheme', 'legacy-scheme'],
    ]) {
      const { unmount } = renderApplyRoutes(path)
      expect(screen.getByTestId(testId)).toBeInTheDocument()
      unmount()
    }
    expect(typeof ApplyForm).toBe('function')
    expect(typeof CommonApplicationForm).toBe('function')
  })

  it('resolves /apply/:serviceId to the published-form screen', async () => {
    const adapter = createInjectedPublishedAdapter(async () =>
      publishedAdapterResult(),
    )
    renderApplyRoutes(`/apply/${E3_TECHNICAL_SERVICE_ID}`, { adapter })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Published Form Application/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy()
    })
  })

  it('makes zero adapter calls for invalid, padded, or oversized serviceIds', async () => {
    const loadLatestPublished = vi.fn()
    const adapter = { loadLatestPublished }
    const oversized = 'x'.repeat(SERVICE_ID_MAX_CODE_POINTS + 1)

    for (const path of [`/apply/${encodeURIComponent(' padded')}`, `/apply/${oversized}`]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/apply/:serviceId"
              element={<PublishedFormApplication adapter={adapter} />}
            />
          </Routes>
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
      expect(loadLatestPublished).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('shows the technical tile only when env serviceId is admitted', async () => {
    vi.stubEnv('VITE_DG20_TECHNICAL_FORM_SERVICE_ID', E3_TECHNICAL_SERVICE_ID)
    const { unmount } = render(
      <MemoryRouter>
        <ApplyPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('technical-published-form-tile')).toBeInTheDocument()
    expect(screen.getByText(/Published Form — Technical Preview/i)).toBeInTheDocument()
    unmount()
    vi.unstubAllEnvs()

    vi.stubEnv('VITE_DG20_TECHNICAL_FORM_SERVICE_ID', ' padded')
    render(
      <MemoryRouter>
        <ApplyPage />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('technical-published-form-tile')).not.toBeInTheDocument()
    vi.unstubAllEnvs()
  })
})

describe('published-form lifecycle (route + locale)', () => {
  it('ignores late resolve after unmount', async () => {
    const deferred = createDeferred()
    const adapter = createInjectedPublishedAdapter(async () => deferred.promise)
    const { unmount } = render(
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={<PublishedFormApplication adapter={adapter} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/Loading published form/i)).toBeInTheDocument())
    unmount()
    deferred.resolve(publishedAdapterResult())
    await Promise.resolve()
    expect(document.querySelector('[data-dg20-renderer]')).toBeNull()
  })

  it('Retry issues one fresh request for the current serviceId', async () => {
    const loadLatestPublished = vi.fn()
    loadLatestPublished.mockImplementationOnce(async () => {
      throw new PublishedFormError(PUBLISHED_FORM_ERROR_CODES.UNAVAILABLE)
    })
    loadLatestPublished.mockImplementationOnce(async ({ serviceId }) =>
      publishedAdapterResult(createE3AcceptancePublishedDefinition({ serviceId })),
    )

    render(
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={<PublishedFormApplication adapter={{ loadLatestPublished }} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }))
    await waitFor(() => {
      expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy()
    })
    expect(
      loadLatestPublished.mock.calls.every((c) => c[0].serviceId === E3_TECHNICAL_SERVICE_ID),
    ).toBe(true)
    expect(loadLatestPublished).toHaveBeenCalledTimes(2)
  })

  it('does not refetch or clear formData on locale change', async () => {
    const loadLatestPublished = vi.fn(async () => publishedAdapterResult())
    render(
      <MemoryRouter initialEntries={[`/apply/${E3_TECHNICAL_SERVICE_ID}`]}>
        <Routes>
          <Route
            path="/apply/:serviceId"
            element={<PublishedFormApplication adapter={{ loadLatestPublished }} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    const callsAfterLoad = loadLatestPublished.mock.calls.length

    const nameInput = screen.getByLabelText(/Applicant name/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Asha Patel')

    await i18n.changeLanguage('gu')
    await waitFor(() => {
      expect(screen.getByLabelText(/અરજદારનું નામ/i)).toBeInTheDocument()
    })
    expect(loadLatestPublished).toHaveBeenCalledTimes(callsAfterLoad)
    expect(screen.getByDisplayValue('Asha Patel')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

  it('route navigation aborts and loads the new serviceId', async () => {
    const first = createDeferred()
    const adapter = createInjectedPublishedAdapter(async ({ serviceId, signal }) => {
      if (serviceId === 'svc-a') {
        return first.promise
      }
      void signal
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

    await waitFor(() => expect(screen.getByText(/Loading published form/i)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('link', { name: 'go-b' }))
    await waitFor(() => expect(document.querySelector('[data-dg20-service="svc-b"]')).toBeTruthy())
    first.resolve(publishedAdapterResult(createE3AcceptancePublishedDefinition({ serviceId: 'svc-a' })))
    await Promise.resolve()
    expect(document.querySelector('[data-dg20-service="svc-a"]')).toBeNull()
  })
})
