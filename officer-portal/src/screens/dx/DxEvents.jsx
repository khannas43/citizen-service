import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PartyName, MadeBy } from './PartyKit'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { describeEvent, EVENT_STATUS } from '../mdm/eventLabels'
import { Tag, CONSENT, DELIVERY, ApprovalCard, ConsentAnswer, fmtTime } from './dxShared'
import { PageHeader, Hero, Card, Stats, DataTable, Segmented, FilterSelect, EmptyState, Banner, Facts, Drawer, useServerTable } from './dxKit'
import { NoticeBadge, SimulateAnswer, answerText, dueText } from './NoticeKit'
import { tr } from '../../i18n/lang'
import { Mt } from '../../i18n/mt'

/** The citizens an event is about; each is a link to their own person page when the event was matched to them. */
function Citizens({ people }) {
  if (!people?.length) return <span className="dxk-muted" title={tr('The event has not been matched to a person in master data')}>{tr('Not matched')}</span>
  return people.map((p, i) => (
    <span key={`${p.role}-${i}`}>
      {i > 0 && <span className="dxk-muted"> &amp; </span>}
      <PartyName p={p} />
    </span>
  ))
}

const KIND = { BIRTH_REGISTERED: ['🍼', 'birth'], BIRTH_AMENDED: ['🍼', 'birth'], BIRTH_WITHDRAWN: ['🍼', 'birth'], DEATH_REGISTERED: ['🕊', 'death'], MARRIAGE_REGISTERED: ['💍', 'marriage'] }

function Case({ id, back }) {
  const nav = useNavigate()
  const { data: f, error, loading, reload } = useMdm(`/x/events/${id}/flow`, undefined, [id])
  const { data: nt, reload: reloadNotices } = useMdm(`/x/events/${id}/notices`, undefined, [id])
  const [ans, setAns] = useState(null)
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
  const sent = f.deliveries.filter((d) => d.status === 'DELIVERED').length
  const waiting = f.deliveries.filter((d) => d.status === 'PENDING_CONSENT').length
  const stopped = f.deliveries.length - sent - waiting
  const toDecide = f.proposals.filter((p) => p.status === 'PROPOSED').length     // approved and rejected ones are done, so they are not counted
  const [icon, kind] = KIND[e.event_type] || ['📡', 'event']
  return (
    <div className="mdm-stack">
      <Hero
        eyebrow={tr('Event case · {kind}', { kind: tr(kind) })}
        title={<><span className="dxk-case-icon" aria-hidden="true">{icon}</span> {describeEvent(e)}</>}
        text={e.note ? <Mt text={e.note} /> : tr('Everything that happened to this event: who was asked, what was sent, and what is waiting for a decision.')}
        actions={<button type="button" className="dxk-back" onClick={back}>{tr('← Back to the event stream')}</button>}
        aside={<div className="dxk-hero-fig"><span className={`dxk-pill tone-${tone}`}>{st}</span><span>{tr('current outcome')}</span></div>}
      />
      <Card>
        <Facts items={[['Registration', e.event_key], ['Received', fmtTime(e.received_at)],
          ...(e.parents?.length || e.people?.length > 1 ? [] : [['About', f.person ? <><button type="button" className="mdm-link strong" onClick={() => openPerson(f.person.id)}>{f.person.name}</button> <span className="mdm-sub">{f.person.mdm_id}</span></> : null]]),
          ...(e.parents?.length ? [['Child', f.person ? <><button type="button" className="mdm-link strong" onClick={() => openPerson(f.person.id)}>{f.person.name}</button> <span className="mdm-sub">{f.person.mdm_id}</span></> : null], ...e.parents.map((p) => [p.role, <PartyName key={p.role} p={p} />])] : []),
          ...(e.people?.length > 1 ? e.people.map((p) => [p.role || 'Person', <PartyName key={p.role} p={p} />]) : [])]} />
      </Card>
      <Stats items={[
        { value: f.deliveries.length, label: 'Departments subscribed', hint: 'asked to receive this event', tone: 'info' },
        { value: sent, label: 'Sent with consent', hint: 'data has gone out', tone: 'ok' },
        { value: waiting, label: 'Waiting for consent', hint: 'nothing sent yet', tone: waiting ? 'warn' : undefined },
        { value: stopped, label: 'Stopped or not sent', hint: 'declined, withdrawn, lapsed', tone: undefined },
        { value: toDecide, label: 'To decide', hint: 'approvals waiting', tone: toDecide ? 'warn' : undefined },
      ]} />
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}

      <Card title={tr('What happened, in order')} hint={tr('Newest last. Every step is also written to the audit trail.')}>
        <ol className="dxk-steps">
          {f.timeline.map((t, i) => <li key={i}><span className="dxk-step-dot" aria-hidden="true">{i + 1}</span><div><strong>{t.what}</strong><div className="dxk-step-meta">{fmtTime(t.ts)}{t.detail ? ` · ${t.detail}` : ''}</div></div></li>)}
        </ol>
      </Card>

      {f.deliveries.length > 0 && (
        <Card title={tr('Departments told about this event')} flush hint={tr('A department receives the event only when the person has consented to that use. Each row shows what was sent and why not, when it was not.')}>
          <DataTable rows={f.deliveries} pageSize={10} pageSizes={[10, 25]} search={{ placeholder: 'Search department or purpose', text: (d) => `${d.system_name} ${d.purpose_name} ${d.status}` }}
            columns={[
              { key: 'system_name', label: 'Department', sort: true },
              { key: 'purpose_name', label: 'For', sort: true, render: (d) => <>{d.purpose_name}{d.kind === 'REVOCATION' ? ` — ${tr('withdrawal notice')}` : ''}</> },
              { key: 'status', label: 'Status', sort: true, render: (d) => <Tag map={DELIVERY} value={d.status} /> },
              { key: 'detail', label: 'Detail', render: (d) => <span className="dxk-muted"><Mt text={d.detail?.reason || d.detail?.message || d.detail?.waiting_for || d.detail?.released_by || ''} /></span> },
              { key: 'answer', label: "The department's answer", sort: false, render: (d) => {
                const n = (nt?.notices || []).filter((x) => x.source === 'DELIVERY' && x.ref_id === d.id).sort((a, b) => b.revision - a.revision)[0]
                if (!n) return <span className="dxk-muted">{d.status === 'DELIVERED' ? 'Not yet answered' : '—'}</span>
                return <><NoticeBadge state={n.state} /><div className="mdm-sub">{n.outcome ? <>{answerText(n)}{n.reason ? <>: <Mt text={n.reason} /></> : null}</> : dueText(n)}{n.outcome === 'REJECTED' ? '. It went back to a person for review.' : ''}</div></>
              } },
            ]} />
        </Card>
      )}

      {nt?.notices.length > 0 && (
        <Card title={tr('Notices the departments must answer')} flush
          hint={tr('A department answers in its own system, by feed or in the portal. A rejection comes back here to a person. Statutory notices are acknowledged, not rejected.')}>
          <DataTable rows={nt.notices} pageSize={10} pageSizes={[10, 25]} search={{ placeholder: 'Search department or use', text: (n) => `${n.system_name} ${n.use_name} ${n.state}` }}
            columns={[
              { key: 'system_name', label: 'Department', sort: true },
              { key: 'use_name', label: 'For', sort: true, render: (n) => <>{n.use_name}{n.kind === 'REVOCATION' ? ` — ${tr('withdrawal notice')}` : ''}</> },
              { key: 'respond_by', label: 'Answer due', sort: true, render: (n) => <span className={n.state === 'OVERDUE' ? 'dxk-bad' : 'dxk-muted'}>{dueText(n)}</span> },
              { key: 'state', label: 'Status', sort: true, render: (n) => <NoticeBadge state={n.state} /> },
              { key: 'answer', label: 'Their answer', sort: false, render: (n) => <span className="dxk-muted">{answerText(n)}{n.reason ? <>: <Mt text={n.reason} /></> : null}</span> },
              { key: 'go', label: '', sort: false, render: (n) => !n.outcome && <button type="button" className="btn-secondary small" onClick={() => setAns(n)}>{tr('Answer as the department')}</button> },
            ]} />
        </Card>
      )}
      <Drawer open={!!ans} onClose={() => setAns(null)} title={ans ? ans.use_name : ''} subtitle={ans ? `${ans.system_name} · demo stand-in for the department` : ''}>
        {ans && <SimulateAnswer key={ans.id} notice={ans} done={(r) => { setAns(null); setMsg({ ok: true, text: tr('Recorded (simulated): {outcome}', { outcome: r.outcome.toLowerCase() }) + (r.reopened_proposal ? tr('. It went back to a person for review.') : '.') }); reload(); reloadNotices() }} />}
      </Drawer>

      {f.consents.length > 0 && (
        <Card title={tr('Consent for each use')} hint={tr('The parent decides each use separately. A use that is declined, left unanswered or withdrawn sends nothing.')}>
          {f.consents.map((c) => (
            <div key={c.id} className="mdm-prop">
              <div className="mdm-prop-head">
                <div><strong>{c.purpose_name}</strong><div className="mdm-sub">{tr('Asked of {person_name} · reminders sent {reminders}', { person_name: c.person_name, reminders: c.reminders })}</div></div>
                <Tag map={CONSENT} value={c.status} />
              </div>
              <div className="mdm-actions">
                {c.status === 'PENDING' && <>
                  <button type="button" className="btn-secondary small" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? tr('Hide') : tr('Record the answer')}</button>
                  <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${c.id}/remind`, {}, 'Reminder recorded.')}>{tr('Send a reminder')}</button>
                </>}
                {c.status === 'GRANTED' && <button type="button" className="btn-secondary small" onClick={() => act(`/x/consents/${c.id}/revoke`, { note: 'Withdrawn from the case page' }, (r) => tr('Withdrawn. Told: {list}.', { list: r.departments_told.join(', ') || tr('no department had received data') }))}>{tr('Record a withdrawal')}</button>}
              </div>
              {open === c.id && c.status === 'PENDING' && <ConsentAnswer consent={c} onDone={() => { setOpen(null); reload() }} />}
            </div>
          ))}
        </Card>
      )}

      {main.length > 0 && <Card title={tr('Actions for departments')} tone="warn" hint={tr('Our officer decides each action. Once approved, the department\'s own answer is shown on the same row, because the two can differ.')}>
        {main.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={(m) => { if (m) setMsg(m); reload() }} openPerson={openPerson} />)}</Card>}
      {follow.length > 0 && <Card title={tr('Follow-up actions')} hint={tr('Each follow-up goes to the department concerned and is decided there, with a reason recorded.')}>
        {follow.map((p) => <ApprovalCard key={p.id} p={p} minChars={f.rationale_min_chars} reload={(m) => { if (m) setMsg(m); reload() }} openPerson={openPerson} />)}</Card>}
    </div>
  )
}

export default function DxEvents() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const sel = params.get('case')
  const [uc, setUc] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const T = useServerTable(null, 15)
  const { offset, setOffset, limit } = T
  const [tick, setTick] = useState(0)
  const [msg, setMsg] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { data, error, loading } = useMdm('/x/events', { uc, status, q: q.trim(), date_from: from, date_to: to, limit, offset, ...T.sortParams }, [uc, status, q, from, to, offset, tick, T.key])
  const { data: dl } = useMdm('/x/deliveries', { limit: 1 }, [tick])
  const sampleFeedPlays = !sel
  useEffect(() => {      // the sample feed is played every time the page opens; repeats are recognised, so this is safe
    if (!sampleFeedPlays) return undefined
    let live = true
    mdm('/events/replay?once=true', { method: 'POST' }).then(() => { if (live) setTick((n) => n + 1) }).catch((e) => { if (live) setMsg({ ok: false, text: e.message }) })
    return () => { live = false }
  }, [sampleFeedPlays])
  if (sel) return <div className="mdm-hub"><Case id={sel} back={() => { setParams({}); setTick((n) => n + 1) }} /></div>
  const by = dl?.by_status || {}
  const blocked = Object.entries(by).filter(([k]) => k.startsWith('BLOCKED')).reduce((a, [, n]) => a + n, 0)
  const none = data && data.total === 0 && !uc && !status && !q && !from && !to
  const reset = () => { setUc(''); setStatus(''); setQ(''); setFrom(''); setTo(''); setOffset(0) }
  return (
    <div className="mdm-hub">
      <Hero eyebrow={tr('Data exchange · Life events')} title={tr('Event stream')}
        text={tr('Every event that departments publish, and what happened for each department that subscribes to it. Open an event to see its case: who was asked, what was sent, and what is waiting for a decision.')}
        aside={<>
          <div className="dxk-hero-fig"><strong>{(data?.total ?? 0).toLocaleString('en-IN')}</strong><span>{tr('events received')}</span></div>
          <div className="dxk-hero-fig"><strong>{(by.DELIVERED || 0).toLocaleString('en-IN')}</strong><span>{tr('sent with consent')}</span></div>
        </>} />
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
      <Stats items={[
        { label: 'Sent to departments', value: (by.DELIVERED || 0).toLocaleString('en-IN'), tone: 'ok', hint: 'with consent' },
        { label: 'Waiting for consent', value: (by.PENDING_CONSENT || 0).toLocaleString('en-IN'), tone: 'warn', hint: 'nothing sent yet' },
        { label: 'Stopped or not sent', value: blocked.toLocaleString('en-IN'), hint: 'declined, withdrawn, lapsed, no parent' },
        { label: 'Events received', value: (data?.total ?? 0).toLocaleString('en-IN'), hint: uc || status || q || from || to ? 'matching the filters' : undefined },
      ]} />
      <Status loading={loading && !data} error={error} />
      {none && <Card><EmptyState icon="📡" title={tr('No events have arrived yet')} hint={tr('Events appear here as departments publish them.')} /></Card>}
      {data && !none && (
        <DataTable rows={data.items} server={T.server(data.total)}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search citizen, registration, event or note' }}
          canClear={!!(uc || status || q || from || to)} onClear={reset}
          filters={<>
            <div className="dxk-filter"><span>{tr('Situation')}</span>
              <Segmented label={tr('Situation')} value={uc} onChange={(v) => { setUc(v); setOffset(0) }}
                options={[{ value: '', label: 'All' }, { value: 'UC2', label: 'Birth' }, { value: 'UC3', label: 'Death' }, { value: 'UC6', label: 'Marriage' }]} /></div>
            <FilterSelect label={tr('Outcome')} value={status} onChange={(v) => { setStatus(v); setOffset(0) }}
              options={Object.entries(EVENT_STATUS).map(([k, [t]]) => [k, t])} />
            <div className="dxk-filter dxk-daterange"><span>{tr('Received between')}</span>
              <div className="dxk-dates">
                <input type="date" value={from} max={to || undefined} aria-label={tr('From date')} onChange={(e) => { setFrom(e.target.value); setOffset(0) }} />
                <em>{tr('to')}</em>
                <input type="date" value={to} min={from || undefined} aria-label={tr('To date')} onChange={(e) => { setTo(e.target.value); setOffset(0) }} />
              </div></div>
          </>}
          onRowClick={(e) => setParams({ case: String(e.id) })}
          empty={tr('No events match')} columns={[
            { key: 'citizen', sortKey: 'citizen', label: 'Citizen', render: (e) => <Citizens people={e.people} /> },
            { key: 'received_at', sortKey: 'received_at', label: 'Received', render: (e) => <span className="dxk-muted">{fmtTime(e.received_at)}</span> },
            { key: 'event', sortKey: 'event', label: 'Event', render: (e) => <span className="dxk-main-row"><span className={`dxk-kind ${KIND[e.event_type]?.[1] || ''}`} aria-hidden="true">{KIND[e.event_type]?.[0] || '•'}</span><span className="dxk-main">{describeEvent(e)}</span></span> },
            { key: 'scenario', sortKey: 'scenario', label: 'Made by', render: (e) => e.scenario ? <MadeBy id={e.scenario} title={e.scenario_title} /> : <span className="mdm-sub">—</span>, csv: (e) => e.scenario || '' },
            { key: 'status', sortKey: 'status', label: 'Outcome', render: (e) => { const [st, tone] = EVENT_STATUS[e.status] || [e.status, 'neutral']; return <Badge tone={tone}>{st}</Badge> } },
            { key: 'depts', sortKey: 'depts', label: 'Departments', render: (e) => (
              <div className="dx-chips">
                {e.delivered > 0 && <Badge tone="ok">{tr('{delivered} sent', { delivered: e.delivered })}</Badge>}
                {e.waiting > 0 && <Badge tone="warn">{tr('{waiting} waiting for consent', { waiting: e.waiting })}</Badge>}
                {e.blocked > 0 && <Badge>{tr('{blocked} not sent', { blocked: e.blocked })}</Badge>}
                {!e.delivered && !e.waiting && !e.blocked && <span className="mdm-sub">—</span>}
              </div>) },
            { key: 'open_proposals', sortKey: 'open_proposals', label: 'To decide', align: 'num', render: (e) => e.open_proposals || 0 },
            { key: 'go', label: '', sort: false, render: (e) => <button type="button" className="btn-secondary small" onClick={(ev) => { ev.stopPropagation(); setParams({ case: String(e.id) }) }}>{tr('Open')}</button> },
          ]} />
      )}
    </div>
  )
}
