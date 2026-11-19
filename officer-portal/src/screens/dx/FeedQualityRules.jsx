import { useEffect, useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Collapse, Banner, Facts } from './dxKit'
import { fmtTime } from './dxShared'
import { tr, tObj } from '../../i18n/lang'

const toDraft = (s) => ({ name_share: Math.round(s.name_share * 1000) / 10, name_min: s.name_min, name_max: s.name_max, min_birth_year: s.min_birth_year, max_age: s.max_age,
  completeness_on: s.completeness_share !== null, completeness_share: s.completeness_share !== null ? Math.round(s.completeness_share * 1000) / 10 : 99,
  freshness_on: s.freshness_days !== null, freshness_days: s.freshness_days ?? 30, advisory_off: s.advisory_off || [] })
const toSettings = (d) => ({ name_share: +d.name_share / 100, name_min: +d.name_min, name_max: +d.name_max, min_birth_year: +d.min_birth_year, max_age: +d.max_age,
  completeness_share: d.completeness_on ? +d.completeness_share / 100 : null, freshness_days: d.freshness_on ? +d.freshness_days : null, advisory_off: d.advisory_off })
const LABELS = tObj({ name_share: 'Records that must have a name', name_min: 'Shortest name', name_max: 'Longest name', min_birth_year: 'Oldest birth year', max_age: 'Highest age',
  completeness_share: 'Fields filled in', freshness_days: 'Latest record no older than' })
const show = (k, v) => (v === null || v === undefined ? 'each feed’s own' : k === 'name_share' || k === 'completeness_share' ? `${Math.round(v * 1000) / 10}%` : k === 'freshness_days' ? `${v} days` : Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : String(v))

export default function FeedQualityRules({ onSaved }) {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/quality/rules', {}, [tick])
  const [d, setD] = useState(null)
  const [reason, setReason] = useState('')
  const [prev, setPrev] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  useEffect(() => { if (data?.active) setD(toDraft(data.active.settings)) }, [data])
  const set = (k) => (e) => { setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setPrev(null) }
  const toggleGroup = (g) => { setD({ ...d, advisory_off: d.advisory_off.includes(g) ? d.advisory_off.filter((x) => x !== g) : [...d.advisory_off, g] }); setPrev(null) }

  const act = async (kind) => {
    setBusy(kind); setMsg(null)
    try {
      if (kind === 'preview') setPrev(await mdm('/x/quality/rules/preview', { method: 'POST', body: { settings: toSettings(d), reason } }))
      else {
        const r = await mdm('/x/quality/rules', { method: 'POST', body: { settings: toSettings(d), reason } })
        setMsg({ tone: 'info', text: tr('Saved as version {v}. It applies from the next run; results already recorded are not changed.', { v: r.version }) })
        setReason(''); setPrev(null); setTick((x) => x + 1); onSaved?.()
      }
    } catch (e) { setMsg({ tone: 'warn', text: e.message }) }
    setBusy('')
  }
  const a = data?.active
  const dirty = a && d && JSON.stringify(toSettings(d)) !== JSON.stringify(a.settings)
  const num = (k, props = {}) => <input type="number" value={d[k]} onChange={set(k)} aria-label={LABELS[k] || k} {...props} />

  return (
    <Collapse id="fq-rules" title={tr('Rule settings')} summary={a ? `One set for every feed · version ${a.version} · ${a.version ? `set by ${a.actor}, ${fmtTime(a.created_at)}` : 'built-in defaults'}` : 'One set for every feed'}>
      <Status loading={loading && !data} error={error} />
      {a && d && (
        <>
          <p className="mdm-note">{tr('These settings apply to every feed. A change is saved as a new numbered version with your name and reason, shown in the audit log, and applies from the next run. Results already recorded keep the version they were checked with. Record keys, key formats and the “must hold” checks themselves belong to each department and cannot be switched off here.')}</p>
          <div className="fq-rules-grid">
            <fieldset><legend>{tr('Names (must hold)')}</legend>
              <label>{tr('Records that must have a name (%) {v}', { v: num('name_share', { min: 50, max: 100, step: 0.5 }) })}</label>
              <label>{tr('Shortest name (characters) {v}', { v: num('name_min', { min: 1, max: 10 }) })}</label>
              <label>{tr('Longest name (characters) {v}', { v: num('name_max', { min: 20, max: 200 }) })}</label>
            </fieldset>
            <fieldset><legend>{tr('Dates and ages (must hold)')}</legend>
              <label>{tr('Oldest birth year accepted {v}', { v: num('min_birth_year', { min: 1850, max: 1990 }) })}</label>
              <label>{tr('Highest age accepted {v}', { v: num('max_age', { min: 90, max: 130 }) })}</label>
            </fieldset>
            <fieldset><legend>{tr('Completeness and freshness (worth chasing)')}</legend>
              <label className="chk"><input type="checkbox" checked={d.completeness_on} onChange={set('completeness_on')} /> {tr('Use one share for every feed instead of each feed’s own')}</label>
              {d.completeness_on && <label>{tr('Fields filled in (%) {v}', { v: num('completeness_share', { min: 50, max: 100, step: 0.5 }) })}</label>}
              <label className="chk"><input type="checkbox" checked={d.freshness_on} onChange={set('freshness_on')} /> {tr('Use one freshness window for every feed instead of each feed’s own')}</label>
              {d.freshness_on && <label>{tr('Latest record no older than (days) {v}', { v: num('freshness_days', { min: 1, max: 365 }) })}</label>}
            </fieldset>
            <fieldset><legend>{tr('Worth-chasing checks switched on')}</legend>
              {Object.entries(data.advisory_groups).map(([g, l]) => <label key={g} className="chk"><input type="checkbox" checked={!d.advisory_off.includes(g)} onChange={() => toggleGroup(g)} /> {l}</label>)}
            </fieldset>
          </div>
          <label className="fq-reason">{tr('Reason for the change (kept with the version)')}
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('For example: the pension scheme includes members above 100')} /></label>
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
          <div className="fq-rules-actions">
            <button type="button" className="btn-secondary" disabled={!dirty || !!busy} onClick={() => act('preview')}>{busy === 'preview' ? 'Working out the effect…' : 'Preview the effect'}</button>
            <button type="button" className="btn-primary" disabled={!dirty || !!busy || reason.trim().length < 8} onClick={() => act('save')}>{busy === 'save' ? 'Saving…' : 'Save as new version'}</button>
            <button type="button" className="btn-secondary" disabled={!dirty || !!busy} onClick={() => { setD(toDraft(a.settings)); setPrev(null); setMsg(null) }}>{tr('Discard changes')}</button>
          </div>
          {prev && (
            <div className="fq-preview">
              <h3 className="dxk-h3">{tr('Effect on today’s data (nothing is saved yet)')}</h3>
              <Facts items={Object.entries(prev.changes).map(([k, v]) => [LABELS[k] || k, `${show(k, v.from)} → ${show(k, v.to)}`])} />
              <p className="mdm-note">{prev.feeds_changed ? `${prev.feeds_changed} feed${prev.feeds_changed > 1 ? 's' : ''} would change status.` : 'No feed would change status.'} {prev.rules_changed.length ? `${prev.rules_changed.length} check${prev.rules_changed.length > 1 ? 's' : ''} would change result:` : 'No check would change result.'}</p>
              {prev.rules_changed.length > 0 && (
                <ul className="fq-changes">{prev.rules_changed.slice(0, 12).map((r) => <li key={r.source + r.rule_key}><strong>{r.feed}</strong> · {r.description}: <Badge tone={r.after === 'failed' ? 'bad' : r.after === 'passed' ? 'ok' : 'neutral'}>{r.before || 'not run'} → {r.after || 'switched off'}</Badge></li>)}</ul>
              )}
            </div>
          )}
          <h3 className="dxk-h3">{tr('Versions')}</h3>
          <table className="mdm-table"><thead><tr><th>{tr('Version')}</th><th>{tr('When')}</th><th>{tr('Set by')}</th><th>{tr('Reason')}</th></tr></thead>
            <tbody>{data.history.map((h) => <tr key={h.version}><td>{h.version}{h.version === a.version && <> <Badge tone="ok">{tr('In use')}</Badge></>}</td><td>{fmtTime(h.created_at)}</td><td>{h.actor}</td><td>{h.reason}</td></tr>)}</tbody></table>
        </>
      )}
    </Collapse>
  )
}
