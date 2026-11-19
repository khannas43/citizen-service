import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxConsent from './DxConsent'

afterEach(cleanup)

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table) => vi.fn(async (url) => {
  const u = String(url)
  const keys = Object.keys(table).sort((a, b) => b.length - a.length)
  for (const k of keys) if (u.includes(k)) {
    const v = table[k]
    return typeof v === 'function' ? v(u) : json(v)
  }
  return json({})
})

const pending = {
  id: 9, person_name: 'Parent One', subject_name: 'Child One', purpose_name: 'Ration',
  system_name: 'PDS', status: 'PENDING', reminders: 0, seen_at: null, respond_by: '2026-11-10T00:00:00Z',
}

describe('DxConsent citizen column and Remind', () => {
  beforeEach(() => { localStorage.setItem('officer_token', 'tok') })

  it('shows Waiting, Seen and Answered in the Citizen column', async () => {
    globalThis.fetch = route({
      '/x/purposes': [],
      '/x/policy': { policies: [{ key: 'max_reminders', value: 2 }] },
      '/x/consents': {
        total: 3, by_status: { PENDING: 2, GRANTED: 1 },
        items: [
          pending,
          { ...pending, id: 10, seen_at: '2026-11-01T08:00:00Z', person_name: 'Parent Two' },
          { ...pending, id: 11, status: 'GRANTED', responded_at: '2026-11-02T09:00:00Z', person_name: 'Parent Three' },
        ],
      },
    })
    render(<MemoryRouter><DxConsent /></MemoryRouter>)
    expect(await screen.findByText('Waiting')).toBeInTheDocument()
    expect(screen.getByText(/Seen /)).toBeInTheDocument()
    expect(screen.getByText(/Answered /)).toBeInTheDocument()
  })

  it('shows Waiting for officer to confirm the parent, links to parent review, and disables Remind', async () => {
    globalThis.fetch = route({
      '/x/purposes': [],
      '/x/policy': { policies: [{ key: 'max_reminders', value: 2 }] },
      '/x/consents': {
        total: 1, by_status: { PENDING: 1 },
        items: [{ ...pending, parent_held: true, parent_review_reason: 'PARENT_REVIEW', parent_review_id: 42 }],
      },
      '/x/consents/9': {
        consent: { ...pending, parent_held: true, reminders: 0, parent_review_reason: 'PARENT_REVIEW', parent_review_id: 42 },
        receipt: { principal: 'Parent One', purpose: 'Ration', department: 'PDS', elements: [], status: 'PENDING' },
        log: [], deliveries: [],
      },
    })
    render(<MemoryRouter initialEntries={['/dx/consent?consent=9']}><DxConsent /></MemoryRouter>)
    expect(await screen.findAllByText('Waiting for officer to confirm the parent')).toBeTruthy()
    const links = screen.getAllByRole('link', { name: /Open parent review/ })
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(links.every((a) => a.getAttribute('href') === '/dx/work/PARENT_REVIEW')).toBe(true)
    const remind = screen.getByRole('button', { name: /Waiting for officer to confirm the parent/ })
    expect(remind).toBeDisabled()
  })

  it('Remind disables at the policy limit', async () => {
    globalThis.fetch = route({
      '/x/purposes': [],
      '/x/policy': { policies: [{ key: 'max_reminders', value: 2 }] },
      '/x/consents': { total: 1, by_status: { PENDING: 1 }, items: [pending] },
      '/x/consents/9': {
        consent: { ...pending, reminders: 2 },
        receipt: { principal: 'Parent One', purpose: 'Ration', department: 'PDS', elements: [], status: 'PENDING' },
        log: [], deliveries: [],
      },
    })
    render(<MemoryRouter initialEntries={['/dx/consent?consent=9']}><DxConsent /></MemoryRouter>)
    const remind = await screen.findByRole('button', { name: /Reminders used up/ })
    expect(remind).toBeDisabled()
  })

  it('filters Waiting for the citizen', async () => {
    globalThis.fetch = route({
      '/x/purposes': [],
      '/x/policy': { policies: [{ key: 'max_reminders', value: 2 }] },
      '/x/consents': (u) => {
        const pendingOnly = String(u).includes('status=PENDING')
        return json({
          total: pendingOnly ? 1 : 2,
          by_status: { PENDING: 1, GRANTED: 1 },
          items: pendingOnly
            ? [pending]
            : [pending, { ...pending, id: 12, status: 'GRANTED', person_name: 'Done' }],
        })
      },
    })
    render(<MemoryRouter><DxConsent /></MemoryRouter>)
    await screen.findByText('Parent One')
    const selects = screen.getAllByRole('combobox')
    const citizenFilter = selects.find((s) => withinOptions(s, 'Waiting for the citizen'))
    fireEvent.change(citizenFilter, { target: { value: 'WAITING' } })
    await waitFor(() => expect(globalThis.fetch.mock.calls.some((c) => String(c[0]).includes('status=PENDING'))).toBe(true))
  })
})

function withinOptions(select, label) {
  return [...select.options].some((o) => o.textContent === label)
}
