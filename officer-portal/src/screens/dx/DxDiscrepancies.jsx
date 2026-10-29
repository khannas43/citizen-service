import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { Tag, DISC, PersonPicker, fmtTime } from './dxShared'
import { PageHeader, Stats, DataTable, Drawer, Facts, Banner } from './dxKit'

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
    <div className="dxk-stackform">
      <PersonPicker onPick={setPerson} label="Whose record" />
      {person && <Banner>Person: <strong>{person.name}</strong></Banner>}
      <div className="dxk-form">
        <label className="dxk-field"><span>Which value</span><select value={attr} onChange={(e) => setAttr(e.target.value)}>{Object.entries(ATTRS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="dxk-field"><span>Shown now</span><input value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="dxk-field"><span>Should be</span><input value={rep} onChange={(e) => setRep(e.target.value)} /></label>
        <label className="dxk-field wide"><span>Why (optional)</span><input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        <label className="dxk-field"><span>Reported</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="OFFICER">By an officer</option><option value="ASSISTED">With an operator present</option></select></label>
        {channel === 'ASSISTED' && <label className="dxk-field"><span>Operator name</span><input value={op} onChange={(e) => setOp(e.target.value)} /></label>}
      </div>
      <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!person || !rep.trim()} onClick={send}>Send to the owning department</button></div>
      <hr className="dxk-rule" />
      <h3 className="dxk-h3">Married, but no register entry?</h3>
      <p className="dxk-help">Records the citizen's own statement. It is shown as unverified and is never treated as a marriage record.</p>
      <div className="dxk-form">
        <label className="dxk-field"><span>Spouse's name</span><input value={spouse} onChange={(e) => setSpouse(e.target.value)} /></label>
        <div><button type="button" className="btn-secondary" disabled={!person || !spouse.trim()} onClick={declare}>Record the declaration</button></div>
      </div>
      {msg && <Banner tone="ok">{msg}</Banner>}
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
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
    <div className="dxk-stackform">
      <div className="dxk-form">
        <label className="dxk-field wide"><span>The department says</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="CORRECTED_AT_SOURCE">It has corrected its record</option><option value="CONFIRMED_AS_IS">The record is right</option><option value="REJECTED">Cannot accept the report</option>
          </select></label>
        <label className="dxk-field wide"><span>What it said (recorded)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="dxk-actions"><button type="button" className="btn-primary" onClick={send}>Close this item</button></div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}

export default function DxDiscrepancies() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [raising, setRaising] = useState(!!params.get('person'))
  const [closing, setClosing] = useState(null)
  const limit = 15
  const { data, error, loading } = useMdm('/x/discrepancies', { status, q: q.trim(), limit, offset }, [status, q, offset, tick])
  const bump = () => { setClosing(null); setRaising(false); setTick((n) => n + 1) }
  const tone = { ROUTED: 'warn', CORRECTED_AT_SOURCE: 'ok', DECLARED: 'info' }
  return (
    <div className="mdm-hub">
      <PageHeader icon="⚠️" title="Discrepancies"
        subtitle="A wrong value is sent to the department that owns it. This system never overwrites it locally. When the department corrects its record, the other departments that hold this person are told."
        actions={<button type="button" className="btn-primary" onClick={() => setRaising(true)}>Report a wrong value</button>} />
      <Stats items={Object.keys(DISC).map((s) => ({ label: DISC[s][0], value: (data?.by_status?.[s] || 0).toLocaleString('en-IN'), tone: tone[s] || 'neutral', active: status === s, onClick: () => { setStatus(status === s ? '' : s); setOffset(0) } }))} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search person, value or MDM id' }}
          canClear={!!(status || q)} onClear={() => { setStatus(''); setQ(''); setOffset(0) }}
          empty="Nothing here"
          columns={[
            { key: 'person', label: 'Person', render: (d) => <button type="button" className="mdm-link strong" onClick={() => nav(`/mdm?tab=people&person=${d.person_id}`)}>{d.person_name}</button> },
            { key: 'attribute', label: 'Value', render: (d) => <>{ATTRS[d.attribute] || d.attribute}{d.kind === 'DECLARATION' ? ' (declaration)' : ''}</> },
            { key: 'change', label: 'Shown now → should be', render: (d) => <>{d.current_value || '—'} → <strong>{d.reported_value}</strong>{d.status === 'CORRECTED_AT_SOURCE' && d.informed?.length > 0 && <div className="dxk-muted">Told: {d.informed.join(', ')}</div>}</> },
            { key: 'authoritative_name', label: 'Owner' },
            { key: 'status', label: 'Status', render: (d) => <Tag map={DISC} value={d.status} /> },
            { key: 'raised_at', label: 'Raised', render: (d) => <span className="dxk-muted">{fmtTime(d.raised_at)}<div>{d.age_days} d · {d.raised_by}</div></span> },
            { key: 'go', label: '', render: (d) => (d.status === 'ROUTED' ? <button type="button" className="btn-secondary small" onClick={() => setClosing(d)}>Close…</button> : null) },
          ]} />
      )}
      <Drawer open={raising} onClose={() => setRaising(false)} title="Report a wrong value, or record a declaration" subtitle="The correction is made at the department that owns the value.">
        <Raise initial={params.get('person')} done={bump} />
      </Drawer>
      <Drawer open={!!closing} onClose={() => setClosing(null)} title="Close this item" subtitle={closing ? `${closing.person_name} · ${ATTRS[closing.attribute] || closing.attribute}` : ''}>
        {closing && <>
          <Facts items={[['Shown now', closing.current_value || '—'], ['Should be', closing.reported_value], ['Owner', closing.authoritative_name], ['Reason', closing.reason]]} />
          <hr className="dxk-rule" />
          <Resolve d={closing} done={bump} />
        </>}
      </Drawer>
    </div>
  )
}
