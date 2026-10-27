import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { dqLabel } from './labels'

export default function DataQuality({ initial = {}, openPerson }) {
  const [code, setCode] = useState(initial.code || '')
  const [severity, setSeverity] = useState('')
  const [source, setSource] = useState(initial.source || '')
  const [status, setStatus] = useState('OPEN')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [asking, setAsking] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const limit = 25
  const { data: sum } = useMdm('/dq/summary', undefined, [tick])
  const { data, error, loading } = useMdm('/dq/issues', { code, severity, source, status, limit, offset }, [code, severity, source, status, offset, tick])

  const send = async () => {
    setErr(null)
    try {
      await mdm(`/dq/issues/${asking.id}/correction`, { method: 'POST', body: { note: note.trim() || 'Please verify and correct this record.' } })
      setAsking(null); setNote(''); setTick((n) => n + 1)
    } catch (e) { setErr(e.message) }
  }
  const f = (setter) => (e) => { setter(e.target.value); setOffset(0) }
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">Problems found by comparing departments with each other. You cannot edit a department record here; you ask the owning department to correct it, and the request is logged.</p>
      {sum && (
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>Issue</th><th>Severity</th><th className="num">Open</th><th className="num">Correction requested</th><th /></tr></thead>
            <tbody>
              {sum.by_code.map((c) => (
                <tr key={c.code + c.severity}>
                  <td>{dqLabel(c.code)}</td>
                  <td><Badge tone={c.severity === 'HIGH' ? 'bad' : c.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{c.severity === 'HIGH' ? 'High' : c.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge></td>
                  <td className="num">{c.open}</td><td className="num">{c.requested}</td>
                  <td><button type="button" className="mdm-link" onClick={() => { setCode(c.code); setOffset(0) }}>Show</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mdm-filters">
        <label className="mdm-field"><span>Issue</span>
          <select value={code} onChange={f(setCode)}><option value="">All issues</option>{(sum?.by_code || []).map((c) => c.code).filter((v, i, a) => a.indexOf(v) === i).map((c) => <option key={c} value={c}>{dqLabel(c)}</option>)}</select></label>
        <label className="mdm-field"><span>Severity</span>
          <select value={severity} onChange={f(setSeverity)}><option value="">All</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
        <label className="mdm-field"><span>Status</span>
          <select value={status} onChange={f(setStatus)}><option value="OPEN">Open</option><option value="CORRECTION_REQUESTED">Correction requested</option></select></label>
        <label className="mdm-field"><span>System</span>
          <select value={source} onChange={f(setSource)}><option value="">All</option>{(sum?.by_source || []).map((s) => <option key={s.source} value={s.source}>{s.name}</option>)}</select></label>
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Issue</th><th>Person</th><th>Detail</th><th>System</th><th /></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td><Badge tone={i.severity === 'HIGH' ? 'bad' : i.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{i.severity === 'HIGH' ? 'High' : i.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge> {dqLabel(i.code)}</td>
                    <td><button type="button" className="mdm-link" onClick={() => openPerson(i.person_id)}>{i.name}</button></td>
                    <td className="mdm-sub">{i.detail}{i.correction_note && <div>Request: {i.correction_note} ({i.requested_by})</div>}</td>
                    <td>{i.source_name || '—'}</td>
                    <td>{i.status === 'OPEN' && <button type="button" className="btn-secondary small" onClick={() => { setAsking(i); setNote('') }}>Ask department to correct</button>}</td>
                  </tr>
                ))}
                {!data.items.length && <tr><td colSpan="5" className="mdm-empty">No issues match.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
      {asking && (
        <div className="mdm-modal" role="dialog" aria-modal="true" aria-label="Request a correction">
          <div className="mdm-modal-body">
            <h3>Ask {asking.source_name || 'the department'} to correct this</h3>
            <p><strong>{dqLabel(asking.code)}</strong> — {asking.name}</p>
            <p className="mdm-sub">{asking.detail}</p>
            <label className="mdm-field"><span>What should they check?</span><textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
            {err && <p className="mdm-error" role="alert">{err}</p>}
            <div className="mdm-actions"><button type="button" className="btn-primary small" onClick={send}>Send request</button> <button type="button" className="btn-secondary small" onClick={() => setAsking(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
