import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FraudSignals from './FraudSignals'

vi.mock('../api', () => ({ fetchFraudSignals: vi.fn() }))
import { fetchFraudSignals } from '../api'

const SIGNAL = {
  signalType: 'MULTI_SCHEME_OVERLAP', severity: 'HIGH', personName: 'Meera Rathod', personId: '50000005-0000-0000-0000-000000000001',
  familyId: 'a5000000-0000-0000-0000-000000000005', schemeId: 's1', schemeName: 'MYSY',
  detail: 'Enrolled in two overlapping schemes', detectedAt: '2026-10-07T10:00:00',
}

const renderScreen = () => render(<MemoryRouter><FraudSignals /></MemoryRouter>)

describe('legacy scheme-overlap screen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the signals it was given', async () => {
    fetchFraudSignals.mockResolvedValue([SIGNAL])
    renderScreen()
    expect(await screen.findByText(/Meera Rathod/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when nothing was found', async () => {
    fetchFraudSignals.mockResolvedValue([])
    renderScreen()
    expect(await screen.findByText('No fraud signals detected')).toBeInTheDocument()
  })

  it('reports a refusal as an error, never as "no signals detected"', async () => {
    fetchFraudSignals.mockRejectedValue(new Error('The scheme engine does not allow your role to see scheme-overlap signals.'))
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('does not allow your role')
    expect(screen.queryByText('No fraud signals detected')).toBeNull()
  })

  it('can try again after a failure', async () => {
    fetchFraudSignals.mockRejectedValueOnce(new Error('The scheme engine could not be reached.')).mockResolvedValue([SIGNAL])
    renderScreen()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/Meera Rathod/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
