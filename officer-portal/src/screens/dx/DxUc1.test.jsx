import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DxFlowBoard from './DxFlowBoard'
import DxWork from './DxWork'
import { tr, setLang } from '../../i18n/lang'

vi.mock('../../mdmApi', () => ({
  mdm: vi.fn(),
  MDM_API: '',
}))

vi.mock('../mdm/shared', async () => {
  const actual = await vi.importActual('../mdm/shared')
  return { ...actual, useMdm: vi.fn() }
})

import { mdm } from '../../mdmApi'
import { useMdm } from '../mdm/shared'

const reviewItem = (over = {}) => ({
  id: 5, key: 'r-5', kind: 'REVIEW', reason_code: 'LINK_NEAR', risk_class: 'C', status: 'OPEN',
  summary: 'Lakshmi (Health) may be the same person as Laxmi', person_name: null, system_code: 'mdm',
  age_hours: 3, score: 0.71, needs_rationale: false, claimed_by: null,
  evidence: {
    record: {
      name: 'లక్ష్మి', transliteration: 'lakshmi', skeleton: ['LKSM'], dob: '2010-05-01', gender: 'F',
      district: 'Guntur', mandal: 'Tenali', village: 'Kolakaluru', address: '4-12', parents: ['Ravi'], ration_card: 'RC1',
      source_name: 'Health', as_of: '2026-11-01',
    },
    candidates: [
      {
        n: 1, person_id: 101, mdm_id: 'MDM-101', score: 0.72, name: 'Laxmi', transliteration: null, skeleton: ['LKSM'],
        dob: '2010-05-03', gender: 'F', district: 'Guntur', mandal: 'Tenali', village: 'Kolakaluru', address: '4-12',
        parents: ['Ravi'], ration_card: 'RC1', differs: ['dob'], sources: [{ source: 'PDS', source_name: 'Civil supplies', as_of: '2026-10-20' }],
        scores: { name: 0.9, dob: 0.4 },
      },
      {
        n: 2, person_id: 102, mdm_id: 'MDM-102', score: 0.70, name: 'Lakshmi D', dob: '2010-05-01', gender: 'F', district: 'Guntur',
        differs: [], sources: [], parents: [], skeleton: [],
      },
    ],
    reason_required: false,
  },
  ...over,
})

function renderGroup(reason) {
  return render(
    <MemoryRouter initialEntries={[`/dx/work/${reason}`]}>
      <Routes>
        <Route path="/dx/work" element={<DxWork />} />
        <Route path="/dx/work/:reason" element={<DxWork />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockItems(reason, label, items, extra = {}) {
  vi.mocked(mdm).mockImplementation(async (path, opts) => {
    if (path === '/x/work/items') {
      return { reason, label, batchable: false, risk_class: 'C', items, next_after: null, rationale_min_chars: 10, ...extra }
    }
    return {}
  })
}

beforeEach(() => {
  vi.mocked(useMdm).mockReset()
  vi.mocked(useMdm).mockReturnValue({ data: null, error: null, loading: false, reload: vi.fn() })
  vi.mocked(mdm).mockReset()
  setLang('en')
})
afterEach(() => { setLang('en') })

describe('UC1 officer: link evidence drawer', () => {
  it('shows record and candidates side by side, marks differing fields with bold and the word, and shows the keyboard legend', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    const drawer = await screen.findByRole('dialog', { name: tr('Evidence') })
    expect(within(drawer).getByTestId('link-legend')).toHaveTextContent(
      tr('Keyboard: A link (the first candidate, or the one chosen with 1 to 9), S keep separate, N next'),
    )
    const table = within(drawer).getByRole('table', { name: tr('Record and candidates side by side') })
    expect(within(table).getByText('Laxmi')).toBeInTheDocument()
    expect(within(table).getByText('lakshmi')).toBeInTheDocument()            // transliteration
    expect(within(table).getByText(tr('Sounds like'))).toBeInTheDocument()
    // The differing date of birth is bold and says "differs": not colour alone.
    const dob = within(table).getByText('2010-05-03')
    expect(dob.tagName).toBe('STRONG')
    expect(within(table).getAllByText(new RegExp(tr('differs'))).length).toBeGreaterThan(0)
    // A matching field is not marked.
    expect(within(table).getAllByText('Guntur')[0].tagName).not.toBe('STRONG')
    for (const name of [tr('Link to candidate {n}', { n: 1 }), tr('Keep separate'), tr('Skip')]) {
      expect(within(drawer).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('LINK_NEAR has no Approve all and says each link is a person\'s decision', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    expect(await screen.findByText(tr('Each link is decided by a person, one at a time. There is no approve all for these.'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: tr('Approve all in group') })).toBeNull()
  })

  it('a LINK_NEAR group never offers Approve all even if the server said batchable', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()], { batchable: true })
    renderGroup('LINK_NEAR')
    await screen.findByRole('button', { name: tr('Evidence') })
    expect(screen.queryByRole('button', { name: tr('Approve all in group') })).toBeNull()
  })

  it('keyboard: 2 chooses the second candidate, A links it, and the decision goes to the review route', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    const drawer = await screen.findByRole('dialog', { name: tr('Evidence') })
    await userEvent.keyboard('2')
    expect(within(drawer).getByRole('button', { name: tr('Link to candidate {n}', { n: 2 }) })).toBeInTheDocument()
    await userEvent.keyboard('a')
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/x/work/review/5/decide')).toBe(true))
    const [, opts] = vi.mocked(mdm).mock.calls.find(([p]) => p === '/x/work/review/5/decide')
    expect(opts.method).toBe('POST')
    expect(opts.body).toMatchObject({ decision: 'LINK', person_id: 102 })
  })

  it('keyboard: S keeps separate', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    await screen.findByRole('dialog', { name: tr('Evidence') })
    await userEvent.keyboard('s')
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/x/work/review/5/decide')).toBe(true))
    const [, opts] = vi.mocked(mdm).mock.calls.find(([p]) => p === '/x/work/review/5/decide')
    expect(opts.body).toMatchObject({ decision: 'SEPARATE' })
    expect(opts.body.person_id).toBeUndefined()
  })

  it('keyboard: N moves to the next item without deciding', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [
      reviewItem(),
      reviewItem({ id: 6, key: 'r-6', summary: 'Second item summary' }),
    ])
    renderGroup('LINK_NEAR')
    await userEvent.click((await screen.findAllByRole('button', { name: tr('Evidence') }))[0])
    const drawer = await screen.findByRole('dialog', { name: tr('Evidence') })
    expect(within(drawer).getByText(/may be the same person as Laxmi/)).toBeInTheDocument()
    await userEvent.keyboard('n')
    expect(await within(drawer).findByText('Second item summary')).toBeInTheDocument()
    expect(vi.mocked(mdm).mock.calls.some(([p]) => /decide/.test(p))).toBe(false)
  })

  it('LINK_AMBIGUOUS needs a reason before Link or Keep separate is enabled', async () => {
    mockItems('LINK_AMBIGUOUS', 'More than one possible person', [
      reviewItem({ reason_code: 'LINK_AMBIGUOUS', needs_rationale: true }),
    ])
    renderGroup('LINK_AMBIGUOUS')
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    const drawer = await screen.findByRole('dialog', { name: tr('Evidence') })
    const link = within(drawer).getByRole('button', { name: tr('Link to candidate {n}', { n: 1 }) })
    expect(link).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: tr('Keep separate') })).toBeDisabled()
    expect(within(drawer).getByText(tr('{n} more characters needed', { n: 10 }))).toBeInTheDocument()
    await userEvent.keyboard('a')                               // the key cannot get round the rule
    expect(vi.mocked(mdm).mock.calls.some(([p]) => /decide/.test(p))).toBe(false)
    await userEvent.type(within(drawer).getByRole('textbox'), 'Same parents and village')
    expect(link).toBeEnabled()
    await userEvent.click(link)
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/x/work/review/5/decide')).toBe(true))
    const [, opts] = vi.mocked(mdm).mock.calls.find(([p]) => p === '/x/work/review/5/decide')
    expect(opts.body.note).toBe('Same parents and village')
  })

  it('claim uses the item keys (r-5), not bare numbers', async () => {
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    await userEvent.click(await screen.findByRole('checkbox', { name: tr('Select') }))
    await userEvent.click(screen.getByRole('button', { name: tr('Assign to me') }))
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/x/work/claim')).toBe(true))
    const [, opts] = vi.mocked(mdm).mock.calls.find(([p]) => p === '/x/work/claim')
    expect(opts.body.ids).toEqual(['r-5'])
  })
})

describe('UC1 officer: LINK_LOW_SEPARATE batch', () => {
  it('opens the slice 1 batch dialog: Continue stays disabled until the sample is opened and the reason is long enough', async () => {
    vi.mocked(mdm).mockImplementation(async (path) => {
      if (path === '/x/work/items') {
        return {
          reason: 'LINK_LOW_SEPARATE', label: 'Unlikely to be the same person', batchable: true, risk_class: 'B',
          items: [reviewItem({ reason_code: 'LINK_LOW_SEPARATE', risk_class: 'B' })], next_after: null,
        }
      }
      if (path === '/x/work/batch/preview') {
        return {
          token: 'tok', count: 2, by_system: { mdm: 2 }, held_for_consent: 0,
          sample: { random: ['r-1'], lowest_confidence: ['r-2'], outliers: [] },
          items_in_sample: [
            { id: 'r-1', summary: 'A', system: 'mdm', confidence: 0.6 },
            { id: 'r-2', summary: 'B', system: 'mdm', confidence: 0.58 },
          ],
        }
      }
      return {}
    })
    renderGroup('LINK_LOW_SEPARATE')
    await userEvent.click(await screen.findByRole('button', { name: tr('Approve all in group') }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(tr('Each record is kept separate from its candidate. They can still be linked later.'))).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeDisabled()
    expect(within(dialog).getByText(tr('Open every sample row to continue'))).toBeInTheDocument()
    for (const btn of within(dialog).getAllByRole('button', { name: tr('Open') })) await userEvent.click(btn)
    expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox'), 'Different parents, villages and dates')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: tr('Continue') })).toBeEnabled())
    await userEvent.click(within(dialog).getByRole('button', { name: tr('Continue') }))
    await userEvent.click(within(dialog).getByRole('button', { name: tr('Approve batch') }))
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/x/work/batch/approve')).toBe(true))
  })
})

describe('UC1 officer: source conflicts', () => {
  const issue = {
    id: 9, key: 'i-9', kind: 'ISSUE', reason_code: 'SOURCE_CONFLICT', risk_class: 'C', code: 'DOB_CONFLICT',
    summary: 'Date of birth differs between two departments', person_name: 'Sita', system_code: 'mdm', age_hours: 5,
    needs_rationale: true,
    evidence: {
      attribute: 'dob', owner: 'revenue', action: 'REQUEST_CORRECTION', reason_required: true,
      values: [
        { value: '2010-05-01', source: 'HEALTH', source_name: 'Health', as_of: '2026-10-01' },
        { value: '2010-05-10', source: 'PDS', source_name: 'Civil supplies', as_of: '2026-10-05' },
      ],
    },
  }

  it('offers only Request correction (never a link or an edit) and calls the existing correction route', async () => {
    mockItems('SOURCE_CONFLICT', 'Two departments disagree', [issue])
    renderGroup('SOURCE_CONFLICT')
    expect(screen.queryByRole('button', { name: tr('Assign to me') })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    const drawer = await screen.findByRole('dialog', { name: tr('Evidence') })
    expect(within(drawer).getByText('2010-05-01').tagName).toBe('STRONG')
    expect(within(drawer).getAllByText(new RegExp(tr('differs'))).length).toBeGreaterThan(0)
    expect(within(drawer).queryByRole('button', { name: /Link to candidate|Keep separate|Approve/ })).toBeNull()
    const ask = within(drawer).getByRole('button', { name: tr('Request correction') })
    expect(ask).toBeDisabled()
    await userEvent.type(within(drawer).getByRole('textbox'), 'Please check the birth register')
    expect(ask).toBeEnabled()
    await userEvent.click(ask)
    await waitFor(() => expect(vi.mocked(mdm).mock.calls.some(([p]) => p === '/dq/issues/9/correction')).toBe(true))
    const [, opts] = vi.mocked(mdm).mock.calls.find(([p]) => p === '/dq/issues/9/correction')
    expect(opts).toMatchObject({ method: 'POST', body: { note: 'Please check the birth register' } })
    expect(vi.mocked(mdm).mock.calls.some(([p]) => /review|master|person/.test(p))).toBe(false)
  })
})

describe('UC1 officer: Flow board identity row and Work queue filter', () => {
  const board = {
    rows: [{
      system: 'pds', name: 'Civil supplies (PDS)', received_24h: 10, delivered: 4, waiting_citizen: 0, retrying: 0,
      failed: 0, stopped: 0, needs_person: 1, routine: 1, decision: 0, oldest_waiting_hours: 1, on_time_pct: 100, overdue: 0,
    }],
    identity: {
      system: 'identity', kind: 'IDENTITY', name: 'Identity linkage (MDM)', received_24h: 120, linked_automatically: 90,
      in_review: 17, decided_today: 6, oldest_waiting_hours: 30, on_time_pct: 88.5, overdue: 2,
    },
    totals: { received_24h: 10, delivered: 4, waiting_citizen: 0, retrying: 0, failed: 0, stopped: 0, needs_person: 1, routine: 1, decision: 0, oldest_waiting_hours: 1, on_time_pct: 100 },
    definitions: {
      'identity.in_review': 'Open review tasks plus open source conflicts: the items in the four identity groups of the Work queue.',
    },
  }

  it('shows the Identity linkage (MDM) row and links the in-review number to the identity reasons', () => {
    vi.mocked(useMdm).mockReturnValue({ data: board, error: null, loading: false, reload: vi.fn() })
    render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    const row = screen.getByTestId('identity-row')
    expect(within(row).getByText(tr('Identity linkage (MDM)'))).toBeInTheDocument()
    expect(within(row).getByText('120')).toBeInTheDocument()
    expect(within(row).getByText('90')).toBeInTheDocument()
    expect(within(row).getByText('6')).toBeInTheDocument()
    expect(within(row).getByText('30h')).toBeInTheDocument()
    expect(within(row).getByText('88.5%')).toBeInTheDocument()
    const inReview = within(row).getByRole('link', { name: '17' })
    expect(inReview.getAttribute('href')).toBe('/dx/work?reasons=LINK_NEAR,LINK_AMBIGUOUS,LINK_LOW_SEPARATE,SOURCE_CONFLICT')
    // Per-reason links open the matching group.
    for (const code of ['LINK_NEAR', 'LINK_AMBIGUOUS', 'LINK_LOW_SEPARATE', 'SOURCE_CONFLICT']) {
      expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === `/dx/work/${code}`)).toBe(true)
    }
    // The departments still have their own table.
    expect(screen.getByText('Civil supplies (PDS)')).toBeInTheDocument()
  })

  it('falls back to the mdm row when the board has no identity object, and the help drawer defines the numbers', async () => {
    const { identity, ...rest } = board
    vi.mocked(useMdm).mockReturnValue({
      data: { ...rest, rows: [...board.rows, { ...identity, system: 'mdm', name: 'Identity linkage (MDM)' }] },
      error: null, loading: false, reload: vi.fn(),
    })
    render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    expect(screen.getByTestId('identity-row')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: tr('What the numbers mean') }))
    const help = await screen.findByRole('dialog', { name: tr('What the numbers mean') })
    expect(within(help).getByText(tr('Identity linkage: in review'))).toBeInTheDocument()
    expect(within(help).getByText(/Open review tasks plus open source conflicts/)).toBeInTheDocument()
  })

  it('a department officer has no identity row', () => {
    vi.mocked(useMdm).mockReturnValue({ data: { ...board, identity: null }, error: null, loading: false, reload: vi.fn() })
    render(<MemoryRouter><DxFlowBoard /></MemoryRouter>)
    expect(screen.queryByTestId('identity-row')).toBeNull()
  })

  it('the Work queue filtered by reasons lists only those groups', async () => {
    vi.mocked(useMdm).mockImplementation((path) => (path === '/x/work/groups'
      ? {
        data: {
          groups: [
            { reason_code: 'LINK_NEAR', label: 'Probably the same person', risk_class: 'C', count: 3, oldest_hours: 2, systems: [], batchable: false, suggestion: 'Compare', claimed: 0, overdue: false },
            { reason_code: 'IDREF_REQUEST', label: 'Request an identity reference', risk_class: 'B', count: 2, oldest_hours: 1, systems: [], batchable: true, suggestion: 'Approve', claimed: 0, overdue: false },
          ],
        },
        error: null, loading: false, reload: vi.fn(),
      }
      : { data: null, error: null, loading: false, reload: vi.fn() }))
    render(
      <MemoryRouter initialEntries={['/dx/work?reasons=LINK_NEAR,LINK_AMBIGUOUS']}>
        <Routes><Route path="/dx/work" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Probably the same person')).toBeInTheDocument()
    expect(screen.queryByText('Request an identity reference')).toBeNull()
    expect(screen.getByText(tr('Showing only the identity linkage groups.'))).toBeInTheDocument()
  })
})

describe('UC1 officer: Telugu', () => {
  it('the drawer, legend and buttons are in Telugu', async () => {
    setLang('te')
    mockItems('LINK_NEAR', 'Probably the same person', [reviewItem()])
    renderGroup('LINK_NEAR')
    await userEvent.click(await screen.findByRole('button', { name: tr('Evidence') }))
    const drawer = await screen.findByRole('dialog')
    const telugu = /[\u0C00-\u0C7F]/
    expect(within(drawer).getByTestId('link-legend').textContent).toMatch(telugu)
    for (const en of ['Keep separate', 'Skip', 'differs', 'Match score', 'This record']) {
      expect(tr(en), en).toMatch(telugu)
    }
    expect(within(drawer).getByRole('button', { name: tr('Link to candidate {n}', { n: 1 }) }).textContent).toMatch(telugu)
  })
})
