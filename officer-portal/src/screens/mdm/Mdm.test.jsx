import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MdmHub from './MdmHub'
import { dqLabel, pct, fmtFresh } from './labels'

const dash = {
  totals: { persons: 5632, deceased: 266, well_linked: 2975, records: 15940 },
  links: { AUTO_LINKED: 10308, IN_REVIEW: 880, ANCHOR: 4104, NEW: 648 },
  reviews: { OPEN: 880 },
  sources: [{ source: 'crs', name: 'Civil registration (CRS)', interface: 'REST API + event feed', freshness_hours: 0, records: 3983, persons: 3900, linked: 3000, in_review: 22, latest: '2026-06-07', open_issues: 3 }],
  dq: [{ code: 'DOB_CONFLICT', severity: 'HIGH', status: 'OPEN', n: 64 }],
  coverage: [{ source_count: 1, n: 100 }, { source_count: 3, n: 50 }],
  loads: [{ id: 1, finished_at: '2026-10-26T10:00:00Z', stats: { records: 15940, persons: 5632, answer_key: { precision: 0.9911, recall: 0.8654 } } }],
}

describe('Master Data', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => dash }))
  })

  it('shows the overview with plain-language labels and the token header', async () => {
    localStorage.setItem('officer_token', 'tok')
    render(<MemoryRouter><MdmHub /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('People (golden records)')).toBeInTheDocument())
    expect(screen.getByText('Departments disagree on date of birth')).toBeInTheDocument()
    expect(screen.getByText(/99\.1% of links made are correct/)).toBeInTheDocument()
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('tells the officer when the service is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('down') })
    render(<MemoryRouter><MdmHub /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cannot be reached'))
  })

  it('use cases tab lists the six situations and describes events plainly', async () => {
    const { describeEvent } = await import('./UseCases')
    expect(describeEvent({ event_type: 'DEATH_REGISTERED', payload: { name: 'A B', age_at_death: 80, date_of_death: '2026-06-17', place_of_death: 'Telangana' } })).toContain('Death registered: A B')
    expect(describeEvent({ event_type: 'BIRTH_REGISTERED', payload: { child_name: null, date_of_birth: '2026-05-01' } })).toContain('name not given yet')
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ['UC1', 'UC2', 'UC3', 'UC4', 'UC5', 'UC6'].map((id) => ({ id, title: `Title ${id}`, question: 'Q?', events: 2, open_proposals: 1, extra: null })) }))
    render(<MemoryRouter initialEntries={['/mdm?tab=usecases']}><MdmHub /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Title UC6')).toBeInTheDocument())
  })

  it('helpers', () => {
    expect(dqLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE')
    expect(pct(1, 4)).toBe(25)
    expect(fmtFresh(24)).toBe('Up to a day old')
  })
})
