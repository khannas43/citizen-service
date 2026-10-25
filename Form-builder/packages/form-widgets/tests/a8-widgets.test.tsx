import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import {
  assessBankAccountIncomingValue,
  emitBankAccountValue,
  isValidBankAccountNumberDigits,
  isValidBankIfsc,
  normalizeBankIfscInput,
  parseBankAccountNumberInput,
} from '../src/runtime/bank-account.js'
import type { BankAccountVerificationAdapter } from '../src/runtime/service-ports.js'
import { renderBankAccountHarness } from './widget-harness.js'

const bilingual: BilingualContent = {
  labels: {
    bank_account: { en: 'Bank account', gu: 'બેંક ખાતું' },
    applicant_bank_account: { en: 'Applicant bank', gu: 'અરજદાર બેંક' },
  },
  help: {},
  errors: {},
}

const SYNTHETIC_ACCOUNT = '001234567890'
const SYNTHETIC_IFSC = 'SBIN0001234'
const SYNTHETIC_NAME = 'Priya Sharma'

function setAccountInput(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } })
}

function verifyingAdapter(
  impl?: BankAccountVerificationAdapter['verifyAccountName'],
): BankAccountVerificationAdapter & {
  readonly calls: Parameters<BankAccountVerificationAdapter['verifyAccountName']>[0][]
} {
  const calls: Parameters<BankAccountVerificationAdapter['verifyAccountName']>[0][] = []
  return {
    calls,
    async verifyAccountName(request) {
      calls.push(request)
      if (impl) {
        return impl(request)
      }
      return { verified: true, verificationRef: 'bank-ref-opaque-001' }
    },
  }
}

describe('FB-A8 bank-account helpers', () => {
  it('preserves leading zeroes and separator normalization; rejects letters', () => {
    expect(parseBankAccountNumberInput('001234567890')).toEqual({
      ok: true,
      digits: '001234567890',
    })
    expect(parseBankAccountNumberInput('0012-3456 7890')).toEqual({
      ok: true,
      digits: '001234567890',
    })
    expect(parseBankAccountNumberInput('00123A567890').ok).toBe(false)
    expect(isValidBankAccountNumberDigits('123456')).toBe(true)
    expect(isValidBankAccountNumberDigits('12345')).toBe(false)
    expect(isValidBankAccountNumberDigits('1'.repeat(20))).toBe(true)
    expect(isValidBankAccountNumberDigits('1'.repeat(21))).toBe(false)
  })

  it('normalizes IFSC to uppercase and validates pattern', () => {
    expect(normalizeBankIfscInput('sbin0001234')).toBe('SBIN0001234')
    expect(isValidBankIfsc('SBIN0001234')).toBe(true)
    expect(isValidBankIfsc('SBIN1001234')).toBe(false)
    expect(isValidBankIfsc('sbin0001234')).toBe(false)
  })
})

describe('BankAccountWidget', () => {
  it('emits partial verified:false data and undefined when emptied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    expect(onChange).toHaveBeenLastCalledWith({
      accountNumber: SYNTHETIC_ACCOUNT,
      verified: false,
    })
    await user.type(screen.getByLabelText(/^IFSC$/i), 'sbin0001234')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        accountNumber: SYNTHETIC_ACCOUNT,
        ifsc: SYNTHETIC_IFSC,
        verified: false,
      }),
    )
    await user.clear(screen.getByLabelText(/^IFSC$/i))
    setAccountInput(screen.getByLabelText(/Account number/i), '')
    await user.clear(screen.getByLabelText(/Account holder name/i))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('verifies with canonical fieldId and normalized inputs; mismatch emits no reference', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = verifyingAdapter(async () => ({ verified: false }))
    render(
      renderBankAccountHarness({
        bilingual,
        name: 'applicant_bank_account',
        services: { bankAccountVerification: adapter },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), '0012-3456-7890')
    await user.type(screen.getByLabelText(/^IFSC$/i), 'hdfc0004321')
    await user.type(screen.getByLabelText(/Account holder name/i), `  ${SYNTHETIC_NAME}  `)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be matched/i)
    })
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Verify account name/i })).not.toBeInTheDocument()
    expect(adapter.calls[0]).toEqual(
      expect.objectContaining({
        fieldId: 'applicant_bank_account',
        accountNumber: '001234567890',
        ifsc: 'HDFC0004321',
        accountHolderName: SYNTHETIC_NAME,
      }),
    )
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ verified: false }))
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('verificationRef')
  })

  it('emits safe verificationRef on success and rejects unsafe/echo references', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const ok = verifyingAdapter()
    const { unmount } = render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: ok },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/verified/i)
    })
    expect(onChange).toHaveBeenCalledWith({
      accountNumber: SYNTHETIC_ACCOUNT,
      ifsc: SYNTHETIC_IFSC,
      accountHolderName: SYNTHETIC_NAME,
      verified: true,
      verificationRef: 'bank-ref-opaque-001',
    })
    unmount()

    const onChange2 = vi.fn()
    const unsafe = verifyingAdapter(async () => ({
      verified: true,
      verificationRef: SYNTHETIC_ACCOUNT,
    }))
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: unsafe },
        onChange: onChange2,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be completed/i)
    })
    expect(
      onChange2.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'verified' in call[0] &&
          (call[0] as { verified: boolean }).verified === true,
      ),
    ).toBe(false)
  })

  it('clears verified state when any identifying field changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-opaque-001',
        },
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)
    await user.type(screen.getByLabelText(/^IFSC$/i), '5')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ verified: false }))
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('verificationRef')
  })

  it('ignores stale success after an identifying edit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = verifyingAdapter(async () => {
      await gate
      return { verified: true, verificationRef: 'stale-ref' }
    })
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: adapter },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Verifying/i)
    await user.type(screen.getByLabelText(/Account holder name/i), 'x')
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'verificationRef' in call[0] &&
          (call[0] as { verificationRef?: string }).verificationRef === 'stale-ref',
      ),
    ).toBe(false)
    expect(screen.queryByText(/Account name verified/i)).not.toBeInTheDocument()
  })

  it('recovers when adapter becomes available', async () => {
    const onChange = vi.fn()
    const { rerender } = render(renderBankAccountHarness({ bilingual, onChange }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    rerender(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Verify account name/i })).toBeDisabled()
  })

  it('does not present malformed incoming formData as verified', () => {
    const onChange = vi.fn()
    render(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: SYNTHETIC_ACCOUNT,
        },
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.queryByText(/Account name verified/i)).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('masks account number when readonly and excludes account input from native FormData', () => {
    const onChange = vi.fn()
    render(
      <form data-testid="bank-form">
        {renderBankAccountHarness({
          bilingual,
          formData: {
            accountNumber: SYNTHETIC_ACCOUNT,
            ifsc: SYNTHETIC_IFSC,
            accountHolderName: SYNTHETIC_NAME,
            verified: true,
            verificationRef: 'bank-ref-opaque-001',
          },
          readonly: true,
          services: { bankAccountVerification: verifyingAdapter() },
          onChange,
        })}
      </form>,
    )
    expect(screen.getByText(`••••${SYNTHETIC_ACCOUNT.slice(-4)}`)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(SYNTHETIC_ACCOUNT)).not.toBeInTheDocument()
    const fd = new FormData(screen.getByTestId('bank-form') as HTMLFormElement)
    expect([...fd.values()].map(String)).not.toContain(SYNTHETIC_ACCOUNT)
  })

  it('account input has no name attribute while editing', () => {
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: verifyingAdapter() },
      }),
    )
    expect(screen.getByLabelText(/Account number/i)).not.toHaveAttribute('name')
  })

  it('rejects assess of verified:false with verificationRef', () => {
    expect(
      assessBankAccountIncomingValue({
        accountNumber: SYNTHETIC_ACCOUNT,
        verified: false,
        verificationRef: 'x',
      }).kind,
    ).toBe('malformed')
  })
})

describe('FB-A8.1 bank-account state and security', () => {
  it('preserves canonical digits when a rejected character is typed', () => {
    const onChange = vi.fn()
    render(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-opaque-001',
        },
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)
    setAccountInput(screen.getByLabelText(/Account number/i), `${SYNTHETIC_ACCOUNT}A`)
    expect(onChange).toHaveBeenLastCalledWith({
      accountNumber: SYNTHETIC_ACCOUNT,
      ifsc: SYNTHETIC_IFSC,
      accountHolderName: SYNTHETIC_NAME,
      verified: false,
    })
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('verificationRef')
    expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).not.toContain(`${SYNTHETIC_ACCOUNT}A`)
    expect(screen.getByRole('alert')).toHaveTextContent(/valid account number/i)
  })

  it('clears internal sensitive state when external formData becomes malformed', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-opaque-001',
        },
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)
    rerender(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: SYNTHETIC_ACCOUNT,
        },
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.queryByText(/Account name verified/i)).not.toBeInTheDocument()
    expect((screen.getByLabelText(/Account number/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/^IFSC$/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Account holder name/i) as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: /Verify account name/i })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('presents persisted verified data without an adapter and survives adapter removal', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const verifiedData = {
      accountNumber: SYNTHETIC_ACCOUNT,
      ifsc: SYNTHETIC_IFSC,
      accountHolderName: SYNTHETIC_NAME,
      verified: true as const,
      verificationRef: 'bank-ref-opaque-001',
    }
    const { rerender } = render(
      renderBankAccountHarness({
        bilingual,
        formData: verifiedData,
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument()

    rerender(
      renderBankAccountHarness({
        bilingual,
        formData: verifiedData,
        services: { bankAccountVerification: verifyingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)

    rerender(
      renderBankAccountHarness({
        bilingual,
        formData: verifiedData,
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/verified/i)

    await user.type(screen.getByLabelText(/^IFSC$/i), '9')
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ verified: false }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
  })

  it('emitBankAccountValue never emits unsafe verified references', () => {
    const base = {
      accountNumber: SYNTHETIC_ACCOUNT,
      ifsc: SYNTHETIC_IFSC,
      accountHolderName: `  ${SYNTHETIC_NAME}  `,
      verified: true as const,
    }
    for (const verificationRef of [
      SYNTHETIC_ACCOUNT,
      SYNTHETIC_IFSC,
      `  ${SYNTHETIC_NAME}  `,
      SYNTHETIC_NAME,
    ]) {
      expect(emitBankAccountValue({ ...base, verificationRef })).toEqual({
        accountNumber: SYNTHETIC_ACCOUNT,
        ifsc: SYNTHETIC_IFSC,
        accountHolderName: `  ${SYNTHETIC_NAME}  `,
        verified: false,
      })
    }
    expect(
      emitBankAccountValue({
        ...base,
        accountHolderName: SYNTHETIC_NAME,
        verificationRef: 'safe-bank-ref',
      }),
    ).toEqual({
      accountNumber: SYNTHETIC_ACCOUNT,
      ifsc: SYNTHETIC_IFSC,
      accountHolderName: SYNTHETIC_NAME,
      verified: true,
      verificationRef: 'safe-bank-ref',
    })
  })

  it('ignores stale adapter rejection after an identifying edit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = verifyingAdapter(async () => {
      await gate
      return { verified: false }
    })
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: adapter },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Verifying/i)
    await user.type(screen.getByLabelText(/Account holder name/i), 'x')
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/could not be matched/i)).not.toBeInTheDocument()
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ verified: false }))
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('verificationRef')
  })

  it('ignores stale rejection and stale success after adapter identity change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseOld!: (
      result: { verified: true; verificationRef: string } | { verified: false },
    ) => void
    const oldGate = new Promise<{ verified: true; verificationRef: string } | { verified: false }>(
      (resolve) => {
        releaseOld = resolve
      },
    )
    const oldAdapter = verifyingAdapter(async () => oldGate)
    const liveAdapter = verifyingAdapter()
    const { rerender } = render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: oldAdapter },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Verifying/i)

    rerender(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: false,
        },
        services: { bankAccountVerification: liveAdapter },
        onChange,
      }),
    )
    releaseOld({ verified: true, verificationRef: 'old-adapter-ref' })
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'verificationRef' in call[0] &&
          (call[0] as { verificationRef?: string }).verificationRef === 'old-adapter-ref',
      ),
    ).toBe(false)
    expect(screen.queryByText(/Account name verified/i)).not.toBeInTheDocument()
  })

  it('invalidates in-flight verification when a rejected character is typed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = verifyingAdapter(async () => {
      await gate
      return { verified: true, verificationRef: 'late-ref' }
    })
    render(
      renderBankAccountHarness({
        bilingual,
        services: { bankAccountVerification: adapter },
        onChange,
      }),
    )
    setAccountInput(screen.getByLabelText(/Account number/i), SYNTHETIC_ACCOUNT)
    await user.type(screen.getByLabelText(/^IFSC$/i), SYNTHETIC_IFSC)
    await user.type(screen.getByLabelText(/Account holder name/i), SYNTHETIC_NAME)
    await user.click(screen.getByRole('button', { name: /Verify account name/i }))
    setAccountInput(screen.getByLabelText(/Account number/i), `${SYNTHETIC_ACCOUNT}x`)
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'verificationRef' in call[0] &&
          (call[0] as { verificationRef?: string }).verificationRef === 'late-ref',
      ),
    ).toBe(false)
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        accountNumber: SYNTHETIC_ACCOUNT,
        verified: false,
      }),
    )
  })

  it('uses aria-labelledby for readonly masked account presentation', () => {
    render(
      renderBankAccountHarness({
        bilingual,
        formData: {
          accountNumber: SYNTHETIC_ACCOUNT,
          ifsc: SYNTHETIC_IFSC,
          accountHolderName: SYNTHETIC_NAME,
          verified: true,
          verificationRef: 'bank-ref-opaque-001',
        },
        readonly: true,
        services: { bankAccountVerification: verifyingAdapter() },
      }),
    )
    const mask = screen.getByText(`••••${SYNTHETIC_ACCOUNT.slice(-4)}`)
    expect(mask).toHaveAttribute('aria-labelledby')
    expect(mask.tagName.toLowerCase()).toBe('p')
    expect(document.body.textContent).not.toContain(SYNTHETIC_ACCOUNT)
  })
})
