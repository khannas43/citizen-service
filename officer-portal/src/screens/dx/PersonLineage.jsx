import { useMemo, useState } from 'react'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtDate, linkLabel } from '../mdm/labels'
import { Card, Stats, DataTable, FilterSelect, Segmented, Drawer } from './dxKit'
import { fmtTime } from './dxShared'
import './dxLineage.css'
import { tr, tObj } from '../../i18n/lang'

const ATTR = tObj({ name: 'Name', dob: 'Date of birth', birth_year: 'Year of birth', gender: 'Gender', address: 'Address', date_of_death: 'Date of death', district: 'District' })
const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))

/** One line saying what a history entry did, e.g. "Linked by dept.admin". */
export function changeText(h) {
  const who = h.actor || 'a steward'
  switch (h.event) {
    case 'RECORDED':
      if (h.to_status === 'IN_REVIEW') return 'Received, waiting for a steward'
      if (h.to_status === 'STEWARD_LINKED') return tr('Linked by {who}', { who })
      if (h.to_status === 'STEWARD_SEPARATE') return tr('Kept as a separate person by {who}', { who })
      if (h.to_status === 'ANCHOR' || h.to_status === 'NEW') return 'Received, started a new person'
      return 'Received and linked automatically'
    case 'AUTO_LINKED': return 'Linked automatically'
    case 'SENT_TO_REVIEW': return 'Sent to a steward to decide'
    case 'STEWARD_LINKED': return tr('Linked by {who}', { who })
    case 'KEPT_SEPARATE': return tr('Kept as a separate person by {who}', { who })
    case 'UNLINKED': return tr('Unlinked by {who}', { who })
    case 'MOVED': return 'Moved to another person'
    default: return 'Match updated'
  }
}
const stewardEvent = (h) => ['STEWARD_LINKED', 'KEPT_SEPARATE', 'UNLINKED'].includes(h.event)
const moved = (h) => h.from_person && h.to_person && h.from_person !== h.to_person

/** Newest change of a record: what happened, who did it and when (full timestamp on hover). */
export function LastChange({ r }) {
  const h = r.last_change
  if (!h) return <span className="lin-meta">{tr('No history yet')}</span>
  return (
    <div className={`lin-last${stewardEvent(h) ? ' human' : ''}`} title={new Date(h.ts).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })}>
      <strong>{changeText(h)}</strong>
      <div className="lin-meta">{fmtTime(h.ts)}{(h.event === 'RECORDED' || h.event === 'AUTO_LINKED') && (h.load_id ?? r.load_id) ? ` · ${tr('load run {id}', { id: h.load_id ?? r.load_id })}` : ''}</div>
    </div>
  )
}

/** Right-hand drawer with the whole life of one record's link, oldest first. */
export function HistoryDrawer({ rec, onClose }) {
  const hist = rec?.history || []
  return (
    <Drawer open={!!rec} onClose={onClose} title={tr('Link history')} subtitle={rec ? `${rec.system || rec.source_name || rec.source} · ${rec.source_rid} · ${rec.name || ''}` : ''}>
      {rec && (
        <>
          <p className="mdm-note" style={{ marginTop: 0 }}>{tr('Every time this record was received, linked, separated or updated, oldest first. Times are shown in India time.')}</p>
          <ol className="lin-timeline">
            {hist.map((h, i) => (
              <li key={`${h.ts}-${i}`} className={`${stewardEvent(h) ? 'human' : ''}${i === hist.length - 1 ? ' latest' : ''}`}>
                <span className="lin-dot" aria-hidden="true" />
                <div className="lin-tl-head"><strong>{changeText(h)}</strong>{i === hist.length - 1 && <span className="lin-now">{tr('latest')}</span>}</div>
                <div className="lin-meta">{fmtTime(h.ts)}</div>
                <ul className="lin-tl-facts">
                  {moved(h) && <li>{tr('Moved from {v} to {v2}', { v: h.from_mdm_id || `person ${h.from_person}`, v2: h.to_mdm_id || `person ${h.to_person}` })}</li>}
                  {!moved(h) && h.to_mdm_id && <li>{tr('Person {to_mdm_id}', { to_mdm_id: h.to_mdm_id })}</li>}
                  {h.score != null && h.to_status === 'AUTO_LINKED' && <li>{tr('Match score {Math}%', { Math: Math.round(h.score * 100) })}</li>}
                  {h.load_id && (h.event === 'RECORDED' || h.event === 'AUTO_LINKED') && <li>{tr('Load run {load_id}', { load_id: h.load_id })}</li>}
                  {h.note && <li>{tr('Reason given: “{note}”', { note: h.note })}</li>}
                </ul>
              </li>
            ))}
            {!hist.length && <li><span className="lin-dot" aria-hidden="true" /><span className="lin-meta">{tr('No history was kept for this record.')}</span></li>}
          </ol>
        </>
      )}
    </Drawer>
  )
}

/** Where one person's master record came from: which system offered which value, which won and by which rule (field level),
 *  and every department record behind it with the load that brought it in (record level). */
export default function PersonLineage({ personId, compact }) {
  const { data, error, loading } = useMdm(`/x/lineage/person/${personId}`, {}, [personId])
  const [view, setView] = useState('fields')
  const [sys, setSys] = useState('')
  const [onlyConflicts, setOnlyConflicts] = useState(false)
  const [histRec, setHistRec] = useState(null)
  const records = useMemo(() => (data ? data.sources.flatMap((s) => s.records.map((r) => ({ ...r, system: s.name, freshness_hours: s.freshness_hours }))) : []), [data])
  const shown = useMemo(() => (sys ? records.filter((r) => r.system === sys) : records), [records, sys])
  if (loading || error) return <Status loading={loading && !data} error={error} />
  if (!data) return null
  const s = data.summary
  const fields = data.fields.filter((f) => !onlyConflicts || f.conflict || f.distinct_values > 1)
  return (
    <div>
      <Stats items={[
        { label: 'Systems holding this person', value: s.systems }, { label: 'Department records', value: s.records },
        { label: 'Spellings of the name', value: s.spellings, tone: s.spellings > 1 ? 'warn' : 'ok' },
        { label: 'Fields where systems disagree', value: s.conflicts, tone: s.conflicts ? 'warn' : 'ok' },
      ]} />
      <div style={{ margin: '0.25rem 0 0.75rem' }}>
        <Segmented label={tr('Level of detail')} value={view} onChange={setView}
          options={[{ value: 'fields', label: 'Field by field', count: data.fields.length }, { value: 'records', label: 'Record by record', count: records.length }]} />
      </div>

      {view === 'fields' && (
        <Card title={tr('Which system supplied each value')} hint={tr('Every system that holds the field is shown with the value it offered. The green one was chosen for the master record, by the rule named beside it.')}
          actions={<label className="dxk-check"><input type="checkbox" checked={onlyConflicts} onChange={(e) => setOnlyConflicts(e.target.checked)} /> {tr('Only where systems differ')}</label>} flush>
          <table className="mdm-table">
            <thead><tr><th>{tr('Field')}</th><th>{tr('Master record shows')}</th><th>{tr('Offered by')}</th>{!compact && <th>{tr('Why this one')}</th>}</tr></thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.attribute}>
                  <td><strong>{ATTR[f.attribute] || f.attribute}</strong>{f.conflict && <div><Badge tone="warn">{tr('Systems disagree')}</Badge></div>}</td>
                  <td>{show(f.value)}<div className="lin-meta">{f.chosen_source_name}</div></td>
                  <td>
                    <div className="lin-chips">
                      {f.offers.map((o) => (
                        <span key={o.source} className={`lin-chip ${o.chosen ? 'win' : o.agrees ? 'same' : 'diff'}`} title={o.chosen ? 'Chosen' : o.agrees ? 'Agrees with the chosen value' : 'Differs from the chosen value'}>
                          {o.source_name}: {show(o.value)}{o.chosen && <small>{tr('chosen')}</small>}
                        </span>
                      ))}
                    </div>
                  </td>
                  {!compact && <td className="lin-meta">{f.rule}</td>}
                </tr>
              ))}
              {!fields.length && <tr><td colSpan={4} className="mdm-note">{tr('No field has disagreeing values.')}</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {view === 'records' && (
        <DataTable rows={shown} rowKey="id" pageSize={10} csv={{ name: `lineage-person-${data.person.id}` }}
          search={{ placeholder: 'Search system, key or name', text: (r) => `${r.system} ${r.source_rid} ${r.name}` }}
          canClear={!!sys} onClear={() => setSys('')}
          filters={<FilterSelect label={tr('System')} value={sys} onChange={setSys} options={data.sources.map((x) => [x.name, x.name])} />}
          empty={tr('No department records')}
          columns={[
            { key: 'system', label: 'System', render: (r) => <><strong>{r.system}</strong><div className="lin-meta">{r.source_rid}</div></>, sort: (r) => r.system },
            { key: 'name', label: 'Name as held', render: (r) => show(r.name) },
            { key: 'dob', label: 'Born', render: (r) => (r.dob ? fmtDate(r.dob) : r.birth_year || '—'), sort: (r) => r.dob || r.birth_year },
            { key: 'link_status', label: 'How it was linked', render: (r) => <>{linkLabel(r.link_status)}{r.score != null && <div className="lin-meta">{tr('match {Math}%{v}', { Math: Math.round(r.score * 100), v: r.reason ? ` · ${r.reason}` : '' })}</div>}</> },
            { key: 'last_change', label: 'Last linked or updated', render: (r) => <LastChange r={r} />, sort: (r) => r.last_change?.ts || '' },
            { key: 'load_id', label: 'Loaded in', render: (r) => (r.load_id ? <>{tr('Run {load_id}', { load_id: r.load_id })}<div className="lin-meta">{tr('{v} · rules v{rule_version}', { v: fmtTime(r.loaded_at), rule_version: r.rule_version })}</div></> : '—'), sort: (r) => r.load_id },
            { key: 'history', label: '', render: (r) => <button type="button" className="btn-secondary small" onClick={() => setHistRec(r)} aria-label={`Link history of ${r.source_rid}`}>{tr('History ({v})', { v: r.history?.length || 0 })}</button> },
          ]} />
      )}
      <HistoryDrawer rec={histRec} onClose={() => setHistRec(null)} />
    </div>
  )
}
