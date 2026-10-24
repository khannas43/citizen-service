import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  SLA_HOURS,
  approveBaseForTask,
  certificateDownloadUrl,
  displayName,
  fetchAllTasks,
  fetchCitizenFamily,
  fetchCitizenPerson,
  filterRecordsByOfficerDistrict,
  filterTasksByRole,
  searchPersons,
  sendInfoRequest,
  AI_BASE,
  slaLabel,
  slaUrgency,
  taskCreatedAt,
  taskMeta,
  taskSlaUrgency,
} from '../api'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import ApplicationDetailModal from './ApplicationDetailModal'

// ── AI-4: Predictive SLA Risk ──────────────────────────────────────────
const AVG_DAILY_THROUGHPUT = 8 // applications processed per day per service

function predictedBreachHours(task) {
  const slaHours = SLA_HOURS[task.service]
  if (!slaHours) return null
  const created = new Date(taskCreatedAt(task)).getTime()
  if (Number.isNaN(created)) return null
  const remaining = (created + slaHours * 3_600_000 - Date.now()) / 3_600_000
  return Math.max(0, Math.round(remaining))
}
// ─────────────────────────────────────────────────────────────────────────

function engineRefParts(engineRef) {
  const dash = engineRef.indexOf('-')
  if (dash === -1) return { prefix: null, rest: engineRef }
  return { prefix: engineRef.slice(0, dash), rest: engineRef.slice(dash + 1) }
}

function SLABadge({ createdAt, service }) {
  const hours = SLA_HOURS[service]
  const urgency = slaUrgency(createdAt, hours)
  const label = slaLabel(createdAt, hours)
  if (!urgency || !label) return <span className="muted">—</span>
  return <span className={`dg-sla-${urgency}`}>{label}</span>
}

function formatRef(app) {
  const { prefix, rest } = engineRefParts(app.engineRef)
  return app.applicationNo || (prefix ? `${prefix}-${rest.slice(0, 8).toUpperCase()}` : rest)
}

function formatSubmitted(app) {
  const created = taskCreatedAt(app)
  if (!created) return '—'
  return new Date(created).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const SLA_ORDER = { red: 0, amber: 1, green: 2 }
const STATUS_ORDER = { ESCALATED: 0, PENDING: 1, APPROVED: 2 }

const PAGE_SIZE = 15

export default function TaskQueue() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tasks, setTasks] = useState([])
  const [inboxTotal, setInboxTotal] = useState(0)
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileLoadingId, setProfileLoadingId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [infoModal, setInfoModal] = useState(null)
  const [infoText, setInfoText] = useState('')
  const [infoSending, setInfoSending] = useState(false)
  const [infoSent, setInfoSent] = useState(false)
  const [detailApp, setDetailApp] = useState(null)
  const [lastChecked, setLastChecked] = useState(null)
  const [search, setSearch] = useState('')
  const [filterService, setFilterService] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterSLA, setFilterSLA] = useState('ALL')
  const [sortField, setSortField] = useState('sla')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [filterAtRisk, setFilterAtRisk] = useState(false)
  const [slaRisks, setSlaRisks] = useState({})
  const officerRole = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const officerName = localStorage.getItem('officer_name') ?? 'Officer'

  function computeRiskScore(task, allTasks) {
    // Prefer the live AI score when available
    const apiResult = slaRisks[task.engineRef]
    if (apiResult !== undefined) return apiResult.risk_score

    // AI fetch not yet resolved — use SLA urgency as a reliable fallback
    // so the At Risk tab is never empty while the model is loading
    if ((task.status || 'PENDING') !== 'PENDING') return 0
    const urgency = taskSlaUrgency(task)
    if (urgency === 'red') return 0.95   // already breached
    if (urgency === 'amber') return 0.78  // near-breach (within 6h of deadline)

    // Green tasks: use formula (rarely crosses 0.75 unless queue is very deep)
    const slaHours = SLA_HOURS[task.service]
    if (!slaHours) return 0
    const created = new Date(taskCreatedAt(task)).getTime()
    if (Number.isNaN(created)) return 0
    const elapsedHours = (Date.now() - created) / 3_600_000
    const elapsedRatio = Math.min(1, elapsedHours / slaHours)
    const pendingOfType = allTasks.filter(
      (t) => t.service === task.service && (t.status || 'PENDING') === 'PENDING'
    ).length
    const queueFactor = Math.min(1, pendingOfType / AVG_DAILY_THROUGHPUT)
    return elapsedRatio * 0.6 + queueFactor * 0.4
  }

  function RiskPredictionBadge({ task, allTasks }) {
    const score = computeRiskScore(task, allTasks)
    if (score <= 0.75) return null
    const apiResult = slaRisks[task.engineRef]
    const hours = apiResult?.predicted_breach_hours ?? predictedBreachHours(task)
    const label = hours === 0
      ? '🔴 Breach imminent'
      : `🔴 Predicted breach ~${hours}h`
    const detail = apiResult?.shap_explanation ?? null
    return (
      <div className="tq-risk-badge" title={detail ?? undefined}>
        {label}
      </div>
    )
  }

  const load = useCallback(async () => {
    const includeCompleted = officerRole === 'DEPT_ADMIN' || officerRole === 'IT_ADMIN'
    const { tasks: merged, errors: fetchErrors } = await fetchAllTasks(includeCompleted)
    const roleTasks = filterTasksByRole(merged, officerRole)
    const scoped = await filterRecordsByOfficerDistrict(
      roleTasks,
      (t) => t.aadhaarRef,
      (t) => t.district || t.familyDistrict,
    )
    setInboxTotal(merged.length)
    setTasks(scoped)
    setErrors(fetchErrors)
    setLoading(false)
    setLastChecked(new Date())
  }, [officerRole])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (location.state?.filterAtRisk) {
      setFilterAtRisk(true)
      setPage(1)
    }
  }, [location.state])

  useEffect(() => {
    const pending = tasks.filter((t) => (t.status || 'PENDING') === 'PENDING')
    if (!pending.length || !AI_BASE) return

    fetch(`${AI_BASE}/v1/sla/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: pending.map((t) => ({
          engineRef: t.engineRef,
          service: t.service,
          createdAt: taskCreatedAt(t),
          status: 'PENDING',
          queueDepth: pending.length,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const map = {}
        data.forEach((r) => { map[r.engine_ref] = r })
        setSlaRisks(map)
      })
      .catch(() => {})
  }, [tasks, AI_BASE])

  async function handleCitizenClick(app) {
    setProfileLoadingId(app.engineRef)
    try {
      let person = null
      if (app.aadhaarRef) {
        person = await fetchCitizenPerson(app.aadhaarRef)
      }

      const targetName = (app.applicantName || app.personName || displayName(app) || '').trim()

      if (!person && app.familyId) {
        const family = await fetchCitizenFamily(app.familyId)
        const members = family?.members ?? []
        if (targetName) {
          person = members.find((m) => m.name?.toLowerCase() === targetName.toLowerCase())
        }
        if (!person && members.length) {
          person = members.find((m) => m.relationshipToHead === 'HEAD') ?? members[0]
        }
        if (person || app.familyId) {
          navigate('/families', {
            state: {
              familyId: app.familyId,
              personId: person?.id,
            },
          })
          return
        }
      }

      if (!person && targetName) {
        const data = await searchPersons({ name: targetName, limit: 10 })
        person = data.results?.find((p) => p.name?.toLowerCase() === targetName.toLowerCase())
          ?? data.results?.[0]
      }

      if (person?.familyId) {
        navigate('/families', {
          state: { familyId: person.familyId, personId: person.id },
        })
      } else {
        setErrors((prev) => [...prev, `Could not find family profile for ${displayName(app)}`])
      }
    } catch {
      setErrors((prev) => [...prev, `Could not open profile for ${displayName(app)}`])
    } finally {
      setProfileLoadingId(null)
    }
  }

  async function handleApprove(app) {
    setApprovingId(app.engineRef)
    const base = approveBaseForTask(app)
    try {
      const res = await fetch(
        `${base}/v1/applications/${encodeURIComponent(app.engineRef)}/approve`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error(`Approve failed (HTTP ${res.status})`)
      await load()
    } catch (err) {
      setErrors((prev) => [...prev, err.message ?? 'Approve failed'])
    } finally {
      setApprovingId(null)
    }
  }

  function openNoteModal(app) {
    const sla = slaLabel(taskCreatedAt(app), SLA_HOURS[app.service])
    const criteria = [
      `✓ Applicant: ${displayName(app)}`,
      `✓ Service metadata: ${taskMeta(app) || 'verified'}`,
      `✓ Workflow step: ${app.currentTask ?? 'review'}`,
    ]
    const note = [
      `Application ${formatRef(app)} — ${app.service}`,
      `Applicant: ${displayName(app)} (${taskMeta(app) || '—'})`,
      `Submitted: ${taskCreatedAt(app) ? new Date(taskCreatedAt(app)).toLocaleString() : '—'} | Step: ${app.currentTask ?? '—'} | SLA: ${sla ?? '—'}`,
      '',
      'System verification:',
      ...criteria,
      '',
      'Recommended action: [APPROVE / REQUEST_DOCUMENTS / REJECT]',
      `Officer notes: ___________  Reviewed by: ${officerName}  Date: ${new Date().toLocaleDateString()}`,
    ].join('\n')
    setNoteText(note)
    setNoteModal(app)
  }

  async function copyNote() {
    await navigator.clipboard.writeText(noteText)
  }

  async function handleSendInfoRequest() {
    if (!infoModal || !infoText.trim()) return
    setInfoSending(true)
    try {
      await sendInfoRequest(
        infoModal.aadhaarRef,
        infoModal.engineRef,
        infoModal.applicationNo || infoModal.engineRef,
        infoModal.service,
        infoText.trim(),
        officerName
      )
      setInfoSent(true)
      setTimeout(() => {
        setInfoModal(null)
        setInfoText('')
        setInfoSent(false)
      }, 1500)
    } catch {
      // fire-and-forget for demo
    } finally {
      setInfoSending(false)
    }
  }

  const pending = tasks.filter((t) => t.status === 'PENDING').length
  const approved = tasks.filter((t) => t.status === 'APPROVED').length
  const escalated = tasks.filter((t) => t.status === 'ESCALATED').length
  const urgent = tasks.filter(
    (t) => t.status === 'PENDING' && taskSlaUrgency(t) === 'red'
  ).length
  const atRiskCount = tasks.filter((t) => computeRiskScore(t, tasks) > 0.75).length

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const mul = sortDir === 'asc' ? 1 : -1

    const filtered = tasks.filter((t) => {
      if (filterAtRisk && computeRiskScore(t, tasks) <= 0.75) return false
      if (filterService !== 'ALL' && t.service !== filterService) return false
      if (filterStatus !== 'ALL' && (t.status || 'PENDING') !== filterStatus) return false
      if (filterSLA !== 'ALL' && taskSlaUrgency(t) !== filterSLA) return false
      if (q) {
        const name = displayName(t).toLowerCase()
        const ref = (t.applicationNo || t.engineRef || '').toLowerCase()
        if (!name.includes(q) && !ref.includes(q)) return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      if (sortField === 'name') {
        return mul * displayName(a).localeCompare(displayName(b))
      }
      if (sortField === 'service') {
        return mul * (a.service || '').localeCompare(b.service || '')
      }
      if (sortField === 'meta') {
        return mul * (taskMeta(a) || '').localeCompare(taskMeta(b) || '')
      }
      if (sortField === 'ref') {
        return mul * formatRef(a).localeCompare(formatRef(b))
      }
      if (sortField === 'currentTask') {
        return mul * (a.currentTask || '').localeCompare(b.currentTask || '')
      }
      if (sortField === 'sla') {
        const ua = SLA_ORDER[taskSlaUrgency(a)] ?? 9
        const ub = SLA_ORDER[taskSlaUrgency(b)] ?? 9
        return mul * (ua - ub)
      }
      if (sortField === 'status') {
        const sa = STATUS_ORDER[a.status || 'PENDING'] ?? 9
        const sb = STATUS_ORDER[b.status || 'PENDING'] ?? 9
        return mul * (sa - sb)
      }
      if (sortField === 'submitted') {
        return mul * (new Date(taskCreatedAt(a) || 0) - new Date(taskCreatedAt(b) || 0))
      }
      return 0
    })
  }, [tasks, slaRisks, search, filterService, filterStatus, filterSLA, sortField, sortDir, filterAtRisk])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const paginated = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'submitted' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function sortIndicator(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function clearFilters() {
    setSearch('')
    setFilterService('ALL')
    setFilterStatus('ALL')
    setFilterSLA('ALL')
    setFilterAtRisk(false)
    setPage(1)
  }

  function statusClass(status) {
    if (status === 'APPROVED') return 'tq-status-approved'
    if (status === 'ESCALATED') return 'tq-status-escalated'
    return 'tq-status-pending'
  }

  function rowClass(app) {
    if (app.status === 'APPROVED') return 'tq-row-approved'
    if (app.status === 'ESCALATED') return 'tq-row-escalated'
    if (app.status === 'PENDING' && taskSlaUrgency(app) === 'red') return 'tq-row-red sla-breach-imminent'
    return ''
  }

  return (
    <>
      <DistrictScopeBanner noun="applications" />
      <div className="stats-row-4">
        <div className="stat-card stat-card-pending">
          <span className="stat-label">Pending Review</span>
          <span className="stat-value stat-value-pending">{pending}</span>
        </div>
        <div className="stat-card stat-card-approved">
          <span className="stat-label">Approved Today</span>
          <span className="stat-value stat-value-approved">{approved}</span>
        </div>
        <div className="stat-card stat-card-breached">
          <span className="stat-label">SLA Breached</span>
          <span className={`stat-value${escalated > 0 ? ' stat-value-breached' : ' stat-value-muted'}`}>
            {escalated}
          </span>
        </div>
        <div className="stat-card stat-card-urgent">
          <span className="stat-label">SLA Urgent</span>
          <span className={`stat-value${urgent > 0 ? ' stat-value-urgent' : ' stat-value-muted'}`}>
            {urgent}
          </span>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="error-banner">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="tq-quick-tabs">
          <button
            type="button"
            className={`tq-quick-tab${!filterAtRisk ? ' tq-quick-tab-active' : ''}`}
            onClick={() => { setFilterAtRisk(false); setPage(1) }}
          >
            All Tasks
            <span className="tq-tab-count">{tasks.length}</span>
          </button>
          <button
            type="button"
            className={`tq-quick-tab tq-quick-tab-risk${filterAtRisk ? ' tq-quick-tab-active tq-quick-tab-risk-active' : ''}`}
            onClick={() => { setFilterAtRisk(true); setPage(1) }}
          >
            ⚠ AI Predicted — At Risk
            {atRiskCount > 0 && <span className="tq-tab-count tq-tab-count-risk">{atRiskCount}</span>}
          </button>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="tq-toolbar">
          <div className="tq-search-wrap">
            <span className="tq-search-icon">🔍</span>
            <input
              type="text"
              className="tq-search"
              placeholder="Search applicant or ref…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            {search && (
              <button
                type="button"
                className="tq-search-clear"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
              >
                ✕
              </button>
            )}
          </div>

          <select
            className="complaints-filter-select"
            value={filterService}
            onChange={(e) => {
              setFilterService(e.target.value)
              setPage(1)
            }}
          >
            <option value="ALL">All services</option>
            <option value="Caste Certificate">Caste Certificate</option>
            <option value="Marriage Certificate">Marriage Certificate</option>
            <option value="Pension">Pension</option>
            <option value="Family Member Change">Family Member Change</option>
            <option value="Scheme Application">Scheme Application</option>
          </select>

          <select
            className="complaints-filter-select"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="ESCALATED">Escalated</option>
          </select>

          <select
            className="complaints-filter-select"
            value={filterSLA}
            onChange={(e) => {
              setFilterSLA(e.target.value)
              setPage(1)
            }}
          >
            <option value="ALL">All SLA</option>
            <option value="red">🔴 Breached / Urgent</option>
            <option value="amber">🟡 Warning</option>
            <option value="green">🟢 On track</option>
          </select>

          {(search || filterService !== 'ALL' || filterStatus !== 'ALL' || filterSLA !== 'ALL' || filterAtRisk) && (
            <button type="button" className="complaints-filter-clear" onClick={clearFilters}>
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <p className="loading">Loading applications…</p>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-circle" aria-hidden="true">🏛</div>
          <p className="empty-heading">No tasks in your queue</p>
          <p className="empty-role-note">Current role: {officerRole.replace(/_/g, ' ')}</p>
          {inboxTotal > 0 && (
            <p className="empty-role-note">
              {inboxTotal} application{inboxTotal === 1 ? '' : 's'} are in the system, but none
              are assigned to this role. Log in as <code>dept.admin</code> / <code>officer123</code> to
              see the full queue, or <code>talati</code>, <code>data.entry</code>, <code>revenue</code>,
              or <code>scheme.dept</code> for the matching inbox.
            </p>
          )}
          {lastChecked && (
            <p className="empty-checked">Last checked: {lastChecked.toLocaleTimeString()}</p>
          )}
        </div>
      ) : displayed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-circle" aria-hidden="true">🔍</div>
          <p className="empty-heading">No applications match this filter</p>
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="complaints-table-wrap card">
            <table className="complaints-table tq-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'name' ? ' active' : ''}`} onClick={() => toggleSort('name')}>
                      Applicant{sortIndicator('name')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'service' ? ' active' : ''}`} onClick={() => toggleSort('service')}>
                      Service{sortIndicator('service')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'meta' ? ' active' : ''}`} onClick={() => toggleSort('meta')}>
                      Details{sortIndicator('meta')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'ref' ? ' active' : ''}`} onClick={() => toggleSort('ref')}>
                      Ref{sortIndicator('ref')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'currentTask' ? ' active' : ''}`} onClick={() => toggleSort('currentTask')}>
                      Workflow Step{sortIndicator('currentTask')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'sla' ? ' active' : ''}`} onClick={() => toggleSort('sla')}>
                      SLA{sortIndicator('sla')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                      Status{sortIndicator('status')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className={`th-sort${sortField === 'submitted' ? ' active' : ''}`} onClick={() => toggleSort('submitted')}>
                      Submitted{sortIndicator('submitted')}
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((app) => {
                  const assigneeLine = app.assignee
                    ? `Assignee: ${app.assignee}`
                    : app.candidateGroups
                      ? `Group: ${app.candidateGroups}`
                      : null

                  return (
                    <tr key={app.engineRef} className={rowClass(app)}>
                      <td>
                        <button
                          type="button"
                          className="citizen-name-link"
                          onClick={() => handleCitizenClick(app)}
                          disabled={profileLoadingId === app.engineRef}
                          title="View Citizen 360° Profile"
                        >
                          {profileLoadingId === app.engineRef ? 'Opening…' : displayName(app)}
                        </button>
                      </td>
                      <td>{app.service}</td>
                      <td>{taskMeta(app) || '—'}</td>
                      <td className="mono-cell">
                        <button
                          type="button"
                          className="tq-ref-link"
                          onClick={() => setDetailApp(app)}
                          title="View application details and correspondence"
                        >
                          {formatRef(app)}
                        </button>
                      </td>
                      <td>
                        {app.currentTask ?? '—'}
                        {assigneeLine && <span className="tq-step-sub">{assigneeLine}</span>}
                      </td>
                      <td>
                        {app.status === 'PENDING' ? (
                          <>
                            <SLABadge createdAt={app.createdAt} service={app.service} />
                            <RiskPredictionBadge task={app} allTasks={tasks} />
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`tq-status-pill ${statusClass(app.status || 'PENDING')}`}>
                          {app.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="muted">{formatSubmitted(app)}</td>
                      <td>
                        <div className="tq-actions">
                          {app.status === 'PENDING' && (
                            <>
                              <button type="button" className="btn-secondary" onClick={() => openNoteModal(app)}>
                                Note
                              </button>
                              {app.aadhaarRef && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setInfoModal(app)
                                    setInfoText('')
                                    setInfoSent(false)
                                  }}
                                >
                                  Info
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-approve"
                                disabled={approvingId === app.engineRef}
                                onClick={() => handleApprove(app)}
                              >
                                {approvingId === app.engineRef ? '…' : 'Approve'}
                              </button>
                            </>
                          )}
                          {app.status === 'APPROVED' && app.service === 'Caste Certificate' && (
                            <a className="btn-secondary" href={certificateDownloadUrl(app.engineRef)} download>
                              Certificate
                            </a>
                          )}
                          {app.status === 'APPROVED' && app.service !== 'Caste Certificate' && (
                            <span className="label-approved">Approved</span>
                          )}
                          {app.status === 'ESCALATED' && <span className="label-escalated">Escalated</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="tq-table-footer">
            <p className="tq-result-count">
              {displayed.length === tasks.length
                ? `${tasks.length} application${tasks.length !== 1 ? 's' : ''}`
                : `${displayed.length} of ${tasks.length} applications`}
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </p>

            {totalPages > 1 && (
              <div className="tq-pagination">
                <button type="button" className="tq-page-btn" disabled={page === 1} onClick={() => setPage(1)}>
                  «
                </button>
                <button
                  type="button"
                  className="tq-page-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹ Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '…' ? (
                      <span key={`ellipsis-${i}`} className="tq-page-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`tq-page-btn${p === page ? ' active' : ''}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  type="button"
                  className="tq-page-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next ›
                </button>
                <button
                  type="button"
                  className="tq-page-btn"
                  disabled={page === totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  »
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {detailApp && (
        <ApplicationDetailModal
          key={detailApp.engineRef}
          app={detailApp}
          onClose={() => setDetailApp(null)}
          onRequestInfo={(app) => {
            setInfoModal(app)
            setInfoText('')
            setInfoSent(false)
          }}
          onViewCitizen={(app) => {
            setDetailApp(null)
            handleCitizenClick(app)
          }}
        />
      )}

      {infoModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => { setInfoModal(null); setInfoText('') }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>🔍 Request Information from Citizen</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 0.75rem' }}>
              Application: <strong>{infoModal.applicationNo || infoModal.engineRef}</strong> — {infoModal.service}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 0.75rem' }}>
              Citizen: <strong>{displayName(infoModal)}</strong>
            </p>
            <textarea
              rows={4}
              placeholder="Describe what additional information or documents you need from the citizen…"
              value={infoText}
              onChange={(e) => setInfoText(e.target.value)}
              style={{
                width: '100%',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            {infoSent && (
              <p style={{ color: 'green', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                ✅ Notification sent to citizen.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setInfoModal(null); setInfoText('') }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={infoSending || !infoText.trim()}
                onClick={handleSendInfoRequest}
              >
                {infoSending ? 'Sending…' : '📨 Send to Citizen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>📝 Officer Note — {formatRef(noteModal)}</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontFamily: 'var(--font-primary)' }}>
              {displayName(noteModal)} — {noteModal.service}
            </p>
            <textarea
              rows={14}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{
                width: '100%',
                fontFamily: 'var(--font-primary)',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn-approve" onClick={copyNote}>Copy to Clipboard</button>
              <button type="button" className="btn-secondary" onClick={() => setNoteModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
