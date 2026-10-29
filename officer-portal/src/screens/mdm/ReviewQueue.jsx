import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { COMPONENT_LABELS } from './labels'
import { DataTable, FilterSelect } from '../dx/dxKit'

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
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          search={{ placeholder: 'Search this page by name or record number', text: (r) => `${r.name} ${r.source_rid} ${r.source_name} ${r.district || ''} ${r.mandal || ''}` }}
          canClear={!!source} onClear={() => { setSource(''); setOffset(0) }}
          filters={<FilterSelect label="System" value={source} onChange={(v) => { setSource(v); setOffset(0) }} options={(srcs || []).map((s) => [s.source, s.name])} all="All systems" />}
          onRowClick={(r) => setSel(r.id)} empty="Nothing waiting. Every doubtful match has been settled."
          columns={[
            { key: 'name', label: 'Record', render: (r) => <><strong>{r.name}</strong><div className="mdm-sub">{r.source_rid}</div></> },
            { key: 'source_name', label: 'System' },
            { key: 'dob', label: 'Born / age', render: (r) => r.dob || (r.age != null ? `age ${r.age}` : '—') },
            { key: 'district', label: 'Place', render: (r) => [r.mandal, r.district].filter(Boolean).join(', ') || '—' },
            { key: 'score', label: 'Best match', align: 'num', render: (r) => `${Math.round(Number(r.score) * 100)}%` },
            { key: 'candidate_count', label: 'Candidates', align: 'num' },
            { key: 'go', label: '', sort: false, render: (r) => <button type="button" className="btn-primary small" onClick={(e) => { e.stopPropagation(); setSel(r.id) }}>Review</button> },
          ]} />
      )}
    </div>
  )
}
