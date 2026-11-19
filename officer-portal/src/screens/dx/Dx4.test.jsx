import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxScenarios, { DxInjector, DxEvidence } from './DxDemo'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })
const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, blob: async () => new Blob(['x']) })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})
const wrap = (el) => render(<MemoryRouter>{el}</MemoryRouter>)

const cat = () => ({
  reference_date: '2026-06-21', runs: [],
  items: [
    { id: '2.2', uc: 'UC2', type: 'positive', title: 'Parent consents to some uses but not others', shows: 'Consent screen, consent record, audit entries naming the consent', last: { run_id: 7, status: 'PASS', checks: 4, passed: 4, gaps: 0, ms: 700, ran_at: '2026-10-28T10:00:00Z' } },
    { id: '2.3', uc: 'UC2', type: 'negative', title: 'Parent declines or does not respond', shows: 'Expired request', last: null },
    { id: '2.8', uc: 'UC2', type: 'step', title: 'Live step: the Health system goes down', shows: 'Waiting deliveries', last: null },
    { id: '2.9', uc: 'UC2', type: 'step', title: 'Live step: the Health system comes back', shows: 'Retries deliver', last: null },
    { id: '2.10', uc: 'UC2', type: 'step', title: 'Live step: a second child is registered late and without a name', shows: 'A held birth', last: null },
    { id: '2.11', uc: 'UC2', type: 'step', title: 'Live step: the name arrives', shows: 'Consent is asked now', last: null },
    { id: '2.12', uc: 'UC2', type: 'step', title: 'Live step: a third child is registered and the parent does not answer', shows: 'Waiting', last: null },
    { id: '2.13', uc: 'UC2', type: 'step', title: 'Live step: the response time runs out', shows: 'Expired', last: null },
    { id: '3.1', uc: 'UC3', type: 'positive', title: 'A death is registered; the surviving spouse is linked', shows: 'Proposal card', last: null },
    { id: '3.6', uc: 'UC3', type: 'step', title: 'Live step: a pensioner dies; his wife, ration card and land record are on file, a payment is due', shows: 'A proposal to confirm', last: null },
    { id: '3.7', uc: 'UC3', type: 'step', title: 'Live step: a pensioner with no spouse and no nominee dies', shows: 'Next of kin', last: null },
    { id: '3.8', uc: 'UC3', type: 'step', title: 'Live step: a death fits two living men with the same name', shows: 'No pre-selection', last: null },
    { id: '3.9', uc: 'UC3', type: 'step', title: 'Live step: a death outside the state for someone the registry does not hold', shows: 'No match', last: null },
    { id: '3.10', uc: 'UC3', type: 'step', title: 'Live step: the same death is sent a second time', shows: 'Duplicate ignored', last: null },
    { id: '4.1', uc: 'UC4', type: 'positive', title: 'Answer eligibility questions', shows: 'Query result', last: null },
    { id: '4.7', uc: 'UC4', type: 'step', title: 'Live step: the student applies and her parent is asked', shows: 'A consent card for the parent', last: null },
    { id: '4.8', uc: 'UC4', type: 'step', title: 'Live step: the student turns 18', shows: 'Her date of birth moves', last: null },
    { id: '5.5', uc: 'UC5', type: 'negative', title: 'Possible duplicate benefit', shows: 'Alert with minimal content', last: { run_id: 7, status: 'PARTIAL', checks: 3, passed: 3, gaps: 1, ms: 160, ran_at: '2026-10-28T10:00:00Z' } },
    { id: 'CC9', uc: 'CC', type: 'cross-cutting', title: 'Load smoke test', shows: 'Throughput and latency report', how: 'A short burst', last: null },
  ],
})
const run7 = { id: 7, results: [
  { scenario: '2.2', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'The department the parent agreed to receives the event' }, { ok: true, text: 'Step timings', info: true, data: { total_ms: 12 } }] },
  { scenario: '5.5', status: 'PARTIAL', error: null, gaps: ["The other department's decision step is not created as a task"], checks: [{ ok: true, text: 'A possible duplicate benefit is flagged' }] }] }

describe('Scenario runner', () => {
  it('lists every scenario with its last result and shows the evidence, including a gap, when opened', async () => {
    globalThis.fetch = route({ '/x/demo/runs/7': run7, '/x/demo/scenarios': cat() })
    wrap(<DxScenarios />)
    expect(await screen.findByText('Parent consents to some uses but not others')).toBeInTheDocument()
    expect(screen.getByText('Passed', { selector: '.mdm-badge' })).toBeInTheDocument()
    expect(screen.getByText('Met, with a gap', { selector: '.mdm-badge' })).toBeInTheDocument()
    expect(screen.getAllByText('Not run yet', { selector: '.mdm-badge' }).length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Possible duplicate benefit' }))
    expect(await screen.findByText('A possible duplicate benefit is flagged')).toBeInTheDocument()
    expect(screen.getByText(/decision step is not created as a task/)).toBeInTheDocument()
    expect(screen.getByText('Alert with minimal content', { exact: false })).toBeInTheDocument()
  })

  it('filters by group', async () => {
    globalThis.fetch = route({ '/x/demo/scenarios': cat() })
    wrap(<DxScenarios />)
    await screen.findByText('Load smoke test')
    fireEvent.click(screen.getByRole('tab', { name: 'UC5' }))
    expect(screen.queryByText('Load smoke test')).not.toBeInTheDocument()
    expect(screen.getByText('Possible duplicate benefit')).toBeInTheDocument()
  })

  it('runs one scenario step by step, then closes the run', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/demo/runs/9/finish': (u, i) => { calls.push('finish'); return json({ PASS: 1, total: 1 }) },
      '/x/demo/runs/9/scenarios/2.3': (u, i) => { calls.push('run 2.3 ' + i.method); return json({ scenario: '2.3', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'Reminders stop at the policy cap' }] }) },
      '/x/demo/runs': (u, i) => { calls.push('start ' + i.body); return json({ run_id: 9 }) },
      '/x/demo/scenarios': cat(),
    })
    wrap(<DxScenarios />)
    await screen.findByText('Parent declines or does not respond')
    fireEvent.click(screen.getByRole('button', { name: 'Run 2.3' }))
    expect(await screen.findByText('Reminders stop at the policy cap')).toBeInTheDocument()
    expect(calls).toEqual(['start {"kind":"2.3"}', 'run 2.3 POST', 'finish'])
  })

  it('asks before clearing demo records, and says what is kept', async () => {
    const posted = []
    globalThis.fetch = route({
      '/x/demo/reset': (u, i) => { posted.push(i.method); return json({ events: 26, records: 21, consents: 28, consents_for_demo_events: 44, ledger_rows: 5, ledger_rows_for_new_children: 6 }) },
      '/x/demo/scenarios': cat(),
    })
    wrap(<DxScenarios />)
    await screen.findByText('Load smoke test')
    fireEvent.click(screen.getByRole('button', { name: /Clear demo records/ }))
    const dlg = screen.getByRole('alertdialog')
    expect(within(dlg).getByText(/audit log, run history and policy history are kept/)).toBeInTheDocument()
    expect(posted).toEqual([])
    fireEvent.click(within(dlg).getByRole('button', { name: 'Yes, clear them' }))
    await waitFor(() => expect(posted).toEqual(['POST']))
    expect(await screen.findByText(/Cleared: 26 events, 21 records, 72 consents/)).toBeInTheDocument()
  })

  it('shows a failed check as not met, not as a pass', async () => {
    const c = cat()
    c.items[0].last = { run_id: 7, status: 'FAIL', checks: 2, passed: 1, gaps: 0, ms: 5, ran_at: '2026-10-28T10:00:00Z' }
    globalThis.fetch = route({ '/x/demo/runs/7': { id: 7, results: [{ scenario: '2.2', status: 'FAIL', error: null, gaps: [], checks: [{ ok: false, text: 'The department the parent refused receives nothing' }] }] }, '/x/demo/scenarios': c })
    wrap(<DxScenarios />)
    fireEvent.click(await screen.findByRole('button', { name: 'Parent consents to some uses but not others' }))
    expect(await screen.findByText('The department the parent refused receives nothing')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Not met' })).toBeInTheDocument()
    expect(screen.getByText('Failed', { selector: '.mdm-badge' })).toBeInTheDocument()
  })

  it('lists live demo steps separately and skips them when running a group', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/demo/runs/11/finish': () => { calls.push('finish'); return json({ PASS: 1, total: 1 }) },
      '/x/demo/runs/11/scenarios/4.1': () => { calls.push('run 4.1'); return json({ scenario: '4.1', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'ok' }] }) },
      '/x/demo/runs/12/finish': () => { calls.push('finish'); return json({ PASS: 2, total: 2 }) },
      '/x/demo/runs/12/scenarios/2.2': () => { calls.push('run 2.2'); return json({ scenario: '2.2', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'ok' }] }) },
      '/x/demo/runs/12/scenarios/2.3': () => { calls.push('run 2.3'); return json({ scenario: '2.3', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'ok' }] }) },
      '/x/demo/runs/13/finish': () => { calls.push('finish'); return json({ PASS: 1, total: 1 }) },
      '/x/demo/runs/13/scenarios/3.1': () => { calls.push('run 3.1'); return json({ scenario: '3.1', status: 'PASS', error: null, gaps: [], checks: [{ ok: true, text: 'ok' }] }) },
      '/x/demo/runs': (u, i) => {
        const kind = JSON.parse(i.body).kind
        calls.push(`start ${i.body}`)
        return json({ run_id: kind === 'UC2' ? 12 : kind === 'UC3' ? 13 : 11 })
      },
      '/x/demo/scenarios': cat(),
    })
    wrap(<DxScenarios />)
    expect(await screen.findByText('Live demo steps (run these one at a time during the demo)')).toBeInTheDocument()
    expect(screen.getByText(/These steps change the demo on purpose/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run 2.8' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run 4.7' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run 3.6' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'UC4' }))
    expect(screen.getByText('Answer eligibility questions')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run the UC4 group' }))
    await waitFor(() => expect(calls).toEqual(['start {"kind":"UC4"}', 'run 4.1', 'finish']))
    expect(calls.join(' ')).not.toMatch(/4\.7|4\.8/)

    calls.length = 0
    fireEvent.click(screen.getByRole('tab', { name: 'UC2' }))
    expect(screen.getByRole('button', { name: 'Run 2.8' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run the UC2 group' }))
    await waitFor(() => expect(calls).toEqual(['start {"kind":"UC2"}', 'run 2.2', 'run 2.3', 'finish']))
    expect(calls.join(' ')).not.toMatch(/2\.8|2\.9|2\.10|2\.11|2\.12|2\.13/)

    calls.length = 0
    fireEvent.click(screen.getByRole('tab', { name: 'UC3' }))
    expect(screen.getByRole('button', { name: 'Run 3.6' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run the UC3 group' }))
    await waitFor(() => expect(calls).toEqual(['start {"kind":"UC3"}', 'run 3.1', 'finish']))
    expect(calls.join(' ')).not.toMatch(/3\.6|3\.7|3\.8|3\.9|3\.10/)
  })
})

describe('Unscripted events', () => {
  const inj = { categories: [
    { id: 'DUPLICATE_BIRTH', group: 'Events', label: 'The same birth sent twice', expects: 'The second copy is ignored', params: [] },
    { id: 'DEPT_OUTAGE', group: 'Resilience', label: 'Take a department offline', expects: 'Deliveries are kept and retried', params: ['system'] }], log: [] }
  it('sends one event and shows what we expected next to what happened', async () => {
    const bodies = []
    globalThis.fetch = route({
      '/x/demo/injections': inj,
      '/x/demo/inject': (u, i) => { bodies.push(JSON.parse(i.body)); return json({ category: 'DEPT_OUTAGE', expected: 'Deliveries are kept and retried', observed: 'Health is now offline.' }) },
    })
    wrap(<DxInjector />)
    await screen.findByText('Take a department offline')
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'housing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inject: Take a department offline' }))
    await waitFor(() => expect(bodies).toEqual([{ category: 'DEPT_OUTAGE', params: { system: 'housing' } }]))
    const res = await screen.findByRole('status', { name: 'Result' })
    expect(within(res).getByText('Health is now offline.')).toBeInTheDocument()
    expect(within(res).getByText('We expected')).toBeInTheDocument()
  })
  it('shows an error from the service', async () => {
    globalThis.fetch = route({ '/x/demo/injections': inj, '/x/demo/inject': () => json({ detail: 'No granted consent to withdraw. Grant one first.' }, false, 409) })
    wrap(<DxInjector />)
    fireEvent.click(await screen.findByRole('button', { name: 'Inject: The same birth sent twice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No granted consent')
  })
})

describe('Evidence pack', () => {
  const pack = () => ({
    statement: 'No identity numbers are held.', scripted: { total: 44, counts: { PASS: 37, PARTIAL: 7, FAIL: 0, ERROR: 0, SKIPPED: 0 }, not_run: ['CC9'] },
    gaps: [{ scenario: '5.5', gap: "The other department's decision step is not created as a task." }],
    audit_chain: { ok: true, entries: 4000 }, load_tests: [{ id: 1, ts: '2026-10-28T10:00:00Z', requests: 200, rps: 190, p50_ms: 4, p95_ms: 9, errors: 0 }],
    written_evidence_ready: 0, written_evidence: [
      { item: 'hosting', title: 'Production hosting and data residency', requirement: 'Where the platform runs', status: 'NOT_STARTED', reference: null, owner: null, notes: null, updated_at: 'a' },
      { item: 'dr', title: 'High availability and disaster recovery', requirement: 'Recovery targets', status: 'NOT_STARTED', reference: null, owner: null, notes: null, updated_at: 'b' }] })
  it('summarises the runs, the chain check and the gaps, and warns about what has not run', async () => {
    globalThis.fetch = route({ '/x/demo/evidence': pack() })
    wrap(<DxEvidence />)
    expect(await screen.findByText('Intact')).toBeInTheDocument()
    expect(screen.getByText('37')).toBeInTheDocument()
    expect(screen.getByText(/Not run yet: CC9/)).toBeInTheDocument()
    expect(screen.getByText(/decision step is not created as a task/)).toBeInTheDocument()
    expect(screen.getByText('190')).toBeInTheDocument()
  })
  it('will not mark a document ready without saying where it is', async () => {
    const puts = []
    globalThis.fetch = route({
      '/x/demo/documents/dr': (u, i) => { puts.push(JSON.parse(i.body)); return json({ detail: 'Say where the document is (a reference or link) before marking it ready' }, false, 400) },
      '/x/demo/evidence': pack(),
    })
    wrap(<DxEvidence />)
    await screen.findByText('High availability and disaster recovery')
    fireEvent.change(screen.getByLabelText('Status of High availability and disaster recovery'), { target: { value: 'READY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save High availability and disaster recovery' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Say where the document is')
    expect(puts[0].status).toBe('READY')
  })
  it('downloads the pack as Markdown with the signed-in token', async () => {
    const seen = []
    const f = route({ '/x/demo/evidence.md': (u, i) => { seen.push([u, i.headers.Authorization]); return json('x') }, '/x/demo/evidence': pack() })
    globalThis.fetch = f
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    wrap(<DxEvidence />)
    fireEvent.click(await screen.findByRole('button', { name: /Markdown/ }))
    await waitFor(() => expect(seen.length).toBe(1))
    expect(seen[0][0]).toContain('/api/x/demo/evidence.md')
    expect(seen[0][1]).toBe('Bearer tok')
  })
})
