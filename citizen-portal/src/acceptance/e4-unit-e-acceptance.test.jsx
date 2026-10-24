/**
 * FB-E4 citizen-portal acceptance — real E3/E3.1/E3.1.1 adapter + admission.
 * Acceptance-only. Does not change production portal behavior.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import PublishedFormApplication from '../screens/PublishedFormApplication.jsx'
import ApplyForm from '../screens/ApplyForm.jsx'
import CommonApplicationForm from '../screens/CommonApplicationForm.jsx'
import {
  createAdmittingPublishedFormDefinitionAdapter,
  createHttpPublishedFormDefinitionAdapter,
} from '../published-form/adapter.js'
import { PUBLISHED_FORM_ERROR_CODES } from '../published-form/errors.js'
import i18n from '../i18n.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(here, 'unit-e')
const CANONICAL_SHA =
  '8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e'
const SERVICE_ID = 'unit-e-technical-acceptance'

function loadUnitEDraft() {
  const bytes = readFileSync(join(FIXTURE_DIR, 'unit-e-representative-definition.json'))
  const sha = createHash('sha256').update(bytes).digest('hex')
  const expected = readFileSync(
    join(FIXTURE_DIR, 'unit-e-representative-definition.sha256'),
    'utf8',
  ).trim()
  expect(sha).toBe(CANONICAL_SHA)
  expect(expected).toBe(CANONICAL_SHA)
  return JSON.parse(bytes.toString('utf8'))
}

function toPublishedDefinition(draft) {
  return {
    ...structuredClone(draft),
    status: 'published',
    audit: {
      ...draft.audit,
      submittedBy: 'unit-e-technical-submitter',
      approvedBy: 'unit-e-governance-officer',
      publishedAt: '2026-07-27T12:00:00.000Z',
    },
  }
}

function publishedEnvelope(definition) {
  return {
    serviceId: definition.serviceId,
    version: definition.version,
    definition,
  }
}

function renderPublished(path, props = {}) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/apply/:serviceId" element={<PublishedFormApplication {...props} />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('FB-E4 — citizen contract drift', () => {
  it('keeps Unit E fixture SHA and published adapter envelope contract aligned', () => {
    loadUnitEDraft()
    const manifest = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'contract-manifest.json'), 'utf8'),
    )
    expect(manifest.endpoints.publishedLatest).toBe(
      '/api/v1/form-definitions/published/latest',
    )
    expect(manifest.publishedAdapterEnvelope).toEqual({
      exactKeys: ['serviceId', 'version', 'definition'],
      httpBodyIsDefinitionRoot: true,
    })
  })
})

describe('FB-E4 — citizen published adapter against FDS-shaped flow', () => {
  it('is unavailable before publish and admits exact envelope after publish', async () => {
    const draft = loadUnitEDraft()
    const published = toPublishedDefinition(draft)
    let publishedNow = false
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input)
      expect(url).toContain('/api/v1/form-definitions/published/latest')
      expect(url).toContain(`serviceId=${SERVICE_ID}`)
      if (!publishedNow) {
        return new Response(JSON.stringify({ code: 'published_form_definition_not_found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(published), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // ETag may be present on HTTP but must be ignored by citizen adapter.
          ETag: '"ignored-etag"',
        },
      })
    })

    const adapter = createAdmittingPublishedFormDefinitionAdapter(
      createHttpPublishedFormDefinitionAdapter({
        fetchImpl,
        baseUrl: '/form-definition-service',
      }),
    )

    await expect(
      adapter.loadLatestPublished({
        serviceId: SERVICE_ID,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.NOT_FOUND })

    publishedNow = true
    const snapshot = await adapter.loadLatestPublished({
      serviceId: SERVICE_ID,
      signal: new AbortController().signal,
    })
    expect(Object.keys(snapshot).sort()).toEqual(['definition', 'serviceId', 'version'])
    expect(snapshot.serviceId).toBe(SERVICE_ID)
    expect(snapshot.version).toBe(1)
    expect(snapshot.definition.status).toBe('published')
    expect(snapshot.definition).not.toHaveProperty('lockVersion')
    expect(JSON.stringify(snapshot)).not.toMatch(/ETag|actorId|lockVersion|from_status/)
  })
})

describe('FB-E4 — citizen FormRenderer Unit E published render', () => {
  it('mounts citizen mode EN/GU, progressive nav, locale-stable data, no submit', async () => {
    const user = userEvent.setup()
    const published = toPublishedDefinition(loadUnitEDraft())
    const loadLatestPublished = vi.fn(async () => publishedEnvelope(published))
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')

    renderPublished(`/apply/${SERVICE_ID}`, {
      adapter: { loadLatestPublished },
    })

    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    expect(loadLatestPublished).toHaveBeenCalledTimes(1)

    const firstStep = published.meta.progressiveSteps[0]
    expect(
      screen.getByRole('heading', { level: 2, name: new RegExp(firstStep.labelEn, 'i') }),
    ).toBeInTheDocument()

    const text = document.querySelector('input[type="text"], input:not([type])')
    if (text) {
      await user.type(text, 'UnitE Citizen')
    }

    await i18n.changeLanguage('gu')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: new RegExp(firstStep.labelGu, 'i') }),
      ).toBeInTheDocument()
    })
    if (text) {
      expect(text).toHaveValue('UnitE Citizen')
    }
    await i18n.changeLanguage('en')

    expect(screen.queryByRole('button', { name: /^Submit$/i })).not.toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(/\bETag\b|lockVersion|actorId|from_status/i)
    expect(storageSet).not.toHaveBeenCalled()

    const results = await axe(document.body)
    expect(results).toHaveNoViolations()
  }, 45_000)

  it('StrictMode performs exactly one live published-definition load', async () => {
    const published = toPublishedDefinition(loadUnitEDraft())
    const loadLatestPublished = vi.fn(async () => publishedEnvelope(published))
    renderPublished(`/apply/${SERVICE_ID}`, {
      adapter: { loadLatestPublished },
    })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())
    expect(loadLatestPublished).toHaveBeenCalledTimes(1)
  })

  it('keeps legacy hard-coded apply screens available as modules', () => {
    expect(typeof ApplyForm).toBe('function')
    expect(typeof CommonApplicationForm).toBe('function')
  })

  it('shows CAF governed unavailable without default widget-service adapters', async () => {
    const user = userEvent.setup()
    const published = toPublishedDefinition(loadUnitEDraft())
    renderPublished(`/apply/${SERVICE_ID}`, {
      adapter: {
        loadLatestPublished: async () => publishedEnvelope(published),
      },
    })
    await waitFor(() => expect(document.querySelector('[data-dg20-renderer]')).toBeTruthy())

    // CAF is on progressive step 2 for the Unit E fixture.
    await user.click(screen.getByRole('button', { name: /Next/i }))
    await waitFor(() =>
      expect(document.querySelector('[data-dg20-widget="caf-prefill"]')).toBeTruthy(),
    )
    expect(
      screen.getByText(/pre-fill is temporarily unavailable|manually/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Submit$/i })).not.toBeInTheDocument()
  })
})
