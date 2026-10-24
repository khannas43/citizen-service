import { useEffect, useState } from 'react'
import { fetchPersonOverview } from '../api'

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

function AlertList({ alerts, onOpenCase }) {
  if (!alerts?.length) return <p className="ei-person-empty">No alerts on record.</p>
  return (
    <ul className="ei-person-alerts">
      {alerts.map((a) => (
        <li key={a.id}>
          <button type="button" className="ei-person-alert-link" onClick={() => a.caseId && onOpenCase(a.caseId)}>
            <span className="ei-rule ei-rule-code"><b>{a.ruleCode}</b></span>
            {' '}
            <span className={`ei-sev ${String(a.severity || '').toLowerCase()}`}>{a.severity}</span>
            {a.amount != null && Number(a.amount) > 0 && <span className="ei-person-amt">{rupees(a.amount)}</span>}
            <span className="ei-person-summary">{a.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Cross-domain view: beneficiary schemes and payroll for one linked person. */
export default function PersonViewPanel({ personKey, personName, onClose, onOpenCase }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!personKey) return
    setLoading(true)
    setError(null)
    fetchPersonOverview(personKey)
      .then(setData)
      .catch((err) => setError(err?.message || 'Could not load this person.'))
      .finally(() => setLoading(false))
  }, [personKey])

  if (!personKey) return null

  const ben = data?.beneficiary
  const pay = data?.payroll
  const stakeBen = ben?.totalAtStake != null ? Number(ben.totalAtStake) : 0
  const stakePay = pay?.totalAtStake != null ? Number(pay.totalAtStake) : 0
  const combined = stakeBen + stakePay
  const title = data?.personName || personName || 'Person'

  return (
    <div className="ei-person-overlay" role="presentation" onClick={onClose}>
      <aside
        className="ei-person-panel"
        role="dialog"
        aria-labelledby="ei-person-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ei-person-header">
          <div>
            <h2 id="ei-person-title">{title}</h2>
            <p className="ei-person-meta">
              {data?.linked
                ? <span className="ei-badge ei-badge-linked">Linked — beneficiary and payroll</span>
                : <span className="ei-badge ei-badge-unlinked">Not linked across domains</span>}
            </p>
          </div>
          <button type="button" className="ei-person-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        {loading && <p className="ei-hint">Loading…</p>}
        {error && <p className="ei-error" role="alert">{error}</p>}

        {!loading && !error && data && (
          <>
            <p className="ei-person-stake">Combined amount at stake (open alerts): <strong>{rupees(combined)}</strong></p>
            <div className="ei-person-columns">
              <section className="ei-person-col">
                <h3>Beneficiary payments</h3>
                {!ben && <p className="ei-hint">Your role cannot view beneficiary cases for this person.</p>}
                {ben && (
                  <>
                    <p className="ei-person-stake-sub">At stake: {rupees(stakeBen)}</p>
                    <AlertList alerts={ben.alerts} onOpenCase={onOpenCase} />
                    {ben.entitlements?.length > 0 && (
                      <>
                        <h4>Entitlements</h4>
                        <ul className="ei-person-entitlements">
                          {ben.entitlements.map((e) => (
                            <li key={e.id}>
                              {e.schemeName || 'Scheme'}
                              {e.authorizedAmount != null && ` — ${rupees(e.authorizedAmount)}`}
                              {e.status && ` (${e.status})`}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </section>
              <section className="ei-person-col">
                <h3>Payroll and pension</h3>
                {!pay && <p className="ei-hint">Your role cannot view payroll cases, or this person has no employee record.</p>}
                {pay && (
                  <>
                    <p className="ei-person-meta-line">
                      {pay.post && <span>{pay.post}</span>}
                      {pay.ddoCode && <span> · DDO {pay.ddoCode}</span>}
                      {pay.employeeCode && <span> · {pay.employeeCode}</span>}
                    </p>
                    <p className="ei-person-stake-sub">At stake: {rupees(stakePay)}</p>
                    <AlertList alerts={pay.alerts} onOpenCase={onOpenCase} />
                  </>
                )}
              </section>
            </div>
            {!data.linked && !ben && !pay && (
              <p className="ei-hint">Nothing to show for this id.</p>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
