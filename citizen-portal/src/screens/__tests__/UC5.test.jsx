import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import en from '../../locales/en.json'
import te from '../../locales/te.json'
import Approvals from '../Approvals'
import ApprovalDetail from '../ApprovalDetail'

vi.mock('../../approvalsApi', () => ({
  fetchApprovalsSummary: vi.fn(),
  fetchApprovals: vi.fn(),
  fetchApproval: vi.fn(),
  answerEventApproval: vi.fn(),
  answerRequestApproval: vi.fn(),
  answerConsentApproval: vi.fn(),
  withdrawConsent: vi.fn(),
}))

import {
  fetchApprovals, fetchApproval, answerConsentApproval,
} from '../../approvalsApi'

const ELEMENTS = ['income_band', 'residence', 'household_benefit', 'electricity_link', 'land_holding', 'duplicate_benefit']

const housing = {
  key: 'consent-501',
  kind: 'CONSENT_SINGLE',
  consent_id: 501,
  purpose: 'HOUSEHOLD_BENEFIT',
  status: 'PENDING',
  result: null,
  elements: ELEMENTS,
  granted_elements: null,
  student: { person_id: 40, name: 'Ravi', under_18: false },
  role: 'student',
  can_answer: true,
  can_withdraw: false,
  waiting_for_parent: false,
  needs_declaration: false,
  handover: false,
  asked_at: '2026-06-01T10:00:00',
  respond_by: '2026-07-01T10:00:00',
  expires_at: null,
  term_days: 90,
}

const scholarship = {
  key: 'consent-31',
  kind: 'CONSENT_SINGLE',
  consent_id: 31,
  purpose: 'SCHOLARSHIP_ELIGIBILITY',
  status: 'PENDING',
  result: null,
  elements: ['income_band', 'category', 'residence', 'age'],
  student: { person_id: 9, name: 'Latha', under_18: true },
  role: 'parent',
  can_answer: true,
  can_withdraw: false,
  waiting_for_parent: false,
  needs_declaration: true,
  handover: false,
  asked_at: '2026-06-01T10:00:00',
  respond_by: '2026-07-01T10:00:00',
  term_days: 90,
}

function renderDetail(key = 'consent-501') {
  return render(
    <MemoryRouter initialEntries={[`/approvals/${key}`]}>
      <Routes>
        <Route path="/approvals/:key" element={<ApprovalDetail />} />
        <Route path="/approvals" element={<p>approvals-list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const L = (k, o) => i18n.t(`approvals.uc5.${k}`, o)

describe('UC5 citizen: housing assistance consent', () => {
  beforeEach(async () => {
    localStorage.setItem('citizen_token', 'tok')
    await i18n.changeLanguage('en')
    vi.mocked(fetchApproval).mockResolvedValue(housing)
  })
  afterEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
  })

  it('renders housing wording: who asks, what is checked, household not shared, 90 days, refuse or withdraw', async () => {
    renderDetail()
    const card = await screen.findByTestId('uc5-card')
    expect(card).toHaveTextContent('Housing department')
    expect(card).toHaveTextContent('household can get housing assistance')
    expect(card).toHaveTextContent('whole household')
    expect(card).toHaveTextContent('only you answer')
    expect(card).toHaveTextContent('income below a limit')
    expect(card).toHaveTextContent('already gets housing assistance')
    expect(card).toHaveTextContent('electricity')
    expect(card).toHaveTextContent('land')
    expect(card).toHaveTextContent('does not get an income figure')
    expect(card).toHaveTextContent('other members are not asked')
    expect(card).toHaveTextContent(/90 days/)
    expect(card).toHaveTextContent(/refuse or stop it any time/)
    expect(screen.getByRole('heading', { name: L('title') })).toBeInTheDocument()
  })

  it('grant works through the existing answer route', async () => {
    vi.mocked(answerConsentApproval).mockResolvedValue({
      ...housing, status: 'GRANTED', result: 'ALLOWED', granted_elements: ELEMENTS, can_answer: false, can_withdraw: true,
      expires_at: '2026-09-20T10:00:00', responded_at: '2026-06-21T10:00:00',
    })
    renderDetail()
    await userEvent.click(await screen.findByLabelText(L('allow')))
    await userEvent.click(screen.getByRole('button', { name: L('send') }))
    expect(answerConsentApproval).toHaveBeenCalledWith(501, expect.objectContaining({ decision: 'GRANT', elements: ELEMENTS }))
    expect(await screen.findByTestId('uc5-receipt')).toHaveTextContent(L('result.ALLOWED'))
  })

  it('refuse works through the existing answer route', async () => {
    vi.mocked(answerConsentApproval).mockResolvedValue({
      ...housing, status: 'REFUSED', result: 'NOT_ALLOWED', can_answer: false, can_withdraw: false,
      responded_at: '2026-06-21T10:00:00',
    })
    renderDetail()
    await userEvent.click(await screen.findByLabelText(L('notNow')))
    await userEvent.click(screen.getByRole('button', { name: L('send') }))
    expect(answerConsentApproval).toHaveBeenCalledWith(501, { decision: 'REFUSE' })
    expect(await screen.findByTestId('uc5-receipt')).toHaveTextContent(L('result.NOT_ALLOWED'))
  })

  it('a minor never sees an answerable housing card', async () => {
    vi.mocked(fetchApproval).mockResolvedValue({
      ...housing, can_answer: false, waiting_for_parent: true, student: { ...housing.student, under_18: true },
    })
    renderDetail()
    const card = await screen.findByTestId('uc5-card')
    expect(screen.getByTestId('uc5-waiting')).toHaveTextContent(/adult applicant|minor/i)
    expect(card.querySelector('input[type="radio"]')).toBeNull()
  })

  it('lists housing and scholarship cards with their own wording', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({
      pending: 2,
      items: [housing, scholarship],
    })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText(L('rowSelf'))).toBeInTheDocument()
    expect(screen.getByText('Scholarship check for Latha')).toBeInTheDocument()
  })

  it('scholarship card is unchanged when purpose is SCHOLARSHIP_ELIGIBILITY', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(scholarship)
    renderDetail('consent-31')
    const card = await screen.findByTestId('uc4-card')
    expect(card).toHaveTextContent('scholarship')
    expect(card).not.toHaveTextContent('Housing department')
    expect(screen.getByRole('heading', { name: i18n.t('approvals.uc4.title') })).toBeInTheDocument()
  })

  it('every approvals.uc5 string has a Telugu twin with the same placeholders and none says Telangana', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (
      typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
    const e = Object.fromEntries(flat(en.approvals.uc5))
    const t = Object.fromEntries(flat(te.approvals.uc5))
    expect(Object.keys(t).sort()).toEqual(Object.keys(e).sort())
    const ph = (s) => (s.match(/{{\w+}}/g) || []).sort().join()
    for (const k of Object.keys(e)) {
      expect(t[k], k).toMatch(/[\u0C00-\u0C7F]/)
      expect(ph(t[k]), k).toBe(ph(e[k]))
      expect(e[k] + t[k]).not.toMatch(/Telangana|DG2/i)
    }
  })
})
