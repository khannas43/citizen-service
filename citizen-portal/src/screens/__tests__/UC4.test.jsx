import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  fetchApprovals, fetchApproval, answerConsentApproval, withdrawConsent,
} from '../../approvalsApi'

const ELEMENTS = ['income_band', 'category', 'residence', 'age']

const base = {
  key: 'consent-31',
  kind: 'CONSENT_SINGLE',
  consent_id: 31,
  status: 'PENDING',
  result: null,
  elements: ELEMENTS,
  granted_elements: null,
  student: { person_id: 9, name: 'Latha', under_18: true },
  role: 'parent',
  can_answer: true,
  can_withdraw: false,
  waiting_for_parent: false,
  needs_declaration: true,
  handover: false,
  asked_at: '2026-06-01T10:00:00',
  respond_by: '2026-07-01T10:00:00',
  expires_at: null,
  term_days: 90,
}

const granted = (over = {}) => ({
  ...base,
  status: 'GRANTED',
  result: 'ALLOWED',
  granted_elements: ELEMENTS,
  can_answer: false,
  can_withdraw: true,
  expires_at: '2026-09-20T10:00:00',
  responded_at: '2026-06-21T10:00:00',
  answered_by: 'Sita',
  ...over,
})

function renderDetail(key = 'consent-31') {
  return render(
    <MemoryRouter initialEntries={[`/approvals/${key}`]}>
      <Routes>
        <Route path="/approvals/:key" element={<ApprovalDetail />} />
        <Route path="/approvals" element={<p>approvals-list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const L = (k, o) => i18n.t(`approvals.uc4.${k}`, o)

describe('UC4 citizen: scholarship eligibility consent', () => {
  beforeEach(async () => {
    localStorage.setItem('citizen_token', 'tok')
    await i18n.changeLanguage('en')
    vi.mocked(fetchApproval).mockResolvedValue(base)
  })
  afterEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
  })

  it('uses the plain wording: what is asked, a yes or no, no certificates, until a date, stop any time', async () => {
    renderDetail()
    const card = await screen.findByTestId('uc4-card')
    expect(card).toHaveTextContent('wants to check if Latha can get a scholarship')
    expect(card).toHaveTextContent('is the family income below a limit')
    expect(card).toHaveTextContent('It gets a yes or no')
    expect(card).toHaveTextContent('It does not get certificates')
    expect(card).toHaveTextContent(/lasts until \d{2} \w+ \d{4}/)
    expect(card).toHaveTextContent('you can stop it any time')
  })

  it('a parent must pick a relationship and tick the declaration before allowing', async () => {
    vi.mocked(answerConsentApproval).mockResolvedValue(granted())
    renderDetail()
    await userEvent.click(await screen.findByLabelText(L('allow')))
    const send = screen.getByRole('button', { name: L('send') })
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByLabelText(L('declaration', { student: 'Latha' })))
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(answerConsentApproval).toHaveBeenCalledWith(31, {
      decision: 'GRANT', elements: ELEMENTS, relationship: 'mother', declared: true,
    }))
    expect(await screen.findByTestId('uc4-receipt')).toHaveTextContent('Allowed')
  })

  it('partial allow: nothing to send until one question is ticked, then only those go', async () => {
    vi.mocked(answerConsentApproval).mockResolvedValue(
      granted({ result: 'PARTLY_ALLOWED', granted_elements: ['income_band'], partial: true }),
    )
    renderDetail()
    await userEvent.click(await screen.findByLabelText(L('allowSome')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.father')))
    await userEvent.click(screen.getByLabelText(L('declaration', { student: 'Latha' })))
    const send = screen.getByRole('button', { name: L('send') })
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByLabelText(i18n.t('requests.element.income_band')))
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(answerConsentApproval).toHaveBeenCalledWith(31, {
      decision: 'GRANT', elements: ['income_band'], relationship: 'father', declared: true,
    }))
    const receipt = await screen.findByTestId('uc4-receipt')
    expect(receipt).toHaveTextContent('Partly allowed')
    expect(receipt).toHaveTextContent(i18n.t('requests.element.income_band'))
    expect(receipt).not.toHaveTextContent(i18n.t('requests.element.category'))
  })

  it('Not now needs no declaration and the receipt never says approved or allowed', async () => {
    vi.mocked(answerConsentApproval).mockResolvedValue({
      ...base, status: 'REFUSED', result: 'NOT_ALLOWED', can_answer: false, responded_at: '2026-06-21T10:00:00',
    })
    renderDetail()
    await userEvent.click(await screen.findByLabelText(L('notNow')))
    const send = screen.getByRole('button', { name: L('send') })
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(answerConsentApproval).toHaveBeenCalledWith(31, { decision: 'REFUSE' }))
    const receipt = await screen.findByTestId('uc4-receipt')
    expect(receipt).toHaveTextContent('Not allowed')
    expect(receipt).toHaveTextContent('Nothing will be checked')
    expect(receipt.textContent).not.toMatch(/approved/i)
    expect(receipt.textContent).not.toMatch(/(^|[^t] )allowed\b/i)
    expect(screen.queryByRole('button', { name: L('stop') })).not.toBeInTheDocument()
  })

  it('a student under 18 sees the card read-only and is told the parent decides', async () => {
    vi.mocked(fetchApproval).mockResolvedValue({
      ...base, role: 'student', can_answer: false, waiting_for_parent: true, needs_declaration: false,
    })
    renderDetail()
    expect(await screen.findByTestId('uc4-waiting')).toHaveTextContent('Waiting for your parent')
    expect(screen.getByTestId('uc4-card')).toHaveTextContent('wants to check if you can get a scholarship')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: L('send') })).not.toBeInTheDocument()
  })

  it('at handover the student gets a notice and answers for themselves, with no parent declaration', async () => {
    vi.mocked(fetchApproval).mockResolvedValue({
      ...base, role: 'student', student: { person_id: 9, name: 'Latha', under_18: false },
      needs_declaration: false, handover: true,
    })
    vi.mocked(answerConsentApproval).mockResolvedValue(granted({ role: 'student' }))
    renderDetail()
    expect(await screen.findByTestId('uc4-handover')).toHaveTextContent("Your parent's permission has ended")
    await userEvent.click(screen.getByLabelText(L('allow')))
    expect(screen.queryByLabelText(i18n.t('approvals.rel.mother'))).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: L('send') }))
    await waitFor(() => expect(answerConsentApproval).toHaveBeenCalledWith(31, {
      decision: 'GRANT', elements: ELEMENTS, relationship: null, declared: false,
    }))
  })

  it('withdraw shows a receipt of what stopped and what remains', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(granted())
    vi.mocked(withdrawConsent).mockResolvedValue({
      stopped: ['income_band', 'category'],
      remains: ['IDENTITY_LINK', 'CLEARING_HOUSE_LOG', 'AUDIT_TRAIL'],
      temp_rows_removed: 2,
    })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: L('stop') }))
    await waitFor(() => expect(withdrawConsent).toHaveBeenCalledWith(31))
    const out = await screen.findByTestId('uc4-stopped')
    expect(out).toHaveTextContent('Permission stopped')
    expect(out).toHaveTextContent(i18n.t('requests.element.income_band'))
    expect(out).toHaveTextContent(L('remains.IDENTITY_LINK'))
    expect(out).toHaveTextContent(L('remains.CLEARING_HOUSE_LOG'))
    expect(out).toHaveTextContent(L('remains.AUDIT_TRAIL'))
  })

  it('the list shows the scholarship card with the right status and a read-only wait for a student', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({
      pending: 1,
      items: [
        base,
        { ...base, key: 'consent-32', consent_id: 32, role: 'student', can_answer: false, waiting_for_parent: true },
      ],
    })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText('Scholarship check for Latha')).toBeInTheDocument()
    expect(screen.getByText(L('status.PENDING'))).toBeInTheDocument()
    expect(screen.getByText(L('statusWaitingParent'))).toBeInTheDocument()
  })

  it('a parent with two children sees two cards, each with the child name', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({
      pending: 2,
      items: [
        { ...base, key: 'consent-41', consent_id: 41, student: { person_id: 1, name: 'Kavya', under_18: true } },
        { ...base, key: 'consent-42', consent_id: 42, student: { person_id: 2, name: 'Sai', under_18: true } },
      ],
    })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText('Scholarship check for Kavya')).toBeInTheDocument()
    expect(screen.getByText('Scholarship check for Sai')).toBeInTheDocument()
  })

  it('an ENDED card shows Ended even when a prior result is present', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({
      pending: 0,
      items: [{
        ...granted({ status: 'ENDED', result: 'ALLOWED', can_withdraw: false }),
        key: 'consent-50', consent_id: 50,
      }],
    })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText(L('status.ENDED'))).toBeInTheDocument()
    expect(screen.queryByText(L('result.ALLOWED'))).toBeNull()
  })

  it('renders in Telugu with no English left and no raw keys', async () => {
    await i18n.changeLanguage('te')
    renderDetail()
    const card = await screen.findByTestId('uc4-card')
    expect(card.textContent).toMatch(/[\u0C00-\u0C7F]/)
    expect(card.textContent).not.toMatch(/approvals\.uc4/)
    expect(card).not.toHaveTextContent('wants to check')
    expect(screen.getByRole('button', { name: te.approvals.uc4.send })).toBeInTheDocument()
  })

  it('every approvals.uc4 string has a Telugu twin with the same placeholders and none says Telangana', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (
      typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
    const e = Object.fromEntries(flat(en.approvals.uc4))
    const t = Object.fromEntries(flat(te.approvals.uc4))
    expect(Object.keys(t).sort()).toEqual(Object.keys(e).sort())
    const ph = (s) => (s.match(/{{\w+}}/g) || []).sort().join()
    for (const k of Object.keys(e)) {
      expect(t[k], k).toMatch(/[\u0C00-\u0C7F]/)
      expect(ph(t[k]), k).toBe(ph(e[k]))
      expect(e[k] + t[k]).not.toMatch(/Telangana|DG2/i)
    }
  })
})
