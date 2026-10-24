import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchIntegrityAlerts,
  fetchIntegrityCase,
  postIntegrityAction,
  postIntegrityApproveRecovery,
  postIntegrityRejectRecovery,
  postIntegrityVerifyClosed,
  postIntegrityDecision,
  fetchIntegrityNoticeDraft,
  postIntegrityNoticeIssue,
  postIntegrityNoticeResponse,
  postIntegrityReopen,
  runIntegrityDetection,
  fetchIntegrityMetrics,
  fetchSchemes,
  fetchBeneficiaryGeoOptions,
  fetchTalukasForDistrict,
  fetchPayrollFilterOptions,
  fetchCaseFileExport,
  fetchLinkedRegistryIds,
} from '../api'
import { normalizeOfficerRole, officerHasFeature } from '../auth'
import PaymentGate from './PaymentGate'
import WhatIfPanel from './WhatIfPanel'
import PersonViewPanel from './PersonViewPanel'
import CitizenProfileModal from '../components/CitizenProfileModal'
import CaseTimeline from '../components/CaseTimeline'
import './ExpenditureIntegrity.css'

const RULE_NAMES = {
  801: 'Repeated enrollment',
  802: 'Conflicting entitlement',
  803: 'Payment after verified event',
  804: 'Shared bank destination',
  805: 'Bank-change concentration',
  806: 'Eligibility mismatch',
  807: 'Salaried beneficiary',
  S01: 'Overlapping salary',
  S02: 'Post-event entitlement',
  S03: 'Excess allowance',
  S04: 'Duplicate arrears',
  S05: 'Pension mismatch',
  S06: 'Record verification risk',
}

const CLASSIFICATIONS = [
  { id: 'LEGITIMATE_EXCEPTION', label: 'Legitimate exception' },
  { id: 'DATA_ERROR', label: 'Data error' },
  { id: 'SUSPECTED_OVERPAYMENT', label: 'Suspected overpayment' },
  { id: 'CONFIRMED_OVERPAYMENT', label: 'Confirmed overpayment' },
  { id: 'DISMISSED', label: 'Dismissed' },
]

const ACTION_TYPES = [
  { id: 'MASTER_CORRECTION', label: 'Master correction', hint: 'Fix the beneficiary or employee record' },
  { id: 'PAYMENT_ADJUSTMENT', label: 'Payment adjustment', hint: 'Adjust a future or past payment' },
  { id: 'RECOVERY_RECORD', label: 'Recovery', hint: 'Record that an overpayment is to be recovered' },
  { id: 'DISMISS', label: 'Close without action', hint: 'Nothing further to do' },
]

const VARIANT_TEXT = {
  OVER_SETTLEMENT: 'Paid more than the authorised amount',
  MUTUAL_EXCLUSION: 'Holds two schemes that cannot be held together',
}

const EVIDENCE_LABELS = {
  variant: 'Finding',
  authorizedAmount: 'Authorised entitlement',
  netSettled: 'Net settled',
  paymentIds: 'Payments involved',
  unitIds: 'Entitlements involved',
  mutualExclusionConflict: 'Also holds an exclusive scheme',
  conflictingSchemeName: 'Conflicts with scheme',
  conflictingUnitId: 'Conflicting entitlement',
  overlapStart: 'Overlap starts',
  overlapEnd: 'Overlap ends',
  settledOnLaterEntitlement: 'Paid on the later entitlement',
  eventType: 'Event',
  eventDate: 'Event date',
  graceDays: 'Grace days',
  distinctPeople: 'Different people / families',
  distinctUnits: 'Entitlements',
  bankToken: 'Bank account (masked)',
  operatorId: 'Operator',
  bankChanges30d: 'Bank changes in 30 days (not in an approved batch)',
  approvedBatchChangesLeftOut: 'Approved batch changes left out',
  employeeCode: 'Employee code',
  post: 'Post',
  payLevel: 'Pay level',
  ddoCode: 'DDO',
  employmentStatus: 'Employment status',
  ddoA: 'First DDO',
  periodA: 'First DDO paid for',
  amountA: 'First DDO paid',
  ddoB: 'Second DDO',
  periodB: 'Second DDO paid for',
  amountB: 'Second DDO paid',
  overlapDays: 'Days paid twice',
  possibleExcess: 'Possible excess',
  period: 'Pay period',
  expectedSplitDays: 'Expected split (days)',
  authorizedRate: 'Authorised pension rate',
  settledAmount: 'Settled amount',
  ppoId: 'PPO',
  reasons: 'Why it was flagged',
  serviceOrderOnFile: 'Service order on file',
  unexplainedBankChanges: 'Recent bank changes with no approval',
  lastLifeCertificate: 'Last life certificate',
  missingServiceOrder: 'No service order on file',
  staleLifeCertificate: 'No life certificate on file',
  duplicateCount: 'Times paid',
  incomeSnapshot: 'Income on record',
  ageSnapshot: 'Age on record',
  activeEnrollments: 'Active enrollments',
  bankAccount: 'Bank account (masked)',
  transactionRef: 'Transaction reference',
  status: 'Status',
}

const REASON_TEXT = {
  MISSING_SERVICE_ORDER: 'No service order on file',
  UNEXPLAINED_BANK_CHANGE: 'Bank account changed without an approval reference',
  LIFE_CERTIFICATE_OVERDUE: 'Life certificate missing or over a year old',
}

// Mirrors the service's rules (OfficerSecurityConfig and DomainAccess): payroll cases show salaries, so they are
// open only to payroll and finance roles; the service is what enforces it, this only avoids offering what would be refused.
const READ_ROLES = {
  BENEFICIARY: ['SCHEME_DEPT', 'DEPT_ADMIN', 'REVENUE_OFFICER', 'IT_ADMIN', 'FINANCE_OFFICER'],
  PAYROLL: ['DEPT_ADMIN', 'PAYROLL_REVIEWER', 'FINANCE_OFFICER', 'HR_OFFICER'],
}
const REVIEW_ROLES = {
  BENEFICIARY: ['SCHEME_DEPT', 'DEPT_ADMIN', 'REVENUE_OFFICER'],
  PAYROLL: ['DEPT_ADMIN', 'PAYROLL_REVIEWER'],
}
const ACTION_ROLES = ['DEPT_ADMIN', 'FINANCE_OFFICER']
const GATE_ROLES = ['DEPT_ADMIN', 'FINANCE_OFFICER']
const RUN_ROLES = ['IT_ADMIN', 'DEPT_ADMIN']

const PILOT_DISTRICTS = ['Banaskantha', 'Ahmedabad', 'Surat']
const DEFAULT_PAYROLL_PERIOD_START = '2024-04-01'
const DEFAULT_PAYROLL_PERIOD_END = '2025-03-31'

function payrollPeriodValid(start, end) {
  if (!start || !end) return true
  return start <= end
}

const ruleLabel = (code) => RULE_NAMES[code] ?? `Rule ${code}`

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function schemeOrPost(alert, domain) {
  if (domain === 'PAYROLL') return [alert.evidence?.post, alert.evidence?.ddoCode].filter(Boolean).join(' · ')
  return alert.schemeName || ''
}

function alertSortValue(alert, field, domain) {
  if (field === 'rule') return String(alert.ruleCode || '')
  if (field === 'person') return String(alert.personName || '')
  if (field === 'scheme') return schemeOrPost(alert, domain)
  if (field === 'amount') return Number(alert.amountDelta ?? 0)
  if (field === 'severity') return SEVERITY_ORDER[alert.severity] ?? 9
  if (field === 'priority') return Number(alert.priority ?? 0)
  return ''
}
const AMOUNT_KEY = /amount|settled|rate|income|excess/i
const HIDDEN_EVIDENCE = new Set([
  'guestEvaluation', 'payrollA', 'payrollB', 'payrollId', 'payrollIds', 'payments', 'paymentId',
  'conflictingUnitId', 'conflictingSchemeId',     // internal ids: the scheme name is shown instead
])
const ID_ARRAY_NOUN = {
  unitIds: 'entitlement',
  paymentIds: 'payment',
  payrollIds: 'payroll record',
}
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
// the order an officer reads it in; anything not listed follows
const EVIDENCE_ORDER = [
  'employeeCode', 'post', 'payLevel', 'ddoCode', 'employmentStatus', 'reasons', 'serviceOrderOnFile', 'unexplainedBankChanges', 'lastLifeCertificate',
  'ddoA', 'periodA', 'amountA', 'ddoB', 'periodB', 'amountB', 'overlapDays', 'possibleExcess',
  'variant', 'authorizedAmount', 'netSettled', 'settledOnLaterEntitlement', 'conflictingSchemeName',
  'overlapStart', 'overlapEnd', 'eventType', 'eventDate', 'graceDays',
]
const evidenceRank = (key) => { const i = EVIDENCE_ORDER.indexOf(key); return i === -1 ? EVIDENCE_ORDER.length : i }

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const words = (key) => EVIDENCE_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
const titleCase = (s) => String(s || '').toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

function formatDate(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => Number.isInteger(n))) {
    return new Date(value[0], value[1] - 1, value[2]).toLocaleDateString('en-IN', { dateStyle: 'medium' })
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

function formatPeriod(start, end) {
  const a = formatDate(start)
  const b = formatDate(end)
  if (!a && !b) return ''
  return `${a || '…'} – ${b || 'open'}`
}

function formatEvidence(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'variant') return VARIANT_TEXT[value] ?? titleCase(value)
  if (key === 'reasons' && Array.isArray(value)) return value.map((r) => REASON_TEXT[r] ?? titleCase(r)).join('; ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value) && value.length === 3 && value.every((n) => Number.isInteger(n)) && /Start|End|Date/.test(key)) {
    return formatDate(value)
  }
  if (Array.isArray(value)) {
    const noun = ID_ARRAY_NOUN[key]
    if (noun) return `${value.length} ${noun}${value.length === 1 ? '' : 's'}`
    if (value.every(isUuid)) return `${value.length} record${value.length === 1 ? '' : 's'}`
    return value.map((item) => (item && typeof item === 'object' ? 'On file' : String(item))).join(', ')
  }
  if (typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)) && AMOUNT_KEY.test(key))) {
    return AMOUNT_KEY.test(key) ? rupees(value) : String(value)
  }
  if (isUuid(value)) return 'On file'
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .filter(([k, v]) => !HIDDEN_EVIDENCE.has(k) && v != null && v !== '' && !isUuid(v) && !(Array.isArray(v) && v.every(isUuid)))
      .map(([k, v]) => `${words(k)}: ${formatEvidence(k, v)}`)
    return parts.length ? parts.join('; ') : 'On file'
  }
  if (/Start|End|Date/.test(key)) return formatDate(value) || String(value)
  if (key === 'status') return titleCase(value)
  return String(value)
}

function enrollmentLine(unit) {
  if (!unit || typeof unit !== 'object') return ''
  return [
    unit.schemeName,
    formatPeriod(unit.periodStart, unit.periodEnd),
    unit.authorizedAmount != null ? rupees(unit.authorizedAmount) : null,
    unit.status ? titleCase(unit.status) : null,
    [unit.district, unit.taluka].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ')
}

function paymentLine(p) {
  if (!p || typeof p !== 'object') return ''
  return [
    p.amount != null ? rupees(p.amount) : null,
    formatPeriod(p.periodStart, p.periodEnd),
    p.status ? titleCase(p.status) : null,
    p.bankAccount ? `account ${p.bankAccount}` : null,
    p.transactionRef ? `ref ${p.transactionRef}` : null,
  ].filter(Boolean).join(' · ')
}

/** One plain sentence on what the rule found, from the evidence. */
function summarise(alert) {
  if (!alert) return ''
  const e = alert.evidence ?? {}
  const delta = alert.amountDelta != null && Number(alert.amountDelta) > 0 ? rupees(alert.amountDelta) : null
  if (alert.ruleCode === '802' && e.variant !== 'MUTUAL_EXCLUSION' && e.netSettled != null) {
    return `${rupees(e.netSettled)} was settled against an entitlement of ${rupees(e.authorizedAmount)}${delta ? ` — ${delta} more than authorised` : ''}.`
  }
  if (alert.ruleCode === '802') {
    return `The same person holds this scheme and ${e.conflictingSchemeName ?? 'another scheme'} for overlapping periods, and the two cannot be held together${delta ? `; ${delta} has been paid on the later one` : ''}.`
  }
  if (alert.ruleCode === '801') {
    const n = Number(e.activeEnrollments)
    const howMany = Number.isFinite(n) && n > 0 ? n : 'more than one'
    return `This person has ${howMany} active enrolment${n === 1 ? '' : 's'} in the same scheme at the same time.`
  }
  if (alert.ruleCode === '805') {
    const out = e.approvedBatchChangesLeftOut ? ` (not counting ${e.approvedBatchChangesLeftOut} changes in approved batch migrations)` : ''
    return `Operator ${e.operatorId} replaced ${e.bankChanges30d} bank accounts in 30 days without a batch approval${out}. Check the approvals and each beneficiary's instruction, and review this operator's access.`
  }
  if (alert.ruleCode === 'S01') {
    if (e.overlapDays == null) return `Two DDOs (${e.ddoA}, ${e.ddoB}) paid basic salary for the same period${delta ? `: ${delta} paid twice` : ''}.`
    return `${e.ddoA} and ${e.ddoB} both paid basic salary for ${e.overlapDays} of the same days (${e.overlapStart} to ${e.overlapEnd})${delta ? `: about ${delta} more than one month's pay. Confirm the transfer date with HR before any recovery` : ''}.`
  }
  if (alert.ruleCode === '803') {
    const n = Array.isArray(e.paymentIds) ? e.paymentIds.length : (e.paymentId ? 1 : 0)
    const after = e.eventDate ? ` after ${e.eventDate}` : ''
    const grace = e.graceDays != null ? ` (${e.graceDays}-day grace applied)` : ''
    return n > 1
      ? `${n} settlements were recorded${after}${grace} — each pay period ends after the verified ${String(e.eventType || 'event').toLowerCase()}.`
      : `A settlement was recorded${after}${grace} for a pay period that ends after the verified ${String(e.eventType || 'event').toLowerCase()}.`
  }
  if (alert.ruleCode === '807') {
    return `This person is on a government payroll${e.employeePost ? ` (${e.employeePost})` : ''} with pay of about ${e.annualPayBand || 'an amount'}, which is above the scheme's income limit${delta ? `; ${delta} was paid while employed` : ''}. Confirm the link and the income rules before any recovery.`
  }
  if (alert.ruleCode === 'S05') return `Pension settled at ${rupees(e.settledAmount)} against an authorised rate of ${rupees(e.authorizedRate)}.`
  if (alert.ruleCode === 'S06' && Array.isArray(e.reasons)) {
    const what = e.reasons.map((r) => (REASON_TEXT[r] ?? r).replace(/^./, (c) => c.toLowerCase())).join('; ')
    return `Records need checking: ${what}. This asks for evidence and is not a finding about the person. A missing life certificate is not proof that someone has died.`
  }
  return `${RULE_NAMES[alert.ruleCode] ?? 'Rule'} was triggered${delta ? ` (${delta} at stake)` : ''}.`
}

function IntegrityPageHeader({ showDataLink, metrics, status, setStatus, setPage }) {
  return (
    <header className="ei-header">
      <div>
        <h1>Expenditure integrity</h1>
        <p className="ei-sub">Assurance over beneficiary settlements and payroll.</p>
      </div>
      <div className="ei-header-side">
        {showDataLink && (
          <Link to="/data" className="btn-secondary ei-header-action">📥 Data</Link>
        )}
        {metrics && (
          <dl className="ei-kpis" aria-label="Summary">
            <div><dt>Open alerts</dt><dd>{metrics.openAlerts}</dd></div>
            <div><dt>Resolved</dt><dd>{metrics.resolvedAlerts ?? 0}</dd></div>
            <div><dt>Verified overpayment</dt><dd>{rupees(metrics.verifiedOverpaymentAmount || 0)}</dd></div>
            <div className={status === 'RECOVERY' ? 'ei-kpi-wrap active' : 'ei-kpi-wrap'}>
              <button
                type="button"
                className="ei-kpi"
                aria-pressed={status === 'RECOVERY'}
                onClick={() => { setStatus('RECOVERY'); setPage(1) }}
              >
                <span className="ei-kpi-dt">Recoveries recorded</span>
                <span className="ei-kpi-dd">{metrics.recoveryActionsRecorded ?? 0}</span>
              </button>
            </div>
          </dl>
        )}
      </div>
    </header>
  )
}

export default function ExpenditureIntegrity() {
  const [params, setParams] = useSearchParams()
  const role = normalizeOfficerRole(localStorage.getItem('officer_role'))
  const showDataHub = officerHasFeature(role, 'dataImport')
  const canBeneficiary = READ_ROLES.BENEFICIARY.includes(role)
  const canPayroll = READ_ROLES.PAYROLL.includes(role)
  const wantsPayroll = params.get('domain') === 'payroll'
  // a role sees only the areas it may read; a payroll-only role lands on payroll
  const domain = (wantsPayroll && canPayroll) || (!canBeneficiary && canPayroll) ? 'PAYROLL' : 'BENEFICIARY'
  const canReview = REVIEW_ROLES[domain].includes(role)
  const canAct = ACTION_ROLES.includes(role)
  const canRun = RUN_ROLES.includes(role)
  const canGate = canBeneficiary                       // anyone who reads beneficiary cases can see the gate
  const canGateDecide = GATE_ROLES.includes(role)
  const canWhatIf = RUN_ROLES.includes(role)
  const showGate = params.get('view') === 'gate' && canGate
  const showWhatIf = params.get('view') === 'what-if' && canWhatIf

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('OPEN')           // the inbox shows open alerts; Resolved is the history
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [caseDetail, setCaseDetail] = useState(null)
  const [schemes, setSchemes] = useState([])
  const [filterSchemeId, setFilterSchemeId] = useState('')
  const [filterDistrict, setFilterDistrict] = useState(params.get('domain') === 'payroll' ? '' : params.get('district') || '')
  const [filterTaluka, setFilterTaluka] = useState('')
  const [payrollDistrict, setPayrollDistrict] = useState(params.get('domain') === 'payroll' ? params.get('district') || '' : '')
  const [payrollTaluka, setPayrollTaluka] = useState('')
  const [payrollDdo, setPayrollDdo] = useState('')
  const [payrollPeriodStart, setPayrollPeriodStart] = useState('')
  const [payrollPeriodEnd, setPayrollPeriodEnd] = useState('')
  const [districtOptions, setDistrictOptions] = useState(PILOT_DISTRICTS)
  const [talukaOptions, setTalukaOptions] = useState([])
  const [payrollDistrictOptions, setPayrollDistrictOptions] = useState(PILOT_DISTRICTS)
  const [payrollTalukaOptions, setPayrollTalukaOptions] = useState([])
  const [payrollDdoOptions, setPayrollDdoOptions] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [decision, setDecision] = useState({ classification: 'SUSPECTED_OVERPAYMENT', text: '', notice: false })
  const [noticeLang, setNoticeLang] = useState('en')
  const [noticeText, setNoticeText] = useState('')
  const [noticeResponse, setNoticeResponse] = useState({ kind: 'DISPUTED', note: '' })
  const [reopenReason, setReopenReason] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [verifyNote, setVerifyNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [personView, setPersonView] = useState(null)
  const [profileSubject, setProfileSubject] = useState(null)
  const [linkedPayroll, setLinkedPayroll] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortField, setSortField] = useState('severity')
  const [sortDir, setSortDir] = useState('asc')
  const [personQuery, setPersonQuery] = useState('')

  const fail = (err) => setMessage({ type: 'error', text: err?.message || 'Something went wrong.' })
  const ok = (text) => setMessage({ type: 'success', text })

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const scope = domain === 'PAYROLL'
        ? {
            district: payrollDistrict || undefined,
            taluka: payrollTaluka || undefined,
            ...(payrollDdo ? { ddoCode: payrollDdo } : {}),
            periodStart: payrollPeriodStart || undefined,
            periodEnd: payrollPeriodEnd || undefined,
          }
        : {
            district: filterDistrict || undefined,
            taluka: filterTaluka || undefined,
            ...(filterSchemeId ? { schemeId: filterSchemeId } : {}),
          }
      if (domain === 'PAYROLL' && !payrollPeriodValid(payrollPeriodStart, payrollPeriodEnd)) {
        setAlerts([])
        setMessage({ type: 'error', text: 'Pay period start must be on or before end.' })
        return
      }
      const alertStatus = status === 'RECOVERY' ? 'RESOLVED' : status
      if (status === 'RECOVERY') scope.actionType = 'RECOVERY_RECORD'
      const data = await fetchIntegrityAlerts(domain, alertStatus, scope)
      setAlerts(Array.isArray(data) ? data : [])
      setMessage((m) => (m?.type === 'error' ? null : m))
    } catch (err) {
      setAlerts([])
      setMessage({ type: 'error', text: err?.message || 'Could not load alerts.' })
    } finally {
      setLoading(false)
    }
  }, [domain, status, filterDistrict, filterTaluka, filterSchemeId, payrollDistrict, payrollTaluka, payrollDdo, payrollPeriodStart, payrollPeriodEnd])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    fetchIntegrityMetrics(domain).then(setMetrics).catch(() => setMetrics(null))
  }, [domain])

  useEffect(() => {
    if (domain !== 'BENEFICIARY') return
    fetchSchemes()
      .then((list) => setSchemes(Array.isArray(list) ? list.filter((s) => s.isActive !== false) : []))
      .catch(() => setSchemes([]))
  }, [domain])

  useEffect(() => {
    if (domain !== 'BENEFICIARY') return
    fetchBeneficiaryGeoOptions({ schemeId: filterSchemeId || undefined })
      .then((geo) => {
        const d = geo?.districts?.length ? geo.districts : PILOT_DISTRICTS
        setDistrictOptions(d)
      })
      .catch(() => setDistrictOptions(PILOT_DISTRICTS))
  }, [domain, filterSchemeId])

  useEffect(() => {
    if (domain !== 'BENEFICIARY') return
    if (filterDistrict && districtOptions.length && !districtOptions.includes(filterDistrict)) {
      setFilterDistrict('')
      setFilterTaluka('')
    }
  }, [districtOptions, filterDistrict, domain])

  useEffect(() => {
    if (domain !== 'PAYROLL') return
    if (payrollDistrict && payrollDistrictOptions.length && !payrollDistrictOptions.includes(payrollDistrict)) {
      setPayrollDistrict('')
      setPayrollTaluka('')
      setPayrollDdo('')
    }
  }, [payrollDistrictOptions, payrollDistrict, domain])

  useEffect(() => {
    if (domain === 'PAYROLL') return
    if (!filterDistrict) {
      setTalukaOptions([])
      return
    }
    fetchTalukasForDistrict(filterDistrict)
      .then((list) => setTalukaOptions(Array.isArray(list) ? list : []))
      .catch(() => setTalukaOptions([]))
  }, [filterDistrict, domain])

  useEffect(() => {
    if (domain !== 'PAYROLL') return
    fetchPayrollFilterOptions({ district: payrollDistrict || undefined, taluka: payrollTaluka || undefined })
      .then((opts) => {
        const d = opts?.districts?.length ? opts.districts : PILOT_DISTRICTS
        setPayrollDistrictOptions(d)
        setPayrollTalukaOptions(Array.isArray(opts?.talukas) ? opts.talukas : [])
        setPayrollDdoOptions(Array.isArray(opts?.ddoCodes) ? opts.ddoCodes : [])
      })
      .catch(() => {
        setPayrollDistrictOptions(PILOT_DISTRICTS)
        setPayrollTalukaOptions([])
        setPayrollDdoOptions([])
      })
  }, [domain, payrollDistrict, payrollTaluka])

  useEffect(() => {
    if (payrollDdo && payrollDdoOptions.length && !payrollDdoOptions.includes(payrollDdo)) {
      setPayrollDdo('')
    }
  }, [payrollDdoOptions, payrollDdo])

  const onDistrictChange = (district) => {
    setFilterDistrict(district)
    setFilterTaluka('')
  }

  const onPayrollDistrictChange = (district) => {
    setPayrollDistrict(district)
    setPayrollTaluka('')
    setPayrollDdo('')
  }

  const onPayrollTalukaChange = (taluka) => {
    setPayrollTaluka(taluka)
    setPayrollDdo('')
  }

  const rows = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    const matched = q
      ? alerts.filter((a) => String(a.personName || '').toLowerCase().includes(q))
      : alerts
    const dir = sortDir === 'asc' ? 1 : -1
    return [...matched].sort((a, b) => {
      if (sortField === 'priority') {
        const pa = Number(a.priority ?? 0)
        const pb = Number(b.priority ?? 0)
        if (pa !== pb) return sortDir === 'desc' ? pb - pa : pa - pb
        const sa = SEVERITY_ORDER[a.severity] ?? 9
        const sb = SEVERITY_ORDER[b.severity] ?? 9
        if (sa !== sb) return sa - sb
        const ta = a.detectedAt ? new Date(a.detectedAt).getTime() : 0
        const tb = b.detectedAt ? new Date(b.detectedAt).getTime() : 0
        if (ta !== tb) return ta - tb
        return String(a.id || '').localeCompare(String(b.id || ''))
      }
      const va = alertSortValue(a, sortField, domain)
      const vb = alertSortValue(b, sortField, domain)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      if (cmp !== 0) return cmp * dir
      if (sortField === 'severity') return Number(b.amountDelta ?? 0) - Number(a.amountDelta ?? 0)
      return String(a.id || '').localeCompare(String(b.id || ''))
    })
  }, [alerts, sortField, sortDir, domain, personQuery])

  const maxPriority = useMemo(() => Math.max(1, ...rows.map((a) => Number(a.priority ?? 0))), [rows])
  const topPriority = useMemo(() => (
    status === 'OPEN'
      ? [...rows].filter((a) => a.priority != null).sort((a, b) => Number(b.priority) - Number(a.priority)).slice(0, 3)
      : []
  ), [rows, status])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // The effect is keyed on the ids themselves (a string), not on the page array, which is a new object every render:
  // keying on the array re-ran the effect after each state update and called the API in an endless loop.
  const pageIdsKey = [...new Set(pagedRows.map((a) => a.personId).filter(Boolean))].sort().join(',')
  useEffect(() => {
    const clear = () => setLinkedPayroll((prev) => (prev.size ? new Set() : prev))
    if (domain !== 'BENEFICIARY' || !pageIdsKey) {
      clear()
      return undefined
    }
    let live = true
    fetchLinkedRegistryIds(pageIdsKey.split(','))
      .then((r) => { if (live) setLinkedPayroll(new Set(r.linkedPersonIds || [])) })
      .catch(() => { if (live) clear() })
    return () => { live = false }
  }, [domain, pageIdsKey])

  const openPersonView = useCallback((personKey, personName) => {
    if (!personKey) return
    setPersonView({ key: personKey, name: personName || 'Person' })
  }, [])

  useEffect(() => { setPage(1) }, [status, filterSchemeId, filterDistrict, filterTaluka, payrollDistrict, payrollTaluka, payrollDdo, payrollPeriodStart, payrollPeriodEnd, domain])

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'amount' || field === 'priority' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function sortIndicator(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function ariaSort(field) {
    if (sortField !== field) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  const refreshCase = async (caseId) => {
    const detail = await fetchIntegrityCase(caseId)
    setCaseDetail(detail)
    return detail
  }

  const openCase = async (caseId) => {
    if (!caseId) return
    setSelectedCaseId(caseId)
    setProfileSubject(null)
    setShowRaw(false)
    setMessage(null)
    try {
      const detail = await refreshCase(caseId)
      const c = detail.caseEntity ?? {}
      setDecision({ classification: c.classification ?? 'SUSPECTED_OVERPAYMENT', text: c.decisionText ?? '', notice: Boolean(c.noticeRequired) })
      if (c.noticeRequired && c.classification) {
        fetchIntegrityNoticeDraft(caseId, 'en').then((d) => { setNoticeText(d.text ?? ''); setNoticeLang('en') }).catch(() => {})
      } else {
        setNoticeText('')
      }
    } catch (err) {
      setCaseDetail(null)
      fail(err)
    }
  }

  // a link such as the guided story's "Open this case" arrives with ?case=<id>
  const linkedCase = params.get('case')
  useEffect(() => {
    if (linkedCase && linkedCase !== selectedCaseId) openCase(linkedCase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCase])

  const setTab = (d) => {
    setParams({ domain: d })
    setSelectedCaseId(null)
    setCaseDetail(null)
    setMessage(null)
    setPersonQuery('')
    setPage(1)
  }

  const downloadCaseFile = async (format) => {
    if (!selectedCaseId) return
    setBusy(true)
    try {
      const body = await fetchCaseFileExport(selectedCaseId, format)
      const blob = format === 'json'
        ? new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
        : new Blob([body], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const ext = format === 'json' ? 'json' : 'html'
      const a = document.createElement('a')
      a.href = url
      a.download = `case-${selectedCaseId}.${ext}`
      if (format === 'html') {
        window.open(url, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } else {
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const loadNoticeDraft = async (lang) => {
    if (!selectedCaseId) return
    try {
      const d = await fetchIntegrityNoticeDraft(selectedCaseId, lang)
      setNoticeText(d.text ?? '')
      setNoticeLang(lang)
    } catch (err) {
      fail(err)
    }
  }

  const copyNotice = async () => {
    try {
      await navigator.clipboard.writeText(noticeText)
      ok('Notice copied.')
    } catch {
      fail(new Error('Could not copy to the clipboard.'))
    }
  }

  const printNotice = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return
    w.document.write(`<pre style="font-family:system-ui;white-space:pre-wrap;padding:1.5rem">${noticeText.replace(/</g, '&lt;')}</pre>`)
    w.document.close()
    w.print()
  }

  const submitNoticeIssue = async () => {
    setBusy(true)
    try {
      await postIntegrityNoticeIssue(selectedCaseId, noticeLang)
      ok('Marked as issued (record only — nothing was sent automatically).')
      await refreshCase(selectedCaseId)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitNoticeResponse = async () => {
    setBusy(true)
    try {
      await postIntegrityNoticeResponse(selectedCaseId, noticeResponse.kind, noticeResponse.note.trim())
      ok('Response recorded.')
      await refreshCase(selectedCaseId)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitReopen = async () => {
    setBusy(true)
    try {
      await postIntegrityReopen(selectedCaseId, reopenReason.trim())
      ok('Case reopened on appeal.')
      setReopenReason('')
      await refreshCase(selectedCaseId)
      loadAlerts()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitDecision = async () => {
    setBusy(true)
    try {
      await postIntegrityDecision(selectedCaseId, decision.classification, decision.text.trim(), decision.notice)
      ok('Decision saved.')
      await refreshCase(selectedCaseId)
      loadAlerts()
      fetchIntegrityMetrics(domain).then(setMetrics).catch(() => {})
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitAction = async (actionType) => {
    setBusy(true)
    try {
      const payload = { note: decision.text.trim() || 'Recorded from the officer portal' }
      if (actionType === 'RECOVERY_RECORD' && alert?.amountDelta != null && Number(alert.amountDelta) > 0) {
        payload.amount = Number(alert.amountDelta)
      }
      const res = await postIntegrityAction(selectedCaseId, actionType, payload)
      if (res.actionStatus === 'PENDING') {
        ok(`Recovery request ${res.externalRef} is waiting for a second approver. This is a demo record; no payment system was called.`)
      } else {
        ok(`Recorded — reference ${res.externalRef}. This is a demo record; no payment system was called.`)
      }
      await refreshCase(selectedCaseId)
      loadAlerts()
      fetchIntegrityMetrics(domain).then(setMetrics).catch(() => {})
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const approveRecovery = async (actionId) => {
    setBusy(true)
    try {
      const res = await postIntegrityApproveRecovery(selectedCaseId, actionId)
      ok(`Recovery approved — reference ${res.externalRef}.`)
      await refreshCase(selectedCaseId)
      loadAlerts()
      fetchIntegrityMetrics(domain).then(setMetrics).catch(() => {})
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const rejectRecovery = async (actionId) => {
    if (!rejectReason.trim()) {
      fail(new Error('A reason is required to reject the recovery request.'))
      return
    }
    setBusy(true)
    try {
      await postIntegrityRejectRecovery(selectedCaseId, actionId, rejectReason.trim())
      ok('Recovery request rejected.')
      setRejectReason('')
      await refreshCase(selectedCaseId)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submitVerify = async () => {
    setBusy(true)
    try {
      await postIntegrityVerifyClosed(selectedCaseId, verifyNote.trim())
      ok('Case verified closed.')
      setVerifyNote('')
      await refreshCase(selectedCaseId)
      loadAlerts()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const runPilotDetection = async () => {
    if (domain === 'PAYROLL' && !payrollPeriodValid(payrollPeriodStart, payrollPeriodEnd)) {
      fail(new Error('Pay period start must be on or before end.'))
      return
    }
    setBusy(true)
    try {
      const body = {}
      if (domain === 'PAYROLL') {
        body.domains = ['PAYROLL']
        body.periodStart = payrollPeriodStart || DEFAULT_PAYROLL_PERIOD_START
        body.periodEnd = payrollPeriodEnd || DEFAULT_PAYROLL_PERIOD_END
        if (payrollDistrict) body.districts = [payrollDistrict]
        if (payrollTaluka) body.talukas = [payrollTaluka]
        if (payrollDdo) body.ddoCodes = [payrollDdo]
      } else {
        body.domains = ['BENEFICIARY']
        body.periodStart = '2024-04-01'
        body.periodEnd = '2025-03-31'
        if (filterSchemeId) body.schemeIds = [filterSchemeId]
        if (filterDistrict) body.districts = [filterDistrict]
        if (filterTaluka) body.talukas = [filterTaluka]
      }
      const res = await runIntegrityDetection(body)
      if (res.alertsCreated) {
        ok(`Detection finished: ${res.alertsCreated} new alert${res.alertsCreated === 1 ? '' : 's'}.`)
      } else if (domain !== 'PAYROLL') {
        ok('Detection finished: nothing new found.')
      } else {
        setMessage(null)
      }
      await loadAlerts()
      setMetrics(await fetchIntegrityMetrics(domain))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const alert = caseDetail?.alerts?.[0]
  const caseEntity = caseDetail?.caseEntity

  const personLink = caseDetail?.evidenceContext?.personLink
  const linkedUnit = caseDetail?.evidenceContext?.entitlementUnit
  const displayPersonName = personLink?.personName || linkedUnit?.personName || alert?.personName
  const maskedAadhaar = personLink?.maskedAadhaar
  const relatedEntitlements = (
    caseDetail?.evidenceContext?.relatedEntitlements?.length
      ? caseDetail.evidenceContext.relatedEntitlements
      : (linkedUnit ? [linkedUnit] : [])
  ).map(enrollmentLine).filter(Boolean)
  const relatedPayments = (caseDetail?.evidenceContext?.relatedPayments ?? []).map(paymentLine).filter(Boolean)
  const hasSupportingDetail = relatedEntitlements.length > 0 || relatedPayments.length > 0

  // the case detail's name link opens the citizen profile (family and household), as it always did
  const openPersonProfile = () => {
    if (!alert) return
    if (domain === 'PAYROLL') {
      setProfileSubject({
        personName: displayPersonName,
        payrollInfo: {
          employeeCode: alert.evidence?.employeeCode,
          post: alert.evidence?.post,
          payLevel: alert.evidence?.payLevel,
          ddoCode: alert.evidence?.ddoCode,
          employmentStatus: alert.evidence?.employmentStatus,
        },
      })
      return
    }
    setProfileSubject({
      personName: personLink?.personName || linkedUnit?.personName || alert.personName,
      personId: personLink?.personId || linkedUnit?.personId || alert.personId,
      familyId: personLink?.familyId || linkedUnit?.familyId,
    })
  }
  // "All alerts for this person" opens the person view across beneficiary and payroll
  const openPersonAlerts = () => {
    if (!alert) return
    const key = domain === 'PAYROLL'
      ? (alert.personId || alert.evidence?.employeeCode)
      : (personLink?.personId || linkedUnit?.personId || alert.personId)
    openPersonView(key, displayPersonName)
  }
  const pendingRecovery = (caseDetail?.actions ?? []).find(
    (a) => a.actionType === 'RECOVERY_RECORD' && a.actionStatus === 'PENDING',
  )
  const officerSub = typeof localStorage !== 'undefined' ? localStorage.getItem('officer_sub') : null
  const isRecoveryRequester = Boolean(pendingRecovery && officerSub && pendingRecovery.requestedBy === officerSub)
  const requesterRoleLabel = pendingRecovery?.requestedByRole
    ? titleCase(String(pendingRecovery.requestedByRole).split(',')[0].replace(/_/g, ' '))
    : 'another officer'

  const evidence = Object.entries(alert?.evidence ?? {})
    .filter(([k]) => !HIDDEN_EVIDENCE.has(k))
    .sort(([a], [b]) => evidenceRank(a) - evidenceRank(b))
  const reasonOk = decision.text.trim().length > 0
  const classification = caseEntity?.classification ?? null
  const closed = caseEntity?.status === 'CLOSED'
  const canChangeDecision = canReview && ['OPEN', 'UNDER_REVIEW', 'DECIDED'].includes(caseEntity?.status ?? '')
  const showNoticeTools = Boolean(caseEntity?.noticeRequired && classification && canReview)
  const canReopenAppeal = role === 'DEPT_ADMIN' && classification
    && ['DECIDED', 'ACTION_RECORDED', 'CLOSED'].includes(caseEntity?.status ?? '')
  const issuedNotice = caseDetail?.notice?.issuedAt
  const noticeResponded = Boolean(caseDetail?.notice?.responseAt)
  // why an outcome is not offered yet: the same rules the service enforces
  const outcomeBlock = (id) => {
    if (closed) return 'This case is closed.'
    if (id === 'DISMISS') return null
    if (!classification) return 'Record a decision first.'
    if (id === 'RECOVERY_RECORD' && classification !== 'CONFIRMED_OVERPAYMENT') return 'A recovery needs the overpayment to be confirmed.'
    return null
  }

  const tabsNav = (
    <nav className="ei-tabs" role="tablist">
      {canBeneficiary && (
        <button type="button" role="tab" aria-selected={!showGate && domain === 'BENEFICIARY'} className={!showGate && domain === 'BENEFICIARY' ? 'active' : ''} onClick={() => setTab('beneficiary')}>
          Beneficiary payments
        </button>
      )}
      {canPayroll && (
        <button type="button" role="tab" aria-selected={!showGate && domain === 'PAYROLL'} className={!showGate && domain === 'PAYROLL' ? 'active' : ''} onClick={() => setTab('payroll')}>
          Payroll &amp; pension
        </button>
      )}
      {canGate && (
        <button type="button" role="tab" aria-selected={showGate} className={showGate ? 'active' : ''} onClick={() => { setParams({ view: 'gate' }); setMessage(null) }}>
          Pre-payment gate
        </button>
      )}
      {canWhatIf && (
        <button
          type="button"
          role="tab"
          aria-selected={showWhatIf}
          className={showWhatIf ? 'active' : ''}
          onClick={() => { setParams({ view: 'what-if' }); setMessage(null) }}
        >
          What if
        </button>
      )}
    </nav>
  )

  if (showWhatIf) {
    return (
      <div className="expenditure-integrity">
        <IntegrityPageHeader showDataLink={showDataHub} />
        {tabsNav}
        <WhatIfPanel />
      </div>
    )
  }

  if (showGate) {
    return (
      <div className="expenditure-integrity">
        <IntegrityPageHeader showDataLink={showDataHub} />
        {tabsNav}
        <PaymentGate canDecide={canGateDecide} onOpenPersonView={openPersonView} />
      </div>
    )
  }

  return (
    <div className="expenditure-integrity">
      <IntegrityPageHeader
        showDataLink={showDataHub}
        metrics={metrics}
        status={status}
        setStatus={setStatus}
        setPage={setPage}
      />

      {tabsNav}

      {domain === 'BENEFICIARY' && (
        <section className="ei-card ei-pilot ei-scope-filters" aria-label="Scope filters">
          <label>
            <span>Select scheme</span>
            <select value={filterSchemeId} onChange={(e) => setFilterSchemeId(e.target.value)}>
              <option value="">All schemes</option>
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>District</span>
            <select value={filterDistrict} onChange={(e) => onDistrictChange(e.target.value)}>
              <option value="">All districts</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Taluka</span>
            <select
              value={filterTaluka}
              onChange={(e) => setFilterTaluka(e.target.value)}
              disabled={!filterDistrict}
            >
              <option value="">{filterDistrict ? 'All talukas' : 'Select district first'}</option>
              {talukaOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          {canRun && (
            <button type="button" className="ei-primary" onClick={runPilotDetection} disabled={busy}>
              {busy ? 'Working…' : 'Run detection'}
            </button>
          )}
        </section>
      )}

      {domain === 'PAYROLL' && (
        <section className="ei-card ei-pilot ei-scope-filters ei-payroll-filters" aria-label="Payroll scope filters">
          <label>
            <span>District</span>
            <select value={payrollDistrict} onChange={(e) => onPayrollDistrictChange(e.target.value)}>
              <option value="">All districts</option>
              {payrollDistrictOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Taluka</span>
            <select
              value={payrollTaluka}
              onChange={(e) => onPayrollTalukaChange(e.target.value)}
              disabled={!payrollDistrict}
            >
              <option value="">{payrollDistrict ? 'All talukas' : 'Select district first'}</option>
              {payrollTalukaOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>DDO</span>
            <select value={payrollDdo} onChange={(e) => setPayrollDdo(e.target.value)}>
              <option value="">All DDOs</option>
              {payrollDdoOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Period from</span>
            <input
              type="date"
              value={payrollPeriodStart}
              onChange={(e) => setPayrollPeriodStart(e.target.value)}
              aria-label="Pay period from"
              title="Leave blank to see every open alert"
            />
          </label>
          <label>
            <span>Period to</span>
            <input
              type="date"
              value={payrollPeriodEnd}
              onChange={(e) => setPayrollPeriodEnd(e.target.value)}
              aria-label="Pay period to"
              title="Leave blank to see every open alert"
            />
          </label>
          {canRun && (
            <button type="button" className="ei-primary" onClick={runPilotDetection} disabled={busy}>
              {busy ? 'Working…' : 'Run detection'}
            </button>
          )}
        </section>
      )}

      {message && <p className={`ei-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      <div className="ei-layout">
        <section className="ei-card ei-inbox" aria-label="Alert inbox">
          <div className="ei-inbox-head">
            <h2>Alert inbox <span className="ei-count">{rows.length}</span></h2>
            <input
              type="search"
              className="ei-inbox-search"
              placeholder="Search person"
              aria-label="Search person name"
              value={personQuery}
              onChange={(e) => { setPersonQuery(e.target.value); setPage(1) }}
            />
          </div>
          <div className="ei-filter" role="group" aria-label="Show alerts">
            <button type="button" aria-pressed={status === 'OPEN'} className={status === 'OPEN' ? 'active' : ''} onClick={() => setStatus('OPEN')}>Open</button>
            <button type="button" aria-pressed={status === 'RESOLVED'} className={status === 'RESOLVED' ? 'active' : ''} onClick={() => setStatus('RESOLVED')}>Resolved</button>
            <button type="button" aria-pressed={status === 'RECOVERY'} className={status === 'RECOVERY' ? 'active' : ''} onClick={() => setStatus('RECOVERY')}>Recoveries</button>
            <button
              type="button"
              aria-pressed={sortField === 'priority'}
              className={sortField === 'priority' ? 'active ei-priority-sort' : 'ei-priority-sort'}
              onClick={() => toggleSort('priority')}
            >
              Work on these first
            </button>
          </div>
          {topPriority.length > 0 && (
            <div className="ei-priority-banner" role="region" aria-label="Highest expected recovery">
              <p className="ei-priority-banner-title">Work on these first</p>
              <ol>
                {topPriority.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="ei-priority-chip" title={a.priorityReason} onClick={() => openCase(a.caseId)}>
                      <span className="ei-priority-amt">{rupees(a.priority)}</span>
                      <span>{a.personName} · {ruleLabel(a.ruleCode)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {loading && <p className="ei-empty">Loading alerts…</p>}
          {!loading && rows.length === 0 && (
            <p className="ei-empty">
              {personQuery.trim()
                ? 'No alerts match that person name.'
                : status === 'OPEN'
                  ? 'No open alerts in this area. Run detection to check again.'
                  : status === 'RECOVERY'
                    ? 'No recoveries recorded in this area.'
                    : 'Nothing has been resolved in this area yet.'}
            </p>
          )}
          {rows.length > 0 && (
            <>
              <table>
                <thead>
                  <tr>
                    <th aria-sort={ariaSort('rule')}>
                      <button type="button" className={`th-sort ${sortField === 'rule' ? 'active' : ''}`} onClick={() => toggleSort('rule')}>
                        Rule{sortIndicator('rule')}
                      </button>
                    </th>
                    <th aria-sort={ariaSort('person')}>
                      <button type="button" className={`th-sort ${sortField === 'person' ? 'active' : ''}`} onClick={() => toggleSort('person')}>
                        Person{sortIndicator('person')}
                      </button>
                    </th>
                    <th aria-sort={ariaSort('scheme')}>
                      <button type="button" className={`th-sort ${sortField === 'scheme' ? 'active' : ''}`} onClick={() => toggleSort('scheme')}>
                        {domain === 'PAYROLL' ? 'Post · DDO' : 'Scheme'}{sortIndicator('scheme')}
                      </button>
                    </th>
                    <th className="num" aria-sort={ariaSort('amount')}>
                      <button type="button" className={`th-sort ${sortField === 'amount' ? 'active' : ''}`} onClick={() => toggleSort('amount')}>
                        Amount{sortIndicator('amount')}
                      </button>
                    </th>
                    <th className="num" aria-sort={ariaSort('priority')}>
                      <button type="button" className={`th-sort ${sortField === 'priority' ? 'active' : ''}`} onClick={() => toggleSort('priority')}>
                        Priority{sortIndicator('priority')}
                      </button>
                    </th>
                    <th aria-sort={ariaSort('severity')}>
                      <button type="button" className={`th-sort ${sortField === 'severity' ? 'active' : ''}`} onClick={() => toggleSort('severity')}>
                        Severity{sortIndicator('severity')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((a) => (
                    <tr
                      key={a.id}
                      className={selectedCaseId && selectedCaseId === a.caseId ? 'selected' : ''}
                      tabIndex={0}
                      onClick={() => openCase(a.caseId)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCase(a.caseId) } }}
                    >
                      <td>
                        <span className="ei-rule ei-rule-code" title={ruleLabel(a.ruleCode)}>
                          <b>{a.ruleCode}</b>
                        </span>
                      </td>
                      <td className="ei-person-cell">
                        <button
                          type="button"
                          className="person-profile-link"
                          onClick={(e) => { e.stopPropagation(); openPersonView(a.personId, a.personName) }}
                        >
                          {a.personName}
                        </button>
                        {domain === 'BENEFICIARY' && a.personId && linkedPayroll.has(a.personId) && (
                          <span className="ei-chip-payroll">Also appears in payroll</span>
                        )}
                      </td>
                      <td>{schemeOrPost(a, domain) || '—'}</td>
                      <td className="num">{a.amountDelta != null && Number(a.amountDelta) > 0 ? rupees(a.amountDelta) : '—'}</td>
                      <td className="num ei-priority-cell">
                        {a.priority != null ? (
                          <span className="ei-priority-wrap" title={a.priorityReason}>
                            <span className="ei-priority-val">{rupees(a.priority)}{a.priorityEstimated ? '*' : ''}</span>
                            <span className="ei-priority-bar" aria-hidden="true">
                              <i style={{ width: `${Math.round((Number(a.priority) / maxPriority) * 100)}%` }} />
                            </span>
                          </span>
                        ) : '—'}
                      </td>
                      <td><span className={`ei-sev ${String(a.severity).toLowerCase()}`}>{titleCase(a.severity)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ei-pagination">
                <button type="button" className="ei-page-btn" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ‹ Prev
                </button>
                <span className="ei-page-info">
                  Page {currentPage} of {totalPages}
                  <span className="ei-page-count"> · {rows.length} alert{rows.length === 1 ? '' : 's'}</span>
                </span>
                <button type="button" className="ei-page-btn" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next ›
                </button>
                <label className="ei-page-size-label">
                  Show
                  <select
                    className="ei-page-size"
                    aria-label="Alerts per page"
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  / page
                </label>
              </div>
            </>
          )}
        </section>

        <section className="ei-card ei-detail" aria-label="Case detail">
          <h2>Case detail</h2>
          {!caseDetail && <p className="ei-empty">Select an alert to review the evidence and record a decision.</p>}
          {caseDetail && alert && (
            <>
              <div className="ei-case-head">
                <div>
                  <span className="ei-rule"><b>{alert.ruleCode}</b> {RULE_NAMES[alert.ruleCode]}</span>
                  <h3 className="ei-person-heading">
                    <button type="button" className="person-profile-link" onClick={openPersonProfile}>
                      {displayPersonName || 'Unknown person'}
                    </button>
                    <button type="button" className="person-profile-link" onClick={openPersonAlerts}>All alerts for this person</button>
                  </h3>
                  {domain === 'BENEFICIARY' && maskedAadhaar && (
                    <p className="ei-meta ei-aadhaar">Aadhaar {maskedAadhaar}</p>
                  )}
                  <p className="ei-meta">{(domain === 'PAYROLL' ? [alert.evidence?.post, alert.evidence?.ddoCode, alert.evidence?.employeeCode] : [alert.schemeName, alert.district, alert.taluka]).filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`ei-status ${String(caseEntity?.status).toLowerCase()}`}>{titleCase(caseEntity?.status)}</span>
              </div>

              <p className="ei-summary">{summarise(alert)}</p>

              <div className="ei-export-bar">
                <button type="button" disabled={busy} onClick={() => downloadCaseFile('html')}>
                  Download case file
                </button>
                <button type="button" disabled={busy} onClick={() => downloadCaseFile('json')}>
                  Download data (JSON)
                </button>
              </div>

              <h4>Timeline</h4>
              <CaseTimeline caseId={selectedCaseId} />

              <h4>Evidence</h4>
              <dl className="ei-evidence">
                {evidence.map(([k, v]) => (
                  <div key={k}><dt>{words(k)}</dt><dd>{formatEvidence(k, v)}</dd></div>
                ))}
              </dl>
              {hasSupportingDetail && (
                <>
                  <button type="button" className="ei-link" onClick={() => setShowRaw((v) => !v)}>
                    {showRaw ? 'Hide' : 'Show'} supporting details
                  </button>
                  {showRaw && (
                    <div className="ei-supporting">
                      {relatedEntitlements.length > 0 && (
                        <>
                          <p className="ei-supporting-label">Enrolments involved</p>
                          <ul>
                            {relatedEntitlements.map((line, i) => <li key={`u-${i}`}>{line}</li>)}
                          </ul>
                        </>
                      )}
                      {relatedPayments.length > 0 && (
                        <>
                          <p className="ei-supporting-label">Payments involved</p>
                          <ul>
                            {relatedPayments.map((line, i) => <li key={`p-${i}`}>{line}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <h4>Decision</h4>
              {!canReview && <p className="ei-hint">Your role can view cases but not record decisions.</p>}
              {closed && <p className="ei-hint">This case is closed. Reopen on appeal to change the decision or record further outcomes.</p>}
              {!canChangeDecision && canReview && classification && !closed && (
                <p className="ei-hint">A decision is already recorded. Reopen on appeal to change it.</p>
              )}
              <fieldset className="ei-decision" disabled={!canChangeDecision || busy}>
                <label>
                  <span>Classification</span>
                  <select value={decision.classification} onChange={(e) => setDecision((d) => ({ ...d, classification: e.target.value }))}>
                    {CLASSIFICATIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Reason <em>(required)</em></span>
                  <textarea
                    placeholder="What did you check and why does it lead to this classification?"
                    value={decision.text}
                    onChange={(e) => setDecision((d) => ({ ...d, text: e.target.value }))}
                  />
                </label>
                <label className="ei-check">
                  <input type="checkbox" checked={decision.notice} onChange={(e) => setDecision((d) => ({ ...d, notice: e.target.checked }))} />
                  A notice to the beneficiary or employee is required
                </label>
                <button type="button" className="ei-primary" onClick={submitDecision} disabled={!reasonOk}>Save decision</button>
              </fieldset>

              {showNoticeTools && (
                <section className="ei-notice" aria-label="Notice to the person affected">
                  <h4>Draft notice</h4>
                  <p className="ei-hint">Fixed template filled from this case. Adjust the text before printing; nothing is sent from the system.</p>
                  <div role="tablist" className="ei-notice-tabs">
                    <button type="button" role="tab" aria-selected={noticeLang === 'en'} className={noticeLang === 'en' ? 'active' : ''} onClick={() => loadNoticeDraft('en')}>English</button>
                    <button type="button" role="tab" aria-selected={noticeLang === 'gu'} className={noticeLang === 'gu' ? 'active' : ''} onClick={() => loadNoticeDraft('gu')}>Gujarati</button>
                  </div>
                  <textarea className="ei-notice-body" aria-label="Notice text" rows={12} value={noticeText} onChange={(e) => setNoticeText(e.target.value)} />
                  <div className="ei-notice-actions">
                    <button type="button" onClick={() => loadNoticeDraft(noticeLang)} disabled={busy}>Reload template</button>
                    <button type="button" onClick={copyNotice} disabled={!noticeText}>Copy</button>
                    <button type="button" onClick={printNotice} disabled={!noticeText}>Print</button>
                    {canAct && !issuedNotice && (
                      <button type="button" className="ei-primary" onClick={submitNoticeIssue} disabled={busy}>Mark as issued</button>
                    )}
                  </div>
                  {issuedNotice && (
                    <p className="ei-hint">Issued {when(issuedNotice)} ({caseDetail.notice.language?.toUpperCase()}). Due {caseDetail.notice.responseDueOn}.</p>
                  )}
                  {canAct && issuedNotice && !noticeResponded && (
                    <fieldset className="ei-notice-response">
                      <legend>Record the person&apos;s response</legend>
                      <label>
                        Response
                        <select value={noticeResponse.kind} onChange={(e) => setNoticeResponse((r) => ({ ...r, kind: e.target.value }))}>
                          <option value="ACCEPTED">Accepted</option>
                          <option value="DISPUTED">Disputed</option>
                          <option value="APPEAL">Appeal lodged</option>
                        </select>
                      </label>
                      <label>
                        Note
                        <input type="text" value={noticeResponse.note} onChange={(e) => setNoticeResponse((r) => ({ ...r, note: e.target.value }))} />
                      </label>
                      <button type="button" className="ei-primary" onClick={submitNoticeResponse} disabled={busy}>Save response</button>
                    </fieldset>
                  )}
                  {noticeResponded && <p className="ei-hint">Response recorded: {caseDetail.notice.responseKind} {caseDetail.notice.responseNote ? `— ${caseDetail.notice.responseNote}` : ''}</p>}
                </section>
              )}

              {canReopenAppeal && (
                <fieldset className="ei-reopen">
                  <legend>Reopen on appeal</legend>
                  <label>
                    Appeal reason <em>(required)</em>
                    <textarea rows={2} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                  </label>
                  <button type="button" className="ei-primary" onClick={submitReopen} disabled={busy || !reopenReason.trim()}>Reopen case</button>
                </fieldset>
              )}

              <h4>Record an outcome <span className="ei-demo">demo — no payment system is called</span></h4>
              {!canAct && <p className="ei-hint">Only a Department Admin or a Finance Officer can record corrections, adjustments and recoveries.</p>}
              <div className="ei-actions">
                {ACTION_TYPES.map((a) => (
                  <button key={a.id} type="button" title={outcomeBlock(a.id) ?? a.hint} onClick={() => submitAction(a.id)} disabled={!canAct || busy || Boolean(outcomeBlock(a.id))}>{a.label}</button>
                ))}
              </div>
              {canAct && !closed && !classification && <p className="ei-hint">Record a decision first. Closing without action is always possible.</p>}
              {canAct && !closed && classification && classification !== 'CONFIRMED_OVERPAYMENT' && <p className="ei-hint">A recovery needs the overpayment to be confirmed.</p>}

              {pendingRecovery && (
                <div className="ei-pending-recovery" role="status">
                  <p>
                    Waiting for approval — requested by {requesterRoleLabel} (reference {pendingRecovery.externalRef}).
                  </p>
                  {isRecoveryRequester && canAct && (
                    <p className="ei-hint">A second officer must approve this recovery before it takes effect.</p>
                  )}
                  {canAct && !isRecoveryRequester && (
                    <div className="ei-pending-actions">
                      <button type="button" className="ei-primary" disabled={busy} onClick={() => approveRecovery(pendingRecovery.id)}>
                        Approve recovery
                      </button>
                      <label>
                        Reject reason
                        <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} aria-label="Reject reason" />
                      </label>
                      <button type="button" disabled={busy || !rejectReason.trim()} onClick={() => rejectRecovery(pendingRecovery.id)}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {caseEntity?.status === 'ACTION_RECORDED' && canAct && (
                <fieldset className="ei-verify">
                  <legend>Check that the fix holds</legend>
                  <label>
                    How did you check? <span className="ei-hint">(for example: the register now shows the corrected record, or the recovery reached the account)</span>
                    <textarea aria-label="How you checked" rows={2} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
                  </label>
                  <button type="button" className="ei-primary" onClick={submitVerify} disabled={busy || !verifyNote.trim()}>Verify closed</button>
                </fieldset>
              )}
              {caseEntity?.verifiedAt && (
                <p className="ei-hint">Verified closed by {titleCase((caseDetail.auditLog ?? []).find((l) => l.action === 'VERIFIED_CLOSED')?.actorRole || 'an officer')}: {caseEntity.verificationNote}</p>
              )}

              {(caseDetail.actions ?? []).length > 0 && (
                <>
                  <h4>Recorded outcomes</h4>
                  <ul className="ei-outcomes">
                    {caseDetail.actions.map((a) => (
                      <li key={a.id}>
                        <b>{titleCase(a.actionType)}</b>
                        {a.actionStatus === 'PENDING' && <em> (waiting for approval)</em>}
                        {a.actionStatus === 'REJECTED' && <em> (rejected)</em>}
                        <span>{a.externalRef}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h4>History</h4>
              {(caseDetail.auditLog ?? []).length === 0 && <p className="ei-empty">Nothing recorded yet.</p>}
              <ol className="ei-audit">
                {(caseDetail.auditLog ?? []).map((line) => (
                  <li key={line.id}>
                    <time>{when(line.createdAt)}</time>
                    <span><b>{titleCase(line.action)}</b> by {titleCase(line.actorRole || line.actor)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>

      <CitizenProfileModal subject={profileSubject} onClose={() => setProfileSubject(null)} />
      {personView && (
        <PersonViewPanel
          personKey={personView.key}
          personName={personView.name}
          onClose={() => setPersonView(null)}
          onOpenCase={(caseId) => { setPersonView(null); openCase(caseId) }}
        />
      )}
    </div>
  )
}
