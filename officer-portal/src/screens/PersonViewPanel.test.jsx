import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PersonViewPanel from './PersonViewPanel'

vi.mock('../api', () => ({
  fetchPersonOverview: vi.fn(),
}))

import { fetchPersonOverview } from '../api'

describe('PersonViewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows both sides when linked and data includes payroll', async () => {
    fetchPersonOverview.mockResolvedValue({
      personName: 'Meera Rathod',
      linked: true,
      beneficiary: { alerts: [{ id: 'a1', ruleCode: '802', severity: 'HIGH', amount: 10000, caseId: 'c1', summary: 'MYSY' }], entitlements: [], totalAtStake: 10000 },
      payroll: { employeeCode: 'GJ-X', post: 'Clerk', ddoCode: 'DDO-1', alerts: [], totalAtStake: 0 },
    })
    render(<PersonViewPanel personKey="p1" personName="Meera" onClose={vi.fn()} onOpenCase={vi.fn()} />)
    await screen.findByText('Meera Rathod')
    expect(screen.getByText(/Linked/)).toBeInTheDocument()
    expect(screen.getByText('Beneficiary payments')).toBeInTheDocument()
    expect(screen.getByText('Payroll and pension')).toBeInTheDocument()
  })

  it('shows beneficiary only when payroll is omitted', async () => {
    fetchPersonOverview.mockResolvedValue({
      personName: 'Citizen',
      linked: true,
      beneficiary: { alerts: [], entitlements: [], totalAtStake: 0 },
    })
    render(<PersonViewPanel personKey="p2" onClose={vi.fn()} onOpenCase={vi.fn()} />)
    await screen.findByText('Citizen')
    expect(screen.getByText('Beneficiary payments')).toBeInTheDocument()
    // the payroll column stays, with a neutral note that does not say which of the two reasons applies
    expect(screen.getByText(/Your role cannot view payroll cases, or this person has no employee record/)).toBeInTheDocument()
    expect(screen.queryByText(/DDO/)).toBeNull()
  })

  it('calls onOpenCase when an alert is chosen', async () => {
    fetchPersonOverview.mockResolvedValue({
      linked: false,
      beneficiary: { alerts: [{ id: 'a1', ruleCode: '802', severity: 'HIGH', caseId: 'c9', summary: 'x' }], entitlements: [], totalAtStake: 0 },
    })
    const openCase = vi.fn()
    render(<PersonViewPanel personKey="p3" onClose={vi.fn()} onOpenCase={openCase} />)
    await screen.findByText('802')
    fireEvent.click(screen.getByRole('button', { name: /802/i }))
    expect(openCase).toHaveBeenCalledWith('c9')
  })

  it('closes from the overlay', async () => {
    fetchPersonOverview.mockResolvedValue({ linked: false, beneficiary: { alerts: [], entitlements: [], totalAtStake: 0 } })
    const close = vi.fn()
    const { container } = render(<PersonViewPanel personKey="p4" onClose={close} onOpenCase={vi.fn()} />)
    await waitFor(() => expect(fetchPersonOverview).toHaveBeenCalled())
    fireEvent.click(container.querySelector('.ei-person-overlay'))
    expect(close).toHaveBeenCalled()
  })
})
