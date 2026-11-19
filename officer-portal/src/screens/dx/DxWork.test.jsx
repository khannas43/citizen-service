import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DxFlowBoard from './DxFlowBoard'
import DxWork from './DxWork'
import DxControl from './DxControl'
import { tr } from '../../i18n/lang'

vi.mock('../../mdmApi', () => ({
  mdm: vi.fn(),
  MDM_API: '',
}))

vi.mock('../mdm/shared', async () => {
  const actual = await vi.importActual('../mdm/shared')
  return {
    ...actual,
    useMdm: vi.fn(),
  }
})

import { mdm } from '../../mdmApi'
import { useMdm } from '../mdm/shared'

beforeEach(() => {
  vi.mocked(useMdm).mockReset()
  vi.mocked(mdm).mockReset()
})

describe('Flow board and Work queue', () => {
  it('Flow board renders rows, totals and links to the work queue', async () => {
    vi.mocked(useMdm).mockReturnValue({
      data: {
        rows: [{
          system: 'pds', name: 'Civil supplies (PDS)', received_24h: 10, delivered: 4,
          waiting_citizen: 3, retrying: 1, failed: 0, stopped: 2, needs_person: 5,
          routine: 3, decision: 2,
          oldest_waiting_hours: 12, on_time_pct: 97, overdue: 0,
        }],
        totals: {
          received_24h: 10, delivered: 4, waiting_citizen: 3, retrying: 1, failed: 0, stopped: 2,
          needs_person: 5, routine: 3, decision: 2, oldest_waiting_hours: 12, on_time_pct: 97,
        },
        definitions: {
          needs_person: 'Open proposals (PROPOSED) for that system (routine + decision).',
          routine: 'Open items in batchable groups (class B).',
          decision: 'Open class C items that need a person to decide.',
          failed: 'Status DEAD_LETTER — a delivery attempt that went wrong.',
          stopped: 'Consent ended, refused or withdrawn (BLOCKED_EXPIRED, BLOCKED_REFUSED, BLOCKED_REVOKED).',
        },
      },
      error: null, loading: false, reload: vi.fn(),
    })
    render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    expect(screen.getByText('Civil supplies (PDS)')).toBeInTheDocument()
    expect(screen.getByText(tr('All departments'))).toBeInTheDocument()
    expect(screen.getByText(tr('Routine'))).toBeInTheDocument()
    expect(screen.getByText(tr('Decision'))).toBeInTheDocument()
    expect(screen.getByText(tr('Stopped'))).toBeInTheDocument()
    expect(screen.getByText(tr('Failed'))).toBeInTheDocument()
    const needs = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/dx/work?system=pds')
    expect(needs).toBeTruthy()
    const routine = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.includes('risk_class=B'))
    const decision = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.includes('risk_class=C'))
    expect(routine).toBeTruthy()
    expect(decision).toBeTruthy()
  })

  it('Control Tower defaults to Flow board and can open Overview', async () => {
    vi.mocked(useMdm).mockReturnValue({
      data: {
        rows: [], totals: {}, definitions: {},
        events: { n: 0, day: 0 }, open_approvals: [], dead_letters: 0, open_discrepancies: 0,
        misuse_alerts: 0, audit_chain: { ok: true, checked: 0 }, subscribers: [], exchanges: {},
        loadtests: [], open_review_tasks: 0, dq_high: 0,
      },
      error: null, loading: false, reload: vi.fn(),
    })
    render(
      <MemoryRouter initialEntries={['/dx/control']}>
        <Routes><Route path="/dx/control" element={<DxControl />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getAllByText(tr('Flow board')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: tr('Overview') }))
    await waitFor(() => expect(screen.getAllByText(tr('Overview')).length).toBeGreaterThan(1))
  })

  it('Work queue lists groups and opens a group page', async () => {
    vi.mocked(useMdm).mockImplementation((path) => {
      if (path === '/x/work/groups') {
        return {
          data: {
            groups: [{
              reason_code: 'IDREF_REQUEST', label: 'Request an identity reference', risk_class: 'B',
              count: 2, oldest_hours: 1, systems: ['Identity reference service'], batchable: true,
              suggestion: 'Approve', claimed: 0, overdue: false,
            }],
          },
          error: null, loading: false, reload: vi.fn(),
        }
      }
      return { data: null, error: null, loading: false, reload: vi.fn() }
    })
    vi.mocked(mdm).mockImplementation(async (path) => {
      if (path === '/x/work/items') {
        return {
          reason: 'IDREF_REQUEST', label: 'Request an identity reference', batchable: true, risk_class: 'B',
          items: [{ id: 1, key: 'p-1', summary: 'Issue an identity reference', system: 'idref', person_name: 'A', age_hours: 1, evidence: {} }],
          next_after: null, total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 1 },
        }
      }
      return {}
    })
    render(
      <MemoryRouter initialEntries={['/dx/work']}>
        <Routes>
          <Route path="/dx/work" element={<DxWork />} />
          <Route path="/dx/work/:reason" element={<DxWork />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Request an identity reference')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Request an identity reference'))
    expect(await screen.findByText(tr('Assign to me'))).toBeInTheDocument()
  })

  it('batch dialog keeps Approve disabled until sample opened and reason long enough; class C shows two-people note', async () => {
    vi.mocked(useMdm).mockReturnValue({ data: null, error: null, loading: false, reload: vi.fn() })
    vi.mocked(mdm).mockImplementation(async (path, opts) => {
      if (path === '/x/work/items') {
        return {
          reason: 'PARENT_REVIEW', label: 'Parent match', batchable: false, risk_class: 'C',
          items: [{ id: 9, key: 'p-9', summary: 'Review parents', system: 'mdm', age_hours: 2, evidence: {} }],
          next_after: null, total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 2 },
        }
      }
      if (path === '/x/work/batch/preview') {
        return {
          token: 'tok', count: 2, by_system: { pds: 2 },
          sample: { random: [1], lowest_confidence: [2], outliers: [] },
          items_in_sample: [
            { id: 1, summary: 'A', system: 'pds', confidence: 0.9 },
            { id: 2, summary: 'B', system: 'pds', confidence: 0.7 },
          ],
        }
      }
      return {}
    })
    render(
      <MemoryRouter initialEntries={['/dx/work/PARENT_REVIEW']}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    expect((await screen.findAllByText(tr('Needs two people: arrives with the next release'))).length).toBeGreaterThan(0)

    // Batchable group
    vi.mocked(mdm).mockImplementation(async (path) => {
      if (path === '/x/work/items') {
        return {
          reason: 'IDREF_REQUEST', label: 'ID ref', batchable: true, risk_class: 'B',
          items: [{ id: 1, key: 'p-1', summary: 'Issue ref', system: 'idref', age_hours: 1, evidence: {} }],
          next_after: null, total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 1 },
        }
      }
      if (path === '/x/work/batch/preview') {
        return {
          token: 'tok', count: 2, by_system: { idref: 2 },
          sample: { random: [1], lowest_confidence: [2], outliers: [] },
          items_in_sample: [
            { id: 1, summary: 'A', system: 'idref', confidence: 0.9 },
            { id: 2, summary: 'B', system: 'idref', confidence: 0.7 },
          ],
        }
      }
      return {}
    })
    render(
      <MemoryRouter initialEntries={['/dx/work/IDREF_REQUEST']}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: tr('Approve all in group') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeDisabled()
    // The dialog says why Continue is disabled.
    expect(within(dialog).getByText(tr('Opened {done} of {total} sample rows', { done: 0, total: 2 }))).toBeInTheDocument()
    expect(within(dialog).getByText(tr('Open every sample row to continue'))).toBeInTheDocument()
    expect(within(dialog).getByText(tr('{n} more characters needed', { n: 10 }))).toBeInTheDocument()
    for (const btn of within(dialog).getAllByRole('button', { name: tr('Open') })) {
      await userEvent.click(btn)
    }
    expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeDisabled()
    expect(within(dialog).getByText(tr('Opened {done} of {total} sample rows', { done: 2, total: 2 }))).toBeInTheDocument()
    expect(within(dialog).queryByText(tr('Open every sample row to continue'))).toBeNull()
    await userEvent.type(within(dialog).getByRole('textbox'), 'Long enough rationale for the batch')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeEnabled())
    expect(within(dialog).queryByText(/more characters needed/)).toBeNull()
  })

  it('triage shortcuts legend is visible', async () => {
    vi.mocked(mdm).mockResolvedValue({
      reason: 'IDREF_REQUEST', label: 'ID', batchable: true, risk_class: 'B',
      items: [{ id: 1, key: 'p-1', summary: 'One', system: 'idref', age_hours: 1, evidence: { summary: 'x' } }],
      next_after: null, total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 1 },
    })
    render(
      <MemoryRouter initialEntries={['/dx/work/IDREF_REQUEST']}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: tr('Review one by one') }))
    expect(await screen.findByText(tr('Keyboard: A approve, R reject, S skip, N next'))).toBeInTheDocument()
  })

  it('a waiting item stays listed after batch preview Open and close; claim shows who and can be released', async () => {
    // Cause of the disappearing CERT_EXPIRED item: Claimed=Unclaimed (or triage claimed=none) hid a
    // still-PROPOSED item after it was claimed. Default is Anyone; claimed_by is shown; Release works.
    const item = {
      id: 4753, key: 'p-4753', summary: 'Renew expired certificate', system: 'revenue',
      person_name: 'Demo Ucfour', age_hours: 2, claimed_by: null, evidence: {},
    }
    let claimedBy = null
    vi.mocked(mdm).mockImplementation(async (path, opts) => {
      if (path === '/x/work/items') {
        const claimed = opts?.params?.claimed
        const row = { ...item, claimed_by: claimedBy }
        const list = (claimed === 'none' && claimedBy) ? [] : [row]
        return {
          reason: 'CERT_EXPIRED', label: 'Certificate expired', batchable: true, risk_class: 'B',
          items: list, total: list.length, stats: { items: list.length, claimed_by_me: claimedBy ? 1 : 0, oldest_hours: 2 },
        }
      }
      if (path === '/x/work/batch/preview') {
        return {
          token: 'tok', count: 1, by_system: { revenue: 1 },
          sample: { random: [4753], lowest_confidence: [], outliers: [] },
          items_in_sample: [{ id: 4753, summary: 'Renew expired certificate', system: 'revenue', confidence: 0.9 }],
        }
      }
      if (path === '/x/work/claim') {
        claimedBy = 'sameer'
        return { claimed: 1, ids: [4753], keys: ['p-4753'] }
      }
      if (path === '/x/work/unclaim') {
        claimedBy = null
        return { released: 1 }
      }
      return {}
    })
    render(
      <MemoryRouter initialEntries={['/dx/work/CERT_EXPIRED']}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Demo Ucfour')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: tr('Select') }))
    await userEvent.click(screen.getByRole('button', { name: tr('Approve all in group') }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: tr('Open') }))
    await userEvent.click(within(dialog).getByRole('button', { name: tr('Cancel') }))
    // Still listed after preview Open + close — not vanished
    expect(screen.getByText('Demo Ucfour')).toBeInTheDocument()
    // Claim, still listed with who claimed it
    await userEvent.click(screen.getByRole('button', { name: tr('Assign to me') }))
    await waitFor(() => expect(screen.getByTestId('claimed-p-4753')).toHaveTextContent('sameer'))
    expect(screen.getByText('Demo Ucfour')).toBeInTheDocument()
    // Unclaimed filter would hide it — Anyone keeps it
    await userEvent.click(screen.getByRole('button', { name: tr('Unclaimed') }))
    await waitFor(() => expect(screen.queryByText('Demo Ucfour')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: tr('Anyone') }))
    expect(await screen.findByText('Demo Ucfour')).toBeInTheDocument()
    // Release
    await userEvent.click(screen.getByRole('checkbox', { name: tr('Select') }))
    await userEvent.click(screen.getByRole('button', { name: tr('Release') }))
    await waitFor(() => expect(screen.queryByTestId('claimed-p-4753')).toBeNull())
  })

  it('group list has stats, search, filter, Clear', async () => {
    vi.mocked(useMdm).mockImplementation((path) => {
      if (path === '/x/work/groups') {
        return {
          data: {
            groups: [{
              reason_code: 'CERT_EXPIRED', label: 'Certificate expired', risk_class: 'B',
              count: 3, oldest_hours: 40, systems: ['revenue'], batchable: true,
              suggestion: 'Approve the renewals', claimed: 1, overdue: false,
            }],
          },
          error: null, loading: false, reload: vi.fn(),
        }
      }
      return { data: null, error: null, loading: false, reload: vi.fn() }
    })
    render(
      <MemoryRouter initialEntries={['/dx/work']}>
        <Routes><Route path="/dx/work" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(tr('Open items'))).toBeInTheDocument()
    expect(screen.getByText(tr('Person decides (class C)'))).toBeInTheDocument()
    expect(screen.getByPlaceholderText(tr('Search reason or person'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: tr('Unclaimed') }))
    expect(screen.getByRole('button', { name: tr('Clear filters') })).toBeInTheDocument()
  })
})
