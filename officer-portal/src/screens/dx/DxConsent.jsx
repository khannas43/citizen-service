import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from '../mdm/shared'
import { Tag, CONSENT, DELIVERY, ConsentAnswer, PersonPicker, fmtTime } from './dxShared'

function Receipt({ id, reload, close }) {
  const { data, error, loading, reload: again } = useMdm(`/x/consents/${id}`, undefined, [id])
  const [msg, setMsg] = useState(null)
  const [answer, setAnswer] = useState(false)
  if (!data) return <Status loading={loading} error={error} />
  const c = data.consent
  const r = data.receipt
  const refresh = () => { again(); reload() }
  const act = async (path, body, text) => {
    setMsg(null)
    try { const x = await mdm(path, { method: 'POST', body }); setMsg({ ok: true, text: typeof text === 'function' ? text(x) : text }); refresh() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  return (
    <section className="mdm-card" aria-label="Consent receipt">
      <div className="mdm-prop-head"><h3>Consent receipt</h3><button type="button" className="mdm-link" onClick={close}>Close</button></div>
      <dl className="dx-kv">
        <dt>Person</dt><dd>{r.principal}{c.given_by_name ? ` (answered by their guardian, ${c.given_by_name})` : ''}</dd>
        {c.subject_name && c.subject_name !== r.principal && <><dt>About</dt><dd>{c.subject_name}</dd></>}
        <dt>Use</dt><dd>{r.purpose}</dd>
        <dt>Department</dt><dd>{r.department}</dd>
        <dt>Shares</dt><dd>{(r.elements || []).map((e) => e.replace(/_/g, ' ')).join(', ') || '—'}{r.partial ? ' (part only)' : ''}</dd>
        <dt>Status</dt><dd><Tag map={CONSENT} value={r.status} /></dd>
        {r.channel && <><dt>Answered</dt><dd>{r.channel === 'ASSISTED' ? `with operator ${r.operator} present` : r.channel === 'PORTAL' ? 'by the citizen in the portal' : 'by API'}</dd></>}
        <dt>Granted</dt><dd>{fmtTime(r.granted_on)}</dd>
        <dt>Expires</dt><dd>{fmtTime(r.expires_on)}</dd>
        {r.withdrawn_on && <><dt>Withdrawn</dt><dd>{fmtTime(r.withdrawn_on)}</dd></>}
      </dl>
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role="status">{msg.text}</p>}
      <div className="mdm-actions">
        {c.status === 'PENDING' && <>
          <button type="button" className="btn-primary small" onClick={() => setAnswer((v) => !v)}>Record the answer</button>
          <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${id}/remind`, {}, 'Reminder recorded.')}>Send a reminder ({c.reminders} sent)</button>
        </>}
        {c.status === 'GRANTED' && <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${id}/revoke`, { note: 'Withdrawn from the consent screen' }, (x) => `Withdrawn. Departments told: ${x.departments_told.join(', ') || 'none had received data'}.`)}>Record a withdrawal</button>}
      </div>
      {answer && c.status === 'PENDING' && <ConsentAnswer consent={c} onDone={() => { setAnswer(false); refresh() }} />}
      <h4>History</h4>
      <ol className="dx-timeline">
        {data.log.map((l) => <li key={l.id}><strong>{l.action.replace(/_/g, ' ').toLowerCase()}</strong><div className="mdm-sub">{fmtTime(l.ts)} · {l.actor}{l.channel ? ` · ${l.channel.toLowerCase()}` : ''}{l.note ? ` · ${l.note}` : ''}</div></li>)}
      </ol>
      {data.deliveries.length > 0 && <>
        <h4>What this consent released or stopped</h4>
        <ul className="mdm-plain">{data.deliveries.map((d) => <li key={d.id}><Tag map={DELIVERY} value={d.status} /> {d.kind === 'REVOCATION' ? 'Withdrawal notice to ' : ''}{d.system} <span className="mdm-sub">{fmtTime(d.created_at)}</span></li>)}</ul>
      </>}
    </section>
  )
}

function NewRequest({ initial, purposes, done }) {
  const [person, setPerson] = useState(initial.person ? { id: Number(initial.person), name: `Person ${initial.person}` } : null)
  const [purpose, setPurpose] = useState(initial.purpose || 'SCHOLARSHIP_ELIGIBILITY')
  const [err, setErr] = useState(null)
  const send = async () => {
    setErr(null)
    try { const r = await mdm('/x/consents', { method: 'POST', body: { person_id: person.id, purpose } }); done(r.id) } catch (e) { setErr(e.message) }
  }
  return (
    <section className="mdm-card">
      <h3>Ask for consent</h3>
      <PersonPicker onPick={setPerson} label="Who is asked" />
      {person && <p className="mdm-note">Asking: <strong>{person.name}</strong></p>}
      <label className="mdm-field"><span>For what use</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.system_name})</option>)}</select></label>
      <div className="mdm-actions"><button type="button" className="btn-primary small" disabled={!person} onClick={send}>Create the request</button></div>
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </section>
  )
}

function DemoTools({ reload }) {
  const [asOf, setAsOf] = useState('')
  const [pid, setPid] = useState('')
  const [msg, setMsg] = useState(null)
  const run = async (path, body, fmt) => {
    setMsg(null)
    try { setMsg({ ok: true, text: fmt(await mdm(path, { method: 'POST', body })) }); reload() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  return (
    <section className="dx-demo" aria-label="Demonstration tools">
      <h3>Demonstration tools</h3>
      <p className="mdm-note">Time does not pass on its own in a demonstration. Move the clock to show a consent lapsing, or a young person reaching the adult age.</p>
      <div className="mdm-filters">
        <label className="mdm-field"><span>Pretend today is</span><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        <button type="button" className="btn-secondary small" disabled={!asOf} onClick={() => run('/x/consents/sweep', { as_of: asOf }, (r) => `Lapsed: ${r.no_response} unanswered request(s) and ${r.term_ended} consent(s) whose term ended.`)}>Apply expiry rules</button>
        <label className="mdm-field"><span>Person number</span><input inputMode="numeric" value={pid} onChange={(e) => setPid(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="button" className="btn-secondary small" disabled={!pid || !asOf} onClick={() => run(`/x/persons/${pid}/handover`, { as_of: asOf }, (r) => `At ${r.age}: ${r.ended.length} guardian consent(s) ended, ${r.new_requests.length} new request(s) to the person. Nothing was enrolled.`)}>Hand over at the adult age</button>
      </div>
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role="status">{msg.text}</p>}
    </section>
  )
}

export default function DxConsent() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [purpose, setPurpose] = useState('')
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(!!params.get('person'))
  const limit = 20
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const { data, error, loading } = useMdm('/x/consents', { status, purpose, q: term, limit, offset }, [status, purpose, term, offset, tick])
  const reload = () => setTick((n) => n + 1)
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Consent</h1>
      <p className="mdm-intro">Each use of a person's data needs that person's consent for that purpose. Consent can be partial, can lapse, and can be withdrawn at any time. Withdrawal is passed on to the departments that had received data.</p>
      <div className="mdm-tiles" style={{ margin: '1rem 0' }}>
        {['PENDING', 'GRANTED', 'REFUSED', 'EXPIRED', 'REVOKED', 'ENDED'].map((s) => (
          <button key={s} type="button" className="mdm-uc" aria-pressed={status === s} onClick={() => { setStatus(status === s ? '' : s); setOffset(0) }}>
            <span className="mdm-uc-id">{CONSENT[s][0].toUpperCase()}</span><strong>{(data?.by_status?.[s] || 0).toLocaleString('en-IN')}</strong>
          </button>
        ))}
      </div>
      <div className="mdm-actions" style={{ marginBottom: '0.75rem' }}>
        <button type="button" className="btn-primary small" onClick={() => setAdding((v) => !v)}>{adding ? 'Hide the request form' : 'Ask for consent'}</button>
      </div>
      {adding && <NewRequest initial={{ person: params.get('person'), purpose: params.get('purpose') }} purposes={purposes} done={(id) => { setAdding(false); setSel(id); reload() }} />}
      <form className="mdm-filters" onSubmit={(e) => { e.preventDefault(); setOffset(0); setTerm(q.trim()) }} role="search">
        <label className="mdm-field grow"><span>Search by name or MDM id</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="mdm-field"><span>Use</span>
          <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setOffset(0) }}>
            <option value="">All</option>{(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
        <button type="submit" className="btn-secondary small">Search</button>
      </form>
      <Status loading={loading && !data} error={error} />
      <div className={sel ? 'dx-split' : ''}>
        {data && (
          <section className="mdm-card flush">
            <div className="mdm-table-wrap">
              <table className="mdm-table">
                <thead><tr><th>Person</th><th>Use</th><th>Department</th><th>Status</th><th>Expires</th><th /></tr></thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <td>{c.person_name}{c.subject_name && c.subject_name !== c.person_name ? <div className="mdm-sub">about {c.subject_name}</div> : null}</td>
                      <td>{c.purpose_name}{c.scope?.partial && <> <Badge tone="info">part only</Badge></>}</td>
                      <td>{c.system_name}</td><td><Tag map={CONSENT} value={c.status} /></td>
                      <td className="mdm-sub">{c.expires_at ? fmtTime(c.expires_at) : c.respond_by ? `answer by ${fmtTime(c.respond_by)}` : '—'}</td>
                      <td><button type="button" className="btn-secondary small" onClick={() => setSel(c.id)}>Open</button></td>
                    </tr>
                  ))}
                  {!data.items.length && <tr><td colSpan={6} className="mdm-empty">No consent matches.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
          </section>
        )}
        {sel && <Receipt key={sel} id={sel} reload={reload} close={() => setSel(null)} />}
      </div>
      <DemoTools reload={reload} />
    </div>
  )
}
