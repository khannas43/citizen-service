import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, CONSENT, DELIVERY, ConsentAnswer, PersonPicker, fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Drawer, FilterSelect, Facts, Banner, DateRange, useServerTable } from './dxKit'
import { tr } from '../../i18n/lang'

function citizenLabel(c) {
  if (c.status === 'EXPIRED') return tr('Expired')
  if (c.status !== 'PENDING') {
    const when = c.responded_at ? fmtTime(c.responded_at) : null
    return when ? tr('Answered {date}', { date: when }) : tr('Answered')
  }
  if (c.parent_held) {
    return (
      <span>
        {tr('Waiting for officer to confirm the parent')}
        {c.parent_review_reason ? (
          <>
            {' · '}
            <Link to={`/dx/work/${c.parent_review_reason}`} onClick={(e) => e.stopPropagation()}>
              {tr('Open parent review')}
            </Link>
          </>
        ) : null}
      </span>
    )
  }
  if (c.seen_at) return tr('Seen {date}', { date: fmtTime(c.seen_at) })
  return tr('Waiting')
}

function Receipt({ id, reload, maxReminders }) {
  const { data, error, loading, reload: again } = useMdm(`/x/consents/${id}`, undefined, [id])
  const [msg, setMsg] = useState(null)
  const [answer, setAnswer] = useState(false)
  if (!data?.consent) return <Status loading={loading} error={error} />
  const c = data.consent
  const r = data.receipt
  const refresh = () => { again(); reload() }
  const act = async (path, body, text) => {
    setMsg(null)
    try { const x = await mdm(path, { method: 'POST', body }); setMsg({ ok: true, text: typeof text === 'function' ? text(x) : text }); refresh() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  const remindLimit = maxReminders ?? 2
  const remindDone = (c.reminders || 0) >= remindLimit
  const parentHeld = !!c.parent_held
  return (
    <div aria-label={tr('Consent receipt')} className="dxk-stackform">
      <Facts items={[
        ['Person', `${r.principal}${c.given_by_name ? ` (${tr('answered by their guardian, {name}', { name: c.given_by_name })})` : ''}`],
        ['About', c.subject_name && c.subject_name !== r.principal ? c.subject_name : null],
        ['Use', r.purpose], ['Department', r.department],
        ['Shares', `${(r.elements || []).map((e) => e.replace(/_/g, ' ')).join(', ') || '—'}${r.partial ? ` (${tr('part only')})` : ''}`],
        ['Status', <Tag key="s" map={CONSENT} value={r.status} />],
        [tr('Citizen'), citizenLabel(c)],
        ['Answered', r.channel ? (r.channel === 'ASSISTED' ? tr('with operator {operator} present', { operator: r.operator }) : r.channel === 'PORTAL' ? tr('by the citizen in the portal') : tr('by API')) : null],
        ['Granted', fmtTime(r.granted_on)], ['Expires', fmtTime(r.expires_on)], ['Withdrawn', r.withdrawn_on ? fmtTime(r.withdrawn_on) : null],
      ]} />
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
      <div className="dxk-actions">
        {c.status === 'PENDING' && <>
          <button type="button" className="btn-primary" onClick={() => setAnswer((v) => !v)}>{tr('Record the answer')}</button>
          <button type="button" className="btn-secondary" disabled={remindDone || parentHeld}
            title={parentHeld ? tr('Waiting for officer to confirm the parent') : undefined}
            onClick={() => act(`/x/consents/${id}/remind`, {}, (x) => (
              x.notify_enabled
                ? tr('Reminder {n} of {max} sent', { n: x.reminder_n, max: x.reminder_max })
                : tr('Reminder recorded; notifications are switched off.')
            ))}>
            {parentHeld
              ? tr('Waiting for officer to confirm the parent')
              : remindDone
              ? tr('Reminders used up ({reminders} of {max})', { reminders: c.reminders, max: remindLimit })
              : tr('Remind ({reminders} of {max} sent)', { reminders: c.reminders || 0, max: remindLimit })}
          </button>
        </>}
        {c.status === 'GRANTED' && <button type="button" className="btn-secondary" onClick={() => act(`/x/consents/${id}/revoke`, { note: 'Withdrawn from the consent screen' }, (x) => tr('Withdrawn. Departments told: {list}.', { list: x.departments_told.join(', ') || tr('none had received data') }))}>{tr('Record a withdrawal')}</button>}
      </div>
      {answer && c.status === 'PENDING' && <ConsentAnswer consent={c} onDone={() => { setAnswer(false); refresh() }} />}
      <hr className="dxk-rule" />
      <h3 className="dxk-h3">{tr('History')}</h3>
      <ol className="dx-timeline">
        {data.log.map((l) => <li key={l.id}><strong>{l.action.replace(/_/g, ' ').toLowerCase()}</strong><div className="mdm-sub">{fmtTime(l.ts)} · {l.actor}{l.channel ? ` · ${l.channel.toLowerCase()}` : ''}{l.note ? ` · ${l.note}` : ''}</div></li>)}
      </ol>
      {data.deliveries.length > 0 && <>
        <h3 className="dxk-h3">{tr('What this consent released or stopped')}</h3>
        <ul className="mdm-plain">{data.deliveries.map((d) => <li key={d.id}><Tag map={DELIVERY} value={d.status} /> {d.kind === 'REVOCATION' ? tr('Withdrawal notice to ') : ''}{d.system} <span className="mdm-sub">{fmtTime(d.created_at)}</span></li>)}</ul>
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
      <PersonPicker onPick={setPerson} label={tr('Who is asked')} />
      {person && <Banner>{tr('Asking:')} <strong>{person.name}</strong></Banner>}
      <label className="dxk-field"><span>{tr('For what use')}</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.system_name})</option>)}</select></label>
      <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!person} onClick={send}>{tr('Create the request')}</button></div>
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
    <Card title={tr('Demonstration tools')} tone="warn" hint={tr('Time does not pass on its own in a demonstration. Move the clock to show a consent lapsing, or a young person reaching the adult age.')}>
      <div className="dxk-form">
        <label className="dxk-field"><span>{tr('Pretend today is')}</span><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        <div><button type="button" className="btn-secondary" disabled={!asOf} onClick={() => run('/x/consents/sweep', { as_of: asOf }, (r) => tr('Lapsed: {a} unanswered request(s) and {b} consent(s) whose term ended.', { a: r.no_response, b: r.term_ended }))}>{tr('Apply expiry rules')}</button></div>
        <label className="dxk-field"><span>{tr('Person number')}</span><input inputMode="numeric" value={pid} onChange={(e) => setPid(e.target.value.replace(/\D/g, ''))} /></label>
        <div><button type="button" className="btn-secondary" disabled={!pid || !asOf} onClick={() => run(`/x/persons/${pid}/handover`, { as_of: asOf }, (r) => tr('At {age}: {a} guardian consent(s) ended, {b} new request(s) to the person. Nothing was enrolled.', { age: r.age, a: r.ended.length, b: r.new_requests.length }))}>{tr('Hand over at the adult age')}</button></div>
      </div>
      {msg && <div style={{ marginTop: '0.75rem' }}><Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner></div>}
    </Card>
  )
}

export default function DxConsent() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [waitingCitizen, setWaitingCitizen] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const T = useServerTable(null, 15)
  const { offset, setOffset, limit } = T
  const [tick, setTick] = useState(0)
  const [sel, setSel] = useState(params.get('consent') ? Number(params.get('consent')) : null)
  const [adding, setAdding] = useState(!!params.get('person'))
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const { data: policy } = useMdm('/x/policy', undefined, [])
  const maxReminders = (policy?.policies || []).find((p) => p.key === 'max_reminders')?.value ?? 2
  const effectiveStatus = waitingCitizen ? 'PENDING' : status
  const { data, error, loading } = useMdm('/x/consents', { status: effectiveStatus, purpose, q: q.trim(), date_from: from, date_to: to, limit, offset, ...T.sortParams }, [effectiveStatus, purpose, q, from, to, offset, tick, T.key])
  const reload = () => setTick((n) => n + 1)
  const tone = { PENDING: 'warn', GRANTED: 'ok', REVOKED: 'bad' }
  return (
    <div className="mdm-hub">
      <PageHeader icon="🤝" title={tr('Consent')}
        subtitle={tr('Each use of a person\'s data needs that person\'s consent for that purpose. Consent can be partial, can lapse, and can be withdrawn at any time. Withdrawal is passed on to the departments that had received data.')}
        actions={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>{tr('Ask for consent')}</button>} />
      <Stats items={['PENDING', 'GRANTED', 'REFUSED', 'EXPIRED', 'REVOKED', 'ENDED'].map((s) => ({
        label: CONSENT[s][0], value: (data?.by_status?.[s] || 0).toLocaleString('en-IN'), tone: tone[s] || 'neutral', active: !waitingCitizen && status === s,
        onClick: () => { setWaitingCitizen(false); setStatus(status === s ? '' : s); setOffset(0) },
      }))} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={T.server(data.total)}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search by parent, child, registration number or MDM id' }}
          canClear={!!(status || waitingCitizen || purpose || q || from || to)} onClear={() => { setStatus(''); setWaitingCitizen(false); setPurpose(''); setQ(''); setFrom(''); setTo(''); setOffset(0) }}
          filters={<>
            <FilterSelect label={tr('Citizen')} value={waitingCitizen ? 'WAITING' : ''} onChange={(v) => { setWaitingCitizen(v === 'WAITING'); if (v === 'WAITING') setStatus(''); setOffset(0) }}
              options={[['WAITING', tr('Waiting for the citizen')]]} />
            <FilterSelect label={tr('Use')} value={purpose} onChange={(v) => { setPurpose(v); setOffset(0) }}
              options={(purposes || []).filter((p) => p.consent_required).map((p) => [p.code, p.name])} />
            <DateRange label={tr('Asked between')} from={from} to={to} onFrom={(v) => { setFrom(v); setOffset(0) }} onTo={(v) => { setTo(v); setOffset(0) }} />
          </>}
          onRowClick={(c) => setSel(c.id)} empty={tr('No consent matches')}
          columns={[
            { key: 'person_name', sortKey: 'person_name', label: 'Person', render: (c) => <><span className="dxk-main">{c.person_name}</span>{c.subject_name && c.subject_name !== c.person_name ? <div className="mdm-sub">{tr('asked about {subject_name}{v}', { subject_name: c.subject_name, v: c.event_key ? ` · ${c.event_key}` : '' })}</div> : null}</> },
            { key: 'purpose_name', sortKey: 'purpose_name', label: 'Use', render: (c) => <>{c.purpose_name}{c.scope?.partial && <> <Badge tone="info">{tr('part only')}</Badge></>}</> },
            { key: 'system_name', sortKey: 'system_name', label: 'Department' },
            { key: 'status', sortKey: 'status', label: 'Status', render: (c) => <Tag map={CONSENT} value={c.status} /> },
            { key: 'citizen', label: tr('Citizen'), sort: false, render: (c) => <span className="dxk-muted">{citizenLabel(c)}</span> },
            { key: 'expires_at', sortKey: 'expires_at', label: 'Expires', render: (c) => <span className="dxk-muted">{c.expires_at ? fmtTime(c.expires_at) : c.respond_by ? tr('answer by {t}', { t: fmtTime(c.respond_by) }) : '—'}</span> },
            { key: 'go', label: '', sort: false, render: (c) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setSel(c.id) }}>{tr('Open')}</button> },
          ]} />
      )}
      <DemoTools reload={reload} />
      <Drawer open={adding} onClose={() => setAdding(false)} title={tr('Ask for consent')} subtitle={tr('The person is asked to agree to one use of their data.')}>
        <NewRequest initial={{ person: params.get('person'), purpose: params.get('purpose') }} purposes={purposes} done={(id) => { setAdding(false); setSel(id); reload() }} />
      </Drawer>
      <Drawer open={!!sel} onClose={() => setSel(null)} title={tr('Consent receipt')} subtitle={sel ? tr('Consent {id}', { id: sel }) : ''} wide>
        {sel && <Receipt key={sel} id={sel} reload={reload} maxReminders={typeof maxReminders === 'number' ? maxReminders : Number(maxReminders) || 2} />}
      </Drawer>
    </div>
  )
}
