import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../approvalsApi', () => {
  const ok = { label: 'Active', tone: 'ok' }
  return {
  fetchRecords: vi.fn().mockResolvedValue({
    address: { master: '45 Ambedkar Nagar, Karimnagar', held_by: [{ department: 'Civil supplies (PDS)', address: '45 Ambedkar Nagar, Karimnagar' }] },
    departments: [
      { source: 'water_board', department: 'Water', icon: '💧', accounts: [{
        source: 'water_board', id: 'WTR-000177', title: 'Water connection WTR-000177', subtitle: 'Suma · Household · Domestic', status: ok,
        facts: [{ label: 'Address', value: '45 Ambedkar Nagar', type: 'text' }, { label: 'Connected on', value: '2024-06-27', type: 'date' }],
        ledgers: [{ title: 'Bill and payment passbook', bar: { left: 'Account WTR-000177', right_date: '2026-06-14', right_label: 'Last payment' },
          tiles: [{ label: 'Outstanding', value: 25, type: 'money', tone: 'due' }],
          columns: [{ key: 'month', label: 'Month', type: 'month', sub: 'ref' }, { key: 'payable', label: 'To pay', type: 'money' }, { key: 'balance', label: 'Balance', type: 'balance' }, { key: 'status', label: 'Status', type: 'status' }],
          rows: [{ month: '2026-05', ref: 'BL-1', payable: 50, balance: 25, status: { label: 'Part paid', tone: 'warn' } }], totals: { payable: 50, balance: 25 } }],
        benefits: [{ scheme: 'Free Household Water Allowance', kind: 'Free monthly allowance', amount: 1008, from: '2026-01-05', to: '2026-06-05', status: ok }],
        elements: [{ element: 'water_connection', name: 'Water connection and meter details', sensitivity: 'LOW', source: 'Water supply board', as_of: '2026-06-05', fields: [{ label: 'Connection number', value: 'WTR-000177', type: 'text' }] }],
      }] },
      { source: 'pension_batch', department: 'Pension', icon: '🧓', accounts: [{
        source: 'pension_batch', id: 'PN-1', title: 'Pension PN-1', subtitle: 'Old Age Pension', status: ok, facts: [], ledgers: [], benefits: [], elements: [] }] },
    ],
    note: 'Sample data for demonstration.',
  }),
  }
})

import MyRecords from './MyRecords'

describe('My department records', () => {
  it('shows one section per department with the passbook, benefits and supplied details', async () => {
    render(<MemoryRouter><MyRecords /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Expand all' }))
    expect(await screen.findByRole('heading', { name: /Water connection WTR-000177/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Water' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pension' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /passbook/i })).toBeInTheDocument()
    expect(screen.getByText('Free Household Water Allowance')).toBeInTheDocument()
    expect(screen.getByTestId('data-element')).toHaveTextContent('From Water supply board')
    expect(screen.getByText('Part paid')).toBeInTheDocument()
  })

  it('keeps each department collapsed until opened, and Collapse all closes them again', async () => {
    render(<MemoryRouter><MyRecords /></MemoryRouter>)
    const water = await screen.findByRole('button', { name: /Water/ })
    expect(water).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('table', { name: /passbook/i })).not.toBeInTheDocument()
    fireEvent.click(water)
    expect(water).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('table', { name: /passbook/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByRole('table', { name: /passbook/i })).not.toBeInTheDocument()
  })
})
