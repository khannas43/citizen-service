import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'

const ELS = { age: 'Age (in tens)', residence: 'District', income_band: 'Income band', category: 'Social category', life_status: 'Death registered', household_benefit: 'Housing application', marital_status: 'Marriage recorded', electricity_link: 'Electricity linked', land_holding: 'Land held' }

export default function DxQuery() {
  const { data: purposes, error, loading } = useMdm('/x/purposes', undefined, [])
  const [purpose, setPurpose] = useState('PENSION_ELIGIBILITY')
  const [els, setEls] = useState(['age'])
  const [f, setF] = useState({ district: '', min_age: '', max_age: '', life_status: '' })
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!purposes) return <div className="mdm-hub"><h1 className="page-title">Query builder</h1><Status loading={loading} error={error} /></div>
  const pu = purposes.find((p) => p.code === purpose) || purposes[0]
  const allowed = Object.keys(ELS).filter((e) => pu.elements.includes(e))
  const pick = (code) => { setPurpose(code); const p = purposes.find((x) => x.code === code); setEls(Object.keys(ELS).filter((e) => p.elements.includes(e)).slice(0, 1)); setRes(null) }
  const run = async () => {
    setBusy(true); setErr(null); setRes(null)
    const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))
    try { setRes(await mdm('/x/query', { method: 'POST', body: { requester: pu.system, purpose, elements: els.filter((e) => allowed.includes(e)), filters } })) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Query builder</h1>
      <p className="mdm-intro">A department asks a bounded question about a group of people. The answer holds only an MDM id and the elements the use allows. People who have not agreed are left out and counted, never named. Results disappear after a few minutes.</p>
      <section className="mdm-card">
        <div className="mdm-filters">
          <label className="mdm-field grow"><span>Use</span>
            <select value={purpose} onChange={(e) => pick(e.target.value)}>{purposes.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.system_name})</option>)}</select></label>
        </div>
        <p className="mdm-sub">{pu.consent_required ? 'Consent required: only people who agreed to every element asked for are included.' : 'Statutory use: consent is not needed.'}</p>
        <div className="mdm-filters" role="group" aria-label="Elements to return">
          <span className="mdm-sub">Return:</span>
          {allowed.map((e) => <label className="mdm-check" key={e}><input type="checkbox" checked={els.includes(e)} onChange={() => setEls((c) => (c.includes(e) ? c.filter((x) => x !== e) : [...c, e]))} /> {ELS[e]}</label>)}
        </div>
        <div className="mdm-filters">
          <label className="mdm-field"><span>District</span><input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></label>
          <label className="mdm-field"><span>Youngest age</span><input inputMode="numeric" value={f.min_age} onChange={(e) => setF({ ...f, min_age: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="mdm-field"><span>Oldest age</span><input inputMode="numeric" value={f.max_age} onChange={(e) => setF({ ...f, max_age: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="mdm-field"><span>Death record</span><select value={f.life_status} onChange={(e) => setF({ ...f, life_status: e.target.value })}><option value="">Any</option><option value="DECEASED">Death registered</option><option value="NO_DEATH_RECORD">No death record</option></select></label>
        </div>
        <div className="mdm-actions"><button type="button" className="btn-primary small" disabled={busy || !els.length} onClick={run}>Run the query</button></div>
        {err && <p className="mdm-error" role="alert">{err}</p>}
      </section>
      {res && (
        <section className={`mdm-card dx-result ${res.outcome === 'ANSWERED' ? 'ok' : 'warn'}`} aria-label="Query result">
          {res.outcome === 'ANSWERED' ? (
            <>
              <h3>{res.shared} {res.shared === 1 ? 'person' : 'people'} included <Badge tone="info">expires {fmtTime(res.expires_at)}</Badge></h3>
              <p className="mdm-sub">{res.matched} matched the filters{res.withheld_no_consent ? ` · ${res.withheld_no_consent} left out because they have not agreed` : ''}.</p>
              {res.message && <p className="dx-banner warn" role="status">{res.message}</p>}
              {res.rows.length > 0 && (
                <div className="mdm-table-wrap"><table className="mdm-table tight">
                  <thead><tr><th>MDM id</th>{res.elements.map((e) => <th key={e}>{ELS[e]}</th>)}</tr></thead>
                  <tbody>{res.rows.map((r) => <tr key={r.mdm_id}><td className="dx-mono">{r.mdm_id}</td>{res.elements.map((e) => <td key={e}>{r[e]}</td>)}</tr>)}</tbody>
                </table></div>
              )}
              {res.truncated && <p className="mdm-sub">Showing the first 200.</p>}
            </>
          ) : <p className="dx-banner warn" role="alert">{res.message}</p>}
          <p className="mdm-sub">Written to the clearing house as exchange {res.ledger_id}.</p>
        </section>
      )}
    </div>
  )
}
