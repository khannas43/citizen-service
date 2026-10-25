import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@citizen/form-contract'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  admitDraftCoordinates,
  admitServiceId,
  admitStrongEtag,
  admitVersionQuery,
  createHttpFormDefinitionDraftPersistenceAdapter,
  DraftPersistenceError,
  encodeDraftCoordinateQuery,
  formatStrongEtagForTests,
  preparePersistenceRequest,
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
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status: init.status, headers })
}

describe('FB-D7 — coordinate admission', () => {
  it('admits trimmed nonblank serviceId within 256 code points', () => {
    expect(admitServiceId('svc-1')).toEqual({ ok: true, serviceId: 'svc-1' })
    expect(admitServiceId(' svc')).toEqual({ ok: false })
    expect(admitServiceId('svc ')).toEqual({ ok: false })
    expect(admitServiceId('')).toEqual({ ok: false })
    expect(admitServiceId('a'.repeat(256))).toEqual({ ok: true, serviceId: 'a'.repeat(256) })
    expect(admitServiceId('a'.repeat(257))).toEqual({ ok: false })
    expect(admitServiceId('😀'.repeat(256)).ok).toBe(true)
    expect(admitServiceId('😀'.repeat(257)).ok).toBe(false)
  })

  it('admits canonical version query text only', () => {
    expect(admitVersionQuery('1')).toEqual({ ok: true, version: 1 })
    expect(admitVersionQuery('2147483647')).toEqual({ ok: true, version: 2147483647 })
    expect(admitVersionQuery('0')).toEqual({ ok: false })
    expect(admitVersionQuery('01')).toEqual({ ok: false })
    expect(admitVersionQuery('+1')).toEqual({ ok: false })
    expect(admitVersionQuery('1.0')).toEqual({ ok: false })
    expect(admitVersionQuery('1e2')).toEqual({ ok: false })
    expect(admitVersionQuery(' 1')).toEqual({ ok: false })
    expect(admitVersionQuery('2147483648')).toEqual({ ok: false })
    expect(admitVersionQuery(1 as unknown as string)).toEqual({ ok: false })
  })

  it('encodes coordinates with URLSearchParams', () => {
    expect(encodeDraftCoordinateQuery('a b', 2)).toBe('serviceId=a+b&version=2')
    expect(admitDraftCoordinates('svc', '3')).toEqual({
      ok: true,
      serviceId: 'svc',
      version: 3,
    })
  })
})

describe('FB-D7 — strong ETag admission', () => {
  it('admits exact strong tokens and rejects weak/wildcard/padded/malformed', () => {
    const ok = formatStrongEtagForTests(1)
    expect(admitStrongEtag(ok)).toEqual({ ok: true, etag: ok })
    expect(admitStrongEtag(`W/${ok}`).ok).toBe(false)
    expect(admitStrongEtag('*').ok).toBe(false)
    expect(admitStrongEtag(`${ok},${ok}`).ok).toBe(false)
    expect(admitStrongEtag(ok.slice(0, -1) + '="').ok).toBe(false)
    expect(admitStrongEtag('"AAAA"').ok).toBe(false)
    expect(admitStrongEtag(null).ok).toBe(false)
    expect(admitStrongEtag(` ${ok}`).ok).toBe(false)
  })
})

describe('FB-D7 — HTTP draft persistence adapter', () => {
  const def = definition()
  const etag = formatStrongEtagForTests(7)

  it('POSTs create with exact URL/method/headers and admits 201 + ETag', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/form-definition-service/api/v1/form-definitions')
      expect(init?.method).toBe('POST')
      expect(init?.cache).toBe('no-store')
      const headers = new Headers(init?.headers)
      expect(headers.get('Accept')).toBe('application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('If-Match')).toBeNull()
      const body = JSON.parse(String(init?.body)) as FormDefinition
      expect(body).not.toBe(def)
      expect(body.serviceId).toBe(def.serviceId)
      return jsonResponse(def, { status: 201, etag })
    })
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const prepared = preparePersistenceRequest(def)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const result = await adapter.createDraft({
      definition: prepared.definition,
      signal: new AbortController().signal,
    })
    expect(result.etag).toBe(etag)
    expect(result.definition).not.toBe(prepared.definition)
    expect(result.definition.serviceId).toBe(def.serviceId)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('GETs exact coordinates and PUTs with exact If-Match', async () => {
    const loadFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `/form-definition-service/api/v1/form-definitions?${encodeDraftCoordinateQuery(def.serviceId, def.version)}`,
      )
      expect(init?.method).toBe('GET')
      return jsonResponse(def, { status: 200, etag })
    })
    const loadAdapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: loadFetch as unknown as typeof fetch,
    })
    await expect(
      loadAdapter.loadDraft({
        serviceId: def.serviceId,
        version: def.version,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ etag })

    const nextEtag = formatStrongEtagForTests(8)
    const putFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT')
      const headers = new Headers(init?.headers)
      expect(headers.get('If-Match')).toBe(etag)
      return jsonResponse(def, { status: 200, etag: nextEtag })
    })
    const putAdapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: putFetch as unknown as typeof fetch,
    })
    const prepared = preparePersistenceRequest(def)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const replaced = await putAdapter.replaceDraft({
      serviceId: def.serviceId,
      version: def.version,
      etag,
      definition: prepared.definition,
      signal: new AbortController().signal,
    })
    expect(replaced.etag).toBe(nextEtag)
  })

  it('classifies create 409, load 404, replace 412/409, and 422', async () => {
    const cases: Array<{
      status: number
      op: 'create' | 'load' | 'replace'
      code: string
    }> = [
      { status: 409, op: 'create', code: 'duplicate' },
      { status: 404, op: 'load', code: 'not_found' },
      { status: 412, op: 'replace', code: 'stale' },
      { status: 409, op: 'replace', code: 'not_editable' },
      { status: 422, op: 'create', code: 'validation_rejected' },
    ]
    for (const item of cases) {
      const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
        accessTokenProvider: () => 'e542a-synthetic-test-token',
        fetchImpl: (async () =>
          new Response('{}', {
            status: item.status,
            headers: { 'Content-Type': 'application/json' },
          })) as unknown as typeof fetch,
      })
      const signal = new AbortController().signal
      const prepared = preparePersistenceRequest(def)
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const run =
        item.op === 'create'
          ? adapter.createDraft({ definition: prepared.definition, signal })
          : item.op === 'load'
            ? adapter.loadDraft({
                serviceId: def.serviceId,
                version: def.version,
                signal,
              })
            : adapter.replaceDraft({
                serviceId: def.serviceId,
                version: def.version,
                etag,
                definition: prepared.definition,
                signal,
              })
      await expect(run).rejects.toSatisfy(
        (error: unknown) => error instanceof DraftPersistenceError && error.code === item.code,
      )
    }
  })

  it('rejects missing/malformed ETag, wrong content-type, and coordinate mismatch', async () => {
    const noEtag = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () => jsonResponse(def, { status: 201 })) as unknown as typeof fetch,
    })
    await expect(
      noEtag.createDraft({ definition: def, signal: new AbortController().signal }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DraftPersistenceError && error.code === 'response_rejected',
    )

    const wrongType = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        jsonResponse(def, {
          status: 201,
          etag,
          contentType: 'text/plain',
        })) as unknown as typeof fetch,
    })
    await expect(
      wrongType.createDraft({ definition: def, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'response_rejected' })

    const mismatch = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        jsonResponse(
          { ...def, serviceId: 'other' },
          { status: 201, etag },
        )) as unknown as typeof fetch,
    })
    await expect(
      mismatch.createDraft({ definition: def, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'response_rejected' })
  })

  it('rejects oversized responses and does not retry', async () => {
    let calls = 0
    const huge = 'x'.repeat(200)
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      maxResponseBytes: 32,
      fetchImpl: (async () => {
        calls += 1
        return new Response(huge, {
          status: 201,
          headers: { 'Content-Type': 'application/json', ETag: etag },
        })
      }) as unknown as typeof fetch,
    })
    await expect(
      adapter.createDraft({ definition: def, signal: new AbortController().signal }),
    ).rejects.toBeTruthy()
    expect(calls).toBe(1)
  })
})
