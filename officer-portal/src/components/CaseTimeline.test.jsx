import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CaseTimeline, { packRows, axisTicks } from './CaseTimeline'

vi.mock('../api', () => ({ fetchIntegrityTimeline: vi.fn() }))
import { fetchIntegrityTimeline } from '../api'

const DATA = {
  domain: 'BENEFICIARY', from: '2024-04-01', to: '2025-03-31',
  lanes: [
    { key: 'entitlement', label: 'Entitlement', items: [{ id: 'u1', start: '2024-04-01', end: '2025-03-31', kind: 'ENTITLEMENT', label: 'MYSY · ₹10000', detail: 'Entitlement period, active', flagged: false }] },
    { key: 'payments', label: 'Payments', items: [
      { id: 'p1', start: '2024-04-01', end: '2024-05-31', kind: 'PAYMENT', label: '₹5000', detail: 'settled, account ****7890', flagged: false },
      { id: 'p2', start: '2024-09-01', end: '2024-09-30', kind: 'PAYMENT', label: '₹5000', detail: 'settled', flagged: true },
    ] },
    { key: 'events', label: 'Verified events', items: [{ id: 'e1', start: '2024-06-01', end: '2024-06-01', kind: 'EVENT', label: 'Death', detail: 'Source CRS', flagged: true }] },
  ],
}

describe('Case timeline', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchIntegrityTimeline.mockResolvedValue(DATA) })

  it('shows every lane and marks the records the alert is about', async () => {
    render(<CaseTimeline caseId="c1" />)
    expect(await screen.findByText('Verified events')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
    const flagged = screen.getAllByRole('button').filter((b) => /part of what the alert is about/.test(b.getAttribute('aria-label')))
    expect(flagged).toHaveLength(2)
  })

  it('shows the details of an item when it is selected', async () => {
    render(<CaseTimeline caseId="c1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Event: Death/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Death · 2024-06-01 · Source CRS')
  })

  it('says so when the case has no dated records or cannot be loaded', async () => {
    fetchIntegrityTimeline.mockResolvedValue({ from: null, to: null, lanes: [] })
    const { unmount } = render(<CaseTimeline caseId="c1" />)
    expect(await screen.findByText(/No dated records/)).toBeInTheDocument()
    unmount()
    fetchIntegrityTimeline.mockRejectedValue(new Error('Your role is not allowed to do this.'))
    render(<CaseTimeline caseId="c2" />)
    expect(await screen.findByText(/not allowed/)).toBeInTheDocument()
  })

  it('stacks bars that overlap in time and keeps separate ones on one row', () => {
    const rows = packRows([
      { start: '2024-04-01', end: '2025-03-31' },
      { start: '2024-06-01', end: '2025-05-31' },
      { start: '2025-06-10', end: '2025-07-01' },
    ]).map((i) => i.row)
    expect(rows).toEqual([0, 1, 0])
  })

  it('gives readable axis ticks for a one-year span', () => {
    const ticks = axisTicks('2024-04-01', '2025-03-31')
    expect(ticks.length).toBeGreaterThan(2)
    expect(ticks[0].label).toMatch(/2024|24/)
  })
})
