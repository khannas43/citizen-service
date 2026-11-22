import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../approvalsApi', () => ({
  fetchUtilities: vi.fn().mockResolvedValue({
    address: { master: '45 Ambedkar Nagar, Karimnagar', held_by: [{ department: 'Civil supplies (PDS)', address: '45 Ambedkar Nagar, Karimnagar' }] },
    electricity: [{ service_no: 'ELEC-1', consumer_name: 'R. Pagidipalli', category: 'DOMESTIC', load_kw: '1.5', status: 'ACTIVE', address: '45 Ambedkar Nagar', units_last_6_months: [108, 100] }],
    water: [{
      service_no: 'WTR-000177', entity_name: 'Suma Pagidipalli', entity_type: 'HOUSEHOLD', connection_type: 'DOMESTIC', status: 'ACTIVE', connected_on: '2015-03-02', pipe_size_mm: 15,
      address: '45 Ambedkar Nagar, 505001', meter: { status: 'METERED', number: 'WM-4753850', make: 'Aquameter', installed_on: '2015-03-10' },
      passbook: { entries: [{ bill_no: 'BL-1', period: '2026-05', units_kl: 18, gross_amount: 266, subsidy_waived: 216, amount_payable: 50, paid_amount: 25, paid_on: '2026-06-14', status: 'PARTIAL' }],
        summary: { billed: 50, paid: 25, outstanding: 25, subsidy_waived: 216 } },
      subsidies: [{ claim_id: 'S1', scheme_name: 'Free Household Water Allowance', benefit_type: 'FREE_ALLOWANCE', from: '2026-01-05', to: '2026-06-05', amount_waived: 1008, status: 'ACTIVE' }],
    }],
    note: 'Sample data for demonstration.',
  }),
}))

import MyUtilities from './MyUtilities'

describe('My water and electricity', () => {
  it('shows the connection, meter, passbook and subsidy', async () => {
    render(<MemoryRouter><MyUtilities /></MemoryRouter>)
    expect(await screen.findByText(/WTR-000177/)).toBeInTheDocument()
    expect(screen.getByText(/WM-4753850/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /passbook/i })).toBeInTheDocument()
    expect(screen.getByText('Free Household Water Allowance')).toBeInTheDocument()
    expect(screen.getByText(/Outstanding: ₹ 25/)).toBeInTheDocument()
    expect(screen.getByText(/ELEC-1/)).toBeInTheDocument()
  })
})
