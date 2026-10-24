import { describe, expect, it, vi } from 'vitest'

import {
  ACCESS_TOKEN_MAX_CHARS,
  AccessTokenUnauthenticatedError,
  admitAccessToken,
  resolveAccessTokenAuthorizationHeaders,
} from '../src/auth/index.js'
import { createHttpFormDefinitionValidationAdapter } from '../src/validation/index.js'
import {
  createHttpFormDefinitionDraftPersistenceAdapter,
  formatStrongEtagForTests,
  preparePersistenceRequest,
} from '../src/persistence/index.js'
import type { DraftPersistenceError } from '../src/persistence/form-definition-draft-persistence-adapter.js'
import { createHttpFormDefinitionLifecycleAdapter } from '../src/lifecycle/index.js'
import type { LifecycleError } from '../src/lifecycle/form-definition-lifecycle-adapter.js'
import { createHttpFormDefinitionVersionManagementAdapter } from '../src/versions/index.js'
import {
  VersionManagementError,
  type VersionManagementFailureCode,
} from '../src/versions/form-definition-version-management-adapter.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { createAuthoringSession } from '../src/authoring/index.js'

const SYNTHETIC = 'e542a-synthetic-bearer-token'
const SYNTHETIC_2 = 'e542a-synthetic-bearer-token-rotated'
const ETAG = formatStrongEtagForTests(1)

function okJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

describe('FB-E5.4.2A access token admission', () => {
  it('admits a nonblank bounded token', () => {
    expect(admitAccessToken(SYNTHETIC)).toEqual({ ok: true, token: SYNTHETIC })
  })

  it('rejects blank, padded, CRLF, control, Bearer prefix, and oversized tokens', () => {
    expect(admitAccessToken('')).toEqual({ ok: false })
    expect(admitAccessToken('  padded  ')).toEqual({ ok: false })
    expect(admitAccessToken('bad\r\ntoken')).toEqual({ ok: false })
    expect(admitAccessToken('has space')).toEqual({ ok: false })
    expect(admitAccessToken('Bearer ' + SYNTHETIC)).toEqual({ ok: false })
    expect(admitAccessToken('a'.repeat(ACCESS_TOKEN_MAX_CHARS + 1))).toEqual({ ok: false })
    expect(admitAccessToken(null)).toEqual({ ok: false })
  })

  it('maps provider throw/reject to unauthenticated', async () => {
    await expect(
      resolveAccessTokenAuthorizationHeaders(() => {
        throw new Error('secret-provider-failure')
      }),
    ).rejects.toBeInstanceOf(AccessTokenUnauthenticatedError)

    await expect(
      resolveAccessTokenAuthorizationHeaders(() => Promise.reject(new Error('secret-reject'))),
    ).rejects.toBeInstanceOf(AccessTokenUnauthenticatedError)
  })

  it('aborts async provider before resolution', async () => {
    const controller = new AbortController()
    let resolveProvider: ((value: string | null) => void) | undefined
    const pending = resolveAccessTokenAuthorizationHeaders(
      () =>
        new Promise((resolve) => {
          resolveProvider = resolve
        }),
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    // Stale provider completion must not surface as success.
    resolveProvider?.(SYNTHETIC)
  })
})

describe('FB-E5.4.2A HTTP adapter Bearer forwarding', () => {
  const prepared = preparePersistenceRequest(
    createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
  )
  if (!prepared.ok) throw new Error('fixture prepare failed')
  const definition = prepared.definition

  it('sends Authorization on validation and fails closed without provider', async () => {
    const fetchImpl = vi.fn(async () => okJson({ valid: true, issues: [] }))
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => SYNTHETIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await adapter.validateDefinition({ definition, signal: new AbortController().signal })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${SYNTHETIC}`)

    const closed = createHttpFormDefinitionValidationAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      closed.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(AccessTokenUnauthenticatedError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('forwards Authorization on create/load/replace and coexists with If-Match', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(`Bearer ${SYNTHETIC}`)
      if ((init?.method ?? 'GET') === 'PUT') {
        expect(headers.get('If-Match')).toBe(ETAG)
      }
      return new Response('unauthorized-shape', { status: 401 })
    })

    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => SYNTHETIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = new AbortController().signal
    await expect(adapter.createDraft({ definition, signal })).rejects.toMatchObject({
      code: 'failed',
    })
    await expect(
      adapter.loadDraft({
        serviceId: definition.serviceId,
        version: definition.version,
        signal,
      }),
    ).rejects.toMatchObject({ code: 'failed' })
    await expect(
      adapter.replaceDraft({
        serviceId: definition.serviceId,
        version: definition.version,
        etag: ETAG,
        definition,
        signal,
      }),
    ).rejects.toMatchObject({ code: 'failed' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('observes token replacement between requests', async () => {
    let current = SYNTHETIC
    const fetchImpl = vi.fn(async () => okJson({ valid: true, issues: [] }))
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => current,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await adapter.validateDefinition({ definition, signal: new AbortController().signal })
    current = SYNTHETIC_2
    await adapter.validateDefinition({ definition, signal: new AbortController().signal })
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${SYNTHETIC}`)
    expect(fetchImpl.mock.calls[1]![1].headers.Authorization).toBe(`Bearer ${SYNTHETIC_2}`)
  })

  it('zero-fetch for unsafe tokens and provider logout', async () => {
    const fetchImpl = vi.fn()
    for (const bad of [null, 'bad token', 'x\ny', 'Bearer abc']) {
      const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
        accessTokenProvider: () => bad,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
      await expect(
        adapter.createDraft({ definition, signal: new AbortController().signal }),
      ).rejects.toMatchObject({ code: 'unauthenticated' } satisfies Partial<DraftPersistenceError>)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('forwards Authorization on version list and lifecycle with If-Match', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/versions')) {
        return okJson({ serviceId: definition.serviceId, items: [] })
      }
      if (String(url).includes('/builder/lifecycle-transitions')) {
        const headers = new Headers(init?.headers)
        expect(headers.get('If-Match')).toBe(ETAG)
        expect(headers.get('Authorization')).toBe(`Bearer ${SYNTHETIC}`)
        return new Response('forbidden', { status: 403 })
      }
      return okJson({})
    })

    const versions = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => SYNTHETIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await versions.listVersions({
      serviceId: definition.serviceId,
      limit: 10,
      signal: new AbortController().signal,
    })
    expect(new Headers(fetchImpl.mock.calls[0]![1].headers).get('Authorization')).toBe(
      `Bearer ${SYNTHETIC}`,
    )

    const lifecycle = createHttpFormDefinitionLifecycleAdapter({
      accessTokenProvider: () => SYNTHETIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      lifecycle.submitDraft({
        serviceId: definition.serviceId,
        version: definition.version,
        etag: ETAG,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'failed' })
    expect(new Headers(fetchImpl.mock.calls[1]![1].headers).get('Authorization')).toBe(
      `Bearer ${SYNTHETIC}`,
    )
    expect(new Headers(fetchImpl.mock.calls[1]![1].headers).get('If-Match')).toBe(ETAG)
    expect(fetchImpl.mock.calls[1]![1].body).toBe(JSON.stringify({ targetStatus: 'submitted' }))
  })

  it('forwards Authorization and If-Match on clone attempt with empty body', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(`Bearer ${SYNTHETIC}`)
      expect(headers.get('If-Match')).toBe(ETAG)
      expect(init?.body).toBe(JSON.stringify({}))
      expect(String(_url)).toContain('/builder/drafts/from-version')
      return new Response('forbidden', { status: 403 })
    })
    const versions = createHttpFormDefinitionVersionManagementAdapter({
      accessTokenProvider: () => SYNTHETIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      versions.cloneDraft({
        serviceId: definition.serviceId,
        sourceVersion: definition.version,
        sourceEtag: ETAG,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(VersionManagementError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps missing provider on lifecycle/versions to unauthenticated with zero fetch', async () => {
    const fetchImpl = vi.fn()
    const lifecycle = createHttpFormDefinitionLifecycleAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      lifecycle.submitDraft({
        serviceId: definition.serviceId,
        version: definition.version,
        etag: ETAG,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'unauthenticated' } satisfies Partial<LifecycleError>)

    const versions = createHttpFormDefinitionVersionManagementAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      versions.listVersions({
        serviceId: definition.serviceId,
        limit: 10,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'unauthenticated' as VersionManagementFailureCode,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not put token text into error messages', async () => {
    const secret = 'super-secret-token-value-e542a'
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => ` ${secret} `,
    })
    try {
      await adapter.validateDefinition({ definition, signal: new AbortController().signal })
      expect.fail('expected unauthenticated')
    } catch (error) {
      expect(error).toBeInstanceOf(AccessTokenUnauthenticatedError)
      expect(String(error)).not.toContain(secret)
      expect((error as Error).message).toBe('unauthenticated')
    }
  })
})
