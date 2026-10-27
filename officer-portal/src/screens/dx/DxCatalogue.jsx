import { useMdm, Status, Badge } from '../mdm/shared'
import { CONSENT } from './dxShared'

const fresh = (h) => (h < 48 ? `${h || 'live'}${h ? ' hours' : ''}` : `${Math.round(h / 24)} days`)

export function SourceTable({ sources }) {
  return (
    <div className="mdm-table-wrap">
      <table className="mdm-table">
        <thead><tr><th>Source</th><th>Interface</th><th>Fresh within</th><th>Records</th><th>Latest as of</th><th>Owner</th></tr></thead>
        <tbody>{sources.map((s) => <tr key={s.source}><td><strong>{s.name}</strong></td><td>{s.interface}</td><td>{fresh(s.freshness_hours)}</td><td className="num">{s.records.toLocaleString('en-IN')}</td><td className="mdm-sub">{s.latest_as_of ? String(s.latest_as_of).slice(0, 10) : '—'}</td><td>{s.owner}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export default function DxCatalogue() {
  const { data, error, loading } = useMdm('/x/catalogue', undefined, [])
  if (!data) return <div className="mdm-hub"><h1 className="page-title">Metadata catalogue</h1><Status loading={loading} error={error} /></div>
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Metadata catalogue</h1>
      <p className="mdm-intro">What can be shared, how sensitive it is, and which department is the source of truth for it. A wrong value is always corrected at that department.</p>
      <section className="mdm-card flush">
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>Element</th><th>Source of truth</th><th>Sensitivity</th><th>Population query</th><th>Uses that allow it</th></tr></thead>
            <tbody>{data.elements.map((e) => (
              <tr key={e.element}><td><strong>{e.name}</strong><div className="mdm-sub">{e.element}</div></td><td>{e.authoritative}</td>
                <td className={`dx-sens-${e.sensitivity}`}>{e.sensitivity.toLowerCase()}</td><td>{e.queryable ? 'Yes' : 'Question only'}</td><td className="mdm-sub">{e.purposes.length}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <h2>Sources</h2>
      <section className="mdm-card flush"><SourceTable sources={data.sources} /></section>
    </div>
  )
}

export function DxRegistry() {
  const { data, error, loading } = useMdm('/x/registry', undefined, [])
  if (!data) return <div className="mdm-hub"><h1 className="page-title">Information registry</h1><Status loading={loading} error={error} /></div>
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Information registry</h1>
      <p className="mdm-intro">Who may ask for what, for which use, and whether the person must agree first.</p>
      <section className="mdm-card flush">
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>Use</th><th>Who may ask</th><th>Consent</th><th>What it covers</th><th>Consents so far</th></tr></thead>
            <tbody>{data.purposes.map((p) => (
              <tr key={p.purpose}><td><strong>{p.name}</strong><div className="mdm-sub">{p.use_case}</div></td><td>{p.requester}</td>
                <td>{p.consent_required ? <Badge tone="info">Required</Badge> : <Badge>Not needed (statutory)</Badge>}</td>
                <td className="mdm-sub">{p.elements.map((e) => e.replace(/_/g, ' ')).join(', ')}</td>
                <td className="mdm-sub">{Object.entries(p.consents).map(([k, n]) => `${(CONSENT[k]?.[0] || k).toLowerCase()} ${n}`).join(' · ') || '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
