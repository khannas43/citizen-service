import { useEffect, useState } from 'react'
import { fetchWhatIfDefaults, postWhatIf } from '../api'

const FIELDS = [
  { key: 'rule804MinUnits', label: 'Rule 804 — minimum distinct people or families on one bank account', rule: '804' },
  { key: 'rule805Threshold', label: 'Rule 805 — bank changes by one operator in 30 days (not in an approved batch)', rule: '805' },
  { key: 'graceDaysDefault', label: 'Rule 803 — default grace days after a verified death or termination', rule: '803' },
  { key: 's06LifeCertificateDays', label: 'Rule S06 — life certificate considered overdue after (days)', rule: 'S06' },
  { key: 's06BankChangeWindowDays', label: 'Rule S06 — bank change window without approval (days)', rule: 'S06' },
]

const RULE_NAMES = {
  801: 'Repeated enrollment',
  802: 'Conflicting entitlement',
  803: 'Payment after verified event',
  804: 'Shared bank destination',
  805: 'Bank-change concentration',
  S01: 'Overlapping salary',
  S02: 'Post-event entitlement',
  S03: 'Excess allowance',
  S04: 'Duplicate arrears',
  S05: 'Pension mismatch',
  S06: 'Record verification risk',
}

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

/** Threshold what-if: see alert counts on loaded data without changing live settings or creating cases. */
export default function WhatIfPanel() {
  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchWhatIfDefaults()
      .then((d) => {
        setBaseline(d)
        setForm({ ...d })
      })
      .catch((e) => setError(e.message))
  }, [])

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const body = {}
      for (const f of FIELDS) {
        const v = form[f.key]
        if (v !== '' && v != null && baseline && Number(v) !== Number(baseline[f.key])) {
          body[f.key] = Number(v)
        }
      }
      setResult(await postWhatIf(body))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !form) return <p className="ei-message error" role="alert">{error}</p>
  if (!form) return <p>Loading what-if settings…</p>

  return (
    <section className="ei-card wi" aria-labelledby="what-if-title">
      <h2 id="what-if-title">What if</h2>
      <p className="ei-sub">
        Change a detection threshold and see how many alerts each rule would raise on the data already loaded, compared
        with today&apos;s settings. Nothing is saved — no alerts, no cases, and the live configuration is unchanged. To
        apply a change, edit <code>application.properties</code> or the grace rows in{' '}
        <code>scheme_grace_config</code>.
      </p>
      <div className="wi-form">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min={1}
              value={form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </label>
        ))}
        <button type="button" className="ei-primary" disabled={busy} onClick={run}>
          {busy ? 'Running…' : 'Run'}
        </button>
      </div>
      {error && <p className="ei-message error" role="alert">{error}</p>}
      {result && (
        <>
          {result.sentences?.length > 0 && (
            <ul className="wi-sentences">
              {result.sentences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {result.schemeEngineNote && <p className="wi-note">{result.schemeEngineNote}</p>}
          <div className="wi-table-wrap">
            <table className="wi-table">
              <caption className="sr-only">What-if alert counts by rule</caption>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Today</th>
                  <th scope="col">With change</th>
                  <th scope="col">Added</th>
                  <th scope="col">Dropped</th>
                  <th scope="col">Amount today</th>
                  <th scope="col">Amount with change</th>
                </tr>
              </thead>
              <tbody>
                {result.rules?.map((row) => (
                  <tr key={row.ruleCode} className={row.added || row.dropped ? 'wi-changed' : ''}>
                    <th scope="row">{row.ruleCode} — {RULE_NAMES[row.ruleCode] ?? row.ruleCode}</th>
                    <td>{row.today}</td>
                    <td>{row.withChange}</td>
                    <td className={row.added ? 'wi-up' : ''}>{row.added}</td>
                    <td className={row.dropped ? 'wi-down' : ''}>{row.dropped}</td>
                    <td>{rupees(row.amountToday)}</td>
                    <td>{rupees(row.amountWithChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
