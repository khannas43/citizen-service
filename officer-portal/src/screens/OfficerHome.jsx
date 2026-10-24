import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SLA_HOURS,
  displayName,
  fetchAllTasks,
  filterRecordsByOfficerDistrict,
  filterTasksByRole,
  slaLabel,
  taskCreatedAt,
  taskSlaUrgency,
  AI_BASE,
} from '../api'
import { getOfficerDistrictScope, officerHasFeature } from '../auth'
import './OfficerHome.css'

function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function isToday(d) {
  if (!d) return false
  const t = new Date(d)
  const n = new Date()
  return (
    t.getFullYear() === n.getFullYear()
    && t.getMonth() === n.getMonth()
    && t.getDate() === n.getDate()
  )
}

function timeAgo(d) {
  if (!d) return '—'
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function roleClass(role) {
  const map = {
    DATA_ENTRY_OFFICER: 'dg-role-data-entry',
    TALATI: 'dg-role-talati',
    REVENUE_OFFICER: 'dg-role-revenue',
    SCHEME_DEPT: 'dg-role-scheme-dept',
    DEPT_ADMIN: 'dg-role-dept-admin',
    IT_ADMIN: 'dg-role-dept-admin',
    SENIOR_MGMT: 'dg-role-dept-admin',
  }
  return map[role] ?? 'dg-role-talati'
}

function roleLabel(role) {
  const map = {
    DATA_ENTRY_OFFICER: 'Data Entry Officer',
    TALATI: 'Talati Officer',
    REVENUE_OFFICER: 'Revenue Officer',
    SCHEME_DEPT: 'Scheme Department',
    DEPT_ADMIN: 'Dept Admin',
    IT_ADMIN: 'IT Secretary',
    SENIOR_MGMT: 'Senior Management',
  }
  return map[role] ?? role.replace(/_/g, ' ')
}

function KpiSkeleton() {
  return (
    <div className="oh-kpi oh-kpi-skeleton">
      <div className="oh-kpi-icon-skel oh-shimmer" />
      <div className="oh-kpi-body">
        <div className="oh-shimmer oh-sk-num" />
        <div className="oh-shimmer oh-sk-lbl" />
        <div className="oh-shimmer oh-sk-sub" />
      </div>
    </div>
  )
}

export default function OfficerHome() {
  const navigate = useNavigate()
  const officerName = localStorage.getItem('officer_name') ?? 'Officer'
  const officerRole = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const districtScope = getOfficerDistrictScope()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [atRiskTasks, setAtRiskTasks] = useState([])
  const [slaLoading, setSlaLoading] = useState(true)

  const showSchemeLinks = officerHasFeature(officerRole, 'schemes')
  const showReportsLink = officerHasFeature(officerRole, 'reports')
  const isItAdmin = officerRole === 'IT_ADMIN'
  const showPlatformStats = officerRole === 'DEPT_ADMIN' || officerRole === 'IT_ADMIN'
  const showFamilies = officerHasFeature(officerRole, 'families')
  const showGrievances = officerHasFeature(officerRole, 'grievances')

  const load = useCallback(async () => {
    const includeCompleted = officerRole === 'DEPT_ADMIN' || officerRole === 'IT_ADMIN'
    const { tasks: merged } = await fetchAllTasks(includeCompleted)
    const roleTasks = filterTasksByRole(merged, officerRole)
    const scoped = await filterRecordsByOfficerDistrict(
      roleTasks,
      (t) => t.aadhaarRef,
      (t) => t.district || t.familyDistrict,
    )
    setTasks(scoped)
    setLoading(false)
  }, [officerRole])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const pending = tasks.filter((t) => (t.status || 'PENDING') === 'PENDING')
    if (!pending.length || !AI_BASE) {
      setAtRiskTasks([])
      setSlaLoading(false)
      return
    }
    setSlaLoading(true)
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
        const refs = new Set(data.filter((r) => r.at_risk).map((r) => r.engine_ref))
        setAtRiskTasks(pending.filter((t) => refs.has(t.engineRef)))
      })
      .catch(() => setAtRiskTasks([]))
      .finally(() => setSlaLoading(false))
  }, [tasks])

  const pendingCount = useMemo(
    () => tasks.filter((t) => (t.status || 'PENDING') === 'PENDING').length,
    [tasks],
  )

  const breachedCount = useMemo(
    () => tasks.filter((t) => t.status === 'PENDING' && taskSlaUrgency(t) === 'red').length,
    [tasks],
  )

  const approvedTodayCount = useMemo(
    () => tasks.filter(
      (t) => t.status === 'APPROVED' && isToday(t.updatedAt ?? t.created_at ?? t.createdAt),
    ).length,
    [tasks],
  )

  const urgentTasks = useMemo(
    () => [...tasks]
      .filter((t) => (t.status || 'PENDING') === 'PENDING')
      .sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2 }
        return (order[taskSlaUrgency(a)] ?? 3) - (order[taskSlaUrgency(b)] ?? 3)
      })
      .slice(0, 4),
    [tasks],
  )

  const recentApproved = useMemo(
    () => [...tasks]
      .filter((t) => t.status === 'APPROVED')
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, 5),
    [tasks],
  )

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const quickActions = [
    {
      icon: isItAdmin ? '🖥' : '📋',
      label: isItAdmin ? 'Ops Dashboard' : 'Task Queue',
      desc: isItAdmin ? 'Platform health & service metrics' : 'Review pending applications',
      to: isItAdmin ? '/ops-dashboard' : '/tasks',
      color: 'blue',
      show: true,
    },
    {
      icon: '👨‍👩‍👧‍👦',
      label: 'Family Registry',
      desc: 'Search and manage families',
      to: '/families',
      color: 'purple',
      show: showFamilies,
    },
    {
      icon: '📊',
      label: 'Scheme Mgmt',
      desc: 'Create and run identification',
      to: '/schemes',
      color: 'teal',
      show: showSchemeLinks,
    },
    {
      icon: '✅',
      label: 'Beneficiaries',
      desc: 'Confirm and manage disbursals',
      to: '/beneficiaries',
      color: 'green',
      show: showSchemeLinks,
    },
    {
      icon: '🔔',
      label: 'Grievances',
      desc: 'Resolve citizen complaints',
      to: '/grievances',
      color: 'amber',
      show: showGrievances,
    },
    {
      icon: '📈',
      label: 'Reports',
      desc: 'Analytics and dashboards',
      to: '/reports',
      color: 'indigo',
      show: showReportsLink,
    },
  ].filter((a) => a.show)

  return (
    <div className="oh-page">

      {/* Welcome strip */}
      <div className="oh-welcome">
        <div className="oh-welcome-left">
          <h2 className="oh-greeting">
            Good {timeOfDay()}, {officerName}
          </h2>
          <div className="oh-meta-row">
            <span className={`oh-role-badge ${roleClass(officerRole)}`}>
              {roleLabel(officerRole)}
            </span>
            <span className="oh-meta-sep">·</span>
            <span className="oh-district">
              {districtScope ? `${districtScope} District` : 'Bavla Taluka, Ahmedabad'}
            </span>
          </div>
        </div>
        <div className="oh-welcome-right">
          <div className="oh-date">{todayFormatted}</div>
          <div className="oh-status-row">
            <span className="oh-status-dot" />
            <span className="oh-status-lbl">All systems operational</span>
          </div>
        </div>
      </div>

      {/* Platform scale bar — admin roles only */}
      {showPlatformStats && (
        <div className="oh-scale-bar">
          <div className="oh-scale-stat">
            <span className="oh-scale-num">2,21,072</span>
            <span className="oh-scale-lbl">Families enrolled</span>
          </div>
          <div className="oh-scale-sep" />
          <div className="oh-scale-stat">
            <span className="oh-scale-num">9,49,843</span>
            <span className="oh-scale-lbl">Persons registered</span>
          </div>
          <div className="oh-scale-sep" />
          <div className="oh-scale-stat">
            <span className="oh-scale-num">78,987</span>
            <span className="oh-scale-lbl">Beneficiaries identified</span>
          </div>
          <div className="oh-scale-sep" />
          <div className="oh-scale-stat">
            <span className="oh-scale-num">20</span>
            <span className="oh-scale-lbl">Active schemes</span>
          </div>
          <div className="oh-scale-sep" />
          <div className="oh-scale-stat">
            <span className="oh-scale-num">33</span>
            <span className="oh-scale-lbl">Districts covered</span>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="oh-kpi-row">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <button
              type="button"
              className="oh-kpi oh-kpi-blue"
              onClick={() => navigate('/tasks')}
            >
              <div className="oh-kpi-icon oh-icon-blue">📋</div>
              <div className="oh-kpi-body">
                <div className="oh-kpi-num">{pendingCount}</div>
                <div className="oh-kpi-lbl">Pending Tasks</div>
                <div className="oh-kpi-sub">awaiting action</div>
              </div>
            </button>

            <button
              type="button"
              className={`oh-kpi oh-kpi-red${breachedCount > 0 ? ' oh-kpi-pulse' : ''}`}
              onClick={() => navigate('/tasks')}
            >
              <div className="oh-kpi-icon oh-icon-red">⏱</div>
              <div className="oh-kpi-body">
                <div className="oh-kpi-num">{breachedCount}</div>
                <div className="oh-kpi-lbl">SLA Breached</div>
                <div className="oh-kpi-sub">immediate attention</div>
              </div>
            </button>

            <div className="oh-kpi oh-kpi-green">
              <div className="oh-kpi-icon oh-icon-green">✅</div>
              <div className="oh-kpi-body">
                <div className="oh-kpi-num">{approvedTodayCount}</div>
                <div className="oh-kpi-lbl">Approved Today</div>
                <div className="oh-kpi-sub">within 24 hours</div>
              </div>
            </div>

            <button
              type="button"
              className="oh-kpi oh-kpi-amber"
              onClick={() => navigate('/tasks', { state: { filterAtRisk: true } })}
            >
              <div className="oh-kpi-icon oh-icon-amber">🤖</div>
              <div className="oh-kpi-body">
                <div className="oh-kpi-num">{slaLoading ? '—' : atRiskTasks.length}</div>
                <div className="oh-kpi-lbl">AI — At Risk</div>
                <div className="oh-kpi-sub">LightGBM predicted</div>
              </div>
            </button>
          </>
        )}
      </div>

      {/* Body grid */}
      <div className="oh-body">

        {/* Left: Quick Actions */}
        <div className="oh-left">
          <div className="oh-actions-grid">
            {quickActions.map((a) => (
              <button
                key={a.to}
                type="button"
                className="oh-action-card"
                onClick={() => navigate(a.to)}
              >
                <div className={`oh-action-icon oh-action-${a.color}`}>{a.icon}</div>
                <div className="oh-action-text">
                  <div className="oh-action-label">{a.label}</div>
                  <div className="oh-action-desc">{a.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: AI alert + Needs Attention */}
        <div className="oh-right">

          {!slaLoading && atRiskTasks.length > 0 ? (
            <div className="oh-alert oh-alert-amber">
              <div className="oh-alert-icon">🔴</div>
              <div className="oh-alert-content">
                <div className="oh-alert-title">
                  {atRiskTasks.length} task{atRiskTasks.length !== 1 ? 's' : ''} predicted to breach SLA
                </div>
                <div className="oh-alert-sub">LightGBM model · SHAP-explained</div>
                <button
                  type="button"
                  className="oh-alert-link"
                  onClick={() => navigate('/tasks', { state: { filterAtRisk: true } })}
                >
                  View At Risk Tasks →
                </button>
              </div>
            </div>
          ) : !slaLoading ? (
            <div className="oh-alert oh-alert-green">
              <div className="oh-alert-icon">✅</div>
              <div className="oh-alert-content">
                <div className="oh-alert-title">No SLA breaches predicted</div>
                <div className="oh-alert-sub">All tasks within safe window</div>
              </div>
            </div>
          ) : (
            <div className="oh-alert oh-alert-muted">
              <div className="oh-alert-sub">Checking AI risk model…</div>
            </div>
          )}

          <div className="oh-panel">
            <h3 className="oh-section-title">
              {urgentTasks.length > 0 ? 'Needs Attention' : 'Recent Activity'}
            </h3>

            {loading ? (
              <div className="oh-panel-muted">Loading…</div>
            ) : urgentTasks.length > 0 ? (
              <ul className="oh-task-list">
                {urgentTasks.map((t) => {
                  const urg = taskSlaUrgency(t)
                  const label = slaLabel(taskCreatedAt(t), SLA_HOURS[t.service] ?? 48)
                  return (
                    <li key={t.engineRef} className={`oh-task-row oh-task-${urg}`}>
                      <div className={`oh-task-dot oh-dot-${urg}`} />
                      <div className="oh-task-info">
                        <div className="oh-task-name">{displayName(t)}</div>
                        <div className="oh-task-svc">{t.service}</div>
                      </div>
                      <div className="oh-task-time">{label}</div>
                    </li>
                  )
                })}
              </ul>
            ) : recentApproved.length > 0 ? (
              <ul className="oh-recent-list">
                {recentApproved.map((a) => (
                  <li key={a.engineRef} className="oh-recent-row">
                    <span className="oh-recent-check">✓</span>
                    <div className="oh-recent-info">
                      <div className="oh-recent-name">{displayName(a)}</div>
                      <div className="oh-recent-svc">{a.service}</div>
                    </div>
                    <div className="oh-recent-ago">{timeAgo(a.updatedAt ?? a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="oh-panel-muted">No activity yet today.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
