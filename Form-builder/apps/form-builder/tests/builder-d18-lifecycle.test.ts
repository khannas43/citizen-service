import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@dg20/form-contract'

import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
} from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  admitActorId,
  admitLifecycleSuccessResponse,
  computeCanSubmit,
  createHttpFormDefinitionLifecycleAdapter,
} from '../src/lifecycle/index.js'
import { formatStrongEtagForTests } from '../src/persistence/index.js'

function submittedDefinition(): FormDefinition {
  const definition = structuredClone(
    createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition,
  ) as FormDefinition
  return {
    ...definition,
    status: 'submitted',
    audit: { ...definition.audit, submittedBy: 'actor-1' },
  }
}

describe('FB-D18 lifecycle admission', () => {
  it('admits only clean actor strings within 256 code points', () => {
    expect(admitActorId('actor-1')).toEqual({ ok: true, actorId: 'actor-1' })
    expect(admitActorId(' actor')).toEqual({ ok: false })
    expect(admitActorId('')).toEqual({ ok: false })
    expect(admitActorId('😀'.repeat(256)).ok).toBe(true)
    expect(admitActorId('😀'.repeat(257)).ok).toBe(false)
    expect(admitActorId({ toString: () => 'actor' })).toEqual({ ok: false })
  })

  it('admits only submitted response envelopes', () => {
    const definition = submittedDefinition()
    const args = {
      body: definition,
      etagHeader: formatStrongEtagForTests(2),
      expectedServiceId: definition.serviceId,
      expectedVersion: definition.version,
    }
    expect(admitLifecycleSuccessResponse(args).ok).toBe(true)
    expect(
      admitLifecycleSuccessResponse({ ...args, body: { ...definition, status: 'draft' } }).ok,
    ).toBe(false)
    expect(
      admitLifecycleSuccessResponse({
        ...args,
        body: { ...definition, audit: { ...definition.audit, approvedBy: 'reviewer' } },
      }).ok,
    ).toBe(false)
    expect(
      admitLifecycleSuccessResponse({
        ...args,
        body: { ...definition, audit: { ...definition.audit, publishedAt: 'now' } },
      }).ok,
    ).toBe(false)
    expect(admitLifecycleSuccessResponse({ ...args, body: null }).ok).toBe(false)
  })
})

describe('FB-D18 HTTP lifecycle adapter', () => {
  it('sends authenticated submit without client actorId (FB-E5.4.2B)', async () => {
    const definition = submittedDefinition()
    const etag = formatStrongEtagForTests(3)
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `/form-definition-service/api/v1/form-definitions/builder/lifecycle-transitions?serviceId=${definition.serviceId}&version=${definition.version}`,
      )
      expect(init?.method).toBe('POST')
      expect(init?.cache).toBe('no-store')
      const headers = new Headers(init?.headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('Accept')).toBe('application/json')
      expect(headers.get('If-Match')).toBe(etag)
      expect(headers.get('Authorization')).toBe('Bearer e542a-synthetic-test-token')
      expect(init?.body).toBe(JSON.stringify({ targetStatus: 'submitted' }))
      expect(String(init?.body)).not.toContain('actorId')
      return new Response(JSON.stringify(definition), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: etag },
      })
    })
    const adapter = createHttpFormDefinitionLifecycleAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl,
    })
    const result = await adapter.submitDraft({
      serviceId: definition.serviceId,
      version: definition.version,
      etag,
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ definition, etag })
    expect(result).not.toHaveProperty('ok')
    await expect(
      adapter.submitDraft({
        serviceId: ' bad',
        version: 1,
        etag,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'invalid_coordinates' })
    await expect(
      adapter.submitDraft({
        serviceId: definition.serviceId,
        version: definition.version,
        etag: '"bad"',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'failed' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('performs zero fetches for every locally invalid request', async () => {
    const fetchImpl = vi.fn()
    const adapter = createHttpFormDefinitionLifecycleAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl,
    })
    const signal = new AbortController().signal
    const base = {
      serviceId: 'illustrative-builder-d0-preview',
      version: 1,
      etag: formatStrongEtagForTests(1),
      signal,
    }
    await expect(adapter.submitDraft({ ...base, serviceId: ' invalid' })).rejects.toMatchObject({
      code: 'invalid_coordinates',
    })
    await expect(adapter.submitDraft({ ...base, version: 0 })).rejects.toMatchObject({
      code: 'invalid_coordinates',
    })
    await expect(adapter.submitDraft({ ...base, etag: 'W/"AAAAAAAAAAE"' })).rejects.toMatchObject({
      code: 'failed',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects malformed or inadmissible lifecycle responses', async () => {
    const definition = submittedDefinition()
    const base = {
      serviceId: definition.serviceId,
      version: definition.version,
      etag: formatStrongEtagForTests(1),
      actorId: 'actor-1',
      signal: new AbortController().signal,
    }
    const responses = [
      new Response(JSON.stringify(definition), {
        status: 200,
        headers: { ETag: formatStrongEtagForTests(2) },
      }),
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: formatStrongEtagForTests(2) },
      }),
      new Response(JSON.stringify({ ...definition, status: 'draft' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: formatStrongEtagForTests(2) },
      }),
    ]
    for (const response of responses) {
      const adapter = createHttpFormDefinitionLifecycleAdapter({
        accessTokenProvider: () => 'e542a-synthetic-test-token',
        fetchImpl: vi.fn(async () => response),
      })
      await expect(adapter.submitDraft(base)).rejects.toMatchObject({ code: 'response_rejected' })
    }
  })
})

describe('FB-D18 submit eligibility', () => {
  it('requires a clean persisted definition and current valid result; advisories do not block', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const definition = session.definition
    const base = {
      definition,
      uiState: createAuthoringUiState(session),
      adapter: { submitDraft: vi.fn() },
      actorId: 'actor-1',
      phase: 'idle' as const,
      validation: {
        phase: 'valid' as const,
        result: {
          valid: true,
          issues: [{ code: 'notice', message: 'Notice', severity: 'warning' as const }],
        },
        resultMatchesCurrentDefinition: true,
      },
      persistence: {
        phase: 'saved' as const,
        binding: {
          kind: 'persisted' as const,
          serviceId: definition.serviceId,
          version: definition.version,
          etag: formatStrongEtagForTests(1),
          baseline: definition,
        },
        definitionDirty: false,
        saveBusy: false,
        loadBusy: false,
      },
    }
    expect(computeCanSubmit(base as Parameters<typeof computeCanSubmit>[0])).toBe(true)
    expect(
      computeCanSubmit({
        ...base,
        persistence: { ...base.persistence, binding: { kind: 'local' } },
      } as Parameters<typeof computeCanSubmit>[0]),
    ).toBe(false)
    expect(
      computeCanSubmit({
        ...base,
        persistence: { ...base.persistence, definitionDirty: true },
      } as Parameters<typeof computeCanSubmit>[0]),
    ).toBe(false)
    expect(
      computeCanSubmit({
        ...base,
        validation: { ...base.validation, resultMatchesCurrentDefinition: false },
      } as Parameters<typeof computeCanSubmit>[0]),
    ).toBe(false)
  })
})

describe('FB-D18 submitted authoring guard', () => {
  it('makes add actions no-ops after a submitted session replacement', () => {
    const initial = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    const submitted = submittedDefinition()
    const afterReplace = authoringReducer(initial, {
      type: 'replaceAuthoringSession',
      definition: submitted,
      previewPolicy: 'preserve',
    })
    const result = authoringReducer(afterReplace, { type: 'add', widgetType: 'short-text' })
    expect(result).toBe(afterReplace)
    expect(result.authoring.definition.status).toBe('submitted')
    expect(Object.keys(result.authoring.definition.jsonSchema.properties)).toHaveLength(
      Object.keys(submitted.jsonSchema.properties).length,
    )
  })
})
