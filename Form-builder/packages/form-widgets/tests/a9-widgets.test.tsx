import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import {
  acceptConsentLoggingResult,
  assessEligibilityDeclarationIncomingValue,
  emitEligibilityDeclarationValue,
  isSafeConsentReceiptRef,
  resolveDeclarationId,
} from '../src/runtime/eligibility-declaration.js'
import type { ConsentLoggingAdapter } from '../src/runtime/service-ports.js'
import { renderEligibilityDeclarationHarness } from './widget-harness.js'

const DECL_ID = 'DECL_ELIG_V1'
const RECEIPT_ACCEPT = 'consent-receipt-opaque-accept-001'
const RECEIPT_DECLINE = 'consent-receipt-opaque-decline-001'

const bilingual: BilingualContent = {
  labels: {
    eligibility_declaration: { en: 'Eligibility declaration', gu: 'પાત્રતા ઘોષણા' },
    applicant_eligibility_declaration: {
      en: 'Applicant eligibility',
      gu: 'અરજદાર પાત્રતા',
    },
  },
  help: {
    eligibility_declaration: {
      en: 'I confirm that I meet the eligibility criteria for this service.',
      gu: 'હું પુષ્ટિ કરું છું કે હું આ સેવા માટેની પાત્રતા શરતો પૂરી કરું છું.',
    },
    applicant_eligibility_declaration: {
      en: 'I confirm that I meet the eligibility criteria for this service.',
      gu: 'હું પુષ્ટિ કરું છું કે હું આ સેવા માટેની પાત્રતા શરતો પૂરી કરું છું.',
    },
  },
  errors: {},
}

function loggingAdapter(impl?: ConsentLoggingAdapter['recordDecision']): ConsentLoggingAdapter & {
  readonly calls: Parameters<ConsentLoggingAdapter['recordDecision']>[0][]
} {
  const calls: Parameters<ConsentLoggingAdapter['recordDecision']>[0][] = []
  return {
    calls,
    async recordDecision(request) {
      calls.push(request)
      if (impl) {
        return impl(request)
      }
      return {
        declarationId: request.declarationId,
        accepted: request.accepted,
        locale: request.locale,
        consentReceiptRef: request.accepted ? RECEIPT_ACCEPT : RECEIPT_DECLINE,
      }
    },
  }
}

describe('FB-A9 eligibility-declaration helpers', () => {
  it('resolves declarationId and validates consent receipt opacity', () => {
    expect(resolveDeclarationId('  DECL_ELIG_V1  ')).toEqual({
      ok: true,
      declarationId: 'DECL_ELIG_V1',
    })
    expect(resolveDeclarationId('')).toEqual({ ok: false })
    expect(
      isSafeConsentReceiptRef(RECEIPT_ACCEPT, {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(true)
    expect(
      isSafeConsentReceiptRef(`consent:${DECL_ID}:receipt-123`, {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(true)
    expect(
      isSafeConsentReceiptRef('urn:dg20:eligibility_declaration:receipt-123', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(true)
    expect(
      isSafeConsentReceiptRef(DECL_ID, {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('eligibility_declaration', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('   ', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('data:text/plain,hello', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('blob:https://example.invalid/abc', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('http://example.invalid/receipt', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
    expect(
      isSafeConsentReceiptRef('https://example.invalid/receipt', {
        declarationId: DECL_ID,
        fieldId: 'eligibility_declaration',
      }),
    ).toBe(false)
  })

  it('accepts matched adapter results and rejects mismatches or unsafe receipts', () => {
    expect(
      acceptConsentLoggingResult(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          fieldId: 'eligibility_declaration',
        },
      ),
    ).toEqual({
      declarationId: DECL_ID,
      accepted: true,
      locale: 'en',
      consentReceiptRef: RECEIPT_ACCEPT,
    })
    expect(
      acceptConsentLoggingResult(
        {
          declarationId: DECL_ID,
          accepted: false,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          fieldId: 'eligibility_declaration',
        },
      ),
    ).toBeNull()
    expect(
      acceptConsentLoggingResult(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'gu',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          fieldId: 'eligibility_declaration',
        },
      ),
    ).toBeNull()
    expect(
      acceptConsentLoggingResult(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: DECL_ID,
        },
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          fieldId: 'eligibility_declaration',
        },
      ),
    ).toBeNull()
  })

  it('never emits bare booleans or incomplete receipt values', () => {
    expect(
      emitEligibilityDeclarationValue(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        'eligibility_declaration',
      ),
    ).toEqual({
      declarationId: DECL_ID,
      accepted: true,
      locale: 'en',
      consentReceiptRef: RECEIPT_ACCEPT,
    })
    expect(
      emitEligibilityDeclarationValue(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: '',
        },
        'eligibility_declaration',
      ),
    ).toBeUndefined()
    expect(assessEligibilityDeclarationIncomingValue(true, DECL_ID).kind).toBe('malformed')
    expect(
      assessEligibilityDeclarationIncomingValue(
        {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
        },
        DECL_ID,
      ).kind,
    ).toBe('malformed')
  })
})

describe('EligibilityDeclarationWidget', () => {
  it('renders unchecked without adapter call when unanswered', () => {
    const adapter = loggingAdapter()
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: adapter },
      }),
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(adapter.calls).toHaveLength(0)
  })

  it('checks with canonical fieldId/declarationId/locale and emits receipt-backed true', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = loggingAdapter()
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        name: 'applicant_eligibility_declaration',
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        declarationId: DECL_ID,
        accepted: true,
        locale: 'en',
        consentReceiptRef: RECEIPT_ACCEPT,
      })
    })
    expect(adapter.calls[0]).toEqual(
      expect.objectContaining({
        fieldId: 'applicant_eligibility_declaration',
        declarationId: DECL_ID,
        accepted: true,
        locale: 'en',
      }),
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent(/Decision recorded/i)
  })

  it('unchecks only after host records accepted:false with a receipt', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = loggingAdapter(async (request) => {
      await gate
      return {
        declarationId: request.declarationId,
        accepted: request.accepted,
        locale: request.locale,
        consentReceiptRef: RECEIPT_DECLINE,
      }
    })
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent(/Recording/i)
    expect(onChange).not.toHaveBeenCalled()
    release()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        declarationId: DECL_ID,
        accepted: false,
        locale: 'en',
        consentReceiptRef: RECEIPT_DECLINE,
      })
    })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('keeps previous decision on adapter failure and retries the same desired decision', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldFail = true
    const adapter = loggingAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('synthetic failure')
      }
      return {
        declarationId: request.declarationId,
        accepted: request.accepted,
        locale: request.locale,
        consentReceiptRef: RECEIPT_ACCEPT,
      }
    })
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: false,
          locale: 'en',
          consentReceiptRef: RECEIPT_DECLINE,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be recorded/i)
    })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        declarationId: DECL_ID,
        accepted: true,
        locale: 'en',
        consentReceiptRef: RECEIPT_ACCEPT,
      })
    })
    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[0]?.accepted).toBe(true)
    expect(adapter.calls[1]?.accepted).toBe(true)
  })

  it('rejects malformed adapter responses and empty/unsafe receipts without emission', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = loggingAdapter(async () => ({
      declarationId: DECL_ID,
      accepted: true,
      locale: 'en',
      consentReceiptRef: DECL_ID,
    }))
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be recorded/i)
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('ignores stale success after adapter identity change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseOld!: () => void
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    const oldAdapter = loggingAdapter(async (request) => {
      await oldGate
      return {
        declarationId: request.declarationId,
        accepted: request.accepted,
        locale: request.locale,
        consentReceiptRef: 'stale-receipt-should-ignore',
      }
    })
    const liveAdapter = loggingAdapter()
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: oldAdapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('status')).toHaveTextContent(/Recording/i)
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: liveAdapter },
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
          'consentReceiptRef' in call[0] &&
          (call[0] as { consentReceiptRef?: string }).consentReceiptRef ===
            'stale-receipt-should-ignore',
      ),
    ).toBe(false)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('emits successfully when adapter returns a composite receipt embedding declarationId', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const compositeRef = `consent:${DECL_ID}:receipt-123`
    const adapter = loggingAdapter(async (request) => ({
      declarationId: request.declarationId,
      accepted: request.accepted,
      locale: request.locale,
      consentReceiptRef: `  ${compositeRef}  `,
    }))
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        declarationId: DECL_ID,
        accepted: true,
        locale: 'en',
        consentReceiptRef: compositeRef,
      })
    })
  })

  it('clears failed Retry intent on locale change without requesting or emitting', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = loggingAdapter(async () => {
      throw new Error('synthetic failure')
    })
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'en',
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    })
    const callsBeforeLocale = adapter.calls.length
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'gu',
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect(adapter.calls).toHaveLength(callsBeforeLocale)
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(adapter.calls.length).toBe(callsBeforeLocale + 1)
    })
    expect(adapter.calls.at(-1)?.locale).toBe('gu')
  })

  it('ignores stale failure after locale change while pending', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = loggingAdapter(async () => {
      await gate
      throw new Error('late failure')
    })
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'en',
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'gu',
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('prevents duplicate requests while recording', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = loggingAdapter(async (request) => {
      await gate
      return {
        declarationId: request.declarationId,
        accepted: request.accepted,
        locale: request.locale,
        consentReceiptRef: RECEIPT_ACCEPT,
      }
    })
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: adapter },
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('checkbox'))
    expect(adapter.calls).toHaveLength(1)
    release()
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked()
    })
  })

  it('recovers when adapter and declarationId become available', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        declarationId: '',
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/misconfigured/i)
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        declarationId: DECL_ID,
        onChange,
      }),
    )
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        declarationId: DECL_ID,
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeDisabled()
  })

  it('presents incoming true/false receipt-backed values and rejects malformed incoming', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'gu',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent(/Decision recorded/i)

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: false,
          locale: 'en',
          consentReceiptRef: RECEIPT_DECLINE,
        },
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: true,
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(onChange).not.toHaveBeenCalled()

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: 'OTHER_DECL',
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'hi',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
          extra: 'nope',
        },
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
  })

  it('locale display change causes no request or onChange', async () => {
    const onChange = vi.fn()
    const adapter = loggingAdapter()
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'en',
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByText(/meet the eligibility criteria/i)).toBeInTheDocument()
    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        locale: 'gu',
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByText(/પાત્રતા શરતો/i)).toBeInTheDocument()
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled and readonly prevent changes and Retry', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter = loggingAdapter(async () => {
      throw new Error('fail')
    })
    const { rerender } = render(
      renderEligibilityDeclarationHarness({
        bilingual,
        disabled: true,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(adapter.calls).toHaveLength(0)

    rerender(
      renderEligibilityDeclarationHarness({
        bilingual,
        readonly: true,
        formData: {
          declarationId: DECL_ID,
          accepted: true,
          locale: 'en',
          consentReceiptRef: RECEIPT_ACCEPT,
        },
        services: { consentLogging: adapter },
        onChange,
      }),
    )
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
  })

  it('checkbox has no name and native FormData excludes the decision', () => {
    render(
      <form data-testid="decl-form">
        {renderEligibilityDeclarationHarness({
          bilingual,
          formData: {
            declarationId: DECL_ID,
            accepted: true,
            locale: 'en',
            consentReceiptRef: RECEIPT_ACCEPT,
          },
          services: { consentLogging: loggingAdapter() },
        })}
      </form>,
    )
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('name')
    const fd = new FormData(screen.getByTestId('decl-form') as HTMLFormElement)
    expect([...fd.keys()]).toHaveLength(0)
  })

  it('does not put signal, errors, or timestamps into formData', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      renderEligibilityDeclarationHarness({
        bilingual,
        services: { consentLogging: loggingAdapter() },
        onChange,
      }),
    )
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const emitted = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(Object.keys(emitted).sort()).toEqual([
      'accepted',
      'consentReceiptRef',
      'declarationId',
      'locale',
    ])
    expect(JSON.stringify(emitted)).not.toMatch(/AbortSignal|timestamp|Date|error/i)
  })
})
