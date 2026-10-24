import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PaymentGate from './PaymentGate'

vi.mock('../api', () => ({
  screenPaymentFile: vi.fn(),
  fetchPaymentBatches: vi.fn(),
  fetchPaymentBatch: vi.fn(),
  decidePaymentLine: vi.fn(),
}))
import { screenPaymentFile, fetchPaymentBatches, fetchPaymentBatch, decidePaymentLine } from '../api'

const SUMMARY = {
  id: 'b1', name: 'october.csv', uploadedAt: '2026-10-07T10:00:00', lineCount: 3, totalAmount: 9000,
  counts: { CLEAR: 1, REVIEW: 1, HOLD: 1 }, amounts: { CLEAR: 3000, REVIEW: 3000, HOLD: 3000 },
  undecided: 2, holdsConfirmed: 0, released: 0,
}
const DETAIL = {
  ...SUMMARY,
  totalLines: 1,
  lines: [{
    id: 'l1', lineNo: 2, personName: 'Meera Rathod', schemeName: 'MYSY', periodStart: '2026-04-01', periodEnd: '2026-06-30',
    amount: 3000, verdict: 'HOLD', decision: 'NONE',
    reasons: [{ code: 'OVER_ENTITLEMENT', text: 'Total paid would be Rs 13000 against an entitlement of Rs 10000' }],
  }],
}

describe('Pre-payment gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPaymentBatches.mockResolvedValue([SUMMARY])
    fetchPaymentBatch.mockResolvedValue(DETAIL)
    decidePaymentLine.mockResolvedValue({})
  })

  it('lists screened files and shows why a payment is held', async () => {
    render(<PaymentGate canDecide />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByText(/against an entitlement of Rs 10000/)).toBeInTheDocument()
    expect(fetchPaymentBatch).toHaveBeenCalledWith('b1', 'HOLD', 0)
  })

  it('needs a reason before a flagged payment is released', async () => {
    render(<PaymentGate canDecide />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Release…' }))
    const release = screen.getByRole('button', { name: 'Release' })
    expect(release).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for releasing'), { target: { value: 'Court order' } })
    fireEvent.click(release)
    await waitFor(() => expect(decidePaymentLine).toHaveBeenCalledWith('b1', 'l1', 'RELEASE', 'Court order'))
  })

  it('confirms a hold with one click', async () => {
    render(<PaymentGate canDecide />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm hold' }))
    await waitFor(() => expect(decidePaymentLine).toHaveBeenCalledWith('b1', 'l1', 'CONFIRM_HOLD', ''))
  })

  it('lets a read-only role view but not upload or decide', async () => {
    render(<PaymentGate canDecide={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    await screen.findByText(/against an entitlement/)
    expect(screen.queryByRole('button', { name: 'Confirm hold' })).toBeNull()
    expect(screen.queryByText(/Screen a payment file/)).toBeNull()
    expect(screenPaymentFile).not.toHaveBeenCalled()
  })
})
