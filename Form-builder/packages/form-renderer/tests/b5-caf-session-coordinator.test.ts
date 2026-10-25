import { describe, expect, it, vi } from 'vitest'

import type { CafPrefillAdapter } from '@citizen/form-widgets'

import {
  admitCafPrefillAdapterResult,
  createCafSessionCoordinator,
} from '../src/caf-session-coordinator.js'

describe('FB-B5 CAF result admission', () => {
  it('accepts exact found:false and value/confidence shapes', () => {
    expect(admitCafPrefillAdapterResult({ found: false })).toEqual({
      ok: true,
      result: { found: false },
    })
    expect(admitCafPrefillAdapterResult({ value: 'Asha', confidence: 0.4 })).toEqual({
      ok: true,
      result: { value: 'Asha', confidence: 0.4 },
    })
  })

  it('never invokes outer result accessor getters', () => {
    let touched = false
    const hostile: Record<string, unknown> = { found: false }
    Object.defineProperty(hostile, 'found', {
      enumerable: true,
      get() {
        touched = true
        return false
      },
    })
    expect(admitCafPrefillAdapterResult(hostile).ok).toBe(false)
    expect(touched).toBe(false)
  })

  it('rejects custom prototype, symbol, non-enumerable, and extra keys', () => {
    expect(
      admitCafPrefillAdapterResult(Object.assign(Object.create({ x: 1 }), { found: false })).ok,
    ).toBe(false)

    const withSymbol: Record<string | symbol, unknown> = { found: false }
    Object.defineProperty(withSymbol, Symbol('x'), { enumerable: true, value: 1 })
    expect(admitCafPrefillAdapterResult(withSymbol).ok).toBe(false)

    const withHidden: Record<string, unknown> = { found: false }
    Object.defineProperty(withHidden, 'secret', { enumerable: false, value: 1 })
    expect(admitCafPrefillAdapterResult(withHidden)).toEqual({
      ok: false,
      reason: 'unexpected_property',
    })

    expect(admitCafPrefillAdapterResult({ found: false, extra: true })).toEqual({
      ok: false,
      reason: 'unexpected_property',
    })
    expect(admitCafPrefillAdapterResult({ value: 'A', confidence: 1, extra: true }).ok).toBe(false)
    expect(admitCafPrefillAdapterResult({ value: 'A', confidence: Number.NaN }).ok).toBe(false)
  })

  it('hostile Proxy inspection never throws', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('get')
        },
        ownKeys() {
          throw new Error('ownKeys')
        },
        getOwnPropertyDescriptor() {
          throw new Error('desc')
        },
        getPrototypeOf() {
          throw new Error('proto')
        },
      },
    )
    expect(() => admitCafPrefillAdapterResult(hostile)).not.toThrow()
    expect(admitCafPrefillAdapterResult(hostile).ok).toBe(false)
  })
})

describe('FB-B5 CAF session coordinator cache', () => {
  it('caches found:false and low-confidence results as detached copies', async () => {
    const mutable = { value: 'Host', confidence: 0.2 }
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => mutable),
    }
    const coordinator = createCafSessionCoordinator(host)
    const signal = new AbortController().signal

    const first = await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal,
    })
    expect(first).toEqual({ value: 'Host', confidence: 0.2 })
    mutable.value = 'MUTATED'
    mutable.confidence = 0.99

    const second = await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal,
    })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ value: 'Host', confidence: 0.2 })
    expect(second).not.toBe(first)
    if ('value' in second) {
      ;(second as { value: string }).value = 'caller-mutated'
    }
    const third = await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'fatherName',
      signal,
    })
    expect(third).toEqual({ value: 'Host', confidence: 0.2 })

    const notFoundHost: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ found: false as const })),
    }
    const nf = createCafSessionCoordinator(notFoundHost)
    await nf.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal })
    await nf.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal })
    expect(notFoundHost.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('does not cache thrown or malformed results', async () => {
    let mode: 'throw' | 'malformed' = 'throw'
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => {
        if (mode === 'throw') {
          throw new Error('network')
        }
        return { found: false, extra: true } as never
      }),
    }
    const coordinator = createCafSessionCoordinator(host)
    const signal = new AbortController().signal

    await expect(
      coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal }),
    ).rejects.toThrow(/network/)
    expect(coordinator.settledEntryCount).toBe(0)

    mode = 'malformed'
    await expect(
      coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal }),
    ).rejects.toThrow()
    expect(coordinator.settledEntryCount).toBe(0)

    mode = 'throw'
    // After failures, a later success can still populate the cache.
    host.resolvePrefill = vi.fn(async () => ({ found: false as const }))
    await coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal })
    await coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('uses distinct nested cache keys per instanceFieldId and cafAttribute', async () => {
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async (request) => ({
        value: `${request.fieldId}:${request.cafAttribute}`,
        confidence: 0.9,
      })),
    }
    const coordinator = createCafSessionCoordinator(host)
    const signal = new AbortController().signal

    await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'name',
      signal,
    })
    await coordinator.resolvePrefill({
      fieldId: 'caf_mother_name',
      cafAttribute: 'name',
      signal,
    })
    await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'other',
      signal,
    })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(3)
    expect(coordinator.settledEntryCount).toBe(3)

    await coordinator.resolvePrefill({
      fieldId: 'caf_father_name',
      cafAttribute: 'name',
      signal,
    })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(3)
  })

  it('does not durably cache indexed instanceFieldIds (reindex-safe)', async () => {
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async (request) => ({
        value: request.fieldId,
        confidence: 0.9,
      })),
    }
    const coordinator = createCafSessionCoordinator(host)
    const signal = new AbortController().signal

    await coordinator.resolvePrefill({
      fieldId: 'family_members[0].caf_name',
      cafAttribute: 'name',
      signal,
    })
    await coordinator.resolvePrefill({
      fieldId: 'family_members[1].caf_name',
      cafAttribute: 'name',
      signal,
    })
    // Same [0] key after a logical reindex must not reuse a durable entry.
    await coordinator.resolvePrefill({
      fieldId: 'family_members[0].caf_name',
      cafAttribute: 'name',
      signal,
    })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(3)
    expect(coordinator.settledEntryCount).toBe(0)
  })

  it('respects an already-aborted caller signal on cache hit', async () => {
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ found: false as const })),
    }
    const coordinator = createCafSessionCoordinator(host)
    const live = new AbortController()
    await coordinator.resolvePrefill({
      fieldId: 'a',
      cafAttribute: 'b',
      signal: live.signal,
    })
    const aborted = new AbortController()
    aborted.abort()
    await expect(
      coordinator.resolvePrefill({
        fieldId: 'a',
        cafAttribute: 'b',
        signal: aborted.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(host.resolvePrefill).toHaveBeenCalledTimes(1)
  })

  it('dispose clears cache and rejects further resolution', async () => {
    const host: CafPrefillAdapter = {
      resolvePrefill: vi.fn(async () => ({ found: false as const })),
    }
    const coordinator = createCafSessionCoordinator(host)
    const signal = new AbortController().signal
    await coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal })
    coordinator.dispose()
    expect(coordinator.settledEntryCount).toBe(0)
    await expect(
      coordinator.resolvePrefill({ fieldId: 'a', cafAttribute: 'b', signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
