import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager, Tile } from '../mdm/shared'
import { describeEvent, EVENT_STATUS } from '../mdm/UseCases'
import { Tag, CONSENT, DELIVERY, ApprovalCard, ConsentAnswer, fmtTime } from './dxShared'

function Case({ id, back }) {
  const nav = useNavigate()
  const { data: f, error, loading, reload } = useMdm(`/x/events/${id}/flow`, undefined, [id])
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)
  if (!f) return <Status loading={loading} error={error} />
  const e = f.event
  const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']
  const openPerson = (pid) => nav(`/mdm?tab=people&person=${pid}`)
  const act = async (path, body, ok) => {
    setMsg(null)
    try { const r = await mdm(path, { method: 'POST', body: body || {} }); setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok }); reload() } catch (x) { setMsg({ ok: false, text: x.message }) }
  }
  const main = f.proposals.filter((p) => !p.parent_id)
  const follow = f.proposals.filter((p) => p.parent_id)
  return (
    <div className="mdm-stack">
      <button type="button" className="mdm-link" onClick={back}>← Back to the event stream</button>
      <section className="mdm-card">
        <h3>{describeEvent(e)}</h3>
        <p><Badge tone={tone}>{st}</Badge> <span className="mdm-sub">registration {e.event_key} · received {fmtTime(e.received_at)}</span></p>
        {e.note && <p className="mdm-note">{e.note}</p>}
        {f.person && <p>About: <button type="button" className="mdm-link strong" onClick={() => openPerson(f.person.id)}>{f.person.name}</button> <span className="mdm-sub">{f.person.mdm_id}</span></p>}
      </section>
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role="status">{msg.text}</p>}

      <section className="mdm-card">
        <h3>What happened, in order</h3>
        <ol className="dx-timeline">
          {f.timeline.map((t, i) => <li key={i}><strong>{t.what}</strong><div className="mdm-sub">{fmtTime(t.ts)}{t.detail ? ` · ${t.detail}` : ''}</div></li>)}
        </ol>
      </section>

      {f.deliveries.length > 0 && (
        <section className="mdm-card flush">
          <div className="mdm-card-pad"><h3>Departments told about this event</h3>
            <p className="mdm-note">A department receives the event only when the person has consented to that use. Each row shows what was sent and why not, when it was not.</p></div>
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Department</th><th>For</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {f.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.system_name}</td><td>{d.purpose_name}{d.kind === 'REVOCATION' ? ' — withdrawal notice' : ''}</td>
                    <td><Tag map={DELIVERY} value={d.status} /></td>
                    <td className="mdm-sub">{d.detail?.reason || d.detail?.message || d.detail?.waiting_for || d.detail?.released_by || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {f.consents.length > 0 && (
        <section className="mdm-card">
          <h3>Consent for each use</h3>
          <p className="mdm-note">The parent decides each use separately. A use that is declined, left unanswered or withdrawn sends nothing.</p>
          {f.consents.map((c) => (
            <div key={c.id} className="mdm-prop">
              <div className="mdm-prop-head">
                <div><strong>{c.purpose_name}</strong><div className="mdm-sub">Asked of {c.person_name} · reminders sent {c.reminders}</div></div>
                <Tag map={CONSENT} value={c.status} />
              </div>
              <div className="mdm-actions">
                {c.status === 'PENDING' && <>
                  <button type="button" className="btn-secondary small" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide' : 'Record the answer'}</button>
                  <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${c.id}/remind`, {}, 'Reminder recorded.')}>Send a reminder</button>
                </>}
                {c.status === 'GRANTED' && <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${c.id}/revoke`, { note: 'Withdrawn from the case page' }, (r) => `Withdrawn. Told: ${r.departments_told.join(', ') || 'no department had received data'}.`)}>Record a withdrawal</button>}
              </div>
              {open === c.id && c.status === 'PENDING' && <ConsentAnswer consent={c} onDone={() => { setOpen(null); reload() }} />}
            </div>
          ))}
        </section>
      )}

      {main.length > 0 && <section className="mdm-card"><h3>Waiting for a decision</h3>
        {main.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={reload} openPerson={openPerson} />)}</section>}
      {follow.length > 0 && <section className="mdm-card"><h3>Follow-up actions</h3>
        <p className="mdm-note">Each follow-up goes to the department concerned and is decided there, with a reason recorded.</p>
        {follow.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={reload} openPerson={openPerson} />)}</section>}
    </div>
  )
}

export default function DxEvents() {
  const [params, setParams] = useSearchParams()
  const sel = params.get('case')
  const [uc, setUc] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const limit = 25
  const { data, error, loading } = useMdm('/x/events', { uc, status, limit, offset }, [uc, status, offset, tick])
  const { data: dl } = useMdm('/x/deliveries', { limit: 1 }, [tick])
  if (sel) return <div className="mdm-hub"><h1 className="page-title">Event stream</h1><Case id={sel} back={() => { setParams({}); setTick((n) => n + 1) }} /></div>
  const replay = async () => {
    setBusy(true); setMsg(null)
    try { const r = await mdm('/events/replay', { method: 'POST' }); setMsg(`Processed ${r.events} sample events.`); setTick((n) => n + 1) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const by = dl?.by_status || {}
  const blocked = Object.entries(by).filter(([k]) => k.startsWith('BLOCKED')).reduce((a, [, n]) => a + n, 0)
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Event stream</h1>
      <p className="mdm-intro">Every event that departments publish, and what happened for each department that subscribes to it. Open an event to see its case: who was asked, what was sent, and what is waiting for a decision.</p>
      <div className="mdm-tiles" style={{ margin: '1rem 0' }}>
        <Tile label="Sent to departments" value={(by.DELIVERED || 0).toLocaleString('en-IN')} tone="ok" hint="with consent" />
        <Tile label="Waiting for consent" value={(by.PENDING_CONSENT || 0).toLocaleString('en-IN')} tone="warn" hint="nothing sent yet" />
        <Tile label="Stopped or not sent" value={blocked.toLocaleString('en-IN')} hint="declined, withdrawn, lapsed, no parent" />
        <Tile label="Events received" value={(data?.total ?? 0).toLocaleString('en-IN')} />
      </div>
      <form className="mdm-filters" onSubmit={(e) => e.preventDefault()}>
        <label className="mdm-field"><span>Situation</span>
          <select value={uc} onChange={(e) => { setUc(e.target.value); setOffset(0) }}>
            <option value="">All</option><option value="UC2">Birth</option><option value="UC3">Death</option><option value="UC6">Marriage</option></select></label>
        <label className="mdm-field"><span>Outcome</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
            <option value="">All</option>{Object.entries(EVENT_STATUS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </form>
      <Status loading={loading && !data} error={error} />
      {data && data.total === 0 && (
        <section className="mdm-card"><p className="mdm-note">No events have arrived. Play the sample feed to see how births, deaths and marriages are handled.</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={replay}>Play the sample feed</button>{msg && <p className="mdm-note" role="status">{msg}</p>}</section>
      )}
      {data && data.total > 0 && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Received</th><th>Event</th><th>Outcome</th><th>Departments</th><th className="num">To decide</th><th /></tr></thead>
              <tbody>
                {data.items.map((e) => {
                  const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']
                  return (
                    <tr key={e.id}>
                      <td className="mdm-sub">{fmtTime(e.received_at)}</td>
                      <td>{describeEvent(e)}</td>
                      <td><Badge tone={tone}>{st}</Badge></td>
                      <td>
                        <div className="dx-chips">
                          {e.delivered > 0 && <Badge tone="ok">{e.delivered} sent</Badge>}
                          {e.waiting > 0 && <Badge tone="warn">{e.waiting} waiting for consent</Badge>}
                          {e.blocked > 0 && <Badge>{e.blocked} not sent</Badge>}
                          {!e.delivered && !e.waiting && !e.blocked && <span className="mdm-sub">—</span>}
                        </div>
                      </td>
                      <td className="num">{e.open_proposals || 0}</td>
                      <td><button type="button" className="btn-primary small" onClick={() => setParams({ case: String(e.id) })}>Open</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
    </div>
  )
}
