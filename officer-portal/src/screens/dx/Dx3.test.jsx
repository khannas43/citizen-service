import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxConnectors from './DxConnectors'
import DxKeys from './DxKeys'
import DxAccess from './DxAccess'
import DxApiExplorer from './DxApiExplorer'
import DxMyData, { DxMyConsents, DxReportWrong } from './DxCitizen'
import DxAssisted from './DxAssisted'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })
const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})
const wrap = (el, at = '/') => render(<MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>)

const meta = { auth_methods: { MTLS_KEY: 'Mutual TLS plus API key' }, elements: ['name', 'identity_reference'], systems: { housing: 'Housing' }, items: [
  { id: 1, source: 'pds_view', name: 'Civil supplies (PDS)', system_name: 'Civil supplies', auth_name: 'Read-only database view', interface: 'views', records: 3183, status: 'ACTIVE' },
  { id: 2, source: 'water', name: 'Water board', system_name: 'Housing', auth_name: 'Mutual TLS plus API key', interface: 'REST', records: 0, status: 'DRAFT' }] }
const detail = (o = {}) => ({ id: 2, name: 'Water board', status: 'TESTING', system_name: 'Housing', auth_name: 'x', interface: 'REST', mapping: { cust: 'name' }, available: true, last_test: { ok: true, checks: [{ check: 'Says whose record it is (name)', ok: true, note: '' }] },
  stats: { records: 0, latest_as_of: null, waiting_for_steward: 0, open_quality_issues: 0 }, deliveries: {}, log: [{ ts: '2026-10-28T10:00:00Z', actor: 'a', action: 'TESTED', detail: {} }], ...o })

describe('Connectors', () => {
  it('pre-fills a reason, refuses a too-short one, and records the reason', async () => {
    const posted = []
    globalThis.fetch = route({ '/x/connectors/2/state': (u, init) => { posted.push(JSON.parse(init.body)); return json(detail({ status: 'ACTIVE' })) }, '/x/connectors/2': detail(), '/x/connectors': meta })
    wrap(<DxConnectors />, '/dx/connectors?id=2')
    const live = await screen.findByRole('button', { name: 'Make live' })
    const box = screen.getByLabelText(/Reason \(recorded/)
    expect(box).toHaveValue('Checks passed; approved to go live.')
    expect(live).toBeEnabled()
    fireEvent.change(box, { target: { value: 'short' } })
    expect(live).toBeDisabled()
    fireEvent.change(box, { target: { value: 'Tested with the department' } })
    expect(live).toBeEnabled()
    fireEvent.click(live)
    await waitFor(() => expect(posted).toEqual([{ action: 'ACTIVATE', reason: 'Tested with the department' }]))
    expect(screen.getByText('Says whose record it is (name)', { exact: false })).toBeInTheDocument()
  })
  it('lists existing feeds as live', async () => {
    globalThis.fetch = route({ '/x/connectors': meta })
    wrap(<DxConnectors />)
    expect(await screen.findByText('Civil supplies (PDS)')).toBeInTheDocument()
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
  })
})

describe('Keys', () => {
  const purposes = [{ code: 'SCHOLARSHIP_ELIGIBILITY', name: 'Scholarship', system: 'education', system_name: 'Education' }]
  it('shows a new key once, with a warning to copy it', async () => {
    globalThis.fetch = route({ '/x/purposes': purposes, '/x/keys': (u, init) => (init.method === 'POST' ? json({ key_id: 'k1', key: 'k1.SECRETVALUE', scopes: [] }) : json([])) })
    wrap(<DxKeys />)
    fireEvent.click(await screen.findByRole('button', { name: 'Issue a key' }))
    fireEvent.click(await screen.findByLabelText('Scholarship'))
    fireEvent.click(screen.getByRole('button', { name: 'Issue the key' }))
    expect(await screen.findByText('k1.SECRETVALUE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I have copied it' }))
    expect(screen.queryByText('k1.SECRETVALUE')).not.toBeInTheDocument()
  })
  it('needs a reason to revoke', async () => {
    const key = { key_id: 'k9', system: 'education', system_name: 'Education', label: 'x', scopes: ['SCHOLARSHIP_ELIGIBILITY'], status: 'ACTIVE', expired: false, expires_at: '2027-01-01T00:00:00Z', last_used_at: null, use_count: 0 }
    globalThis.fetch = route({ '/x/purposes': purposes, '/x/keys': [key] })
    wrap(<DxKeys />)
    const revoke = await screen.findByRole('button', { name: 'Revoke' })
    expect(revoke).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason to revoke k9'), { target: { value: 'Department asked us to' } })
    expect(revoke).toBeEnabled()
  })
})

describe('Access', () => {
  it('shows activity and stops a user only with a reason', async () => {
    const posted = []
    globalThis.fetch = route({
      '/x/access/block': (u, init) => { posted.push(JSON.parse(init.body)); return json({}) },
      '/x/access': { limit_per_hour: 10, roles: [{ role: 'Admin', who: ['ADMIN'], can: 'x' }], blocks: [], alerts: [], activity: [{ actor: 'officer1', lookups: 40, people: 2, refused: 3, blocked: false }] },
    })
    wrap(<DxAccess />)
    fireEvent.click(await screen.findByRole('button', { name: 'Stop access…' }))
    const stop = screen.getByRole('button', { name: 'Stop access' })
    expect(stop).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason \(recorded\)/), { target: { value: 'Repeated lookups of one person' } })
    fireEvent.click(stop)
    await waitFor(() => expect(posted).toEqual([{ actor: 'officer1', reason: 'Repeated lookups of one person' }]))
  })
})

describe('API explorer', () => {
  it('sends the key in a header and shows the response', async () => {
    const seen = []
    globalThis.fetch = route({ '/api/partner/verify': (u, init) => { seen.push(init.headers['X-Api-Key']); return json({ outcome: 'ANSWERED', answer: 'YES' }) } })
    wrap(<DxApiExplorer />)
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'k1.abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the question' }))
    expect(await screen.findByLabelText('Response')).toHaveTextContent('"outcome": "ANSWERED"')
    expect(seen).toEqual(['k1.abc'])
  })
})

const me = { person: { id: 1, name: 'Sita Devi', dob: '1980-01-01', gender: 'F', district: 'Medak', address: '4 Main Rd' }, note: 'This is everything the master record holds about you',
  held: [{ source: 'pds_view', source_name: 'Civil supplies (PDS)', kind: 'CARD_MEMBER', as_of: '2026-05-01', details: { ration_card: 'RC-1' }, address: null }],
  consents: [{ id: 7, purpose: 'SCHOLARSHIP_ELIGIBILITY', purpose_name: 'Scholarship', system_name: 'Education', status: 'PENDING' }, { id: 8, purpose: 'X', purpose_name: 'Health', system_name: 'Health', status: 'GRANTED', expires_at: '2027-01-01T00:00:00Z' }],
  reports: [], asked: [{ id: 1, ts: '2026-10-27T10:00:00Z', kind: 'VERIFY', requester: 'education', question: 'INCOME_AT_MOST', outcome: 'ANSWERED' }] }

describe('Citizen views', () => {
  it('shows their own data and who has asked', async () => {
    globalThis.fetch = route({ '/x/citizen/TOK': me })
    wrap(<DxMyData />, '/dx/citizen?token=TOK')
    expect(await screen.findByText('Sita Devi')).toBeInTheDocument()
    expect(screen.getByText('Civil supplies (PDS)')).toBeInTheDocument()
    expect(screen.getByText(/Who has asked about me/)).toBeInTheDocument()
  })
  it('answers and withdraws consent, marked as assisted when an operator is present', async () => {
    const calls = []
    globalThis.fetch = route({ '/consents/': (u, init) => { calls.push([u, JSON.parse(init.body)]); return json({}) }, '/x/citizen/TOK': me })
    wrap(<DxMyConsents />, '/dx/citizen/consents?token=TOK&operator=Operator%205')
    expect(await screen.findByText(/acting with operator/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I do not agree' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0][1]).toMatchObject({ decision: 'REFUSE', channel: 'ASSISTED', operator: 'Operator 5' })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw my consent' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1][0]).toContain('/consents/8/withdraw')
  })
  it('sends a report to the owner and says nothing is changed directly', async () => {
    const calls = []
    globalThis.fetch = route({ '/report': (u, init) => { calls.push(JSON.parse(init.body)); return json({ note: 'Sent to Civil supplies.' }) }, '/x/citizen/TOK': me })
    wrap(<DxReportWrong />, '/dx/citizen/report?token=TOK')
    expect(await screen.findByText(/Nothing is changed in this system directly/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('It should be'), { target: { value: 'New address' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send my report' }))
    expect(await screen.findByText('Sent to Civil supplies.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ attribute: 'name', reported_value: 'New address', channel: 'PORTAL' })
  })
  it('asks who the citizen is when no reference is given', async () => {
    globalThis.fetch = route({})
    wrap(<DxMyData />, '/dx/citizen')
    expect(await screen.findByLabelText('Choose the citizen')).toBeInTheDocument()
  })
})

describe('Assisted channel', () => {
  it('needs an operator and a citizen before a visit can start', async () => {
    globalThis.fetch = route({ '/x/sessions': [] })
    wrap(<DxAssisted />)
    expect(await screen.findByText('Recent visits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start the visit' })).toBeDisabled()
  })
})
