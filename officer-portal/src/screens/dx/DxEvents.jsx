import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { describeEvent, EVENT_STATUS } from '../mdm/UseCases'
import { Tag, CONSENT, DELIVERY, ApprovalCard, ConsentAnswer, fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Segmented, FilterSelect, EmptyState, Banner, Facts } from './dxKit'

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
      <div><button type="button" className="btn-secondary small" onClick={back}>← Back to the event stream</button></div>
      <Card title={describeEvent(e)} actions={<Badge tone={tone}>{st}</Badge>} tone={tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : 'info'}>
        <Facts items={[['Registration', e.event_key], ['Received', fmtTime(e.received_at)],
          ['About', f.person ? <><button type="button" className="mdm-link strong" onClick={() => openPerson(f.person.id)}>{f.person.name}</button> <span className="mdm-sub">{f.person.mdm_id}</span></> : null]]} />
        {e.note && <p className="mdm-note">{e.note}</p>}
      </Card>
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}

      <Card title="What happened, in order">
        <ol className="dx-timeline">
          {f.timeline.map((t, i) => <li key={i}><strong>{t.what}</strong><div className="mdm-sub">{fmtTime(t.ts)}{t.detail ? ` · ${t.detail}` : ''}</div></li>)}
        </ol>
      </Card>

      {f.deliveries.length > 0 && (
        <Card title="Departments told about this event" flush hint="A department receives the event only when the person has consented to that use. Each row shows what was sent and why not, when it was not.">
          <DataTable rows={f.deliveries} pageSize={10} pageSizes={[10, 25]} search={{ placeholder: 'Search department or purpose', text: (d) => `${d.system_name} ${d.purpose_name} ${d.status}` }}
            columns={[
              { key: 'system_name', label: 'Department', sort: true },
              { key: 'purpose_name', label: 'For', sort: true, render: (d) => <>{d.purpose_name}{d.kind === 'REVOCATION' ? ' — withdrawal notice' : ''}</> },
              { key: 'status', label: 'Status', sort: true, render: (d) => <Tag map={DELIVERY} value={d.status} /> },
              { key: 'detail', label: 'Detail', render: (d) => <span className="dxk-muted">{d.detail?.reason || d.detail?.message || d.detail?.waiting_for || d.detail?.released_by || ''}</span> },
            ]} />
        </Card>
      )}

      {f.consents.length > 0 && (
        <Card title="Consent for each use" hint="The parent decides each use separately. A use that is declined, left unanswered or withdrawn sends nothing.">
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
        </Card>
      )}

      {main.length > 0 && <Card title="Waiting for a decision" tone="warn">
        {main.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={reload} openPerson={openPerson} />)}</Card>}
      {follow.length > 0 && <Card title="Follow-up actions" hint="Each follow-up goes to the department concerned and is decided there, with a reason recorded.">
        {follow.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={reload} openPerson={openPerson} />)}</Card>}
    </div>
  )
}

export default function DxEvents() {
  const [params, setParams] = useSearchParams()
  const sel = params.get('case')
  const [uc, setUc] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const limit = 15
  const { data, error, loading } = useMdm('/x/events', { uc, status, q: q.trim(), limit, offset }, [uc, status, q, offset, tick])
  const { data: dl } = useMdm('/x/deliveries', { limit: 1 }, [tick])
  if (sel) return <div className="mdm-hub"><PageHeader icon="📡" title="Event stream" /><Case id={sel} back={() => { setParams({}); setTick((n) => n + 1) }} /></div>
  const replay = async () => {
    setBusy(true); setMsg(null)
    try { const r = await mdm('/events/replay', { method: 'POST' }); setMsg(`Processed ${r.events} sample events.`); setTick((n) => n + 1) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const by = dl?.by_status || {}
  const blocked = Object.entries(by).filter(([k]) => k.startsWith('BLOCKED')).reduce((a, [, n]) => a + n, 0)
  const none = data && data.total === 0 && !uc && !status && !q
  const reset = () => { setUc(''); setStatus(''); setQ(''); setOffset(0) }
  return (
    <div className="mdm-hub">
      <PageHeader icon="📡" title="Event stream"
        subtitle="Every event that departments publish, and what happened for each department that subscribes to it. Open an event to see its case: who was asked, what was sent, and what is waiting for a decision."
        actions={<button type="button" className="btn-secondary small" disabled={busy} onClick={replay}>Play the sample feed</button>} />
      {msg && <Banner tone="ok">{msg}</Banner>}
      <Stats items={[
        { label: 'Sent to departments', value: (by.DELIVERED || 0).toLocaleString('en-IN'), tone: 'ok', hint: 'with consent' },
        { label: 'Waiting for consent', value: (by.PENDING_CONSENT || 0).toLocaleString('en-IN'), tone: 'warn', hint: 'nothing sent yet' },
        { label: 'Stopped or not sent', value: blocked.toLocaleString('en-IN'), hint: 'declined, withdrawn, lapsed, no parent' },
        { label: 'Events received', value: (data?.total ?? 0).toLocaleString('en-IN'), hint: uc || status || q ? 'matching the filters' : undefined },
      ]} />
      <Status loading={loading && !data} error={error} />
      {none && <Card><EmptyState icon="📡" title="No events have arrived"
        hint="Play the sample feed to see how births, deaths and marriages are handled."
        action={<button type="button" className="btn-primary" disabled={busy} onClick={replay}>Play the sample feed</button>} /></Card>}
      {data && !none && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search registration, event or note' }}
          canClear={!!(uc || status || q)} onClear={reset}
          filters={<>
            <div className="dxk-filter"><span>Situation</span>
              <Segmented label="Situation" value={uc} onChange={(v) => { setUc(v); setOffset(0) }}
                options={[{ value: '', label: 'All' }, { value: 'UC2', label: 'Birth' }, { value: 'UC3', label: 'Death' }, { value: 'UC6', label: 'Marriage' }]} /></div>
            <FilterSelect label="Outcome" value={status} onChange={(v) => { setStatus(v); setOffset(0) }}
              options={Object.entries(EVENT_STATUS).map(([k, [t]]) => [k, t])} />
          </>}
          onRowClick={(e) => setParams({ case: String(e.id) })}
          empty="No events match" columns={[
            { key: 'received_at', label: 'Received', render: (e) => <span className="dxk-muted">{fmtTime(e.received_at)}</span> },
            { key: 'event', label: 'Event', render: (e) => <span className="dxk-main">{describeEvent(e)}</span> },
            { key: 'status', label: 'Outcome', render: (e) => { const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']; return <Badge tone={tone}>{st}</Badge> } },
            { key: 'depts', label: 'Departments', render: (e) => (
              <div className="dx-chips">
                {e.delivered > 0 && <Badge tone="ok">{e.delivered} sent</Badge>}
                {e.waiting > 0 && <Badge tone="warn">{e.waiting} waiting for consent</Badge>}
                {e.blocked > 0 && <Badge>{e.blocked} not sent</Badge>}
                {!e.delivered && !e.waiting && !e.blocked && <span className="mdm-sub">—</span>}
              </div>) },
            { key: 'open_proposals', label: 'To decide', align: 'num', render: (e) => e.open_proposals || 0 },
            { key: 'go', label: '', render: (e) => <button type="button" className="btn-secondary small" onClick={(ev) => { ev.stopPropagation(); setParams({ case: String(e.id) }) }}>Open</button> },
          ]} />
      )}
    </div>
  )
}
