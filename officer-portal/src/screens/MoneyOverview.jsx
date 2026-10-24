import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchIntegrityOverview } from '../api'
import { normalizeOfficerRole, officerHasFeature } from '../auth'
import MoneyMap, { METRICS } from '../components/MoneyMap'
import './MoneyOverview.css'

// who may open each kind of case (mirrors the service: payroll cases show individual salaries)
const BENEFICIARY_ROLES = ['SCHEME_DEPT', 'DEPT_ADMIN', 'REVENUE_OFFICER', 'IT_ADMIN', 'FINANCE_OFFICER']
const PAYROLL_ROLES = ['DEPT_ADMIN', 'PAYROLL_REVIEWER', 'FINANCE_OFFICER', 'HR_OFFICER']
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

/** ISO month key (YYYY-MM) → chart/table label MM/YY, e.g. 2025-11 → 11/25 */
function formatMonthShort(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return String(iso ?? '')
  return `${m[2]}/${m[1].slice(-2)}`
}
const RULE_NAMES = {
  801: 'Repeated enrollment', 802: 'Conflicting entitlement', 803: 'Payment after verified event', 804: 'Shared bank destination',
  805: 'Bank-change concentration', 806: 'Eligibility mismatch', 807: 'Salaried beneficiary', S01: 'Overlapping salary',
  S02: 'Post-event entitlement', S03: 'Excess allowance', S04: 'Duplicate arrears', S05: 'Pension mismatch', S06: 'Record verification risk',
}

const MONTH_METRICS = {
  flagged: { label: 'Flagged', color: '#2c5282' },
  confirmed: { label: 'Confirmed', color: '#276749' },
  recovered: { label: 'Recovered', color: '#744210' },
  prevented: { label: 'Stopped', color: '#702459' },
}

function monthBarChart(months, metricKey) {
  const field = metricKey
  const values = months.map((m) => Number(m[field] || 0))
  const max = Math.max(1, ...values)
  const w = 640
  const h = 200
  const pad = { l: 8, r: 8, t: 8, b: 28 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const barW = innerW / months.length - 4
  const color = MONTH_METRICS[metricKey]?.color ?? '#1b3c74'
  const bars = months.map((m, i) => {
    const v = Number(m[field] || 0)
    const bh = (v / max) * innerH
    const x = pad.l + i * (innerW / months.length) + 2
    const y = pad.t + innerH - bh
    return { key: m.month, x, y, bh: Math.max(v > 0 ? 2 : 0, bh), v, label: formatMonthShort(m.month) }
  })
  return { w, h, bars, max, color, field }
}

/** The money picture for senior management: what is flagged, confirmed, recovered and stopped, by district. */
export default function MoneyOverview() {
  const navigate = useNavigate()
  const role = normalizeOfficerRole(localStorage.getItem('officer_role'))
  const showGuidedStory = officerHasFeature(role, 'story')
  const canOpenBeneficiary = BENEFICIARY_ROLES.includes(role)
  const canOpenPayroll = PAYROLL_ROLES.includes(role)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [metric, setMetric] = useState('flaggedAmount')
  const [monthMetric, setMonthMetric] = useState('flagged')

  useEffect(() => { fetchIntegrityOverview().then(setData).catch((e) => setError(e.message)) }, [])

  const rows = useMemo(() => data?.byDistrict ?? [], [data])
  const months = useMemo(() => data?.byMonth ?? [], [data])
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b.flaggedAmount) - Number(a.flaggedAmount)), [rows])
  const chosen = rows.find((r) => r.district === selected)
  const t = data?.totals
  const chart = useMemo(() => monthBarChart(months, monthMetric), [months, monthMetric])
  const monthLabel = MONTH_METRICS[monthMetric]?.label ?? monthMetric

  if (error) return <p className="mo-error" role="alert">{error}</p>
  if (!data) return <p>Loading…</p>

  return (
    <div className="money-overview">
      <header className="mo-page-header">
        <div>
          <h1>Money at a glance</h1>
          <p className="mo-sub">What the integrity checks have flagged, confirmed, recovered and stopped. Totals only; no individual is shown.</p>
        </div>
        {showGuidedStory && (
          <Link to="/story" className="btn-secondary mo-header-action">🎬 Guided Story</Link>
        )}
      </header>

      <dl className="mo-kpis" aria-label="Totals">
        <div><dt>Flagged, still open</dt><dd>{rupees(t.flaggedAmount)}</dd><small>{t.openAlerts} open alerts</small></div>
        <div><dt>Confirmed overpayment</dt><dd>{rupees(t.confirmedAmount)}</dd></div>
        <div><dt>Recovered</dt><dd>{rupees(t.recoveredAmount)}</dd><small>{t.recoveriesPendingApproval ?? 0} recoveries waiting for approval</small></div>
        <div><dt>Stopped before payment</dt><dd>{rupees(t.gatePreventedAmount)}</dd><small>{rupees(t.gateHeldPendingAmount)} on hold, awaiting decision</small></div>
      </dl>

      {data.projection && (
        <section className="mo-projection" aria-label="State-wide estimate">
          <h2>Demo data result projected to the state</h2>
          <p className="mo-projection-estimate"><strong>{rupees(data.projection.estimatedStateConfirmed)}</strong> estimated confirmed overpayment statewide</p>
          <p className="mo-sub">Based on {rupees(data.projection.pilotConfirmed)} confirmed in the demo data at {Number(data.projection.pilotSharePercent)}% of state beneficiary spend ({data.projection.formula}).</p>
          <p className="mo-caveat" role="note">{data.projection.caveat}</p>
        </section>
      )}

      <dl className="mo-kpis mo-safeguards" aria-label="Safeguards for people affected">
        <div><dt>Adverse decisions</dt><dd>{t.adverseDecisions ?? 0}</dd><small>confirmed overpayments ever decided</small></div>
        <div><dt>Overturned on appeal</dt><dd>{t.overturned ?? 0}{t.overturnRate != null ? ` (${t.overturnRate}%)` : ''}</dd><small>later reclassified away from confirmed</small></div>
        <div><dt>Notices issued</dt><dd>{t.noticesIssued ?? 0}</dd><small>{t.noticesAwaitingResponse ?? 0} awaiting a response</small></div>
        <div><dt>Appeals open</dt><dd>{t.appealsOpen ?? 0}</dd><small>reopened, awaiting a new decision</small></div>
      </dl>

      <dl className="mo-kpis mo-loop" aria-label="Whether fixes hold">
        <div><dt>Flagged again after a fix</dt><dd>{t.recurrenceRate == null ? '—' : `${t.recurrenceRate}%`}</dd><small>{t.fixedFindings} confirmed findings fixed, {t.recurredFindings} came back</small></div>
        <div><dt>Days to correct the source record</dt><dd>{t.avgDaysToMasterCorrection == null ? '—' : t.avgDaysToMasterCorrection}</dd><small>{t.masterCorrections} master corrections recorded</small></div>
        <div><dt>Verified closed</dt><dd>{t.verifiedClosedCases}</dd><small>fix checked by a second look</small></div>
        <div><dt>Waiting to be verified</dt><dd>{t.awaitingVerification}</dd><small>outcome recorded, not yet checked</small></div>
      </dl>

      <section className="mo-month" aria-label="Money by month">
        <h2>Last twelve months</h2>
        <p className="mo-sub">Flagged counts every alert raised in the month, including ones since resolved, so its months add up to more than the open total above. Confirmed, Recovered and Stopped add up to the totals.</p>
        <div className="mo-map-bar">
          <div role="group" aria-label="Show in the chart" className="mo-metric">
            {Object.entries(MONTH_METRICS).map(([key, m]) => (
              <button key={key} type="button" aria-pressed={monthMetric === key} className={monthMetric === key ? 'active' : ''} onClick={() => setMonthMetric(key)}>{m.label}</button>
            ))}
          </div>
        </div>
        <figure className="mo-chart-figure">
          <svg
            className="mo-chart"
            viewBox={`0 0 ${chart.w} ${chart.h}`}
            role="img"
            aria-label={`Bar chart of ${monthLabel.toLowerCase()} amounts by month for the last twelve months`}
          >
            {chart.bars.map((b) => (
              <g key={b.key}>
                <rect x={b.x} y={b.y} width={Math.max(4, (640 - 16) / months.length - 4)} height={b.bh} fill={chart.color} rx="2">
                  <title>{`${b.key}: ${rupees(b.v)}`}</title>
                </rect>
                <text x={b.x + 8} y={chart.h - 6} textAnchor="middle" className="mo-chart-label">{b.label}</text>
              </g>
            ))}
          </svg>
          <figcaption className="mo-note">Amounts bucketed by month of detection (flagged), case decision (confirmed), recovery recorded (recovered), or gate hold confirmed (stopped).</figcaption>
        </figure>
        <table className="mo-month-table">
          <caption className="mo-sr-only">Monthly amounts for flagged, confirmed, recovered and stopped</caption>
          <thead>
            <tr><th scope="col">Month</th><th scope="col">Flagged</th><th scope="col">Confirmed</th><th scope="col">Recovered</th><th scope="col">Stopped</th></tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonthShort(m.month)}</th>
                <td>{rupees(m.flagged)}</td>
                <td>{rupees(m.confirmed)}</td>
                <td>{rupees(m.recovered)}</td>
                <td>{rupees(m.prevented)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mo-grid">
        <section aria-label="Map">
          <div className="mo-map-bar">
            <div role="group" aria-label="Show on the map" className="mo-metric">
              {Object.entries(METRICS).map(([key, m]) => (
                <button key={key} type="button" aria-pressed={metric === key} className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{m.label}</button>
              ))}
            </div>
            <div className="mo-legend" aria-hidden="true">
              <span>Less</span>
              {METRICS[metric].ramp.map((c) => <i key={c} style={{ background: c }} />)}
              <span>More</span>
            </div>
          </div>
          <MoneyMap rows={rows} selected={selected} onSelect={setSelected} metric={metric} />
          <p className="mo-note">Bubble size shows the {METRICS[metric].label.toLowerCase()} amount. Grey districts have no data loaded.</p>
        </section>
        <section aria-label="Districts">
          <h2>{chosen ? chosen.district : 'Districts by amount flagged'}</h2>
          {chosen ? (
            <div className="mo-detail">
              <p>{chosen.openAlerts} open alerts · {rupees(chosen.flaggedAmount)} flagged</p>
              <p>{rupees(chosen.confirmedAmount)} confirmed · {rupees(chosen.recoveredAmount)} recovered</p>
              {chosen.district !== 'Unspecified' && canOpenBeneficiary && chosen.beneficiaryOpenAlerts > 0 && (
                <button type="button" onClick={() => navigate(`/expenditure-integrity?domain=beneficiary&district=${encodeURIComponent(chosen.district)}`)}>
                  Review beneficiary alerts ({chosen.beneficiaryOpenAlerts})
                </button>
              )}
              {chosen.district !== 'Unspecified' && canOpenPayroll && chosen.payrollOpenAlerts > 0 && (
                <button type="button" onClick={() => navigate(`/expenditure-integrity?domain=payroll&district=${encodeURIComponent(chosen.district)}`)}>
                  Review payroll alerts ({chosen.payrollOpenAlerts})
                </button>
              )}
              <button type="button" className="mo-link" onClick={() => setSelected(null)}>Show all districts</button>
            </div>
          ) : (
            <table>
              <thead><tr><th>District</th><th>Open</th><th>Flagged</th><th>Confirmed</th></tr></thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.district} onClick={() => setSelected(r.district)} className="mo-row">
                    <td>{r.district}</td><td>{r.openAlerts}</td><td>{rupees(r.flaggedAmount)}</td><td>{rupees(r.confirmedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section aria-label="Rule health" className="mo-print-compact">
        <h2>How reliable each check is</h2>
        <p className="mo-sub">From what reviewers decided. Precision is the share of ruled-on alerts that were real overpayments. Many data errors mean the data needs fixing; many legitimate exceptions mean the check may be too strict.</p>
        <table>
          <thead>
            <tr><th>Check</th><th>Raised</th><th>Ruled on</th><th>Real overpayment</th><th>Legitimate exception</th><th>Data error</th><th>Dismissed</th><th>Precision</th></tr>
          </thead>
          <tbody>
            {(data.ruleHealth ?? []).map((r) => (
              <tr key={r.ruleCode}>
                <td>{RULE_NAMES[r.ruleCode] ?? `Rule ${r.ruleCode}`}</td>
                <td>{r.raised}</td>
                <td>{r.reviewed}</td>
                <td>{r.confirmed}</td>
                <td>{r.legitimateException}</td>
                <td>{r.dataError}</td>
                <td>{r.dismissed}</td>
                <td>
                  {r.precisionPercent == null ? '—' : <b>{r.precisionPercent}%</b>}
                  {r.precisionPercent != null && !r.enoughEvidence && <small className="mo-thin"> few rulings</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="By rule" className="mo-print-compact">
        <h2>Where the money is flagged</h2>
        <table>
          <thead><tr><th>Check</th><th>Open</th><th>Flagged</th><th>Confirmed</th></tr></thead>
          <tbody>
            {[...data.byRule].sort((a, b) => Number(b.flaggedAmount) - Number(a.flaggedAmount)).map((r) => (
              <tr key={r.ruleCode}><td>{RULE_NAMES[r.ruleCode] ?? `Rule ${r.ruleCode}`}</td><td>{r.openAlerts}</td><td>{rupees(r.flaggedAmount)}</td><td>{rupees(r.confirmedAmount)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
