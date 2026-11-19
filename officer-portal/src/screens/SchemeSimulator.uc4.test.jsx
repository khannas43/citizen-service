import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SchemeSimulator from './SchemeSimulator'

afterEach(cleanup)

const SCHEME = {
  id: 'a1000001-0000-0000-0000-0000000018c4',
  name: 'Higher Education Scholarship (turning 18)',
  category: 'EDUCATION',
  minAge: 17,
  maxAge: 18,
  incomeCeiling: 250000,
  eligibleCastes: 'OBC,SC,ST,NT,GENERAL',
  benefitValue: '25000',
}

vi.mock('../api', () => ({
  fetchSchemes: vi.fn(async () => [SCHEME]),
  runSimulation: vi.fn(async () => ({
    projectedCount: 2,
    currentCount: 0,
    delta: 2,
    totalAnnualCost: null,
    yearlyProjection: [],
    projectedBeneficiaries: [],
    citizens: [],
  })),
  fetchRules: vi.fn(async () => []),
  saveRule: vi.fn(),
  deleteRule: vi.fn(),
}))

vi.mock('../auth', () => ({
  getOfficerDistrictScope: () => null,
  matchesOfficerDistrict: () => true,
}))

describe('SchemeSimulator UC4 link', () => {
  beforeEach(() => {
    localStorage.setItem('officer_token', 'tok')
  })

  it('shows the sources link only for the Higher Education Scholarship scheme', async () => {
    const { runSimulation } = await import('../api')
    render(<MemoryRouter><SchemeSimulator /></MemoryRouter>)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(select.querySelector(`option[value="${SCHEME.id}"]`)).toBeTruthy())
    fireEvent.change(select, { target: { value: SCHEME.id } })
    await waitFor(() => expect(screen.getByDisplayValue('17')).toBeInTheDocument())
    expect(screen.getByDisplayValue('18')).toBeInTheDocument()
    expect(screen.getByDisplayValue('250000')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }))
    const link = await screen.findByRole('link', { name: 'Check these students against the sources' })
    expect(link).toHaveAttribute('href', '/dx/checks?tab=turning18')
    expect(runSimulation).toHaveBeenCalled()
  })
})
