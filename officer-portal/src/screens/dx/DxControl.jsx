import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Tile, Badge } from '../mdm/shared'
import { Tag, DELIVERY, OUTCOME, fmtTime } from './dxShared'

function Subscribers({ rows, reload }) {
  const [msg, setMsg] = useState(null)
  const flip = async (s) => {
    setMsg(null)
    try {
      const r = await mdm(`/x/subscribers/${s.system}`, { method: 'POST', body: { available: !s.available, note: s.available ? 'Taken offline from the control tower' : null } })
      if (r.retried) setMsg(`${s.name} is back. Waiting items: ${r.retried.delivered} sent, ${r.retried.still_retrying} still retrying, ${r.retried.dead_letter} set aside.`)
      reload()
    } catch (e) { setMsg(e.message) }
  }
  const retry = async () => {
    try { const r = await mdm('/x/deliveries/retry', { method: 'POST', body: {} }); setMsg(`Retry run: ${r.delivered} sent, ${r.still_retrying} still retrying, ${r.dead_letter} set aside.`); reload() } catch (e) { setMsg(e.message) }
  }
  return (
    <section className="mdm-card flush">
      <div className="mdm-prop-head"><h3>Departments receiving events</h3><button type="button" className="btn-secondary small" onClick={retry}>Retry waiting items now</button></div>
      <p className="mdm-note">Take a department offline to show that nothing is lost: its events wait, are retried, and are set aside for a person after the allowed number of attempts.</p>
      {msg && <p className="mdm-ok" role="status">{msg}</p>}
      <div className="mdm-table-wrap">
        <table className="mdm-table">
          <thead><tr><th>Department</th><th>State</th><th>Sent</th><th>Retrying</th><th>Set aside</th><th /></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.system} className={s.available ? '' : 'dx-off'}>
                <td>{s.name}</td>
                <td>{s.available ? <Badge tone="ok">Available</Badge> : <Badge tone="bad">Offline</Badge>}{s.note && !s.available ? <div className="mdm-sub">{s.note}</div> : null}</td>
                <td className="num">{s.deliveries.DELIVERED || 0}</td><td className="num">{s.deliveries.RETRYING || 0}</td><td className="num">{s.deliveries.DEAD_LETTER || 0}</td>
                <td><button type="button" className="btn-secondary small" onClick={() => flip(s)}>{s.available ? 'Take offline' : 'Bring back'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function DxControl() {
  const nav = useNavigate()
  const { data, error, loading, reload } = useMdm('/x/control', undefined, [])
  const { data: dead, reload: reloadDead } = useMdm('/x/deliveries', { status: 'DEAD_LETTER', limit: 20 }, [])
  const [msg, setMsg] = useState(null)
  if (!data) return <div className="mdm-hub"><h1 className="page-title">Control tower</h1><Status loading={loading} error={error} /></div>
  const d = data
  const redeliver = async (id) => {
    setMsg(null)
    try { await mdm(`/x/deliveries/${id}/redeliver`, { method: 'POST', body: {} }); setMsg('Sent.') } catch (e) { setMsg(e.message) }
    reload(); reloadDead()
  }
  const openTotal = d.open_approvals.reduce((a, r) => a + r.n, 0)
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Control tower</h1>
      <p className="mdm-intro">What is moving, what is waiting and what needs a person, across every department.</p>
      <div className="dx-tiles">
        <Tile label="Events received" value={d.events.n.toLocaleString('en-IN')} hint={`${d.events.day} in the last day`} />
        <Tile label="Waiting for a decision" value={openTotal} tone={openTotal ? 'warn' : undefined} />
        <Tile label="Set aside after failures" value={d.dead_letters} tone={d.dead_letters ? 'bad' : undefined} />
        <Tile label="Open corrections" value={d.open_discrepancies} tone={d.open_discrepancies ? 'warn' : undefined} />
        <Tile label="Possible misuse flags (24h)" value={d.misuse_alerts} tone={d.misuse_alerts ? 'bad' : undefined} />
        <Tile label="Audit log" value={d.audit_chain.ok ? 'Intact' : 'BROKEN'} tone={d.audit_chain.ok ? 'ok' : 'bad'} hint={`${d.audit_chain.checked.toLocaleString('en-IN')} entries checked`} />
      </div>
      <Subscribers rows={d.subscribers} reload={() => { reload(); reloadDead() }} />
      {dead?.items?.length > 0 && (
        <section className="mdm-card">
          <h3>Set aside for a person</h3>
          {msg && <p className="mdm-note" role="status">{msg}</p>}
          <ul className="mdm-plain">
            {dead.items.map((x) => (
              <li key={x.id}><Tag map={DELIVERY} value={x.status} /> {x.system} · {x.purpose} <span className="mdm-sub">{x.attempts} attempts · {fmtTime(x.updated_at)}</span>{' '}
                <button type="button" className="btn-secondary small" onClick={() => redeliver(x.id)}>Send again</button></li>
            ))}
          </ul>
        </section>
      )}
      <div className="dx-split">
        <section className="mdm-card">
          <h3>Waiting for a person, by department</h3>
          {d.open_approvals.length ? (
            <table className="mdm-table tight"><thead><tr><th>Department</th><th>Open</th><th>Oldest</th></tr></thead>
              <tbody>{d.open_approvals.map((r) => <tr key={r.system}><td>{r.system}</td><td className="num">{r.n}</td><td className="mdm-sub">{r.oldest_hours} h</td></tr>)}</tbody></table>
          ) : <p className="mdm-note">Nothing is waiting.</p>}
          <div className="mdm-actions"><button type="button" className="mdm-link" onClick={() => nav('/dx/approvals')}>Open the approvals inbox</button></div>
        </section>
        <section className="mdm-card">
          <h3>Requests answered and refused</h3>
          <ul className="mdm-plain">{Object.entries(d.exchanges).map(([k, n]) => <li key={k}><Tag map={OUTCOME} value={k} /> {n.toLocaleString('en-IN')}</li>)}</ul>
          {d.timing?.avg_ms != null && <p className="mdm-sub">Average answer time {d.timing.avg_ms} ms · slowest {d.timing.max_ms} ms</p>}
          <button type="button" className="mdm-link" onClick={() => nav('/dx/ledger')}>Open the clearing house</button>
        </section>
      </div>
      <section className="mdm-card">
        <h3>Load test evidence</h3>
        {d.loadtests.length ? (
          <table className="mdm-table tight">
            <thead><tr><th>When</th><th>Requests</th><th>Failed</th><th>Median</th><th>95th percentile</th><th>Per second</th></tr></thead>
            <tbody>{d.loadtests.map((r) => <tr key={r.id}><td>{fmtTime(r.ts)}</td><td className="num">{r.requests}</td><td className="num">{r.errors}</td><td className="num">{r.p50_ms} ms</td><td className="num">{r.p95_ms} ms</td><td className="num">{r.rps}</td></tr>)}</tbody>
          </table>
        ) : <p className="mdm-note">No run recorded yet. Run <code>tools/loadtest.py</code> on the laptop and the result appears here.</p>}
      </section>
      <p className="mdm-sub">Also open: {d.open_review_tasks} identity matches waiting for a steward · {d.dq_high} serious data-quality issues.</p>
    </div>
  )
}
