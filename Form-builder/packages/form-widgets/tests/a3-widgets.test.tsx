import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import type { IdentityTokenizationAdapter, MobileOtpAdapter } from '../src/runtime/service-ports.js'
import { parseDg20Extensions, resolveOtpChannels } from '../src/runtime/x-dg20.js'
import { renderAadhaarHarness, renderMobileOtpHarness } from './widget-harness.js'
import { SYNTHETIC_AADHAAR_12, SYNTHETIC_VID_16 } from './verhoeff-fixtures.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    aadhaar_ref: { en: 'Aadhaar', gu: 'આધાર' },
    mobile_otp: { en: 'Mobile', gu: 'મોબાઇલ' },
    citizen_mobile: { en: 'Mobile', gu: 'મોબાઇલ' },
  },
  help: {},
  errors: {},
}

function setPasswordDigits(input: HTMLElement, digits: string) {
  fireEvent.input(input, { target: { value: digits } })
}

describe('x-dg20 otpChannels', () => {
  it('defaults to sms when otpChannels is absent', () => {
    expect(resolveOtpChannels(parseDg20Extensions({}))).toEqual({
      ok: true,
      channels: ['sms'],
    })
  })

  it('accepts only the exact lowercase dense array ["sms"]', () => {
    expect(resolveOtpChannels(parseDg20Extensions({ 'x-dg20': { otpChannels: ['sms'] } }))).toEqual(
      { ok: true, channels: ['sms'] },
    )
  })

  it.each([
    ['mixed whatsapp+sms', ['whatsapp', 'sms']],
    ['unknown voice', ['voice']],
    ['uppercase SMS', ['SMS']],
    ['duplicate sms', ['sms', 'sms']],
    ['empty', []],
  ] as const)('rejects %s without silently filtering', (_label, channels) => {
    expect(
      resolveOtpChannels(parseDg20Extensions({ 'x-dg20': { otpChannels: [...channels] } })),
    ).toEqual({ ok: false })
  })

  it('rejects sparse and accessor otpChannels arrays without invoking getters', () => {
    const sparse: unknown[] = []
    Object.defineProperty(sparse, 'length', { value: 1 })
    expect(resolveOtpChannels(parseDg20Extensions({ 'x-dg20': { otpChannels: sparse } }))).toEqual({
      ok: false,
    })

    const accessor: unknown[] = []
    Object.defineProperty(accessor, 'length', { value: 1 })
    Object.defineProperty(accessor, '0', {
      get() {
        throw new Error('otpChannels getter must not run')
      },
      enumerable: true,
      configurable: true,
    })
    expect(
      resolveOtpChannels(parseDg20Extensions({ 'x-dg20': { otpChannels: accessor } })),
    ).toEqual({ ok: false })
  })
})

describe('AadhaarWidget', () => {
  it('never calls adapter for invalid length or checksum', () => {
    const tokenize = vi.fn()
    const adapter: IdentityTokenizationAdapter = { tokenizeIdentity: tokenize }
    render(renderAadhaarHarness({ bilingual, services: { identityTokenization: adapter } }))
    const input = screen.getByLabelText(/Aadhaar/i)

    setPasswordDigits(input, '12345678901')
    expect(screen.getByRole('button', { name: /Secure and continue/i })).toBeDisabled()

    const mutated = `${SYNTHETIC_AADHAAR_12.slice(0, 5)}${SYNTHETIC_AADHAAR_12[5] === '0' ? '1' : '0'}${SYNTHETIC_AADHAAR_12.slice(6)}`
    setPasswordDigits(input, mutated)
    expect(screen.getByRole('button', { name: /Secure and continue/i })).toBeDisabled()
    expect(screen.getByText(/valid 12-digit Aadhaar or 16-digit VID/i)).toBeInTheDocument()
    expect(tokenize).not.toHaveBeenCalled()
  })

  it('tokenizes synthetic 12/16 digit inputs and never emits raw identifier', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const tokenize = vi.fn(
      async ({
        identifierKind,
        rawIdentifier,
      }: {
        identifierKind: string
        rawIdentifier: string
      }) => ({
        referenceToken: `tok-${identifierKind}`,
        lastFour: rawIdentifier.slice(-4),
      }),
    )
    const adapter: IdentityTokenizationAdapter = { tokenizeIdentity: tokenize }

    const { unmount } = render(
      renderAadhaarHarness({
        bilingual,
        services: { identityTokenization: adapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Aadhaar/i)
    setPasswordDigits(input, SYNTHETIC_AADHAAR_12)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const emitted = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(emitted).toEqual({
      referenceToken: 'tok-AADHAAR',
      identifierKind: 'AADHAAR',
      lastFour: SYNTHETIC_AADHAAR_12.slice(-4),
    })
    expect(JSON.stringify(emitted)).not.toContain(SYNTHETIC_AADHAAR_12)
    expect((input as HTMLInputElement).value).toBe('')
    expect(tokenize.mock.calls[0]?.[0].identifierKind).toBe('AADHAAR')
    unmount()

    onChange.mockClear()
    tokenize.mockClear()
    render(
      renderAadhaarHarness({
        bilingual,
        services: { identityTokenization: adapter },
        onChange,
      }),
    )
    setPasswordDigits(screen.getByLabelText(/Aadhaar/i), SYNTHETIC_VID_16)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ identifierKind: 'VID' })
    })
    expect(tokenize.mock.calls[0]?.[0].identifierKind).toBe('VID')
  })

  it('rejects malformed adapter results and raw-echo tokens', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier }) {
        return { referenceToken: rawIdentifier, lastFour: rawIdentifier.slice(-4) }
      },
    }
    render(
      renderAadhaarHarness({
        bilingual,
        services: { identityTokenization: adapter },
        onChange,
      }),
    )
    setPasswordDigits(screen.getByLabelText(/Aadhaar/i), SYNTHETIC_AADHAAR_12)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/Please re-enter/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText(/Aadhaar/i) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
  })

  it('ignores stale tokenization after clear mid-flight', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const signals: AbortSignal[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier, signal }) {
        signals.push(signal)
        await gate
        return { referenceToken: 'late-tok', lastFour: rawIdentifier.slice(-4) }
      },
    }
    render(
      renderAadhaarHarness({
        bilingual,
        services: { identityTokenization: adapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Aadhaar/i)
    setPasswordDigits(input, SYNTHETIC_AADHAAR_12)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    setPasswordDigits(input, '')
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(signals[0]?.aborted).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/•••• ••••/)).not.toBeInTheDocument()
  })

  it('renders mask for existing reference and does not echo raw string formData', () => {
    const { unmount } = render(
      renderAadhaarHarness({
        bilingual,
        formData: {
          referenceToken: 'ref-abc',
          identifierKind: 'AADHAAR',
          lastFour: '4321',
        },
      }),
    )
    expect(screen.getByText(/•••• •••• 4321/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/4321/)).not.toBeInTheDocument()
    unmount()

    render(renderAadhaarHarness({ bilingual, formData: SYNTHETIC_AADHAAR_12 }))
    expect(screen.queryByDisplayValue(SYNTHETIC_AADHAAR_12)).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(SYNTHETIC_AADHAAR_12))).not.toBeInTheDocument()
  })

  it('supports missing adapter, readonly mask, and disabled input', () => {
    const { unmount } = render(renderAadhaarHarness({ bilingual }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    unmount()

    render(
      renderAadhaarHarness({
        bilingual,
        readonly: true,
        formData: {
          referenceToken: 'ref',
          identifierKind: 'VID',
          lastFour: '9999',
        },
      }),
    )
    expect(screen.getByText(/•••• •••• •••• 9999/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Replace/i })).not.toBeInTheDocument()
    unmount()

    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity() {
        return { referenceToken: 'x', lastFour: '0000' }
      },
    }
    render(
      renderAadhaarHarness({
        bilingual,
        disabled: true,
        services: { identityTokenization: adapter },
      }),
    )
    expect(screen.getByLabelText(/Aadhaar/i)).toBeDisabled()
  })

  it('prevents copy/cut on the raw input', () => {
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier }) {
        return { referenceToken: 't', lastFour: rawIdentifier.slice(-4) }
      },
    }
    render(renderAadhaarHarness({ bilingual, services: { identityTokenization: adapter } }))
    const input = screen.getByLabelText(/Aadhaar/i)
    const copy = new Event('copy', { bubbles: true, cancelable: true })
    const cut = new Event('cut', { bubbles: true, cancelable: true })
    expect(input.dispatchEvent(copy)).toBe(false)
    expect(input.dispatchEvent(cut)).toBe(false)
  })

  it('prevents duplicate in-flight tokenize calls', async () => {
    const user = userEvent.setup()
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier }) {
        calls += 1
        await gate
        return { referenceToken: 'tok', lastFour: rawIdentifier.slice(-4) }
      },
    }
    render(renderAadhaarHarness({ bilingual, services: { identityTokenization: adapter } }))
    setPasswordDigits(screen.getByLabelText(/Aadhaar/i), SYNTHETIC_AADHAAR_12)
    const button = screen.getByRole('button', { name: /Secure and continue/i })
    await user.click(button)
    await user.click(button)
    expect(calls).toBe(1)
    release()
    await waitFor(() => {
      expect(screen.getByText(/•••• ••••/)).toBeInTheDocument()
    })
  })
})

describe('MobileOtpWidget', () => {
  it('emits undefined when empty and unverified value while typing without OTP/challenge', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(renderMobileOtpHarness({ bilingual, onChange }))
    const input = screen.getByLabelText(/^Mobile$/i)
    await user.type(input, '9876543210')
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(last).toEqual({ mobileNumber: '9876543210', verified: false })
    expect(last).not.toHaveProperty('verificationRef')
    expect(JSON.stringify(onChange.mock.calls)).not.toMatch(/challengeId/)
    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('sends and verifies OTP with correct ports and never persists OTP/challenge', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const sendOtp = vi.fn(async () => ({ challengeId: 'chal-1', otpLength: 6 }))
    const verifyOtp = vi.fn(async ({ otp }: { otp: string }) => {
      expect(otp).toBe('123456')
      return { verificationRef: 'ver-ref-1' }
    })
    const adapter: MobileOtpAdapter = { sendOtp, verifyOtp }
    render(
      renderMobileOtpHarness({
        bilingual,
        services: { mobileOtp: adapter },
        onChange,
        name: 'citizen_mobile',
      }),
    )
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => {
      expect(sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: 'citizen_mobile',
          mobileNumber: '9876543210',
          channels: ['sms'],
        }),
      )
    })
    const otpInput = screen.getByLabelText(/6-digit OTP/i)
    expect(otpInput).toHaveAttribute('maxLength', '6')
    fireEvent.input(otpInput, { target: { value: '123456' } })
    await user.click(screen.getByRole('button', { name: /Verify OTP/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        mobileNumber: '9876543210',
        verified: true,
        verificationRef: 'ver-ref-1',
      })
    })
    for (const call of onChange.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('chal-1')
      expect(JSON.stringify(call[0])).not.toContain('123456')
    }
    expect((otpInput as HTMLInputElement).value).toBe('')
  })

  it('clears verified state when mobile changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderMobileOtpHarness({
        bilingual,
        formData: {
          mobileNumber: '9876543210',
          verified: true,
          verificationRef: 'ver-1',
        },
        onChange,
        services: {
          mobileOtp: {
            async sendOtp() {
              return { challengeId: 'c', otpLength: 4 }
            },
            async verifyOtp() {
              return { verificationRef: 'v' }
            },
          },
        },
      }),
    )
    expect(screen.getByText(/Mobile number verified/i)).toBeInTheDocument()
    const input = screen.getByLabelText(/^Mobile$/i)
    await user.clear(input)
    await user.type(input, '9123456789')
    const afterEdit = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(afterEdit).toEqual({ mobileNumber: '9123456789', verified: false })
    expect(afterEdit).not.toHaveProperty('verificationRef')
  })

  it('prevents duplicate send and invalidates challenge on resend', async () => {
    const user = userEvent.setup()
    let sendCalls = 0
    let releaseSend!: () => void
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve
    })
    const challenges: string[] = []
    const adapter: MobileOtpAdapter = {
      async sendOtp() {
        sendCalls += 1
        if (sendCalls === 1) {
          await sendGate
        }
        const id = `chal-${sendCalls}`
        challenges.push(id)
        return { challengeId: id, otpLength: 4 }
      },
      async verifyOtp({ challengeId }) {
        return { verificationRef: `ref-for-${challengeId}` }
      },
    }
    render(renderMobileOtpHarness({ bilingual, services: { mobileOtp: adapter } }))
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    const sendBtn = screen.getByRole('button', { name: /Send OTP/i })
    await user.click(sendBtn)
    await user.click(sendBtn)
    expect(sendCalls).toBe(1)
    releaseSend()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Resend OTP/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Resend OTP/i }))
    await waitFor(() => {
      expect(sendCalls).toBe(2)
    })
    expect(challenges).toEqual(['chal-1', 'chal-2'])
  })

  it('ignores stale send when mobile changes mid-flight', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const signals: AbortSignal[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: MobileOtpAdapter = {
      async sendOtp({ signal }) {
        signals.push(signal)
        await gate
        return { challengeId: 'stale-chal', otpLength: 4 }
      },
      async verifyOtp() {
        return { verificationRef: 'should-not' }
      },
    }
    render(
      renderMobileOtpHarness({
        bilingual,
        services: { mobileOtp: adapter },
        onChange,
      }),
    )
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await user.clear(screen.getByLabelText(/^Mobile$/i))
    await user.type(screen.getByLabelText(/^Mobile$/i), '9123456789')
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(signals[0]?.aborted).toBe(true)
    expect(screen.queryByLabelText(/digit OTP/i)).not.toBeInTheDocument()
  })

  it('hides technical errors; supports missing adapter and readonly', async () => {
    const user = userEvent.setup()
    const { unmount: u0 } = render(renderMobileOtpHarness({ bilingual }))
    expect(screen.getByText(/OTP verification is temporarily unavailable/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    expect(screen.getByLabelText(/^Mobile$/i)).toHaveValue('9876543210')
    u0()

    const failAdapter: MobileOtpAdapter = {
      async sendOtp() {
        return { challengeId: 'c', otpLength: 4 }
      },
      async verifyOtp() {
        throw new Error('secret-stack-trace')
      },
    }
    const { unmount } = render(
      renderMobileOtpHarness({ bilingual, services: { mobileOtp: failAdapter } }),
    )
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => screen.getByLabelText(/4-digit OTP/i))
    fireEvent.input(screen.getByLabelText(/4-digit OTP/i), { target: { value: '9999' } })
    await user.click(screen.getByRole('button', { name: /Verify OTP/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/secret-stack-trace/)).not.toBeInTheDocument()
    unmount()

    render(
      renderMobileOtpHarness({
        bilingual,
        readonly: true,
        formData: { mobileNumber: '9876543210', verified: false },
      }),
    )
    expect(screen.getByText(/••••••3210/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send OTP/i })).not.toBeInTheDocument()
  })
})

describe('FB-A3.1 security corrections', () => {
  it('excludes raw Aadhaar and OTP from native FormData; mobileNumber may remain', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier }) {
        return { referenceToken: 'safe-tok', lastFour: rawIdentifier.slice(-4) }
      },
    }
    const { unmount } = render(
      <form data-testid="aadhaar-form">
        {renderAadhaarHarness({
          bilingual,
          services: { identityTokenization: adapter },
          onChange,
        })}
      </form>,
    )
    const aadhaarInput = screen.getByLabelText(/Aadhaar/i)
    setPasswordDigits(aadhaarInput, SYNTHETIC_AADHAAR_12)
    expect(aadhaarInput).not.toHaveAttribute('name')
    const aadhaarFd = new FormData(screen.getByTestId('aadhaar-form') as HTMLFormElement)
    const aadhaarValues = [...aadhaarFd.values()].map(String)
    expect(aadhaarValues).not.toContain(SYNTHETIC_AADHAAR_12)
    expect(aadhaarFd.has('aadhaar_ref__transient')).toBe(false)
    unmount()

    const otpAdapter: MobileOtpAdapter = {
      async sendOtp() {
        return { challengeId: 'chal-opaque', otpLength: 4 }
      },
      async verifyOtp() {
        return { verificationRef: 'ver-opaque' }
      },
    }
    render(
      <form data-testid="otp-form">
        {renderMobileOtpHarness({
          bilingual,
          services: { mobileOtp: otpAdapter },
          onChange,
        })}
      </form>,
    )
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => screen.getByLabelText(/4-digit OTP/i))
    const otpInput = screen.getByLabelText(/4-digit OTP/i)
    expect(otpInput).not.toHaveAttribute('name')
    fireEvent.input(otpInput, { target: { value: '4242' } })
    const otpFd = new FormData(screen.getByTestId('otp-form') as HTMLFormElement)
    const otpSerialized = [...otpFd.entries()].map(([k, v]) => [k, String(v)])
    expect(otpSerialized.some(([, v]) => v === '4242')).toBe(false)
    expect(otpSerialized.some(([, v]) => v === 'chal-opaque')).toBe(false)
    expect(otpSerialized.some(([, v]) => v === '9876543210')).toBe(true)
  })

  it('Aadhaar failure clears input, shows re-enter guidance, then succeeds on second attempt', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let calls = 0
    const adapter: IdentityTokenizationAdapter = {
      async tokenizeIdentity({ rawIdentifier }) {
        calls += 1
        if (calls === 1) {
          throw new Error('transient-host-error')
        }
        return { referenceToken: 'tok-ok', lastFour: rawIdentifier.slice(-4) }
      },
    }
    render(
      renderAadhaarHarness({
        bilingual,
        services: { identityTokenization: adapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Aadhaar/i)
    setPasswordDigits(input, SYNTHETIC_AADHAAR_12)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/Please re-enter/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: /Secure and continue/i })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/transient-host-error/)).not.toBeInTheDocument()

    setPasswordDigits(input, SYNTHETIC_AADHAAR_12)
    await user.click(screen.getByRole('button', { name: /Secure and continue/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        referenceToken: 'tok-ok',
        identifierKind: 'AADHAAR',
        lastFour: SYNTHETIC_AADHAAR_12.slice(-4),
      })
    })
  })

  it('rejects mobile and OTP letters instead of stripping them', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: MobileOtpAdapter = {
      async sendOtp() {
        return { challengeId: 'chal-ok', otpLength: 4 }
      },
      async verifyOtp() {
        return { verificationRef: 'ver-ok' }
      },
    }
    render(renderMobileOtpHarness({ bilingual, services: { mobileOtp: adapter }, onChange }))
    const mobile = screen.getByLabelText(/^Mobile$/i)
    await user.click(mobile)
    fireEvent.paste(mobile, {
      clipboardData: { getData: () => 'abc9876543210' },
    })
    expect(mobile).toHaveValue('')
    expect(screen.getByText(/10-digit mobile number/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ mobileNumber: '9876543210' }),
    )

    await user.type(mobile, '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => screen.getByLabelText(/4-digit OTP/i))
    const otp = screen.getByLabelText(/4-digit OTP/i)
    fireEvent.input(otp, { target: { value: '12ab' } })
    expect((otp as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/digits only/i)).toBeInTheDocument()
  })

  it('rejects malicious challengeId and verificationRef without emitting secrets', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const badChallenge: MobileOtpAdapter = {
      async sendOtp({ mobileNumber }) {
        return { challengeId: `wrap-${mobileNumber}-wrap`, otpLength: 4 }
      },
      async verifyOtp() {
        return { verificationRef: 'never' }
      },
    }
    const { unmount } = render(
      renderMobileOtpHarness({ bilingual, services: { mobileOtp: badChallenge }, onChange }),
    )
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/digit OTP/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/9876543210/)).not.toBeInTheDocument()
    unmount()

    const badVerify: MobileOtpAdapter = {
      async sendOtp() {
        return { challengeId: 'chal-ok', otpLength: 4 }
      },
      async verifyOtp({ otp, mobileNumber, challengeId }) {
        return { verificationRef: `${otp}:${mobileNumber}:${challengeId}` }
      },
    }
    onChange.mockClear()
    render(renderMobileOtpHarness({ bilingual, services: { mobileOtp: badVerify }, onChange }))
    await user.type(screen.getByLabelText(/^Mobile$/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /Send OTP/i }))
    await waitFor(() => screen.getByLabelText(/4-digit OTP/i))
    fireEvent.input(screen.getByLabelText(/4-digit OTP/i), { target: { value: '5555' } })
    await user.click(screen.getByRole('button', { name: /Verify OTP/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    })
    expect(
      onChange.mock.calls.some(
        (c) =>
          typeof c[0] === 'object' &&
          c[0] !== null &&
          (c[0] as { verified?: boolean }).verified === true,
      ),
    ).toBe(false)
    expect(screen.queryByText(/5555/)).not.toBeInTheDocument()
  })
})
