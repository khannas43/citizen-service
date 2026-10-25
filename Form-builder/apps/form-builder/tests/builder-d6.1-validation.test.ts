import { describe, expect, it, vi } from 'vitest'

import type { ValidationResult } from '@citizen/form-contract'

import {
  admitValidationResult,
  MAX_VALIDATION_ISSUES,
} from '../src/validation/admit-validation-result.js'
import {
  createHttpFormDefinitionValidationAdapter,
  isJsonCompatibleContentType,
} from '../src/validation/http-form-definition-validation-adapter.js'
import { prepareValidationRequest } from '../src/validation/prepare-validation-request.js'
import { resolveFormDefinitionServiceBaseUrl } from '../src/validation/resolve-form-definition-service-base-url.js'
import { definitionsSemanticallyEqual } from '../src/validation/definitions-semantically-equal.js'
import { hasAnyUnsavedAuthoringDraft } from '../src/validation/has-any-unsaved-authoring-draft.js'
import { ILLUSTRATIVE_DRAFT_DEFINITION } from '../src/definition/illustrative-draft-definition.js'
import {
  authoringReducer,
  createAuthoringSession,
  createAuthoringUiState,
  configurationToDraft,
  readFieldConfiguration,
} from '../src/authoring/index.js'

function validResult(overrides?: Partial<ValidationResult>): ValidationResult {
  return {
    valid: true,
    issues: [],
    ...overrides,
  }
}

describe('FB-D6.1 — resolveFormDefinitionServiceBaseUrl', () => {
  it('defaults to same-origin path and never invents localhost', () => {
    expect(resolveFormDefinitionServiceBaseUrl({})).toBe('/form-definition-service')
    expect(
      resolveFormDefinitionServiceBaseUrl({
        VITE_FORM_DEFINITION_SERVICE_BASE_URL: ' https://gateway.example/fds/ ',
      }),
    ).toBe('https://gateway.example/fds')
  })
})

describe('FB-D6.1 — definitionsSemanticallyEqual', () => {
  it('treats deep clones as equal and mutations as unequal', () => {
    const session = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION)
    const clone = structuredClone(session.definition)
    expect(definitionsSemanticallyEqual(session.definition, clone)).toBe(true)
    clone.serviceId = 'other'
    expect(definitionsSemanticallyEqual(session.definition, clone)).toBe(false)
  })
})

describe('FB-D6.1 — hasAnyUnsavedAuthoringDraft coverage', () => {
  it('detects property, bilingual, step, validation-visible, and stale drafts', () => {
    let ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'Property dirty' },
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelEditorDraft', fieldId: 'applicant_name' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchFieldBilingual',
      fieldId: 'applicant_name',
      patch: { errorEn: 'Only error EN' },
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelFieldBilingual', fieldId: 'applicant_name' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'identity',
      patch: { labelEn: 'Step dirty' },
    })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelStepBilingual', stepId: 'identity' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchEditorDraft',
      fieldId: 'applicant_name',
      patch: { labelEn: 'seed' },
    })
    const seeded = ui.editorDrafts.applicant_name!
    const cleanDraft = configurationToDraft(
      readFieldConfiguration(ui.authoring.definition, 'applicant_name'),
    )
    ui = {
      ...ui,
      editorDrafts: {
        applicant_name: {
          ...seeded,
          draft: cleanDraft,
          propertyShowValidation: true,
          propertyShowStaleGuidance: false,
          bilingualShowValidation: false,
          bilingualShowStaleGuidance: false,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = {
      ...ui,
      editorDrafts: {
        applicant_name: {
          ...ui.editorDrafts.applicant_name!,
          propertyShowValidation: false,
          bilingualShowValidation: true,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = {
      ...ui,
      editorDrafts: {
        applicant_name: {
          ...ui.editorDrafts.applicant_name!,
          bilingualShowValidation: false,
          propertyShowStaleGuidance: true,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = {
      ...ui,
      editorDrafts: {
        applicant_name: {
          ...ui.editorDrafts.applicant_name!,
          propertyShowStaleGuidance: false,
          bilingualShowStaleGuidance: true,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelFieldBilingual', fieldId: 'applicant_name' })
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)

    ui = authoringReducer(ui, {
      type: 'patchStepEditorDraft',
      stepId: 'identity',
      patch: { labelEn: 'seed step' },
    })
    const step = ui.stepEditorDrafts.identity!
    ui = {
      ...ui,
      stepEditorDrafts: {
        identity: {
          ...step,
          draft: { ...step.baseline },
          showValidation: true,
          showStaleGuidance: false,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)

    ui = {
      ...ui,
      stepEditorDrafts: {
        identity: {
          ...ui.stepEditorDrafts.identity!,
          showValidation: false,
          showStaleGuidance: true,
        },
      },
    }
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(true)
    ui = authoringReducer(ui, { type: 'cancelStepBilingual', stepId: 'identity' })
    // Fresh session proves gate clears when no drafts remain visible.
    ui = createAuthoringUiState(createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION))
    expect(hasAnyUnsavedAuthoringDraft(ui)).toBe(false)
  })
})

describe('FB-D6.1 — prepareValidationRequest', () => {
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

describe('FB-D6.1 — admitValidationResult', () => {
  it('admits valid/invalid results and detaches issue objects', () => {
    const sourceIssue = { code: 'x', message: 'bad', severity: 'error' as const, path: '/a' }
    const admitted = admitValidationResult({ valid: false, issues: [sourceIssue] })
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    expect(admitted.result.issues[0]).not.toBe(sourceIssue)
    sourceIssue.message = 'mutated'
    expect(admitted.result.issues[0]?.message).toBe('bad')
  })

  it('rejects severity inconsistency and 201 issues', () => {
    expect(
      admitValidationResult({
        valid: true,
        issues: [{ code: 'x', message: 'bad', severity: 'error' }],
      }).ok,
    ).toBe(false)
    const tooMany = Array.from({ length: MAX_VALIDATION_ISSUES + 1 }, (_, i) => ({
      code: `c${i}`,
      message: 'm',
      severity: 'info' as const,
    }))
    expect(admitValidationResult({ valid: true, issues: tooMany }).ok).toBe(false)
  })

  it('rejects issues.extra, non-enumerable extras, and custom array prototypes', () => {
    const withExtra = [{ code: 'x', message: 'm', severity: 'info' }] as unknown[]
    ;(withExtra as { extra?: number }).extra = 1
    expect(admitValidationResult({ valid: true, issues: withExtra }).ok).toBe(false)

    const nonEnumExtra = [{ code: 'x', message: 'm', severity: 'info' }] as unknown[]
    Object.defineProperty(nonEnumExtra, 'hidden', { value: 1, enumerable: false })
    expect(admitValidationResult({ valid: true, issues: nonEnumExtra }).ok).toBe(false)

    const customArray = Object.setPrototypeOf(
      [{ code: 'x', message: 'm', severity: 'info' }],
      Object.create(Array.prototype),
    )
    expect(admitValidationResult({ valid: true, issues: customArray }).ok).toBe(false)
  })

  it('rejects sparse/accessor arrays and root/issue accessors without invoking getters', () => {
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

    let rootGetter = false
    const hostileRoot = {}
    Object.defineProperty(hostileRoot, 'valid', {
      get() {
        rootGetter = true
        return true
      },
      enumerable: true,
    })
    Object.defineProperty(hostileRoot, 'issues', { value: [], enumerable: true })
    expect(admitValidationResult(hostileRoot).ok).toBe(false)
    expect(rootGetter).toBe(false)

    let issueGetter = false
    const hostileIssue = {}
    Object.defineProperty(hostileIssue, 'code', {
      get() {
        issueGetter = true
        return 'x'
      },
      enumerable: true,
    })
    Object.defineProperty(hostileIssue, 'message', { value: 'm', enumerable: true })
    Object.defineProperty(hostileIssue, 'severity', { value: 'info', enumerable: true })
    expect(admitValidationResult({ valid: true, issues: [hostileIssue] }).ok).toBe(false)
    expect(issueGetter).toBe(false)
  })

  it('rejects symbols and unexpected keys without throwing', () => {
    const withSymbol = { valid: true, issues: [] as unknown[] }
    Object.defineProperty(withSymbol, Symbol('x'), { value: 1 })
    expect(admitValidationResult(withSymbol).ok).toBe(false)
    expect(admitValidationResult({ valid: true, issues: [], extra: 1 }).ok).toBe(false)
    expect(
      admitValidationResult({
        valid: true,
        issues: [{ code: 'x', message: 'm', severity: 'info', surprise: true }],
      }).ok,
    ).toBe(false)
    expect(admitValidationResult(validResult()).ok).toBe(true)
  })
})

describe('FB-D6.1 — HTTP byte/content-type enforcement', () => {
  const definition = createAuthoringSession(ILLUSTRATIVE_DRAFT_DEFINITION).definition

  it('accepts charset and +json content types; rejects wrong/missing types', async () => {
    expect(isJsonCompatibleContentType('application/json; charset=utf-8')).toBe(true)
    expect(isJsonCompatibleContentType('application/problem+json')).toBe(true)
    expect(isJsonCompatibleContentType('text/html')).toBe(false)
    expect(isJsonCompatibleContentType(null)).toBe(false)

    const html = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response('<html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })) as unknown as typeof fetch,
    })
    await expect(
      html.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow()

    const charsetOk = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
        })) as unknown as typeof fetch,
    })
    await expect(
      charsetOk.validateDefinition({ definition, signal: new AbortController().signal }),
    ).resolves.toEqual({ valid: true, issues: [] })
  })

  it('enforces actual UTF-8 bytes for multibyte Gujarati oversize', async () => {
    const gujarati = 'સ'
    const utf8Bytes = new TextEncoder().encode(gujarati).byteLength
    expect(gujarati.length).toBe(1)
    expect(utf8Bytes).toBeGreaterThan(1)
    const payload = JSON.stringify({
      valid: true,
      issues: [{ code: 'g', message: gujarati.repeat(20), severity: 'info' }],
    })
    const byteLength = new TextEncoder().encode(payload).byteLength
    expect(payload.length).toBeLessThan(byteLength)

    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      maxResponseBytes: payload.length,
      fetchImpl: (async () =>
        new Response(payload, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    })
    await expect(
      adapter.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow(/validation_response_too_large/)
  })

  it('rejects smaller Content-Length with oversized body and cancels streamed reads', async () => {
    const oversized = 'x'.repeat(100)
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      maxResponseBytes: 10,
      fetchImpl: (async () =>
        new Response(oversized, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '5',
          },
        })) as unknown as typeof fetch,
    })
    await expect(
      adapter.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow(/validation_response_too_large/)

    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"valid":true,"issues":['))
        controller.enqueue(
          new TextEncoder().encode(`{"code":"a","message":"${'y'.repeat(50)}","severity":"info"}`),
        )
        controller.enqueue(new TextEncoder().encode(']}'))
        controller.close()
      },
      cancel() {
        cancelled = true
      },
    })
    const streamed = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      maxResponseBytes: 40,
      fetchImpl: (async () =>
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    })
    await expect(
      streamed.validateDefinition({ definition, signal: new AbortController().signal }),
    ).rejects.toThrow(/validation_response_too_large/)
    expect(cancelled).toBe(true)
  })

  it('propagates abort during body read and rejects invalid maxResponseBytes', async () => {
    expect(() =>
      createHttpFormDefinitionValidationAdapter({
        accessTokenProvider: () => 'e542a-synthetic-test-token',
        maxResponseBytes: 0,
      }),
    ).toThrow(/positive safe integer/)
    expect(() =>
      createHttpFormDefinitionValidationAdapter({
        accessTokenProvider: () => 'e542a-synthetic-test-token',
        maxResponseBytes: 1.5,
      }),
    ).toThrow(/positive safe integer/)

    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('{'))
        controller.abort()
        await new Promise((r) => setTimeout(r, 10))
        ctrl.enqueue(new TextEncoder().encode('"valid":true,"issues":[]}'))
        ctrl.close()
      },
    })
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      fetchImpl: (async () =>
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch,
    })
    await expect(
      adapter.validateDefinition({ definition, signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => isAbortLike(error))
  })

  it('posts exact URL/method/headers and does not retry or use storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const adapter = createHttpFormDefinitionValidationAdapter({
      accessTokenProvider: () => 'e542a-synthetic-test-token',
      baseUrl: '/form-definition-service',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await adapter.validateDefinition({ definition, signal: new AbortController().signal })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/form-definition-service/api/v1/form-definitions/validation',
    )
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

function isAbortLike(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
