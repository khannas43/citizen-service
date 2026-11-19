import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxApprovals from './DxApprovals'
import { Drawer } from './dxKit'
import DxNotices from './DxNotices'
import DxResponseTimes from './DxResponseTimes'
import DxScenarios from './DxDemo'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table, calls = []) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  calls.push(`${init.method || 'GET'} ${u} ${init.body || ''}`)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})

const rule = (o) => ({ id: 1, scope: 'EVENT', key: 'BIRTH_REGISTERED', label: 'Birth registered', days: 7, day_kind: 'CALENDAR', text: '7 calendar days', version: 1, changed_by: 'system', changed_at: '2026-11-01T10:00:00Z', note: 'Default', ...o })
const RULES = {
  rules: [rule({ id: 8, scope: 'DEFAULT', key: '*', label: 'Anything not listed' }), rule({ id: 2 }),
    rule({ id: 3, key: 'DEATH_REGISTERED', label: 'Death registered', days: 2, day_kind: 'WORKING', text: '2 working days' }),
    rule({ id: 4, scope: 'USE', key: 'STOP_PENSION', label: 'Stop a pension after a death', days: 2, day_kind: 'WORKING', text: '2 working days', version: 2 })],
  addable_uses: [{ key: 'BIRTH_HEALTH', label: 'Health and immunisation schedule for the child' }], event_types: [], note: 'A rule for a specific use wins.',
}

describe('Response times', () => {
  it('lists a time for each event and an override for pension, and a change needs a reason', async () => {
    const calls = []
    globalThis.fetch = route({ '/x/response-rules': RULES, '/x/channels': { channels: [{ system: 'health', name: 'Health', channel: 'BOTH' }] } }, calls)
    render(<MemoryRouter><DxResponseTimes /></MemoryRouter>)
    expect(await screen.findByText('Birth registered')).toBeInTheDocument()
    expect(screen.getByText('Death registered')).toBeInTheDocument()
    expect(screen.getAllByText('2 working days')).toHaveLength(2)
    expect(screen.getByText('Specific use')).toBeInTheDocument()
    const row = screen.getByText('Birth registered').closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Change' }))
    const apply = await screen.findByRole('button', { name: 'Apply the change' })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Number of days'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Working days' }))
    expect(apply).toBeDisabled()                                   // still no reason
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Agreed with the department' } })
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    await waitFor(() => expect(calls.some((c) => c.startsWith('PUT') && c.includes('/x/response-rules'))).toBe(true))
    const put = calls.find((c) => c.startsWith('PUT'))
    expect(JSON.parse(put.slice(put.indexOf('{')))).toEqual({ scope: 'EVENT', key: 'BIRTH_REGISTERED', days: 5, day_kind: 'WORKING', note: 'Agreed with the department' })
  })

  it('refuses a number of days outside 1 to 90 before asking the server', async () => {
    globalThis.fetch = route({ '/x/response-rules': RULES, '/x/channels': { channels: [] } })
    render(<MemoryRouter><DxResponseTimes /></MemoryRouter>)
    fireEvent.click(within((await screen.findByText('Birth registered')).closest('tr')).getByRole('button', { name: 'Change' }))
    fireEvent.change(await screen.findByLabelText('Number of days'), { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'A good long reason' } })
    expect(screen.getByRole('button', { name: 'Apply the change' })).toBeDisabled()
  })

  it('adds a rule for one use and sets a department channel with a reason', async () => {
    const calls = []
    globalThis.fetch = route({ '/x/response-rules': RULES, '/x/channels': { channels: [{ system: 'health', name: 'Health', channel: 'BOTH', changed_by: null }] } }, calls)
    render(<MemoryRouter><DxResponseTimes /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a rule for a specific use' }))
    const add = await screen.findByRole('button', { name: 'Add this rule' })
    expect(add).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Which use or action'), { target: { value: 'BIRTH_HEALTH' } })
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Health wants a shorter time' } })
    expect(add).toBeEnabled()
    cleanup()
    render(<MemoryRouter><DxResponseTimes /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('tab', { name: /Department channels/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Portal only' }))
    fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Health uses the inbox' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply the change' }))
    await waitFor(() => expect(calls.some((c) => c.startsWith('PUT') && c.includes('/x/channels/health') && c.includes('PORTAL'))).toBe(true))
  })
})

const notice = (o = {}) => ({ id: 5, source: 'DELIVERY', system: 'health', system_name: 'Health', purpose: 'BIRTH_HEALTH', use_name: 'Health and immunisation schedule for the child',
  kind: 'EVENT', statutory: false, state: 'WAITING', outcome: null, respond_by: '2026-11-09T06:00:00Z', issued_at: '2026-11-02T06:00:00Z', rule_text: '7 calendar days',
  person_id: 19265, person_name: 'Pooja Madavi', event_id: 136, event_type: 'BIRTH_REGISTERED', allowed_outcomes: ['ACCEPTED', 'APPLIED', 'REJECTED'], ...o })

describe('Department notices', () => {
  it('shows the citizen as a link, the deadline and the state, and answers as the department with the rules applied', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/channels': { channels: [{ system: 'health', name: 'Health', channel: 'BOTH' }] },
      '/x/notices/5/simulate': () => json({ notice_id: 5, outcome: 'REJECTED', reopened_proposal: 77 }),
      '/x/notices': { total: 2, limit: 15, offset: 0, counts: { waiting: 1, overdue: 1, answered: 0, rejected: 0, total: 2 },
        items: [notice(), notice({ id: 6, state: 'OVERDUE', person_id: null, person_name: null, use_name: 'Stop a pension after a death', system_name: 'Pension', statutory: true, allowed_outcomes: ['ACKNOWLEDGED', 'APPLIED'] })] },
    }, calls)
    render(<MemoryRouter><DxNotices /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Pooja Madavi' })).toBeInTheDocument()
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(1)                // the tile and the badge
    expect(screen.getByText('Not matched')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0])
    expect(await screen.findByText(/stands in for Health's own system/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Reject'))
    const send = screen.getByRole('button', { name: 'Record this answer' })
    expect(send).toBeDisabled()                                    // a rejection needs a reason
    fireEvent.change(screen.getByLabelText('Reason for the rejection'), { target: { value: 'Already on our register' } })
    fireEvent.click(send)
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST') && c.includes('/x/notices/5/simulate') && c.includes('REJECTED'))).toBe(true))
    expect(await screen.findByText(/went back to a person for review/)).toBeInTheDocument()
  })

  it('offers only acknowledge or applied for a statutory notice', async () => {
    globalThis.fetch = route({
      '/x/channels': { channels: [] },
      '/x/notices': { total: 1, limit: 15, offset: 0, counts: { waiting: 1, overdue: 0, answered: 0, rejected: 0, total: 1 },
        items: [notice({ statutory: true, allowed_outcomes: ['ACKNOWLEDGED', 'APPLIED'], use_name: 'Stop a pension after a death' })] },
    })
    render(<MemoryRouter><DxNotices /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByLabelText('Acknowledge')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reject')).toBeNull()
  })
})

describe('Side panel', () => {
  it('keeps the cursor in a field while the page re-renders on every keystroke', () => {
    function Host() {
      const [v, setV] = useState('')
      return <Drawer open onClose={() => setV('')} title="Panel"><input aria-label="Note" value={v} onChange={(e) => setV(e.target.value)} /></Drawer>
    }
    render(<Host />)
    const box = screen.getByLabelText('Note')
    box.focus()
    fireEvent.change(box, { target: { value: 'a' } })
    fireEvent.change(box, { target: { value: 'ab' } })
    expect(box).toHaveValue('ab')
    expect(document.activeElement).toBe(box)                 // the panel must not take focus back while someone is typing
  })
})

describe('Answering in bulk', () => {
  it('answers everything waiting for a department, checks first, and lists the lines that were refused', async () => {
    const calls = []
    const res = (check) => ({ batch_ref: check ? null : 'BATCH-AB12CD34', check_only: check, route: 'SIMULATED', counts: { recorded: 3, unchanged: 0, refused: 1, skipped: 0, total: 4 },
      results: [{ line: 1, notice_id: 5, result: check ? 'WOULD_RECORD' : 'RECORDED', outcome: 'ACCEPTED' }, { line: 2, notice_id: 6, result: 'REFUSED', message: 'A statutory notice can only be acknowledged or applied' }] })
    globalThis.fetch = route({
      '/x/channels': { channels: [{ system: 'health', name: 'Health', channel: 'BOTH' }] },
      '/x/notices/answer-all': (u, init) => json(res(JSON.parse(init.body).check_only)),
      '/x/notices': { total: 1, limit: 15, offset: 0, counts: { waiting: 1, overdue: 0, answered: 0, rejected: 0, total: 1 }, items: [notice()] },
    }, calls)
    render(<MemoryRouter><DxNotices /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Answer in bulk (simulated)' }))
    const record = await screen.findByRole('button', { name: /Record for/ })
    expect(record).toBeDisabled()                                      // no department yet
    fireEvent.change(screen.getByLabelText('Department for the bulk answer'), { target: { value: 'health' } })
    fireEvent.click(screen.getByLabelText('Reject'))
    expect(screen.getByRole('button', { name: /Record for Health/ })).toBeDisabled()          // a rejection needs its one reason
    fireEvent.change(screen.getByLabelText('One reason for every rejection'), { target: { value: 'Not covered by the scheme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check only, record nothing' }))
    expect(await screen.findByText(/nothing was recorded/)).toBeInTheDocument()
    expect(screen.getByText('A statutory notice can only be acknowledged or applied')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Record for Health/ }))
    expect(await screen.findByText(/BATCH-AB12CD34/)).toBeInTheDocument()
    const posts = calls.filter((c) => c.startsWith('POST') && c.includes('answer-all'))
    expect(posts.length).toBe(2)
    expect(posts[0]).toContain('"check_only":true'); expect(posts[1]).toContain('"check_only":false'); expect(posts[1]).toContain('Not covered by the scheme')
  })

  it('takes a filled-in file with a shared reason or per-line reasons and shows the results', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/channels': { channels: [{ system: 'pds', name: 'Civil supplies (PDS)', channel: 'BOTH' }] },
      '/x/notices/file': () => json({ batch_ref: null, check_only: true, route: 'SIMULATED', counts: { recorded: 1, unchanged: 0, refused: 1, skipped: 0, total: 2 },
        results: [{ line: 2, notice_id: 4, result: 'REFUSED', message: 'A rejection needs a reason' }] }),
      '/x/notices': { total: 1, limit: 15, offset: 0, counts: { waiting: 1, overdue: 0, answered: 0, rejected: 0, total: 1 }, items: [notice()] },
    }, calls)
    render(<MemoryRouter><DxNotices /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Answer in bulk (simulated)' }))
    fireEvent.change(await screen.findByLabelText('Department for the bulk answer'), { target: { value: 'pds' } })
    fireEvent.click(screen.getByLabelText(/Answer from a file/))
    expect(screen.getByRole('button', { name: 'Download the open notices (CSV)' })).toBeEnabled()
    const go = screen.getByRole('button', { name: 'Check only, record nothing' })
    expect(go).toBeDisabled()                                          // no file chosen yet
    fireEvent.change(screen.getByLabelText('The filled-in CSV file'), { target: { files: [new File(['notice_id,outcome\n4,REJECTED\n'], 'answers.csv', { type: 'text/csv' })] } })
    fireEvent.click(screen.getByLabelText(/One reason for the whole file/))
    fireEvent.change(screen.getByLabelText('The shared reason for the file'), { target: { value: 'Duplicate record' } })
    await waitFor(() => expect(go).toBeEnabled())
    fireEvent.click(go)
    expect(await screen.findByText('A rejection needs a reason')).toBeInTheDocument()
    const post = calls.find((c) => c.startsWith('POST') && c.includes('/x/notices/file'))
    expect(post).toContain('system=pds'); expect(post).toContain('check_only=true'); expect(post).toContain('shared_reason=Duplicate+record')
  })
})

describe('Approvals with the department', () => {
  const p = (o) => ({ id: 7, event_id: 3, uc: 'UC3', kind: 'STOP_PENSION', system: 'Social security / pension MIS', person_name: 'Yellamma Gowd', status: 'PROPOSED',
    summary: 'Stop the OLD_AGE pension for Yellamma Gowd', detail: {}, options: [], needs_rationale: true, gate: null, ...o })
  it('says which department will act, how long it has, and shows a rejection sent back', async () => {
    globalThis.fetch = route({ '/x/approvals': { total: 2, by_system: [], rationale_min_chars: 10, items: [
      p({ dept: { department: 'Social security / pension MIS', respond_within: '2 working days', statutory: true, channel: 'BOTH' } }),
      p({ id: 8, summary: 'Add Baby to ration card', kind: 'ADD_TO_RATION_CARD', needs_rationale: false, dept: { department: 'Civil supplies (PDS)', respond_within: '7 calendar days', statutory: false },
        dept_return: { department: 'Civil supplies (PDS)', reason: 'Card is frozen' } })] } })
    render(<MemoryRouter><DxApprovals /></MemoryRouter>)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0])
    expect(await screen.findByText(/has 2 working days to answer/)).toBeInTheDocument()
    expect(screen.getByText(/cannot reject it/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Review' })[1])
    expect(await screen.findByText(/Sent back by Civil supplies/)).toBeInTheDocument()
    expect(screen.getByText(/Card is frozen/)).toBeInTheDocument()
  })
})

describe('Scenario to event links', () => {
  const item = (id, last = { run_id: 7, status: 'PASS', checks: 2, passed: 2, gaps: 0, ms: 10, ran_at: '2026-11-02T10:00:00Z' }) => ({ id, uc: 'UC2', type: 'positive', title: `Scenario ${id}`, shows: 'x', last })
  const res = (events) => ({ id: 7, results: [{ scenario: '2.2', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'A check' }], events }] })

  it('names the event a run created and links to its full trail and its case', async () => {
    globalThis.fetch = route({ '/x/demo/runs/7': res([{ id: 412, event_type: 'BIRTH_REGISTERED', event_key: 'DEMO-B-1', citizen: 'Demo Child 1', status: 'PROCESSED' }]), '/x/demo/scenarios': { reference_date: '2026-06-21', runs: [], items: [item('2.2')] } })
    render(<MemoryRouter><DxScenarios /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Scenario 2.2' }))
    expect(await screen.findByText('The event this run created')).toBeInTheDocument()
    expect(screen.getByText(/Birth registered · Demo Child 1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the full trail' })).toHaveAttribute('href', '/dx/lineage?tab=event&event=412')
    expect(screen.getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', '/dx/events?case=412')
  })

  it('lists every event of a scenario that created two', async () => {
    globalThis.fetch = route({ '/x/demo/runs/7': res([{ id: 1, event_type: 'BIRTH_REGISTERED', event_key: 'A', citizen: 'Child' }, { id: 2, event_type: 'BIRTH_AMENDED', event_key: 'A', citizen: 'Child' }]), '/x/demo/scenarios': { reference_date: '2026-06-21', runs: [], items: [item('2.2')] } })
    render(<MemoryRouter><DxScenarios /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Scenario 2.2' }))
    expect(await screen.findByText('The 2 events this run created')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Open the full trail' })).toHaveLength(2)
  })

  it('says so when the events were cleared', async () => {
    globalThis.fetch = route({ '/x/demo/runs/7': res([]), '/x/demo/scenarios': { reference_date: '2026-06-21', runs: [], items: [item('2.2')] } })
    render(<MemoryRouter><DxScenarios /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Scenario 2.2' }))
    expect(await screen.findByText(/No events from this run are left to open/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open the full trail' })).toBeNull()
  })

  it('opens the scenario named in the address (Back to scenario)', async () => {
    globalThis.fetch = route({ '/x/demo/runs/7': res([]), '/x/demo/scenarios': { reference_date: '2026-06-21', runs: [], items: [item('2.2')] } })
    render(<MemoryRouter initialEntries={['/dx/scenarios?open=2.2']}><DxScenarios /></MemoryRouter>)
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 }).catch(() => screen.findByText(/No events from this run/))).toBeTruthy()
  })
})
