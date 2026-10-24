import { describe, expect, it, vi } from 'vitest'

import type { FormDefinition } from '@dg20/form-contract'

import { admitValidationResult } from '../src/validation/admit-validation-result.js'
import { definitionsSemanticallyEqual } from '../src/validation/definitions-semantically-equal.js'
import { readResponseBodyWithinByteLimit } from '../src/validation/http-form-definition-validation-adapter.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { createAuthoringSession } from '../src/authoring/index.js'

function isAbortLike(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/** Recursively rebuild plain objects with reversed own enumerable key insertion order. */
function reorderObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reorderObjectKeysDeep(item))
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return value
    }
    const keys = Object.keys(value as object).reverse()
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      out[key] = reorderObjectKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

describe('FB-D6.1.1 — definitionsSemanticallyEqual', () => {
  it('treats recursively reordered keys as equal', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const reordered = reorderObjectKeysDeep(session.definition) as FormDefinition
    expect(JSON.stringify(session.definition) === JSON.stringify(reordered)).toBe(false)
    expect(definitionsSemanticallyEqual(session.definition, reordered)).toBe(true)
  })

  it('treats reordered array elements as unequal', () => {
    const left = { steps: [{ id: 'a' }, { id: 'b' }] } as unknown as FormDefinition
    const right = { steps: [{ id: 'b' }, { id: 'a' }] } as unknown as FormDefinition
    expect(definitionsSemanticallyEqual(left, right)).toBe(false)
  })

  it('treats nested mutations, extra keys, and missing keys as unequal', () => {
    const base = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const nested = structuredClone(base)
    nested.meta.bilingual.labels.applicant_name = {
      ...nested.meta.bilingual.labels.applicant_name,
      en: 'mutated-nested-label',
    }
    expect(definitionsSemanticallyEqual(base, nested)).toBe(false)

    const withExtra = { ...structuredClone(base), unexpectedExtra: true } as FormDefinition
    expect(definitionsSemanticallyEqual(base, withExtra)).toBe(false)

    const missing = structuredClone(base) as Record<string, unknown>
    delete missing.serviceId
    expect(definitionsSemanticallyEqual(base, missing as FormDefinition)).toBe(false)
  })

  it('does not invoke accessors or toJSON', () => {
    let getterInvoked = false
    let toJsonInvoked = false
    const left = {
      serviceId: 'a',
      toJSON() {
        toJsonInvoked = true
        return { serviceId: 'a' }
      },
    } as unknown as FormDefinition
    const right = {} as FormDefinition
    Object.defineProperty(right, 'serviceId', {
      get() {
        getterInvoked = true
        return 'a'
      },
      enumerable: true,
      configurable: true,
    })
    expect(definitionsSemanticallyEqual(left, right)).toBe(false)
    expect(getterInvoked).toBe(false)
    expect(toJsonInvoked).toBe(false)
  })

  it('returns false for cycles and unsupported values without throwing', () => {
    const cyclic: Record<string, unknown> = { serviceId: 'a' }
    cyclic.self = cyclic
    const other: Record<string, unknown> = { serviceId: 'a' }
    other.self = other
    expect(() =>
      definitionsSemanticallyEqual(cyclic as FormDefinition, other as FormDefinition),
    ).not.toThrow()
    expect(definitionsSemanticallyEqual(cyclic as FormDefinition, other as FormDefinition)).toBe(
      false,
    )

    expect(
      definitionsSemanticallyEqual(
        { serviceId: undefined } as unknown as FormDefinition,
        { serviceId: undefined } as unknown as FormDefinition,
      ),
    ).toBe(false)
    expect(
      definitionsSemanticallyEqual(
        { serviceId: 1n } as unknown as FormDefinition,
        { serviceId: 1n } as unknown as FormDefinition,
      ),
    ).toBe(false)
    expect(
      definitionsSemanticallyEqual(
        { serviceId: Number.NaN } as unknown as FormDefinition,
        { serviceId: Number.NaN } as unknown as FormDefinition,
      ),
    ).toBe(false)
  })

  it('does not mutate either input', () => {
    const left = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const right = reorderObjectKeysDeep(structuredClone(left)) as FormDefinition
    const leftBefore = JSON.stringify(left)
    const rightKeysBefore = Object.keys(right)
    expect(definitionsSemanticallyEqual(left, right)).toBe(true)
    expect(JSON.stringify(left)).toBe(leftBefore)
    expect(Object.keys(right)).toEqual(rightKeysBefore)
  })
})

describe('FB-D6.1.1 — pending stream abort', () => {
  it('rejects promptly as AbortError while reader.read() is pending', async () => {
    let releaseRead: ((result: ReadableStreamReadResult<Uint8Array>) => void) | undefined
    let rejectRead: ((error: unknown) => void) | undefined
    let readStarted!: () => void
    const readStartedGate = new Promise<void>((resolve) => {
      readStarted = resolve
    })
    let cancelCount = 0

    const reader = {
      read: vi.fn(() => {
        readStarted()
        return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          releaseRead = resolve
          rejectRead = reject
        })
      }),
      cancel: vi.fn(async () => {
        cancelCount += 1
      }),
    }

    const response = {
      body: {
        getReader: () => reader,
      },
    } as unknown as Response

    const controller = new AbortController()
    const pending = readResponseBodyWithinByteLimit(response, 512_000, controller.signal)

    await readStartedGate
    expect(reader.read).toHaveBeenCalledTimes(1)

    controller.abort()

    await expect(pending).rejects.toSatisfy((error: unknown) => isAbortLike(error))
    expect(cancelCount).toBe(1)
    expect(reader.cancel).toHaveBeenCalledTimes(1)
    // Producer never released — pending read is left unresolved.
    expect(releaseRead).toBeTypeOf('function')
    expect(rejectRead).toBeTypeOf('function')
  })

  it('does not convert AbortError into a generic transport failure on arrayBuffer fallback', async () => {
    let releaseBuffer: ((value: ArrayBuffer) => void) | undefined
    let bufferStarted!: () => void
    const bufferStartedGate = new Promise<void>((resolve) => {
      bufferStarted = resolve
    })

    const response = {
      body: null,
      arrayBuffer: () => {
        bufferStarted()
        return new Promise<ArrayBuffer>((resolve) => {
          releaseBuffer = resolve
        })
      },
    } as unknown as Response

    const controller = new AbortController()
    const pending = readResponseBodyWithinByteLimit(response, 512_000, controller.signal)
    await bufferStartedGate
    controller.abort()
    await expect(pending).rejects.toSatisfy((error: unknown) => isAbortLike(error))
    expect(releaseBuffer).toBeTypeOf('function')
  })
})

describe('FB-D6.1.1 — admitIssuesArray descriptors', () => {
  const issue = { code: 'x', message: 'm', severity: 'info' as const }

  it('rejects non-enumerable numeric indexes', () => {
    const issues: unknown[] = []
    Object.defineProperty(issues, '0', {
      value: issue,
      enumerable: false,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(issues, 'length', {
      value: 1,
      writable: true,
      enumerable: false,
      configurable: false,
    })
    expect(admitValidationResult({ valid: true, issues }).ok).toBe(false)
  })

  it('admits ordinary and frozen dense JSON arrays', () => {
    expect(admitValidationResult({ valid: true, issues: [issue] }).ok).toBe(true)
    const frozen = Object.freeze([{ ...issue }])
    expect(admitValidationResult({ valid: true, issues: frozen }).ok).toBe(true)
  })
})
