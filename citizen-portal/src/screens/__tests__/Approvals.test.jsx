import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import Home from '../Home'
import Approvals from '../Approvals'
import ApprovalDetail from '../ApprovalDetail'
import NotificationBell from '../../components/NotificationBell'

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

vi.mock('../../api', () => ({
  displayAppNo: (a) => a.applicationNo || 'APP',
  fetchMyApplications: vi.fn().mockResolvedValue([]),
  certificateDownloadUrl: () => '#',
  fetchClarifications: vi.fn().mockResolvedValue([]),
  fetchNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../auth', () => ({
  loadCitizenProfile: () => ({ name: 'Test Parent', aadhaarRef: 'REF-TEST' }),
  logoutCitizen: vi.fn(),
}))

vi.mock('../../components/AISearch', () => ({ default: () => null }))
vi.mock('../../components/InfoRequestSection', () => ({
  default: () => null,
  hasPendingInfoRequest: () => false,
}))
vi.mock('../../labels', () => ({
  serviceLabel: (s) => s,
  statusLabel: (s) => s,
  appMetaLabel: () => '',
}))

import {
  fetchApprovalsSummary, fetchApprovals, fetchApproval, answerEventApproval,
} from '../../approvalsApi'
import { fetchNotifications, markNotificationRead } from '../../api'

const pendingGroup = {
  key: 'event-412',
  kind: 'CONSENT_GROUP',
  status: 'PENDING',
  event_id: 412,
  child: { name: 'Latha', dob: '2026-10-30', sex: 'F' },
  asked_by: 'Registrar, civil registration',
  asked_at: '2026-10-31T10:00:00Z',
  respond_by: '2026-11-07T10:00:00Z',
  can_answer: true,
  lines: [
    { consent_id: 1, department: 'pds', department_name: 'PDS', purpose: 'BIRTH_PDS', purpose_name: 'Ration', elements: ['child_name'], status: 'PENDING' },
    { consent_id: 2, department: 'health', department_name: 'Health', purpose: 'BIRTH_HEALTH', purpose_name: 'Health', elements: ['child_name'], status: 'PENDING' },
    { consent_id: 3, department: 'citizen', department_name: 'Citizen', purpose: 'BIRTH_CITIZEN_RECORD', purpose_name: 'Record', elements: ['child_name'], status: 'PENDING' },
  ],
}

const answeredGroup = {
  ...pendingGroup,
  key: 'event-99',
  status: 'ANSWERED',
  can_answer: false,
  answered_by: 'Test Parent',
  answered_at: '2026-11-01T12:00:00Z',
  child: { name: 'Ravi', dob: '2026-01-01', sex: 'M' },
  lines: pendingGroup.lines.map((l) => ({ ...l, status: 'GRANTED' })),
}

describe('Citizen Approvals', () => {
  beforeEach(() => {
    localStorage.setItem('citizen_token', 'tok')
    vi.mocked(fetchApprovalsSummary).mockResolvedValue({ pending: 0 })
    vi.mocked(fetchApprovals).mockResolvedValue({ pending: 0, items: [] })
    vi.mocked(fetchApproval).mockReset()
    vi.mocked(answerEventApproval).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('Home shows the banner with the count and hides it at zero', async () => {
    vi.mocked(fetchApprovalsSummary).mockResolvedValue({ pending: 2 })
    const shown = render(<MemoryRouter><Home /></MemoryRouter>)
    expect(await screen.findByTestId('approvals-banner')).toHaveTextContent(/2 approvals waiting/i)
    shown.unmount()

    vi.mocked(fetchApprovalsSummary).mockResolvedValue({ pending: 0 })
    render(<MemoryRouter><Home /></MemoryRouter>)
    await waitFor(() => expect(fetchApprovalsSummary).toHaveBeenCalled())
    expect(screen.queryByTestId('approvals-banner')).not.toBeInTheDocument()
  })

  it('The list shows pending before answered', async () => {
    vi.mocked(fetchApprovals).mockResolvedValue({
      pending: 1,
      items: [pendingGroup, answeredGroup],
    })
    render(
      <MemoryRouter>
        <Approvals />
      </MemoryRouter>,
    )
    const links = await screen.findAllByRole('link')
    const texts = links.map((a) => a.textContent)
    const pendingIdx = texts.findIndex((t) => t.includes('Latha'))
    const answeredIdx = texts.findIndex((t) => t.includes('Ravi'))
    expect(pendingIdx).toBeGreaterThanOrEqual(0)
    expect(answeredIdx).toBeGreaterThan(pendingIdx)
  })

  it('maps child sex codes and uses the active language for dates', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    await i18n.changeLanguage('te')
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('approvals.sexFemale'))).toBeInTheDocument()
    expect(screen.queryByText(/^F$/)).not.toBeInTheDocument()
    // Telugu locale month for Oct 2026
    expect(screen.getByText(/అక్టో|Oct/i)).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

  it('RequestForm labels mapped keys and never shows [object Object]', async () => {
    vi.mocked(fetchApproval).mockResolvedValue({
      key: 'req-7',
      kind: 'REQUEST',
      status: 'PENDING',
      request_id: 7,
      summary: 'Please confirm your address',
      can_answer: true,
      detail: {
        address: { current: 'Ward 1', proposed: 'Ward 2' },
        name: 'Sita',
        nested: { line1: 'Street', line2: 'City' },
      },
    })
    render(
      <MemoryRouter initialEntries={['/approvals/req-7']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('approvals.field.address'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('approvals.field.name'))).toBeInTheDocument()
    expect(screen.getByText(/Street/)).toBeInTheDocument()
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument()
  })

  it('Approve is disabled until a relationship is chosen and the declaration is ticked', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    const approve = await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    expect(approve).toBeDisabled()
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    expect(approve).toBeDisabled()
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    expect(approve).toBeEnabled()
  })

  it('all toggled off disables Approve', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    for (const box of screen.getAllByLabelText(i18n.t('approvals.shareWithDept'))) {
      await userEvent.click(box)
    }
    expect(screen.getByRole('button', { name: i18n.t('approvals.approveSelected') })).toBeDisabled()
  })

  it('decline all shows the declined title', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    vi.mocked(answerEventApproval).mockResolvedValue({
      ...pendingGroup, status: 'ANSWERED', answered_at: '2026-11-01T12:00:00Z',
      lines: pendingGroup.lines.map((l) => ({ ...l, status: 'REFUSED' })),
    })
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: i18n.t('approvals.declineAll') }))
    const receipt = await screen.findByTestId('approval-receipt')
    expect(receipt).toHaveTextContent(i18n.t('approvals.receiptDeclined', { child: 'Latha' }))
  })

  it('Toggling a department off sends REFUSE for it and GRANT for the others, in one request', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    vi.mocked(answerEventApproval).mockResolvedValue({
      ...pendingGroup, status: 'ANSWERED', answered_at: '2026-11-01T12:00:00Z',
      lines: pendingGroup.lines.map((l, i) => ({ ...l, status: i === 1 ? 'REFUSED' : 'GRANTED' })),
    })
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    const healthShare = screen.getAllByLabelText(i18n.t('approvals.shareWithDept'))[1]
    await userEvent.click(healthShare)
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    await userEvent.click(screen.getByRole('button', { name: i18n.t('approvals.approveSelected') }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: i18n.t('approvals.confirm') }))
    await waitFor(() => expect(answerEventApproval).toHaveBeenCalledTimes(1))
    const body = vi.mocked(answerEventApproval).mock.calls[0][1]
    expect(body.answers).toEqual([
      { consent_id: 1, decision: 'GRANT' },
      { consent_id: 2, decision: 'REFUSE' },
      { consent_id: 3, decision: 'GRANT' },
    ])
  })

  it('The confirm dialog shows the count and child\'s name; Esc cancels and sends nothing', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    const approve = await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    await userEvent.click(approve)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/3/)
    expect(dialog).toHaveTextContent(/Latha/)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(answerEventApproval).not.toHaveBeenCalled()
    expect(approve).toHaveFocus()
  })

  it('Tab cycles inside the confirm dialog', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    await userEvent.click(screen.getByRole('button', { name: i18n.t('approvals.approveSelected') }))
    const dialog = await screen.findByRole('dialog')
    const confirmBtn = within(dialog).getByRole('button', { name: i18n.t('approvals.confirm') })
    const cancelBtn = within(dialog).getByRole('button', { name: i18n.t('approvals.cancel') })
    confirmBtn.focus()
    await userEvent.tab()
    expect(cancelBtn).toHaveFocus()
    await userEvent.tab()
    expect(confirmBtn).toHaveFocus()
  })

  it('The receipt appears after success and the button cannot double-send', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    let resolve
    const pending = new Promise((r) => { resolve = r })
    vi.mocked(answerEventApproval).mockReturnValue(pending)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
          <Route path="/approvals" element={<Approvals />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    await userEvent.click(screen.getByRole('button', { name: i18n.t('approvals.approveSelected') }))
    const dialog = await screen.findByRole('dialog')
    const confirmBtn = within(dialog).getByRole('button', { name: i18n.t('approvals.confirm') })
    await userEvent.click(confirmBtn)
    expect(confirmBtn).toBeDisabled()
    resolve({
      ...pendingGroup, status: 'ANSWERED', answered_at: '2026-11-01T12:00:00Z',
      lines: pendingGroup.lines.map((l) => ({ ...l, status: 'GRANTED' })),
    })
    expect(await screen.findByTestId('approval-receipt')).toBeInTheDocument()
    expect(answerEventApproval).toHaveBeenCalledTimes(1)
  })

  it('Never says shared for an approved use that is still waiting for the department (UC2 outage)', async () => {
    const waiting = {
      ...answeredGroup,
      lines: [
        { ...answeredGroup.lines[0], status: 'GRANTED', delivery: 'DELIVERED' },
        { ...answeredGroup.lines[1], status: 'GRANTED', delivery: 'RETRYING' },
        { ...answeredGroup.lines[2], status: 'REFUSED', delivery: 'BLOCKED_REFUSED' },
      ],
    }
    vi.mocked(fetchApproval).mockResolvedValue(waiting)
    render(
      <MemoryRouter initialEntries={['/approvals/event-99']}>
        <Routes><Route path="/approvals/:key" element={<ApprovalDetail />} /></Routes>
      </MemoryRouter>,
    )
    const receipt = await screen.findByTestId('approval-receipt')
    const items = within(receipt).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(i18n.t('approvals.lineStatus.GRANTED'))
    expect(items[1]).toHaveTextContent(i18n.t('approvals.lineStatus.GRANTED_WAITING'))
    expect(items[1]).not.toHaveTextContent(new RegExp(`${i18n.t('approvals.lineStatus.GRANTED')}$`))
    expect(items[2]).toHaveTextContent(i18n.t('approvals.lineStatus.REFUSED'))
  })

  it('A card whose time ran out reads Expired in the list', async () => {
    const expired = { ...pendingGroup, key: 'event-77', status: 'EXPIRED', can_answer: false, child: { name: 'Ishita', dob: '2026-06-14', sex: 'F' },
      lines: pendingGroup.lines.map((l) => ({ ...l, status: 'EXPIRED' })) }
    vi.mocked(fetchApprovals).mockResolvedValue({ pending: 0, items: [expired] })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText('Ishita')).toBeInTheDocument()
    expect(screen.getByText(i18n.t('approvals.status.EXPIRED'))).toBeInTheDocument()
  })

  it('the list shows a death notice with Notice status and no answer-by line', async () => {
    const death = {
      key: 'death-9', kind: 'DEATH_NOTICE', status: 'INFO', can_answer: false,
      asked_at: '2026-11-01T10:00:00Z', respond_by: null, stage: 'STOP_APPROVED',
      deceased_name: 'Ramaiah Goud', notice_id: 9,
    }
    vi.mocked(fetchApprovals).mockResolvedValue({ pending: 0, items: [death] })
    render(<MemoryRouter><Approvals /></MemoryRouter>)
    expect(await screen.findByText(i18n.t('approvals.death.row'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('approvals.status.INFO'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('approvals.invite.invitedOn'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('approvals.answerBy'))).toBeNull()
  })

  it('the death notice detail shows STOP_APPROVED text with the name, and falls back without a name', async () => {
    vi.mocked(fetchApproval).mockResolvedValue({
      key: 'death-9', kind: 'DEATH_NOTICE', status: 'INFO', can_answer: false,
      asked_at: '2026-11-01T10:00:00Z', stage: 'STOP_APPROVED', deceased_name: 'Ramaiah Goud',
    })
    const a = render(
      <MemoryRouter initialEntries={['/approvals/death-9']}>
        <Routes><Route path="/approvals/:key" element={<ApprovalDetail />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('approvals.death.title'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('approvals.death.body.STOP_APPROVED', { name: 'Ramaiah Goud' }))).toBeInTheDocument()
    a.unmount()

    vi.mocked(fetchApproval).mockResolvedValue({
      key: 'death-10', kind: 'DEATH_NOTICE', status: 'INFO', can_answer: false,
      asked_at: '2026-11-01T10:00:00Z', stage: 'CONTACTED', deceased_name: null,
    })
    render(
      <MemoryRouter initialEntries={['/approvals/death-10']}>
        <Routes><Route path="/approvals/:key" element={<ApprovalDetail />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(
      i18n.t('approvals.death.body.CONTACTED', { name: i18n.t('approvals.death.someone') }),
    )).toBeInTheDocument()
  })

  it('death notice strings render in Telugu', async () => {
    await i18n.changeLanguage('te')
    vi.mocked(fetchApproval).mockResolvedValue({
      key: 'death-9', kind: 'DEATH_NOTICE', status: 'INFO', can_answer: false,
      asked_at: '2026-11-01T10:00:00Z', stage: 'STOP_APPROVED', deceased_name: 'Ramaiah Goud',
    })
    render(
      <MemoryRouter initialEntries={['/approvals/death-9']}>
        <Routes><Route path="/approvals/:key" element={<ApprovalDetail />} /></Routes>
      </MemoryRouter>,
    )
    const title = await screen.findByText(i18n.t('approvals.death.title'))
    expect(title.textContent).toMatch(/[\u0C00-\u0C7F]/)
    expect(screen.getByText(i18n.t('approvals.death.body.STOP_APPROVED', { name: 'Ramaiah Goud' })).textContent)
      .toMatch(/[\u0C00-\u0C7F]/)
    await i18n.changeLanguage('en')
  })

  it('A 409 shows already answered by name', async () => {
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    vi.mocked(answerEventApproval).mockRejectedValue(
      Object.assign(new Error('Already answered by Sita on 2026-11-01'), {
        status: 409, detail: 'Already answered by Sita on 2026-11-01',
      }),
    )
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: i18n.t('approvals.approveSelected') })
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.rel.mother')))
    await userEvent.click(screen.getByLabelText(i18n.t('approvals.declaration', { child: 'Latha' })))
    await userEvent.click(screen.getByRole('button', { name: i18n.t('approvals.approveSelected') }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: i18n.t('approvals.confirm') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sita/)
  })

  it('A 404 shows the unlinked message; a 401 goes to sign-in', async () => {
    vi.mocked(fetchApproval).mockRejectedValue(Object.assign(new Error('x'), { status: 404 }))
    render(
      <MemoryRouter initialEntries={['/approvals/event-1']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
          <Route path="/login" element={<p>sign-in</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(i18n.t('requests.unlinked'))).toBeInTheDocument()

    vi.mocked(fetchApproval).mockRejectedValue(Object.assign(new Error('x'), { status: 401 }))
    render(
      <MemoryRouter initialEntries={['/approvals/event-2']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
          <Route path="/login" element={<p>sign-in</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('sign-in')).toBeInTheDocument()
  })

  it('Telugu renders the Approve button and the declaration in Telugu', async () => {
    await i18n.changeLanguage('te')
    vi.mocked(fetchApproval).mockResolvedValue(pendingGroup)
    render(
      <MemoryRouter initialEntries={['/approvals/event-412']}>
        <Routes>
          <Route path="/approvals/:key" element={<ApprovalDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'ఎంచుకున్నవి ఆమోదించండి' })).toBeInTheDocument()
    expect(screen.getByLabelText(/నేను Latha కి తల్లిదండ్రులు/)).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

  it('A notification with serviceName Approvals opens the matching detail', async () => {
    vi.mocked(fetchNotifications).mockResolvedValue([{
      id: 9, title: 'An approval is waiting', message: 'Open it', serviceName: 'Approvals',
      trackingId: 'event-412', isRead: false, createdAt: new Date().toISOString(),
    }])
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotificationBell />} />
          <Route path="/approvals/:key" element={<p>detail-event-412</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: i18n.t('bell.ariaLabel') }))
    await userEvent.click(await screen.findByText('An approval is waiting'))
    expect(await screen.findByText('detail-event-412')).toBeInTheDocument()
    expect(markNotificationRead).toHaveBeenCalledWith(9)
  })
})
