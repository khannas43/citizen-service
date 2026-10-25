import { describe, expect, it, vi } from 'vitest'

import type { ValidationResult } from '@citizen/form-contract'

import {
  admitValidationResult,
  MAX_VALIDATION_ISSUES,
} from '../src/validation/admit-validation-result.js'
import { createHttpFormDefinitionValidationAdapter } from '../src/validation/http-form-definition-validation-adapter.js'
import { prepareValidationRequest } from '../src/validation/prepare-validation-request.js'
import { resolveFormDefinitionServiceBaseUrl } from '../src/validation/resolve-form-definition-service-base-url.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import { createAuthoringSession } from '../src/authoring/index.js'

function validResult(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    valid: true,
    issues: [],
    ...overrides,
  }
}

describe('FB-D6 — resolveFormDefinitionServiceBaseUrl', () => {
  it('defaults to same-origin path and never invents localhost', () => {
    expect(resolveFormDefinitionServiceBaseUrl({})).toBe('/form-definition-service')
    expect(resolveFormDefinitionServiceBaseUrl({ VITE_FORM_DEFINITION_SERVICE_BASE_URL: '' })).toBe(
      '/form-definition-service',
    )
    expect(
      resolveFormDefinitionServiceBaseUrl({
        VITE_FORM_DEFINITION_SERVICE_BASE_URL: ' https://gateway.example/fds/ ',
      }),
    ).toBe('https://gateway.example/fds')
  })
})

describe('FB-D6 — hasAnyUnsavedAuthoringDraft', () => {
  it('is false for a clean session and true for dirty or validation-visible drafts', async () => {
    const { createAuthoringSession, createAuthoringUiState, authoringReducer } =
      await import('../src/authoring/index.js')
    const { hasAnyUnsavedAuthoringDraft } =
      await import('../src/validation/has-any-unsaved-authoring-draft.js')
    const { ILLUSTRATIVE_DRAFT_DEFINITION } =
      await import('../src/definition/illustrative-draft-definition.js')
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
    ui = authoringReducer(ui, { type: 'select', fieldId: 'applicant_name' })
    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Changed' },
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
  })
})

describe('FB-D6 — prepareValidationRequest', () => {
  it('returns a detached clone that adapter mutation cannot affect', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const prepared = prepareValidationRequest(session.definition)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.definition).not.toBe(session.definition)
    const mutable = prepared.definition as { serviceId?: string }
    mutable.serviceId = 'mutated'
    expect(session.definition.serviceId).not.toBe('mutated')
  })
})

describe('FB-D6 — admitValidationResult', () => {
  it('admits valid and invalid consistent results', () => {
    expect(admitValidationResult(validResult())).toEqual({
      ok: true,
      result: { valid: true, issues: [] },
    })
    const invalid = {
      valid: false,
      issues: [{ code: 'x', message: 'bad', severity: 'error', path: '/a' }],
    }
    const admitted = admitValidationResult(invalid)
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    expect(admitted.result.valid).toBe(false)
    expect(admitted.result.issues).toHaveLength(1)
  })

  it('rejects valid/result inconsistency', () => {
    expect(
      admitValidationResult({
        valid: true,
        issues: [{ code: 'x', message: 'bad', severity: 'error' }],
      }).ok,
    ).toBe(false)
    expect(
      admitValidationResult({
        valid: false,
        issues: [{ code: 'x', message: 'note', severity: 'warning' }],
      }).ok,
    ).toBe(false)
  })

  it('rejects unexpected keys, malformed issues, and oversize lists', () => {
    expect(admitValidationResult({ valid: true, issues: [], extra: 1 }).ok).toBe(false)
    expect(
      admitValidationResult({
        valid: false,
        issues: [{ code: 'x', message: 'm', severity: 'error', surprise: true }],
      }).ok,
    ).toBe(false)
    expect(
      admitValidationResult({
        valid: true,
        issues: [{ code: ' padded', message: 'm', severity: 'info' }],
      }).ok,
    ).toBe(false)
    const tooMany = Array.from({ length: MAX_VALIDATION_ISSUES + 1 }, (_, i) => ({
      code: `c${i}`,
      message: 'm',
      severity: 'info' as const,
    }))
    expect(admitValidationResult({ valid: true, issues: tooMany }).ok).toBe(false)
  })

  it('rejects sparse/accessor arrays and never invokes getters', () => {
    let getterInvoked = false
    const hostileIssues: unknown[] = []
    Object.defineProperty(hostileIssues, 0, {
      get() {
        getterInvoked = true
        return { code: 'x', message: 'm', severity: 'info' }
      },
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(hostileIssues, 'length', { value: 1 })
    expect(admitValidationResult({ valid: true, issues: hostileIssues }).ok).toBe(false)
    expect(getterInvoked).toBe(false)

    const sparse: unknown[] = []
    sparse.length = 1
    expect(admitValidationResult({ valid: true, issues: sparse }).ok).toBe(false)
  })

  it('rejects symbols, non-enumerables, and custom prototypes without throwing', () => {
    const withSymbol = { valid: true, issues: [] as unknown[] }
    Object.defineProperty(withSymbol, Symbol('x'), { value: 1 })
    expect(admitValidationResult(withSymbol).ok).toBe(false)

    const nonEnum = { valid: true, issues: [] as unknown[] }
    Object.defineProperty(nonEnum, 'hidden', { value: 1, enumerable: false })
    expect(admitValidationResult(nonEnum).ok).toBe(false)

    const customProto = Object.assign(Object.create({ x: 1 }), { valid: true, issues: [] })
    expect(admitValidationResult(customProto).ok).toBe(false)
  })
})

describe('FB-D6 — HTTP validation transport', () => {
  it('posts exact URL/method/headers/body with AbortSignal and admits 200 JSON', async () => {
    const definition = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/form-definition-service/api/v1/form-definitions/validation')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      const body = JSON.parse(String(init?.body)) as { serviceId: string }
      expect(body.serviceId).toBe(definition.serviceId)
      body.serviceId = 'mutated-in-flight'
      return new Response(JSON.stringify({ valid: true, issues: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      baseUrl: '/form-definition-service',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const controller = new AbortController()
    const result = await adapter.validateDefinition({
      definition,
      signal: controller.signal,
    })
    expect(result).toEqual({ valid: true, issues: [] })
    expect(definition.serviceId).not.toBe('mutated-in-flight')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects non-200, malformed JSON, and oversized responses without storage or retry', async () => {
    const definition = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const non200 = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
    })
    await expect(
      non200.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow()

    const badJson = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response('{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    })
    await expect(
      badJson.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow()

    const oversized = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      maxResponseBytes: 8,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Length': '999' },
        })) as unknown as typeof fetch,
    })
    await expect(
      oversized.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow()

    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
