import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mdm, MDM_API } from '../../mdmApi'
import { getOfficerAccessToken } from '../../auth'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, Stats, Tabs, DataTable, Drawer, Banner, Facts } from './dxKit'
import { tr, tObj } from '../../i18n/lang'

export const RESULT = {
  PASS: ['Passed', 'ok'], PARTIAL: ['Met, with a gap', 'warn'], FAIL: ['Failed', 'bad'], ERROR: ['Error', 'bad'], SKIPPED: ['No data to run on', 'neutral'],
}
const ResultTag = ({ value }) => {
  if (!value) return <Badge tone="neutral">{tr('Not run yet')}</Badge>
  const [t, tone] = RESULT[value] || [value, 'neutral']
  return <Badge tone={tone}>{t}</Badge>
}

function detailValue(v) {
  if (v == null) return ''
  if (Array.isArray(v)) {
    if (!v.length) return ''
    if (v.every((x) => x == null || typeof x !== 'object')) return v.map(String).join(', ')
    return v.map((x) => (typeof x === 'object' ? Object.entries(x).map(([a, b]) => `${a}: ${b}`).join(', ') : String(x))).join('; ')
  }
  if (typeof v === 'object') return Object.entries(v).map(([a, b]) => `${a}: ${typeof b === 'object' ? JSON.stringify(b) : b}`).join(', ')
  return String(v)
}

function Checks({ result }) {
  const lines = result.checks || []
  return (
    <div className="dx-evidence">
      <ul className="dx-checklist">
        {lines.map((c, i) => {
          const kind = c.info ? 'info' : c.ok ? 'pass' : 'fail'
          const aria = c.info ? tr('Note') : c.ok ? tr('Checked') : tr('Not met')
          const label = c.info ? tr('Info') : c.ok ? tr('Passed') : tr('Failed')
          return (
            <li key={i} className={`dx-check dx-check-${kind}`}>
              <span className="dx-check-label" role="img" aria-label={aria}>{label}</span>{' '}
              <span className={c.ok || c.info ? '' : 'mdm-error'}>{c.text}</span>
              {c.data && Object.keys(c.data).length > 0 && (
                <details className="dx-check-details">
                  <summary>{tr('Details')}</summary>
                  <dl className="dxk-facts">
                    {Object.entries(c.data).map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{detailValue(v)}</dd></div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          )
        })}
      </ul>
      {result.gaps.map((g, i) => (
        <div key={i} className="dx-check dx-check-gap" role="status">
          <span className="dx-check-label">{tr('Gap')}</span> {g}
        </div>
      ))}
    </div>
  )
}

const EVENT_NAME = (t) => (t || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

/** The events this scenario's run created, each with a link to its full trail and to its case. */
function RunEvents({ sid, result }) {
  const evs = result?.events || []
  if (!result) return null
  if (!evs.length) return null
  return (
    <div className="dxk-stackform" aria-label={tr('Events this run created')}>
      <p className="mdm-sub"><strong>{evs.length === 1 ? tr('The event this run created') : tr('The {n} events this run created', { n: evs.length })}</strong></p>
      <ul className="mdm-plain">
        {evs.map((e) => (
          <li key={e.id}>
            {EVENT_NAME(e.event_type)} · {e.citizen || tr('Citizen not identified')}
            {e.event_key ? <> · <span className="dx-mono">{e.event_key}</span></> : null}{' '}
            <Link to={`/dx/lineage?tab=event&event=${e.id}`}>{tr('Open the full trail')}</Link>{' · '}
            <Link to={`/dx/events?case=${e.id}`}>{tr('Open the case')}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DxScenarios() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/demo/scenarios', undefined, [tick])
  const [params] = useSearchParams()
  const [uc, setUc] = useState('ALL')
  const [open, setOpen] = useState(null)
  const [detail, setDetail] = useState({})
  const [progress, setProgress] = useState(null)
  const [msg, setMsg] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [rf, setRf] = useState('')

  const wanted = params.get('open')
  useEffect(() => {
    const it = wanted && data?.items.find((i) => i.id === wanted)
    if (it) { setUc('ALL'); show(it) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, data])
  const show = async (item) => {
    setOpen(item.id)
    if (item.last && !detail[item.id]) {
      try {
        const run = await mdm(`/x/demo/runs/${item.last.run_id}`)
        setDetail((d) => ({ ...d, ...Object.fromEntries(run.results.map((r) => [r.scenario, r])) }))
      } catch (e) { setMsg(e.message) }
    }
  }
  const runMany = async (ids, kind) => {
    setMsg(null)
    try {
      const { run_id } = await mdm('/x/demo/runs', { method: 'POST', body: { kind } })
      const fresh = {}
      for (let i = 0; i < ids.length; i += 1) {
        setProgress({ n: i + 1, of: ids.length, id: ids[i] })
        const r = await mdm(`/x/demo/runs/${run_id}/scenarios/${ids[i]}`, { method: 'POST' })
        fresh[ids[i]] = r
        setDetail((d) => ({ ...d, [ids[i]]: r }))
      }
      await mdm(`/x/demo/runs/${run_id}/finish`, { method: 'POST' })
      setOpen(ids.length === 1 ? ids[0] : null)
    } catch (e) { setMsg(e.message) } finally { setProgress(null); setTick((n) => n + 1) }
  }
  const reset = async () => {
    setMsg(null)
    try {
      const r = await mdm('/x/demo/reset', { method: 'POST' })
      setMsg(tr('Cleared: {a} events, {b} records, {c} consents, {d} ledger rows. The audit log is kept.', { a: r.events, b: r.records, c: r.consents + r.consents_for_demo_events, d: r.ledger_rows + r.ledger_rows_for_new_children }))
      setConfirmReset(false); setDetail({}); setTick((n) => n + 1)
    } catch (e) { setMsg(e.message); setConfirmReset(false) }
  }

  if (!data) return <div className="mdm-hub"><PageHeader icon="▶️" title={tr('Scenario runner')} /><Status loading={loading} error={error} /></div>
  return <Runner {...{ data, uc, setUc, open, setOpen, detail, progress, msg, confirmReset, setConfirmReset, reset, runMany, show }} rf={rf} setRf={setRf} />
}

function Runner({ data, uc, setUc, open, setOpen, detail, progress, msg, confirmReset, setConfirmReset, reset, runMany, show, rf, setRf }) {
  const isStep = (i) => i.type === 'step'
  const scripted = data.items.filter((i) => !isStep(i))
  const items = scripted.filter((i) => (uc === 'ALL' || i.uc === uc) && (!rf || (rf === 'NONE' ? !i.last : rf === 'FAIL_OR_ERROR' ? (i.last?.status === 'FAIL' || i.last?.status === 'ERROR') : i.last?.status === rf)))
  const steps = data.items.filter((i) => isStep(i) && (uc === 'ALL' || i.uc === uc))
  const tally = (s) => data.items.filter((i) => i.last?.status === s).length
  const notRun = data.items.filter((i) => !i.last).length
  const busy = !!progress
  const cur = data.items.find((i) => i.id === open)
  const res = cur && detail[cur.id]
  const tile = (label, value, tone, key) => ({ label, value, tone, active: rf === key, onClick: () => setRf(rf === key ? '' : key) })
  return (
    <div className="mdm-hub">
      <PageHeader icon="▶️" title={tr('Scenario runner')}
        subtitle={tr('These are the scripted scenarios from the plan, plus the cross-cutting tests. Each one runs the real flows on fresh DEMO- records and lists what it checked. A scenario passes only when every check passes. If this build cannot yet do something the plan shows, the scenario is marked “Met, with a gap”. Dates are worked out as of {date}.', { date: data.reference_date })}
        actions={<>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => runMany(scripted.map((i) => i.id), 'ALL')}>{tr('Run all {length}', { length: scripted.length })}</button>
          <button type="button" className="btn-secondary" disabled={busy || uc === 'ALL'} onClick={() => runMany(items.map((i) => i.id), uc)}>{tr('Run the {uc} group', { uc: uc === 'CC' ? tr('Cross-cutting') : uc })}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmReset(true)}>{tr('Clear demo records…')}</button>
        </>} />
      <Stats items={[
        tile('Passed', tally('PASS'), 'ok', 'PASS'),
        tile('Met, with a gap', tally('PARTIAL'), 'warn', 'PARTIAL'),
        { label: 'Failed or error', value: tally('FAIL') + tally('ERROR'), tone: tally('FAIL') + tally('ERROR') ? 'bad' : 'neutral', active: rf === 'FAIL_OR_ERROR', onClick: () => setRf(rf === 'FAIL_OR_ERROR' ? '' : 'FAIL_OR_ERROR') },
        tile('No data to run on', tally('SKIPPED'), 'neutral', 'SKIPPED'),
        tile('Not run yet', notRun, 'neutral', 'NONE'),
      ]} />
      {progress && <Banner>{tr('Running scenario {n} of {of} ({id}). A full run takes about two minutes.', { n: progress.n, of: progress.of, id: progress.id })}</Banner>}
      {msg && <Banner tone="warn">{msg}</Banner>}
      {confirmReset && (
        <Card title={tr('Clear demo records?')} tone="warn">
          <div role="alertdialog" aria-label={tr('Clear demo records')}>
            <p>{tr('This removes only the records that scenario runs and unscripted events created. That means registrations starting DEMO-, plus their consents, tickets, keys and connectors. The loaded data goes back to how it was. The audit log, run history and policy history are kept. Use this between rehearsals.')}</p>
            <div className="dxk-actions">
              <button type="button" className="btn-primary" onClick={reset}>{tr('Yes, clear them')}</button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmReset(false)}>{tr('Cancel')}</button>
            </div>
          </div>
        </Card>
      )}
      <Tabs label={tr('Group')} value={uc} onChange={setUc} tabs={['ALL', 'UC1', 'UC2', 'UC3', 'UC4', 'UC5', 'UC6', 'CC'].map((g) => ({ id: g, label: g === 'ALL' ? tr('All') : g === 'CC' ? tr('Cross-cutting') : g }))} />
      {steps.length > 0 && (
        <Card title={tr('Live demo steps (run these one at a time during the demo)')}>
          <p className="mdm-sub" style={{ marginTop: 0 }}>{tr('These steps change the demo on purpose, for example making the student turn 18. Run each one when the story reaches it.')}</p>
          <ul className="mdm-plain" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {steps.map((i) => (
              <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px dashed var(--color-border-light, #e5e7eb)' }}>
                <strong style={{ minWidth: '2.5rem' }}>{i.id}</strong>
                <button type="button" className="mdm-link" style={{ flex: 1, textAlign: 'left' }} onClick={() => show(i)}>{i.title}</button>
                <ResultTag value={detail[i.id]?.status || i.last?.status} />
                <button type="button" className="btn-secondary small" disabled={busy} onClick={() => runMany([i.id], i.id)} aria-label={`Run ${i.id}`}>{tr('Run')}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <DataTable rows={items} pageSize={15} csv={{ name: 'scenarios' }} canClear={!!rf} onClear={() => setRf('')}
        search={{ placeholder: 'Search scenarios', text: (i) => `${i.id} ${i.title} ${i.shows}` }} onRowClick={(i) => show(i)} empty={tr('No scenario matches')}
        columns={[
          { key: 'id', label: 'ID', render: (i) => <><strong>{i.id}</strong>{i.type === 'negative' && <span className="mdm-sub"> {tr('(negative case)')}</span>}</> },
          { key: 'title', label: 'Scenario', render: (i) => <button type="button" className="mdm-link" onClick={(e) => { e.stopPropagation(); show(i) }}>{i.title}</button> },
          { key: 'status', label: 'Result', render: (i) => <><ResultTag value={i.last?.status} />{i.last && <span className="mdm-sub"> {tr('{passed} of {checks} checks passed{v}', { passed: i.last.passed, checks: i.last.checks, v: i.last.gaps ? tr(', {n} gap', { n: i.last.gaps }) : '' })}</span>}</>, csv: (i) => i.last?.status || '' },
          { key: 'ran', label: 'Last run', sort: false, render: (i) => <span className="dxk-muted">{i.last ? `${fmtTime(i.last.ran_at)} · ${(i.last.ms / 1000).toFixed(1)}s` : '—'}</span> },
          { key: 'go', label: '', sort: false, render: (i) => <button type="button" className="btn-secondary small" disabled={busy} onClick={(e) => { e.stopPropagation(); runMany([i.id], i.id) }} aria-label={`Run ${i.id}`}>{tr('Run')}</button> },
        ]} />
      <Drawer open={!!cur} onClose={() => setOpen(null)} title={cur ? `${cur.id}: ${cur.title}` : ''} wide>
        {cur && <div className="dxk-stackform">
          <p className="mdm-sub"><strong>{tr('What the plan shows:')}</strong> {cur.shows}</p>
          {cur.how && <p className="mdm-sub"><strong>{tr('How it runs:')}</strong> {cur.how}</p>}
          {cur.uc === 'UC1' && <p className="mdm-sub"><Link to="/dx/lineage?tab=person">{tr('See which system supplied each value for a person')}</Link></p>}
          {res && <RunEvents sid={cur.id} result={res} />}
          {res && !res.events?.length && ['UC2', 'UC3', 'UC5', 'UC6'].includes(cur.uc) && <p className="mdm-note">{tr('No events from this run are left to open. They were cleared, or this scenario did not create one. Run it again to get a fresh one.')}</p>}
          {res ? <Checks result={res} /> : <p className="mdm-note">{cur.last ? tr('Loading the results…') : tr('This scenario has not been run yet. Press Run to see what it checks.')}</p>}
          {res?.error && <Banner tone="bad"><strong>{tr('Error')}</strong>: {res.error}</Banner>}
          <div className="dxk-actions"><button type="button" className="btn-primary" disabled={busy} onClick={() => runMany([cur.id], cur.id)}>{tr('Run this scenario')}</button></div>
        </div>}
      </Drawer>
    </div>
  )
}

// ---------------------------------------------------------------- injector
const SYSTEMS = tObj({ pds: 'Civil supplies (PDS)', health: 'Health', welfare: 'Women and child welfare', citizen: 'Citizen record', education: 'Education', housing: 'Housing', pension: 'Pension MIS' })

export function DxInjector() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/demo/injections', undefined, [tick])
  const [p, setP] = useState({ system: 'health', count: 12, key: 'consent_response_days', value: '21', consent_id: '' })
  const [last, setLast] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const go = async (cat) => {
    setErr(null); setBusy(cat.id)
    const params = {}
    for (const k of cat.params) params[k] = k === 'count' || k === 'consent_id' ? (p[k] === '' ? undefined : Number(p[k])) : p[k]
    try { setLast(await mdm('/x/demo/inject', { method: 'POST', body: { category: cat.id, params } })); setTick((n) => n + 1) } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }
  if (!data) return <div className="mdm-hub"><PageHeader icon="⚡" title={tr('Unscripted events')} /><Status loading={loading} error={error} /></div>
  const groups = [...new Set(data.categories.map((c) => c.group))]
  return (
    <div className="mdm-hub">
      <PageHeader icon="⚡" title={tr('Unscripted events')}
        subtitle={'For when the client asks "what if…". Each button sends one realistic event or change into the live platform; the result shows what we expected and what actually happened. Then open Events, Approvals or Control tower to see it in context. Use "Clear demo records" on the Scenario runner afterwards.'} />
      {err && <Banner tone="bad">{err}</Banner>}
      {last && (
        <Card title={data.categories.find((c) => c.id === last.category)?.label} tone="ok">
          <div role="status" aria-label={tr('Result')}><Facts items={[['We expected', last.expected], ['What happened', last.observed]]} /></div>
        </Card>
      )}
      {groups.map((g) => (
        <Card title={g} key={g}>
          <div className="dx-inject-grid">
            {data.categories.filter((c) => c.group === g).map((c) => (
              <div className="dx-inject" key={c.id}>
                <strong>{c.label}</strong>
                <p className="mdm-sub">{c.expects}</p>
                {c.params.includes('system') && <label className="dxk-field"><span>{tr('Department')}</span><select value={p.system} onChange={(e) => setP({ ...p, system: e.target.value })}>{Object.entries(SYSTEMS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
                {c.params.includes('count') && <label className="dxk-field"><span>{tr('Look-ups')}</span><input type="number" min="2" max="60" value={p.count} onChange={(e) => setP({ ...p, count: e.target.value })} /></label>}
                {c.params.includes('consent_id') && <label className="dxk-field"><span>{tr('Consent number (blank: the latest granted)')}</span><input value={p.consent_id} onChange={(e) => setP({ ...p, consent_id: e.target.value })} /></label>}
                {c.params.includes('key') && <>
                  <label className="dxk-field"><span>{tr('Policy setting')}</span><input value={p.key} onChange={(e) => setP({ ...p, key: e.target.value })} /></label>
                  <label className="dxk-field"><span>{tr('New value')}</span><input value={p.value} onChange={(e) => setP({ ...p, value: e.target.value })} /></label>
                </>}
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => go(c)} aria-label={`Inject: ${c.label}`}>{busy === c.id ? 'Sending…' : 'Send'}</button>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Card title={tr('What has been injected')} flush>
        <DataTable rows={data.log} pageSize={10} pageSizes={[10, 25]} empty={tr('Nothing injected yet.')} csv={{ name: 'injected-events' }}
          search={{ placeholder: 'Search injected events', text: (l) => `${l.category} ${l.expected} ${l.observed} ${l.actor}` }}
          columns={[
            { key: 'ts', label: 'When', render: (l) => <span className="mdm-sub">{fmtTime(l.ts)}<br />{l.actor}</span> },
            { key: 'category', label: 'Event', render: (l) => data.categories.find((c) => c.id === l.category)?.label || l.category },
            { key: 'expected', label: 'Expected', render: (l) => <span className="dxk-muted">{l.expected}</span> },
            { key: 'observed', label: 'Observed' },
          ]} />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- evidence pack
async function download(path, filename) {
  const res = await fetch(`${MDM_API}/api${path}`, { headers: { Authorization: `Bearer ${getOfficerAccessToken()}` } })
  if (!res.ok) throw new Error(`The download failed (${res.status}).`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

const DOC_STATUS = { NOT_STARTED: ['Not started', 'neutral'], DRAFT: ['Draft', 'warn'], READY: ['Ready', 'ok'] }

function DocRow({ d, saved }) {
  const [f, setF] = useState({ status: d.status, reference: d.reference || '', owner: d.owner || '', notes: d.notes || '' })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setErr(null)
    try { await mdm(`/x/demo/documents/${d.item}`, { method: 'PUT', body: f }); saved() } catch (e) { setErr(e.message) }
  }
  return (
    <tr>
      <td><strong>{d.title}</strong><p className="mdm-sub">{d.requirement}</p></td>
      <td><select aria-label={`Status of ${d.title}`} value={f.status} onChange={set('status')}>{Object.entries(DOC_STATUS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></td>
      <td><input aria-label={`Where is ${d.title}`} placeholder={tr('Link or file name')} value={f.reference} onChange={set('reference')} /></td>
      <td><input aria-label={`Owner of ${d.title}`} value={f.owner} onChange={set('owner')} /></td>
      <td><button type="button" className="btn-secondary small" onClick={save} aria-label={`Save ${d.title}`}>{tr('Save')}</button>{err && <Banner tone="bad">{err}</Banner>}</td>
    </tr>
  )
}

export function DxEvidence() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/demo/evidence', undefined, [tick])
  const [msg, setMsg] = useState(null)
  const get = async (path, name) => { setMsg(null); try { await download(path, name) } catch (e) { setMsg(e.message) } }
  if (!data) return <div className="mdm-hub"><PageHeader icon="📦" title={tr('Evidence pack')} /><Status loading={loading} error={error} /></div>
  const c = data.scripted.counts
  return (
    <div className="mdm-hub">
      <PageHeader icon="📦" title={tr('Evidence pack')}
        subtitle={`Everything a reviewer needs in one place: what ran, what passed, what this build does not do yet, proof that the audit log has not been altered, and the status of the documents that evidence what cannot be shown live. ${data.statement}`}
        actions={<>
          <button type="button" className="btn-primary" onClick={() => get('/x/demo/evidence.md', 'evidence-pack.md')}>{tr('Download evidence pack (Markdown)')}</button>
          <button type="button" className="btn-secondary" onClick={() => get('/x/demo/evidence', 'evidence-pack.json')}>{tr('Download as data (JSON)')}</button>
        </>} />
      <Stats items={[
        { label: 'Passed', value: c.PASS, tone: 'ok' },
        { label: 'Met, with a gap', value: c.PARTIAL, tone: 'warn' },
        { label: 'Failed or error', value: c.FAIL + c.ERROR, tone: c.FAIL + c.ERROR ? 'bad' : 'neutral' },
        { label: 'Not run yet', value: data.scripted.not_run.length, hint: `of ${data.scripted.total}` },
        { label: 'Audit chain', value: data.audit_chain.ok ? 'Intact' : 'BROKEN', tone: data.audit_chain.ok ? 'ok' : 'bad', hint: `${data.audit_chain.entries} entries` },
        { label: 'Written evidence ready', value: `${data.written_evidence_ready} of ${data.written_evidence.length}` },
      ]} />
      {msg && <Banner tone="bad">{msg}</Banner>}
      {data.scripted.not_run.length > 0 && <Banner tone="warn">{tr('Not run yet: {not_run}. Run them on the Scenario runner before exporting.', { not_run: data.scripted.not_run.join(', ') })}</Banner>}
      <Card title={tr('What this build does not do yet')}>
        {data.gaps.length ? <ul className="mdm-plain">{data.gaps.map((g, i) => <li key={i}><strong>{g.scenario}</strong> {g.gap}</li>)}</ul> : <p className="mdm-note">{tr('No gaps recorded in the latest runs.')}</p>}
      </Card>
      <Card title={tr('Written evidence: what cannot be shown live')} hint={tr('These are prepared outside the platform (hosting, encryption, recovery and so on). Mark an item ready only when the document exists, and say where it is.')} flush>
        <div className="mdm-table-wrap"><table className="mdm-table">
          <thead><tr><th>{tr('Item')}</th><th>{tr('Status')}</th><th>{tr('Where')}</th><th>{tr('Owner')}</th><th /></tr></thead>
          <tbody>{data.written_evidence.map((d) => <DocRow key={d.item + d.updated_at} d={d} saved={() => setTick((n) => n + 1)} />)}</tbody>
        </table></div>
      </Card>
      <Card title={tr('Load smoke tests (indicative only)')} flush>
        <DataTable rows={data.load_tests} dense pageSize={10} pageSizes={[10]} empty={tr('No load test yet. Run CC9 on the Scenario runner.')}
          columns={[
            { key: 'ts', label: 'When', render: (l) => <span className="mdm-sub">{fmtTime(l.ts)}</span> },
            { key: 'requests', label: 'Requests', align: 'num' }, { key: 'rps', label: 'Per second', align: 'num' },
            { key: 'p50_ms', label: 'Median', align: 'num', render: (l) => `${l.p50_ms} ms` }, { key: 'p95_ms', label: '95th percentile', align: 'num', render: (l) => `${l.p95_ms} ms` },
            { key: 'errors', label: 'Errors', align: 'num' },
          ]} />
      </Card>
    </div>
  )
}
