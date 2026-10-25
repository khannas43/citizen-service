import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@citizen/form-contract'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  admitPersistencePortResult,
  admitPersistenceSuccessResponse,
  createHttpFormDefinitionDraftPersistenceAdapter,
  DraftPersistenceError,
  formatStrongEtagForTests,
} from '../src/persistence/index.js'

function definition(): FormDefinition {
  return createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
}

function jsonResponse(
  body: unknown,
  init: {
    status: number
    etag?: string
    contentType?: string
  },
): Response {
  const headers = new Headers()
  headers.set('Content-Type', init.contentType ?? 'application/json')
  if (init.etag) {
    headers.set('ETag', init.etag)
  }
  return new Response(JSON.stringify(body), { status: init.status, headers })
}

describe('FB-D7.1 — exact FormDefinition response envelope', () => {
  const def = definition()
  const etag = formatStrongEtagForTests(3)

  it('rejects unexpected root keys including lockVersion and etag', () => {
    expect(
      admitPersistenceSuccessResponse({
        body: { ...def, lockVersion: 1 },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
    expect(
      admitPersistenceSuccessResponse({
        body: { ...def, etag },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
  })

  it('rejects unexpected meta and audit keys', () => {
    expect(
      admitPersistenceSuccessResponse({
        body: {
          ...def,
          meta: { ...def.meta, extraMeta: true },
        },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
    expect(
      admitPersistenceSuccessResponse({
        body: {
          ...def,
          audit: { ...def.audit, unexpected: 'x' },
        },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
  })

  it('rejects binding entries with unexpected keys or missing field ids', () => {
    expect(
      admitPersistenceSuccessResponse({
        body: {
          ...def,
          meta: {
            ...def.meta,
            prefillBindings: [
              {
                fieldId: 'applicant_name',
                cafAttribute: 'name',
                confidenceMin: 0.5,
                extra: true,
              },
            ],
          },
        },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
    expect(
      admitPersistenceSuccessResponse({
        body: {
          ...def,
          meta: {
            ...def.meta,
            workflowBindings: [{ fieldId: 'no-such-field', stage: 'intake' }],
          },
        },
        etagHeader: etag,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
  })

  it('admits a clean envelope and detaches from the source body', () => {
    const body = structuredClone(def)
    const admitted = admitPersistenceSuccessResponse({
      body,
      etagHeader: etag,
      expectedServiceId: def.serviceId,
      expectedVersion: def.version,
    })
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    expect(admitted.definition).not.toBe(body)
    ;(body as { serviceId: string }).serviceId = 'mutated-source'
    expect(admitted.definition.serviceId).toBe(def.serviceId)
  })
})

describe('FB-D7.1 — persistence port-result re-admission', () => {
  const def = definition()
  const etag = formatStrongEtagForTests(4)

  it('rejects malformed ETag, accessor bags, and coordinate mismatches', () => {
    expect(
      admitPersistencePortResult({
        raw: { definition: def, etag: 'not-an-etag' },
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)

    const accessorDefinition = {}
    for (const key of Object.keys(def)) {
      Object.defineProperty(accessorDefinition, key, {
        enumerable: true,
        get() {
          return (def as Record<string, unknown>)[key]
        },
      })
    }
    expect(
      admitPersistencePortResult({
        raw: { definition: accessorDefinition, etag },
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)

    expect(
      admitPersistencePortResult({
        raw: { definition: { ...def, serviceId: 'other' }, etag },
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
  })

  it('rejects unexpected port properties and accessor-only definition bags', () => {
    expect(
      admitPersistencePortResult({
        raw: { definition: def, etag, extra: true },
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)

    const accessorOnly = {}
    Object.defineProperty(accessorOnly, 'definition', {
      enumerable: true,
      get() {
        return def
      },
    })
    Object.defineProperty(accessorOnly, 'etag', {
      enumerable: true,
      value: etag,
    })
    expect(
      admitPersistencePortResult({
        raw: accessorOnly,
        expectedServiceId: def.serviceId,
        expectedVersion: def.version,
      }).ok,
    ).toBe(false)
  })

  it('returns a detached admitted snapshot for a clean port result', () => {
    const raw = { definition: structuredClone(def), etag }
    const admitted = admitPersistencePortResult({
      raw,
      expectedServiceId: def.serviceId,
      expectedVersion: def.version,
    })
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    expect(admitted.definition).not.toBe(raw.definition)
    ;(raw.definition as { serviceId: string }).serviceId = 'mutated'
    expect(admitted.definition.serviceId).toBe(def.serviceId)
  })
})

describe('FB-D7.1 — direct HTTP request admission', () => {
  const def = definition()
  const etag = formatStrongEtagForTests(7)

  it('makes zero fetch calls for invalid create/load/replace requests', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(def, { status: 201, etag }))
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = new AbortController().signal

    await expect(
      adapter.createDraft({
        definition: { ...def, status: 'published' } as FormDefinition,
        signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )

    await expect(adapter.loadDraft({ serviceId: ' padded', version: 1, signal })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DraftPersistenceError && error.code === 'invalid_coordinates',
    )

    await expect(
      adapter.replaceDraft({
        serviceId: def.serviceId,
        version: def.version,
        etag: 'bad',
        definition: def,
        signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )

    await expect(
      adapter.replaceDraft({
        serviceId: def.serviceId,
        version: def.version,
        etag,
        definition: { ...def, serviceId: 'other' },
        signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )

    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('rejects hostile toJSON request bodies before fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(def, { status: 201, etag }))
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const hostile = structuredClone(def) as FormDefinition & { toJSON?: () => unknown }
    hostile.toJSON = () => {
      throw new Error('toJSON must not run')
    }
    await expect(
      adapter.createDraft({
        definition: hostile,
        signal: new AbortController().signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })
})
