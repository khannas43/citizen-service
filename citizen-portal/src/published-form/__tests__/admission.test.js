import { describe, expect, it, vi } from 'vitest'
import {
  admitPublishedAdapterResult,
  admitPublishedLatestResponse,
  admitServiceId,
  admitSubmissionResult,
  cloneJsonSafe,
  createAdmittingPublishedFormDefinitionAdapter,
  createHttpPublishedFormDefinitionAdapter,
  encodeServiceIdQuery,
  isJsonCompatibleContentType,
  PUBLISHED_FORM_ERROR_CODES,
  PublishedFormError,
  submitWithDetachedFormData,
} from '../index.js'
import {
  createE3AcceptancePublishedDefinition,
  E3_TECHNICAL_SERVICE_ID,
  jsonResponse,
  publishedAdapterResult,
} from './fixtures.js'

describe('admitServiceId', () => {
  it('admits exact non-blank serviceIds within the code-point limit', () => {
    expect(admitServiceId(E3_TECHNICAL_SERVICE_ID)).toEqual({
      ok: true,
      serviceId: E3_TECHNICAL_SERVICE_ID,
    })
  })

  it('rejects padded, blank, non-string, and oversized serviceIds', () => {
    expect(admitServiceId(' padded').ok).toBe(false)
    expect(admitServiceId('padded ').ok).toBe(false)
    expect(admitServiceId('').ok).toBe(false)
    expect(admitServiceId('   ').ok).toBe(false)
    expect(admitServiceId(null).ok).toBe(false)
    expect(admitServiceId('x'.repeat(257)).ok).toBe(false)
  })
})

describe('admitPublishedLatestResponse — exact FormDefinition root', () => {
  it('admits an exact canonical published definition', () => {
    const definition = createE3AcceptancePublishedDefinition()
    const admitted = admitPublishedLatestResponse(definition, E3_TECHNICAL_SERVICE_ID)
    expect(admitted.ok).toBe(true)
    expect(admitted.snapshot.serviceId).toBe(E3_TECHNICAL_SERVICE_ID)
    expect(admitted.snapshot.version).toBe(1)
    expect(admitted.snapshot.definition.status).toBe('published')
    expect(admitted.snapshot).not.toHaveProperty('plan')
    expect(Object.keys(admitted.snapshot).sort()).toEqual(['definition', 'serviceId', 'version'])
  })

  it('rejects lockVersion, etag/ETag, and arbitrary root extras without repair', () => {
    const base = createE3AcceptancePublishedDefinition()
    expect(
      admitPublishedLatestResponse({ ...base, lockVersion: 1 }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, etag: '"x"' }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, ETag: '"x"' }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, source: 'fds' }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, extra: true }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
  })

  it('rejects wrong serviceId, non-published status, and non-integral version', () => {
    const base = createE3AcceptancePublishedDefinition()
    expect(
      admitPublishedLatestResponse({ ...base, serviceId: 'other' }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, status: 'approved' }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, version: 1.5 }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
    expect(
      admitPublishedLatestResponse({ ...base, version: 0 }, E3_TECHNICAL_SERVICE_ID).ok,
    ).toBe(false)
  })

  it('does not invoke root or nested accessors, and rejects symbols/non-enumerables/prototypes', () => {
    let getterHits = 0
    const hostile = {
      get serviceId() {
        getterHits += 1
        return E3_TECHNICAL_SERVICE_ID
      },
    }
    expect(admitPublishedLatestResponse(hostile, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
    expect(getterHits).toBe(0)

    const nestedHostile = createE3AcceptancePublishedDefinition()
    Object.defineProperty(nestedHostile.meta, 'bilingual', {
      get() {
        getterHits += 1
        return { labels: {}, help: {}, errors: {} }
      },
      enumerable: true,
    })
    expect(admitPublishedLatestResponse(nestedHostile, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
    expect(getterHits).toBe(0)

    const withSymbol = createE3AcceptancePublishedDefinition()
    Object.defineProperty(withSymbol, Symbol('x'), { value: 1 })
    expect(admitPublishedLatestResponse(withSymbol, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)

    const nonEnum = createE3AcceptancePublishedDefinition()
    Object.defineProperty(nonEnum, 'hidden', { value: 1, enumerable: false })
    expect(admitPublishedLatestResponse(nonEnum, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)

    const customProto = Object.assign(Object.create({ polluted: true }), createE3AcceptancePublishedDefinition())
    expect(admitPublishedLatestResponse(customProto, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)

    const sparse = createE3AcceptancePublishedDefinition()
    sparse.meta = { ...sparse.meta, progressiveSteps: [] }
    sparse.meta.progressiveSteps.length = 2
    expect(cloneJsonSafe(sparse).ok).toBe(false)

    const cyclic = createE3AcceptancePublishedDefinition()
    cyclic.self = cyclic
    expect(admitPublishedLatestResponse(cyclic, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
  })

  it('rejects hostile Proxy traps generically without invoking traps as success', () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('trap')
        },
        ownKeys() {
          throw new Error('trap')
        },
        getOwnPropertyDescriptor() {
          throw new Error('trap')
        },
      },
    )
    expect(admitPublishedLatestResponse(proxy, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
  })

  it('clones before inspection so post-resolution mutation cannot alter the admitted definition', () => {
    const definition = createE3AcceptancePublishedDefinition()
    const admitted = admitPublishedLatestResponse(definition, E3_TECHNICAL_SERVICE_ID)
    expect(admitted.ok).toBe(true)
    definition.serviceId = 'mutated-after'
    definition.version = 99
    definition.status = 'draft'
    expect(admitted.snapshot.serviceId).toBe(E3_TECHNICAL_SERVICE_ID)
    expect(admitted.snapshot.version).toBe(1)
    expect(admitted.snapshot.definition.status).toBe('published')
  })
})

describe('admitPublishedAdapterResult — exact envelope', () => {
  it('admits the exact canonical envelope', () => {
    const definition = createE3AcceptancePublishedDefinition()
    const admitted = admitPublishedAdapterResult(
      publishedAdapterResult(definition),
      E3_TECHNICAL_SERVICE_ID,
    )
    expect(admitted.ok).toBe(true)
    expect(admitted.snapshot.definition.serviceId).toBe(E3_TECHNICAL_SERVICE_ID)
    expect(admitted.snapshot).not.toHaveProperty('plan')
  })

  it('rejects bare FormDefinition, plan, and unknown extras', () => {
    const definition = createE3AcceptancePublishedDefinition()
    expect(admitPublishedAdapterResult(definition, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
    expect(
      admitPublishedAdapterResult(
        { ...publishedAdapterResult(definition), plan: { kind: 'single' } },
        E3_TECHNICAL_SERVICE_ID,
      ).ok,
    ).toBe(false)
    expect(
      admitPublishedAdapterResult(
        { ...publishedAdapterResult(definition), etag: '"x"' },
        E3_TECHNICAL_SERVICE_ID,
      ).ok,
    ).toBe(false)
  })

  it('rejects serviceId/version coordinate mismatches', () => {
    const definition = createE3AcceptancePublishedDefinition()
    expect(
      admitPublishedAdapterResult(
        { serviceId: 'other', version: 1, definition },
        E3_TECHNICAL_SERVICE_ID,
      ).ok,
    ).toBe(false)
    expect(
      admitPublishedAdapterResult(
        { serviceId: E3_TECHNICAL_SERVICE_ID, version: 1, definition },
        'other-requested',
      ).ok,
    ).toBe(false)
    expect(
      admitPublishedAdapterResult(
        {
          serviceId: E3_TECHNICAL_SERVICE_ID,
          version: 2,
          definition,
        },
        E3_TECHNICAL_SERVICE_ID,
      ).ok,
    ).toBe(false)
    const otherDef = createE3AcceptancePublishedDefinition({ serviceId: 'svc-b' })
    expect(
      admitPublishedAdapterResult(
        { serviceId: E3_TECHNICAL_SERVICE_ID, version: 1, definition: otherDef },
        E3_TECHNICAL_SERVICE_ID,
      ).ok,
    ).toBe(false)
  })

  it('rejects hostile envelopes without invoking getters', () => {
    let hits = 0
    const hostile = {
      get serviceId() {
        hits += 1
        return E3_TECHNICAL_SERVICE_ID
      },
      version: 1,
      definition: createE3AcceptancePublishedDefinition(),
    }
    expect(admitPublishedAdapterResult(hostile, E3_TECHNICAL_SERVICE_ID).ok).toBe(false)
    expect(hits).toBe(0)
  })
})

describe('admitSubmissionResult', () => {
  it('admits exact { ok: true } only', () => {
    expect(admitSubmissionResult({ ok: true })).toEqual({ ok: true, value: { ok: true } })
  })

  it('rejects undefined, null, false, extras, accessors, toJSON, and custom prototypes', () => {
    expect(admitSubmissionResult(undefined).ok).toBe(false)
    expect(admitSubmissionResult(null).ok).toBe(false)
    expect(admitSubmissionResult({ ok: false }).ok).toBe(false)
    expect(admitSubmissionResult({ ok: true, extra: 1 }).ok).toBe(false)
    expect(admitSubmissionResult({ ok: true, trackingId: 'x' }).ok).toBe(false)

    let hits = 0
    expect(
      admitSubmissionResult({
        get ok() {
          hits += 1
          return true
        },
      }).ok,
    ).toBe(false)
    expect(hits).toBe(0)

    const withToJson = {
      ok: true,
      toJSON() {
        hits += 1
        return { ok: true }
      },
    }
    // toJSON as own method makes an extra key → reject; never invoke
    expect(admitSubmissionResult(withToJson).ok).toBe(false)
    expect(hits).toBe(0)

    const proto = Object.assign(Object.create({ x: 1 }), { ok: true })
    expect(admitSubmissionResult(proto).ok).toBe(false)
  })
})

describe('submitWithDetachedFormData', () => {
  it('returns only admitted { ok: true } and maps malformed results to generic failure', async () => {
    await expect(
      submitWithDetachedFormData(
        { submitApplication: async () => ({ ok: true }) },
        {
          serviceId: E3_TECHNICAL_SERVICE_ID,
          formVersion: 1,
          formData: { applicant_name: 'A' },
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toEqual({ ok: true })

    await expect(
      submitWithDetachedFormData(
        { submitApplication: async () => ({ ok: true, receipt: 'secret' }) },
        {
          serviceId: E3_TECHNICAL_SERVICE_ID,
          formVersion: 1,
          formData: {},
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.FAILED })
  })
})

describe('HTTP published adapter', () => {
  it('calls the encoded latest-published URL with cache no-store and ignores ETag', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(String(url)).toContain(
        `/api/v1/form-definitions/published/latest?${encodeServiceIdQuery(E3_TECHNICAL_SERVICE_ID)}`,
      )
      expect(init.cache).toBe('no-store')
      expect(init.headers.Accept).toBe('application/json')
      expect(init.headers.Authorization).toBeUndefined()
      return jsonResponse(createE3AcceptancePublishedDefinition(), {
        etag: '"should-be-ignored"',
      })
    })
    const adapter = createAdmittingPublishedFormDefinitionAdapter(
      createHttpPublishedFormDefinitionAdapter({
        baseUrl: '/form-definition-service',
        fetchImpl,
      }),
    )
    const snapshot = await adapter.loadLatestPublished({
      serviceId: E3_TECHNICAL_SERVICE_ID,
      signal: new AbortController().signal,
    })
    expect(snapshot.serviceId).toBe(E3_TECHNICAL_SERVICE_ID)
    expect(snapshot).not.toHaveProperty('plan')
    expect(JSON.stringify(snapshot)).not.toMatch(/should-be-ignored|ETag|etag/i)
  })

  it('rejects non-JSON content types and oversized bodies', async () => {
    const adapterHtml = createHttpPublishedFormDefinitionAdapter({
      fetchImpl: async () =>
        new Response('{}', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    })
    await expect(
      adapterHtml.loadLatestPublished({
        serviceId: E3_TECHNICAL_SERVICE_ID,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.UNSAFE })

    const adapterLarge = createHttpPublishedFormDefinitionAdapter({
      maxResponseBytes: 32,
      fetchImpl: async () => jsonResponse(createE3AcceptancePublishedDefinition()),
    })
    await expect(
      adapterLarge.loadLatestPublished({
        serviceId: E3_TECHNICAL_SERVICE_ID,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.UNSAFE })
  })

  it('maps 404 and generic transport failures', async () => {
    const notFound = createHttpPublishedFormDefinitionAdapter({
      fetchImpl: async () => jsonResponse({ title: 'missing' }, { status: 404 }),
    })
    await expect(
      notFound.loadLatestPublished({
        serviceId: E3_TECHNICAL_SERVICE_ID,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(PublishedFormError)

    const boom = createHttpPublishedFormDefinitionAdapter({
      fetchImpl: async () => {
        throw new TypeError('network')
      },
    })
    await expect(
      boom.loadLatestPublished({
        serviceId: E3_TECHNICAL_SERVICE_ID,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.UNAVAILABLE })
  })

  it('makes zero HTTP calls for invalid serviceIds', async () => {
    const fetchImpl = vi.fn()
    const adapter = createHttpPublishedFormDefinitionAdapter({ fetchImpl })
    await expect(
      adapter.loadLatestPublished({
        serviceId: ' padded',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: PUBLISHED_FORM_ERROR_CODES.INVALID_SERVICE_ID })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('content-type helper', () => {
  it('accepts JSON-compatible media types only', () => {
    expect(isJsonCompatibleContentType('application/json')).toBe(true)
    expect(isJsonCompatibleContentType('application/problem+json; charset=utf-8')).toBe(true)
    expect(isJsonCompatibleContentType('text/plain')).toBe(false)
    expect(isJsonCompatibleContentType(null)).toBe(false)
  })
})
