import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DxLineage from './DxLineage'
import DxQuality from './DxQuality'
import DxStory from './DxStory'
import DxTour from './DxTour'

afterEach(cleanup)
beforeEach(() => { localStorage.setItem('officer_token', 'tok') })
const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const route = (table) => vi.fn(async (url, init = {}) => {
  const u = String(url)
  for (const [k, v] of Object.entries(table)) if (u.includes(k)) return typeof v === 'function' ? v(u, init) : json(v)
  return json({})
})
const wrap = (el, at = '/') => render(<MemoryRouter initialEntries={[at]}>{el}</MemoryRouter>)

const overview = {
  sources: [{ source: 'crs', name: 'Civil registration (CRS)', interface: 'REST API', records: 4082, persons: 3840, linked: 3931, in_review: 22, latest: '2026-06-10', loaded_at: '2026-10-27T10:00:00Z', open_issues: 0, connector: 'ACTIVE' }],
  core: { records: 16085, persons: 5716, golden_attributes: 20084, relationships: 3346, review_open: 863, last_load: { id: 37, finished_at: '2026-10-27T10:00:00Z', rule_version: 1 } },
  outputs: [{ kind: 'events', label: 'Life events published', count: 287 }],
  consumers: [{ system: 'pds', name: 'Civil supplies (PDS)', events_delivered: 17, events_total: 102, answers: 43 }],
}
const person = {
  person: { id: 7, mdm_id: 'MDM-00000007', name: 'A. Vaddera' }, summary: { systems: 2, records: 2, spellings: 2, conflicts: 1 },
  sources: [{ source: 'crs', name: 'Civil registration (CRS)', records: [{ id: 1, source_rid: 'CRS-EVT-1', name: 'Anil Vaddera', dob: '2006-07-24', link_status: 'ANCHOR', score: 0.9, load_id: 37, loaded_at: '2026-10-27T10:00:00Z', rule_version: 1 }] }],
  fields: [{ attribute: 'name', value: 'A. Vaddera', chosen_source: 'identity_reference', chosen_source_name: 'Identity reference service', rule: 'Latin-script name from the most trusted source', conflict: true, distinct_values: 2,
    offers: [{ source: 'identity_reference', source_name: 'Identity reference service', value: 'A. Vaddera', agrees: true, chosen: true }, { source: 'crs', source_name: 'Civil registration (CRS)', value: 'Anil Vaddera', agrees: false, chosen: false }] }],
}
const flow = { event: { id: 5 }, nodes: [{ id: 'src', kind: 'source', label: 'Civil registration (CRS)', link: '/dx/catalogue' }, { id: 'ev', kind: 'event', label: 'Birth Registered', status: 'PROCESSED', link: '/dx/events' },
  { id: 'audit', kind: 'audit', label: '3 audit entries', link: '/dx/audit' }], edges: [{ from: 'src', to: 'ev', label: 'published' }, { from: 'ev', to: 'audit', label: 'logged' }] }

describe('Data lineage', () => {
  it('shows sources, master data, outputs and consumers in one view', async () => {
    globalThis.fetch = route({ '/x/lineage/overview': overview })
    wrap(<DxLineage />)
    expect(await screen.findByText('Civil registration (CRS)')).toBeInTheDocument()
    expect(screen.getByText('5,716')).toBeInTheDocument()
    expect(screen.getByText('Life events published')).toBeInTheDocument()
    expect(screen.getByText(/17 of 102 notices delivered/)).toBeInTheDocument()
  })

  it('field level: every system that offered a value is listed and the chosen one is marked, with the rule', async () => {
    globalThis.fetch = route({ '/x/lineage/person/7': person })
    wrap(<DxLineage />, '/?tab=person&person=7')
    expect(await screen.findByText(/Identity reference service: A. Vaddera/)).toBeInTheDocument()
    expect(screen.getByText(/Civil registration \(CRS\): Anil Vaddera/)).toBeInTheDocument()
    expect(screen.getByText('chosen')).toBeInTheDocument()
    expect(screen.getByText('Latin-script name from the most trusted source')).toBeInTheDocument()
  })

  it('record level: lists each department record with the load that brought it in', async () => {
    globalThis.fetch = route({ '/x/lineage/person/7': person })
    wrap(<DxLineage />, '/?tab=person&person=7')
    fireEvent.click(await screen.findByRole('button', { name: /Record by record/ }))
    expect(await screen.findByText('CRS-EVT-1')).toBeInTheDocument()
    expect(screen.getByText(/Run 37/)).toBeInTheDocument()
  })

  it('record level: the System filter shows only the chosen system\'s records', async () => {
    const two = { ...person, sources: [...person.sources, { source: 'land', name: 'Revenue: land records', records: [{ id: 2, source_rid: 'RV-LR-1', name: 'Anil Vaddera', link_status: 'AUTO_LINKED', score: 0.79, load_id: 37, loaded_at: '2026-10-27T10:00:00Z', rule_version: 1 }] }] }
    globalThis.fetch = route({ '/x/lineage/person/7': two })
    wrap(<DxLineage />, '/?tab=person&person=7')
    fireEvent.click(await screen.findByRole('button', { name: /Record by record/ }))
    expect(await screen.findByText('CRS-EVT-1')).toBeInTheDocument()
    expect(screen.getByText('RV-LR-1')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'System' }), { target: { value: 'Revenue: land records' } })
    expect(screen.getByText('RV-LR-1')).toBeInTheDocument()
    expect(screen.queryByText('CRS-EVT-1')).not.toBeInTheDocument()
  })

  it('flow level: draws the journey of an event', async () => {
    globalThis.fetch = route({ '/x/lineage/event/5': flow, '/x/events': { total: 1, items: [{ id: 5, uc: 'UC2', event_type: 'BIRTH_REGISTERED', event_key: 'T-B-1', status: 'PROCESSED' }] } })
    wrap(<DxLineage />, '/?tab=event&event=5')
    expect(await screen.findByRole('button', { name: /Event: Birth Registered/ })).toBeInTheDocument()      // drawn on the page itself, no side panel
    expect(screen.getByRole('button', { name: /Audit log: 3 audit entries/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('flow level: the header names the mother and father as links, with where each match stands, and they are boxes in the flow', async () => {
    const parents = [{ role: 'Mother', name: 'Savitha Madavi', person_id: 21, state: 'AWAITING' }, { role: 'Father', name: 'Bhimrao Madavi', person_id: null, state: 'NOT_MATCHED' }]
    const f = { ...flow, event: { ...flow.event, citizen: 'Baby Madavi', person_id: 7, people: [{ role: null, name: 'Baby Madavi', person_id: 7 }], parents },
      nodes: [...flow.nodes, { id: 'parent_mother', kind: 'person', label: 'Mother: Savitha Madavi', status: 'AWAITING_APPROVAL', status_text: 'matched, awaiting approval', link: '/mdm?tab=people&person=21', detail: {} }],
      edges: [...flow.edges, { from: 'parent_mother', to: 'ev', label: 'mother of' }] }
    globalThis.fetch = route({ '/x/lineage/event/5': f, '/x/events': { total: 0, items: [] } })
    wrap(<DxLineage />, '/?tab=event&event=5')
    expect(await screen.findByTitle('Open Savitha Madavi')).toHaveTextContent('Savitha Madavi')
    expect(screen.getByText(/matched, awaiting approval/, { selector: '.dxk-muted' })).toBeInTheDocument()
    expect(screen.queryByTitle(/^Open Bhimrao Madavi/)).toBeNull()
    expect(screen.getByText(/not matched/, { selector: '.dxk-muted' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Person: Mother: Savitha Madavi/ })).toBeInTheDocument()
  })

  it('flow level: selecting a step opens what it is and the facts behind it', async () => {
    const f = { ...flow, event: { id: 5, event_type: 'BIRTH_REGISTERED', event_key: 'T-B-1', status: 'PROCESSED', uc: 'UC2', citizen: 'Anil Vaddera', person_id: 7, person_mdm_id: 'MDM-7', people: [{ role: null, name: 'Anil Vaddera', person_id: 7 }] },
      nodes: [...flow.nodes.slice(0, 2), { id: 'audit', kind: 'audit', label: '3 audit entries', link: '/dx/audit', detail: { rows: [{ seq: 1, ts: '2026-10-30T10:00:00Z', actor: 'sys', action: 'EVENT_RECEIVED', subject: 'event:5' }] } }] }
    globalThis.fetch = route({ '/x/lineage/event/5': f, '/x/events': { total: 0, items: [] } })
    wrap(<DxLineage />, '/?tab=event&event=5')
    fireEvent.click(await screen.findByRole('button', { name: /Audit log: 3 audit entries/ }))
    expect(await screen.findByText(/Tamper-evident log lines/)).toBeInTheDocument()
    expect(screen.getByText('event received')).toBeInTheDocument()
    expect(screen.getAllByText('Anil Vaddera').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Open the full screen/ })).toBeInTheDocument()
  })

  it('event list: the status opens the full trail of that event, and the names go to the people', async () => {
    globalThis.fetch = route({ '/x/lineage/event/5': flow, '/x/events': { total: 1, items: [{ id: 5, uc: 'UC2', event_type: 'BIRTH_REGISTERED', event_key: 'T-B-1', status: 'PROCESSED', citizen: 'Pooja Madavi & Naresh Goud', person_id: null, people: [{ role: 'Bride', name: 'Pooja Madavi', person_id: 11 }, { role: 'Groom', name: 'Naresh Goud', person_id: null }] }] } })
    wrap(<DxLineage />, '/?tab=event')
    expect(await screen.findByTitle('Open Pooja Madavi')).toHaveTextContent('Pooja Madavi')                // each spouse is their own link
    expect(screen.queryByTitle(/^Open Naresh Goud/)).toBeNull()                                             // not matched: plain text, and it says so
    expect(screen.getByText(/not matched/, { selector: '.dxk-muted' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open the trail of event T-B-1' }))
    expect(await screen.findByRole('button', { name: /Event: Birth Registered/ })).toBeInTheDocument()     // same page, the full trail
    expect(screen.getByText('Choose another event')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no catalogue export tab', async () => {
    globalThis.fetch = route({ '/x/lineage/overview': overview })
    wrap(<DxLineage />)
    await screen.findByText('Civil registration (CRS)')
    expect(screen.queryByRole('tab', { name: /Catalogue export/ })).toBeNull()
  })
})

const feeds = { crs: { name: 'Civil registration (CRS)', status: 'WARN', records: 100, expectations: 16, passed: 15, critical_failed: 0, advisory_failed: 1 },
  marriage_register: { name: 'Marriage register', status: 'FAIL', records: 50, expectations: 16, passed: 12, critical_failed: 1, advisory_failed: 3, previous_status: 'WARN' } }
const latest = { run: { id: 9, actor: 'x', trigger: 'MANUAL', gx_version: '1.24.1', finished_at: '2026-10-30T10:00:00Z' }, summary: { feeds, totals: { feeds: 2, pass: 0, warn: 1, fail: 1 } },
  contacts: { marriage_register: { name: 'Meena Rao', role: 'Register lead', email: 'meena@x.example', phone: '040-1' } },
  results: [
    { id: 1, source: 'marriage_register', expectation: 'expect_column_values_to_match_regex', column_name: 'source_rid', severity: 'critical', description: 'Record keys follow the department\'s key format', success: false, element_count: 50, unexpected_count: 4, unexpected_percent: 8, samples: [{ source_rid: 'BAD-1' }],
      explain: { why: '4 record numbers do not follow the department\'s numbering pattern.', action: 'Ask the department whether the number format has changed.' },
      found: { breakdown: [{ label: 'different prefix', count: 4 }], districts: [{ label: 'Medak', count: 3 }], examples: [{ source_rid: 'BAD-1', value: 'BAD-1' }, { source_rid: 'BAD-2', value: 'BAD-2' }], affected: 4 } },
    { id: 2, source: 'crs', expectation: 'expect_column_values_to_not_be_null', column_name: 'dob', severity: 'advisory', description: 'At least 90% of records carry date of birth', success: true, element_count: 100, unexpected_count: 2, unexpected_percent: 2, samples: [] },
  ] }

describe('Feed quality', () => {
  it('shows each feed with its status, lists the failing check first and opens the failing records', async () => {
    globalThis.fetch = route({ '/x/quality/latest': latest, '/x/quality/runs': { items: [{ id: 9, trigger: 'MANUAL', actor: 'x', finished_at: '2026-10-30T10:00:00Z', summary: { totals: { pass: 0, warn: 1, fail: 1 } } }] } })
    wrap(<DxQuality />)
    expect(await screen.findByText('Marriage register', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getAllByText('Failed', { selector: '.mdm-badge' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Was: passed with warnings')).toBeInTheDocument()
    expect(screen.getByText(/Across 2 feeds: 0 passed · 1 with warnings · 1 failed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Checks/ }))
    fireEvent.click(screen.getByText(/Record keys follow the department/))
    expect(await screen.findByText('Why it failed')).toBeInTheDocument()
    expect(screen.getByText(/do not follow the department's numbering pattern/)).toBeInTheDocument()
    expect(screen.getByText('different prefix · 4')).toBeInTheDocument()
    expect(screen.getAllByText('BAD-1').length).toBeGreaterThan(0)
    expect(screen.getByText('What to do')).toBeInTheDocument()
    expect(screen.getByText(/Meena Rao/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'meena@x.example' })).toBeInTheDocument()
  })

  it('runs the checks on request and reports the outcome', async () => {
    const f = route({ '/x/quality/runs': { items: [] }, '/x/quality/latest': latest, '/x/quality/run': () => json({ id: 10, totals: { feeds: 2, pass: 1, warn: 1, fail: 0 } }) })
    globalThis.fetch = f
    wrap(<DxQuality />)
    fireEvent.click(await screen.findByRole('button', { name: 'Run checks now' }))
    expect(await screen.findByText(/Checked 2 feeds: 1 passed, 1 with warnings, 0 failed/)).toBeInTheDocument()
    expect(f.mock.calls.some(([u, i]) => String(u).includes('/x/quality/run') && i?.method === 'POST')).toBe(true)
  })

  it('says so plainly when no check has been run yet', async () => {
    globalThis.fetch = route({ '/x/quality/latest': { run: null, summary: null, results: [] }, '/x/quality/runs': { items: [] } })
    wrap(<DxQuality />)
    expect(await screen.findByText(/No check has been run yet/)).toBeInTheDocument()
  })
})

describe('Story page', () => {
  it('shows each use case as a lane of real screens with the latest scenario result', async () => {
    globalThis.fetch = route({ '/x/demo/scenarios': { items: [
      { id: '2.2', uc: 'UC2', last: { status: 'PASS' } }, { id: '2.11', uc: 'UC2', last: { status: 'PARTIAL' } }, { id: '2.6', uc: 'UC2', last: null }, { id: '3.1', uc: 'UC3', last: { status: 'FAIL' } }] } })
    wrap(<DxStory />)
    expect(await screen.findByRole('button', { name: /UC2 · A child is born/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'UC2 scenarios' })).toHaveTextContent('1 of 3 scenarios passed · 1 with a gap · 1 not run')
    expect(screen.getByRole('button', { name: 'UC3 scenarios' })).toHaveTextContent('1 failed')
    for (const uc of ['UC1', 'UC4', 'UC5', 'UC6']) expect(screen.getByRole('button', { name: new RegExp(`^${uc} ·`) })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Consent/ })).toBeNull()   // closed to begin with
    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    const consent = screen.getAllByRole('link', { name: /Consent/ })
    expect(consent.every((a) => a.getAttribute('href') === '/dx/consent')).toBe(true)
  })
})

describe('Story page folding', () => {
  it('opens and closes one box at a time', async () => {
    globalThis.fetch = route({ '/x/demo/scenarios': { items: [] } })
    wrap(<DxStory />)
    const uc1 = await screen.findByRole('button', { name: /UC1 · Know the person/ })
    expect(uc1).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(uc1)
    expect(uc1).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Steward review/ })).toBeInTheDocument()
    fireEvent.click(uc1)
    expect(screen.queryByRole('link', { name: /Steward review/ })).toBeNull()
  })
})

describe('Guided tour', () => {
  const flowData = { nodes: [{ id: 'ev', kind: 'event', label: 'Birth Registered', sub: 'Key T-BC-1', status: 'PROCESSED' },
    { id: 'p1', kind: 'proposal', label: 'Add to ration card', sub: 'Add the child', status: 'APPROVED' },
    { id: 'c1', kind: 'consent', label: 'Ration card consent', sub: 'Consent 1', status: 'REFUSED' },
    { id: 'd1', kind: 'delivery', label: 'Civil supplies (PDS)', sub: 'Add the child', status: 'BLOCKED_REFUSED' }], edges: [] }
  const mocks = () => route({ '/x/lineage/event/5': flowData, '/x/events': { items: [{ id: 5 }] } })

  it('walks the birth story step by step and shows a real case beside each step', async () => {
    globalThis.fetch = mocks()
    wrap(<DxTour />)
    expect(await screen.findByText('Step 1 of 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /← Back/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('The birth is registered', { selector: 'h3' })).toBeInTheDocument()
    expect(await screen.findByText('Birth Registered')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Add to ration card')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Ration card consent')).toBeInTheDocument()
    expect(screen.getByText('Refused')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Civil supplies (PDS)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Control Tower/ })).toHaveAttribute('href', '/dx/control')
  })

  it('can jump to any step, finishes on the whole-picture step and starts again', async () => {
    globalThis.fetch = mocks()
    wrap(<DxTour />)
    fireEvent.click(await screen.findByRole('button', { name: /Step 7:/ }))
    expect(screen.getByText('Step 7 of 7')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Journey of an event/ })).toHaveAttribute('href', '/dx/lineage?tab=event&event=5')
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument()
  })

  it('says plainly when there is no example birth yet', async () => {
    globalThis.fetch = route({ '/x/events': { items: [] } })
    wrap(<DxTour />)
    fireEvent.click(await screen.findByRole('button', { name: /Step 2:/ }))
    expect(await screen.findByText(/No example birth found yet/)).toBeInTheDocument()
  })
})

describe('Tour buttons use the names in the side menu', () => {
  it('names the menu entry and the tab, in English and in Telugu', async () => {
    const { menuName } = await import('./DxTour')
    const { setLang } = await import('../../i18n/lang')
    expect(menuName('/dx/approvals', 'Approvals')).toBe('Decisions › Approvals')
    expect(menuName('/dx/work', 'Work queue')).toBe('Decisions › Work queue')
    expect(menuName('/dx/quality', 'Feed Quality')).toBe('Reviews and quality › Feed quality')
    expect(menuName('/dx/lineage?tab=event', 'Trail', 'Journey of an event')).toBe('Events › Trail · Journey of an event')
    expect(menuName('/mdm?tab=people', 'People')).toBe('Master Data › People')
    expect(menuName('/dx/control', 'Control tower')).toBe('Control Tower')
    expect(menuName('/dx/citizen/consents', "The citizen's own view")).toBe("The citizen's own view")
    setLang('te')
    expect(menuName('/dx/approvals', 'Approvals')).toContain('నిర్ణయాలు')
    expect(menuName('/dx/work', 'Work queue')).toContain('నిర్ణయాలు')
    setLang('en')
  })
})

