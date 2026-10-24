import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ExpenditureIntegrity from './ExpenditureIntegrity'

vi.mock('../api', () => ({
  fetchIntegrityTimeline: vi.fn(() => Promise.resolve({ from: null, to: null, lanes: [] })),
  fetchIntegrityAlerts: vi.fn(),
  fetchIntegrityCase: vi.fn(),
  postIntegrityAction: vi.fn(),
  postIntegrityDecision: vi.fn(),
  postIntegrityVerifyClosed: vi.fn(),
  postIntegrityApproveRecovery: vi.fn(),
  postIntegrityRejectRecovery: vi.fn(),
  runIntegrityDetection: vi.fn(),
  fetchIntegrityMetrics: vi.fn(),
  fetchSchemes: vi.fn(),
  fetchBeneficiaryGeoOptions: vi.fn(),
  fetchTalukasForDistrict: vi.fn(),
  fetchPayrollFilterOptions: vi.fn(),
  fetchCitizenFamily: vi.fn(),
  fetchCaseFileExport: vi.fn(),
  fetchPersonOverview: vi.fn(),
  fetchLinkedRegistryIds: vi.fn(() => Promise.resolve({ linkedPersonIds: [] })),
  screenPaymentFile: vi.fn(),
  fetchPaymentBatches: vi.fn(),
  fetchPaymentBatch: vi.fn(),
  decidePaymentLine: vi.fn(),
}))

import {
  fetchIntegrityAlerts, fetchIntegrityCase, postIntegrityAction, postIntegrityDecision, postIntegrityVerifyClosed,
  runIntegrityDetection, fetchIntegrityMetrics, fetchSchemes, fetchBeneficiaryGeoOptions, fetchTalukasForDistrict,
  fetchPayrollFilterOptions, fetchCitizenFamily, fetchCaseFileExport,
} from '../api'

const ALERTS = [
  { id: 'a2', caseId: 'c2', ruleCode: '805', severity: 'MEDIUM', personName: 'Operator OP-DEMO-805', amountDelta: null, schemeName: null, priority: 1200, priorityReason: 'Likely ₹1,200 recoverable: no amount on the alert (using a fixed weight for ranking), overall checks are confirmed 60% of the time (estimated)', priorityEstimated: true },
  { id: 'a1', caseId: 'c1', ruleCode: '802', severity: 'HIGH', personName: 'Meera Rathod', amountDelta: 10000, schemeName: 'MYSY', district: 'Banaskantha', priority: 7200, priorityReason: 'Likely ₹7,200 recoverable: ₹10,000 at stake, this check is confirmed 72% of the time',
    evidence: { variant: 'OVER_SETTLEMENT', authorizedAmount: 10000, netSettled: 20000, paymentIds: ['p1', 'p2'] } },
]
const CASE = {
  caseEntity: { id: 'c1', status: 'OPEN', classification: null, decisionText: null, noticeRequired: false },
  alerts: [{ ...ALERTS[1], personId: '50000005-0000-0000-0000-000000000001' }],
  actions: [{ id: 'x1', actionType: 'RECOVERY_RECORD', externalRef: 'GOV-INT-ABCD1234' }],
  auditLog: [{ id: 'l1', createdAt: '2026-10-07T13:01:04', actorRole: 'DEPT_ADMIN', action: 'DECISION' }],
  evidenceContext: {
    entitlementUnit: { familyId: 'a5000000-0000-0000-0000-000000000005' },
  },
}

function renderAs(role) {
  localStorage.setItem('officer_role', role)
  return render(<MemoryRouter><ExpenditureIntegrity /></MemoryRouter>)
}

async function openMeera() {
  fireEvent.click((await screen.findByText('Meera Rathod')).closest('tr'))
  await screen.findByText(/more than authorised/i)
}

const decided = (classification, status = 'DECIDED') => ({ ...CASE, caseEntity: { ...CASE.caseEntity, classification, decisionText: 'Checked', status } })

describe('Expenditure Integrity screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchIntegrityAlerts.mockResolvedValue(ALERTS)
    fetchIntegrityCase.mockResolvedValue(CASE)
    fetchIntegrityMetrics.mockResolvedValue({ openAlerts: 2, verifiedOverpaymentAmount: 0, recoveryActionsRecorded: 0 })
    fetchSchemes.mockResolvedValue([{ id: 'a1000001-0000-0000-0000-000000000006', name: 'MYSY', isActive: true }])
    fetchBeneficiaryGeoOptions.mockResolvedValue({ districts: ['Banaskantha', 'Ahmedabad', 'Surat'], talukas: [] })
    fetchTalukasForDistrict.mockResolvedValue(['Deesa', 'Palanpur'])
    fetchPayrollFilterOptions.mockResolvedValue({
      districts: ['Ahmedabad', 'Surat'],
      talukas: [],
      ddoCodes: ['DDO-AHM-01', 'DDO-SUR-01'],
    })
    fetchCitizenFamily.mockResolvedValue({
      district: 'Banaskantha',
      taluka: 'Deesa',
      totalAnnualIncome: 72000,
      members: [{ id: '50000005-0000-0000-0000-000000000001', name: 'Meera Rathod', gender: 'Female', casteCategory: 'OBC' }],
    })
  })

  it('sorts by expected recovery and shows the reason on Work on these first', async () => {
    renderAs('DEPT_ADMIN')
    fireEvent.click(await screen.findByRole('button', { name: 'Work on these first' }))
    expect((await screen.findAllByTitle(ALERTS[1].priorityReason)).length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row')
    const meeraIdx = rows.findIndex((r) => r.textContent.includes('Meera Rathod'))
    const lowIdx = rows.findIndex((r) => r.textContent.includes('OP-DEMO-805'))
    expect(meeraIdx).toBeGreaterThan(0)
    expect(meeraIdx).toBeLessThan(lowIdx)
    expect(screen.getByRole('region', { name: 'Highest expected recovery' })).toBeInTheDocument()
  })

  it('lists alerts with rule code and hover title, highest severity first', async () => {
    renderAs('DEPT_ADMIN')
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Meera Rathod')).toBeInTheDocument()      // HIGH before MEDIUM
    expect(within(rows[1]).getByText('802')).toBeInTheDocument()
    expect(within(rows[1]).getByTitle('Conflicting entitlement')).toBeInTheDocument()
    expect(within(rows[1]).getByText('₹10,000')).toBeInTheDocument()
    expect(within(rows[1]).getByText('High')).toBeInTheDocument()
  })

  it('opens citizen profile from case detail person name', async () => {
    renderAs('DEPT_ADMIN')
    await openMeera()
    fireEvent.click(within(screen.getByLabelText('Case detail')).getByRole('button', { name: 'Meera Rathod' }))
    await waitFor(() => expect(fetchCitizenFamily).toHaveBeenCalledWith('a5000000-0000-0000-0000-000000000005'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Citizen Profile/)).toBeInTheDocument()
    expect(screen.getAllByText('Meera Rathod').length).toBeGreaterThan(1)
  })

  it('shows payroll chip and opens person view from the inbox name', async () => {
    const { fetchLinkedRegistryIds, fetchPersonOverview } = await import('../api')
    fetchLinkedRegistryIds.mockResolvedValue({ linkedPersonIds: ['50000005-0000-0000-0000-000000000001'] })
    fetchPersonOverview.mockResolvedValue({
      personName: 'Meera Rathod',
      linked: true,
      beneficiary: { alerts: [], entitlements: [], totalAtStake: 0 },
      payroll: { employeeCode: 'GJ-X', alerts: [], totalAtStake: 0 },
    })
    fetchIntegrityAlerts.mockResolvedValue([{ ...ALERTS[1], personId: '50000005-0000-0000-0000-000000000001' }])
    renderAs('DEPT_ADMIN')
    await waitFor(() => expect(screen.getByText('Also appears in payroll')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Meera Rathod' }))
    await screen.findByText('Beneficiary payments')
  })

  it('shows pending recovery for the requester and approve for another officer', async () => {
    localStorage.setItem('officer_sub', 'sub-maker')
    fetchIntegrityCase.mockResolvedValue({
      ...CASE,
      caseEntity: { ...CASE.caseEntity, classification: 'CONFIRMED_OVERPAYMENT', status: 'DECIDED' },
      actions: [{
        id: 'act-pending',
        actionType: 'RECOVERY_RECORD',
        actionStatus: 'PENDING',
        externalRef: 'GOV-INT-PENDING01',
        requestedBy: 'sub-maker',
        requestedByRole: 'DEPT_ADMIN',
      }],
    })
    const { unmount } = renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByText(/Waiting for approval/)).toBeInTheDocument()
    expect(screen.getByText(/second officer must approve/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve recovery' })).not.toBeInTheDocument()
    unmount()

    localStorage.setItem('officer_sub', 'sub-checker')
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByRole('button', { name: 'Approve recovery' })).toBeInTheDocument()
  })

  it('downloads case file HTML and JSON from the case detail', async () => {
    fetchCaseFileExport.mockResolvedValueOnce('<html><body>Case file</body></html>')
    fetchCaseFileExport.mockResolvedValueOnce({ header: { caseReference: 'c1' } })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderAs('DEPT_ADMIN')
    await openMeera()
    fireEvent.click(screen.getByRole('button', { name: 'Download case file' }))
    await waitFor(() => expect(fetchCaseFileExport).toHaveBeenCalledWith('c1', 'html'))
    expect(openSpy).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Download data (JSON)' }))
    await waitFor(() => expect(fetchCaseFileExport).toHaveBeenCalledWith('c1', 'json'))
    expect(linkClick).toHaveBeenCalled()
    openSpy.mockRestore()
    linkClick.mockRestore()
  })

  it('explains the case in words and figures, not raw JSON', async () => {
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByText(/₹20,000 was settled against an entitlement of ₹10,000/)).toBeInTheDocument()
    expect(screen.getByText('Authorised entitlement')).toBeInTheDocument()
    expect(screen.getByText('Paid more than the authorised amount')).toBeInTheDocument()
    expect(screen.getByText('GOV-INT-ABCD1234')).toBeInTheDocument()
    expect(screen.queryByText(/"netSettled"/)).toBeNull()
    expect(screen.queryByText(/"unitIds"/)).toBeNull()
    expect(screen.queryByRole('button', { name: /raw evidence/i })).toBeNull()
  })

  it('describes supporting evidence in words, not record ids', async () => {
    fetchIntegrityAlerts.mockResolvedValue([{
      id: 'a8', caseId: 'c8', ruleCode: '801', severity: 'HIGH', personName: 'Vimal Mali', amountDelta: 0, schemeName: 'MYSY',
      evidence: { activeEnrollments: 2, unitIds: ['c3850ebf-09ae-50b4-86b2-4b044ef527de', '6bda345d-86c7-58c5-8976-dadfc3eea6a7'] },
    }])
    fetchIntegrityCase.mockResolvedValue({
      caseEntity: { id: 'c8', status: 'OPEN', classification: null, decisionText: null, noticeRequired: false },
      alerts: [{
        id: 'a8', caseId: 'c8', ruleCode: '801', severity: 'HIGH', personName: 'Vimal Mali', schemeName: 'MYSY',
        evidence: { activeEnrollments: 2, unitIds: ['c3850ebf-09ae-50b4-86b2-4b044ef527de', '6bda345d-86c7-58c5-8976-dadfc3eea6a7'] },
      }],
      actions: [],
      auditLog: [],
      evidenceContext: {
        entitlementUnit: { familyId: 'fam-1', personName: 'Vimal Mali' },
        relatedEntitlements: [
          { schemeName: 'MYSY', periodStart: '2024-04-01', periodEnd: '2025-03-31', authorizedAmount: 10000, status: 'ACTIVE', district: 'Ahmedabad', taluka: 'Bavla' },
          { schemeName: 'MYSY', periodStart: '2024-06-01', periodEnd: '2025-03-31', authorizedAmount: 10000, status: 'ACTIVE', district: 'Ahmedabad', taluka: 'Bavla' },
        ],
      },
    })
    renderAs('DEPT_ADMIN')
    fireEvent.click((await screen.findByText('Vimal Mali')).closest('tr'))
    expect(await screen.findByText(/2 active enrolments in the same scheme/)).toBeInTheDocument()
    expect(screen.getByText('Active enrollments')).toBeInTheDocument()
    expect(screen.getByText('2 entitlements')).toBeInTheDocument()
    expect(screen.queryByText(/c3850ebf/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /show supporting details/i }))
    expect(screen.getByText(/Enrolments involved/i)).toBeInTheDocument()
    expect(screen.getAllByText(/MYSY/).length).toBeGreaterThan(1)
    expect(screen.getAllByText(/Bavla/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/"unitIds"/)).toBeNull()
  })

  it('shows an overlap period as dates, including alerts saved with [y, m, d] arrays', async () => {
    const mutual = { ...ALERTS[1], evidence: { variant: 'MUTUAL_EXCLUSION', overlapStart: [2024, 9, 1], overlapEnd: '2025-03-31', conflictingSchemeName: 'Widow Pension', conflictingUnitId: 'e1000003-0000-0000-0000-000000000003' } }
    fetchIntegrityCase.mockResolvedValue({ ...CASE, alerts: [mutual] })
    renderAs('DEPT_ADMIN')
    fireEvent.click((await screen.findByText('Meera Rathod')).closest('tr'))
    await screen.findByText('Overlap starts')
    const labels = screen.getAllByText(/^(Overlap starts|Overlap ends)$/).map((n) => n.textContent)
    expect(labels).toEqual(['Overlap starts', 'Overlap ends'])
    expect(document.querySelector('.ei-evidence').textContent).not.toMatch(/e1000003/)   // internal ids stay out of the panel
    expect(screen.queryByText(/3 items/)).toBeNull()
    expect(screen.getByText(/Sep 2024|1 Sept 2024|1 Sep 2024/)).toBeInTheDocument()
  })

  it('explains an overlapping-salary case with the dates, both payments and the excess', async () => {
    const s01 = {
      id: 'a9', caseId: 'c9', ruleCode: 'S01', severity: 'HIGH', personName: 'Demo Transfer Officer', amountDelta: 42000, schemeName: null,
      evidence: {
        employeeCode: 'GJ-DEMO-TRANSFER-01', post: 'Clerk', payLevel: 'L5', ddoCode: 'DDO-A', employmentStatus: 'ACTIVE',
        ddoA: 'DDO-A', periodA: '2024-07-01 to 2024-07-31', amountA: 42000, ddoB: 'DDO-B', periodB: '2024-07-01 to 2024-07-31', amountB: 42000,
        overlapStart: '2024-07-01', overlapEnd: '2024-07-31', overlapDays: 31, possibleExcess: 42000, payrollA: 'x', payrollB: 'y',
      },
    }
    fetchIntegrityAlerts.mockResolvedValue([s01])
    fetchIntegrityCase.mockResolvedValue({ ...CASE, alerts: [s01] })
    localStorage.setItem('officer_role', 'DEPT_ADMIN')
    render(<MemoryRouter initialEntries={['/?domain=payroll']}><ExpenditureIntegrity /></MemoryRouter>)
    expect(await screen.findByText('Clerk · DDO-A')).toBeInTheDocument()                 // the payroll inbox shows post and DDO, not a blank scheme
    expect(screen.getByRole('columnheader', { name: /Post · DDO/ })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/comma-separated/i)).toBeNull()                 // no district filter for payroll
    fireEvent.click(screen.getByText('Demo Transfer Officer').closest('tr'))
    expect(await screen.findByText(/both paid basic salary for 31 of the same days \(2024-07-01 to 2024-07-31\)/)).toBeInTheDocument()
    expect(screen.getByText(/about ₹42,000 more than one month's pay/)).toBeInTheDocument()
    expect(screen.getByText('Days paid twice')).toBeInTheDocument()
    expect(screen.getByText('Possible excess')).toBeInTheDocument()
    expect(screen.getByText('First DDO paid for')).toBeInTheDocument()
    expect(screen.getByText('Pay level')).toBeInTheDocument()
    expect(document.querySelector('.ei-evidence').textContent).not.toMatch(/payrollA|\bx\b/)   // internal ids stay out of the panel
  })

  it('explains a record-verification case as a request for evidence, not an accusation', async () => {
    const s06 = {
      id: 'a8', caseId: 'c8', ruleCode: 'S06', severity: 'MEDIUM', personName: 'Demo Pensioner', amountDelta: null, schemeName: null,
      evidence: {
        employeeCode: 'GJ-DEMO-PENSION-01', post: 'Retired Teacher', payLevel: 'L7', ddoCode: 'DDO-PENSION', employmentStatus: 'RETIRED',
        reasons: ['UNEXPLAINED_BANK_CHANGE', 'LIFE_CERTIFICATE_OVERDUE'], unexplainedBankChanges: 1, lastLifeCertificate: 'none on record',
      },
    }
    fetchIntegrityAlerts.mockResolvedValue([s06])
    fetchIntegrityCase.mockResolvedValue({ ...CASE, alerts: [s06] })
    localStorage.setItem('officer_role', 'DEPT_ADMIN')
    render(<MemoryRouter initialEntries={['/?domain=payroll']}><ExpenditureIntegrity /></MemoryRouter>)
    fireEvent.click((await screen.findByText('Demo Pensioner')).closest('tr'))
    expect(await screen.findByText(/Records need checking: bank account changed without an approval reference; life certificate missing or over a year old/)).toBeInTheDocument()
    expect(screen.getByText(/not proof that someone has died/)).toBeInTheDocument()
    expect(screen.getByText('Bank account changed without an approval reference; Life certificate missing or over a year old')).toBeInTheDocument()
    expect(screen.getByText('Last life certificate')).toBeInTheDocument()
    expect(screen.getByText('none on record')).toBeInTheDocument()
    expect(screen.queryByText('Service order on file')).toBeNull()      // not asked of a pensioner
  })

  it('explains a bank-change concentration, and says how many approved batch changes were left out', async () => {
    const c805 = { id: 'a7', caseId: 'c7', ruleCode: '805', severity: 'MEDIUM', personName: 'Operator OP-DEMO-805', amountDelta: null, schemeName: null,
      evidence: { operatorId: 'OP-DEMO-805', bankChanges30d: 6, approvedBatchChangesLeftOut: 8 } }
    fetchIntegrityAlerts.mockResolvedValue([c805])
    fetchIntegrityCase.mockResolvedValue({ ...CASE, alerts: [c805] })
    renderAs('DEPT_ADMIN')
    fireEvent.click((await screen.findByText('Operator OP-DEMO-805')).closest('tr'))
    expect(await screen.findByText(/replaced 6 bank accounts in 30 days without a batch approval \(not counting 8 changes in approved batch migrations\)/)).toBeInTheDocument()
    expect(screen.getByText(/review this operator's access/)).toBeInTheDocument()
    expect(screen.getByText('Approved batch changes left out')).toBeInTheDocument()
  })

  it('does not offer the payroll tab to a scheme officer, even if the address asks for it', async () => {
    localStorage.setItem('officer_role', 'SCHEME_DEPT')
    render(<MemoryRouter initialEntries={['/?domain=payroll']}><ExpenditureIntegrity /></MemoryRouter>)
    await screen.findByText('Meera Rathod')
    expect(screen.queryByRole('tab', { name: /payroll/i })).toBeNull()
    expect(screen.getByRole('tab', { name: /beneficiary payments/i })).toBeInTheDocument()
    expect(fetchIntegrityAlerts).toHaveBeenCalledWith('BENEFICIARY', 'OPEN', expect.any(Object))
    expect(fetchIntegrityAlerts).not.toHaveBeenCalledWith('PAYROLL', 'OPEN')
  })

  it('takes a payroll reviewer straight to payroll, where they can decide but not record outcomes', async () => {
    localStorage.setItem('officer_role', 'PAYROLL_REVIEWER')
    render(<MemoryRouter><ExpenditureIntegrity /></MemoryRouter>)
    await screen.findByText('Meera Rathod')
    expect(fetchIntegrityAlerts).toHaveBeenCalledWith('PAYROLL', 'OPEN', expect.any(Object))
    expect(screen.queryByRole('tab', { name: /beneficiary payments/i })).toBeNull()
    fireEvent.click(screen.getByText('Meera Rathod').closest('tr'))
    await screen.findByText(/more than authorised/i)
    expect(screen.getByPlaceholderText(/what did you check/i)).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeDisabled()
  })

  it('lets a finance officer record outcomes but not decide', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('CONFIRMED_OVERPAYMENT'))
    localStorage.setItem('officer_role', 'FINANCE_OFFICER')
    render(<MemoryRouter><ExpenditureIntegrity /></MemoryRouter>)
    await screen.findByText('Meera Rathod')
    expect(screen.getByRole('tab', { name: /beneficiary payments/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payroll/i })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Meera Rathod').closest('tr'))
    await screen.findByText(/more than authorised/i)
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeEnabled()
    expect(screen.getByPlaceholderText(/what did you check/i)).toBeDisabled()
  })

  it('offers no outcome except closing until a decision is recorded, and says why', async () => {
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Master correction' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close without action' })).toBeEnabled()
    expect(screen.getByText(/record a decision first/i)).toBeInTheDocument()
  })

  it('offers a recovery only once the overpayment is confirmed', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('SUSPECTED_OVERPAYMENT'))
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByRole('button', { name: 'Master correction' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeDisabled()
    expect(screen.getByText(/a recovery needs the overpayment to be confirmed/i)).toBeInTheDocument()
  })

  it('locks a closed case', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('DISMISSED', 'CLOSED'))
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.getByText(/this case is closed\. reopen on appeal/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/what did you check/i)).toBeDisabled()
    for (const name of ['Master correction', 'Payment adjustment', 'Recovery', 'Close without action']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('shows what the service says when it refuses an outcome', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('CONFIRMED_OVERPAYMENT'))
    postIntegrityAction.mockRejectedValue(new Error('This case is closed and takes no further changes.'))
    renderAs('DEPT_ADMIN')
    await openMeera()
    fireEvent.click(screen.getByRole('button', { name: 'Recovery' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('closed and takes no further changes')
  })

  it('keeps the resolved alerts reachable, and refreshes the inbox after an outcome', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('CONFIRMED_OVERPAYMENT'))
    postIntegrityAction.mockResolvedValue({ externalRef: 'GOV-INT-NEW00001' })
    renderAs('DEPT_ADMIN')
    await openMeera()
    fetchIntegrityAlerts.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Recovery' }))
    await screen.findByText(/GOV-INT-NEW00001/)
    await waitFor(() => expect(fetchIntegrityAlerts).toHaveBeenCalledWith('BENEFICIARY', 'OPEN', expect.any(Object)))    // the alert has left the inbox
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }))
    await waitFor(() => expect(fetchIntegrityAlerts).toHaveBeenCalledWith('BENEFICIARY', 'RESOLVED', expect.any(Object)))
  })

  it('lists recovery cases from the Recoveries filter and the recoveries KPI', async () => {
    fetchIntegrityAlerts.mockResolvedValue([
      { id: 'r1', caseId: 'c-rec', ruleCode: '802', severity: 'HIGH', personName: 'Kinjal Koli', amountDelta: 5000, schemeName: 'MYSY' },
    ])
    fetchIntegrityMetrics.mockResolvedValue({ openAlerts: 2, verifiedOverpaymentAmount: 0, recoveryActionsRecorded: 10 })
    renderAs('DEPT_ADMIN')
    fireEvent.click(await screen.findByRole('button', { name: 'Recoveries' }))
    await waitFor(() => expect(fetchIntegrityAlerts).toHaveBeenCalledWith(
      'BENEFICIARY',
      'RESOLVED',
      expect.objectContaining({ actionType: 'RECOVERY_RECORD' }),
    ))
    expect(await screen.findByText('Kinjal Koli')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /open/i }))
    fetchIntegrityAlerts.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /recoveries recorded/i }))
    await waitFor(() => expect(fetchIntegrityAlerts).toHaveBeenCalledWith(
      'BENEFICIARY',
      'RESOLVED',
      expect.objectContaining({ actionType: 'RECOVERY_RECORD' }),
    ))
  })

  it('will not save a decision without a reason', async () => {
    renderAs('SCHEME_DEPT')
    await openMeera()
    const save = screen.getByRole('button', { name: /save decision/i })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/what did you check/i), { target: { value: 'Two settled payments, one entitlement' } })
    expect(save).toBeEnabled()
    postIntegrityDecision.mockResolvedValue({})
    fireEvent.click(save)
    await waitFor(() => expect(postIntegrityDecision).toHaveBeenCalledWith('c1', 'SUSPECTED_OVERPAYMENT', 'Two settled payments, one entitlement', false))
    expect(await screen.findByText('Decision saved.')).toBeInTheDocument()
  })

  it('lets only a Department Admin record outcomes', async () => {
    renderAs('SCHEME_DEPT')
    await openMeera()
    expect(screen.getByRole('button', { name: 'Recovery' })).toBeDisabled()
    expect(screen.getByText(/only a department admin or a finance officer can record/i)).toBeInTheDocument()
  })

  it('records a recovery as a Department Admin and shows the reference', async () => {
    fetchIntegrityCase.mockResolvedValue(decided('CONFIRMED_OVERPAYMENT'))
    postIntegrityAction.mockResolvedValue({ externalRef: 'GOV-INT-NEW00001' })
    renderAs('DEPT_ADMIN')
    await openMeera()
    fireEvent.click(screen.getByRole('button', { name: 'Recovery' }))
    await waitFor(() => expect(postIntegrityAction).toHaveBeenCalledWith('c1', 'RECOVERY_RECORD', expect.any(Object)))
    expect(await screen.findByText(/GOV-INT-NEW00001/)).toBeInTheDocument()
  })

  it('keeps an IT admin read-only on decisions and shows them the detection controls', async () => {
    renderAs('IT_ADMIN')
    await openMeera()
    expect(screen.getByText(/can view cases but not record decisions/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/what did you check/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument()
  })

  it('hides detection controls from roles that cannot run it', async () => {
    renderAs('REVENUE_OFFICER')
    await screen.findByText('Meera Rathod')
    expect(screen.queryByRole('button', { name: /run detection/i })).toBeNull()
  })

  it('runs detection and reports what it found', async () => {
    runIntegrityDetection.mockResolvedValue({ alertsCreated: 3 })
    renderAs('DEPT_ADMIN')
    await screen.findByText('Meera Rathod')
    fireEvent.click(screen.getByRole('button', { name: /run detection/i }))
    expect(await screen.findByText(/3 new alerts/)).toBeInTheDocument()
  })

  it('does not announce an empty payroll detection run', async () => {
    runIntegrityDetection.mockResolvedValue({ alertsCreated: 0 })
    renderAs('DEPT_ADMIN')
    fireEvent.click(await screen.findByRole('tab', { name: /payroll/i }))
    fireEvent.click(await screen.findByRole('button', { name: /run detection/i }))
    await waitFor(() => expect(runIntegrityDetection).toHaveBeenCalled())
    expect(screen.queryByText(/nothing new found/i)).toBeNull()
    expect(screen.queryByText(/detection finished/i)).toBeNull()
    expect(runIntegrityDetection).toHaveBeenCalledWith(expect.objectContaining({
      domains: ['PAYROLL'],
      periodStart: '2024-04-01',
      periodEnd: '2025-03-31',
    }))
  })

  it('loads every open payroll alert until a pay period is chosen', async () => {
    const s06 = {
      id: 'a8', caseId: 'c8', ruleCode: 'S06', severity: 'MEDIUM', personName: 'Demo Pensioner',
      evidence: { employeeCode: 'GJ-DEMO-PENSION-01', post: 'Retired Teacher', ddoCode: 'DDO-PENSION', reasons: ['LIFE_CERTIFICATE_OVERDUE'] },
    }
    fetchIntegrityAlerts.mockResolvedValue([s06])
    render(<MemoryRouter initialEntries={['/?domain=payroll']}><ExpenditureIntegrity /></MemoryRouter>)
    await screen.findByText('Demo Pensioner')
    expect(fetchIntegrityAlerts).toHaveBeenCalledWith('PAYROLL', 'OPEN', expect.objectContaining({
      periodStart: undefined,
      periodEnd: undefined,
    }))
    fireEvent.change(screen.getByLabelText('Pay period from'), { target: { value: '2024-04-01' } })
    fireEvent.change(screen.getByLabelText('Pay period to'), { target: { value: '2025-03-31' } })
    await waitFor(() => expect(fetchIntegrityAlerts).toHaveBeenCalledWith('PAYROLL', 'OPEN', expect.objectContaining({
      periodStart: '2024-04-01',
      periodEnd: '2025-03-31',
    })))
  })

  it('shows a readable error when the service refuses', async () => {
    postIntegrityDecision.mockRejectedValue(new Error('Your role is not allowed to do this.'))
    renderAs('DEPT_ADMIN')
    await openMeera()
    fireEvent.change(screen.getByPlaceholderText(/what did you check/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /save decision/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role is not allowed to do this.')
  })

  it('shows an empty state and an error when alerts cannot load', async () => {
    fetchIntegrityAlerts.mockRejectedValue(new Error('Your session has expired. Please sign in again.'))
    renderAs('DEPT_ADMIN')
    expect(await screen.findByRole('alert')).toHaveTextContent('session has expired')
    expect(screen.getByText(/no open alerts/i)).toBeInTheDocument()
  })

  it('paginates the alert inbox with 10, 20, 50 and 100 per page', async () => {
    fetchIntegrityAlerts.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      caseId: `c${i}`,
      ruleCode: i < 10 ? '802' : '805',
      severity: i < 10 ? 'HIGH' : 'MEDIUM',
      personName: `Person ${String(i).padStart(2, '0')}`,
      amountDelta: i * 1000,
      schemeName: 'MYSY',
    })))
    renderAs('DEPT_ADMIN')
    await screen.findByText('Person 00')
    const size = screen.getByLabelText('Alerts per page')
    expect([...size.options].map((o) => o.value)).toEqual(['10', '20', '50', '100'])
    expect(size.value).toBe('10')
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText(/12 alerts/)).toBeInTheDocument()
    expect(screen.queryByText('Person 10')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Person 10')).toBeInTheDocument()
    fireEvent.change(size, { target: { value: '20' } })
    expect(screen.getByText('Person 00')).toBeInTheDocument()
    expect(screen.getByText('Person 10')).toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
  })

  it('filters the alert inbox by person name', async () => {
    renderAs('DEPT_ADMIN')
    const inbox = await screen.findByLabelText('Alert inbox')
    expect(within(inbox).getByText('Meera Rathod')).toBeInTheDocument()
    expect(within(inbox).getByText('Operator OP-DEMO-805')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search person name'), { target: { value: 'meera' } })
    expect(within(inbox).getByText('Meera Rathod')).toBeInTheDocument()
    expect(within(inbox).queryByText('Operator OP-DEMO-805')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search person name'), { target: { value: 'nobody-here' } })
    expect(screen.getByText(/no alerts match that person name/i)).toBeInTheDocument()
  })

  it('sorts the alert inbox when a column header is clicked', async () => {
    renderAs('DEPT_ADMIN')
    const inbox = await screen.findByLabelText('Alert inbox')
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('Meera Rathod')
    fireEvent.click(within(inbox).getByRole('button', { name: /rule/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('802')
    fireEvent.click(within(inbox).getByRole('button', { name: /rule/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('805')
    fireEvent.click(within(inbox).getByRole('button', { name: /person/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('Meera Rathod')
    fireEvent.click(within(inbox).getByRole('button', { name: /person/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('Operator OP-DEMO-805')
    fireEvent.click(within(inbox).getByRole('button', { name: /scheme/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('Operator OP-DEMO-805')
    fireEvent.click(within(inbox).getByRole('button', { name: /scheme/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('MYSY')
    fireEvent.click(within(inbox).getByRole('button', { name: /amount/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('₹10,000')
    fireEvent.click(within(inbox).getByRole('button', { name: /severity/i }))
    expect(within(inbox).getAllByRole('row')[1]).toHaveTextContent('Meera Rathod')
  })

  it('explains a salaried-beneficiary alert with a pay band, never a salary', async () => {
    const alert = { id: 'a7', caseId: 'c7', ruleCode: '807', severity: 'HIGH', personName: 'Ramesh Patel', amountDelta: 10000, schemeName: 'MYSY', district: 'Surat',
      evidence: { employeePost: 'Clerk', ddoCode: 'DDO-A', annualPayBand: '6-7 lakh a year', amountPaidWhileEmployed: 10000 } }
    fetchIntegrityAlerts.mockResolvedValue([alert])
    fetchIntegrityCase.mockResolvedValue({ ...CASE, caseEntity: { ...CASE.caseEntity, id: 'c7' }, alerts: [{ ...alert, personId: 'p7' }], actions: [] })
    renderAs('DEPT_ADMIN')
    fireEvent.click((await screen.findByText('Ramesh Patel')).closest('tr'))
    expect(await screen.findByText(/on a government payroll \(Clerk\) with pay of about 6-7 lakh a year/)).toBeInTheDocument()
    expect(screen.getAllByText(/Salaried beneficiary/).length).toBeGreaterThan(0)
  })

  it('lets an outcome role verify a case closed, with a note on how it was checked', async () => {
    fetchIntegrityCase.mockResolvedValue({ ...CASE, caseEntity: { ...CASE.caseEntity, status: 'ACTION_RECORDED', classification: 'CONFIRMED_OVERPAYMENT' } })
    postIntegrityVerifyClosed.mockResolvedValue({})
    renderAs('DEPT_ADMIN')
    await openMeera()
    const button = await screen.findByRole('button', { name: 'Verify closed' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('How you checked'), { target: { value: 'Register shows the corrected record' } })
    fireEvent.click(button)
    await waitFor(() => expect(postIntegrityVerifyClosed).toHaveBeenCalledWith('c1', 'Register shows the corrected record'))
  })

  it('does not offer verification before an outcome is recorded, or to a role that cannot record outcomes', async () => {
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(screen.queryByRole('button', { name: 'Verify closed' })).toBeNull()
  })

  it('asks which people on the page also appear in payroll once, not on every render', async () => {
    const { fetchLinkedRegistryIds } = await import('../api')
    fetchLinkedRegistryIds.mockClear()
    fetchIntegrityAlerts.mockResolvedValue([{ ...ALERTS[1], personId: 'p-1' }])
    renderAs('DEPT_ADMIN')
    await screen.findByText('Meera Rathod')
    await new Promise((r) => setTimeout(r, 300))
    expect(fetchLinkedRegistryIds.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('says which role verified a case closed, not a raw user id', async () => {
    fetchIntegrityCase.mockResolvedValue({
      ...CASE,
      caseEntity: { ...CASE.caseEntity, status: 'CLOSED', classification: 'CONFIRMED_OVERPAYMENT', verifiedAt: '2026-10-08T10:00:00', verifiedBy: '7bc608e4-a6ba-452a-b29d-2df1421443ab', verificationNote: 'Treasury receipt seen' },
      auditLog: [{ id: 'l9', createdAt: '2026-10-08T10:00:00', actorRole: 'DEPT_ADMIN', action: 'VERIFIED_CLOSED' }],
    })
    renderAs('DEPT_ADMIN')
    await openMeera()
    expect(await screen.findByText(/Verified closed by Dept admin: Treasury receipt seen/)).toBeInTheDocument()
    expect(screen.queryByText(/7bc608e4/)).toBeNull()
  })
})
