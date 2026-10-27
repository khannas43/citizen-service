import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Pager } from '../mdm/shared'
import { Tag, DISC, PersonPicker, fmtTime } from './dxShared'

const ATTRS = { name: 'Name', date_of_birth: 'Date of birth', gender: 'Gender', address: 'Address', income: 'Income', category: 'Social category', land: 'Land', electricity: 'Electricity connection', pension: 'Pension', housing: 'Housing' }

function Raise({ initial, done }) {
  const [person, setPerson] = useState(initial ? { id: Number(initial), name: `Person ${initial}` } : null)
  const [attr, setAttr] = useState('name')
  const [cur, setCur] = useState('')
  const [rep, setRep] = useState('')
  const [why, setWhy] = useState('')
  const [channel, setChannel] = useState('OFFICER')
  const [op, setOp] = useState('')
  const [spouse, setSpouse] = useState('')
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const send = async () => {
    setErr(null); setMsg(null)
    try {
      const r = await mdm('/x/discrepancies', { method: 'POST', body: { person_id: person.id, attribute: attr, current_value: cur || null, reported_value: rep, reason: why || null, channel, operator: op.trim() || null } })
      setMsg(r.note); done()
    } catch (e) { setErr(e.message) }
  }
  const declare = async () => {
    setErr(null); setMsg(null)
    try { const r = await mdm('/x/declarations', { method: 'POST', body: { person_id: person.id, spouse_name: spouse, channel, operator: op.trim() || null } }); setMsg(r.note); done() } catch (e) { setErr(e.message) }
  }
  return (
    <section className="mdm-card">
      <h3>Report a wrong value, or record a declaration</h3>
      <PersonPicker onPick={setPerson} label="Whose record" />
      {person && <p className="mdm-note">Person: <strong>{person.name}</strong></p>}
      <div className="mdm-filters">
        <label className="mdm-field"><span>Which value</span><select value={attr} onChange={(e) => setAttr(e.target.value)}>{Object.entries(ATTRS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="mdm-field grow"><span>Shown now</span><input value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="mdm-field grow"><span>Should be</span><input value={rep} onChange={(e) => setRep(e.target.value)} /></label>
      </div>
      <div className="mdm-filters">
        <label className="mdm-field grow"><span>Why (optional)</span><input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        <label className="mdm-field"><span>Reported</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="OFFICER">By an officer</option><option value="ASSISTED">With an operator present</option></select></label>
        {channel === 'ASSISTED' && <label className="mdm-field"><span>Operator name</span><input value={op} onChange={(e) => setOp(e.target.value)} /></label>}
      </div>
      <div className="mdm-actions"><button type="button" className="btn-primary small" disabled={!person || !rep.trim()} onClick={send}>Send to the owning department</button></div>
      <h4>Married, but no register entry?</h4>
      <p className="mdm-sub">Records the citizen's own statement. It is shown as unverified and is never treated as a marriage record.</p>
      <div className="mdm-filters">
        <label className="mdm-field grow"><span>Spouse's name</span><input value={spouse} onChange={(e) => setSpouse(e.target.value)} /></label>
        <button type="button" className="btn-secondary small" disabled={!person || !spouse.trim()} onClick={declare}>Record the declaration</button>
      </div>
      {msg && <p className="mdm-ok" role="status">{msg}</p>}
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </section>
  )
}

function Resolve({ d, done }) {
  const [outcome, setOutcome] = useState('CORRECTED_AT_SOURCE')
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const send = async () => {
    setErr(null)
    try { await mdm(`/x/discrepancies/${d.id}/resolve`, { method: 'POST', body: { outcome, note } }); done() } catch (e) { setErr(e.message) }
  }
  return (
    <div className="dx-decide">
      <div className="mdm-filters">
        <label className="mdm-field"><span>The department says</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="CORRECTED_AT_SOURCE">It has corrected its record</option><option value="CONFIRMED_AS_IS">The record is right</option><option value="REJECTED">Cannot accept the report</option>
          </select></label>
        <label className="mdm-field grow"><span>What it said (recorded)</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className="btn-primary small" onClick={send}>Close</button>
      </div>
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </div>
  )
}

export default function DxDiscrepancies() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(null)
  const limit = 20
  const { data, error, loading } = useMdm('/x/discrepancies', { status, limit, offset }, [status, offset, tick])
  const bump = () => { setOpen(null); setTick((n) => n + 1) }
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Discrepancies</h1>
      <p className="mdm-intro">A wrong value is sent to the department that owns it. This system never overwrites it locally. When the department corrects its record, the other departments that hold this person are told.</p>
      <Raise initial={params.get('person')} done={bump} />
      <div className="mdm-tiles" style={{ margin: '1rem 0' }}>
        {Object.keys(DISC).map((s) => (
          <button key={s} type="button" className="mdm-uc" aria-pressed={status === s} onClick={() => { setStatus(status === s ? '' : s); setOffset(0) }}>
            <span className="mdm-uc-id">{DISC[s][0]}</span><strong>{(data?.by_status?.[s] || 0).toLocaleString('en-IN')}</strong>
          </button>
        ))}
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush"><div className="mdm-table-wrap"><table className="mdm-table">
          <thead><tr><th>Person</th><th>Value</th><th>Shown now → should be</th><th>Owner</th><th>Status</th><th>Raised</th><th /></tr></thead>
          <tbody>
            {data.items.flatMap((d) => [
              <tr key={d.id}>
                <td><button type="button" className="mdm-link strong" onClick={() => nav(`/mdm?tab=people&person=${d.person_id}`)}>{d.person_name}</button></td>
                <td>{ATTRS[d.attribute] || d.attribute}{d.kind === 'DECLARATION' ? ' (declaration)' : ''}</td>
                <td>{d.current_value || '—'} → <strong>{d.reported_value}</strong></td><td>{d.authoritative_name}</td><td><Tag map={DISC} value={d.status} /></td>
                <td className="mdm-sub">{fmtTime(d.raised_at)}<div>{d.age_days} d · {d.raised_by}</div></td>
                <td>{d.status === 'ROUTED' && <button type="button" className="btn-secondary small" onClick={() => setOpen(open === d.id ? null : d.id)}>Close…</button>}</td>
              </tr>,
              open === d.id && <tr key={`${d.id}r`}><td colSpan={7}><Resolve d={d} done={bump} /></td></tr>,
              d.status === 'CORRECTED_AT_SOURCE' && d.informed?.length > 0 && <tr key={`${d.id}i`}><td colSpan={7} className="mdm-sub">Other departments told: {d.informed.join(', ')}. {d.resolution_note}</td></tr>,
            ])}
            {!data.items.length && <tr><td colSpan={7} className="mdm-empty">Nothing here.</td></tr>}
          </tbody>
        </table></div><Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} /></section>
      )}
    </div>
  )
}
