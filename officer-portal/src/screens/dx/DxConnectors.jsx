import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, CONNECTOR, fmtTime } from './dxShared'
import { PageHeader, Stats, DataTable, Drawer, FilterSelect, Banner, Facts } from './dxKit'

function Onboard({ meta, done }) {
  const [f, setF] = useState({ source: '', name: '', system: 'housing', interface: '', auth_method: 'OAUTH_CLIENT', schedule: 'Daily' })
  const [rows, setRows] = useState([{ field: '', element: 'name' }])
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const send = async () => {
    setErr(null)
    try {
      const mapping = Object.fromEntries(rows.filter((r) => r.field.trim()).map((r) => [r.field.trim(), r.element]))
      const c = await mdm('/x/connectors', { method: 'POST', body: { ...f, mapping } })
      done(c.id)
    } catch (e) { setErr(e.message) }
  }
  return (
    <div className="dxk-stackform">
      <p className="mdm-sub">Step 1 of 3: describe it. Then map its fields, test it, and a person makes it live.</p>
      <div className="dxk-form">
        <label className="dxk-field"><span>Short name</span><input value={f.source} onChange={set('source')} placeholder="water_board" /></label>
        <label className="dxk-field"><span>Display name</span><input value={f.name} onChange={set('name')} /></label>
        <label className="dxk-field"><span>Owning department</span>
          <select value={f.system} onChange={set('system')}>{Object.entries(meta.systems).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <div className="dxk-form">
        <label className="dxk-field"><span>Interface</span><input value={f.interface} onChange={set('interface')} placeholder="REST API, daily file, database view…" /></label>
        <label className="dxk-field"><span>How it connects</span>
          <select value={f.auth_method} onChange={set('auth_method')}>{Object.entries(meta.auth_methods).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="dxk-field"><span>Refresh</span><input value={f.schedule} onChange={set('schedule')} /></label>
      </div>
      <h3 className="dxk-h3">Step 2: which of its fields mean what</h3>
      {rows.map((r, i) => (
        <div className="dxk-form" key={i}>
          <label className="dxk-field"><span>Department field</span><input value={r.field} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} /></label>
          <label className="dxk-field"><span>Means</span>
            <select value={r.element} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, element: e.target.value } : x)))}>{meta.elements.map((el) => <option key={el} value={el}>{el.replace(/_/g, ' ')}</option>)}</select></label>
        </div>
      ))}
      <div className="dxk-actions">
        <button type="button" className="btn-secondary" onClick={() => setRows([...rows, { field: '', element: 'name' }])}>Add a field</button>
        <button type="button" className="btn-primary" disabled={!f.source.trim()} onClick={send}>Save as draft</button>
      </div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}

function Detail({ id, reload }) {
  const { data: c, error, loading, reload: again } = useMdm(`/x/connectors/${id}`, undefined, [id])
  const { data: meta } = useMdm('/x/connectors', undefined, [])
  const [reason, setReason] = useState('')
  const [test, setTest] = useState(null)
  const [msg, setMsg] = useState(null)
  const [map, setMap] = useState(null)
  if (!c) return <Status loading={loading} error={error} />
  const go = async (path, body, after) => {
    setMsg(null)
    try { const r = await mdm(path, { method: 'POST', body }); after?.(r); again(); reload() } catch (e) { setMsg(e.message) }
  }
  const mapping = map ?? Object.entries(c.mapping || {}).map(([field, element]) => ({ field, element }))
  return (
    <div className="dxk-stackform" aria-label="Connector detail">
      <Facts items={[
        ['State', <span key="s"><Tag map={CONNECTOR} value={c.status} /> {!c.available && <Badge tone="bad">Department offline</Badge>}</span>],
        ['Owner', c.system_name], ['Interface', c.interface || '—'], ['Connects by', c.auth_name],
        ['Records held', `${c.stats.records.toLocaleString('en-IN')} · latest as of ${c.stats.latest_as_of ? String(c.stats.latest_as_of).slice(0, 10) : '—'}`],
        ['Needs a steward', `${c.stats.waiting_for_steward} identity matches · ${c.stats.open_quality_issues} quality issues`],
        ['Events to it', Object.entries(c.deliveries).map(([k, n]) => `${k.toLowerCase().replace(/_/g, ' ')} ${n}`).join(' · ') || '—'],
      ]} />
      {c.status !== 'ACTIVE' && (
        <>
          <h3 className="dxk-h3">Field mapping</h3>
          {mapping.map((r, i) => (
            <div className="dxk-form" key={i}>
              <label className="dxk-field"><span>Department field</span><input value={r.field} onChange={(e) => setMap(mapping.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} /></label>
              <label className="dxk-field"><span>Means</span>
                <select value={r.element} onChange={(e) => setMap(mapping.map((x, j) => (j === i ? { ...x, element: e.target.value } : x)))}>{(meta?.elements || []).map((el) => <option key={el} value={el}>{el.replace(/_/g, ' ')}</option>)}</select></label>
            </div>
          ))}
          <div className="dxk-actions">
            <button type="button" className="btn-secondary" onClick={() => setMap([...mapping, { field: '', element: 'name' }])}>Add a field</button>
            <button type="button" className="btn-secondary" onClick={() => go(`/x/connectors/${id}/mapping`, { mapping: Object.fromEntries(mapping.filter((r) => r.field.trim()).map((r) => [r.field.trim(), r.element])) }, () => setMap(null))}>Save mapping</button>
          </div>
        </>
      )}
      <h3 className="dxk-h3">Step 3: test, then make it live</h3>
      <div className="dxk-actions">
        <button type="button" className="btn-secondary" onClick={() => go(`/x/connectors/${id}/test`, {}, setTest)}>Run the checks</button>
      </div>
      {(test || c.last_test) && (
        <ul className="mdm-plain" aria-label="Test result">{(test || c.last_test).checks.map((x) => <li key={x.check}>{x.ok ? '✔' : '✖'} {x.check}{x.note ? <span className="mdm-sub"> — {x.note}</span> : null}</li>)}</ul>
      )}
      <div className="dxk-stackform">
        <label className="dxk-field"><span>Reason (recorded against your name)</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="dxk-actions">
          {c.status !== 'ACTIVE' && <button type="button" className="btn-primary" disabled={reason.trim().length < 10} onClick={() => go(`/x/connectors/${id}/state`, { action: 'ACTIVATE', reason }, () => setReason(''))}>Make live</button>}
          {c.status === 'ACTIVE' && <button type="button" className="btn-secondary" disabled={reason.trim().length < 10} onClick={() => go(`/x/connectors/${id}/state`, { action: 'SUSPEND', reason }, () => setReason(''))}>Suspend</button>}
        </div>
      </div>
      {msg && <Banner tone="bad">{msg}</Banner>}
      <h3 className="dxk-h3">History</h3>
      <ol className="dx-timeline">{c.log.map((l, i) => <li key={i}><strong>{l.action.replace(/_/g, ' ').toLowerCase()}</strong><div className="mdm-sub">{fmtTime(l.ts)} · {l.actor}{l.detail?.reason ? ` · ${l.detail.reason}` : ''}</div></li>)}</ol>
    </div>
  )
}

export default function DxConnectors() {
  const [params, setParams] = useSearchParams()
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [state, setState] = useState('')
  const [owner, setOwner] = useState('')
  const { data, error, loading } = useMdm('/x/connectors', undefined, [tick])
  const sel = params.get('id')
  const items = data?.items || []
  const count = (st) => items.filter((c) => c.status === st).length
  const rows = items.filter((c) => (!state || c.status === state) && (!owner || c.system_name === owner))
  const owners = [...new Set(items.map((c) => c.system_name))].sort()
  const states = [...new Set(items.map((c) => c.status))]
  return (
    <div className="mdm-hub">
      <PageHeader icon="🔌" title="Connectors"
        subtitle="Each department feed, how it connects, and whether it is live. A new feed is described, mapped, tested, and then made live by a person who gives a reason."
        actions={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add a department feed</button>} />
      <Status loading={loading && !data} error={error} />
      {data && <Stats items={[{ label: 'Feeds', value: items.length }, ...states.map((st) => ({ label: CONNECTOR[st]?.[0] || st, value: count(st), tone: st === 'ACTIVE' ? 'ok' : 'warn', active: state === st, onClick: () => setState(state === st ? '' : st) }))]} />}
      {data && (
        <DataTable rows={rows} search={{ placeholder: 'Search feeds', text: (c) => `${c.name} ${c.interface} ${c.system_name} ${c.auth_name}` }} csv={{ name: 'connectors' }}
          canClear={!!(state || owner)} onClear={() => { setState(''); setOwner('') }}
          filters={<FilterSelect label="Owner" value={owner} onChange={setOwner} options={owners.map((o) => [o, o])} />}
          onRowClick={(c) => setParams({ id: c.id })} empty="No feeds match"
          columns={[
            { key: 'name', label: 'Feed', render: (c) => <><span className="dxk-main">{c.name}</span><div className="mdm-sub">{c.interface}</div></> },
            { key: 'system_name', label: 'Owner' },
            { key: 'auth_name', label: 'Connects by' },
            { key: 'records', label: 'Records', align: 'num', render: (c) => c.records.toLocaleString('en-IN') },
            { key: 'status', label: 'State', render: (c) => <Tag map={CONNECTOR} value={c.status} /> },
            { key: 'go', label: '', render: (c) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setParams({ id: c.id }) }}>Open</button> },
          ]} />
      )}
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add a department feed" wide>
        {data && <Onboard meta={data} done={(id) => { setAdding(false); setTick((n) => n + 1); setParams({ id }) }} />}
      </Drawer>
      <Drawer open={!!sel} onClose={() => setParams({})} title="Connector" subtitle={items.find((c) => String(c.id) === String(sel))?.name} wide>
        {sel && <Detail key={sel} id={sel} reload={() => setTick((n) => n + 1)} />}
      </Drawer>
    </div>
  )
}
