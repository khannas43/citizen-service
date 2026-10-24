/**
 * FB-E4 officer-portal acceptance — real E2/E2.1 adapter + admission against FDS-shaped flow.
 * Acceptance-only. Does not change production portal behavior.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import FormDefinitionGovernance from '../screens/FormDefinitionGovernance.jsx'
import {
  createAdmittingFormDefinitionGovernanceAdapter,
  createHttpFormDefinitionGovernanceAdapter,
  formatStrongEtagForTests,
  GOVERNANCE_ERROR_CODES,
  GovernanceAdapterError,
} from '../form-definition-governance/index.js'
import { createMemoryGovernanceAdapter } from '../form-definition-governance/__tests__/fixtures.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(here, 'unit-e')
const CANONICAL_SHA =
  '8847a0904c402b7b98822f96741234a0f93230d57f7ecf458f41b66e979c557e'
const SERVICE_ID = 'unit-e-technical-acceptance'

function loadUnitEDraft() {
  const bytes = readFileSync(join(FIXTURE_DIR, 'unit-e-representative-definition.json'))
  const sha = createHash('sha256').update(bytes).digest('hex')
  const expected = readFileSync(join(FIXTURE_DIR, 'unit-e-representative-definition.sha256'), 'utf8').trim()
  expect(sha).toBe(CANONICAL_SHA)
  expect(expected).toBe(CANONICAL_SHA)
  return JSON.parse(bytes.toString('utf8'))
}

function renderGovernance(adapter) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/form-definitions']}>
        <Routes>
          <Route path="/form-definitions" element={<FormDefinitionGovernance adapter={adapter} />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('FB-E4 — officer contract drift', () => {
  it('keeps Unit E fixture SHA and governance contract manifest aligned', () => {
    loadUnitEDraft()
    const manifest = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'contract-manifest.json'), 'utf8'),
    )
    expect(manifest.endpoints.governanceQueue).toBe(
      '/api/v1/form-definitions/governance/queue',
    )
    expect(manifest.governanceRequestBody).toEqual({
      exactKeys: ['targetStatus'],
      forbiddenKeys: ['actorId'],
      allowedTargetStatus: ['approved', 'published'],
    })
    expect(manifest.queueItemEnvelope.exactKeys).toEqual(['serviceId', 'version', 'status'])
    expect(manifest.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/technical only/i),
        expect.stringMatching(/not DST/i),
      ]),
    )
  })
})

describe('FB-E4 — officer HTTP adapter against FDS-shaped responses', () => {
  it('lists submitted, admits detail field order/ETag, approve then publish without actorId', async () => {
    const draft = loadUnitEDraft()
    const submitted = {
      ...structuredClone(draft),
      status: 'submitted',
      audit: { ...draft.audit, submittedBy: 'unit-e-technical-submitter' },
    }
    const approved = {
      ...structuredClone(submitted),
      status: 'approved',
      audit: { ...submitted.audit, approvedBy: 'unit-e-governance-officer' },
    }
    const published = {
      ...structuredClone(approved),
      status: 'published',
      audit: { ...approved.audit, publishedAt: '2026-07-27T12:00:00Z' },
    }
    const etagSubmitted = formatStrongEtagForTests(2)
    const etagApproved = formatStrongEtagForTests(3)
    const etagPublished = formatStrongEtagForTests(4)
    const bodies = []

    const fetchImpl = vi.fn(async (input, init = {}) => {
      const url = String(input)
      const method = init.method ?? 'GET'
      if (url.includes('/governance/queue')) {
        return new Response(
          JSON.stringify({
            items: [{ serviceId: SERVICE_ID, version: 1, status: 'submitted' }],
            nextCursor: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          },
        )
      }
      if (url.includes('/governance/detail')) {
        return new Response(JSON.stringify(submitted), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: etagSubmitted,
            'Cache-Control': 'no-store',
          },
        })
      }
      if (url.includes('/governance/lifecycle-transitions')) {
        bodies.push({
          ifMatch: new Headers(init.headers).get('If-Match'),
          body: JSON.parse(init.body),
        })
        const target = JSON.parse(init.body).targetStatus
        if (target === 'approved') {
          expect(new Headers(init.headers).get('If-Match')).toBe(etagSubmitted)
          return new Response(JSON.stringify(approved), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: etagApproved },
          })
        }
        if (target === 'published') {
          expect(new Headers(init.headers).get('If-Match')).toBe(etagApproved)
          return new Response(JSON.stringify(published), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: etagPublished },
          })
        }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const adapter = createAdmittingFormDefinitionGovernanceAdapter(
      createHttpFormDefinitionGovernanceAdapter({
        fetchImpl,
        baseUrl: '/form-definition-service',
        accessTokenProvider: () => 'e541-synthetic-acceptance-token',
      }),
    )

    const queue = await adapter.listQueue({ limit: 50, signal: new AbortController().signal })
    expect(queue.items).toEqual([{ serviceId: SERVICE_ID, version: 1, status: 'submitted' }])

    const detail = await adapter.loadDetail({
      serviceId: SERVICE_ID,
      version: 1,
      signal: new AbortController().signal,
    })
    expect(detail.definition.serviceId).toBe(SERVICE_ID)
    expect(detail.etag).toBe(etagSubmitted)
    expect(detail.fieldOrder).toEqual(submitted.uiSchema['ui:order'])

    const afterApprove = await adapter.transition({
      serviceId: SERVICE_ID,
      version: 1,
      etag: detail.etag,
      targetStatus: 'approved',
      signal: new AbortController().signal,
    })
    expect(afterApprove.definition.status).toBe('approved')
    expect(afterApprove.etag).toBe(etagApproved)

    const afterPublish = await adapter.transition({
      serviceId: SERVICE_ID,
      version: 1,
      etag: afterApprove.etag,
      targetStatus: 'published',
      signal: new AbortController().signal,
    })
    expect(afterPublish.definition.status).toBe('published')

    expect(bodies).toEqual([
      { ifMatch: etagSubmitted, body: { targetStatus: 'approved' } },
      { ifMatch: etagApproved, body: { targetStatus: 'published' } },
    ])
    for (const entry of bodies) {
      expect(Object.keys(entry.body)).toEqual(['targetStatus'])
      expect(JSON.stringify(entry.body)).not.toContain('actorId')
    }
  })

  it('maps stale If-Match to governed 412 handling', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 'stale_revision' }), { status: 412 }))
    const adapter = createHttpFormDefinitionGovernanceAdapter({
      fetchImpl,
      baseUrl: '/form-definition-service',
      accessTokenProvider: () => 'e541-synthetic-acceptance-token',
    })
    await expect(
      adapter.transition({
        serviceId: SERVICE_ID,
        version: 1,
        etag: formatStrongEtagForTests(1),
        targetStatus: 'approved',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: GOVERNANCE_ERROR_CODES.STALE_REVISION })
  })
})

describe('FB-E4 — officer UI against Unit E coordinates', () => {
  it('approve/publish updates queue; Cancel/Escape zero calls; ETag never in DOM/storage; queue not DST', async () => {
    const user = userEvent.setup()
    const draft = loadUnitEDraft()
    const submittedSnap = {
      definition: {
        ...structuredClone(draft),
        status: 'submitted',
        audit: { ...draft.audit, submittedBy: 'unit-e-technical-submitter' },
      },
      etag: formatStrongEtagForTests(2),
      fieldOrder: draft.uiSchema['ui:order'],
    }
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: SERVICE_ID, version: 1, status: 'submitted' }],
      details: new Map([[`${SERVICE_ID}\0${1}`, submittedSnap]]),
    })
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    renderGovernance(adapter)

    expect(await screen.findByText(SERVICE_ID)).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/Form Definition/i)
    expect(document.body.textContent).toMatch(/not DST|technical|Form Definition Service/i)
    // Queue is FDS status-derived — must not claim to be the DST inbox.
    expect(document.body.textContent).not.toMatch(/\bis the DST inbox\b/i)

    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.keyboard('{Escape}')
    expect(state.transitionCalls).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    expect(await screen.findByText(/Definition approved/i)).toBeInTheDocument()
    expect(state.transitionCalls[0].body).toEqual({ targetStatus: 'approved' })
    expect(JSON.stringify(state.transitionCalls[0])).not.toContain('actorId')

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Publish' }))
    expect(await screen.findByText(/Definition published/i)).toBeInTheDocument()
    expect(state.transitionCalls[1].targetStatus).toBe('published')
    expect(state.transitionCalls[1].etag).not.toBe(submittedSnap.etag)

    expect(document.body.innerHTML).not.toMatch(/\bETag\b/i)
    expect(document.body.textContent).not.toMatch(submittedSnap.etag)
    expect(storageSet).not.toHaveBeenCalled()
    expect(consoleSpy.mock.calls.flat().join(' ')).not.toMatch(/\bETag\b|eyJ/)
    consoleSpy.mockRestore()
  }, 30_000)

  it('surfaces governed stale 412 without clearing the stale guidance', async () => {
    const user = userEvent.setup()
    const { adapter, state } = createMemoryGovernanceAdapter({
      items: [{ serviceId: SERVICE_ID, version: 1, status: 'submitted' }],
    })
    renderGovernance(adapter)
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    state.failTransitionWith = new GovernanceAdapterError(GOVERNANCE_ERROR_CODES.STALE_REVISION)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Approve' }))
    expect(await screen.findByText(/changed since it was loaded/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Reload Detail' }).length).toBeGreaterThan(0)
    expect(state.transitionCalls).toHaveLength(1)
  })
})
