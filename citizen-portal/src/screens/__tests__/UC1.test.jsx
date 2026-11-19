import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import Approvals from '../Approvals'
import ApprovalDetail from '../ApprovalDetail'
import ReportWrongDetail, { REPORT_ATTRIBUTES } from '../ReportWrongDetail'
import MyReports from '../MyReports'

vi.mock('../../approvalsApi', () => ({
  fetchApprovalsSummary: vi.fn(),
  fetchApprovals: vi.fn(),
  fetchApproval: vi.fn(),
  answerEventApproval: vi.fn(),
  answerRequestApproval: vi.fn(),
  withdrawConsent: vi.fn(),
  fetchReports: vi.fn(),
  fetchReportOptions: vi.fn(),
  createReport: vi.fn(),
}))

import {
  fetchApprovals, fetchApproval, answerRequestApproval, fetchReports, fetchReportOptions, createReport,
} from '../../approvalsApi'

const ALLOWED = [
  'name', 'date_of_birth', 'gender', 'life_status', 'address', 'ration_card', 'income',
  'category', 'land', 'marital_status', 'electricity', 'pension', 'scholarship', 'housing',
]

const confirmReq = {
  key: 'req-21',
  kind: 'REQUEST',
  request_kind: 'CONFIRM_DETAILS',
  status: 'PENDING',
  request_id: 21,
  attribute: 'date_of_birth',
  summary: 'Your date of birth is recorded differently by two departments',
  can_answer: true,
  detail: {
    attribute: 'date_of_birth',
    value_a: { value: '2010-05-01', department: 'education', department_name: 'Education', source: 'EDU' },
    value_b: { value: '2010-05-10', department: 'health', department_name: 'Health', source: 'HEALTH' },
    fingerprint: 'abc123def456',
  },
}

function renderDetail(key = 'req-21') {
  return render(
    <MemoryRouter initialEntries={[`/approvals/${key}`]}>
      <Routes>
        <Route path="/approvals/:key" element={<ApprovalDetail />} />
        <Route path="/approvals" element={<p>approvals-list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('UC1 citizen: Please confirm a detail two departments hold differently', () => {
  beforeEach(() => {
    localStorage.setItem('citizen_token', 'tok')
    vi.mocked(fetchApproval).mockResolvedValue(confirmReq)
    vi.mocked(answerRequestApproval).mockReset()
  })
  afterEach(() => { vi.clearAllMocks() })

  it('shows both values with their departments and the three choices', async () => {
    renderDetail()
    const a = await screen.findByTestId('cd-value-A')
    const b = screen.getByTestId('cd-value-B')
    expect(a).toHaveTextContent('2010-05-01')
    expect(a).toHaveTextContent('Education')
    expect(b).toHaveTextContent('2010-05-10')
    expect(b).toHaveTextContent('Health')
    expect(screen.getByLabelText('The first is right')).toBeInTheDocument()
    expect(screen.getByLabelText('The second is right')).toBeInTheDocument()
    expect(screen.getByLabelText('Neither: I will type the correct value')).toBeInTheDocument()
    expect(screen.queryByText(/abc123def456/)).not.toBeInTheDocument()
  })

  it('requires a typed value for Neither', async () => {
    vi.mocked(answerRequestApproval).mockResolvedValue({ sent_to: 'Education' })
    renderDetail()
    const send = await screen.findByRole('button', { name: 'Send my answer' })
    expect(send).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Neither: I will type the correct value'))
    expect(send).toBeDisabled()
    const typed = screen.getByLabelText(/The correct value/)
    await userEvent.type(typed, '2010-05-03')
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(answerRequestApproval).toHaveBeenCalledTimes(1))
    const [rid, body] = vi.mocked(answerRequestApproval).mock.calls[0]
    expect(rid).toBe(21)
    expect(body).toMatchObject({ decision: 'DISPUTE', choice: 'OTHER', reported_value: '2010-05-03' })
  })

  it('"The first is right" sends CONFIRM with choice A and no typed value is needed', async () => {
    vi.mocked(answerRequestApproval).mockResolvedValue({})
    renderDetail()
    await userEvent.click(await screen.findByLabelText('The first is right'))
    expect(screen.queryByLabelText(/The correct value/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send my answer' }))
    await waitFor(() => expect(answerRequestApproval).toHaveBeenCalledTimes(1))
    expect(vi.mocked(answerRequestApproval).mock.calls[0][1]).toMatchObject({ decision: 'CONFIRM', choice: 'A' })
  })

  it('the receipt never says updated', async () => {
    vi.mocked(answerRequestApproval).mockResolvedValue({ sent_to: 'Education' })
    const first = renderDetail()
    await userEvent.click(await screen.findByLabelText('Neither: I will type the correct value'))
    await userEvent.type(screen.getByLabelText(/The correct value/), '2010-05-03')
    await userEvent.click(screen.getByRole('button', { name: 'Send my answer' }))
    const receipt = await screen.findByTestId('confirm-details-receipt')
    expect(receipt).toHaveTextContent('We have sent your correction to Education.')
    expect(receipt).toHaveTextContent('Your record changes when they correct their own. You will be told.')
    expect(receipt.textContent).not.toMatch(/updated/i)
    first.unmount()

    vi.mocked(answerRequestApproval).mockResolvedValue({})
    renderDetail()
    await userEvent.click(await screen.findByLabelText('The second is right'))
    await userEvent.click(screen.getByRole('button', { name: 'Send my answer' }))
    const r2 = await screen.findByTestId('confirm-details-receipt')
    expect(r2.textContent).not.toMatch(/updated/i)
  })

  it('Telugu has no English left on the screen and still no "updated"', async () => {
    await i18n.changeLanguage('te')
    vi.mocked(answerRequestApproval).mockResolvedValue({ sent_to: 'Education' })
    renderDetail()
    await userEvent.click(await screen.findByLabelText(i18n.t('approvals.cd.neither')))
    expect(i18n.t('approvals.cd.neither')).toMatch(/[\u0C00-\u0C7F]/)
    await userEvent.type(screen.getByLabelText(i18n.t('approvals.cd.typedLabel')), 'x')
    await userEvent.click(screen.getByRole('button', { name: i18n.t('approvals.cd.send') }))
    const receipt = await screen.findByTestId('confirm-details-receipt')
    expect(receipt.textContent).not.toMatch(/updated/i)
    await i18n.changeLanguage('en')
  })
})

describe('UC1 citizen: report a wrong detail and My reports', () => {
  beforeEach(() => {
    localStorage.setItem('citizen_token', 'tok')
    vi.mocked(fetchReportOptions).mockResolvedValue({
      items: [
        { attribute: 'date_of_birth', current_value: '2010-05-01' },
        { attribute: 'passport_number', current_value: 'X' },
      ],
    })
  })
  afterEach(() => { vi.clearAllMocks() })

  it('the form lists only the allowed details, in plain words', async () => {
    render(<MemoryRouter><ReportWrongDetail /></MemoryRouter>)
    const select = await screen.findByLabelText('Which detail is wrong?')
    const options = within(select).getAllByRole('option').filter((o) => o.value)
    expect(options.map((o) => o.value).sort()).toEqual([...ALLOWED].sort())
    expect(REPORT_ATTRIBUTES.slice().sort()).toEqual([...ALLOWED].sort())
    expect(options.find((o) => o.value === 'date_of_birth')).toHaveTextContent('Date of birth')
    expect(screen.queryByText(/passport/i)).not.toBeInTheDocument()
    options.forEach((o) => expect(o.textContent).not.toMatch(/_/))
  })

  it('shows what is recorded now, sends the report and gives a receipt that never says updated', async () => {
    vi.mocked(createReport).mockResolvedValue({ department: 'health', department_name: 'Health' })
    render(<MemoryRouter><ReportWrongDetail /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Which detail is wrong?'), 'date_of_birth')
    await waitFor(() => expect(screen.getByTestId('report-current')).toHaveTextContent('2010-05-01'))
    const send = screen.getByRole('button', { name: 'Send report' })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByLabelText('What it should be'), '2010-05-03')
    await userEvent.click(send)
    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createReport).mock.calls[0][0]).toMatchObject({ attribute: 'date_of_birth', reported_value: '2010-05-03' })
    const receipt = await screen.findByTestId('report-receipt')
    expect(receipt).toHaveTextContent('We have sent your correction to Health.')
    expect(receipt.textContent).not.toMatch(/updated/i)
  })

  it('a second open report shows a friendly message', async () => {
    vi.mocked(createReport).mockRejectedValue(Object.assign(new Error('x'), { status: 409, detail: 'dup' }))
    render(<MemoryRouter><ReportWrongDetail /></MemoryRouter>)
    await userEvent.selectOptions(await screen.findByLabelText('Which detail is wrong?'), 'name')
    await userEvent.type(screen.getByLabelText('What it should be'), 'Sita')
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already have an open report/i)
  })

  it('My reports shows the status trail for each report', async () => {
    vi.mocked(fetchReports).mockResolvedValue({
      items: [
        {
          id: 1, key: 'rep-1', attribute: 'date_of_birth', current_value: '2010-05-01', reported_value: '2010-05-03',
          department: 'education', department_name: 'Education', status: 'ROUTED', raised_at: '2026-11-02T10:00:00Z',
          trail: [{ status: 'ROUTED', at: '2026-11-02T10:00:00Z' }],
        },
        {
          id: 2, key: 'rep-2', attribute: 'name', current_value: 'Sita', reported_value: 'Seeta',
          department: 'health', department_name: 'Health', status: 'CORRECTED_AT_SOURCE', raised_at: '2026-11-01T10:00:00Z',
          trail: [{ status: 'ROUTED', at: '2026-11-01T10:00:00Z' }, { status: 'CORRECTED_AT_SOURCE', at: '2026-11-03T10:00:00Z' }],
        },
        {
          id: 3, key: 'rep-3', attribute: 'address', current_value: 'A', reported_value: 'B',
          department: 'revenue', department_name: 'Revenue', status: 'CONFIRMED_AS_IS', department_note: 'Checked the register',
          raised_at: '2026-11-01T10:00:00Z',
          trail: [{ status: 'ROUTED', at: '2026-11-01T10:00:00Z' }, { status: 'CONFIRMED_AS_IS', at: '2026-11-03T10:00:00Z' }],
        },
        {
          id: 4, key: 'rep-4', attribute: 'income', current_value: '1', reported_value: '2',
          department: 'revenue', department_name: 'Revenue', status: 'REJECTED', raised_at: '2026-11-01T10:00:00Z',
          trail: [{ status: 'ROUTED', at: '2026-11-01T10:00:00Z' }, { status: 'REJECTED', at: '2026-11-03T10:00:00Z' }],
        },
      ],
    })
    render(<MemoryRouter><MyReports /></MemoryRouter>)
    const cards = await screen.findAllByTestId('my-report')
    expect(cards).toHaveLength(4)
    expect(within(cards[0]).getAllByText('Sent to the department').length).toBeGreaterThan(0)
    const trail2 = within(cards[1]).getByRole('list', { name: 'Where your report stands' })
    expect(within(trail2).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Sent to the department'),
      expect.stringContaining('Corrected at the source'),
    ])
    expect(within(cards[2]).getAllByText('Kept as it was').length).toBeGreaterThan(0)
    expect(cards[2]).toHaveTextContent('Checked the register')
    expect(within(cards[3]).getAllByText('Not accepted').length).toBeGreaterThan(0)
    for (const c of cards) expect(c.textContent).not.toMatch(/updated/i)
  })

  it('the Approvals page has the My requests menu with both links', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({ pending: 0, items: [] })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    const nav = await screen.findByRole('navigation', { name: 'My requests' })
    expect(within(nav).getByRole('link', { name: 'Report a wrong detail' })).toHaveAttribute('href', '/approvals/report')
    expect(within(nav).getByRole('link', { name: 'My reports' })).toHaveAttribute('href', '/approvals/reports')
  })

  it('Telugu: every new report string is in Telugu', async () => {
    await i18n.changeLanguage('te')
    for (const k of ['menuReport', 'menuMine', 'title', 'send', 'conflict', 'status.ROUTED', 'status.CORRECTED_AT_SOURCE',
      'status.CONFIRMED_AS_IS', 'status.REJECTED', ...ALLOWED.map((a) => `attr.${a}`)]) {
      expect(i18n.t(`approvals.report.${k}`), k).toMatch(/[\u0C00-\u0C7F]/)
    }
    await i18n.changeLanguage('en')
  })
})
