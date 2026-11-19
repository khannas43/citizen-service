import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from './shared'
import { fmtDate } from './labels'
import { Hero, Stats, Collapse, DataTable, FilterSelect, DateRange, useServerTable } from '../dx/dxKit'
import { tr } from '../../i18n/lang'

const FIELDS = [
  ['auto', 'Link automatically at or above', 'A record at or above this score is attached to the person without a human.'],
  ['review', 'Send to a steward at or above', 'Between this and the automatic score, a steward decides. Below it the record stands alone.'],
  ['margin', 'Ask a steward when two candidates are within', 'If the best two candidates are this close, the system will not choose.'],
  ['info_needed', 'Evidence needed before trusting a match', 'Matches resting on name and district alone are discounted below this amount of evidence.'],
]
const nice = (a) => String(a || '').replace(/_/g, ' ').toLowerCase()
const FIELD_LABEL = (k) => (k === 'dob' ? 'Date of birth' : k[0].toUpperCase() + k.slice(1))

/** The thresholds editor: try a setting, preview its effect on stored records, save it as a new version. */
function Thresholds({ data }) {
  const [draft, setDraft] = useState({})
  const [prev, setPrev] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = { ...data.active.match, ...draft }
  const match = Object.fromEntries(FIELDS.map(([k]) => [k, Number(cur[k])]))

  const preview = async () => {
    setBusy(true); setMsg(null); setPrev(null)
    try { setPrev(await mdm('/rules/preview', { method: 'POST', body: { match } })) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const save = async () => {
    setBusy(true)
    try {
      const r = await mdm('/rules', { method: 'POST', body: { match, note: 'Changed from the portal' } })
      setMsg(`Saved as version ${r.version}. It applies at the next reload of the department extracts.`)
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  return (
    <>
      <p className="mdm-note">{tr('Try a setting first. A preview re-runs matching in memory on the stored records and changes nothing.')}</p>
        <div className="mdm-rule-grid">
          {FIELDS.map(([k, label, help]) => (
            <label className="mdm-field" key={k}><span>{label}</span>
              <input type="number" step="0.01" min="0" max="1" value={cur[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              <small className="mdm-sub">{help}</small></label>
          ))}
        </div>
        <div className="mdm-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={preview}>{tr('Preview the effect')}</button>{' '}
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>{tr('Save as the new rules')}</button>
        </div>
        {msg && <p className="mdm-note" role="status">{msg}</p>}
        {prev && (
          <div className="mdm-preview">
            <table className="mdm-table tight">
              <thead><tr><th /><th className="num">{tr('Now')}</th><th className="num">{tr('With these settings')}</th></tr></thead>
              <tbody>
                <tr><td>{tr('People')}</td><td className="num">{prev.currently.persons}</td><td className="num">{prev.would_produce.persons}</td></tr>
                <tr><td>{tr('Linked automatically')}</td><td className="num">{prev.currently.AUTO_LINKED}</td><td className="num">{prev.would_produce.AUTO_LINKED}</td></tr>
                <tr><td>{tr('Waiting for a steward')}</td><td className="num">{prev.currently.IN_REVIEW}</td><td className="num">{prev.would_produce.IN_REVIEW}</td></tr>
                <tr><td>{tr('Stand alone')}</td><td className="num">{prev.currently.NEW}</td><td className="num">{prev.would_produce.NEW}</td></tr>
              </tbody>
            </table>
            {prev.sample_of_changes.length > 0 && (
              <details className="mdm-evidence"><summary>{tr('Records whose outcome would change ({length} shown)', { length: prev.sample_of_changes.length })}</summary>
                <ul className="mdm-plain">{prev.sample_of_changes.map((c, i) => <li key={i}>{c.name} <span className="mdm-sub">({c.source.replace(/_/g, ' ')}): {c.was.replace(/_/g, ' ').toLowerCase()} → {c.would_be.replace(/_/g, ' ').toLowerCase()}</span></li>)}</ul></details>
            )}
          </div>
        )}
    </>
  )
}

/** Every load and steward decision, filtered by who did it, what it was, and when the entry was created. */
function Audit({ facets }) {
  const T = useServerTable(null, 20, [10, 20, 50, 100])
  const { offset, setOffset, limit } = T
  const EMPTY = { actor_is: '', action: '', from: '', to: '' }
  const [f, setF] = useState(EMPTY)
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setOffset(0) }
  const [verify, setVerify] = useState(null)
  const { data, error, loading } = useMdm('/audit', { actor_is: f.actor_is, action: f.action, date_from: f.from, date_to: f.to, limit, offset, ...T.sortParams }, [JSON.stringify(f), offset, T.key])
  const check = async () => { try { setVerify(await mdm('/audit/verify')) } catch (e) { setVerify({ error: e.message }) } }
  const any = Object.values(f).some(Boolean)
  return (
    <>
      <p className="mdm-note">{tr('Every load and every steward decision. Each entry carries a fingerprint of the one before it, so a changed or removed entry shows up.')}</p>
      <p>
        <button type="button" className="btn-secondary small" onClick={check}>{tr('Verify the log')}</button>
        {verify && (verify.error ? <span className="mdm-error"> {verify.error}</span>
          : verify.ok ? <span className="mdm-ok"> {tr('Intact: {checked} entries checked.', { checked: verify.checked })}</span> : <span className="mdm-error"> {tr('Broken at entry {broken_at}.', { broken_at: verify.broken_at })}</span>)}
      </p>
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} rowKey="seq" server={T.server(data.total)} dense
          canClear={any} onClear={() => { setF(EMPTY); setOffset(0) }}
          filters={<>
            <FilterSelect label={tr('Who')} value={f.actor_is} onChange={set('actor_is')} all="Anyone" options={(facets?.actors || []).map((x) => [x.value, `${x.value} (${x.n.toLocaleString('en-IN')})`])} />
            <FilterSelect label={tr('What')} value={f.action} onChange={set('action')} all="Any action" options={(facets?.actions || []).map((x) => [x.value, `${nice(x.value)} (${x.n.toLocaleString('en-IN')})`])} />
            <DateRange label={tr('Record created between')} from={f.from} to={f.to} onFrom={set('from')} onTo={set('to')} />
          </>}
          empty={tr('No entries match')}
          columns={[
            { key: 'seq', sortKey: 'seq', label: '#', align: 'num' },
            { key: 'ts', sortKey: 'ts', label: 'Created', render: (a) => fmtDate(a.ts) },
            { key: 'actor', sortKey: 'actor', label: 'Who' },
            { key: 'action', sortKey: 'action', label: 'What', render: (a) => <Badge>{nice(a.action)}</Badge> },
            { key: 'subject', sortKey: 'subject', label: 'About', render: (a) => <span className="mdm-sub">{a.subject}{a.detail?.note ? ` — ${a.detail.note}` : ''}</span> },
          ]} />
      )}
    </>
  )
}

export default function RulesAudit() {
  const { data, error, loading } = useMdm('/rules')
  const { data: facets } = useMdm('/x/audit/facets', undefined, [])
  const { data: chain } = useMdm('/audit/verify', undefined, [])
  if (!data) return <Status loading={loading} error={error} />
  const m = data.active.match
  const inUse = data.versions.find((v) => v.active)
  const entries = facets?.actions ? facets.actions.reduce((a, x) => a + x.n, 0) : 0
  return (
    <div className="mdm-hub">
      <Hero eyebrow={tr('Governance · Rules and audit')} title={tr('Rules and audit')}
        text={tr('How strongly two records must agree before they are treated as one person, which department wins for each field, and the tamper-evident log of everything that has happened.')}
        aside={chain ? <div className="dxk-hero-fig"><span className={`dxk-pill tone-${chain.ok ? 'ok' : 'bad'}`}>{chain.ok ? 'Audit chain intact' : `Broken at ${chain.broken_at}`}</span><span>{tr('{checked} entries checked', { checked: chain.checked.toLocaleString('en-IN') })}</span></div> : null} />
      <Stats items={[
        { label: 'Rule version in use', value: inUse ? `v${inUse.version}` : '—', hint: inUse ? `${fmtDate(inUse.created_at)} · ${inUse.created_by}` : undefined },
        { label: 'Link automatically from', value: Number(m.auto).toFixed(2), hint: 'match score' },
        { label: 'Steward decides from', value: Number(m.review).toFixed(2), hint: 'below this, the record stands alone' },
        { label: 'Entries in the audit log', value: entries.toLocaleString('en-IN'), hint: `${facets?.actors?.length ?? 0} actors · ${facets?.actions?.length ?? 0} kinds of action` },
      ]} />
      <Collapse id="thr" title={tr('Matching thresholds')} summary={`Link at ${Number(m.auto).toFixed(2)} or above · steward from ${Number(m.review).toFixed(2)} · tie margin ${Number(m.margin).toFixed(2)} · evidence needed ${Number(m.info_needed).toFixed(2)}`}>
        <Thresholds data={data} />
      </Collapse>
      <Collapse id="win" title={tr('Which source wins for each field')} summary={`${Object.keys(data.survivorship_text).length} fields, each with a visible rule`}>
        <DataTable rows={Object.entries(data.survivorship_text).map(([k, v]) => ({ id: k, field: FIELD_LABEL(k), rule: v }))} dense pageSize={10} pageSizes={[10, 25]}
          columns={[{ key: 'field', label: 'Field' }, { key: 'rule', label: 'Rule' }]} />
      </Collapse>
      <Collapse id="ver" title={tr('Rule versions')} summary={`${data.versions.length} version${data.versions.length === 1 ? '' : 's'}${inUse ? ` · version ${inUse.version} in use` : ''}`}>
        <DataTable rows={data.versions.map((v) => ({ ...v, id: v.version }))} dense pageSize={10} pageSizes={[10, 25]} initialSort={{ key: 'version', dir: 'desc' }}
          columns={[
            { key: 'version', label: 'Version', align: 'num' },
            { key: 'active', label: 'Status', sort: (v) => (v.active ? 0 : 1), render: (v) => (v.active ? <Badge tone="ok">{tr('In use')}</Badge> : <span className="mdm-sub">{tr('Earlier')}</span>) },
            { key: 'created_at', label: 'Created', render: (v) => fmtDate(v.created_at) },
            { key: 'created_by', label: 'By' },
            { key: 'note', label: 'Note', render: (v) => <span className="mdm-sub">{v.note || '—'}</span> },
          ]} />
      </Collapse>
      <Collapse id="aud" title={tr('Audit log')} summary={`${entries.toLocaleString('en-IN')} entries${chain ? (chain.ok ? ' · chain intact' : ' · chain broken') : ''} · filter by who, what and when`}>
        <Audit facets={facets} />
      </Collapse>
    </div>
  )
}
