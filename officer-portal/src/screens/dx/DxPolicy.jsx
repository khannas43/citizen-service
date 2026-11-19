import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, DataTable, Drawer, Banner } from './dxKit'
import { tr, tObj } from '../../i18n/lang'

const TITLES = tObj({
  min_marriage_age: 'Minimum age at marriage', adult_age: 'Adult age', consent_expiry_days: 'How long a consent lasts (days)',
  consent_response_days: 'Time to answer a consent request (days)', max_reminders: 'Most reminders per request', late_event_days: 'A birth is "late" after (days)',
  income_band_edges: 'Income bands (upper limits, rupees a year)', rationale_min_chars: 'Shortest reason an approver may give (characters)',
  rationale_required_kinds: 'Actions that need a reason',
  parent_confirm_score: 'Parent confirm score on a birth',
  parent_confirm_requires_couple: 'Parent confirm requires a couple link',
})
const KIND_NAMES = tObj({
  CONFIRM_DEATH: 'Confirm a death', MARK_DECEASED_PDS: 'Mark deceased on a ration card', STOP_PENSION: 'Stop a pension',
  CLOSE_SCHOLARSHIP: 'Close a scholarship', CONFIRM_MARRIAGE: 'Confirm a marriage', ADD_TO_RATION_CARD: 'Add a child to a ration card',
  REVIEW_PARENTS: 'Confirm a parent match',
  NOTIFY_SPOUSE: 'Contact a spouse', NOTIFY_NOMINEE: 'Contact a nominee', FLAG_LAND_SUCCESSION: 'Flag land succession', FLAG_CONNECTION: 'Flag an electricity connection',
})

export const show = (key, v) => {
  if (key === 'min_marriage_age') return `Men ${v.M}, women ${v.F}`
  if (key === 'income_band_edges') return v.map((x) => `${x / 100000} lakh`).join(', ')
  if (key === 'rationale_required_kinds') return v.length ? v.map((k) => KIND_NAMES[k] || k).join(', ') : 'None'
  if (key === 'parent_confirm_requires_couple') return v ? tr('Yes') : tr('No')
  return String(v)
}

function Editor({ row, done }) {
  const v = row.value
  const [draft, setDraft] = useState(() => (
    row.key === 'min_marriage_age' ? { ...v }
      : row.key === 'income_band_edges' ? v.join(', ')
        : row.key === 'rationale_required_kinds' ? [...v]
          : row.key === 'parent_confirm_requires_couple' ? !!v
            : String(v)
  ))
  const [note, setNote] = useState('')
  const [impact, setImpact] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const value = () => {
    if (row.key === 'min_marriage_age') return { M: Number(draft.M), F: Number(draft.F) }
    if (row.key === 'income_band_edges') return draft.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && x > 0)
    if (row.key === 'rationale_required_kinds') return draft
    if (row.key === 'parent_confirm_requires_couple') return !!draft
    if (row.key === 'parent_confirm_score') return Number(draft)
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
        <div className="dxk-form">
          <label className="dxk-field"><span>{tr('Men')}</span><input inputMode="numeric" value={draft.M} onChange={(e) => setDraft({ ...draft, M: e.target.value })} /></label>
          <label className="dxk-field"><span>{tr('Women')}</span><input inputMode="numeric" value={draft.F} onChange={(e) => setDraft({ ...draft, F: e.target.value })} /></label>
        </div>
      )}
      {row.key === 'income_band_edges' && <label className="dxk-field"><span>{tr('Limits, separated by commas')}</span><input value={draft} onChange={(e) => setDraft(e.target.value)} /></label>}
      {row.key === 'rationale_required_kinds' && (
        <div className="dxk-checks" role="group" aria-label={tr('Actions that need a reason')}>
          {Object.entries(KIND_NAMES).map(([k, n]) => (
            <label key={k} className="mdm-check"><input type="checkbox" checked={draft.includes(k)} onChange={() => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]))} /> {n}</label>
          ))}
        </div>
      )}
      {row.key === 'parent_confirm_requires_couple' && (
        <label className="mdm-check"><input type="checkbox" checked={!!draft} onChange={(e) => setDraft(e.target.checked)} /> {tr('Require a couple link')}</label>
      )}
      {!['min_marriage_age', 'income_band_edges', 'rationale_required_kinds', 'parent_confirm_requires_couple'].includes(row.key) && (
        <label className="dxk-field"><span>{tr('New value')}</span><input inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
      )}
      <div className="dxk-actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="btn-secondary" onClick={preview}>{tr('Show what it would change')}</button>
      </div>
      {impact && (
        <div style={{ marginTop: '0.75rem' }}>
          <Banner tone="warn"><strong>{tr('Before you apply:')}</strong>
            <ul className="mdm-plain">{impact.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></Banner>
          <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('Why is this changing? (recorded)')}</span>
            <input placeholder={tr('Reason')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={tr('Reason for the change')} /></label>
          <div className="dxk-actions" style={{ marginTop: '0.75rem' }}><button type="button" className="btn-primary" disabled={busy} onClick={apply}>{tr('Apply the change')}</button></div>
        </div>
      )}
      {err && <div style={{ marginTop: "0.75rem" }}><Banner tone="bad">{err}</Banner></div>}
    </div>
  )
}

function History({ keyName }) {
  const { data, error, loading } = useMdm(`/x/policy/${keyName}/history`, undefined, [keyName])
  if (!data) return <Status loading={loading} error={error} />
  return (
    <DataTable rows={data} rowKey="version" dense pageSize={10} pageSizes={[10]}
      columns={[
        { key: 'version', label: 'Version', render: (h) => <>{h.version}{h.active && <> <Badge tone="ok">{tr('in force')}</Badge></>}</> },
        { key: 'value', label: 'Value', render: (h) => show(keyName, h.value), sort: false },
        { key: 'changed_by', label: 'Changed by' },
        { key: 'changed_at', label: 'When', render: (h) => <span className="mdm-sub">{fmtTime(h.changed_at)}</span> },
        { key: 'note', label: 'Why', render: (h) => <span className="mdm-sub">{h.note}</span> },
      ]} />
  )
}

export default function DxPolicy() {
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState(null)
  const [hist, setHist] = useState(null)
  const { data, error, loading } = useMdm('/x/policy', undefined, [tick])
  const ed = data?.policies.find((p) => p.key === editing)
  const hs = data?.policies.find((p) => p.key === hist)
  return (
    <div className="mdm-hub">
      <PageHeader icon="📏" title={tr('Policy')}
        subtitle={tr('The rules that decide what is allowed: ages, how long consent lasts, which actions need a reason. A change takes effect at once for new requests. Work already started keeps the version it began under, and every version is kept.')} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.policies} rowKey="key" search={{ placeholder: 'Search rules', text: (p) => `${TITLES[p.key] || p.key} ${p.description} ${show(p.key, p.value)}` }}
          csv={{ name: 'policy-rules' }} pageSize={20} pageSizes={[20]}
          columns={[
            { key: 'key', label: 'Rule', render: (p) => <><span className="dxk-main">{TITLES[p.key] || p.key}</span><div className="mdm-sub">{tr(p.description)}</div></>, csv: (p) => TITLES[p.key] || p.key },
            { key: 'value', label: 'Value now', render: (p) => show(p.key, p.value), csv: (p) => show(p.key, p.value), sort: false },
            { key: 'version', label: 'Version', align: 'num' },
            { key: 'changed_at', label: 'Last changed', render: (p) => <span className="mdm-sub">{p.changed_by}<br />{fmtTime(p.changed_at)}</span>, csv: (p) => p.changed_at },
            { key: 'go', label: '', render: (p) => (
              <div className="dxk-actions">
                <button type="button" className="btn-secondary small" onClick={() => setEditing(p.key)}>{tr('Change')}</button>
                {p.versions > 1 && <button type="button" className="mdm-link" onClick={() => setHist(p.key)}>{tr('History ({versions})', { versions: p.versions })}</button>}
              </div>) },
          ]} />
      )}
      <Drawer open={!!ed} onClose={() => setEditing(null)} title={ed ? (TITLES[ed.key] || ed.key) : ''} subtitle={ed?.description}>
        {ed && <Editor key={ed.key} row={ed} done={() => { setEditing(null); setTick((n) => n + 1) }} />}
      </Drawer>
      <Drawer open={!!hs} onClose={() => setHist(null)} title={hs ? `History: ${TITLES[hs.key] || hs.key}` : ''} wide>
        {hs && <History keyName={hs.key} />}
      </Drawer>
    </div>
  )
}
