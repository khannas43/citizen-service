import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import {
  acceptFeeComputationResult,
  assessFeeFieldIncomingValue,
  emitFeeFieldValue,
  formatFeeAmountInr,
  isSafeFeeQuoteRef,
  isValidFeeAmountMinor,
  resolveFeeContextRevision,
  resolveFeeRuleId,
} from '../src/runtime/fee-field.js'
import type { FeeComputationAdapter } from '../src/runtime/service-ports.js'
import { renderFeeFieldHarness } from './widget-harness.js'

const FEE_RULE = 'FEE_RULE_SERVICE_V1'
const CTX_A = 'ctx-rev-a'
const CTX_B = 'ctx-rev-b'
const QUOTE_A = `fee-quote:${FEE_RULE}:${CTX_A}`
const QUOTE_B = `fee-quote:${FEE_RULE}:${CTX_B}`

const bilingual: BilingualContent = {
  labels: {
    service_fee: { en: 'Service fee', gu: 'સેવા ફી' },
    applicant_service_fee: { en: 'Applicant fee', gu: 'અરજદાર ફી' },
  },
  help: {
    service_fee: { en: 'Calculated fee', gu: 'ગણાયેલી ફી' },
    applicant_service_fee: { en: 'Calculated fee', gu: 'ગણાયેલી ફી' },
  },
  errors: {},
}

function feeAdapter(impl?: FeeComputationAdapter['computeFee']): FeeComputationAdapter & {
  readonly calls: Parameters<FeeComputationAdapter['computeFee']>[0][]
} {
  const calls: Parameters<FeeComputationAdapter['computeFee']>[0][] = []
  return {
    calls,
    async computeFee(request) {
      calls.push(request)
      if (impl) {
        return impl(request)
      }
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 25000,
        quoteRef: `fee-quote:${request.feeRuleId}:${request.contextRevision}`,
      }
    },
  }
}

describe('FB-A10 fee-field helpers', () => {
  it('resolves ids and validates amount/quote safety', () => {
    expect(resolveFeeRuleId('  FEE_RULE_SERVICE_V1  ')).toEqual({
      ok: true,
      feeRuleId: FEE_RULE,
    })
    expect(resolveFeeContextRevision('')).toEqual({ ok: false })
    expect(isValidFeeAmountMinor(0)).toBe(true)
    expect(isValidFeeAmountMinor(25000)).toBe(true)
    expect(isValidFeeAmountMinor(-1)).toBe(false)
    expect(isValidFeeAmountMinor(1.5)).toBe(false)
    expect(isValidFeeAmountMinor(Number.NaN)).toBe(false)
    expect(isValidFeeAmountMinor(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isValidFeeAmountMinor(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
    expect(isSafeFeeQuoteRef(QUOTE_A, { feeRuleId: FEE_RULE, contextRevision: CTX_A })).toBe(true)
    expect(isSafeFeeQuoteRef(FEE_RULE, { feeRuleId: FEE_RULE, contextRevision: CTX_A })).toBe(false)
    expect(isSafeFeeQuoteRef(CTX_A, { feeRuleId: FEE_RULE, contextRevision: CTX_A })).toBe(false)
    expect(
      isSafeFeeQuoteRef('https://example.invalid/q', {
        feeRuleId: FEE_RULE,
        contextRevision: CTX_A,
      }),
    ).toBe(false)
  })

  it('classifies current, stale, and malformed incoming values', () => {
    const current = {
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR' as const,
      amountMinor: 100,
      quoteRef: QUOTE_A,
    }
    expect(assessFeeFieldIncomingValue(current, FEE_RULE, CTX_A).kind).toBe('current')
    expect(assessFeeFieldIncomingValue(current, FEE_RULE, CTX_B).kind).toBe('stale')
    expect(assessFeeFieldIncomingValue(true, FEE_RULE, CTX_A).kind).toBe('malformed')
    expect(assessFeeFieldIncomingValue({ ...current, currency: 'USD' }, FEE_RULE, CTX_A).kind).toBe(
      'malformed',
    )
    expect(
      acceptFeeComputationResult(
        { ...current, feeRuleId: 'OTHER' },
        { feeRuleId: FEE_RULE, contextRevision: CTX_A },
      ),
    ).toBeNull()
    expect(emitFeeFieldValue(current)).toEqual(current)
    expect(formatFeeAmountInr(0, 'en')).toMatch(/₹|INR|0/)
  })
})

describe('FeeFieldWidget', () => {
  it('requests exact fieldId/rule/revision and emits integer-minor quote', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    render(
      renderFeeFieldHarness({
        bilingual,
        name: 'applicant_service_fee',
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        feeRuleId: FEE_RULE,
        contextRevision: CTX_A,
        currency: 'INR',
        amountMinor: 25000,
        quoteRef: QUOTE_A,
      })
    })
    expect(adapter.calls[0]).toEqual(
      expect.objectContaining({
        fieldId: 'applicant_service_fee',
        feeRuleId: FEE_RULE,
        contextRevision: CTX_A,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Fee calculated/i)
  })

  it('displays zero fee and rejects unsafe amounts in helpers', async () => {
    const onChange = vi.fn()
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: {
          feeComputation: feeAdapter(async (request) => ({
            feeRuleId: request.feeRuleId,
            contextRevision: request.contextRevision,
            currency: 'INR',
            amountMinor: 0,
            quoteRef: `fee-quote-zero:${request.contextRevision}`,
          })),
        },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 0, currency: 'INR' }),
      )
    })
    expect(screen.getByLabelText(/Service fee/i).textContent).toMatch(/₹|INR|0/)
  })

  it('matching incoming quote avoids adapter call', () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        formData: {
          feeRuleId: FEE_RULE,
          contextRevision: CTX_A,
          currency: 'INR',
          amountMinor: 9900,
          quoteRef: QUOTE_A,
        },
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Service fee/i).textContent).toMatch(/99/)
  })

  it('stale incoming quote triggers replacement without clearing before success', async () => {
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = feeAdapter(async (request) => {
      await gate
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 11100,
        quoteRef: QUOTE_B,
      }
    })
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_B,
        formData: {
          feeRuleId: FEE_RULE,
          contextRevision: CTX_A,
          currency: 'INR',
          amountMinor: 9900,
          quoteRef: QUOTE_A,
        },
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(screen.getByLabelText(/Service fee/i)).toHaveTextContent(/not available|ઉપલબ્ધ/i)
    expect(onChange).not.toHaveBeenCalled()
    release()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          contextRevision: CTX_B,
          amountMinor: 11100,
          quoteRef: QUOTE_B,
        }),
      )
    })
  })

  it('malformed incoming is not displayed as current and may be replaced', async () => {
    const onChange = vi.fn()
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        formData: { amount: 250 },
        services: { feeComputation: feeAdapter() },
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not valid/i)
    expect(screen.getByLabelText(/Service fee/i)).toHaveTextContent(/not available|ઉપલબ્ધ/i)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 25000, contextRevision: CTX_A }),
      )
    })
  })

  it('revision A→B aborts/ignores stale A success', async () => {
    const onChange = vi.fn()
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const adapterA = feeAdapter(async (request) => {
      await gateA
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 100,
        quoteRef: 'stale-a-quote',
      }
    })
    const adapterB = feeAdapter()
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapterA },
        onChange,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Calculating/i)
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_B,
        services: { feeComputation: adapterB },
        onChange,
      }),
    )
    releaseA()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ contextRevision: CTX_B, amountMinor: 25000 }),
      )
    })
    expect(
      onChange.mock.calls.some(
        (call) =>
          typeof call[0] === 'object' &&
          call[0] !== null &&
          'quoteRef' in call[0] &&
          (call[0] as { quoteRef?: string }).quoteRef === 'stale-a-quote',
      ),
    ).toBe(false)
  })

  it('external matching quote arriving mid-request wins', async () => {
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = feeAdapter(async (request) => {
      await gate
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 77700,
        quoteRef: 'late-should-ignore',
      }
    })
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    const external = {
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR' as const,
      amountMinor: 5500,
      quoteRef: QUOTE_A,
    }
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        formData: external,
        services: { feeComputation: adapter },
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
          'quoteRef' in call[0] &&
          (call[0] as { quoteRef?: string }).quoteRef === 'late-should-ignore',
      ),
    ).toBe(false)
    expect(screen.getByLabelText(/Service fee/i).textContent).toMatch(/55/)
  })

  it('Retry recovers from failure', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldFail = true
    const adapter = feeAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('fail')
      }
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 3000,
        quoteRef: QUOTE_A,
      }
    })
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    })
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 3000 }))
    })
  })

  it('recovers when adapter and revision become available', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        feeRuleId: '',
        onChange,
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/misconfigured/i)
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeRuleId: FEE_RULE,
        onChange,
      }),
    )
    expect(screen.getByText(/waiting for form context/i)).toBeInTheDocument()
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeRuleId: FEE_RULE,
        feeContextRevision: CTX_A,
        onChange,
      }),
    )
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeRuleId: FEE_RULE,
        feeContextRevision: CTX_A,
        services: { feeComputation: feeAdapter() },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
  })

  it('locale EN→GU reformats without request or onChange', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    const quote = {
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR' as const,
      amountMinor: 25000,
      quoteRef: QUOTE_A,
    }
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        locale: 'en',
        feeContextRevision: CTX_A,
        formData: quote,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    const enText = screen.getByLabelText(/Service fee/i).textContent
    rerender(
      renderFeeFieldHarness({
        bilingual,
        locale: 'gu',
        feeContextRevision: CTX_A,
        formData: quote,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/સેવા ફી/i).textContent).toBeTruthy()
    expect(enText).toBeTruthy()
  })

  it('own onChange round-trip does not calculate twice', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    const callsAfterEmit = adapter.calls.length
    await new Promise((r) => setTimeout(r, 40))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(adapter.calls.length).toBe(callsAfterEmit)
  })

  it('disabled and readonly prevent compute and Retry', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        disabled: true,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    rerender(
      renderFeeFieldHarness({
        bilingual,
        readonly: true,
        feeContextRevision: CTX_A,
        formData: {
          feeRuleId: FEE_RULE,
          contextRevision: CTX_A,
          currency: 'INR',
          amountMinor: 100,
          quoteRef: QUOTE_A,
        },
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
  })

  it('has no editable or native FormData value and emits only quote fields', async () => {
    const onChange = vi.fn()
    render(
      <form data-testid="fee-form">
        {renderFeeFieldHarness({
          bilingual,
          feeContextRevision: CTX_A,
          services: { feeComputation: feeAdapter() },
          onChange,
        })}
      </form>,
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    const emitted = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(Object.keys(emitted).sort()).toEqual([
      'amountMinor',
      'contextRevision',
      'currency',
      'feeRuleId',
      'quoteRef',
    ])
    expect(JSON.stringify(emitted)).not.toMatch(/₹|AbortSignal|error|timestamp/i)
    const fd = new FormData(screen.getByTestId('fee-form') as HTMLFormElement)
    expect([...fd.keys()]).toHaveLength(0)
  })

  it('rejects malformed adapter responses without emission', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter(async () => ({
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR',
      amountMinor: 100,
      quoteRef: FEE_RULE,
    }))
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be calculated/i)
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(adapter.calls).toHaveLength(1)
  })
})

describe('FB-A10.1 fee computation effect stability', () => {
  it('keeps a delayed request stable while calculating UI renders', async () => {
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = feeAdapter(async (request) => {
      await gate
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 4200,
        quoteRef: QUOTE_A,
      }
    })
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Calculating/i)
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.calls).toHaveLength(1)
    release()
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    expect(adapter.calls).toHaveLength(1)
  })

  it('does not auto-retry after failure until Retry is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let shouldFail = true
    const adapter = feeAdapter(async (request) => {
      if (shouldFail) {
        throw new Error('synthetic failure')
      }
      return {
        feeRuleId: request.feeRuleId,
        contextRevision: request.contextRevision,
        currency: 'INR',
        amountMinor: 8800,
        quoteRef: QUOTE_A,
      }
    })
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    })
    expect(adapter.calls).toHaveLength(1)
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 20))
    expect(adapter.calls).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    shouldFail = false
    await user.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    expect(adapter.calls).toHaveLength(2)
  })

  it('keeps malformed adapter results failed without looping', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter(async () => ({
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR',
      amountMinor: 100,
      quoteRef: FEE_RULE,
    }))
    render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be calculated/i)
    })
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 20))
    expect(adapter.calls).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
  })

  it('does not recalculate on unrelated presentation rerenders', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    const quote = {
      feeRuleId: FEE_RULE,
      contextRevision: CTX_A,
      currency: 'INR' as const,
      amountMinor: 25000,
      quoteRef: QUOTE_A,
    }
    const { rerender } = render(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        formData: quote,
        services: { feeComputation: adapter },
        onChange,
      }),
    )
    expect(adapter.calls).toHaveLength(0)
    rerender(
      renderFeeFieldHarness({
        bilingual,
        feeContextRevision: CTX_A,
        formData: quote,
        services: { feeComputation: adapter },
        onChange,
        rawErrors: ['Unrelated presentation error'],
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.calls).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('StrictMode effect replay reaches the adapter exactly once', async () => {
    const onChange = vi.fn()
    const adapter = feeAdapter()
    render(
      <StrictMode>
        {renderFeeFieldHarness({
          bilingual,
          feeContextRevision: CTX_A,
          services: { feeComputation: adapter },
          onChange,
        })}
      </StrictMode>,
    )
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.calls).toHaveLength(1)
  })
})
