import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Hero, Card, Tabs, DataTable, Banner, Stats, DateRange, useServerTable } from './dxKit'
import { fmtTime } from './dxShared'
import PersonFinder from './PersonFinder'
import PersonLineage from './PersonLineage'
import FlowGraph from './FlowGraph'
import NodeDetail from './NodeDetail'
import { PartyName, Parents, MadeBy } from './PartyKit'
import './dxLineage.css'
import { tr, tObj } from '../../i18n/lang'

const n = (v) => (v ?? 0).toLocaleString('en-IN')
const CONNECTOR = tObj({ ACTIVE: 'live', TESTING: 'tested, not live', DRAFT: 'draft', SUSPENDED: 'suspended' })

function Overview({ params, setParams }) {
  const nav = useNavigate()
  const focus = params.get('source') || ''
  const { data, error, loading } = useMdm('/x/lineage/overview', focus ? { source: focus } : {}, [focus])
  if (error) return <Status error={error} />
  if (!data) return <Status loading={loading} />
  const c = data.core
  const picked = data.sources.find((x) => x.source === data.focus)
  const pick = (src) => setParams(src && src !== data.focus ? { tab: 'overview', source: src } : { tab: 'overview' })
  const scope = picked ? tr('People in {name}', { name: picked.name }) : ''
  return (
    <>
      <Banner tone="info">{tr('Read left to right. Departments hand their records in; master data links and merges them; the exchange publishes events and answers questions from the result; the departments and services on the right consume it. Select a source system to follow only its people through the columns; select it again, or use “Show all sources”, to go back.')}</Banner>
      <div className="lin-focusbar">
        {picked
          ? <span className="lin-focus-chip">{tr('Showing:')} <strong>{picked.name}</strong></span>
          : <span className="lin-meta">{tr('Showing all source systems')}</span>}
        {picked && <button type="button" className="btn-secondary small" onClick={() => pick(null)}>{tr('Show all sources')}</button>}
      </div>
      <div className="lin-pipe">
        <div className="lin-col">
          <h3 className="lin-col-h">{tr('1 · Source systems')}</h3>
          {data.sources.map((s) => (
            <button key={s.source} type="button" className={`lin-box${s.open_issues ? ' warn' : ''}${data.focus === s.source ? ' picked' : ''}${data.focus && data.focus !== s.source ? ' dim' : ''}`} onClick={() => pick(s.source)} aria-pressed={data.focus === s.source} aria-label={`${s.name}: ${data.focus === s.source ? 'show all sources' : 'follow this source'}`}>
              <strong>{s.name}</strong>
              <span className="lin-meta">{s.interface}{s.connector ? ` · ${CONNECTOR[s.connector] || s.connector}` : ''}</span>
              <div className="lin-chips">
                <span className="lin-chip">{tr('{v} records', { v: n(s.records) })}</span>
                <span className="lin-chip">{tr('{v} linked', { v: n(s.linked) })}</span>
                {s.in_review > 0 && <span className="lin-chip diff">{tr('{v} in review', { v: n(s.in_review) })}</span>}
                {s.open_issues > 0 && <span className="lin-chip diff">{tr('{v} open issues', { v: n(s.open_issues) })}</span>}
              </div>
              <span className="lin-meta">{tr('Last loaded {v}{v2}', { v: fmtTime(s.loaded_at), v2: s.latest ? ` · ${tr('newest record {v}', { v: s.latest })}` : '' })}</span>
              {data.focus === s.source && <span className="lin-open" role="link" tabIndex={0} onClick={(e) => { e.stopPropagation(); nav(`/dx/quality?feed=${s.source}`) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); nav(`/dx/quality?feed=${s.source}`) } }}>{tr('Open feed quality →')}</span>}
            </button>
          ))}
        </div>
        <div className="lin-arrow" aria-hidden="true">➜</div>
        <div className="lin-col">
          <h3 className="lin-col-h">{tr('2 · Master data')}{scope && <small>{scope}</small>}</h3>
          <button type="button" className="lin-box core" onClick={() => nav('/mdm?tab=people')}><strong>{tr('People')}</strong><span className="lin-n">{n(c.persons)}</span><span className="lin-meta">{tr('from {v} department records', { v: n(c.records) })}</span></button>
          <div className="lin-box core"><strong>{tr('Chosen values')}</strong><span className="lin-n">{n(c.golden_attributes)}</span><span className="lin-meta">{tr('each with its source and rule')}</span></div>
          <button type="button" className="lin-box core" onClick={() => nav('/mdm?tab=people')}><strong>{tr('Family links')}</strong><span className="lin-n">{n(c.relationships)}</span><span className="lin-meta">{tr('parent, spouse, household')}</span></button>
          <button type="button" className={`lin-box ${c.review_open ? 'warn' : 'core'}`} onClick={() => nav('/mdm?tab=review')}><strong>{tr('Waiting for a steward')}</strong><span className="lin-n">{n(c.review_open)}</span><span className="lin-meta">{tr('possible matches needing a human')}</span></button>
          {c.last_load && <span className="lin-meta">{tr('Latest load: run {id}, {v}, rules v{rule_version}', { id: c.last_load.id, v: fmtTime(c.last_load.finished_at), rule_version: c.last_load.rule_version })}</span>}
        </div>
        <div className="lin-arrow" aria-hidden="true">➜</div>
        <div className="lin-col">
          <h3 className="lin-col-h">{tr('3 · What the exchange produces')}{scope && <small>{scope}</small>}</h3>
          {data.outputs.filter((o) => o.kind !== 'queries').map((o) => (
            <div key={o.kind} className="lin-box out"><strong>{o.label}</strong><span className="lin-n">{n(o.count)}</span></div>
          ))}
        </div>
        <div className="lin-arrow" aria-hidden="true">➜</div>
        <div className="lin-col">
          <h3 className="lin-col-h">{tr('4 · Who uses it')}{scope && <small>{scope}</small>}</h3>
          {data.consumers.map((x) => (
            <div key={x.system} className="lin-box con"><strong>{x.name}</strong>
              <span className="lin-meta">{x.events_total ? tr('{a} of {b} notices delivered', { a: n(x.events_delivered), b: n(x.events_total) }) : tr('asks questions')}{x.answers ? ` · ${tr('{n} answers', { n: n(x.answers) })}` : ''}</span></div>
          ))}
        </div>
      </div>
    </>
  )
}

function PersonTab({ params, setParams }) {
  const id = params.get('person')
  const [choosing, setChoosing] = useState(!id)
  const { data: who } = useMdm(id ? `/persons/${id}` : '/health', undefined, [id])
  const p = id ? who?.person : null
  return (
    <>
      {choosing || !id ? (
        <Card title={tr('Choose a person')} hint={tr('Many people share a name. Narrow by district, by how many systems hold them, by life status or by open issues, then select one.')}>
          <PersonFinder onPick={(x) => { setParams({ tab: 'person', person: String(x.id) }); setChoosing(false) }} />
        </Card>
      ) : (
        <Card>
          <div className="lin-chosen">
            <span className="lin-avatar" aria-hidden="true">{(p?.name || '?').trim().charAt(0).toUpperCase()}</span>
            <div className="lin-chosen-main">
              <strong className="lin-chosen-name">{p?.name || `Person ${id}`}</strong>
              {p && <div className="lin-chosen-facts">
                <span className="lin-pill">{p.mdm_id}</span>
                <span>{tr('Born {v}', { v: p.dob || p.birth_year || 'unknown' })}</span>
                <span>{[p.mandal, p.district].filter(Boolean).join(', ') || 'Location unknown'}</span>
                <span>{p.source_count} {p.source_count === 1 ? 'system' : 'systems'}</span>
              </div>}
            </div>
            <button type="button" className="btn-secondary small" onClick={() => setChoosing(true)}>{tr('Choose another person')}</button>
          </div>
        </Card>
      )}
      {id ? <PersonLineage personId={id} /> : <p className="mdm-note">{tr('Pick a person to see which systems their record came from.')}</p>}
    </>
  )
}

/** The citizens an event is about, each linked to their own person page when the event was matched to them. */
function Citizens({ people, big }) {
  if (!people?.length) return <span className="lin-meta">{tr('Not matched to a person')}</span>
  return people.map((p, i) => (
    <span key={`${p.role}-${i}`}>
      {i > 0 && <span className="lin-amp"> &amp; </span>}
      <PartyName p={p} big={big} />
    </span>
  ))
}

function EventTab({ params, setParams }) {
  const nav = useNavigate()
  const id = params.get('event')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [node, setNode] = useState(null)
  const [choosing, setChoosing] = useState(!id)
  const T = useServerTable(null, 10, [5, 10, 25, 50])
  const { offset, setOffset, limit } = T
  const list = useMdm('/x/events', { q: q.trim(), date_from: from, date_to: to, limit, offset, ...T.sortParams }, [q, from, to, offset, T.key])
  const flow = useMdm(id ? `/x/lineage/event/${id}` : '/x/lineage/overview', {}, [id])
  const ev = id ? flow.data?.event : null
  const nodes = (id && flow.data?.nodes) || []
  const pick = (e) => { setNode(null); setParams({ tab: 'event', event: String(e.id) }); setChoosing(false) }
  const kinds = (k) => nodes.filter((n) => n.kind === k).length
  return (
    <>
      {choosing || !id ? (
        <Card title={tr('Choose an event')} hint={tr('Follow one life event through proposals, consent, deliveries, the clearing house and the audit log.')} flush>
          {list.data && (
            <DataTable rows={list.data.items} server={T.server(list.data.total)} searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300}
              canClear={!!(q || from || to)} onClear={() => { setQ(''); setFrom(''); setTo(''); setOffset(0) }}
              filters={<DateRange label={tr('Received between')} from={from} to={to} onFrom={(v) => { setFrom(v); setOffset(0) }} onTo={(v) => { setTo(v); setOffset(0) }} />}
              search={{ placeholder: 'Search by citizen name, event key or type' }} empty={tr('No events yet')} onRowClick={pick}
              columns={[
                { key: 'citizen', sortKey: 'citizen', label: 'Citizen', render: (e) => <Citizens people={e.people} /> },
                { key: 'event_type', sortKey: 'event_type', label: 'Event', render: (e) => <strong>{(e.event_type || '').replace(/_/g, ' ').toLowerCase()}</strong> },
                { key: 'event_key', sortKey: 'event_key', label: 'Key', render: (e) => <span className="dx-mono">{e.event_key}</span> },
                { key: 'status', sortKey: 'status', label: 'Status', render: (e) => <button type="button" className="lin-statusbtn" title={tr('Open the full trail of this event')} aria-label={`Open the trail of event ${e.event_key}`} onClick={(x) => { x.stopPropagation(); pick(e) }}>{(e.status || '').replace(/_/g, ' ').toLowerCase()} <span aria-hidden="true">›</span></button> },
              ]} />
          )}
        </Card>
      ) : (
        <Card>
          <div className="lin-chosen">
            <span className="lin-avatar" aria-hidden="true">⚡</span>
            <div className="lin-chosen-main">
              <div>{ev?.people?.length ? <Citizens people={ev.people} big /> : <strong className="lin-chosen-name">{tr('Citizen not identified')}</strong>}</div>
              {ev && <div className="lin-chosen-facts">
                <span>{(ev.event_type || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
                <span className="lin-pill">{ev.event_key}</span>
                <span className="lin-statusbtn" role="status" aria-label={`Status ${(ev.status || '').replace(/_/g, ' ').toLowerCase()}`}>{(ev.status || '').replace(/_/g, ' ').toLowerCase()}</span>
              </div>}
              {ev && <Parents parents={ev.parents} />}
              {ev && <div className="lin-meta" style={{ marginTop: '0.3rem' }}>
                {tr('Event {id}{v}', { id: ev.id, v: ev.received_at ? ` · received ${fmtTime(ev.received_at)}` : '' })}
                {ev.scenario && <> · {String(ev.scenario).startsWith('INJECT-') ? ev.scenario_title : `Created by scenario ${ev.scenario}${ev.scenario_title ? `: ${ev.scenario_title}` : ''}`} · <MadeBy id={ev.scenario} title={ev.scenario_title} back /></>}
              </div>}
            </div>
            <button type="button" className="btn-secondary small" onClick={() => setChoosing(true)}>{tr('Choose another event')}</button>
          </div>
        </Card>
      )}
      {id && !choosing && nodes.length > 0 && (
        <>
          <Stats items={[{ label: 'Steps in the journey', value: nodes.length }, { label: 'Actions proposed', value: kinds('proposal') }, { label: 'Consents asked', value: kinds('consent') }, { label: 'Departments notified', value: kinds('delivery') }]} />
        </>
      )}
      {id && !choosing && <Status loading={flow.loading && !flow.data} error={flow.error} />}
      {id && !choosing && nodes.length > 0 && (
        <Card title={tr('Journey of this event')} hint={tr('Select any box to see what it is and the facts behind it. A person\'s name opens their page from the box.')}>
          <FlowGraph nodes={nodes} edges={flow.data.edges} onOpen={setNode} />
        </Card>
      )}
      {!id && <p className="mdm-note">{tr('Pick an event to draw its journey.')}</p>}
      <NodeDetail node={node} onClose={() => setNode(null)} onOpen={(n) => nav(n.link)} />
    </>
  )
}

export default function DxLineage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || (params.get('person') ? 'person' : params.get('event') ? 'event' : 'overview')
  return (
    <div className="mdm-hub">
      <Hero eyebrow={tr('Data lineage')} title={tr('Where every value came from')}
        text={tr('Which department supplied it, which load brought it in, when a record was linked and by whom, which rule chose the value, and where it went next.')} />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} label={tr('Lineage views')}
        tabs={[{ id: 'overview', label: 'Sources to consumers' }, { id: 'person', label: 'One person' }, { id: 'event', label: 'One event' }]} />
      {tab === 'overview' && <Overview params={params} setParams={setParams} />}
      {tab === 'person' && <PersonTab params={params} setParams={setParams} />}
      {tab === 'event' && <EventTab params={params} setParams={setParams} />}
    </div>
  )
}
