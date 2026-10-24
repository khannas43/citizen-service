import { describe, expect, it } from 'vitest'

import { createAutosaveSnapshot } from '../src/progressive-autosave.js'

describe('FB-B2 createAutosaveSnapshot', () => {
  it('clones nested JSON data into a detached snapshot', () => {
    const source = {
      name: 'Asha',
      nested: { count: 2, tags: ['a', 'b'] },
      flag: true,
      empty: null,
    }
    const result = createAutosaveSnapshot(source)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected snapshot')
    }
    expect(result.snapshot).toEqual(source)
    expect(result.snapshot).not.toBe(source)
    expect(result.snapshot.nested).not.toBe(source.nested)
    expect((result.snapshot.nested as { tags: string[] }).tags).not.toBe(source.nested.tags)
  })

  it('adapter mutation cannot mutate source data', () => {
    const source = { profile: { city: 'Ahmedabad' }, scores: [1, 2] }
    const result = createAutosaveSnapshot(source)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected snapshot')
    }
    ;(result.snapshot.profile as { city: string }).city = 'Surat'
    ;(result.snapshot.scores as number[]).push(3)
    expect(source.profile.city).toBe('Ahmedabad')
    expect(source.scores).toEqual([1, 2])
  })

  it('rejects every prohibited JS value', () => {
    expect(createAutosaveSnapshot({ d: new Date() }).ok).toBe(false)
    expect(createAutosaveSnapshot({ f: () => undefined }).ok).toBe(false)
    expect(createAutosaveSnapshot({ s: Symbol('x') }).ok).toBe(false)
    expect(createAutosaveSnapshot({ b: 1n }).ok).toBe(false)
    expect(createAutosaveSnapshot({ n: Number.NaN }).ok).toBe(false)
    expect(createAutosaveSnapshot({ n: Number.POSITIVE_INFINITY }).ok).toBe(false)
    expect(createAutosaveSnapshot({ n: Number.NEGATIVE_INFINITY }).ok).toBe(false)
    expect(createAutosaveSnapshot({ blob: new Blob(['x']) }).ok).toBe(false)
    expect(createAutosaveSnapshot({ file: new File(['x'], 'a.txt') }).ok).toBe(false)
    class WidgetConfig {
      readonly id = 'x'
    }
    expect(createAutosaveSnapshot({ cfg: new WidgetConfig() }).ok).toBe(false)
    expect(createAutosaveSnapshot({ m: new Map() }).ok).toBe(false)
    expect(createAutosaveSnapshot({ set: new Set([1]) }).ok).toBe(false)
    expect(createAutosaveSnapshot(null).ok).toBe(false)
    expect(createAutosaveSnapshot(['a']).ok).toBe(false)
    expect(createAutosaveSnapshot('string').ok).toBe(false)
  })

  it('rejects undefined inside objects and arrays', () => {
    expect(createAutosaveSnapshot({ a: undefined }).ok).toBe(false)
    if (!createAutosaveSnapshot({ a: undefined }).ok) {
      expect(createAutosaveSnapshot({ a: undefined })).toMatchObject({
        reason: 'undefined_value',
      })
    }
    expect(createAutosaveSnapshot({ list: [1, undefined, 2] }).ok).toBe(false)
  })

  it('rejects cycles', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    const result = createAutosaveSnapshot(cyclic)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('cycle')
    }
  })

  it('accepts null/string/boolean/finite numbers/arrays/plain objects', () => {
    const result = createAutosaveSnapshot({
      n: null,
      s: 'ok',
      b: false,
      i: 0,
      f: 1.5,
      arr: [null, 'x', true, 3],
      obj: { nested: [] },
    })
    expect(result.ok).toBe(true)
  })
})
