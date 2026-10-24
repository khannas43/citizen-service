import { useCallback, useEffect, useState } from 'react'
import { fetchAllGrievances, fetchOpsSummary, HEALTH_SERVICES, pingServiceHealth, triggerBirthdayCheck } from '../api'
import './OpsDashboard.css'

export default function OpsDashboard() {
  const [health, setHealth] = useState({})
  const [summary, setSummary] = useState(null)
  const [grievances, setGrievances] = useState([])
  const [birthdayResult, setBirthdayResult] = useState(null)

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      HEALTH_SERVICES.map(async (s) => [s.name, await pingServiceHealth(s.path)])
    )
    setHealth(Object.fromEntries(results))
    try {
      setSummary(await fetchOpsSummary())
    } catch {
      setSummary(null)
    }
    setGrievances(await fetchAllGrievances())
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  const categories = grievances.reduce((acc, g) => {
    const key = g.trackingRef?.startsWith('FLW') ? 'Applications' : 'General'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const maxCat = Math.max(...Object.values(categories), 1)

  return (
    <>
      <h1 className="page-title">🖥 Ops Dashboard</h1>
      <p className="muted">Platform health and live statistics — refreshes every 30s.</p>

      <h2 className="section-title">Service Health</h2>
      <div className="ops-health-grid">
        {HEALTH_SERVICES.map((s) => (
          <div key={s.name} className={`ops-health-card ${health[s.name] ? 'ops-up' : 'ops-down'}`}>
            <span className="ops-dot" />
            <span>{s.name}</span>
          </div>
        ))}
      </div>

      {summary && (
        <>
          <h2 className="section-title">Platform Stats</h2>
          <div className="stats-row-4">
            <div className="stat-box">
              <span className="stat-label">Families</span>
              <span className="stat-value">{summary.totalFamilies}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Persons</span>
              <span className="stat-value">{summary.totalPersons}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Beneficiaries</span>
              <span className="stat-value">{summary.totalBeneficiaries}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Schemes</span>
              <span className="stat-value">{summary.totalSchemes}</span>
            </div>
          </div>
          <div className="ops-fraud-row">
            {['HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <span key={sev} className={`ops-fraud-chip ops-fraud-${sev.toLowerCase()}`}>
                {sev}: {summary.fraudSignalCount?.[sev] ?? 0}
              </span>
            ))}
            <span className="ops-fraud-chip">Open grievances: {summary.openGrievances}</span>
            <span className="ops-fraud-chip">Resolved: {summary.resolvedGrievances}</span>
          </div>
        </>
      )}

      <h2 className="section-title">Key Issues — Grievance Breakdown</h2>
      <div className="ops-bars">
        {Object.entries(categories).map(([cat, count]) => (
          <div key={cat} className="dist-row">
            <span className="dist-label">{cat}</span>
            <div className="dist-bar-track">
              <div className="dist-bar" style={{ width: `${(count / maxCat) * 100}%` }} />
            </div>
            <span className="dist-count">{count}</span>
          </div>
        ))}
        {Object.keys(categories).length === 0 && <p className="muted">No open grievances.</p>}
      </div>

      <h2 className="section-title">Demo Tools</h2>
      <button
        type="button"
        className="btn-secondary"
        onClick={async () => {
          const today = new Date().toISOString().slice(0, 10)
          setBirthdayResult(await triggerBirthdayCheck(today))
        }}
      >
        🎂 Run Birthday Check (today)
      </button>
      {birthdayResult && (
        <p className="small muted" style={{ marginTop: '0.5rem' }}>
          Turning 18: {birthdayResult.personsTurning18} · Newly identified: {birthdayResult.newlyIdentified} · Notifications: {birthdayResult.notificationsSent}
        </p>
      )}

      <h2 className="section-title">External Data Integrations</h2>
      <div className="ops-integrations-grid">
        {[
          { name: 'UIDAI — Aadhaar Auth',          icon: '🔐', status: 'connected', detail: 'Identity · DOB · Biometric',      sync: 'Real-time'  },
          { name: 'GSEB — Board Results',           icon: '📚', status: 'connected', detail: 'Education level · Certificates',  sync: 'Daily'      },
          { name: 'e-Dhara — Land Records',         icon: '🗺',  status: 'connected', detail: 'Land ownership · Survey no.',    sync: 'Weekly'     },
          { name: 'CRS — Civil Registration',       icon: '🏛',  status: 'degraded',  detail: 'Marital status · Birth · Death', sync: '4h ago'     },
          { name: 'NCS — Employment Exchange',      icon: '💼',  status: 'connected', detail: 'Employment status · Skills',     sync: 'Hourly'     },
          { name: 'DigiLocker — Document Verify',   icon: '📂',  status: 'connected', detail: 'Certificates · Marksheets',     sync: 'On-demand'  },
          { name: 'Jan Dhan — DBT Bank Link',       icon: '🏦',  status: 'connected', detail: 'Bank account · KYC',            sync: 'Real-time'  },
          { name: 'UDID — Disability Registry',     icon: '♿',  status: 'connected', detail: 'Disability type · Percentage',  sync: 'On-demand'  },
        ].map(({ name, icon, status, detail, sync }) => (
          <div key={name} className={`ops-integration-card ops-int-${status}`}>
            <span className="ops-int-icon">{icon}</span>
            <div className="ops-int-body">
              <span className="ops-int-name">{name}</span>
              <span className="ops-int-detail">{detail}</span>
            </div>
            <div className="ops-int-right">
              <span className="ops-int-dot" />
              <span className="ops-int-sync">Sync: {sync}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
