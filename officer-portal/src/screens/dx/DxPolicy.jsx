import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'

const TITLES = {
  min_marriage_age: 'Minimum age at marriage', adult_age: 'Adult age', consent_expiry_days: 'How long a consent lasts (days)',
  consent_response_days: 'Time to answer a consent request (days)', max_reminders: 'Most reminders per request', late_event_days: 'A birth is "late" after (days)',
  income_band_edges: 'Income bands (upper limits, rupees a year)', rationale_min_chars: 'Shortest reason an approver may give (characters)',
  rationale_required_kinds: 'Actions that need a reason',
}
const KIND_NAMES = {
  CONFIRM_DEATH: 'Confirm a death', MARK_DECEASED_PDS: 'Mark deceased on a ration card', STOP_PENSION: 'Stop a pension',
  CLOSE_SCHOLARSHIP: 'Close a scholarship', CONFIRM_MARRIAGE: 'Confirm a marriage', ADD_TO_RATION_CARD: 'Add a child to a ration card',
  NOTIFY_SPOUSE: 'Contact a spouse', NOTIFY_NOMINEE: 'Contact a nominee', FLAG_LAND_SUCCESSION: 'Flag land succession', FLAG_CONNECTION: 'Flag an electricity connection',
}

export const show = (key, v) => {
  if (key === 'min_marriage_age') return `Men ${v.M}, women ${v.F}`
  if (key === 'income_band_edges') return v.map((x) => `${x / 100000} lakh`).join(', ')
  if (key === 'rationale_required_kinds') return v.length ? v.map((k) => KIND_NAMES[k] || k).join(', ') : 'None'
  return String(v)
}

function Editor({ row, done }) {
  const v = row.value
  const [draft, setDraft] = useState(() => (row.key === 'min_marriage_age' ? { ...v } : row.key === 'income_band_edges' ? v.join(', ') : row.key === 'rationale_required_kinds' ? [...v] : String(v)))
  const [note, setNote] = useState('')
  const [impact, setImpact] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const value = () => {
    if (row.key === 'min_marriage_age') return { M: Number(draft.M), F: Number(draft.F) }
    if (row.key === 'income_band_edges') return draft.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && x > 0)
    if (row.key === 'rationale_required_kinds') return draft
    return Number(draft)
  }
  const preview = async () => {
    setErr(null); setImpact(null)
    try { setImpact(await mdm('/x/policy/preview', { method: 'POST', body: { key: row.key, value: value() } })) } catch (e) { setErr(e.message) }
  }
  const apply = async () => {
    setBusy(true); setErr(null)
    try { await mdm('/x/policy', { method: 'POST', body: { key: row.key, value: value(), note: note.trim() || null } }); done() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div>
      {row.key === 'min_marriage_age' && (
        <div className="mdm-filters">
          <label className="mdm-field"><span>Men</span><input inputMode="numeric" value={draft.M} onChange={(e) => setDraft({ ...draft, M: e.target.value })} /></label>
          <label className="mdm-field"><span>Women</span><input inputMode="numeric" value={draft.F} onChange={(e) => setDraft({ ...draft, F: e.target.value })} /></label>
        </div>
      )}
      {row.key === 'income_band_edges' && <label className="mdm-field"><span>Limits, separated by commas</span><input value={draft} onChange={(e) => setDraft(e.target.value)} /></label>}
      {row.key === 'rationale_required_kinds' && (
        <div className="mdm-filters" role="group" aria-label="Actions that need a reason">
          {Object.entries(KIND_NAMES).map(([k, n]) => (
            <label key={k} className="mdm-check"><input type="checkbox" checked={draft.includes(k)} onChange={() => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))} /> {n}</label>
          ))}
        </div>
      )}
      {!['min_marriage_age', 'income_band_edges', 'rationale_required_kinds'].includes(row.key) && (
        <label className="mdm-field"><span>New value</span><input inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      )}
      <div className="mdm-actions">
        <button type="button" className="btn-secondary small" onClick={preview}>Show what it would change</button>
      </div>
      {impact && (
        <div className="dx-banner" role="status">
          <strong>Before you apply:</strong>
          <ul className="mdm-plain">{impact.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <div className="mdm-actions">
            <input className="mdm-note-input" placeholder="Why is this changing? (recorded)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Reason for the change" />
            <button type="button" className="btn-primary small" disabled={busy} onClick={apply}>Apply the change</button>
          </div>
        </div>
      )}
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </div>
  )
}

function History({ keyName }) {
  const { data, error, loading } = useMdm(`/x/policy/${keyName}/history`, undefined, [keyName])
  if (!data) return <Status loading={loading} error={error} />
  return (
    <table className="mdm-table tight">
      <thead><tr><th>Version</th><th>Value</th><th>Changed by</th><th>When</th><th>Why</th></tr></thead>
      <tbody>{data.map((h) => <tr key={h.version}><td>{h.version}{h.active && <> <Badge tone="ok">in force</Badge></>}</td><td>{show(keyName, h.value)}</td><td>{h.changed_by}</td><td className="mdm-sub">{fmtTime(h.changed_at)}</td><td className="mdm-sub">{h.note}</td></tr>)}</tbody>
    </table>
  )
}

export default function DxPolicy() {
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState(null)
  const [hist, setHist] = useState(null)
  const { data, error, loading } = useMdm('/x/policy', undefined, [tick])
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Policy</h1>
      <p className="mdm-intro">The rules that decide what is allowed: ages, how long consent lasts, which actions need a reason. A change takes effect at once for new requests. Work already started keeps the version it began under, and every version is kept.</p>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>Rule</th><th>Value now</th><th>Version</th><th>Last changed</th><th /></tr></thead>
              <tbody>
                {data.policies.map((p) => (
                  <tr key={p.key} className={`dx-policy-row${editing === p.key ? ' editing' : ''}`}>
                    <td><strong>{TITLES[p.key] || p.key}</strong><div className="mdm-sub">{p.description}</div>
                      {editing === p.key && <Editor row={p} done={() => { setEditing(null); setTick((n) => n + 1) }} />}
                      {hist === p.key && <History keyName={p.key} />}
                    </td>
                    <td>{show(p.key, p.value)}</td>
                    <td className="num">{p.version}</td>
                    <td className="mdm-sub">{p.changed_by}<br />{fmtTime(p.changed_at)}</td>
                    <td>
                      <div className="mdm-actions">
                        <button type="button" className="btn-secondary small" onClick={() => setEditing(editing === p.key ? null : p.key)}>{editing === p.key ? 'Cancel' : 'Change'}</button>
                        {p.versions > 1 && <button type="button" className="mdm-link" onClick={() => setHist(hist === p.key ? null : p.key)}>History ({p.versions})</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
