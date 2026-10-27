import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { fmtDate } from './labels'

const FIELDS = [
  ['auto', 'Link automatically at or above', 'A record at or above this score is attached to the person without a human.'],
  ['review', 'Send to a steward at or above', 'Between this and the automatic score, a steward decides. Below it the record stands alone.'],
  ['margin', 'Ask a steward when two candidates are within', 'If the best two candidates are this close, the system will not choose.'],
  ['info_needed', 'Evidence needed before trusting a match', 'Matches resting on name and district alone are discounted below this amount of evidence.'],
]

function Rules() {
  const { data, error, loading } = useMdm('/rules')
  const [draft, setDraft] = useState({})
  const [prev, setPrev] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!data) return <Status loading={loading} error={error} />
  const cur = { ...data.active.match, ...draft }
  const match = Object.fromEntries(FIELDS.map(([k]) => [k, Number(cur[k])]))

  const preview = async () => {
    setBusy(true); setMsg(null); setPrev(null)
    try { setPrev(await mdm('/rules/preview', { method: 'POST', body: { match } })) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const save = async () => {
    setBusy(true)
    try {
      const r = await mdm('/rules', { method: 'POST', body: { match, note: 'Changed from the portal' } })
      setMsg(`Saved as version ${r.version}. It applies at the next reload of the department extracts.`)
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  return (
    <div className="mdm-stack">
      <section className="mdm-card">
        <h3>Matching thresholds</h3>
        <p className="mdm-note">Try a setting first. A preview re-runs matching in memory on the stored records and changes nothing.</p>
        <div className="mdm-rule-grid">
          {FIELDS.map(([k, label, help]) => (
            <label className="mdm-field" key={k}><span>{label}</span>
              <input type="number" step="0.01" min="0" max="1" value={cur[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              <small className="mdm-sub">{help}</small></label>
          ))}
        </div>
        <div className="mdm-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={preview}>Preview the effect</button>{' '}
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>Save as the new rules</button>
        </div>
        {msg && <p className="mdm-note" role="status">{msg}</p>}
        {prev && (
          <div className="mdm-preview">
            <table className="mdm-table tight">
              <thead><tr><th /><th className="num">Now</th><th className="num">With these settings</th></tr></thead>
              <tbody>
                <tr><td>People</td><td className="num">{prev.currently.persons}</td><td className="num">{prev.would_produce.persons}</td></tr>
                <tr><td>Linked automatically</td><td className="num">{prev.currently.AUTO_LINKED}</td><td className="num">{prev.would_produce.AUTO_LINKED}</td></tr>
                <tr><td>Waiting for a steward</td><td className="num">{prev.currently.IN_REVIEW}</td><td className="num">{prev.would_produce.IN_REVIEW}</td></tr>
                <tr><td>Stand alone</td><td className="num">{prev.currently.NEW}</td><td className="num">{prev.would_produce.NEW}</td></tr>
              </tbody>
            </table>
            {prev.sample_of_changes.length > 0 && (
              <details className="mdm-evidence"><summary>Records whose outcome would change ({prev.sample_of_changes.length} shown)</summary>
                <ul className="mdm-plain">{prev.sample_of_changes.map((c, i) => <li key={i}>{c.name} <span className="mdm-sub">({c.source.replace(/_/g, ' ')}): {c.was.replace(/_/g, ' ').toLowerCase()} → {c.would_be.replace(/_/g, ' ').toLowerCase()}</span></li>)}</ul></details>
            )}
          </div>
        )}
      </section>
      <section className="mdm-card">
        <h3>Which source wins for each field</h3>
        <ul className="mdm-plain">{Object.entries(data.survivorship_text).map(([k, v]) => <li key={k}><strong>{k === 'dob' ? 'Date of birth' : k[0].toUpperCase() + k.slice(1)}:</strong> {v}</li>)}</ul>
      </section>
      <section className="mdm-card">
        <h3>Rule versions</h3>
        <ul className="mdm-plain">{data.versions.map((v) => <li key={v.version}>Version {v.version} {v.active && <Badge tone="ok">In use</Badge>} <span className="mdm-sub">{fmtDate(v.created_at)} · {v.created_by}{v.note ? ` · ${v.note}` : ''}</span></li>)}</ul>
      </section>
    </div>
  )
}

function Audit() {
  const [offset, setOffset] = useState(0)
  const [verify, setVerify] = useState(null)
  const limit = 20
  const { data, error, loading } = useMdm('/audit', { limit, offset }, [offset])
  const check = async () => { try { setVerify(await mdm('/audit/verify')) } catch (e) { setVerify({ error: e.message }) } }
  return (
    <section className="mdm-card flush">
      <div className="mdm-card-pad">
        <h3>Audit log</h3>
        <p className="mdm-note">Every load and every steward decision. Each entry carries a fingerprint of the one before it, so a changed or removed entry shows up.</p>
        <button type="button" className="btn-secondary small" onClick={check}>Verify the log</button>
        {verify && (verify.error ? <span className="mdm-error"> {verify.error}</span>
          : verify.ok ? <span className="mdm-ok"> Intact: {verify.checked} entries checked.</span> : <span className="mdm-error"> Broken at entry {verify.broken_at}.</span>)}
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <>
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th className="num">#</th><th>When</th><th>Who</th><th>What</th><th>About</th></tr></thead>
              <tbody>{data.items.map((a) => (
                <tr key={a.seq}><td className="num">{a.seq}</td><td>{fmtDate(a.ts)}</td><td>{a.actor}</td><td>{a.action.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="mdm-sub">{a.subject}{a.detail?.note ? ` — ${a.detail.note}` : ''}</td></tr>))}</tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </section>
  )
}

export default function RulesAudit() {
  return <div className="mdm-stack"><Rules /><Audit /></div>
}
