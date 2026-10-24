import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import StoryMode from './StoryMode'

vi.mock('../api', () => ({ fetchIntegrityStory: vi.fn() }))
vi.mock('../components/CaseTimeline', () => ({ default: ({ caseId }) => <div>timeline-{caseId}</div> }))
import { fetchIntegrityStory } from '../api'

const DATA = {
  scenarios: [
    { key: 'DUPLICATE_PAYMENT', title: 'A student is paid more than the scheme allows', ruleCode: '802', domain: 'BENEFICIARY', caseId: 'c1', personName: 'Raju Nayak', subject: 'MYSY', amount: 5000, status: 'OPEN', headline: 'Raju Nayak is entitled to ₹10000 under MYSY, but ₹15000 has been paid.' },
    { key: 'DOUBLE_SALARY', title: 'Two offices pay the same salary for the same days', ruleCode: 'S01', domain: 'PAYROLL', caseId: 'c2', personName: 'Demo Officer', subject: 'Clerk · DDO-A', amount: 42000, status: 'OPEN', headline: 'DDO-A and DDO-B both paid Demo Officer basic salary for 31 of the same days.' },
  ],
  summary: { openAlerts: 447, flaggedAmount: 520000, confirmedAmount: 965000, recoveredAmount: 965000, gatePreventedAmount: 9000, verifiedClosedCases: 124, awaitingVerification: 19, recurrenceRate: 14.8, avgDaysToMasterCorrection: 7.6 },
}

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p> }
function renderStory() {
  return render(
    <MemoryRouter initialEntries={['/story']}>
      <Routes><Route path="/story" element={<StoryMode />} /><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  )
}

describe('Guided story', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchIntegrityStory.mockResolvedValue(DATA) })

  it('starts on the first real case with its headline and timeline', async () => {
    renderStory()
    expect(await screen.findByText(/Raju Nayak is entitled to ₹10000/)).toBeInTheDocument()
    expect(screen.getByText('timeline-c1')).toBeInTheDocument()
    expect(screen.getByText(/Open — ready to act on/)).toBeInTheDocument()
  })

  it('walks through the cases and ends on the pilot summary', async () => {
    renderStory()
    await screen.findByText(/Raju Nayak is entitled/)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/DDO-A and DDO-B both paid/)).toBeInTheDocument()
    expect(screen.getByText('timeline-c2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('What the demo data found', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('₹5,20,000')).toBeInTheDocument()
    expect(screen.getByText(/not a projection for the state/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('opens the case in the right tab', async () => {
    renderStory()
    fireEvent.click(await screen.findByRole('button', { name: 'Open this case' }))
    expect(screen.getByTestId('where').textContent).toBe('/expenditure-integrity?domain=beneficiary&case=c1')
  })

  it('says so when a role has no example cases and when loading fails', async () => {
    fetchIntegrityStory.mockResolvedValue({ scenarios: [], summary: DATA.summary })
    const { unmount } = renderStory()
    expect(await screen.findByText(/No example cases are available/)).toBeInTheDocument()
    unmount()
    fetchIntegrityStory.mockRejectedValue(new Error('Your role is not allowed to do this.'))
    renderStory()
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
  })
})
