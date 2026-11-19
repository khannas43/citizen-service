import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxApprovals from './DxApprovals'
import DxPolicy, { show } from './DxPolicy'
import DxEvents from './DxEvents'
import { Explain } from './DxVerify'

afterEach(cleanup)

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})

const proposal = (o = {}) => ({
  id: 7, event_id: 3, uc: 'UC3', kind: 'STOP_PENSION', system: 'Social security / pension MIS', person_name: 'Yellamma Gowd', status: 'PROPOSED',
  summary: 'Stop the OLD_AGE pension for Yellamma Gowd', detail: {}, options: [], needs_rationale: true, gate: null, ...o,
})

describe('Approvals', () => {
  beforeEach(() => { localStorage.setItem('officer_token', 'tok') })

  it('will not approve a sensitive action without a reason of the required length', async () => {
    globalThis.fetch = route({ '/x/approvals': { total: 1, items: [proposal()], by_system: [{ system: 'Social security / pension MIS', n: 1 }], rationale_min_chars: 10 } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    const approve = await screen.findByRole('button', { name: 'Approve' })
    expect(approve).toBeDisabled()
    expect(screen.getByTestId('why-not')).toHaveTextContent(/at least 10 characters/)          // says why Approve is unavailable
    expect(screen.getByText(/Reason \(required, at least 10 characters\)/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Checked with the family' } })
    expect(approve).toBeEnabled()
  })

  it('holds back a birth action until the parent has consented', async () => {
    const gated = proposal({ kind: 'ADD_TO_RATION_CARD', needs_rationale: false, summary: 'Add Baby to ration card TG-RC-1',
      gate: { purpose: 'BIRTH_PDS', purpose_name: "Add the child to the family's ration card", status: 'PENDING', consent_id: 4 } })
    globalThis.fetch = route({ '/x/approvals': { total: 1, items: [gated], by_system: [], rationale_min_chars: 10 } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText(/Waiting for consent from the parent/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByTestId('why-not')).toHaveTextContent(/Approval is unavailable until the parent grants the consent/)
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('explains what approving or rejecting a department rejection does', async () => {
    globalThis.fetch = route({ '/x/approvals': { total: 1, by_system: [], rationale_min_chars: 10, items: [proposal({ kind: 'REVIEW_DEPARTMENT_REJECTION', needs_rationale: false, detail: { department: 'Civil supplies (PDS)' }, summary: 'Civil supplies (PDS) rejected the notice' })] } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText(/sends the notice to Civil supplies \(PDS\) again/)).toBeInTheDocument()
  })

  it('shows the department answer on an approved ration card action that went through the consent', async () => {
    globalThis.fetch = route({ '/x/approvals': { total: 1, by_system: [], rationale_min_chars: 10, items: [proposal({ status: 'APPROVED', kind: 'ADD_TO_RATION_CARD', needs_rationale: false,
      dept: { department: null, consent_notice: { department: 'Civil supplies (PDS)', state: 'REJECTED', outcome: 'REJECTED', reason: 'Card is frozen', revision: 1 } } })] } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(await screen.findByText(/answered: rejected \("Card is frozen"\)/)).toBeInTheDocument()
    expect(screen.getByText(/back with a person for review/)).toBeInTheDocument()
    expect(screen.getByText(/rejected by the department/)).toBeInTheDocument()          // the one status line says whose decision is whose
  })

  it('will not approve an action over a department rejection that a person has not yet decided', async () => {
    const held = proposal({ kind: 'ADD_TO_RATION_CARD', needs_rationale: false, summary: 'Add Baby to ration card',
      gate: { purpose: 'BIRTH_PDS', purpose_name: 'Ration card', status: 'GRANTED', held: 'Civil supplies (PDS) rejected the notice for this (Already on our register). Decide on the review item first; approving here is unavailable until then.' } })
    globalThis.fetch = route({ '/x/approvals': { total: 1, items: [held], by_system: [], rationale_min_chars: 10 } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findAllByText(/Decide on the review item first/)).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('says what happened after a rejection', async () => {
    globalThis.fetch = route({
      '/x/approvals': { total: 1, items: [proposal({ needs_rationale: false, summary: 'Add Baby to ration card' })], by_system: [], rationale_min_chars: 10 },
      '/proposals/7/decision': () => json({ ok: true }),
    })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    expect(await screen.findByText(/Rejected: Add Baby to ration card/)).toBeInTheDocument()
  })

  it('sends the reason with the decision and shows an error from the service', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/approvals': { total: 1, items: [proposal()], by_system: [], rationale_min_chars: 10 },
      '/proposals/7/decision': (u, init) => { calls.push(JSON.parse(init.body)); return json({ detail: 'Waiting for something' }, false, 409) },
    })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
    fireEvent.change(await screen.findByLabelText(/Reason \(required/), { target: { value: 'Death certificate seen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Waiting for something'))
    expect(calls[0]).toMatchObject({ decision: 'APPROVE', note: 'Death certificate seen' })
  })
})

describe('Policy', () => {
  it('shows what a change would touch before it is applied', async () => {
    const posted = []
    globalThis.fetch = route({
      '/x/policy/preview': { lines: ['3 open proposal(s) keep the policy version they were created under. New requests use the new value at once.', 'Marriage records below the minimum age: 32 now, 40 after the change.'] },
      '/x/policy': (u, init) => (init.method === 'POST' ? (posted.push(JSON.parse(init.body)), json({ version: 2 })) : json({ policies: [
        { key: 'min_marriage_age', value: { M: 21, F: 18 }, version: 1, changed_by: 'system', changed_at: '2026-10-27T10:00:00Z', description: 'Legal minimum', versions: 1 },
        { key: 'adult_age', value: 18, version: 1, changed_by: 'system', changed_at: '2026-10-27T10:00:00Z', description: 'Adult age', versions: 1 },
      ] })),
    })
    render(<MemoryRouter><DxPolicy /></MemoryRouter>)
    expect(await screen.findByText('Men 21, women 18')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Show what it would change' }))
    expect(await screen.findByText(/32 now, 40 after the change/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply the change' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ key: 'min_marriage_age', value: { M: 21, F: 18 } })
  })

  it('describes values in plain words', () => {
    expect(show('income_band_edges', [100000, 250000])).toBe('1 lakh, 2.5 lakh')
    expect(show('rationale_required_kinds', ['STOP_PENSION'])).toBe('Stop a pension')
  })
})

describe('Verification result', () => {
  it('returns only the outcome and says so', () => {
    render(<Explain r={{ outcome: 'ANSWERED', answer: 'YES', band: '1 lakh to 2 lakh', valid_until: '2027-06-30', source: 'Revenue', ledger_id: 12, consent_id: 3, policy_versions: { adult_age: 1 } }} />)
    expect(screen.getByText('YES')).toBeInTheDocument()
    expect(screen.getByText('1 lakh to 2 lakh')).toBeInTheDocument()
    expect(screen.getByText(/Only the outcome is returned/)).toBeInTheDocument()
  })

  it('treats "no record" as its own answer, never as a no', () => {
    render(<Explain r={{ outcome: 'NO_RECORD', message: 'No income certificate is held for this person in Telangana.', ledger_id: 1, policy_versions: {} }} />)
    expect(screen.getByText('No record')).toBeInTheDocument()
    expect(screen.queryByText('NO')).not.toBeInTheDocument()
  })
})

describe('Event stream', () => {
  it('shows what happened for each department', async () => {
    localStorage.setItem('officer_token', 'tok')
    globalThis.fetch = route({
      '/x/deliveries': { total: 4, items: [], by_status: { DELIVERED: 2, PENDING_CONSENT: 1, BLOCKED_REFUSED: 1 } },
      '/x/events': { total: 1, limit: 25, offset: 0, by_status: {}, items: [{ id: 1, event_key: 'B-1', event_type: 'BIRTH_REGISTERED', status: 'PROCESSED', payload: { child_name: 'Baby', date_of_birth: '2026-06-01' }, received_at: '2026-10-27T10:00:00Z', delivered: 2, waiting: 1, blocked: 1, open_proposals: 2 }] },
    })
    render(<MemoryRouter><DxEvents /></MemoryRouter>)
    expect(await screen.findByText('2 sent')).toBeInTheDocument()
    expect(screen.getByText('1 waiting for consent')).toBeInTheDocument()
    expect(screen.getByText('Waiting for consent')).toBeInTheDocument()
  })

  it('shows the citizen first, linked to the person page, one link per person for a marriage', async () => {
    localStorage.setItem('officer_token', 'tok')
    globalThis.fetch = route({
      '/x/deliveries': { total: 0, items: [], by_status: {} },
      '/x/events': { total: 2, limit: 15, offset: 0, by_status: {}, items: [
        { id: 1, event_key: 'M-1', event_type: 'MARRIAGE_REGISTERED', status: 'PROCESSED', payload: {}, received_at: '2026-10-27T10:00:00Z', people: [{ role: 'BRIDE', name: 'Pooja Madavi', person_id: 7 }, { role: 'GROOM', name: 'Naresh Goud', person_id: null }] },
        { id: 2, event_key: 'B-2', event_type: 'BIRTH_REGISTERED', status: 'PROCESSED', payload: {}, received_at: '2026-10-27T10:00:00Z', people: [] }] },
    })
    render(<MemoryRouter><DxEvents /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Pooja Madavi' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Naresh Goud' })).toBeNull()
    expect(screen.getByText('Naresh Goud')).toBeInTheDocument()
    expect(screen.getByText('Not matched')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('Citizen')
  })

  it('plays the sample feed by itself when the page opens, with no button, and filters by date', async () => {
    localStorage.setItem('officer_token', 'tok')
    const calls = []
    const base = route({ '/events/replay': () => ({ ok: true, status: 200, json: async () => ({ events: 34, outcomes: {} }) }),
      '/x/deliveries': { total: 0, items: [], by_status: {} }, '/x/events': { total: 1, limit: 15, offset: 0, items: [{ id: 1, event_key: 'K', event_type: 'BIRTH_REGISTERED', status: 'PROCESSED', received_at: '2026-10-30T10:00:00Z', payload: {} }] } })
    globalThis.fetch = (u, o) => { calls.push(`${o?.method || 'GET'} ${u}`); return base(u, o) }
    render(<MemoryRouter><DxEvents /></MemoryRouter>)
    await screen.findByLabelText('From date')
    expect(screen.queryByRole('button', { name: /sample feed/i })).toBeNull()
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST') && c.includes('/events/replay'))).toBe(true))
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-10-31' } })
    await waitFor(() => expect(calls.some((c) => c.includes('date_from=2026-10-01') && c.includes('date_to=2026-10-31'))).toBe(true))
    cleanup()
    globalThis.fetch = route({ '/events/replay': () => ({ ok: false, status: 404, json: async () => ({ detail: 'No sample feed is available on the server.' }) }),
      '/x/deliveries': { total: 0, items: [], by_status: {} }, '/x/events': { total: 0, limit: 15, offset: 0, items: [] } })
    render(<MemoryRouter><DxEvents /></MemoryRouter>)
    expect(await screen.findByText('No sample feed is available on the server.')).toBeInTheDocument()
  })
})
