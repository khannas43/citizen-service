/**
 * FB-E4 — Builder contract acceptance against the Unit E representative flow.
 * Acceptance-only; does not change production Builder behavior.
 */

import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@dg20/form-contract'

import {
  UNIT_E_ACCEPTANCE_ACTOR,
  UNIT_E_ACCEPTANCE_DEFINITION,
  UNIT_E_ACCEPTANCE_FIXTURE_SHA256,
  UNIT_E_ACCEPTANCE_SERVICE_ID,
  UNIT_E_ACCEPTANCE_VERSION,
  assertUnitEFixtureNotDrifted,
  createAcceptanceLifecycleAdapter,
  createAcceptancePersistenceAdapter,
  createAcceptancePersistenceStore,
  createAcceptanceValidationAdapter,
  createAcceptanceVersionAdapter,
  loadUnitEContractManifest,
  type AcceptanceCallLog,
  unitERepresentativeSha256,
} from '../acceptance/index.js'
import { createHttpFormDefinitionLifecycleAdapter } from '../src/lifecycle/index.js'
import { createHttpFormDefinitionDraftPersistenceAdapter } from '../src/persistence/index.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'
import { createHttpFormDefinitionValidationAdapter } from '../src/validation/index.js'
import { BuilderShell } from '../src/shell/BuilderShell.js'

const CANONICAL_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../acceptance/unit-e/unit-e-representative-definition.json',
)
const JAVA_COPY = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../services/form-definition-service/src/test/resources/acceptance/unit-e-representative-definition.json',
)

function jsonResponse(body: unknown, init?: { status?: number; etag?: string }) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (init?.etag) headers.set('ETag', init.etag)
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers })
}

describe('FB-E4 — fixture + contract drift', () => {
  it('keeps canonical JSON, Java copy, SHA file, and manifest aligned', () => {
    assertUnitEFixtureNotDrifted()
    expect(unitERepresentativeSha256()).toBe(UNIT_E_ACCEPTANCE_FIXTURE_SHA256)
    const canonical = readFileSync(CANONICAL_JSON)
    const javaCopy = readFileSync(JAVA_COPY)
    expect(createHash('sha256').update(javaCopy).digest('hex')).toBe(
      UNIT_E_ACCEPTANCE_FIXTURE_SHA256,
    )
    expect(Buffer.compare(canonical, javaCopy)).toBe(0)

    const manifest = loadUnitEContractManifest()
    expect(manifest.representativeFixture).toMatchObject({
      serviceId: UNIT_E_ACCEPTANCE_SERVICE_ID,
      version: UNIT_E_ACCEPTANCE_VERSION,
      sha256: UNIT_E_ACCEPTANCE_FIXTURE_SHA256,
    })
    expect(manifest.endpoints).toMatchObject({
      validation: '/api/v1/form-definitions/validation',
      technicalLifecycle: '/api/v1/form-definitions/lifecycle-transitions',
      builderAuthenticatedClone: '/api/v1/form-definitions/builder/drafts/from-version',
      builderAuthenticatedSubmit: '/api/v1/form-definitions/builder/lifecycle-transitions',
      governanceQueue: '/api/v1/form-definitions/governance/queue',
      publishedLatest: '/api/v1/form-definitions/published/latest',
    })
    expect(manifest.governanceRequestBody).toMatchObject({
      exactKeys: ['targetStatus'],
      forbiddenKeys: ['actorId'],
    })
    expect(manifest.technicalSubmitRequestBody).toMatchObject({
      exactKeys: ['targetStatus', 'actorId'],
      targetStatus: 'submitted',
    })
    expect(manifest.builderAuthenticatedSubmitRequestBody).toMatchObject({
      exactKeys: ['targetStatus'],
      forbiddenKeys: ['actorId'],
      targetStatus: 'submitted',
    })
    expect(UNIT_E_ACCEPTANCE_DEFINITION.status).toBe('draft')
    expect(UNIT_E_ACCEPTANCE_DEFINITION.meta.progressiveSteps.length).toBeGreaterThan(0)
    expect(UNIT_E_ACCEPTANCE_DEFINITION.meta.prefillBindings.length).toBeGreaterThan(0)
    expect(UNIT_E_ACCEPTANCE_DEFINITION.meta.integrationBindings.length).toBeGreaterThan(0)
    expect(UNIT_E_ACCEPTANCE_DEFINITION.meta.workflowBindings.length).toBeGreaterThan(0)
  })
})

describe('FB-E4 — Builder HTTP adapter contracts', () => {
  it('validation, draft create ETag admission, and authenticated submit body match contracts', async () => {
    const calls: Array<{ url: string; method: string; body: unknown; headers: Headers }> = []
    const etag = formatStrongEtagForTests(1)
    const submitted: FormDefinition = {
      ...structuredClone(UNIT_E_ACCEPTANCE_DEFINITION),
      status: 'submitted',
      audit: {
        ...UNIT_E_ACCEPTANCE_DEFINITION.audit,
        submittedBy: UNIT_E_ACCEPTANCE_ACTOR,
      },
    }

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const headers = new Headers(init?.headers)
      let body: unknown = undefined
      if (typeof init?.body === 'string') body = JSON.parse(init.body)
      calls.push({ url, method, body, headers })

      if (url.includes('/validation')) {
        return jsonResponse({ valid: true, issues: [] })
      }
      if (method === 'POST' && url.endsWith('/api/v1/form-definitions')) {
        return jsonResponse(UNIT_E_ACCEPTANCE_DEFINITION, { status: 201, etag })
      }
      if (url.includes('/builder/lifecycle-transitions')) {
        return jsonResponse(submitted, { etag: formatStrongEtagForTests(2) })
      }
      throw new Error(`unexpected fetch ${method} ${url}`)
    })

    const validation = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl,
    })
    const persistence = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl,
    })
    const lifecycle = createHttpFormDefinitionLifecycleAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl,
    })

    const validated = await validation.validateDefinition({
      definition: UNIT_E_ACCEPTANCE_DEFINITION,
      signal: new AbortController().signal,
    })
    expect(validated.valid).toBe(true)

    const created = await persistence.createDraft({
      definition: UNIT_E_ACCEPTANCE_DEFINITION,
      signal: new AbortController().signal,
    })
    expect(created.etag).toBe(etag)
    expect(created.definition.serviceId).toBe(UNIT_E_ACCEPTANCE_SERVICE_ID)

    const life = await lifecycle.submitDraft({
      serviceId: UNIT_E_ACCEPTANCE_SERVICE_ID,
      version: UNIT_E_ACCEPTANCE_VERSION,
      etag,
      signal: new AbortController().signal,
    })
    expect(life.definition.status).toBe('submitted')

    const validateCall = calls.find((c) => c.url.includes('/validation'))
    expect(validateCall?.method).toBe('POST')

    const createCall = calls.find(
      (c) => c.method === 'POST' && c.url.endsWith('/api/v1/form-definitions'),
    )
    expect(createCall).toBeTruthy()

    const submitCall = calls.find((c) => c.url.includes('/builder/lifecycle-transitions'))
    expect(submitCall?.method).toBe('POST')
    expect(submitCall?.headers.get('If-Match')).toBe(etag)
    expect(submitCall?.headers.get('Authorization')).toBe('Bearer e542a-synthetic-test-token')
    expect(submitCall?.body).toEqual({
      targetStatus: 'submitted',
    })
    expect(Object.keys(submitCall?.body as object).sort()).toEqual(['targetStatus'])
  })
})

describe('FB-E4 — Builder shell submit contract', () => {
  it('submits only after confirm; keeps ETag memory-only; no storage leakage', async () => {
    const user = userEvent.setup()
    const log: AcceptanceCallLog[] = []
    const store = createAcceptancePersistenceStore()
    const validation = createAcceptanceValidationAdapter(
      {
        mode: 'success',
        result: { valid: true, issues: [] },
      },
      log,
    )
    const persistence = createAcceptancePersistenceAdapter(store, { replaceMode: 'success' }, log)
    const lifecycle = createAcceptanceLifecycleAdapter(store, { mode: 'success' }, log)
    const versions = createAcceptanceVersionAdapter(store, {}, log)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const storageSet = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <StrictMode>
        <BuilderShell
          initialDefinition={UNIT_E_ACCEPTANCE_DEFINITION}
          validationAdapter={validation}
          persistenceAdapter={persistence}
          lifecycleAdapter={lifecycle}
          versionManagementAdapter={versions}
          lifecycleActorId={UNIT_E_ACCEPTANCE_ACTOR}
        />
      </StrictMode>,
    )

    expect(document.body.textContent).toContain(UNIT_E_ACCEPTANCE_SERVICE_ID)

    await user.click(screen.getByRole('button', { name: /^Validate$/i }))
    await waitFor(() => expect(screen.getByTestId('save-draft-button')).toBeEnabled())
    await user.click(screen.getByTestId('save-draft-button'))
    await waitFor(() => expect(screen.getByTestId('persist-success')).toBeInTheDocument())

    await waitFor(() => expect(screen.getByTestId('submit-button')).toBeEnabled())
    await user.click(screen.getByTestId('submit-button'))
    expect(screen.getByTestId('submit-confirm-dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(log.some((entry) => entry.name === 'submitDraft')).toBe(false)

    await user.click(screen.getByTestId('submit-button'))
    await user.click(screen.getByTestId('submit-confirm-confirm'))
    await waitFor(() => expect(log.filter((entry) => entry.name === 'submitDraft')).toHaveLength(1))
    await waitFor(() => expect(screen.getByTestId('submit-success')).toBeInTheDocument())

    expect(document.body.innerHTML).not.toMatch(/\bETag\b/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSet).not.toHaveBeenCalled()
    expect(log.map((e) => e.name)).toEqual(['validateDefinition', 'createDraft', 'submitDraft'])
  }, 30_000)

  it('does not silently submit unsaved editor drafts', async () => {
    const log: AcceptanceCallLog[] = []
    const store = createAcceptancePersistenceStore()
    const validation = createAcceptanceValidationAdapter(
      { mode: 'success', result: { valid: true, issues: [] } },
      log,
    )
    const persistence = createAcceptancePersistenceAdapter(store, { replaceMode: 'success' }, log)
    const lifecycle = createAcceptanceLifecycleAdapter(store, { mode: 'success' }, log)
    const versions = createAcceptanceVersionAdapter(store, {}, log)

    render(
      <StrictMode>
        <BuilderShell
          initialDefinition={UNIT_E_ACCEPTANCE_DEFINITION}
          validationAdapter={validation}
          persistenceAdapter={persistence}
          lifecycleAdapter={lifecycle}
          versionManagementAdapter={versions}
          lifecycleActorId={UNIT_E_ACCEPTANCE_ACTOR}
        />
      </StrictMode>,
    )

    // Without validate/create, submit must stay unavailable.
    expect(screen.getByTestId('submit-button')).toBeDisabled()
    expect(log.some((entry) => entry.name === 'submitDraft')).toBe(false)
  })
})
