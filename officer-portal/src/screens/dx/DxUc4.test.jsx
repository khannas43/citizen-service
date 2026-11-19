import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DxFlowBoard from './DxFlowBoard'
import DxWork from './DxWork'
import { DailyChecks, EducationOutcomes } from './DxDaily'
import { Turning18 } from '../mdm/Worklists'
import { tr, setLang } from '../../i18n/lang'
import te from '../../i18n/te'

const json = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
function route(table, calls = []) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url)
    calls.push({ method: init.method || 'GET', url: u, body: init.body ? JSON.parse(init.body) : null })
    const keys = Object.keys(table).sort((a, b) => b.length - a.length)
    for (const k of keys) if (u.includes(k)) return typeof table[k] === 'function' ? table[k](u, init) : json(table[k])
    return json({})
  })
}

const person = (id, over = {}) => ({
  id, name: `Student ${id}`, district: 'Guntur', dob: '2008-07-01', turns_18: '2026-07-01', already_adult: false,
  has_identity: true, income_state: 'valid', has_caste: true, on_scholarship_portal: false,
  next_steps: ['Apply'], next_step: 'Apply',
  consent_status: 'none', invited: false, ...over,
})
const T18 = {
  as_of: '2026-06-21', total: 4,
  stats: { turning_30: 2, already_18: 1, not_on_portal: 3, invited: 1, income_expired_or_none: 0 },
  items: [
    person(1),
    person(2, { consent_status: 'parent_asked' }),
    person(3, { consent_status: 'handover_pending', already_adult: true }),
    person(4, { consent_status: 'student_allowed', invited: true }),
  ],
}

beforeEach(() => { localStorage.setItem('officer_token', 'tok'); localStorage.removeItem('officer_role'); setLang('en') })
afterEach(() => { cleanup(); setLang('en'); localStorage.removeItem('officer_role') })

describe('UC4 officer: Turning 18 worklist', () => {
  it('has a Consent column that says where each person is', async () => {
    globalThis.fetch = route({ '/worklists/turning-18': T18 })
    render(<MemoryRouter><Turning18 openPerson={() => {}} /></MemoryRouter>)
    expect(await screen.findByRole('columnheader', { name: 'Consent' })).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-1')).getByText('Not asked')).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-2')).getByText('Parent asked')).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-3')).getByText('Waiting for the student (now 18)')).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-4')).getByText('Student allowed')).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-4')).getByText('Invited')).toBeInTheDocument()
  })

  it('an invited person cannot be chosen again, and the button needs a choice', async () => {
    globalThis.fetch = route({ '/worklists/turning-18': T18 })
    render(<MemoryRouter><Turning18 openPerson={() => {}} /></MemoryRouter>)
    const invite = await screen.findByRole('button', { name: /Invite to apply/ })
    expect(invite).toBeDisabled()
    expect(screen.getByLabelText('Choose Student 4')).toBeDisabled()
    // choose everyone on the page: the invited one is not counted
    await userEvent.click(screen.getByLabelText('Choose everyone on this page'))
    expect(screen.getByRole('button', { name: 'Invite to apply (3)' })).toBeEnabled()
    expect(screen.getByLabelText('Choose Student 4')).not.toBeChecked()
  })

  it('previews the count first, sends nothing until confirmed, then reports', async () => {
    const calls = []
    globalThis.fetch = route({
      '/worklists/turning-18': T18,
      '/x/turning-18/invite': (u, init) => {
        const b = JSON.parse(init.body)
        return b.preview
          ? json({ preview: true, count: 1, would_invite: 1, skipped: 1, skipped_detail: [{ person_id: 2, reason: 'ALREADY_INVITED' }] })
          : json({ preview: false, invited: 1, notified: 1, skipped: 1 })
      },
    }, calls)
    render(<MemoryRouter><Turning18 openPerson={() => {}} /></MemoryRouter>)
    await userEvent.click(await screen.findByLabelText('Choose Student 1'))
    await userEvent.click(screen.getByLabelText('Choose Student 2'))
    await userEvent.click(screen.getByRole('button', { name: 'Invite to apply (2)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite to apply' })
    expect(await within(dialog).findByTestId('invite-preview')).toHaveTextContent('1 people will get a notice')
    expect(within(dialog).getByText(/1 are left out/)).toBeInTheDocument()
    let posts = calls.filter((c) => c.url.includes('/turning-18/invite'))
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toEqual({ person_ids: [1, 2], preview: true })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitations' }))
    expect(await within(dialog).findByTestId('invite-done')).toHaveTextContent('1 invited, 1 notified, 1 left out.')
    posts = calls.filter((c) => c.url.includes('/turning-18/invite'))
    expect(posts[1].body).toEqual({ person_ids: [1, 2], preview: false })
  })

  it('offers no send when nobody in the preview can be invited', async () => {
    globalThis.fetch = route({
      '/worklists/turning-18': T18,
      '/x/turning-18/invite': { preview: true, count: 0, would_invite: 0, skipped: 1, skipped_detail: [] },
    })
    render(<MemoryRouter><Turning18 openPerson={() => {}} /></MemoryRouter>)
    await userEvent.click(await screen.findByLabelText('Choose Student 1'))
    await userEvent.click(screen.getByRole('button', { name: 'Invite to apply (1)' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/Everyone chosen has already been invited/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Send invitations' })).toBeNull()
  })
})

describe('UC4 officer: daily checks', () => {
  const last = {
    job: 'daily', ran: true, actor: 'admin', ran_at: '2026-06-21T02:00:00Z',
    result: { sweep: { no_response: 2, term_ended: 1 }, handover: { persons: 4 }, invitations: { invited: 7 }, certificate_reminders: { sent: 3 }, enrolled: 0 },
  }

  it('shows the last run and runs the checks now, then shows what they did', async () => {
    const calls = []
    globalThis.fetch = route({
      '/x/jobs/daily': { ...last.result, run_id: 9 },
      '/x/jobs/last': last,
    }, calls)
    render(<MemoryRouter><DailyChecks /></MemoryRouter>)
    const lastBox = await screen.findByTestId('daily-last')
    expect(lastBox).toHaveTextContent('by admin')
    expect(lastBox).toHaveTextContent('Consents lapsed: 3')
    expect(lastBox).toHaveTextContent("4 people turned 18: their parents' permission ended and they were asked for their own.")
    expect(lastBox).toHaveTextContent('Invited to apply: 7')
    expect(lastBox).toHaveTextContent('Certificate reminders sent: 3')
    await userEvent.click(screen.getByRole('button', { name: 'Run daily checks now' }))
    await screen.findByText('The daily checks ran.')
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/x/jobs/daily'))).toBe(true)
  })

  it('says nobody turned 18 when the handover count is zero', async () => {
    globalThis.fetch = route({
      '/x/jobs/last': {
        ...last,
        result: { ...last.result, handover: { persons: 0 } },
      },
    })
    render(<MemoryRouter><DailyChecks /></MemoryRouter>)
    expect(await screen.findByTestId('daily-last')).toHaveTextContent('Nobody has turned 18 since the last check.')
  })

  it('says so when the role is not allowed', async () => {
    globalThis.fetch = route({
      '/x/jobs/daily': () => json({ detail: 'x' }, false, 403),
      '/x/jobs/last': { job: 'daily', ran: false },
    })
    render(<MemoryRouter><DailyChecks /></MemoryRouter>)
    expect(await screen.findByText('The daily checks have not run yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Run daily checks now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this action.')
  })

  it('only an admin role sees it on the flow board, and a department officer sees no Education row', async () => {
    const board = {
      rows: [], totals: null, identity: null, definitions: {},
    }
    const outcomes = {
      days: 7, purpose: 'SCHOLARSHIP_ELIGIBILITY', total: 5,
      by_outcome: { answered: 3, no_consent: 1, denied_policy: 0, expired: 1, conflict: 0, no_record: 0 },
      open_items: { CERT_EXPIRED: 2, CERT_CONFLICT: 0, OTHER_STATE: 1 },
    }
    const table = { '/x/flow-board': board, '/x/eligibility/outcomes': outcomes, '/x/jobs/last': last }
    globalThis.fetch = route(table)
    const a = render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    await screen.findByTestId('education-row')
    expect(screen.queryByRole('button', { name: 'Run daily checks now' })).toBeNull()
    a.unmount()

    localStorage.setItem('officer_role', 'MDM_ADMIN')
    const b = render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Run daily checks now' })).toBeInTheDocument()
    b.unmount()

    const calls = []
    globalThis.fetch = route(table, calls)
    localStorage.setItem('officer_role', 'PDS_OFFICER')
    render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    await waitFor(() => expect(calls.some((c) => c.url.includes('/x/flow-board'))).toBe(true))
    expect(screen.queryByTestId('education-row')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run daily checks now' })).toBeNull()
    expect(calls.some((c) => c.url.includes('/x/eligibility/outcomes') || c.url.includes('/x/jobs'))).toBe(false)
  })
})

describe('UC4 officer: Education outcomes', () => {
  const outcomes = {
    days: 7, purpose: 'SCHOLARSHIP_ELIGIBILITY', total: 6,
    by_outcome: { answered: 3, no_consent: 1, denied_policy: 0, expired: 1, conflict: 1, no_record: 0 },
    open_items: { CERT_EXPIRED: 2, CERT_CONFLICT: 1, OTHER_STATE: 0 },
  }

  it('shows counts that open the clearing house on that outcome, and the open work groups', async () => {
    globalThis.fetch = route({ '/x/eligibility/outcomes': outcomes })
    render(<MemoryRouter><EducationOutcomes /></MemoryRouter>)
    const row = await screen.findByTestId('education-row')
    const href = (name) => within(row).getByRole('link', { name }).getAttribute('href')
    expect(href('3')).toBe('/dx/ledger?kind=VERIFY&outcome=ANSWERED&q=SCHOLARSHIP_ELIGIBILITY')
    expect(href('2')).toBe('/dx/work/CERT_EXPIRED')
    expect(within(row).queryByRole('link', { name: '0' })).toBeNull()
    // counts only: nothing about income or category values
    expect(row.textContent).not.toMatch(/₹|lakh|\bBC\b|\bSC\b|\bST\b|income band/i)
  })

  it('is not drawn when the service gives no counts', () => {
    globalThis.fetch = route({ '/x/eligibility/outcomes': {} })
    const { container } = render(<MemoryRouter><EducationOutcomes /></MemoryRouter>)
    expect(container.querySelector('[data-testid="education-row"]')).toBeNull()
  })
})

describe('UC4 officer: work queue groups', () => {
  const groupPage = (reason, over = {}) => {
    globalThis.fetch = route({
      '/x/work/items': {
        reason, label: reason, risk_class: 'C', batchable: false, rationale_min_chars: 10,
        items: [{ id: 5, key: 'p-5', summary: 'Income certificate conflict', system: 'revenue', age_hours: 2, person_name: 'Student 5', evidence: { certificates: [{ source_rid: 'R1' }] } }],
        next_after: null, total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 2 }, ...over,
      },
    })
    return render(
      <MemoryRouter initialEntries={[`/dx/work/${reason}`]}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('CERT_CONFLICT has no Approve all, even if the server said batchable, and says why', async () => {
    groupPage('CERT_CONFLICT', { batchable: true })
    expect(await screen.findByText(tr('Each conflict is decided by a person, one at a time, with a reason. There is no approve all for these.'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: tr('Approve all in group') })).toBeNull()
  })

  it('CERT_CONFLICT one by one needs a written reason before either decision', async () => {
    groupPage('CERT_CONFLICT')
    await userEvent.click(await screen.findByRole('button', { name: tr('Review one by one') }))
    // the drawer loads the next item through the same route
    const drawer = await screen.findByRole('dialog')
    await within(drawer).findByText('Income certificate conflict')
    const approve = within(drawer).getByRole('button', { name: /Approve/ })
    expect(approve).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: /Reject/ })).toBeDisabled()
    await userEvent.type(within(drawer).getByRole('textbox'), 'Both certificates checked')
    expect(approve).toBeEnabled()
  })

  it('CERT_EXPIRED and OTHER_STATE are batchable groups as the server says', async () => {
    const a = groupPage('CERT_EXPIRED', { risk_class: 'B', batchable: true })
    expect(await screen.findByRole('button', { name: tr('Approve all in group') })).toBeInTheDocument()
    a.unmount()
    groupPage('OTHER_STATE', { risk_class: 'B', batchable: true })
    expect(await screen.findByRole('button', { name: tr('Approve all in group') })).toBeInTheDocument()
  })
})

describe('UC4 officer: Telugu', () => {
  it('every new line has Telugu with the same placeholders, and none says Telangana', () => {
    const ENGLISH = [
      'Invite to apply', 'Choose everyone on this page', 'Choose {name}', 'Invited', 'Send invitations',
      '{n} people will get a notice inviting them to apply for a scholarship.', '{n} are left out: already invited, or already on the portal.',
      '{invited} invited, {notified} notified, {skipped} left out.', 'Not asked', 'Parent asked', 'Parent allowed',
      'Waiting for the student (now 18)', 'Student allowed', 'Not allowed', 'Ended', 'Daily checks', 'Run daily checks now',
      'Last run {when} by {who}', 'The daily checks ran.', 'Consents lapsed: {n}',
      'Nobody has turned 18 since the last check.',
      "1 person turned 18: their parent's permission ended and they were asked for their own.",
      "{n} people turned 18: their parents' permission ended and they were asked for their own.",
      'Invited to apply: {n}', 'Certificate reminders sent: {n}', 'Education: scholarship checks', 'Last {n} days', 'Open: {what}',
      'Certificates disagree', 'Lives in another state', 'Not answered: no consent', 'Certificate expired', 'Sources disagree', 'No record',
      'Each conflict is decided by a person, one at a time, with a reason. There is no approve all for these.',
      'Live demo steps (run these one at a time during the demo)',
      'These steps change the demo on purpose, for example making the student turn 18. Run each one when the story reaches it.',
      'Check these students against the sources',
    ]
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join()
    for (const k of ENGLISH) {
      expect(te[k], k).toMatch(/[\u0C00-\u0C7F]/)
      expect(ph(te[k]), k).toBe(ph(k))
      expect(te[k]).not.toMatch(/Telangana/)
    }
  })

  it('the worklist consent labels render in Telugu', async () => {
    setLang('te')
    globalThis.fetch = route({ '/worklists/turning-18': T18 })
    render(<MemoryRouter><Turning18 openPerson={() => {}} /></MemoryRouter>)
    await screen.findByTestId('consent-1')
    expect(within(screen.getByTestId('consent-2')).getByText(te['Parent asked'])).toBeInTheDocument()
    expect(within(screen.getByTestId('consent-4')).getByText(te['Student allowed'])).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(te['Invite to apply']) })).toBeInTheDocument()
  })
})
