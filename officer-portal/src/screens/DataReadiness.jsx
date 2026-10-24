import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchIntegrityReadiness } from '../api'
import './DataReadiness.css'

function barClass(percent) {
  if (percent >= 95) return 'dr-bar ok'
  if (percent >= 80) return 'dr-bar warn'
  return 'dr-bar bad'
}

function CheckRow({ check }) {
  const pct = Number(check.percentComplete ?? 0)
  return (
    <article className="dr-check" aria-labelledby={`check-${check.id}`}>
      <div className="dr-check-head">
        <h4 id={`check-${check.id}`}>{check.check}</h4>
        <span className="dr-pct">{pct}% complete</span>
      </div>
      <div className="dr-bar-wrap" role="presentation">
        <div className={barClass(pct)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="dr-meta">
        {Number(check.affected ?? 0).toLocaleString('en-IN')} of {Number(check.total ?? 0).toLocaleString('en-IN')} rows affected
        {check.rulesWeakened && <> · Rules: {check.rulesWeakened}</>}
      </p>
      <p className="dr-why">{check.whyItMatters}</p>
      {check.coverageNote && <p className="dr-note">{check.coverageNote}</p>}
      {check.askFor && <p className="dr-ask"><strong>What to ask for:</strong> {check.askFor}</p>}
      {check.importName && (
        <p className="dr-link">
          <Link to={`/data?tab=import#import-${check.importName}`}>Load data — {check.importName}</Link>
        </p>
      )}
    </article>
  )
}

/** Counts-only view of how complete each expenditure-integrity feed is (admin roles). */
export default function DataReadiness() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchIntegrityReadiness()
      .then(setData)
      .catch((err) => setError(err?.message || 'Could not load readiness.'))
  }, [])

  return (
    <div className="data-readiness">
      <header className="dr-header">
        <h1>Data readiness</h1>
        <p className="dr-sub">
          How complete the loaded feeds are — counts only, no personal data. Use this to see what stakeholders should supply next.
        </p>
        <p className="dr-sub">
          <Link to="/data?tab=import">Load data</Link> uploads CSVs into these feeds.
        </p>
      </header>

      {error && <p className="dr-error" role="alert">{error}</p>}
      {!data && !error && <p className="dr-meta">Loading…</p>}

      {data?.feeds?.map((feed) => (
        <section key={feed.feed} className="dr-feed">
          <header className="dr-feed-head">
            <h2>{feed.title}</h2>
            <span className="dr-fresh">Latest data: {feed.freshness ?? '—'}</span>
          </header>
          {feed.checks?.map((c) => <CheckRow key={c.id} check={c} />)}
        </section>
      ))}
    </div>
  )
}
