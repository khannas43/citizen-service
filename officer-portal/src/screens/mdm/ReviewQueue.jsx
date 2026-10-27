import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { COMPONENT_LABELS } from './labels'

function EvidenceTable({ ev }) {
  if (!ev?.components) return null
  return (
    <table className="mdm-table tight">
      <thead><tr><th>Compared</th><th className="num">Agreement</th><th>Detail</th></tr></thead>
      <tbody>
        {Object.entries(ev.components).filter(([, c]) => c.score != null).map(([k, c]) => (
          <tr key={k}><td>{COMPONENT_LABELS[k] || k}</td><td className="num"><Badge tone={c.score >= 0.8 ? 'ok' : c.score >= 0.4 ? 'warn' : 'bad'}>{Math.round(c.score * 100)}%</Badge></td><td className="mdm-sub">{c.note}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

function Decide({ id, back, done }) {
  const { data: t, error, loading } = useMdm(`/review/${id}`, undefined, [id])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (!t) return <Status loading={loading} error={error} />

  const submit = async (decision, person_id) => {
    setBusy(true); setErr(null)
    try {
      await mdm(`/review/${id}/decision`, { method: 'POST', body: { decision, person_id, note: note.trim() || null } })
      done()
    } catch (e) { setErr(e.message); setBusy(false) }
  }
  const open = t.status === 'OPEN'
  return (
    <div className="mdm-stack">
      <button type="button" className="mdm-link" onClick={back}>← Back to the queue</button>
      <section className="mdm-card">
        <h3>Record to place</h3>
        <p><strong>{t.name}</strong> <span className="mdm-sub">from {t.source_name} · {t.source_rid}</span></p>
        <p className="mdm-sub">{[t.dob && `born ${t.dob}`, t.age != null && `age ${t.age}`, t.birth_year && `born ${t.birth_year}`, t.gender, t.address, t.village, t.mandal, t.district, t.parents?.length && `parents/spouse: ${t.parents.join(', ')}`].filter(Boolean).join(' · ')}</p>
        <p className="mdm-note">{t.reason}. Best candidate agreement: {Math.round(Number(t.score) * 100)}%.</p>
      </section>
      <div className="mdm-cands">
        {t.candidate_details.map((c, i) => (
          <section className="mdm-card" key={c.person.id}>
            <h3>Candidate {i + 1}: {c.person.name} <span className="mdm-sub">({Math.round(c.score * 100)}%)</span></h3>
            <p className="mdm-sub">{[c.person.dob ? `born ${c.person.dob}` : c.person.birth_year && `born ${c.person.birth_year}`, c.person.gender, c.person.village, c.person.mandal, c.person.district].filter(Boolean).join(' · ')} · in {c.person.source_count} system(s)</p>
            <EvidenceTable ev={c.evidence} />
            <details className="mdm-evidence"><summary>Records already linked to this person ({c.records.length})</summary>
              <ul className="mdm-plain">{c.records.map((r, j) => <li key={j}>{r.name} <span className="mdm-sub">({r.source.replace(/_/g, ' ')}{r.dob ? `, born ${r.dob}` : r.age != null ? `, age ${r.age}` : ''})</span></li>)}</ul>
            </details>
            {open && <button type="button" className="btn-primary small" disabled={busy} onClick={() => submit('LINK', c.person.id)}>Same person — link</button>}
          </section>
        ))}
      </div>
      {open ? (
        <section className="mdm-card">
          <label className="mdm-field"><span>Note for the audit log (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="For example: father and son with the same name; DOB differs" />
          </label>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => submit('SEPARATE')}>None of these — keep as a separate person</button>
          {err && <p className="mdm-error" role="alert">{err}</p>}
        </section>
      ) : <p className="mdm-note">Decided by {t.decided_by}: {t.decision === 'LINK' ? 'linked' : 'kept separate'}.</p>}
    </div>
  )
}

export default function ReviewQueue({ initialSource }) {
  const [source, setSource] = useState(initialSource || '')
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState(null)
  const [tick, setTick] = useState(0)
  const limit = 20
  const { data, error, loading } = useMdm('/review', { status: 'OPEN', source, limit, offset }, [tick, offset, source])
  const { data: srcs } = useMdm('/sources')

  if (sel) return <Decide id={sel} back={() => setSel(null)} done={() => { setSel(null); setTick((n) => n + 1) }} />
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">These records look like someone already known, but not certainly. Compare them and decide. Strongest matches come first.</p>
      <div className="mdm-filters">
        <label className="mdm-field"><span>System</span>
          <select value={source} onChange={(e) => { setSource(e.target.value); setOffset(0) }}>
            <option value="">All systems</option>
            {(srcs || []).map((s) => <option key={s.source} value={s.source}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Record</th><th>System</th><th>Born / age</th><th>Place</th><th className="num">Best match</th><th className="num">Candidates</th><th /></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><div className="mdm-sub">{r.source_rid}</div></td>
                    <td>{r.source_name}</td>
                    <td>{r.dob || (r.age != null ? `age ${r.age}` : '—')}</td>
                    <td>{[r.mandal, r.district].filter(Boolean).join(', ') || '—'}</td>
                    <td className="num">{Math.round(Number(r.score) * 100)}%</td>
                    <td className="num">{r.candidate_count}</td>
                    <td><button type="button" className="btn-primary small" onClick={() => setSel(r.id)}>Review</button></td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan="7" className="mdm-empty">Nothing waiting. Every doubtful match has been settled.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
    </div>
  )
}
