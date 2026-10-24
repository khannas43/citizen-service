import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@dg20/form-contract'

import {
  acceptESignResult,
  assessSignatureESignIncomingValue,
  emitSignatureESignValue,
  isSafeSignedArtefactRef,
  resolveESignContextRevision,
} from '../src/runtime/signature-esign.js'
import type { ESignAdapter } from '../src/runtime/service-ports.js'
import { renderSignatureESignHarness } from './widget-harness.js'

const CTX_A = 'ctx-esign-rev-a'
const CTX_B = 'ctx-esign-rev-b'
const FIELD = 'applicant_signature'
const REF_A = `esign-artefact:${FIELD}:${CTX_A}:001`
const REF_B = `esign-artefact:${FIELD}:${CTX_B}:001`

const bilingual: BilingualContent = {
  labels: {
    applicant_signature: { en: 'Applicant signature', gu: 'અરજદારની સહી' },
    applicant_esign: { en: 'Applicant eSign', gu: 'અરજદાર eSign' },
  },
  help: {
    applicant_signature: {
      en: 'Sign the application with eSign.',
      gu: 'eSign વડે અરજી પર સહી કરો.',
    },
    applicant_esign: {
      en: 'Sign the application with eSign.',
      gu: 'eSign વડે અરજી પર સહી કરો.',
    },
  },
  errors: {
    applicant_signature: {
      required: { en: 'Signature is required.', gu: 'સહી જરૂરી છે.' },
    },
  },
}

function eSignAdapter(impl?: ESignAdapter['requestSignature']): ESignAdapter & {
  readonly calls: Parameters<ESignAdapter['requestSignature']>[0][]
} {
  const calls: Parameters<ESignAdapter['requestSignature']>[0][] = []
  return {
    calls,
    async requestSignature(request) {
      calls.push(request)
      if (impl) {
        return impl(request)
      }
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:ok`,
      }
    },
  }
}

describe('FB-A11 signature-esign helpers', () => {
  it('resolves context revision and validates safe artefact refs', () => {
    expect(resolveESignContextRevision('  ctx-a  ')).toEqual({
      ok: true,
      contextRevision: 'ctx-a',
    })
    expect(resolveESignContextRevision('')).toEqual({ ok: false })
    expect(resolveESignContextRevision(undefined)).toEqual({ ok: false })

    expect(isSafeSignedArtefactRef(REF_A, { fieldId: FIELD, contextRevision: CTX_A })).toBe(true)
    expect(
      isSafeSignedArtefactRef(`urn:dg20:${FIELD}:${CTX_A}:sig`, {
        fieldId: FIELD,
        contextRevision: CTX_A,
      }),
    ).toBe(true)
    expect(isSafeSignedArtefactRef(FIELD, { fieldId: FIELD, contextRevision: CTX_A })).toBe(false)
    expect(isSafeSignedArtefactRef(CTX_A, { fieldId: FIELD, contextRevision: CTX_A })).toBe(false)
    expect(
      isSafeSignedArtefactRef('data:application/pdf;base64,AAA', {
        fieldId: FIELD,
        contextRevision: CTX_A,
      }),
    ).toBe(false)
    expect(
      isSafeSignedArtefactRef('blob:https://example/x', {
        fieldId: FIELD,
        contextRevision: CTX_A,
      }),
    ).toBe(false)
    expect(
      isSafeSignedArtefactRef('http://evil.example/sig', {
        fieldId: FIELD,
        contextRevision: CTX_A,
      }),
    ).toBe(false)
    expect(
      isSafeSignedArtefactRef('https://evil.example/sig', {
        fieldId: FIELD,
        contextRevision: CTX_A,
      }),
    ).toBe(false)
  })

  it('accepts SIGNED, CANCELLED, and rejects malformed results', () => {
    expect(
      acceptESignResult(
        { status: 'SIGNED', contextRevision: CTX_A, signedArtefactRef: REF_A },
        { fieldId: FIELD, contextRevision: CTX_A },
      ),
    ).toEqual({ contextRevision: CTX_A, signedArtefactRef: REF_A })
    expect(
      acceptESignResult(
        { status: 'CANCELLED', contextRevision: CTX_A },
        { fieldId: FIELD, contextRevision: CTX_A },
      ),
    ).toEqual({ cancelled: true })
    expect(
      acceptESignResult(
        { status: 'CANCELLED', contextRevision: CTX_A, signedArtefactRef: REF_A },
        { fieldId: FIELD, contextRevision: CTX_A },
      ),
    ).toBeNull()
    expect(
      acceptESignResult(
        { status: 'SIGNED', contextRevision: CTX_B, signedArtefactRef: REF_A },
        { fieldId: FIELD, contextRevision: CTX_A },
      ),
    ).toBeNull()
    expect(
      acceptESignResult(
        { status: 'SIGNED', contextRevision: CTX_A, signedArtefactRef: 'https://x' },
        { fieldId: FIELD, contextRevision: CTX_A },
      ),
    ).toBeNull()
    expect(
      acceptESignResult(
        { status: 'FAILED', contextRevision: CTX_A },
        {
          fieldId: FIELD,
          contextRevision: CTX_A,
        },
      ),
    ).toBeNull()
  })

  it('classifies incoming formData as unanswered/current/stale/malformed', () => {
    const current = { contextRevision: CTX_A, signedArtefactRef: REF_A }
    expect(assessSignatureESignIncomingValue(undefined, CTX_A, FIELD).kind).toBe('unanswered')
    expect(assessSignatureESignIncomingValue(current, CTX_A, FIELD).kind).toBe('current')
    expect(assessSignatureESignIncomingValue(current, CTX_B, FIELD).kind).toBe('stale')
    expect(assessSignatureESignIncomingValue(true, CTX_A, FIELD).kind).toBe('malformed')
    expect(assessSignatureESignIncomingValue({ ...current, extra: 1 }, CTX_A, FIELD).kind).toBe(
      'malformed',
    )
    expect(emitSignatureESignValue(current, FIELD)).toEqual(current)
  })

  it('canonicalizes emitSignatureESignValue revision and validates against trimmed value', () => {
    expect(
      emitSignatureESignValue(
        {
          contextRevision: `  ${CTX_A}  `,
          signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:ws`,
        },
        FIELD,
      ),
    ).toEqual({
      contextRevision: CTX_A,
      signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:ws`,
    })
    expect(
      emitSignatureESignValue(
        {
          contextRevision: `  ${CTX_A}  `,
          signedArtefactRef: CTX_A,
        },
        FIELD,
      ),
    ).toBeUndefined()
    expect(
      emitSignatureESignValue(
        {
          contextRevision: `  ${CTX_A}  `,
          signedArtefactRef: `  urn:dg20:${FIELD}:${CTX_A}:composite  `,
        },
        FIELD,
      ),
    ).toEqual({
      contextRevision: CTX_A,
      signedArtefactRef: `urn:dg20:${FIELD}:${CTX_A}:composite`,
    })
  })
})

describe('SignatureESignWidget', () => {
  it('unanswered does not call adapter until explicit Sign', async () => {
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(/Not signed yet/i)
  })

  it('sends exact fieldId/contextRevision/locale on Sign', async () => {
    const user = userEvent.setup()
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        locale: 'gu',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    await user.click(screen.getByRole('button', { name: /eSign/i }))
    await waitFor(() => {
      expect(adapter.calls).toHaveLength(1)
    })
    expect(adapter.calls[0]).toEqual(
      expect.objectContaining({
        fieldId: FIELD,
        contextRevision: CTX_A,
        locale: 'gu',
      }),
    )
    expect(adapter.calls[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('valid SIGNED emits reference-only value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        contextRevision: CTX_A,
        signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:ok`,
      })
    })
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
  })

  it('CANCELLED emits nothing and shows Retry', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = eSignAdapter(async (request) => ({
      status: 'CANCELLED',
      contextRevision: request.contextRevision,
    }))
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i)
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
  })

  it('rejects mismatched revision and unsafe refs without emission', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = eSignAdapter(async () => ({
      status: 'SIGNED',
      contextRevision: CTX_B,
      signedArtefactRef: REF_B,
    }))
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be completed/i)
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('current incoming signed value avoids adapter call', () => {
    const onChange = vi.fn()
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
    expect(screen.getByRole('button', { name: /Replace signature/i })).toBeInTheDocument()
  })

  it('current valid signature with missing adapter displays signed without actions', () => {
    const onChange = vi.fn()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adapter removal after signed keeps signed; adding adapter exposes Replace only', async () => {
    const onChange = vi.fn()
    const adapter = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('button', { name: /Replace signature/i })).toBeInTheDocument()
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(adapter.calls).toHaveLength(0)

    const nextAdapter = eSignAdapter()
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: nextAdapter },
        onChange,
      }),
    )
    expect(screen.getByRole('button', { name: /Replace signature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign with eSign/i })).not.toBeInTheDocument()
    expect(nextAdapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stale incoming is not presented as current and is not cleared', () => {
    const onChange = vi.fn()
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_B,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/older content/i)
    expect(screen.getByRole('button', { name: /Sign with eSign/i })).toBeInTheDocument()
  })

  it('malformed incoming alerts without rewrite', () => {
    const onChange = vi.fn()
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: true,
        services: { eSign: eSignAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('explicit replacement replaces the current signature', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = eSignAdapter(async (request) => ({
      status: 'SIGNED',
      contextRevision: request.contextRevision,
      signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:replaced`,
    }))
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Replace signature/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        contextRevision: CTX_A,
        signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:replaced`,
      })
    })
  })

  it('replacement CANCELLED retains old value and shows only Retry', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldCancel = true
    const adapter = eSignAdapter(async (request) => {
      if (shouldCancel) {
        return { status: 'CANCELLED', contextRevision: request.contextRevision }
      }
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:after-cancel`,
      }
    })
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Replace signature/i }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i)
    })
    expect(screen.getByRole('status')).toHaveTextContent(/previous signature remains/i)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Replace signature/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign with eSign/i })).not.toBeInTheDocument()

    shouldCancel = false
    await user.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    expect(onChange).toHaveBeenCalledWith({
      contextRevision: CTX_A,
      signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:after-cancel`,
    })
    expect(adapter.calls).toHaveLength(2)
  })

  it('replacement failure retains old value and shows only Retry', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldFail = true
    const adapter = eSignAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('replace fail')
      }
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:after-fail`,
      }
    })
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Replace signature/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/previous signature remains/i)
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Replace signature/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign with eSign/i })).not.toBeInTheDocument()

    shouldFail = false
    await user.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    expect(onChange).toHaveBeenCalledWith({
      contextRevision: CTX_A,
      signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:after-fail`,
    })
    expect(adapter.calls).toHaveLength(2)
  })

  it('revision A→B ignores stale A success/failure/cancel', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const adapterA = eSignAdapter(async (request) => {
      await gateA
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: 'stale-a-should-ignore',
      }
    })
    const adapterB = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapterA },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Signing in progress/i)
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_B,
        services: { eSign: adapterB },
        onChange,
      }),
    )
    releaseA()
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'signedArtefactRef' in call[0] &&
          (call[0] as { signedArtefactRef?: string }).signedArtefactRef === 'stale-a-should-ignore',
      ),
    ).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent(/Not signed yet/i)
  })

  it('adapter identity change ignores old completion', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseOld!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    const oldAdapter = eSignAdapter(async (request) => {
      await gate
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: 'old-adapter-should-ignore',
      }
    })
    const newAdapter = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: oldAdapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: newAdapter },
        onChange,
      }),
    )
    releaseOld()
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'signedArtefactRef' in call[0] &&
          (call[0] as { signedArtefactRef?: string }).signedArtefactRef ===
            'old-adapter-should-ignore',
      ),
    ).toBe(false)
  })

  it('external current value arriving mid-request wins', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = eSignAdapter(async (request) => {
      await gate
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: 'late-should-ignore',
      }
    })
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    const external = { contextRevision: CTX_A, signedArtefactRef: REF_A }
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        formData: external,
        services: { eSign: adapter },
        onChange,
      }),
    )
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'signedArtefactRef' in call[0] &&
          (call[0] as { signedArtefactRef?: string }).signedArtefactRef === 'late-should-ignore',
      ),
    ).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
  })

  it('locale change while pending cancels old result', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = eSignAdapter(async (request) => {
      await gate
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: `locale-stale:${request.locale}`,
      }
    })
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        locale: 'en',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    rerender(
      renderSignatureESignHarness({
        bilingual,
        locale: 'gu',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('locale change after failure/cancel clears Retry intent', async () => {
    const user = userEvent.setup()
    const adapter = eSignAdapter(async () => {
      throw new Error('fail')
    })
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        locale: 'en',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    })
    rerender(
      renderSignatureESignHarness({
        bilingual,
        locale: 'gu',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eSign/i })).toBeInTheDocument()
  })

  it('locale change with no pending/Retry makes no request', () => {
    const adapter = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        locale: 'en',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    rerender(
      renderSignatureESignHarness({
        bilingual,
        locale: 'gu',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    expect(adapter.calls).toHaveLength(0)
  })

  it('Retry uses still-current revision/locale exactly once', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldFail = true
    const adapter = eSignAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('fail')
      }
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: `esign-artefact:${request.fieldId}:${request.contextRevision}:retry`,
      }
    })
    render(
      renderSignatureESignHarness({
        bilingual,
        locale: 'gu',
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /eSign/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /પ્રયાસ કરો|Retry/i })).toBeInTheDocument()
    })
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /પ્રયાસ કરો|Retry/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        contextRevision: CTX_A,
        signedArtefactRef: `esign-artefact:${FIELD}:${CTX_A}:retry`,
      })
    })
    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[1]).toEqual(
      expect.objectContaining({
        fieldId: FIELD,
        contextRevision: CTX_A,
        locale: 'gu',
      }),
    )
  })

  it('duplicate interaction while signing produces only one adapter request', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = eSignAdapter(async (request) => {
      await gate
      return {
        status: 'SIGNED',
        contextRevision: request.contextRevision,
        signedArtefactRef: REF_A,
      }
    })
    render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    const button = screen.getByRole('button', { name: /Sign with eSign/i })
    await user.click(button)
    await user.click(button)
    await user.click(button)
    expect(adapter.calls).toHaveLength(1)
    release()
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
    })
  })

  it('missing adapter/context recover when ports become available', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/temporarily unavailable/i)
    rerender(
      renderSignatureESignHarness({
        bilingual,
        services: { eSign: adapter },
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for document context/i)
    rerender(
      renderSignatureESignHarness({
        bilingual,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('button', { name: /Sign with eSign/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  it('disabled/readonly hide actions', () => {
    const adapter = eSignAdapter()
    const { rerender } = render(
      renderSignatureESignHarness({
        bilingual,
        disabled: true,
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(
      renderSignatureESignHarness({
        bilingual,
        readonly: true,
        eSignContextRevision: CTX_A,
        formData: { contextRevision: CTX_A, signedArtefactRef: REF_A },
        services: { eSign: adapter },
      }),
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Document signed/i)
  })

  it('preserves underscore canonical fieldId and associates raw bilingual errors', async () => {
    const user = userEvent.setup()
    const adapter = eSignAdapter()
    render(
      renderSignatureESignHarness({
        bilingual,
        name: 'applicant_esign',
        required: true,
        rawErrors: ['Signature is required.'],
        eSignContextRevision: CTX_A,
        services: { eSign: adapter },
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Signature is required/i)
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(adapter.calls[0]?.fieldId).toBe('applicant_esign')
    })
  })

  it('has no native FormData entry and emits only reference fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <form data-testid="esign-form">
        {renderSignatureESignHarness({
          bilingual,
          eSignContextRevision: CTX_A,
          services: { eSign: eSignAdapter() },
          onChange,
        })}
      </form>,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sign with eSign/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const emitted = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(Object.keys(emitted).sort()).toEqual(['contextRevision', 'signedArtefactRef'])
    expect(JSON.stringify(emitted)).not.toMatch(
      /data:|blob:|base64|AbortSignal|token|timestamp|error|pdf/i,
    )
    const fd = new FormData(screen.getByTestId('esign-form') as HTMLFormElement)
    expect([...fd.keys()]).toHaveLength(0)
  })
})
