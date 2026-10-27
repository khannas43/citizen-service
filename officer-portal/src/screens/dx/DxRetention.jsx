import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { PersonPicker } from './dxShared'

export default function DxRetention() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/retention', undefined, [tick])
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const [msg, setMsg] = useState(null)
  const [thin, setThin] = useState(false)
  const [person, setPerson] = useState(null)
  const [purpose, setPurpose] = useState('SCHOLARSHIP_ELIGIBILITY')
  const [rep, setRep] = useState(null)
  const post = async (path, body) => {
    setMsg(null)
    try { const r = await mdm(path, { method: 'POST', body }); setTick((n) => n + 1); return r } catch (e) { setMsg({ ok: false, text: e.message }); return null }
  }
  const purge = async (what) => {
    const r = await post('/x/retention/purge', { what, thin_events: thin })
    if (r) setMsg({ ok: true, text: `Before: ${r.before.temp_results} temporary results. After: ${r.after.temp_results}. Removed ${r.removed.temp_results}${thin ? `, thinned ${r.removed.event_payloads_thinned} old event payloads` : ''}. Recorded in the audit log as entry ${r.audit_seq}.` })
  }
  const withdraw = async () => {
    const r = await post('/x/retention/withdraw', { person_id: person.id, purpose })
    if (r) setRep(r)
  }
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Retention and purge</h1>
      <p className="mdm-intro">What is kept, for how long, and what a withdrawal removes. Removal is recorded; the record of removal is never removed.</p>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush"><div className="mdm-table-wrap"><table className="mdm-table">
          <thead><tr><th>Data</th><th>Kept</th><th>Held now</th><th>Removal</th></tr></thead>
          <tbody>{data.classes.map((c) => <tr key={c.data}><td><strong>{c.data}</strong></td><td>{c.kept}</td><td className="num">{c.count.toLocaleString('en-IN')}</td><td className="mdm-sub">{c.purge}</td></tr>)}</tbody>
        </table></div></section>
      )}
      <section className="mdm-card">
        <h3>Clear temporary results</h3>
        <div className="mdm-actions">
          <button type="button" className="btn-secondary small" onClick={() => purge('expired_results')}>Remove expired results</button>
          <button type="button" className="btn-secondary small" onClick={() => purge('all_results')}>Remove all temporary results</button>
          <label className="mdm-check"><input type="checkbox" checked={thin} onChange={(e) => setThin(e.target.checked)} /> Also thin event payloads older than the retention period (cannot be undone)</label>
        </div>
      </section>
      <section className="mdm-card">
        <h3>Withdraw consent and purge</h3>
        <PersonPicker onPick={setPerson} label="Who is withdrawing" />
        {person && <p className="mdm-note">Person: <strong>{person.name}</strong></p>}
        <div className="mdm-filters">
          <label className="mdm-field grow"><span>For which use</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
          <button type="button" className="btn-primary small" disabled={!person} onClick={withdraw}>Withdraw and purge</button>
        </div>
        {rep && (
          <dl className="dx-kv" aria-label="What happened">
            <dt>Consent</dt><dd>{rep.consent_withdrawn ? 'Withdrawn' : 'There was no active consent'}</dd>
            <dt>Departments told</dt><dd>{rep.departments_told.join(', ') || 'None had received data'}</dd>
            <dt>Temporary rows removed</dt><dd>{rep.temp_rows_removed}</dd>
            <dt>Stops</dt><dd>{rep.stops}</dd><dt>Remains</dt><dd>{rep.remains}</dd><dt>Audit entry</dt><dd>{rep.audit_seq}</dd>
          </dl>
        )}
      </section>
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  )
}
