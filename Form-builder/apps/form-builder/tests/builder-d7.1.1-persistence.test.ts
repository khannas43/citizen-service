import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@citizen/form-contract'

import { createAuthoringSession } from '../src/authoring/index.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  admitClonedDraftFormDefinition,
  createHttpFormDefinitionDraftPersistenceAdapter,
  DraftPersistenceError,
  formatStrongEtagForTests,
  preparePersistenceRequest,
} from '../src/persistence/index.js'
import { definitionsSemanticallyEqual } from '../src/validation/definitions-semantically-equal.js'

function definition(): FormDefinition {
  return createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
}

function jsonResponse(
  body: unknown,
  init: {
    status: number
    etag?: string
  },
): Response {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  if (init.etag) {
    headers.set('ETag', init.etag)
  }
  return new Response(JSON.stringify(body), { status: init.status, headers })
}

describe('FB-D7.1.1 — clone before inspecting outgoing definitions', () => {
  it('never invokes getters on the caller-owned definition', () => {
    const base = definition()
    let statusReads = 0
    let serviceIdReads = 0
    let schemaReads = 0
    const hostile = {}
    for (const key of Object.keys(base)) {
      Object.defineProperty(hostile, key, {
        enumerable: true,
        configurable: true,
        get() {
          if (key === 'status') statusReads += 1
          if (key === 'serviceId') serviceIdReads += 1
          if (key === 'jsonSchema') schemaReads += 1
          throw new Error(`getter invoked for ${key}`)
        },
      })
    }
    expect(() => preparePersistenceRequest(hostile as FormDefinition)).not.toThrow()
    const result = preparePersistenceRequest(hostile as FormDefinition)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unsafe_json')
    }
    expect(statusReads).toBe(0)
    expect(serviceIdReads).toBe(0)
    expect(schemaReads).toBe(0)
  })

  it('rejects hostile Proxy and toJSON without throwing outward or executing toJSON', () => {
    let toJsonCalls = 0
    const withToJson = {
      ...definition(),
      toJSON() {
        toJsonCalls += 1
        throw new Error('toJSON must not run')
      },
    }
    expect(() => preparePersistenceRequest(withToJson as FormDefinition)).not.toThrow()
    expect(preparePersistenceRequest(withToJson as FormDefinition).ok).toBe(false)
    expect(toJsonCalls).toBe(0)

    const proxy = new Proxy(definition(), {
      ownKeys() {
        throw new Error('proxy ownKeys must not escape')
      },
      getOwnPropertyDescriptor() {
        throw new Error('proxy getOwnPropertyDescriptor must not escape')
      },
    })
    expect(() => preparePersistenceRequest(proxy)).not.toThrow()
    expect(preparePersistenceRequest(proxy).ok).toBe(false)
  })

  it('admits a valid detached draft after clone-first inspection', () => {
    const def = definition()
    const prepared = preparePersistenceRequest(def)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.definition).not.toBe(def)
    expect(admitClonedDraftFormDefinition(prepared.definition).ok).toBe(true)
  })
})

describe('FB-D7.1.1 — shared outgoing/incoming envelope admission', () => {
  it('rejects padded serviceId, bad versions, lockVersion, and extra keys on cloned bodies', () => {
    const def = definition()
    expect(admitClonedDraftFormDefinition({ ...def, serviceId: ' padded' }).ok).toBe(false)
    expect(admitClonedDraftFormDefinition({ ...def, version: 0 }).ok).toBe(false)
    expect(admitClonedDraftFormDefinition({ ...def, version: 1.5 }).ok).toBe(false)
    expect(admitClonedDraftFormDefinition({ ...def, version: 2_147_483_648 }).ok).toBe(false)
    expect(admitClonedDraftFormDefinition({ ...def, lockVersion: 1 }).ok).toBe(false)
    expect(
      admitClonedDraftFormDefinition({
        ...def,
        meta: { ...def.meta, unexpected: true },
      }).ok,
    ).toBe(false)
    expect(
      admitClonedDraftFormDefinition({
        ...def,
        audit: { ...def.audit, unexpected: 'x' },
      }).ok,
    ).toBe(false)
  })

  it('rejects prefill confidenceMin outside 0..1 inclusive', () => {
    const def = definition()
    for (const confidenceMin of [-1, 2, Number.NaN]) {
      expect(
        admitClonedDraftFormDefinition({
          ...def,
          meta: {
            ...def.meta,
            prefillBindings: [
              {
                fieldId: 'applicant_name',
                cafAttribute: 'name',
                confidenceMin,
              },
            ],
          },
        }).ok,
      ).toBe(false)
    }
    expect(
      admitClonedDraftFormDefinition({
        ...def,
        meta: {
          ...def.meta,
          prefillBindings: [
            {
              fieldId: 'applicant_name',
              cafAttribute: 'name',
              confidenceMin: 0,
            },
          ],
        },
      }).ok,
    ).toBe(true)
    expect(
      admitClonedDraftFormDefinition({
        ...def,
        meta: {
          ...def.meta,
          prefillBindings: [
            {
              fieldId: 'applicant_name',
              cafAttribute: 'name',
              confidenceMin: 1,
            },
          ],
        },
      }).ok,
    ).toBe(true)
  })
})

describe('FB-D7.1.1 — HTTP zero-fetch invalid outgoing requests', () => {
  const def = definition()
  const etag = formatStrongEtagForTests(7)

  it('makes zero fetch calls for invalid create shapes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(def, { status: 201, etag }))
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = new AbortController().signal

    const cases: FormDefinition[] = [
      { ...def, serviceId: ' padded' },
      { ...def, version: 0 },
      { ...def, version: 1.25 },
      { ...def, version: 2_147_483_648 },
      { ...def, lockVersion: 9 } as FormDefinition,
      {
        ...def,
        meta: { ...def.meta, unexpected: true },
      } as FormDefinition,
      {
        ...def,
        audit: { ...def.audit, unexpected: 'x' },
      } as FormDefinition,
      {
        ...def,
        meta: {
          ...def.meta,
          prefillBindings: [{ fieldId: 'applicant_name', cafAttribute: 'name', confidenceMin: -1 }],
        },
      },
      {
        ...def,
        meta: {
          ...def.meta,
          prefillBindings: [{ fieldId: 'applicant_name', cafAttribute: 'name', confidenceMin: 2 }],
        },
      },
      {
        ...def,
        meta: {
          ...def.meta,
          prefillBindings: [
            { fieldId: 'applicant_name', cafAttribute: 'name', confidenceMin: Number.NaN },
          ],
        },
      },
    ]

    for (const definitionCase of cases) {
      await expect(adapter.createDraft({ definition: definitionCase, signal })).rejects.toSatisfy(
        (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
      )
    }
    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('makes zero fetch calls for replace body/query mismatch and bad ETag', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(def, { status: 200, etag }))
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = new AbortController().signal

    await expect(
      adapter.replaceDraft({
        serviceId: def.serviceId,
        version: def.version,
        etag,
        definition: { ...def, serviceId: 'other-service' },
        signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )

    await expect(
      adapter.replaceDraft({
        serviceId: def.serviceId,
        version: def.version,
        etag: 'not-strong',
        definition: def,
        signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof DraftPersistenceError && error.code === 'failed',
    )

    expect(fetchImpl).toHaveBeenCalledTimes(0)
  })

  it('serializes a valid detached body for create and replace with exactly one fetch each', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof init?.body).toBe('string')
      const parsed = JSON.parse(String(init?.body)) as FormDefinition
      expect(parsed.serviceId).toBe(def.serviceId)
      expect(parsed.version).toBe(def.version)
      expect(parsed.status).toBe('draft')
      return jsonResponse(def, {
        status: init?.method === 'POST' ? 201 : 200,
        etag: formatStrongEtagForTests(11),
      })
    })
    const adapter = createHttpFormDefinitionDraftPersistenceAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const signal = new AbortController().signal
    const prepared = preparePersistenceRequest(def)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return

    await adapter.createDraft({ definition: prepared.definition, signal })
    await adapter.replaceDraft({
      serviceId: def.serviceId,
      version: def.version,
      etag,
      definition: prepared.definition,
      signal,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('FB-D7.1.1 — synchronous validation-match gate (pure)', () => {
  it('computes resultMatchesCurrentDefinition without relying on effect timing', () => {
    const baseline = definition()
    const edited: FormDefinition = {
      ...baseline,
      audit: { ...baseline.audit, createdBy: 'changed' },
    }
    const resultMatchesCurrentDefinition = definitionsSemanticallyEqual(baseline, edited)
    expect(resultMatchesCurrentDefinition).toBe(false)
    // D7 canSave requires resultMatchesCurrentDefinition === true among other gates.
    expect(resultMatchesCurrentDefinition && edited.status === 'draft').toBe(false)

    const reorderedEqual = definitionsSemanticallyEqual(baseline, structuredClone(baseline))
    expect(reorderedEqual).toBe(true)
  })
})
