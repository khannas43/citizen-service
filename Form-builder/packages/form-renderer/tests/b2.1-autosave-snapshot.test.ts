import { describe, expect, it, vi } from 'vitest'

import {
  AUTOSAVE_SNAPSHOT_MAX_DEPTH,
  AUTOSAVE_SNAPSHOT_MAX_NODES,
  createAutosaveSnapshot,
} from '../src/progressive-autosave.js'

describe('FB-B2.1 createAutosaveSnapshot hardening', () => {
  it('rejects hostile Proxy getters without executing them', () => {
    const getter = vi.fn(() => 'secret')
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          return ['trap']
        },
        getOwnPropertyDescriptor() {
          return {
            enumerable: true,
            configurable: true,
            get: getter,
            set: undefined,
          }
        },
        get() {
          getter()
          return 'secret'
        },
      },
    )
    const result = createAutosaveSnapshot(hostile)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('accessor_property')
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects symbol keys', () => {
    const sym = Symbol('hidden')
    const source = { ok: 1, [sym]: 2 }
    const result = createAutosaveSnapshot(source)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('symbol_key')
    }
  })

  it('rejects sparse arrays and accessor array entries', () => {
    const sparse: unknown[] = []
    sparse[1] = 'x'
    expect(createAutosaveSnapshot({ sparse }).ok).toBe(false)

    const withAccessor: unknown[] = ['a']
    Object.defineProperty(withAccessor, '0', {
      get: () => 'nope',
      enumerable: true,
      configurable: true,
    })
    const result = createAutosaveSnapshot({ withAccessor })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('accessor_property')
    }
  })

  it('rejects enumerable array extras', () => {
    const arr: unknown[] = [1]
    Object.defineProperty(arr, 'extra', {
      value: 'nope',
      enumerable: true,
      configurable: true,
    })
    const result = createAutosaveSnapshot({ arr })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unexpected_property')
    }
  })

  it('rejects non-enumerable object properties instead of dropping them', () => {
    const source = { visible: 1 }
    Object.defineProperty(source, 'hidden', {
      value: 2,
      enumerable: false,
      configurable: true,
    })
    const result = createAutosaveSnapshot(source)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unexpected_property')
    }
  })

  it('preserves __proto__/constructor/prototype as safe own data properties', () => {
    const source = Object.create(null) as Record<string, unknown>
    source.__proto__ = { polluted: true }
    source.constructor = 'ctor'
    source.prototype = 'proto'
    source.ok = true

    const beforeProto = Object.prototype
    const result = createAutosaveSnapshot(source)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected ok')
    }
    expect(Object.getPrototypeOf(result.snapshot)).toBe(null)
    expect(Object.prototype.hasOwnProperty.call(result.snapshot, '__proto__')).toBe(true)
    expect((result.snapshot as { __proto__: unknown })['__proto__']).toEqual({ polluted: true })
    expect(result.snapshot.constructor).toBe('ctor')
    expect(result.snapshot.prototype).toBe('proto')
    expect(Object.prototype).toBe(beforeProto)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('never throws for throwing ownKeys / getPrototypeOf traps', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys boom')
        },
        getPrototypeOf() {
          throw new Error('proto boom')
        },
      },
    )
    expect(() => createAutosaveSnapshot(hostile)).not.toThrow()
    const result = createAutosaveSnapshot(hostile)
    expect(result.ok).toBe(false)
  })

  it('documents bounded depth and node limits', () => {
    expect(AUTOSAVE_SNAPSHOT_MAX_DEPTH).toBeGreaterThan(0)
    expect(AUTOSAVE_SNAPSHOT_MAX_NODES).toBeGreaterThan(0)

    let deep: Record<string, unknown> = { v: 1 }
    for (let i = 0; i < AUTOSAVE_SNAPSHOT_MAX_DEPTH + 5; i += 1) {
      deep = { nested: deep }
    }
    const depthResult = createAutosaveSnapshot(deep)
    expect(depthResult.ok).toBe(false)
    if (!depthResult.ok) {
      expect(depthResult.reason).toBe('depth_exceeded')
    }
  })
})
