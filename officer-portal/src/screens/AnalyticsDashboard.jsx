import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AI_BASE,
  fetchAllTasks,
  fetchApplicationStats,
  fetchDashboardAnalytics,
  fetchGeographicVillages,
  fetchSchemeCoverage,
  taskCreatedAt,
} from '../api'
import { getOfficerDistrictScope, matchesOfficerDistrict } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import GujaratCoverageMap from '../components/GujaratCoverageMap'
import { GUJARAT_GEOJSON } from '../data/gujaratGeoJSON'
import './AnalyticsDashboard.css'

const GUJARAT_DISTRICT_NAMES = GUJARAT_GEOJSON.features
  .map((f) => f.properties?.name)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b))

// Fixed-order categorical palette (validated: dataviz skill reference palette)
const CATEGORICAL = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948']
const SERVICE_ORDER = ['Caste Certificate', 'Marriage Certificate', 'Pension', 'Family Member Change', 'Scheme Application']
const SERVICE_COLOR = Object.fromEntries(SERVICE_ORDER.map((s, i) => [s, CATEGORICAL[i]]))

// App's own status vocabulary (tokens.css) — reused so this dashboard reads as
// one system with the badges already shown everywhere else in the portal.
const STATUS_COLOR = { PENDING: '#B45309', APPROVED: '#1A7A4A', ESCALATED: '#B91C1C' }

// Sequential blue ramp, ordinal-safe steps (clears 2:1 on the light surface)
const SEQUENTIAL_10 = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

const numberFmt = (n) => (n ?? 0).toLocaleString()

function formatWaitTime(hours) {
  const h = Number(hours)
  if (!Number.isFinite(h) || h < 0) return '—'
  if (h < 1 / 60) return '< 1 min'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) {
    const n = h < 10 ? Number(h.toFixed(1)) : Math.round(h)
    return `${n} hour${n === 1 ? '' : 's'}`
  }
  const d = h / 24
  const n = d < 10 ? Number(d.toFixed(1)) : Math.round(d)
  return `${n} day${n === 1 ? '' : 's'}`
}

const titleCase = (s) => (s ?? '')
  .split('_')
  .filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  .join(' ')

const slugToTitle = (s) => (s ?? '')
  .replace(/[_.]+/g, '-')
  .split('-')
  .filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  .join(' ')

const OFFICER_TITLES = {
  'revenue-officer': 'Revenue Officer',
  'data-entry-officer': 'Data Entry Officer',
  'income-officer': 'Income Officer',
  talati: 'Talati',
  unassigned: 'Unassigned',
  'marriage-approver': 'Marriage Approver',
}

function officerDisplayName(raw) {
  const key = String(raw || 'unassigned').trim().toLowerCase().replace(/[_.]+/g, '-')
  return OFFICER_TITLES[key] || slugToTitle(key) || 'Unassigned'
}

const camelToTitle = (s) => (s ?? '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/^./, (c) => c.toUpperCase())

function StatTile({ label, value, spark }) {
  return (
    <div className="ad-kpi-tile">
      <div className="ad-kpi-label">{label}</div>
      <div className="ad-kpi-value">{value}</div>
      {spark && spark.length > 1 && (
        <div className="ad-kpi-spark">
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2a78d6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2a78d6"
                strokeWidth={2}
                fill={`url(#spark-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="section-card ad-chart-card">
      <div className="ad-chart-head">
        <h3 className="ad-chart-title">{title}</h3>
        {subtitle && <p className="ad-chart-subtitle">{subtitle}</p>}
      </div>
      {empty ? <div className="ad-empty">No data available yet.</div> : children}
    </div>
  )
}

function RankList({
  rows,
  labelKey,
  titleKey,
  valueKey,
  formatValue,
  colorFor,
  tooltipFor,
  headers,
  countKey,
  formatCount,
}) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] ?? 0))
  const withCount = Boolean(countKey)
  return (
    <div className={`ad-rank-list ${withCount ? 'ad-rank-list-with-count' : ''}`}>
      {headers && (
        <div className="ad-rank-head" aria-hidden="true">
          <span>{headers[0]}</span>
          <span />
          <span>{headers[1]}</span>
          {withCount && <span>{headers[2]}</span>}
        </div>
      )}
      {rows.map((row, i) => {
        const tip = tooltipFor ? tooltipFor(row) : (row[titleKey ?? labelKey] ?? '')
        return (
          <div className="ad-rank-row" key={`${row[labelKey]}-${i}`}>
            <span className="ad-rank-label">{row[labelKey]}</span>
            <div className="ad-rank-bar-track">
              <div
                className="ad-rank-bar"
                style={{
                  width: `${Math.max(4, ((row[valueKey] ?? 0) / max) * 100)}%`,
                  background: colorFor ? colorFor(row) : '#2a78d6',
                }}
              />
            </div>
            <span className="ad-rank-value">{formatValue ? formatValue(row[valueKey]) : numberFmt(row[valueKey])}</span>
            {withCount && (
              <span className="ad-rank-count">
                {formatCount ? formatCount(row[countKey]) : numberFmt(row[countKey])}
              </span>
            )}
            {tip && <div className="ad-rank-tip" role="tooltip">{tip}</div>}
          </div>
        )
      })}
    </div>
  )
}

function DonutChart({ data, dataKey, nameKey, colors, height = 240, formatValue }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="42%"
          cy="50%"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          isAnimationActive={false}
        >
          {data.map((row, i) => (
            <Cell key={row[nameKey]} fill={colors[i % colors.length]} stroke="var(--color-surface)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (formatValue ? formatValue(v) : numberFmt(v))} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          wrapperStyle={{ fontSize: 12, lineHeight: '20px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  boxShadow: 'var(--shadow-md)',
  fontSize: '0.8rem',
}

const ASK_PRESETS = [
  'Which districts have the highest grievance rate?',
  'Show beneficiaries by caste',
  'Income band distribution',
  'Open vs acknowledged grievances',
  'Platform KPI snapshot',
  'Age distribution of beneficiaries',
]

function askTheData(question, analytics) {
  const q = (question || '').toLowerCase()
  if (!analytics) return { title: 'No analytics payload loaded', columns: [], rows: [] }

  const grievanceRate = (analytics.grievanceCorrelation ?? []).map((r) => ({
    District: r.district,
    Grievances: numberFmt(r.grievance_count),
    Beneficiaries: numberFmt(r.beneficiary_count),
    'Per 1,000': r.grievances_per_1000_beneficiaries,
  }))
  const caste = (analytics.casteBreakdown ?? []).reduce((acc, r) => {
    const key = r.caste_category || 'Unknown'
    acc.set(key, (acc.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
    return acc
  }, new Map())
  const casteRows = [...caste.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([Caste, Count]) => ({ Caste, Count: numberFmt(Count) }))
  const income = (analytics.incomeBands ?? []).reduce((acc, r) => {
    const key = r.income_band || 'Unknown'
    acc.set(key, (acc.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
    return acc
  }, new Map())
  const incomeRows = [...income.entries()].map(([Band, Count]) => ({ Band, Count: numberFmt(Count) }))
  const age = (analytics.ageBands ?? []).reduce((acc, r) => {
    const key = r.age_band || 'Unknown'
    acc.set(key, (acc.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
    return acc
  }, new Map())
  const ageRows = [...age.entries()].map(([Band, Count]) => ({ Band, Count: numberFmt(Count) }))
  const grievanceByStatus = (analytics.grievanceSummary ?? []).reduce((acc, r) => {
    const key = titleCase(r.status || 'unknown')
    acc.set(key, (acc.get(key) ?? 0) + Number(r.grievance_count ?? 0))
    return acc
  }, new Map())
  const grievanceStatusRows = [...grievanceByStatus.entries()].map(([Status, Count]) => ({
    Status,
    Count: numberFmt(Count),
  }))
  const kpiRows = (analytics.kpis ?? []).map((k) => ({
    KPI: k.kpi_name,
    Value: numberFmt(Number(k.kpi_value)),
  }))
  const districtRows = (analytics.geoDistribution ?? [])
    .reduce((acc, r) => {
      const key = r.district || 'Unknown'
      acc.set(key, (acc.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
      return acc
    }, new Map())
  const topDistricts = [...districtRows.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([District, Beneficiaries]) => ({ District, Beneficiaries: numberFmt(Beneficiaries) }))

  if (q.includes('grievance') && (q.includes('district') || q.includes('rate') || q.includes('highest'))) {
    return { title: 'Grievance load vs beneficiary volume by district', columns: ['District', 'Grievances', 'Beneficiaries', 'Per 1,000'], rows: grievanceRate }
  }
  if (q.includes('caste')) {
    return { title: 'Beneficiaries by caste category', columns: ['Caste', 'Count'], rows: casteRows }
  }
  if (q.includes('income')) {
    return { title: 'Beneficiaries by household income band', columns: ['Band', 'Count'], rows: incomeRows }
  }
  if (q.includes('age')) {
    return { title: 'Beneficiaries by age band', columns: ['Band', 'Count'], rows: ageRows }
  }
  if (q.includes('grievance')) {
    return { title: 'Grievances by status', columns: ['Status', 'Count'], rows: grievanceStatusRows }
  }
  if (q.includes('kpi') || q.includes('snapshot') || q.includes('platform')) {
    return { title: 'Platform KPI snapshot', columns: ['KPI', 'Value'], rows: kpiRows }
  }
  if (q.includes('district') || q.includes('geo') || q.includes('where')) {
    return { title: 'Top districts by beneficiary count', columns: ['District', 'Beneficiaries'], rows: topDistricts }
  }
  return {
    title: 'Try a suggested question below — answers read live analytics views',
    columns: ['KPI', 'Value'],
    rows: kpiRows,
  }
}

function AskDataPanel({ analytics }) {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)

  function run(q) {
    const text = (q ?? question).trim()
    if (!text) return
    setQuestion(text)
    setResult(askTheData(text, analytics))
  }

  return (
    <section className="section-card ad-ask">
      <div className="ad-chart-head">
        <h3 className="ad-chart-title">Ask the data</h3>
        <p className="ad-chart-subtitle">
          Answers come from the live analytics views already loaded on this page
        </p>
      </div>
      <form
        className="ad-ask-row"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <input
          className="ad-ask-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which districts have the highest grievance rate?"
          aria-label="Ask a question about analytics data"
        />
        <button type="submit" className="btn-primary" disabled={!question.trim()}>
          Run query
        </button>
      </form>
      <div className="ad-ask-presets">
        <div className="ad-ask-presets-label">Suggested questions</div>
        <div className="ad-ask-preset-list">
          {ASK_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="ad-ask-chip"
              onClick={() => run(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      {result && (
        <div className="ad-ask-result">
          <div className="ad-ask-result-title">{result.title}</div>
          {result.rows.length === 0 ? (
            <div className="ad-empty">No rows for this question yet.</div>
          ) : (
            <div className="ad-ask-table-wrap">
              <table className="ad-ask-table">
                <thead>
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((col) => (
                        <td key={col}>{row[col] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function AnalyticsDashboard() {
  const districtScope = getOfficerDistrictScope()
  const [analytics, setAnalytics] = useState(null)
  const [analyticsError, setAnalyticsError] = useState(null)
  const [appStats, setAppStats] = useState([])
  const [appStatsErrors, setAppStatsErrors] = useState([])
  const [schemes, setSchemes] = useState([])
  const [selectedSchemeId, setSelectedSchemeId] = useState('ALL')
  const [districtFilter, setDistrictFilter] = useState(() => getOfficerDistrictScope() || 'ALL')
  const [selectedMapDistrict, setSelectedMapDistrict] = useState(() => getOfficerDistrictScope() || null)
  const [talukaRows, setTalukaRows] = useState([])
  const [expandedTaluka, setExpandedTaluka] = useState(null)
  const [villageRows, setVillageRows] = useState([])
  const [villageLoading, setVillageLoading] = useState(false)
  const [slaRisks, setSlaRisks] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchDashboardAnalytics({
          district: districtFilter !== 'ALL' ? districtFilter : undefined,
          schemeId: selectedSchemeId !== 'ALL' ? selectedSchemeId : undefined,
        })
        if (!cancelled) {
          setAnalytics(data)
          setAnalyticsError(null)
        }
      } catch (err) {
        if (!cancelled) setAnalyticsError(err.message)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [districtFilter, selectedSchemeId])

  useEffect(() => {
    let cancelled = false
    async function loadApps() {
      try {
        const { stats, errors } = await fetchApplicationStats()
        if (!cancelled) {
          setAppStats(stats)
          setAppStatsErrors(errors)
        }
      } catch {
        // fetchApplicationStats never throws (Promise.allSettled internally)
      }
    }
    loadApps()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchSchemeCoverage()
      .then((data) => {
        if (!cancelled) setSchemes(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadRisk() {
      try {
        const { tasks } = await fetchAllTasks(false)
        const pending = tasks.filter((t) => (t.status || 'PENDING') === 'PENDING')
        if (!cancelled) setPendingTasks(pending)
        if (!AI_BASE || !pending.length) return
        const res = await fetch(`${AI_BASE}/v1/sla/predict`, {
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
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const byRef = Object.fromEntries(pending.map((t) => [t.engineRef, t]))
        const atRisk = data
          .filter((r) => r.at_risk)
          .map((r) => ({ ...r, task: byRef[r.engine_ref] }))
          .sort((a, b) => b.risk_score - a.risk_score)
        setSlaRisks(atRisk)
      } catch {
        // AI service unreachable — panel just shows nothing, rest of dashboard is unaffected
      }
    }
    loadRisk()
  }, [])

  const kpis = analytics?.kpis ?? []
  const selectedScheme = useMemo(
    () => schemes.find((s) => String(s.schemeId ?? s.id) === String(selectedSchemeId)) ?? null,
    [schemes, selectedSchemeId],
  )
  const activeDistrict = districtFilter !== 'ALL' ? districtFilter : selectedMapDistrict

  const districtOptions = useMemo(() => {
    const names = new Set(GUJARAT_DISTRICT_NAMES)
    ;(analytics?.geoDistribution ?? []).forEach((r) => {
      if (r.district) names.add(r.district)
    })
    ;(analytics?.grievanceCorrelation ?? []).forEach((r) => {
      if (r.district) names.add(r.district)
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [analytics])

  const schemeFilterLabel = selectedSchemeId === 'ALL'
    ? 'all schemes'
    : (selectedScheme?.schemeName || 'selected scheme')
  const districtFilterLabel = districtFilter === 'ALL' ? 'all districts' : districtFilter

  const weeklySpark = useMemo(() => {
    const byWeek = new Map()
    ;(analytics?.weeklyGrowth ?? []).forEach((r) => {
      const key = r.week_start
      byWeek.set(key, (byWeek.get(key) ?? 0) + Number(r.cumulative_total ?? 0))
    })
    return [...byWeek.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([week_start, value]) => ({ week_start, value }))
  }, [analytics])

  const grievanceOpenCount = useMemo(() => {
    const rows = analytics?.grievanceSummary ?? []
    return rows
      .filter((r) => ['OPEN', 'IN_PROGRESS', 'PENDING'].includes((r.status || '').toUpperCase()))
      .reduce((sum, r) => sum + Number(r.grievance_count ?? 0), 0)
  }, [analytics])

  const slaCompliancePct = useMemo(() => {
    let approved = 0
    let escalated = 0
    appStats.forEach((s) => {
      approved += Number(s.statusCounts?.APPROVED ?? 0)
      escalated += Number(s.statusCounts?.ESCALATED ?? 0)
    })
    const total = approved + escalated
    return total > 0 ? Math.round((approved / total) * 100) : null
  }, [appStats])

  const statusComposition = useMemo(() => {
    let pending = 0
    let approved = 0
    let escalated = 0
    appStats.forEach((s) => {
      pending += Number(s.statusCounts?.PENDING ?? 0)
      approved += Number(s.statusCounts?.APPROVED ?? 0)
      escalated += Number(s.statusCounts?.ESCALATED ?? 0)
    })
    return [
      { status: 'Pending', count: pending, color: STATUS_COLOR.PENDING },
      { status: 'Approved', count: approved, color: STATUS_COLOR.APPROVED },
      { status: 'Escalated', count: escalated, color: STATUS_COLOR.ESCALATED },
    ].filter((r) => r.count > 0)
  }, [appStats])

  const grievanceByCategory = useMemo(() => {
    const rows = analytics?.grievanceSummary ?? []
    const byCategory = new Map()
    rows.forEach((r) => {
      const key = r.category || 'General'
      byCategory.set(key, (byCategory.get(key) ?? 0) + Number(r.grievance_count ?? 0))
    })
    return [...byCategory.entries()]
      .map(([category, grievance_count]) => ({ category: titleCase(category), grievance_count }))
      .sort((a, b) => b.grievance_count - a.grievance_count)
  }, [analytics])

  const statusByService = useMemo(
    () => appStats.map((s) => ({
      service: s.service,
      PENDING: s.statusCounts?.PENDING ?? 0,
      APPROVED: s.statusCounts?.APPROVED ?? 0,
      ESCALATED: s.statusCounts?.ESCALATED ?? 0,
    })),
    [appStats]
  )

  const topBottlenecks = useMemo(() => {
    const byKey = new Map()
    const add = (service, stageLabel, hours, count) => {
      if (!count || hours == null || Number.isNaN(Number(hours))) return
      const label = `${stageLabel} · ${service}`
      const prev = byKey.get(label)
      if (!prev) {
        byKey.set(label, {
          label,
          full: label,
          service,
          hoursSum: Number(hours) * count,
          count,
        })
        return
      }
      prev.hoursSum += Number(hours) * count
      prev.count += count
    }

    appStats.forEach((s) => {
      (s.stageBreakdown ?? []).forEach((stage) => {
        add(s.service, camelToTitle(stage.stage), stage.avgHours, stage.count)
      })
    })
    pendingTasks.forEach((task) => {
      const created = new Date(taskCreatedAt(task)).getTime()
      if (Number.isNaN(created)) return
      const hours = Math.max(0, (Date.now() - created) / 3_600_000)
      const stageLabel = camelToTitle(task.currentTask || task.taskName || 'Current stage')
      add(task.service, stageLabel, hours, 1)
    })

    return [...byKey.values()]
      .map((row) => ({ ...row, avgHours: row.count ? row.hoursSum / row.count : 0 }))
      .sort((a, b) => b.avgHours - a.avgHours)
      .slice(0, 8)
  }, [appStats, pendingTasks])

  const topBacklog = useMemo(() => {
    const rows = []
    appStats.forEach((s) => {
      (s.backlogByAssignee ?? []).forEach((b) => {
        rows.push({
          label: officerDisplayName(b.assignee),
          full: `${officerDisplayName(b.assignee)} · ${s.service}`,
          service: s.service,
          pending: b.pending,
        })
      })
    })
    return rows.sort((a, b) => b.pending - a.pending).slice(0, 10)
  }, [appStats])

  const grievanceCorrelation = useMemo(
    () => (analytics?.grievanceCorrelation ?? [])
      .filter((r) => (r.beneficiary_count ?? 0) > 0)
      .sort((a, b) => (b.grievances_per_1000_beneficiaries ?? 0) - (a.grievances_per_1000_beneficiaries ?? 0))
      .slice(0, 10),
    [analytics]
  )

  const incomeBandChart = useMemo(() => {
    const byBand = new Map()
    ;(analytics?.incomeBands ?? []).forEach((r) => {
      const key = r.income_band
      const cur = byBand.get(key) ?? { income_band: key, band_order: r.band_order, beneficiary_count: 0 }
      cur.beneficiary_count += Number(r.beneficiary_count ?? 0)
      byBand.set(key, cur)
    })
    return [...byBand.values()].sort((a, b) => a.band_order - b.band_order)
  }, [analytics])

  const ageBandChart = useMemo(() => {
    const byBand = new Map()
    ;(analytics?.ageBands ?? []).forEach((r) => {
      const key = r.age_band
      const cur = byBand.get(key) ?? { age_band: key, band_order: r.band_order, beneficiary_count: 0 }
      cur.beneficiary_count += Number(r.beneficiary_count ?? 0)
      byBand.set(key, cur)
    })
    return [...byBand.values()].sort((a, b) => a.band_order - b.band_order)
  }, [analytics])

  const casteChart = useMemo(() => {
    const byCaste = new Map()
    ;(analytics?.casteBreakdown ?? []).forEach((r) => {
      const key = r.caste_category
      byCaste.set(key, (byCaste.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
    })
    return [...byCaste.entries()]
      .map(([caste_category, beneficiary_count]) => ({ caste_category, beneficiary_count }))
      .sort((a, b) => b.beneficiary_count - a.beneficiary_count)
  }, [analytics])

  const mapDistricts = useMemo(() => {
    const byDistrict = new Map()
    ;(analytics?.geoDistribution ?? []).forEach((r) => {
      const name = r.district
      if (!name) return
      byDistrict.set(name, (byDistrict.get(name) ?? 0) + Number(r.beneficiary_count ?? 0))
    })
    return [...byDistrict.entries()].map(([districtName, totalCitizens]) => ({ districtName, totalCitizens }))
  }, [analytics])

  const filteredBeneficiaryCount = useMemo(
    () => mapDistricts.reduce((sum, d) => sum + Number(d.totalCitizens ?? 0), 0),
    [mapDistricts],
  )

  useEffect(() => {
    const district = activeDistrict
    setExpandedTaluka(null)
    setVillageRows([])
    if (!district) {
      setTalukaRows([])
      return
    }
    const byTaluka = new Map()
    ;(analytics?.geoDistribution ?? []).forEach((r) => {
      if (!matchesOfficerDistrict(r.district, district)) return
      const key = r.taluka || 'Unknown'
      byTaluka.set(key, (byTaluka.get(key) ?? 0) + Number(r.beneficiary_count ?? 0))
    })
    setTalukaRows(
      [...byTaluka.entries()]
        .map(([name, beneficiaryCount]) => ({ name, beneficiaryCount }))
        .sort((a, b) => b.beneficiaryCount - a.beneficiaryCount),
    )
  }, [activeDistrict, analytics])

  async function toggleTaluka(name) {
    if (expandedTaluka === name) {
      setExpandedTaluka(null)
      setVillageRows([])
      return
    }
    setExpandedTaluka(name)
    setVillageRows([])
    if (!activeDistrict || !selectedSchemeId || selectedSchemeId === 'ALL') return
    setVillageLoading(true)
    try {
      const data = await fetchGeographicVillages(selectedSchemeId, activeDistrict, name, {
        sortBy: 'count', sortDir: 'desc', offset: 0, limit: 40,
      })
      setVillageRows(data.results ?? [])
    } catch {
      setVillageRows([])
    } finally {
      setVillageLoading(false)
    }
  }

  function handleDistrictFilterChange(value) {
    if (districtScope) return
    setDistrictFilter(value)
    setSelectedMapDistrict(value === 'ALL' ? null : value)
  }

  function handleMapDistrictSelect(name) {
    if (districtScope && !matchesOfficerDistrict(name, districtScope)) return
    setSelectedMapDistrict(name)
    if (!districtScope) setDistrictFilter(name)
  }

  if (loading) {
    return <div className="ad-loading">Loading platform analytics…</div>
  }

  return (
    <div className="ad-root">
      <h1 className="page-title">📊 Platform Analytics</h1>
      <DistrictScopeBanner noun="analytics" />

      <div className="ad-filter-bar">
        <label className="ad-filter-field">
          <span>District</span>
          <select
            className="ad-scheme-select"
            value={districtFilter}
            disabled={Boolean(districtScope)}
            onChange={(e) => handleDistrictFilterChange(e.target.value)}
          >
            {!districtScope && <option value="ALL">All districts</option>}
            {(districtScope ? [districtScope] : districtOptions).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="ad-filter-field">
          <span>Scheme</span>
          <select
            className="ad-scheme-select"
            value={selectedSchemeId}
            onChange={(e) => setSelectedSchemeId(e.target.value)}
          >
            <option value="ALL">All schemes</option>
            {schemes.map((s) => {
              const id = s.schemeId ?? s.id
              return <option key={id} value={id}>{s.schemeName || s.name}</option>
            })}
          </select>
        </label>
      </div>
      <p className="ad-filter-context">
        Showing {districtFilterLabel} · {schemeFilterLabel}
        {districtFilter !== 'ALL' && (
          <> · {numberFmt(filteredBeneficiaryCount)} beneficiaries in this district</>
        )}
      </p>

      {analyticsError && <div className="ad-error">Could not load platform analytics: {analyticsError}</div>}

      {/* 1. Pulse strip */}
      <div className="ad-kpi-row">
        {kpis.map((k) => (
          <StatTile
            key={k.kpi_name}
            label={k.kpi_name}
            value={numberFmt(Number(k.kpi_value))}
            spark={k.kpi_name === 'Active Beneficiaries' ? weeklySpark : null}
          />
        ))}
        <StatTile
          label={districtFilter === 'ALL' ? 'Beneficiaries in view' : `Beneficiaries · ${districtFilter}`}
          value={numberFmt(filteredBeneficiaryCount)}
        />
        <StatTile label="SLA Compliance" value={slaCompliancePct != null ? `${slaCompliancePct}%` : '—'} />
        <StatTile label="Open Grievances" value={numberFmt(grievanceOpenCount)} />
      </div>

      {/* Application funnel — maps sit two sections below the KPIs */}
      <div className="ad-grid-2">
        <ChartCard
          title="Applications by Status"
          subtitle="Certificate workflows — statewide, not scoped to district or scheme"
          empty={!statusByService.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusByService} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <XAxis dataKey="service" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="PENDING" stackId="s" fill={STATUS_COLOR.PENDING} radius={[0, 0, 0, 0]} />
              <Bar dataKey="APPROVED" stackId="s" fill={STATUS_COLOR.APPROVED} radius={[0, 0, 0, 0]} />
              <Bar dataKey="ESCALATED" stackId="s" fill={STATUS_COLOR.ESCALATED} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="ad-legend">
            <span><i style={{ background: STATUS_COLOR.PENDING }} /> Pending</span>
            <span><i style={{ background: STATUS_COLOR.APPROVED }} /> Approved</span>
            <span><i style={{ background: STATUS_COLOR.ESCALATED }} /> Escalated</span>
          </div>
          {appStatsErrors.length > 0 && (
            <div className="ad-error ad-error-inline">Some services didn't respond: {appStatsErrors.join('; ')}</div>
          )}
        </ChartCard>

        <ChartCard
          title="Status Composition"
          subtitle="Certificate workflows — statewide"
          empty={!statusComposition.length}
        >
          <DonutChart
            data={statusComposition}
            dataKey="count"
            nameKey="status"
            colors={statusComposition.map((r) => r.color)}
          />
        </ChartCard>
      </div>

      <section className="section-card">
        <div className="ad-chart-head">
          <div>
            <h3 className="ad-chart-title">Geographic Distribution</h3>
            <p className="ad-chart-subtitle">
              {activeDistrict
                ? `${activeDistrict} · ${schemeFilterLabel} · taluka${selectedSchemeId === 'ALL' ? '' : ' and village'} drill-down`
                : 'Pick a district in the filter (or on the map) to show taluka-level counts'}
            </p>
          </div>
        </div>
        {mapDistricts.length > 0 ? (
          <GujaratCoverageMap
            districts={mapDistricts}
            selectedDistrict={activeDistrict}
            onSelectDistrict={handleMapDistrictSelect}
            schemeId={selectedSchemeId === 'ALL' ? undefined : selectedSchemeId}
            focusDistrict={districtScope}
          />
        ) : (
          <div className="ad-empty">No geographic beneficiary data for this filter.</div>
        )}
        {activeDistrict && (
          <div className="ad-geo-drill">
            <div className="ad-geo-drill-title">Talukas in {activeDistrict}</div>
            {talukaRows.length === 0 ? (
              <div className="ad-empty">No taluka rows for this district.</div>
            ) : (
              <table className="ad-ask-table">
                <thead>
                  <tr>
                    <th />
                    <th>Taluka</th>
                    <th>Beneficiaries</th>
                  </tr>
                </thead>
                <tbody>
                  {talukaRows.map((row) => (
                    <Fragment key={row.name}>
                      <tr
                        className={expandedTaluka === row.name ? 'ad-geo-row-open' : ''}
                        onClick={() => toggleTaluka(row.name)}
                        style={{ cursor: selectedSchemeId !== 'ALL' ? 'pointer' : 'default' }}
                      >
                        <td>{selectedSchemeId !== 'ALL' ? (expandedTaluka === row.name ? '▾' : '▸') : ''}</td>
                        <td>{row.name}</td>
                        <td>{numberFmt(row.beneficiaryCount)}</td>
                      </tr>
                      {expandedTaluka === row.name && (
                        <tr>
                          <td colSpan={3}>
                            <div className="ad-geo-villages">
                              <div className="ad-geo-drill-title">Villages / cities in {row.name}</div>
                              {villageLoading && <p className="muted">Loading villages…</p>}
                              {!villageLoading && villageRows.length === 0 && (
                                <p className="muted">Select a single scheme to load village counts.</p>
                              )}
                              {!villageLoading && villageRows.length > 0 && (
                                <table className="ad-ask-table">
                                  <thead>
                                    <tr>
                                      <th>Village / city</th>
                                      <th>Beneficiaries</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {villageRows.map((v) => (
                                      <tr key={v.name}>
                                        <td>{v.name}</td>
                                        <td>{numberFmt(v.beneficiaryCount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <ChartCard
        title="Slowest Workflow Stages"
        subtitle="Average time applications wait at each stage. Values are in minutes, hours, or days."
        empty={!topBottlenecks.length}
      >
        <RankList
          rows={topBottlenecks}
          labelKey="label"
          titleKey="full"
          valueKey="avgHours"
          formatValue={formatWaitTime}
          countKey="count"
          formatCount={(v) => `${numberFmt(v)} ${v === 1 ? 'case' : 'cases'}`}
          headers={['Stage', 'Avg. wait', 'Cases']}
          colorFor={(row) => SERVICE_COLOR[row.service] ?? '#2a78d6'}
          tooltipFor={(row) =>
            `${row.full}\nAverage wait: ${formatWaitTime(row.avgHours)}\nCases at this stage: ${numberFmt(row.count)}`}
        />
      </ChartCard>

      <ChartCard title="Backlog by Officer" subtitle="Top 10 pending-task backlogs across all services" empty={!topBacklog.length}>
        <RankList
          rows={topBacklog}
          labelKey="label"
          titleKey="full"
          valueKey="pending"
          formatValue={(v) => `${numberFmt(v)} cases`}
          colorFor={(row) => SERVICE_COLOR[row.service] ?? '#2a78d6'}
          tooltipFor={(row) => `${row.full}\nPending cases: ${numberFmt(row.pending)}`}
        />
      </ChartCard>

      {/* 4. SLA risk panel */}
      <ChartCard
        title="SLA Breach Risk"
        subtitle="Live model prediction (LightGBM + SHAP) on pending applications"
        empty={!slaRisks.length}
      >
        <div className="ad-shap-list">
          {slaRisks.slice(0, 12).map((r) => (
            <div className="ad-shap-row" key={r.engine_ref}>
              <span className="ad-shap-ref">{r.task?.applicationNo || r.engine_ref}</span>
              <span className="ad-shap-service">{r.task?.service}</span>
              <span className="ad-shap-badge" style={{ background: STATUS_COLOR.ESCALATED }}>
                {Math.round(r.risk_score * 100)}% risk
              </span>
              <span className="ad-shap-explain">{r.shap_explanation}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* 5. Grievance correlation */}
      <ChartCard
        title="Grievance Load vs. Beneficiary Volume"
        subtitle={districtFilter === 'ALL'
          ? 'Districts with the highest grievances per 1,000 beneficiaries'
          : `Grievance rate for ${districtFilter}`}
        empty={!grievanceCorrelation.length}
      >
        <ResponsiveContainer width="100%" height={Math.max(200, grievanceCorrelation.length * 32)}>
          <BarChart data={grievanceCorrelation} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="district" tick={{ fontSize: 11 }} width={110} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} per 1,000`, 'Grievance rate']} />
            <Bar dataKey="grievances_per_1000_beneficiaries" radius={[0, 4, 4, 0]}>
              {grievanceCorrelation.map((_, i) => (
                <Cell key={i} fill={SEQUENTIAL_10[Math.min(SEQUENTIAL_10.length - 1, i)]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Grievance Types"
        subtitle="Share of grievances by category, open and resolved combined"
        empty={!grievanceByCategory.length}
      >
        <DonutChart
          data={grievanceByCategory}
          dataKey="grievance_count"
          nameKey="category"
          colors={CATEGORICAL}
        />
      </ChartCard>

      {/* 6. Welfare / beneficiary deep-dive */}
      <div className="ad-grid-2">
        <ChartCard title="Income Distribution" subtitle={`Household income bands · ${schemeFilterLabel}`} empty={!incomeBandChart.length}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={incomeBandChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <XAxis dataKey="income_band" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="beneficiary_count" radius={[4, 4, 0, 0]}>
                {incomeBandChart.map((row, i) => (
                  <Cell key={row.income_band} fill={SEQUENTIAL_10[Math.min(SEQUENTIAL_10.length - 1, i)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Age Distribution" subtitle={`Age bands · ${schemeFilterLabel}`} empty={!ageBandChart.length}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageBandChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <XAxis dataKey="age_band" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="beneficiary_count" radius={[4, 4, 0, 0]}>
                {ageBandChart.map((row, i) => (
                  <Cell key={row.age_band} fill={SEQUENTIAL_10[Math.min(SEQUENTIAL_10.length - 1, i)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Caste Representation" subtitle={`Caste category · ${schemeFilterLabel}`} empty={!casteChart.length}>
        <DonutChart
          data={casteChart}
          dataKey="beneficiary_count"
          nameKey="caste_category"
          colors={CATEGORICAL}
        />
      </ChartCard>

      <AskDataPanel analytics={analytics} />
    </div>
  )
}
