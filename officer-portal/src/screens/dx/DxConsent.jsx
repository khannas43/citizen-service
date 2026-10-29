import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, CONSENT, DELIVERY, ConsentAnswer, PersonPicker, fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Drawer, FilterSelect, Facts, Banner } from './dxKit'

function Receipt({ id, reload }) {
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
    <div aria-label="Consent receipt" className="dxk-stackform">
      <Facts items={[
        ['Person', `${r.principal}${c.given_by_name ? ` (answered by their guardian, ${c.given_by_name})` : ''}`],
        ['About', c.subject_name && c.subject_name !== r.principal ? c.subject_name : null],
        ['Use', r.purpose], ['Department', r.department],
        ['Shares', `${(r.elements || []).map((e) => e.replace(/_/g, ' ')).join(', ') || '—'}${r.partial ? ' (part only)' : ''}`],
        ['Status', <Tag key="s" map={CONSENT} value={r.status} />],
        ['Answered', r.channel ? (r.channel === 'ASSISTED' ? `with operator ${r.operator} present` : r.channel === 'PORTAL' ? 'by the citizen in the portal' : 'by API') : null],
        ['Granted', fmtTime(r.granted_on)], ['Expires', fmtTime(r.expires_on)], ['Withdrawn', r.withdrawn_on ? fmtTime(r.withdrawn_on) : null],
      ]} />
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
      <div className="dxk-actions">
        {c.status === 'PENDING' && <>
          <button type="button" className="btn-primary" onClick={() => setAnswer((v) => !v)}>Record the answer</button>
          <button type="button" className="btn-secondary" onClick={() => act(`/x/consents/${id}/remind`, {}, 'Reminder recorded.')}>Send a reminder ({c.reminders} sent)</button>
        </>}
        {c.status === 'GRANTED' && <button type="button" className="btn-secondary" onClick={() => act(`/x/consents/${id}/revoke`, { note: 'Withdrawn from the consent screen' }, (x) => `Withdrawn. Departments told: ${x.departments_told.join(', ') || 'none had received data'}.`)}>Record a withdrawal</button>}
      </div>
      {answer && c.status === 'PENDING' && <ConsentAnswer consent={c} onDone={() => { setAnswer(false); refresh() }} />}
      <hr className="dxk-rule" />
      <h3 className="dxk-h3">History</h3>
      <ol className="dx-timeline">
        {data.log.map((l) => <li key={l.id}><strong>{l.action.replace(/_/g, ' ').toLowerCase()}</strong><div className="mdm-sub">{fmtTime(l.ts)} · {l.actor}{l.channel ? ` · ${l.channel.toLowerCase()}` : ''}{l.note ? ` · ${l.note}` : ''}</div></li>)}
      </ol>
      {data.deliveries.length > 0 && <>
        <h3 className="dxk-h3">What this consent released or stopped</h3>
        <ul className="mdm-plain">{data.deliveries.map((d) => <li key={d.id}><Tag map={DELIVERY} value={d.status} /> {d.kind === 'REVOCATION' ? 'Withdrawal notice to ' : ''}{d.system} <span className="mdm-sub">{fmtTime(d.created_at)}</span></li>)}</ul>
      </>}
    </div>
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
    <div className="dxk-stackform">
      <PersonPicker onPick={setPerson} label="Who is asked" />
      {person && <Banner>Asking: <strong>{person.name}</strong></Banner>}
      <label className="dxk-field"><span>For what use</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.system_name})</option>)}</select></label>
      <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!person} onClick={send}>Create the request</button></div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
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
    <Card title="Demonstration tools" tone="warn" hint="Time does not pass on its own in a demonstration. Move the clock to show a consent lapsing, or a young person reaching the adult age.">
      <div className="dxk-form">
        <label className="dxk-field"><span>Pretend today is</span><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        <div><button type="button" className="btn-secondary" disabled={!asOf} onClick={() => run('/x/consents/sweep', { as_of: asOf }, (r) => `Lapsed: ${r.no_response} unanswered request(s) and ${r.term_ended} consent(s) whose term ended.`)}>Apply expiry rules</button></div>
        <label className="dxk-field"><span>Person number</span><input inputMode="numeric" value={pid} onChange={(e) => setPid(e.target.value.replace(/\D/g, ''))} /></label>
        <div><button type="button" className="btn-secondary" disabled={!pid || !asOf} onClick={() => run(`/x/persons/${pid}/handover`, { as_of: asOf }, (r) => `At ${r.age}: ${r.ended.length} guardian consent(s) ended, ${r.new_requests.length} new request(s) to the person. Nothing was enrolled.`)}>Hand over at the adult age</button></div>
      </div>
      {msg && <div style={{ marginTop: '0.75rem' }}><Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner></div>}
    </Card>
  )
}

export default function DxConsent() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [purpose, setPurpose] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(!!params.get('person'))
  const limit = 15
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const { data, error, loading } = useMdm('/x/consents', { status, purpose, q: q.trim(), limit, offset }, [status, purpose, q, offset, tick])
  const reload = () => setTick((n) => n + 1)
  const tone = { PENDING: 'warn', GRANTED: 'ok', REVOKED: 'bad' }
  return (
    <div className="mdm-hub">
      <PageHeader icon="🤝" title="Consent"
        subtitle="Each use of a person's data needs that person's consent for that purpose. Consent can be partial, can lapse, and can be withdrawn at any time. Withdrawal is passed on to the departments that had received data."
        actions={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>Ask for consent</button>} />
      <Stats items={['PENDING', 'GRANTED', 'REFUSED', 'EXPIRED', 'REVOKED', 'ENDED'].map((s) => ({
        label: CONSENT[s][0], value: (data?.by_status?.[s] || 0).toLocaleString('en-IN'), tone: tone[s] || 'neutral', active: status === s,
        onClick: () => { setStatus(status === s ? '' : s); setOffset(0) },
      }))} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search by name or MDM id' }}
          canClear={!!(status || purpose || q)} onClear={() => { setStatus(''); setPurpose(''); setQ(''); setOffset(0) }}
          filters={<FilterSelect label="Use" value={purpose} onChange={(v) => { setPurpose(v); setOffset(0) }}
            options={(purposes || []).filter((p) => p.consent_required).map((p) => [p.code, p.name])} />}
          onRowClick={(c) => setSel(c.id)} empty="No consent matches"
          columns={[
            { key: 'person_name', label: 'Person', render: (c) => <><span className="dxk-main">{c.person_name}</span>{c.subject_name && c.subject_name !== c.person_name ? <div className="mdm-sub">about {c.subject_name}</div> : null}</> },
            { key: 'purpose_name', label: 'Use', render: (c) => <>{c.purpose_name}{c.scope?.partial && <> <Badge tone="info">part only</Badge></>}</> },
            { key: 'system_name', label: 'Department' },
            { key: 'status', label: 'Status', render: (c) => <Tag map={CONSENT} value={c.status} /> },
            { key: 'expires_at', label: 'Expires', render: (c) => <span className="dxk-muted">{c.expires_at ? fmtTime(c.expires_at) : c.respond_by ? `answer by ${fmtTime(c.respond_by)}` : '—'}</span> },
            { key: 'go', label: '', render: (c) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setSel(c.id) }}>Open</button> },
          ]} />
      )}
      <DemoTools reload={reload} />
      <Drawer open={adding} onClose={() => setAdding(false)} title="Ask for consent" subtitle="The person is asked to agree to one use of their data.">
        <NewRequest initial={{ person: params.get('person'), purpose: params.get('purpose') }} purposes={purposes} done={(id) => { setAdding(false); setSel(id); reload() }} />
      </Drawer>
      <Drawer open={!!sel} onClose={() => setSel(null)} title="Consent receipt" subtitle={sel ? `Consent ${sel}` : ''} wide>
        {sel && <Receipt key={sel} id={sel} reload={reload} />}
      </Drawer>
    </div>
  )
}
