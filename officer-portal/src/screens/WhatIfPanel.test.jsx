import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WhatIfPanel from './WhatIfPanel'
import ExpenditureIntegrity from './ExpenditureIntegrity'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchWhatIfDefaults: vi.fn(),
    postWhatIf: vi.fn(),
    fetchIntegrityAlerts: vi.fn(() => Promise.resolve([])),
    fetchIntegrityMetrics: vi.fn(() => Promise.resolve({ openAlerts: 0, resolvedAlerts: 0 })),
    fetchSchemes: vi.fn(() => Promise.resolve([])),
    fetchBeneficiaryGeoOptions: vi.fn(() => Promise.resolve({ districts: [] })),
    fetchPayrollFilterOptions: vi.fn(() => Promise.resolve({ districts: [] })),
  }
})

import { fetchWhatIfDefaults, postWhatIf } from '../api'

const DEFAULTS = {
  rule804MinUnits: 4,
  rule805Threshold: 5,
  graceDaysDefault: 30,
  s06LifeCertificateDays: 365,
  s06BankChangeWindowDays: 90,
}

describe('What if panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchWhatIfDefaults.mockResolvedValue(DEFAULTS)
  })

  it('loads defaults into the form and runs what-if', async () => {
    postWhatIf.mockResolvedValue({
      rules: [{ ruleCode: '805', today: 8, withChange: 3, added: 0, dropped: 5, amountToday: 0, amountWithChange: 0, samplePeople: [] }],
      sentences: ['Raising the bank-change threshold from 5 to 8 would change rule 805 from 8 alerts to 3.'],
      schemeEngineNote: 'Rules 806 and 807 call the scheme engine and are not changed by these settings.',
    })
    render(<WhatIfPanel />)
    expect(await screen.findByLabelText(/Rule 805/)).toHaveValue(5)
    fireEvent.change(screen.getByLabelText(/Rule 805/), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => {
      expect(postWhatIf).toHaveBeenCalledWith({ rule805Threshold: 8 })
    })
    expect(screen.getByText(/from 8 alerts to 3/)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '8' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument()
    expect(screen.getByText(/806 and 807/)).toBeInTheDocument()
  })

  it('shows the tab for department admin on Expenditure integrity', async () => {
    localStorage.setItem('officer_role', 'DEPT_ADMIN')
    render(
      <MemoryRouter initialEntries={['/expenditure-integrity?view=what-if']}>
        <ExpenditureIntegrity />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'What if' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'What if' })).toHaveAttribute('aria-selected', 'true')
  })
})
