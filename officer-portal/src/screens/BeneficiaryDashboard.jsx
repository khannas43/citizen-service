import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  bulkConfirmBeneficiaries,
  bulkOverrideBeneficiaries,
  bulkRemoveBeneficiaries,
  confirmBeneficiary,
  disburseBeneficiary,
  fetchBeneficiaryAudit,
  fetchBeneficiaryGeoOptions,
  fetchBeneficiaryRecent,
  fetchBeneficiarySummary,
  overrideBeneficiary,
  removeBeneficiary,
  SCHEME_API,
  AI_BASE,
} from '../api'
import { getOfficerDistrictScope } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import './BeneficiaryDashboard.css'

const PAGE_SIZE = 50
const STATUSES = ['ALL', 'IDENTIFIED', 'CONFIRMED', 'ACTIVE', 'REMOVED']

const STATUS_STYLE = {
  IDENTIFIED: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMED: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  ACTIVE: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  REMOVED: { color: '#dc2626', bg: '#fff5f5', border: '#fecaca' },
}

function eventTime(b) {
  return b.removedAt || b.confirmedAt || b.disbursedAt || b.identifiedAt || ''
}

function formatTs(ts) {
  if (!ts) return '—'
  return String(ts).replace('T', ' ').slice(0, 19)
}

function auditActionClass(action) {
  if (!action) return 'bd-audit-identified'
  const a = action.toUpperCase()
  if (a.includes('REMOVED')) return 'bd-audit-removed'
  if (a.includes('OVERRIDE')) return 'bd-audit-override'
  if (a.includes('DISBURSED')) return 'bd-audit-disbursed'
  if (a.includes('CONFIRMED')) return 'bd-audit-confirmed'
  return 'bd-audit-identified'
}

function SortTh({ col, label, sortCol, sortDir, onSort, align = 'left' }) {
  const active = sortCol === col
  return (
    <th
      className={`bd-th-sort bd-th-${align} ${active ? 'bd-th-sort-active' : ''}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="bd-sort-icon">{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
    </th>
  )
}

function ReasonChips({ reason }) {
  if (!reason) return null
  return (
    <div className="bd-elig-chips">
      {reason.split('|').map((r, i) => (
        <span key={i} className="bd-elig-chip">✓ {r.trim()}</span>
      ))}
      <span className="bd-elig-source">Identified by Eligibility Engine</span>
    </div>
  )
}

function BulkRemoveModal({ count, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(reason.trim())
    } catch {
      setError('Bulk remove failed — try again')
      setBusy(false)
    }
  }

  return (
    <div className="bd-modal-overlay" onClick={onClose}>
      <div className="bd-modal bd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="bd-modal-header">
          <div className="bd-modal-title">Bulk Remove</div>
          <button type="button" className="bd-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="bd-modal-body" onSubmit={submit}>
          <p className="bd-modal-hint">
            Remove <strong>{count}</strong> selected beneficiar{count === 1 ? 'y' : 'ies'}?
          </p>
          <label className="bd-field-label">Reason</label>
          <textarea
            className="bd-field-textarea"
            rows={3}
            placeholder="Reason for removal…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="bd-field-error">{error}</p>}
          <div className="bd-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="bd-btn-danger" disabled={busy}>
              {busy ? 'Removing…' : `Remove ${count}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BulkOverrideModal({ count, officerName, onClose, onSubmit }) {
  const [status, setStatus] = useState('CONFIRMED')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit({ status, reason: reason.trim(), officerName })
    } catch {
      setError('Bulk override failed — check reason and try again')
      setBusy(false)
    }
  }

  return (
    <div className="bd-modal-overlay" onClick={onClose}>
      <div className="bd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bd-modal-header">
          <div className="bd-modal-title">Bulk Override</div>
          <button type="button" className="bd-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="bd-modal-body" onSubmit={submit}>
          <p className="bd-modal-hint">
            Apply override to <strong>{count}</strong> selected beneficiar{count === 1 ? 'y' : 'ies'}.
          </p>
          <label className="bd-field-label">New status</label>
          <select className="bd-field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="CONFIRMED">Confirm</option>
            <option value="REMOVED">Remove</option>
          </select>
          <label className="bd-field-label">Reason (required, min 10 chars)</label>
          <textarea
            className="bd-field-textarea"
            rows={4}
            placeholder="Enter reason for override…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="bd-field-error">{error}</p>}
          <div className="bd-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Applying…' : `Override ${count}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatBulkResult(action, result) {
  const parts = [`${result.succeeded} ${action}`]
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
  if (result.failed > 0) parts.push(`${result.failed} failed`)
  return parts.join(' · ')
}

function OverrideModal({ beneficiary, officerName, onClose, onDone }) {
  const [status, setStatus] = useState('CONFIRMED')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      await overrideBeneficiary(beneficiary.id, {
        status,
        reason: reason.trim(),
        officerName,
      })
      onDone()
    } catch {
      setError('Override failed — check reason and try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bd-modal-overlay" onClick={onClose}>
      <div className="bd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bd-modal-header">
          <div className="bd-modal-title">Override Beneficiary Status</div>
          <button type="button" className="bd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="bd-modal-person">
          <div className="bd-modal-avatar">{beneficiary.personName?.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="bd-modal-name">{beneficiary.personName}</div>
            <div className="bd-modal-scheme">{beneficiary.schemeName}</div>
          </div>
        </div>
        <form className="bd-modal-body" onSubmit={submit}>
          <label className="bd-field-label">New status</label>
          <select className="bd-field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="CONFIRMED">Confirm</option>
            <option value="REMOVED">Remove</option>
          </select>
          <label className="bd-field-label">Reason (required, min 10 chars)</label>
          <textarea
            className="bd-field-textarea"
            rows={4}
            placeholder="Enter reason for override…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="bd-field-error">{error}</p>}
          <div className="bd-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Apply Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RemoveModal({ beneficiary, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      await removeBeneficiary(beneficiary.id, reason.trim())
      onDone()
    } catch {
      setError('Remove failed — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bd-modal-overlay" onClick={onClose}>
      <div className="bd-modal bd-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="bd-modal-header">
          <div className="bd-modal-title">Remove Beneficiary</div>
          <button type="button" className="bd-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="bd-modal-body" onSubmit={submit}>
          <p className="bd-modal-hint">
            Remove <strong>{beneficiary.personName}</strong> from {beneficiary.schemeName}?
          </p>
          <label className="bd-field-label">Reason</label>
          <textarea
            className="bd-field-textarea"
            rows={3}
            placeholder="Reason for removal…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="bd-field-error">{error}</p>}
          <div className="bd-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="bd-btn-danger" disabled={busy}>
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BeneficiaryTableRow({
  beneficiary: b,
  officerName,
  canOverride,
  expanded,
  selected,
  onToggleSelect,
  onToggleExpand,
  onUpdate,
  onRemove,
  onOverride,
  onGemmaExplain,
  gemmaActiveId,
  gemmaText,
  gemmaLoading,
}) {
  const [auditEvents, setAuditEvents] = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [busyAction, setBusyAction] = useState(null)

  const style = STATUS_STYLE[b.status] || STATUS_STYLE.IDENTIFIED

  useEffect(() => {
    if (!expanded) {
      setAuditEvents(null)
      return
    }
    let cancelled = false
    setAuditLoading(true)
    fetchBeneficiaryAudit(b.id)
      .then((data) => { if (!cancelled) setAuditEvents(data) })
      .catch(() => { if (!cancelled) setAuditEvents([]) })
      .finally(() => { if (!cancelled) setAuditLoading(false) })
    return () => { cancelled = true }
  }, [expanded, b.id])

  async function runAction(action, fn) {
    setBusyAction(action)
    try {
      await fn()
      onUpdate()
    } finally {
      setBusyAction(null)
    }
  }

  const note = b.removalReason || b.overrideReason || (b.disbursementRef ? `Ref ${b.disbursementRef}` : '')

  return (
    <>
      <tr className={`bd-row ${expanded ? 'bd-row-expanded' : ''} ${selected ? 'bd-row-selected' : ''}`}>
        <td className="bd-check-col">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${b.personName}`}
          />
        </td>
        <td className="bd-expand-col">
          <button type="button" className="bd-expand-btn" onClick={onToggleExpand} aria-label="Toggle details">
            {expanded ? '▾' : '▸'}
          </button>
        </td>
        <td>
          <Link
            to="/families"
            state={{ familyId: b.familyId, personId: b.personId }}
            className="bd-name-link"
          >
            {b.personName}
          </Link>
        </td>
        <td className="bd-cell-muted">{b.schemeName}</td>
        <td>{b.familyDistrict || '—'}</td>
        <td>{b.familyTaluka || '—'}</td>
        <td>{b.familyVillage || '—'}</td>
        <td>
          <span
            className="bd-status-badge"
            style={{ color: style.color, background: style.bg, borderColor: style.border }}
          >
            {b.status}
          </span>
        </td>
        <td className="bd-cell-ts">{formatTs(eventTime(b))}</td>
        <td className="bd-cell-note">{note || '—'}</td>
        <td className="bd-actions-cell">
          <div className="bd-actions-inline">
            {b.status === 'IDENTIFIED' && (
              <>
                <button
                  type="button"
                  className="btn-secondary ben-gemma-btn"
                  onClick={() => onGemmaExplain(b)}
                  title="Ask Gemma 4 to explain eligibility"
                >
                  ✨ Why?
                </button>
                <button
                  type="button"
                  className="bd-action-btn bd-action-confirm"
                  disabled={Boolean(busyAction)}
                  onClick={() => runAction('confirm', () => confirmBeneficiary(b.id, officerName))}
                >
                  {busyAction === 'confirm' ? '…' : 'Confirm'}
                </button>
              </>
            )}
            {b.status === 'CONFIRMED' && b.disbursementStatus !== 'DISBURSED' && (
              <button
                type="button"
                className="bd-action-btn bd-action-disburse"
                disabled={Boolean(busyAction)}
                onClick={() => runAction('disburse', () => disburseBeneficiary(b.id, officerName))}
              >
                {busyAction === 'disburse' ? '…' : 'Disburse'}
              </button>
            )}
            {b.status !== 'REMOVED' && (
              <button
                type="button"
                className="bd-action-btn bd-action-remove"
                disabled={Boolean(busyAction)}
                onClick={() => onRemove(b)}
              >
                Remove
              </button>
            )}
            {canOverride && (
              <button
                type="button"
                className="bd-action-btn bd-action-override"
                disabled={Boolean(busyAction)}
                onClick={() => onOverride(b)}
              >
                Override
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bd-detail-row">
          <td colSpan={11}>
            <div className="bd-detail-panel">
              {gemmaActiveId === b.id && (
                <div className="bd-gemma-inline">
                  <div className="bd-gemma-inline-header">
                    <span className="bd-gemma-inline-title">✨ AI Eligibility Explanation</span>
                    <span className="bd-gemma-inline-model">Gemma 4 (8B) · on-premise · no data leaves the cluster</span>
                  </div>
                  {gemmaLoading ? (
                    <div className="bd-gemma-inline-loading">
                      <span className="bd-gemma-spin">⟳</span> Gemma 4 is thinking…
                    </div>
                  ) : (
                    <p className="bd-gemma-inline-text">{gemmaText}</p>
                  )}
                </div>
              )}

              <ReasonChips reason={b.eligibilityReason} />
              <div className="bd-audit-trail bd-audit-trail-inline">
                <div className="bd-detail-title">Audit trail</div>
                {auditLoading && <p className="muted">Loading audit…</p>}
                {!auditLoading && auditEvents?.length === 0 && (
                  <p className="muted">No audit events recorded.</p>
                )}
                {auditEvents?.map((evt, i) => (
                  <div key={i} className="bd-audit-evt">
                    <span className="bd-audit-time">{formatTs(evt.timestamp)}</span>
                    <span className={`bd-audit-action ${auditActionClass(evt.action)}`}>{evt.action}</span>
                    <span className="bd-audit-actor">{evt.actor}</span>
                    {evt.detail && <span className="bd-audit-detail">{evt.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function BeneficiaryDashboard() {
  const officerName = localStorage.getItem('officer_name') ?? 'Officer'
  const role = localStorage.getItem('officer_role') ?? ''
  const canOverride = role === 'DEPT_ADMIN' || role === 'REVENUE_OFFICER'
  const districtScope = getOfficerDistrictScope()

  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState([])
  const [totalMatched, setTotalMatched] = useState(0)
  const [schemes, setSchemes] = useState([])
  const [geoOptions, setGeoOptions] = useState({ districts: [], talukas: [], villages: [] })

  const [schemeFilter, setSchemeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [districtFilter, setDistrictFilter] = useState(districtScope || '')
  const [talukaFilter, setTalukaFilter] = useState('')
  const [villageFilter, setVillageFilter] = useState('')
  const [autoRemovalsOnly, setAutoRemovalsOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('recent')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [overrideTarget, setOverrideTarget] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [bulkOverrideOpen, setBulkOverrideOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState(null)

  const [gemmaPanel, setGemmaPanel] = useState(null)
  const [gemmaText, setGemmaText] = useState('')
  const [gemmaLoading, setGemmaLoading] = useState(false)

  const selectedCount = selectedIds.size

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (schemeFilter) n++
    if (statusFilter !== 'ALL') n++
    if (districtFilter) n++
    if (autoRemovalsOnly) n++
    return n
  }, [schemeFilter, statusFilter, districtFilter, autoRemovalsOnly])

  const readyToLoad = true

  const pageSelectedAll = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  const selectedOnPage = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds]
  )

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (pageSelectedAll) {
        rows.forEach((r) => next.delete(r.id))
      } else {
        rows.forEach((r) => next.add(r.id))
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function runBulkConfirm() {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Confirm ${ids.length} selected beneficiary record(s)? Only IDENTIFIED rows will be updated.`)) {
      return
    }
    setBulkBusy(true)
    setBulkMessage(null)
    try {
      const result = await bulkConfirmBeneficiaries(ids, officerName)
      setBulkMessage(formatBulkResult('confirmed', result))
      clearSelection()
      handleRefresh()
    } catch {
      setBulkMessage('Bulk confirm failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  async function runBulkRemove(reason) {
    const ids = [...selectedIds]
    setBulkBusy(true)
    try {
      const result = await bulkRemoveBeneficiaries(ids, reason)
      setBulkRemoveOpen(false)
      setBulkMessage(formatBulkResult('removed', result))
      clearSelection()
      handleRefresh()
    } catch {
      setBulkMessage('Bulk remove failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  async function runBulkOverride(payload) {
    const ids = [...selectedIds]
    setBulkBusy(true)
    try {
      const result = await bulkOverrideBeneficiaries(ids, payload)
      setBulkOverrideOpen(false)
      setBulkMessage(formatBulkResult('overridden', result))
      clearSelection()
      handleRefresh()
    } catch {
      setBulkMessage('Bulk override failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchBeneficiarySummary({
        schemeId: schemeFilter || undefined,
        district: districtFilter || undefined,
      }))
    } catch {
      setSummary(null)
    }
  }, [schemeFilter, districtFilter])

  const loadGeoOptions = useCallback(async () => {
    try {
      const data = await fetchBeneficiaryGeoOptions({
        schemeId: schemeFilter || undefined,
        district: districtFilter || undefined,
        taluka: talukaFilter || undefined,
      })
      setGeoOptions(data)
    } catch {
      setGeoOptions({ districts: [], talukas: [], villages: [] })
    }
  }, [schemeFilter, districtFilter, talukaFilter])

  const loadPage = useCallback(async () => {
    if (!readyToLoad) {
      setRows([])
      setTotalMatched(0)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await fetchBeneficiaryRecent({
        schemeId: schemeFilter || undefined,
        status: autoRemovalsOnly ? 'REMOVED' : statusFilter,
        search: search.trim() || undefined,
        district: districtFilter || undefined,
        taluka: talukaFilter || undefined,
        village: villageFilter || undefined,
        autoRemovalsOnly,
        sortBy: sortCol,
        sortDir,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setTotalMatched(data.totalMatched ?? 0)
      setRows(data.results ?? [])
    } catch {
      setError('Could not load beneficiaries.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [
    schemeFilter, statusFilter, districtFilter, talukaFilter, villageFilter,
    autoRemovalsOnly, search, sortCol, sortDir, page, readyToLoad,
  ])

  useEffect(() => {
    fetch(`${SCHEME_API}/v1/schemes`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setSchemes(Array.isArray(list) ? list : []))
      .catch(() => setSchemes([]))
  }, [])

  useEffect(() => {
    loadSummary()
    const interval = setInterval(loadSummary, 30000)
    return () => clearInterval(interval)
  }, [loadSummary])

  useEffect(() => { loadGeoOptions() }, [loadGeoOptions])

  useEffect(() => {
    const t = setTimeout(loadPage, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadPage, search])

  useEffect(() => {
    if (!readyToLoad) return
    const interval = setInterval(loadPage, 10000)
    return () => clearInterval(interval)
  }, [loadPage, readyToLoad])

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc') }
    setPage(0)
  }

  useEffect(() => {
    clearSelection()
  }, [schemeFilter, statusFilter, districtFilter, talukaFilter, villageFilter, autoRemovalsOnly])

  function handleRefresh() {
    loadSummary()
    loadPage()
  }

  async function fetchGemmaExplanation(ben) {
    setExpandedId(ben.id)
    setGemmaPanel(ben)
    setGemmaText('')
    setGemmaLoading(true)
    try {
      const res = await fetch(`${AI_BASE}/v1/explain/beneficiary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheme_name: ben.schemeName ?? ben.scheme_name ?? '',
          person_name: ben.personName ?? ben.person_name ?? ben.name ?? '',
          caste: ben.caste ?? ben.casteCategory ?? null,
          income: ben.familyIncome
            ? parseInt(String(ben.familyIncome).replace(/[^\d]/g, ''), 10)
            : null,
          age: ben.age ?? null,
          eligibility_reason: ben.eligibilityReason ?? ben.eligibility_reason ?? null,
        }),
      })
      const data = res.ok ? await res.json() : null
      setGemmaText(data?.explanation ?? 'Could not generate explanation.')
    } catch {
      setGemmaText('Could not reach AI service.')
    } finally {
      setGemmaLoading(false)
    }
  }

  function toggleAutoRemovals() {
    setAutoRemovalsOnly((v) => !v)
    setPage(0)
    setExpandedId(null)
  }

  const totalPages = Math.max(1, Math.ceil(totalMatched / PAGE_SIZE))

  return (
    <div className="bd-root bd-root-table">
      <div className="bd-header">
        <div>
          <h1 className="bd-title">Beneficiary Dashboard</h1>
          <p className="bd-subtitle">Tabular view · filters · sorting · pagination</p>
          <DistrictScopeBanner noun="beneficiaries" />
        </div>
        <button type="button" className="btn-secondary bd-refresh" onClick={handleRefresh}>
          ↻ Refresh
        </button>
      </div>

      <div className="bd-kpi-row">
        <div className="bd-kpi">
          <span className="bd-kpi-label">Active Beneficiaries</span>
          <span className="bd-kpi-val bd-kpi-green">{summary?.active?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="bd-kpi">
          <span className="bd-kpi-label">Pending Confirmation</span>
          <span className="bd-kpi-val bd-kpi-blue">{summary?.pendingConfirmation?.toLocaleString() ?? '—'}</span>
        </div>
        <button
          type="button"
          className={`bd-kpi bd-kpi-clickable ${autoRemovalsOnly ? 'bd-kpi-active' : ''}`}
          onClick={toggleAutoRemovals}
          title="Toggle recent auto-removals filter"
        >
          <span className="bd-kpi-label">Auto-Removed</span>
          <span className="bd-kpi-val bd-kpi-red">{summary?.autoRemoved?.toLocaleString() ?? '—'}</span>
          {autoRemovalsOnly && <span className="bd-kpi-filter-tag">Filter on</span>}
        </button>
        <div className="bd-kpi">
          <span className="bd-kpi-label">Total Records</span>
          <span className="bd-kpi-val">{summary?.total?.toLocaleString() ?? '—'}</span>
        </div>
      </div>

      <div className="bd-toolbar bd-toolbar-wrap">
        <div className="bd-filter-counter">
          <span className={`bd-filter-badge ${readyToLoad ? 'bd-filter-badge-ok' : 'bd-filter-badge-need'}`}>
            {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </span>
        </div>
        <label className="bd-check-label">
          <input
            type="checkbox"
            checked={autoRemovalsOnly}
            onChange={(e) => { setAutoRemovalsOnly(e.target.checked); setPage(0) }}
          />
          Recent auto-removals only
        </label>
        <select
          className="bd-filter"
          value={schemeFilter}
          onChange={(e) => {
            setSchemeFilter(e.target.value)
            if (!districtScope) setDistrictFilter('')
            setTalukaFilter('')
            setVillageFilter('')
            setPage(0)
          }}
        >
          <option value="">All schemes</option>
          {schemes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="bd-filter"
          value={statusFilter}
          disabled={autoRemovalsOnly}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s}</option>
          ))}
        </select>
        <select
          className="bd-filter"
          value={districtFilter}
          disabled={Boolean(districtScope)}
          onChange={(e) => {
            if (districtScope) return
            setDistrictFilter(e.target.value)
            setTalukaFilter('')
            setVillageFilter('')
            setPage(0)
          }}
        >
          {!districtScope && <option value="">All districts</option>}
          {(districtScope
            ? [districtScope]
            : (geoOptions.districts ?? [])
          ).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="bd-filter"
          value={talukaFilter}
          disabled={!districtFilter}
          onChange={(e) => {
            setTalukaFilter(e.target.value)
            setVillageFilter('')
            setPage(0)
          }}
        >
          <option value="">All talukas</option>
          {(geoOptions.talukas ?? []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className="bd-filter"
          value={villageFilter}
          disabled={!talukaFilter}
          onChange={(e) => { setVillageFilter(e.target.value); setPage(0) }}
        >
          <option value="">All villages / cities</option>
          {(geoOptions.villages ?? []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          className="bd-search"
          placeholder="Search name or location…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
        />
      </div>

      {readyToLoad && (
        <div className="bd-table-meta muted">
          {totalMatched.toLocaleString()} matching · page {page + 1} of {totalPages}
        </div>
      )}

      {error && <p className="bd-error">{error}</p>}
      {bulkMessage && (
        <div className="bd-bulk-result">
          {bulkMessage}
          <button type="button" className="bd-bulk-result-dismiss" onClick={() => setBulkMessage(null)}>✕</button>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="bd-bulk-bar">
          <span className="bd-bulk-count">
            <strong>{selectedCount}</strong> selected
            {selectedCount > selectedOnPage.length && (
              <span className="muted"> ({selectedOnPage.length} on this page)</span>
            )}
          </span>
          <div className="bd-bulk-actions">
            <button
              type="button"
              className="bd-action-btn bd-action-confirm"
              disabled={bulkBusy || selectedCount === 0}
              onClick={runBulkConfirm}
            >
              Bulk Confirm ({selectedCount})
            </button>
            <button
              type="button"
              className="bd-action-btn bd-action-remove"
              disabled={bulkBusy || selectedCount === 0}
              onClick={() => setBulkRemoveOpen(true)}
            >
              Bulk Remove ({selectedCount})
            </button>
            {canOverride && (
              <button
                type="button"
                className="bd-action-btn bd-action-override"
                disabled={bulkBusy}
                onClick={() => setBulkOverrideOpen(true)}
              >
                Bulk Override ({selectedCount})
              </button>
            )}
            <button type="button" className="btn-secondary bd-bulk-clear" onClick={clearSelection}>
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div className="bd-table-wrap">
        <table className="bd-table">
          <thead>
            <tr>
              <th className="bd-check-col">
                <input
                  type="checkbox"
                  checked={pageSelectedAll}
                  onChange={toggleSelectPage}
                  aria-label="Select all on page"
                  title="Select all on this page"
                />
              </th>
              <th className="bd-expand-col" />
              <SortTh col="name" label="Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="scheme" label="Scheme" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="district" label="District" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="taluka" label="Taluka" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="village" label="Village / City" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="recent" label="Last Activity" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th>Notes</th>
              <th className="bd-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={11} className="bd-empty">Loading beneficiaries…</td></tr>
            ) : !loading && rows.length === 0 && !error ? (
              <tr><td colSpan={11} className="bd-empty">No beneficiaries match these filters.</td></tr>
            ) : null}
            {rows.map((b) => (
              <BeneficiaryTableRow
                key={b.id}
                beneficiary={b}
                officerName={officerName}
                canOverride={canOverride}
                expanded={expandedId === b.id}
                selected={selectedIds.has(b.id)}
                onToggleSelect={() => toggleSelect(b.id)}
                onToggleExpand={() => setExpandedId(expandedId === b.id ? null : b.id)}
                onUpdate={handleRefresh}
                onRemove={setRemoveTarget}
                onOverride={setOverrideTarget}
                onGemmaExplain={fetchGemmaExplanation}
                gemmaActiveId={gemmaPanel?.id ?? null}
                gemmaText={gemmaText}
                gemmaLoading={gemmaLoading}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="bd-pagination">
        <button
          type="button"
          className="btn-secondary"
          disabled={page <= 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ‹ Previous
        </button>
        <span className="muted">
          Page {page + 1} of {totalPages} · {totalMatched.toLocaleString()} total
        </span>
        <button
          type="button"
          className="btn-secondary"
          disabled={page + 1 >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next ›
        </button>
      </div>

      {removeTarget && (
        <RemoveModal
          beneficiary={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onDone={() => { setRemoveTarget(null); handleRefresh() }}
        />
      )}
      {overrideTarget && (
        <OverrideModal
          beneficiary={overrideTarget}
          officerName={officerName}
          onClose={() => setOverrideTarget(null)}
          onDone={() => { setOverrideTarget(null); handleRefresh() }}
        />
      )}
      {bulkRemoveOpen && (
        <BulkRemoveModal
          count={selectedCount}
          onClose={() => setBulkRemoveOpen(false)}
          onSubmit={runBulkRemove}
        />
      )}
      {bulkOverrideOpen && (
        <BulkOverrideModal
          count={selectedCount}
          officerName={officerName}
          onClose={() => setBulkOverrideOpen(false)}
          onSubmit={runBulkOverride}
        />
      )}
    </div>
  )
}
