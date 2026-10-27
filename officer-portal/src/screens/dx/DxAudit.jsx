import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Pager, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'

export default function DxAudit() {
  const [f, setF] = useState({ actor: '', action: '', subject: '', q: '' })
  const [applied, setApplied] = useState(f)
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(null)
  const [demo, setDemo] = useState(null)
  const [err, setErr] = useState(null)
  const limit = 25
  const { data, error, loading, reload } = useMdm('/x/audit', { ...applied, limit, offset }, [JSON.stringify(applied), offset])
  const { data: chain, reload: recheck } = useMdm('/audit/verify', undefined, [])
  const tamper = async () => {
    setErr(null); setDemo(null)
    try { setDemo(await mdm('/x/audit/tamper-demo', { method: 'POST', body: {} })); reload(); recheck() } catch (e) { setErr(e.message) }
  }
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Audit explorer</h1>
      <p className="mdm-intro">Every action is written to a log where each line carries a fingerprint of the one before. Changing or deleting a past line breaks the chain, and the check shows exactly where.</p>
      <p>{chain ? (chain.ok ? <Badge tone="ok">Chain intact · {chain.checked.toLocaleString('en-IN')} entries</Badge> : <Badge tone="bad">Chain broken at entry {chain.broken_at}</Badge>) : null}</p>
      <form className="mdm-filters" onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(f) }} role="search">
        {[['actor', 'Who'], ['action', 'Action'], ['subject', 'About'], ['q', 'Any text']].map(([k, n]) => (
          <label className="mdm-field" key={k}><span>{n}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
        <button type="submit" className="btn-secondary small">Search</button>
      </form>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush"><div className="mdm-table-wrap"><table className="mdm-table">
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>About</th><th /></tr></thead>
          <tbody>{data.items.flatMap((a) => [
            <tr key={a.seq}><td className="num">{a.seq}</td><td className="mdm-sub">{fmtTime(a.ts)}</td><td>{a.actor}</td><td>{a.action.replace(/_/g, ' ').toLowerCase()}</td><td className="mdm-sub">{a.subject}</td>
              <td><button type="button" className="mdm-link" onClick={() => setOpen(open === a.seq ? null : a.seq)}>{open === a.seq ? 'Hide' : 'Details'}</button></td></tr>,
            open === a.seq && <tr key={`${a.seq}d`}><td colSpan={6}><span className="dx-mono">fingerprint {a.hash}… · {JSON.stringify(a.detail)}</span></td></tr>,
          ])}</tbody>
        </table></div><Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} /></section>
      )}
      <section className="dx-demo" aria-label="Tamper test">
        <h3>Tamper test</h3>
        <p className="mdm-note">Changes one old line for a moment, runs the check, and then undoes the change. Nothing is lost.</p>
        <div className="mdm-actions"><button type="button" className="btn-secondary small" onClick={tamper}>Run the tamper test</button></div>
        {err && <p className="mdm-error" role="alert">{err}</p>}
        {demo && (
          <ol className="dx-timeline" aria-label="Tamper test result">
            <li>Before the edit: <strong>{demo.before.ok ? 'intact' : 'broken'}</strong></li>
            <li>After editing entry {demo.edited_seq}: <strong>{demo.while_edited.ok ? 'intact' : `broken at entry ${demo.while_edited.broken_at}`}</strong></li>
            <li>After undoing it: <strong>{demo.after_rollback.ok ? 'intact' : 'broken'}</strong></li>
          </ol>
        )}
      </section>
    </div>
  )
}
