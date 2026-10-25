import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@citizen/form-contract'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'
import {
  admitVersionListResponse,
  admitVersionListLimit,
  createHttpFormDefinitionVersionManagementAdapter,
} from '../src/versions/index.js'

function definition(status: FormDefinition['status'] = 'draft'): FormDefinition {
  return { ...createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition, status }
}

describe('FB-D19 version listing admission', () => {
  it('admits bounded integer limits only', () => {
    expect(admitVersionListLimit(1)).toEqual({ ok: true, limit: 1 })
    expect(admitVersionListLimit(100)).toEqual({ ok: true, limit: 100 })
    expect(admitVersionListLimit(0).ok).toBe(false)
    expect(admitVersionListLimit(1.5).ok).toBe(false)
  })

  it('requires ascending versions after the cursor and rejects sparse arrays', () => {
    const args = {
      expectedServiceId: 'svc',
      afterVersion: 2,
      body: { serviceId: 'svc', items: [{ version: 3, status: 'draft' }], nextAfterVersion: 3 },
    }
    expect(admitVersionListResponse(args).ok).toBe(true)
    expect(
      admitVersionListResponse({
        ...args,
        body: { ...args.body, items: [{ version: 2, status: 'draft' }] },
      }).ok,
    ).toBe(false)
    const sparse = Array(2) as unknown as Array<{ version: number; status: string }>
    sparse[1] = { version: 4, status: 'draft' }
    expect(
      admitVersionListResponse({ ...args, body: { serviceId: 'svc', items: sparse } }).ok,
    ).toBe(false)
  })
})

describe('FB-D19 HTTP adapter', () => {
  it('encodes list requests and makes no request for invalid coordinates', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        '/form-definition-service/api/v1/form-definitions/versions?serviceId=a+b&afterVersion=2&limit=50',
      )
      return new Response(JSON.stringify({ serviceId: 'a b', items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const adapter = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await adapter.listVersions({
      serviceId: 'a b',
      afterVersion: 2,
      limit: 50,
      signal: new AbortController().signal,
    })
    await expect(
      adapter.listVersions({ serviceId: ' bad', limit: 50, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'invalid_coordinates' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects draft clone sources', async () => {
    const draft = definition()
    const adapter = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response(JSON.stringify(draft), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: formatStrongEtagForTests(1) },
        })) as unknown as typeof fetch,
    })
    await expect(
      adapter.prepareCloneSource({
        serviceId: draft.serviceId,
        sourceVersion: draft.version,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'source_not_cloneable' })
  })

  it('POSTs authenticated clone with empty body and If-Match (FB-E5.4.2B)', async () => {
    const source = definition('published')
    const cloned = { ...definition(), version: source.version + 1 }
    const etag = formatStrongEtagForTests(1)
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `/form-definition-service/api/v1/form-definitions/builder/drafts/from-version?serviceId=${source.serviceId}&sourceVersion=${source.version}`,
      )
      expect(init?.body).toBe(JSON.stringify({}))
      expect(String(init?.body)).not.toContain('createdBy')
      expect(new Headers(init?.headers).get('If-Match')).toBe(etag)
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        'Bearer e542a-synthetic-test-token',
      )
      return new Response(JSON.stringify(cloned), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ETag: formatStrongEtagForTests(2) },
      })
    })
    const adapter = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      adapter.cloneDraft({
        serviceId: source.serviceId,
        sourceVersion: source.version,
        sourceEtag: etag,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ definition: { version: cloned.version } })
    const bad = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ...cloned, version: source.version }), {
          status: 201,
          headers: { 'Content-Type': 'application/json', ETag: formatStrongEtagForTests(2) },
        })) as unknown as typeof fetch,
    })
    await expect(
      bad.cloneDraft({
        serviceId: source.serviceId,
        sourceVersion: source.version,
        sourceEtag: etag,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'response_rejected' })
  })
})
