import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonLineage, { changeText } from './PersonLineage'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })

const hist = [
  { ts: '2026-10-28T17:30:00Z', event: 'RECORDED', to_status: 'IN_REVIEW', to_person: 22206, to_mdm_id: 'MDM-22206', load_id: 4 },
  { ts: '2026-11-01T17:02:01Z', event: 'STEWARD_LINKED', actor: 'dept.admin', from_person: 22206, to_person: 20665, from_mdm_id: 'MDM-22206', to_mdm_id: 'MDM-20665', note: 'same father and village' },
]
const data = {
  person: { id: 20665, mdm_id: 'MDM-20665', name: 'Komuraiah Paidi' },
  summary: { systems: 1, records: 1, spellings: 1, conflicts: 0 }, fields: [], relationships: [],
  sources: [{ source: 'electricity', name: 'Electricity distribution', interface: 'batch', freshness_hours: 24, records: [
    { id: 1, source: 'electricity', source_rid: 'ELEC-00000015', name: 'Komuraiah Paidi', dob: null, birth_year: 1970, link_status: 'STEWARD_LINKED', score: 0.8, reason: 'linked by dept.admin',
      load_id: 4, loaded_at: '2026-10-28T17:30:00Z', rule_version: 1, history: hist, last_change: hist[1] }] }],
}

describe('Record link history', () => {
  it('words each kind of change', () => {
    expect(changeText({ event: 'STEWARD_LINKED', actor: 'dept.admin' })).toBe('Linked by dept.admin')
    expect(changeText({ event: 'RECORDED', to_status: 'AUTO_LINKED' })).toMatch(/automatically/)
    expect(changeText({ event: 'UNLINKED', actor: 'x' })).toBe('Unlinked by x')
  })

  it('shows when the record was last linked, not just the run date, and opens the history', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => data }))
    render(<MemoryRouter><PersonLineage personId={20665} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /Record by record/ }))
    expect(await screen.findByText('Last linked or updated')).toBeTruthy()
    expect(screen.getByText('Linked by dept.admin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Link history of ELEC-00000015/ }))
    await waitFor(() => expect(screen.getByText(/Moved from MDM-22206 to MDM-20665/)).toBeTruthy())
    expect(screen.getByText(/same father and village/)).toBeTruthy()
    expect(screen.getByText('Received, waiting for a steward')).toBeTruthy()
  })
})
