import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxControl from './DxControl'
import DxQuery from './DxQuery'
import DxDiscrepancies from './DxDiscrepancies'
import DxAudit from './DxAudit'
import DxStandards from './DxStandards'
import DxRetention from './DxRetention'
import DxCatalogue, { DxRegistry } from './DxCatalogue'

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
    fireEvent.click(await screen.findByRole('button', { name: 'Overview' }))   // the Control Tower opens on the Flow board
    expect((await screen.findAllByText('Offline')).length).toBeGreaterThan(0)
    expect(screen.getByText('Intact')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bring back' }))
    await waitFor(() => expect(posted).toEqual([{ available: true, note: null }]))
    expect(await screen.findByText(/1 sent, 0 still retrying/)).toBeInTheDocument()
  })

  it('offers to send a set-aside item again', async () => {
    globalThis.fetch = route({ '/x/control': control({ dead_letters: 1 }), '/x/deliveries': { total: 1, items: [{ id: 9, status: 'DEAD_LETTER', system: 'health', purpose: 'BIRTH_HEALTH', attempts: 3, updated_at: '2026-10-27T10:00:00Z' }] } })
    wrap(<DxControl />)
    fireEvent.click(await screen.findByRole('button', { name: 'Overview' }))   // the Control Tower opens on the Flow board
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

describe('Report a wrong value', () => {
  it('fills "Shown now" from the golden record, follows the chosen value, and shows the spouse on record', async () => {
    globalThis.fetch = route({
      '/persons/7': { person: { id: 7, name: 'Anil Chakali', dob: '1985-07-21' }, attributes: [{ attribute: 'name', value: 'Anil Chakali' }, { attribute: 'dob', value: '1985-07-21' }, { attribute: 'address', value: '46 Ambedkar Nagar, Narketpally' }],
        relationships: [{ kind: 'SPOUSE', role_of_other: 'SPOUSE', other: { id: 8, name: 'Lakshmi Chakali' }, source: 'marriage_register' }], records: [], issues: [], audit: [], missing_sources: [] },
      '/x/discrepancies': { total: 0, items: [], by_status: {} },
    })
    wrap(<DxDiscrepancies />, '/dx/discrepancies?person=7')
    await waitFor(() => expect(screen.getByLabelText('Shown now')).toHaveValue('Anil Chakali'))
    fireEvent.change(screen.getByLabelText('Which value'), { target: { value: 'date_of_birth' } })
    await waitFor(() => expect(screen.getByLabelText('Shown now')).toHaveValue('1985-07-21'))
    fireEvent.change(screen.getByLabelText('Which value'), { target: { value: 'address' } })
    await waitFor(() => expect(screen.getByLabelText('Shown now')).toHaveValue('46 Ambedkar Nagar, Narketpally'))
    expect(await screen.findByText('Lakshmi Chakali')).toBeInTheDocument()
    expect(screen.getByText(/Spouse on record/)).toBeInTheDocument()
    expect((await screen.findAllByText(/Anil Chakali/)).length).toBeGreaterThan(0)
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

describe('Audit explorer filters', () => {
  it('offers who and action lists, a date range, sortable headers and a page size', async () => {
    const calls = []
    const base = route({
      '/audit/verify': { ok: true, checked: 400 },
      '/x/audit/facets': { actors: [{ value: 'steward-1', n: 3 }, { value: 'system', n: 9 }], actions: [{ value: 'REVIEW_DECIDED', n: 4 }, { value: 'POLICY_CHANGED', n: 8 }], range: { first: '2026-10-01T00:00:00Z', last: '2026-10-30T00:00:00Z' } },
      '/x/audit': { total: 120, items: [{ seq: 5, ts: '2026-10-27T10:00:00Z', actor: 'steward-1', action: 'REVIEW_DECIDED', subject: 'person:1', detail: {}, hash: 'abc' }] },
    })
    globalThis.fetch = (u, o) => { calls.push(String(u)); return base(u, o) }
    wrap(<DxAudit />)
    fireEvent.change(await screen.findByLabelText('Who'), { target: { value: 'steward-1' } })
    await waitFor(() => expect(calls.some((c) => c.includes('actor_is=steward-1'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'REVIEW_DECIDED' } })
    await waitFor(() => expect(calls.some((c) => c.includes('action_is=REVIEW_DECIDED'))).toBe(true))
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-01' } })
    await waitFor(() => expect(calls.some((c) => c.includes('date_from=2026-10-01'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /^Who/ }))
    await waitFor(() => expect(calls.some((c) => c.includes('sort=actor') && c.includes('dir=asc'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } })
    await waitFor(() => expect(calls.some((c) => c.includes('limit=50'))).toBe(true))
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

  it('catalogue: selecting a source narrows the data elements to what it supplies, and names match in both places', async () => {
    globalThis.fetch = route({ '/x/catalogue': { attribute_owners: {},
      sources: [
        { source: 'crs', name: 'Civil registration (CRS)', interface: 'REST API', freshness_hours: 0, records: 10, latest_as_of: '2026-06-20', owner: 'Civil registration', state: 'CURRENT', elements: ['age'] },
        { source: 'revenue_land', name: 'Revenue: land records', interface: 'REST API', freshness_hours: 8760, records: 5, latest_as_of: '2026-05-20', owner: 'Revenue', state: 'STALE', elements: ['land_holding'] },
        { source: 'pension_batch', name: 'Social security / pension MIS', interface: 'Batch', freshness_hours: 24, records: 3, latest_as_of: null, owner: 'Pension', state: 'UNDATED', elements: [] },
      ],
      elements: [
        { element: 'age', name: 'Age', authoritative: 'Civil registration (CRS)', source: 'crs', sensitivity: 'LOW', queryable: true, purposes: [] },
        { element: 'land_holding', name: 'Land held', authoritative: 'Revenue: land records', source: 'revenue_land', sensitivity: 'HIGH', queryable: true, purposes: [] },
      ] } })
    wrap(<DxCatalogue />)
    expect(await screen.findByText('Land held')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Revenue: land records: 1 data element/ }))
    await waitFor(() => expect(screen.queryByText('Age')).toBeNull())
    expect(screen.getByText('Land held')).toBeInTheDocument()
    expect(screen.getByText('Data elements from Revenue: land records')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Revenue: land records: 1 data element/ }))
    expect(await screen.findByText('Age')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details of Social security / pension MIS' }))
    expect(await screen.findByText(/not the source of truth for any element/)).toBeInTheDocument()
  })
})
