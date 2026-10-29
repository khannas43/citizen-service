import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxControl from './DxControl'
import DxQuery from './DxQuery'
import DxDiscrepancies from './DxDiscrepancies'
import DxAudit from './DxAudit'
import DxStandards from './DxStandards'
import DxHousehold from './DxHousehold'
import DxRetention from './DxRetention'
import { DxRegistry } from './DxCatalogue'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})
const wrap = (el, at = '/') => render(<MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>)

const control = (o = {}) => ({
  events: { n: 120, day: 4 }, deliveries: { DELIVERED: 5, RETRYING: 1 }, dead_letters: 0, consents: {}, open_approvals: [{ system: 'Health', n: 2, oldest_hours: 5 }],
  exchanges: { ANSWERED: 9, DENIED_NO_CONSENT: 2 }, timing: { avg_ms: 12, max_ms: 80 },
  subscribers: [{ system: 'health', name: 'Health', available: true, note: null, deliveries: { DELIVERED: 5 } }, { system: 'pds', name: 'Civil supplies', available: false, note: 'maintenance', deliveries: { RETRYING: 1 } }],
  audit_chain: { ok: true, checked: 345 }, open_discrepancies: 3, open_review_tasks: 7, dq_high: 2, misuse_alerts: 0, loadtests: [], ...o,
})

describe('Control tower', () => {
  it('shows an offline department and lets a person bring it back', async () => {
    const posted = []
    globalThis.fetch = route({
      '/x/control': control(),
      '/x/deliveries': { items: [], total: 0 },
      '/x/subscribers/pds': (u, init) => { posted.push(JSON.parse(init.body)); return json({ system: 'pds', available: true, retried: { delivered: 1, still_retrying: 0, dead_letter: 0 } }) },
    })
    wrap(<DxControl />)
    expect((await screen.findAllByText('Offline')).length).toBeGreaterThan(0)
    expect(screen.getByText('Intact')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bring back' }))
    await waitFor(() => expect(posted).toEqual([{ available: true, note: null }]))
    expect(await screen.findByText(/1 sent, 0 still retrying/)).toBeInTheDocument()
  })

  it('offers to send a set-aside item again', async () => {
    globalThis.fetch = route({ '/x/control': control({ dead_letters: 1 }), '/x/deliveries': { total: 1, items: [{ id: 9, status: 'DEAD_LETTER', system: 'health', purpose: 'BIRTH_HEALTH', attempts: 3, updated_at: '2026-10-27T10:00:00Z' }] } })
    wrap(<DxControl />)
    expect(await screen.findByText('Set aside for a person')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
  })
})

describe('Query builder', () => {
  const purposes = [
    { code: 'PENSION_ELIGIBILITY', name: 'Pension eligibility', system: 'pension', system_name: 'Pension', consent_required: false, elements: ['life_status', 'age'] },
    { code: 'SCHOLARSHIP_ELIGIBILITY', name: 'Scholarship', system: 'education', system_name: 'Education', consent_required: true, elements: ['income_band', 'category', 'residence', 'age'] },
  ]
  it('returns ids and the chosen elements only, and says how many were left out', async () => {
    const bodies = []
    globalThis.fetch = route({
      '/x/purposes': purposes,
      '/x/query': (u, init) => { bodies.push(JSON.parse(init.body)); return json({ outcome: 'ANSWERED', matched: 5, shared: 1, withheld_no_consent: 4, elements: ['age'], rows: [{ mdm_id: 'MDM-1', age: '80 to 89' }], truncated: false, expires_at: '2026-10-27T12:00:00Z', ledger_id: 55, message: '' }) },
    })
    wrap(<DxQuery />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run the query' }))
    expect((await screen.findByText('Left out: not agreed')).parentElement).toHaveTextContent('4')
    expect(screen.getByText('MDM-1')).toBeInTheDocument()
    expect(screen.getByText('80 to 89')).toBeInTheDocument()
    expect(bodies[0]).toMatchObject({ requester: 'pension', purpose: 'PENSION_ELIGIBILITY', elements: ['age'] })
  })

  it('explains a refusal for being too broad', async () => {
    globalThis.fetch = route({ '/x/purposes': purposes, '/x/query': { outcome: 'DENIED_POLICY', message: 'Too broad: 9000 people match', ledger_id: 3 } })
    wrap(<DxQuery />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run the query' }))
    expect(await screen.findByText(/Too broad/)).toBeInTheDocument()
  })
})

describe('Discrepancies', () => {
  const item = { id: 4, kind: 'DISCREPANCY', person_id: 2, person_name: 'Sita Devi', attribute: 'name', current_value: 'Sitha', reported_value: 'Sita', status: 'ROUTED', authoritative_name: 'Civil registration', raised_at: '2026-10-26T10:00:00Z', age_days: 1, raised_by: 'officer', informed: [] }
  it('closes a report only with what the department said, and states that nothing is overwritten', async () => {
    const posted = []
    globalThis.fetch = route({
      '/x/discrepancies/4/resolve': (u, init) => { posted.push(JSON.parse(init.body)); return json({ status: 'CORRECTED_AT_SOURCE' }) },
      '/x/discrepancies': { total: 1, items: [item], by_status: { ROUTED: 1 } },
    })
    wrap(<DxDiscrepancies />)
    expect(screen.getByText(/never overwrites it locally/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Close…' }))
    fireEvent.change(screen.getByLabelText(/What it said/), { target: { value: 'CRS corrected the name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close this item' }))
    await waitFor(() => expect(posted).toEqual([{ outcome: 'CORRECTED_AT_SOURCE', note: 'CRS corrected the name' }]))
  })
})

describe('Audit explorer', () => {
  it('shows detection and restoration in the tamper test', async () => {
    globalThis.fetch = route({
      '/audit/verify': { ok: true, checked: 400 },
      '/x/audit/tamper-demo': { edited_seq: 200, before: { ok: true }, while_edited: { ok: false, broken_at: 200 }, after_rollback: { ok: true } },
      '/x/audit': { total: 1, items: [{ seq: 1, ts: '2026-10-27T10:00:00Z', actor: 'a', action: 'PURGE', subject: 'retention', detail: {}, hash: 'abc' }] },
    })
    wrap(<DxAudit />)
    expect(await screen.findByText(/Chain intact/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run the tamper test' }))
    expect(await screen.findByText(/broken at entry 200/)).toBeInTheDocument()
    const list = screen.getByLabelText('Tamper test result')
    expect(list).toHaveTextContent('After undoing it: intact')
  })
})

describe('Data standards', () => {
  it('normalises and compares two addresses', async () => {
    globalThis.fetch = route({
      '/x/standards/test': { kind: 'address', house_number: '4', normalised: 'gandhi nagar colony', compared_with: { normalised: 'gandhi nagar colony', house_number: '4', text_similarity: 1, verdict: 'Likely the same place' } },
      '/x/standards': { standards: [{ id: 'S1', element: 'Name', standard: 'Skeleton', example: 'x' }] },
    })
    wrap(<DxStandards />)
    fireEvent.click(await screen.findByRole('button', { name: 'Normalise' }))
    expect(await screen.findByText('Likely the same place')).toBeInTheDocument()
  })
})

describe('Household', () => {
  it('lists members and the limits of the view', async () => {
    globalThis.fetch = route({ '/x/persons/5/household': {
      person: { id: 5, name: 'Raju', mdm_id: 'M5' }, cards: ['RC-1'],
      members: [{ id: 5, mdm_id: 'M5', name: 'Raju', age: 40, relation: 'Head', tenant: true, is_selected: true, electricity: false, housing: false, land: false, life_status: 'NO_DEATH_RECORD' }],
      caveats: ['A ration card is a proxy for a household.', 'At least one card holder is marked as a tenant.'],
    } })
    wrap(<DxHousehold />, '/dx/household?person=5')
    expect((await screen.findAllByText('Tenant')).length).toBe(2)   // column heading and the badge
    expect(screen.getByText(/proxy for a household/)).toBeInTheDocument()
  })
})

describe('Retention', () => {
  it('shows what a withdrawal stops and what remains', async () => {
    globalThis.fetch = route({
      '/x/retention': { classes: [{ data: 'Audit log', kept: 'Longest', count: 10, purge: 'Never' }], policy: {} },
      '/x/purposes': [], 
    })
    wrap(<DxRetention />)
    expect(await screen.findByText('Audit log')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw and purge' })).toBeDisabled()
  })
})

describe('Registry', () => {
  it('separates statutory uses from consent-based ones', async () => {
    globalThis.fetch = route({ '/x/registry': { sources: [], purposes: [
      { purpose: 'PENSION_ELIGIBILITY', name: 'Pension', use_case: 'UC3', requester: 'Pension', consent_required: false, elements: ['age'], consents: {} },
      { purpose: 'SCHOLARSHIP_ELIGIBILITY', name: 'Scholarship', use_case: 'UC4', requester: 'Education', consent_required: true, elements: ['income_band'], consents: { GRANTED: 2 } },
    ] } })
    wrap(<DxRegistry />)
    expect((await screen.findAllByText('Not needed (statutory)')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0)
  })
})
