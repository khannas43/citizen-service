import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DxHousing from './DxHousing'
import DxWork from './DxWork'
import { tr, setLang } from '../../i18n/lang'
import te from '../../i18n/te'

vi.mock('../../mdmApi', () => ({ mdm: vi.fn(), MDM_API: '' }))
vi.mock('../mdm/shared', async () => {
  const actual = await vi.importActual('../mdm/shared')
  return { ...actual, useMdm: vi.fn() }
})

import { mdm } from '../../mdmApi'
import { useMdm } from '../mdm/shared'

const OUT = {
  days: 7, purpose: 'HOUSEHOLD_BENEFIT',
  answered: 4, no_consent: 1, denied_policy: 0, expired: 1, conflict: 2, no_record: 1,
  by_outcome: { answered: 4, no_consent: 1, denied_policy: 0, expired: 1, conflict: 2, no_record: 1 },
  duplicates_found: 3, total: 9,
  open_items: { DUPLICATE_BENEFIT: 2, CARD_DEAD_ACTIVE: 1, HOUSEHOLD_CONFLICT: 1, NO_HOUSEHOLD: 3 },
  ledger_filters: {
    answered: { kind: 'VERIFY', outcome: 'ANSWERED', q: 'HOUSEHOLD_BENEFIT' },
    no_consent: { kind: 'VERIFY', outcome: 'DENIED_NO_CONSENT', q: 'HOUSEHOLD_BENEFIT' },
    denied_policy: { kind: 'VERIFY', outcome: 'DENIED_POLICY', q: 'HOUSEHOLD_BENEFIT' },
    expired: { kind: 'VERIFY', outcome: 'EXPIRED_SOURCE', q: 'HOUSEHOLD_BENEFIT' },
    conflict: { kind: 'VERIFY', outcome: 'CONFLICT', q: 'HOUSEHOLD_BENEFIT' },
    no_record: { kind: 'VERIFY', outcome: 'NO_RECORD', q: 'HOUSEHOLD_BENEFIT' },
  },
}

beforeEach(() => {
  localStorage.setItem('officer_token', 'tok')
  localStorage.removeItem('officer_role')
  setLang('en')
  vi.mocked(useMdm).mockReset()
  vi.mocked(mdm).mockReset()
})
afterEach(() => { setLang('en') })

describe('UC5 officer: Housing row', () => {
  it('shows outcome counts, duplicates, open items linking to work, and a day selector', async () => {
    vi.mocked(useMdm).mockReturnValue({ data: OUT, error: null, loading: false, reload: vi.fn() })
    render(<MemoryRouter><DxHousing /></MemoryRouter>)
    const table = screen.getByTestId('housing-row')
    expect(within(table).getByText(tr('Housing: household checks'))).toBeInTheDocument()
    expect(within(table).getByText('4')).toBeInTheDocument()
    expect(within(table).getByText(tr('Duplicates found'))).toBeInTheDocument()
    const dupLink = within(table).getAllByRole('link').find((a) => a.getAttribute('href') === '/dx/work/DUPLICATE_BENEFIT')
    expect(dupLink).toBeTruthy()
    expect(dupLink).toHaveTextContent('2')
    expect(within(table).getAllByRole('link').find((a) => a.getAttribute('href') === '/dx/work/NO_HOUSEHOLD')).toBeTruthy()
    const ledger = within(table).getAllByRole('link').find((a) => (a.getAttribute('href') || '').includes('outcome=ANSWERED'))
    expect(ledger).toBeTruthy()
    expect(screen.getByRole('button', { name: tr('7 days') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tr('30 days') })).toBeInTheDocument()
  })

  it('empty and error states offer retry', async () => {
    const reload = vi.fn()
    vi.mocked(useMdm).mockReturnValue({ data: null, error: 'offline', loading: false, reload })
    render(<MemoryRouter><DxHousing /></MemoryRouter>)
    expect(screen.getByText(tr('Could not load housing checks'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: tr('Retry') }))
    expect(reload).toHaveBeenCalled()
  })

  it('Telugu covers the housing row strings', () => {
    for (const k of [
      'Housing: household checks', 'Duplicates found', 'Duplicate housing benefit',
      'Deceased still on ration card', 'Household records disagree', 'No household on record',
      'Counts only. No household value is shown here.',
    ]) {
      expect(te[k], k).toMatch(/[\u0C00-\u0C7F]/)
    }
  })
})

describe('UC5 officer: work queue labels', () => {
  const groupPage = (reason, over = {}) => {
    vi.mocked(mdm).mockImplementation(async (path) => {
      if (path === '/x/work/items') {
        return {
          reason, label: over.label || reason, risk_class: over.risk_class || 'C',
          batchable: !!over.batchable, rationale_min_chars: 10,
          items: [{ id: 1, key: 'p-1', summary: over.summary || 'Look into this', system: 'housing', age_hours: 2, person_name: 'A', evidence: {} }],
          total: 1, stats: { items: 1, claimed_by_me: 0, oldest_hours: 2 },
          ...over,
        }
      }
      return {}
    })
    return render(
      <MemoryRouter initialEntries={[`/dx/work/${reason}`]}>
        <Routes><Route path="/dx/work/:reason" element={<DxWork />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('DUPLICATE_BENEFIT and HOUSEHOLD_CONFLICT need a reason and have no Approve all', async () => {
    groupPage('DUPLICATE_BENEFIT', { label: 'Household may already have housing assistance', batchable: false, risk_class: 'C' })
    expect(await screen.findByText(tr('Each item is decided by a person, one at a time, with a reason. There is no approve all for these.'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: tr('Approve all in group') })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: tr('Review one by one') }))
    const drawer = await screen.findByRole('dialog')
    const approve = within(drawer).getByRole('button', { name: /Approve/ })
    expect(approve).toBeDisabled()
  })

  it('NO_HOUSEHOLD is batchable as the server says', async () => {
    groupPage('NO_HOUSEHOLD', {
      label: 'No household on record: tell the applicant',
      batchable: true, risk_class: 'B',
    })
    expect(await screen.findByRole('button', { name: tr('Approve all in group') })).toBeInTheDocument()
  })

  it('group list shows UC5 reason labels and one-line what to do', async () => {
    vi.mocked(useMdm).mockImplementation((path) => {
      if (path === '/x/work/groups') {
        return {
          data: {
            groups: [{
              reason_code: 'DUPLICATE_BENEFIT',
              label: 'Household may already have housing assistance',
              suggestion: 'The automatic answer already refuses the duplicate. Look into it as a possible fraud signal and say why in your reason',
              risk_class: 'C', count: 2, oldest_hours: 5, systems: ['housing'], batchable: false, claimed: 0, overdue: false,
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
    expect(await screen.findByText('Household may already have housing assistance')).toBeInTheDocument()
    expect(screen.getByText(/possible fraud signal/)).toBeInTheDocument()
    expect(screen.getAllByText('C').length).toBeGreaterThan(0)
  })
})
