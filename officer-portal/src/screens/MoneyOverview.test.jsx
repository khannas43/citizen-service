import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import MoneyOverview from './MoneyOverview'

vi.mock('../api', () => ({ fetchIntegrityOverview: vi.fn() }))
vi.mock('../components/MoneyMap', () => ({
  METRICS: { flaggedAmount: { label: 'Flagged', ramp: ['#fff'] }, confirmedAmount: { label: 'Confirmed', ramp: ['#eee'] }, recoveredAmount: { label: 'Recovered', ramp: ['#ddd'] } },
  default: ({ onSelect }) => <button type="button" onClick={() => onSelect('Surat')}>map-surat</button>,
}))
import { fetchIntegrityOverview } from '../api'

const DATA = {
  totals: { openAlerts: 5, flaggedAmount: 120000, confirmedAmount: 40000, recoveredAmount: 15000, gatePreventedAmount: 9000, gateHeldPendingAmount: 3000, recurrenceRate: 12.5, fixedFindings: 8, recurredFindings: 1, avgDaysToMasterCorrection: 4.2, masterCorrections: 5, verifiedClosedCases: 3, awaitingVerification: 7, adverseDecisions: 10, overturned: 1, overturnRate: 10, noticesIssued: 4, noticesAwaitingResponse: 2, appealsOpen: 1 },
  byDistrict: [
    { district: 'Surat', openAlerts: 3, beneficiaryOpenAlerts: 2, payrollOpenAlerts: 1, flaggedAmount: 90000, confirmedAmount: 30000, recoveredAmount: 15000 },
    { district: 'Ahmedabad', openAlerts: 2, beneficiaryOpenAlerts: 2, payrollOpenAlerts: 0, flaggedAmount: 30000, confirmedAmount: 10000, recoveredAmount: 0 },
  ],
  byRule: [{ ruleCode: '802', openAlerts: 3, flaggedAmount: 100000, confirmedAmount: 40000 }],
  ruleHealth: [
    { ruleCode: '802', raised: 40, open: 5, reviewed: 30, confirmed: 24, legitimateException: 3, dataError: 2, dismissed: 1, precisionPercent: 80, enoughEvidence: true },
    { ruleCode: '805', raised: 6, open: 3, reviewed: 3, confirmed: 1, legitimateException: 1, dataError: 0, dismissed: 1, precisionPercent: 33.3, enoughEvidence: false },
    { ruleCode: '807', raised: 1, open: 1, reviewed: 0, confirmed: 0, legitimateException: 0, dataError: 0, dismissed: 0, precisionPercent: null, enoughEvidence: false },
  ],
  byMonth: [
    { month: '2025-11', flagged: 10000, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2025-12', flagged: 0, confirmed: 5000, recovered: 0, prevented: 1000 },
    { month: '2026-01', flagged: 20000, confirmed: 0, recovered: 3000, prevented: 0 },
    { month: '2026-02', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-03', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-04', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-05', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-06', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-07', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-08', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-09', flagged: 0, confirmed: 0, recovered: 0, prevented: 0 },
    { month: '2026-10', flagged: 5000, confirmed: 35000, recovered: 12000, prevented: 8000 },
  ],
}

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p> }
function renderAs(role) {
  localStorage.setItem('officer_role', role)
  return render(
    <MemoryRouter initialEntries={['/money-overview']}>
      <Routes><Route path="/money-overview" element={<MoneyOverview />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

describe('Money overview', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchIntegrityOverview.mockResolvedValue(DATA) })

  it('shows safeguard totals for senior management', async () => {
    renderAs('SENIOR_MGMT')
    expect(await screen.findByLabelText('Safeguards for people affected')).toBeInTheDocument()
    expect(screen.getByText('Overturned on appeal').parentElement).toHaveTextContent('1 (10%)')
    expect(screen.getByText('Appeals open').parentElement).toHaveTextContent('1')
  })

  it('shows the totals and ranks districts by amount flagged', async () => {
    renderAs('SENIOR_MGMT')
    expect(await screen.findByText('₹1,20,000')).toBeInTheDocument()
    expect(screen.getByText('₹9,000')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').map((r) => r.textContent)
    expect(rows.findIndex((r) => r.startsWith('Surat'))).toBeLessThan(rows.findIndex((r) => r.startsWith('Ahmedabad')))
    expect(screen.getAllByText('Conflicting entitlement').length).toBe(2)       // by-rule table and rule-health table
  })

  it('shows whether fixes hold and how fast the source is corrected', async () => {
    renderAs('SENIOR_MGMT')
    expect(await screen.findByText('12.5%')).toBeInTheDocument()
    expect(screen.getByText('4.2')).toBeInTheDocument()
    expect(screen.getByText('Waiting to be verified').parentElement).toHaveTextContent('7')
  })

  it('shows how reliable each check is, and says when the evidence is thin', async () => {
    renderAs('SENIOR_MGMT')
    const heading = await screen.findByText('How reliable each check is')
    const table = heading.closest('section')
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((r) => r.textContent)
    expect(rows[0]).toContain('Conflicting entitlement')
    expect(rows[0]).toContain('80%')
    expect(rows[1]).toContain('33.3%')
    expect(rows[1]).toContain('few rulings')
    expect(rows[2]).toContain('—')
  })

  it('opens the filtered inbox from a district for a role that has it', async () => {
    renderAs('DEPT_ADMIN')
    fireEvent.click(await screen.findByText('map-surat'))
    fireEvent.click(screen.getByRole('button', { name: 'Review beneficiary alerts (2)' }))
    expect(screen.getByTestId('where').textContent).toBe('/expenditure-integrity?domain=beneficiary&district=Surat')
  })

  it('shows senior management the district figures but no link into the cases', async () => {
    renderAs('SENIOR_MGMT')
    fireEvent.click(await screen.findByText('map-surat'))
    expect(screen.getByText(/3 open alerts/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Review/ })).toBeNull()
  })

  it('offers payroll alerts only to roles that may see them', async () => {
    renderAs('DEPT_ADMIN')
    fireEvent.click(await screen.findByText('map-surat'))
    fireEvent.click(screen.getByRole('button', { name: 'Review payroll alerts (1)' }))
    expect(screen.getByTestId('where').textContent).toBe('/expenditure-integrity?domain=payroll&district=Surat')
  })

  it('hides payroll alerts from a scheme officer', async () => {
    renderAs('SCHEME_DEPT')
    fireEvent.click(await screen.findByText('map-surat'))
    expect(screen.getByRole('button', { name: 'Review beneficiary alerts (2)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /payroll/i })).toBeNull()
  })

  it('says so when the overview cannot be loaded', async () => {
    fetchIntegrityOverview.mockRejectedValue(new Error('Your role is not allowed to do this.'))
    renderAs('HR_OFFICER')
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
  })

  it('draws monthly bars for the chosen metric', async () => {
    renderAs('SENIOR_MGMT')
    await screen.findByText('Last twelve months')
    const chart = document.querySelector('.mo-chart')
    expect(chart).toBeTruthy()
    expect(chart.querySelectorAll('rect').length).toBe(12)
    fireEvent.click(within(screen.getByLabelText('Money by month')).getByRole('button', { name: 'Confirmed' }))
    expect(chart.getAttribute('aria-label')).toMatch(/confirmed/i)
  })

  it('shows the state estimate with caveat when projection is set', async () => {
    fetchIntegrityOverview.mockResolvedValue({
      ...DATA,
      projection: {
        basis: 'Confirmed overpayment in the loaded demo data',
        pilotConfirmed: 40000,
        pilotSharePercent: 5,
        estimatedStateConfirmed: 800000,
        formula: 'demo data confirmed ÷ (demo data share % ÷ 100)',
        caveat: 'Estimate, not a finding. It assumes the demo data districts and schemes are typical of the state.',
      },
    })
    renderAs('SENIOR_MGMT')
    expect(await screen.findByText('Demo data result projected to the state')).toBeInTheDocument()
    expect(screen.getByText('₹8,00,000')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Estimate, not a finding')
  })

  it('labels chart months as MM/YY', async () => {
    renderAs('SENIOR_MGMT')
    await screen.findByText('Last twelve months')
    const labels = Array.from(document.querySelectorAll('.mo-chart-label')).map((n) => n.textContent)
    expect(labels).toContain('11/25')
    expect(labels).toContain('10/26')
  })

  it('does not show a state projection block when projection is absent', async () => {
    renderAs('DEPT_ADMIN')
    await screen.findByText('Last twelve months')
    expect(screen.queryByText(/projected to the state/i)).toBeNull()
  })
})
