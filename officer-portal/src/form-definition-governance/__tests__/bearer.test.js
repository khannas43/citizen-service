import { beforeEach, describe, expect, it, vi } from 'vitest'
import { admitOfficerAccessToken, OFFICER_ACCESS_TOKEN_MAX_CHARS } from '../../auth.js'
import {
  createHttpFormDefinitionGovernanceAdapter,
  formatStrongEtagForTests,
} from '../index.js'
import { GOVERNANCE_ERROR_CODES, GovernanceAdapterError } from '../errors.js'
import { makeDefinition } from './fixtures.js'

const SYNTHETIC_TOKEN = 'e541-synthetic-officer-token'
const SYNTHETIC_TOKEN_2 = 'e541-synthetic-officer-token-rotated'

function jsonResponse(body, { status = 200, etag } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (etag) headers.ETag = etag
  return new Response(JSON.stringify(body), { status, headers })
}

describe('admitOfficerAccessToken', () => {
  it('admits a nonblank bounded token', () => {
    expect(admitOfficerAccessToken(SYNTHETIC_TOKEN)).toEqual({
      ok: true,
      token: SYNTHETIC_TOKEN,
    })
  })

  it('rejects blank, padded, CRLF, control, and oversized tokens', () => {
    expect(admitOfficerAccessToken('').ok).toBe(false)
    expect(admitOfficerAccessToken('  x').ok).toBe(false)
    expect(admitOfficerAccessToken('x\r\n').ok).toBe(false)
    expect(admitOfficerAccessToken('x y').ok).toBe(false)
    expect(admitOfficerAccessToken('a'.repeat(OFFICER_ACCESS_TOKEN_MAX_CHARS + 1)).ok).toBe(false)
    expect(admitOfficerAccessToken(null).ok).toBe(false)
  })
})

describe('HTTP governance adapter Bearer provider (FB-E5.4.1)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sends current Bearer on queue, detail, and transition with If-Match', async () => {
    localStorage.setItem('officer_token', SYNTHETIC_TOKEN)
    const submitted = makeDefinition({ status: 'submitted', etagRevision: 1 })
    const approved = makeDefinition({ status: 'approved', etagRevision: 2 })
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/governance/queue')) {
        return jsonResponse({ items: [], nextCursor: null })
      }
      if (String(url).includes('/governance/detail')) {
        return jsonResponse(submitted.definition, { etag: submitted.etag })
      }
      if (String(url).includes('/governance/lifecycle-transitions')) {
        expect(init.headers['If-Match']).toBe(submitted.etag)
        expect(init.headers.Authorization).toBe(`Bearer ${SYNTHETIC_TOKEN}`)
        return jsonResponse(approved.definition, { etag: approved.etag })
      }
      throw new Error('unexpected url')
    })
    const adapter = createHttpFormDefinitionGovernanceAdapter({ fetchImpl })
    await adapter.listQueue({ signal: new AbortController().signal })
    await adapter.loadDetail({
      serviceId: 'svc-caste',
      version: 1,
      signal: new AbortController().signal,
    })
    await adapter.transition({
      serviceId: 'svc-caste',
      version: 1,
      etag: submitted.etag,
      targetStatus: 'approved',
      signal: new AbortController().signal,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.headers.Authorization).toBe(`Bearer ${SYNTHETIC_TOKEN}`)
    }
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('actorId')
  })

  it('observes token replacement between requests without reconstructing the adapter', async () => {
    localStorage.setItem('officer_token', SYNTHETIC_TOKEN)
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [], nextCursor: null }))
    const adapter = createHttpFormDefinitionGovernanceAdapter({ fetchImpl })
    await adapter.listQueue({ signal: new AbortController().signal })
    localStorage.setItem('officer_token', SYNTHETIC_TOKEN_2)
    await adapter.listQueue({ signal: new AbortController().signal })
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SYNTHETIC_TOKEN}`)
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${SYNTHETIC_TOKEN_2}`)
  })

  it('fails locally as unauthenticated with zero fetch when token missing or unsafe', async () => {
    const fetchImpl = vi.fn()
    const adapter = createHttpFormDefinitionGovernanceAdapter({ fetchImpl })
    await expect(adapter.listQueue({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: GOVERNANCE_ERROR_CODES.UNAUTHENTICATED,
    })
    localStorage.setItem('officer_token', 'bad\r\ntoken')
    await expect(adapter.listQueue({ signal: new AbortController().signal })).rejects.toBeInstanceOf(
      GovernanceAdapterError,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps provider throw to unauthenticated without leakage', async () => {
    const fetchImpl = vi.fn()
    const adapter = createHttpFormDefinitionGovernanceAdapter({
      fetchImpl,
      accessTokenProvider: () => {
        throw new Error(`secret-${SYNTHETIC_TOKEN}`)
      },
    })
    await expect(adapter.listQueue({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: GOVERNANCE_ERROR_CODES.UNAUTHENTICATED,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses injectable accessTokenProvider and preserves 401/403/412 mapping', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }))
    const adapter = createHttpFormDefinitionGovernanceAdapter({
      fetchImpl,
      accessTokenProvider: () => SYNTHETIC_TOKEN,
    })
    await expect(adapter.listQueue({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: GOVERNANCE_ERROR_CODES.UNAUTHENTICATED,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()

    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 403 }))
    await expect(adapter.listQueue({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: GOVERNANCE_ERROR_CODES.FORBIDDEN,
    })

    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 412 }))
    await expect(
      adapter.transition({
        serviceId: 'svc-caste',
        version: 1,
        etag: formatStrongEtagForTests(1),
        targetStatus: 'approved',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: GOVERNANCE_ERROR_CODES.STALE_REVISION })
  })

  it('does not put token text into GovernanceAdapterError messages', async () => {
    const adapter = createHttpFormDefinitionGovernanceAdapter({
      fetchImpl: vi.fn(),
      accessTokenProvider: () => null,
    })
    try {
      await adapter.listQueue({ signal: new AbortController().signal })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(GovernanceAdapterError)
      expect(String(error.message)).not.toContain(SYNTHETIC_TOKEN)
      expect(String(error.message)).not.toMatch(/Bearer/i)
    }
  })
})
