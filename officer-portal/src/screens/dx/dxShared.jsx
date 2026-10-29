import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { Badge } from '../mdm/shared'
import { fmtDate } from '../mdm/labels'
import { OptionRow } from '../mdm/UseCases'
import '../mdm/mdm.css'
import './dx.css'

export const CONSENT = {
  PENDING: ['Waiting for an answer', 'warn'], GRANTED: ['Granted', 'ok'], REFUSED: ['Refused', 'neutral'],
  EXPIRED: ['Expired', 'neutral'], REVOKED: ['Withdrawn', 'bad'], ENDED: ['Ended', 'neutral'], NOT_REQUESTED: ['Not requested', 'neutral'],
}
export const DELIVERY = {
  DELIVERED: ['Sent', 'ok'], PENDING_CONSENT: ['Waiting for consent', 'warn'], BLOCKED_REFUSED: ['Not sent: refused', 'neutral'],
  BLOCKED_REVOKED: ['Stopped: consent withdrawn', 'bad'], BLOCKED_EXPIRED: ['Not sent: consent lapsed', 'neutral'],
  BLOCKED_NO_PARENT: ['Not sent: parent not identified', 'warn'], RETRYING: ['Retrying', 'warn'], DEAD_LETTER: ['Failed, kept for review', 'bad'],
}
export const OUTCOME = {
  ANSWERED: ['Answered', 'ok'], DENIED_NO_CONSENT: ['Not answered: no consent', 'warn'], DENIED_POLICY: ['Not answered: policy', 'warn'],
  NO_RECORD: ['No record', 'info'], CONFLICT: ['Sources disagree', 'bad'], EXPIRED_SOURCE: ['Certificate expired', 'warn'], ERROR: ['Error', 'bad'],
}
export const DISC = {
  ROUTED: ['Sent to the department', 'warn'], CORRECTED_AT_SOURCE: ['Corrected at the source', 'ok'], CONFIRMED_AS_IS: ['Department says it is right', 'neutral'],
  REJECTED: ['Not accepted', 'neutral'], DECLARED: ['Declared by the citizen (unverified)', 'info'],
}
export const CONNECTOR = { DRAFT: ['Draft', 'neutral'], TESTING: ['Tested, not live', 'info'], ACTIVE: ['Live', 'ok'], SUSPENDED: ['Suspended', 'bad'] }
export const PROPOSAL = { PROPOSED: ['Waiting for a decision', 'warn'], APPROVED: ['Approved', 'ok'], REJECTED: ['Rejected', 'neutral'], WITHDRAWN: ['Cancelled', 'neutral'] }

export function Tag({ map, value }) {
  const [text, tone] = map[value] || [value, 'neutral']
  return <Badge tone={tone}>{text}</Badge>
}

export const fmtTime = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Search people by name, ration card or MDM id and pick one. */
export function PersonPicker({ onPick, label = 'Find a person' }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const search = async (e) => {
    e?.preventDefault()
    setErr(null)
    try { setRows((await mdm('/persons', { params: { q: q.trim(), limit: 8 } })).items) } catch (x) { setErr(x.message) }
  }
  return (
    <div className="dx-picker">
      <form className="dxk-pickrow" onSubmit={search} role="search">
        <label className="dxk-field"><span>{label}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ration card or MDM id" /></label>
        <button type="submit" className="btn-secondary">Search</button>
      </form>
      {err && <p className="mdm-error" role="alert">{err}</p>}
      {rows && (rows.length ? (
        <ul className="dxk-picklist">
          {rows.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setRows(null) }}>
                <strong>{p.name}</strong>
                <span className="mdm-sub">{p.mdm_id} · born {p.dob || p.birth_year || 'unknown'} · {p.district}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mdm-note">Nobody found.</p>)}
    </div>
  )
}

/** Record a person's answer to a consent request, in the portal or with an operator present. */
export function ConsentAnswer({ consent, onDone }) {
  const all = consent.scope?.elements || []
  const [decision, setDecision] = useState('GRANT')
  const [els, setEls] = useState(all)
  const [channel, setChannel] = useState('PORTAL')
  const [operator, setOperator] = useState('')
  const [guardian, setGuardian] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const send = async () => {
    setBusy(true); setErr(null)
    try {
      await mdm(`/x/consents/${consent.id}/respond`, {
        method: 'POST',
        body: { decision, channel, operator: operator.trim() || null, note: note.trim() || null, elements: decision === 'GRANT' ? els : null, given_by_person_id: guardian ? Number(guardian) : null },
      })
      onDone()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const toggle = (e) => setEls((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))
  return (
    <fieldset className="mdm-opts dx-answer">
      <legend>Record the answer</legend>
      <div className="mdm-filters">
        <label className="mdm-check"><input type="radio" name={`d${consent.id}`} checked={decision === 'GRANT'} onChange={() => setDecision('GRANT')} /> Agrees</label>
        <label className="mdm-check"><input type="radio" name={`d${consent.id}`} checked={decision === 'REFUSE'} onChange={() => setDecision('REFUSE')} /> Declines</label>
        <label className="mdm-field"><span>Answered</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="PORTAL">By the citizen, in the portal</option><option value="ASSISTED">With an operator present</option>
          </select></label>
        {channel === 'ASSISTED' && <label className="mdm-field"><span>Operator name</span><input value={operator} onChange={(e) => setOperator(e.target.value)} /></label>}
        <label className="mdm-field"><span>Answering for a minor? Guardian's person number</span><input inputMode="numeric" value={guardian} onChange={(e) => setGuardian(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      {decision === 'GRANT' && all.length > 0 && (
        <div className="mdm-filters" role="group" aria-label="What the person agrees to share">
          <span className="mdm-sub">Agrees to share:</span>
          {all.map((e) => <label className="mdm-check" key={e}><input type="checkbox" checked={els.includes(e)} onChange={() => toggle(e)} /> {e.replace(/_/g, ' ')}</label>)}
        </div>
      )}
      <div className="mdm-actions">
        <input className="mdm-note-input" placeholder="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <button type="button" className="btn-primary small" disabled={busy || (decision === 'GRANT' && !els.length)} onClick={send}>Save answer</button>
      </div>
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </fieldset>
  )
}

/** One proposal that a person approves or rejects. Sensitive actions need a recorded reason. */
export function ApprovalCard({ p, minChars = 10, reload, openPerson, openCase }) {
  const [pick, setPick] = useState({ person_id: p.detail?.suggested || null, groom_id: p.detail?.suggested?.groom || null, bride_id: p.detail?.suggested?.bride || null })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const open = p.status === 'PROPOSED'
  const death = p.kind === 'CONFIRM_DEATH'
  const marriage = p.kind === 'CONFIRM_MARRIAGE'
  const needs = !!p.needs_rationale
  const reasonOk = !needs || note.trim().length >= minChars
  const waiting = p.gate && !['GRANTED', 'NOT_REQUESTED'].includes(p.gate.status)
  const ready = death ? !!pick.person_id : marriage ? !!(pick.groom_id && pick.bride_id) : true
  const send = async (decision) => {
    setBusy(true); setErr(null)
    try {
      await mdm(`/proposals/${p.id}/decision`, { method: 'POST', body: { decision, note: note.trim() || null, ...pick } })
      reload()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div className={`mdm-prop${p.parent_id ? ' child' : ''}`}>
      <div className="mdm-prop-head">
        <div><strong>{p.summary}</strong><div className="mdm-sub">{p.system}{p.person_name ? ` · ${p.person_name}` : ''}</div></div>
        <Tag map={PROPOSAL} value={p.status} />
      </div>
      {p.detail?.outside_state && <p className="mdm-note">Registered outside the state ({p.detail.place_of_death}). Check with that registrar before confirming.</p>}
      {p.detail?.urgent && <p className="mdm-note"><Badge tone="bad">Urgent</Badge> A payment is due on {p.detail.next_payment_on}. The stop applies from that cycle; a payment already in flight is left as it is.</p>}
      {p.gate && p.gate.status !== 'GRANTED' && (
        <p className={`dx-banner ${waiting ? 'warn' : ''}`} role="status">
          {p.gate.status === 'NOT_REQUESTED'
            ? 'No consent was requested for this older event, so it can be decided without one.'
            : `Waiting for consent from ${p.gate.who || 'the parent'}: "${p.gate.purpose_name}" is ${(CONSENT[p.gate.status]?.[0] || p.gate.status).toLowerCase()}. Approval is unavailable until it is granted.`}
          {p.gate.parties?.length > 0 && <ul className="mdm-plain">{p.gate.parties.map((x) => <li key={x.consent_id}>{x.name}: {(CONSENT[x.status]?.[0] || x.status).toLowerCase()}</li>)}</ul>}
          {waiting && openCase && <> <button type="button" className="mdm-link" onClick={() => openCase(p.event_id)}>Open the case to record the answer</button></>}
        </p>
      )}
      {open && death && (
        <fieldset className="mdm-opts">
          <legend>{p.detail?.ambiguous ? 'More than one person could match. Choose carefully, or reject if none is right.' : 'Who is this?'}</legend>
          {p.options.map((o) => <OptionRow key={o.person_id} o={o} name={`d${p.id}`} checked={pick.person_id === o.person_id} onPick={() => setPick({ ...pick, person_id: o.person_id })} />)}
        </fieldset>
      )}
      {open && marriage && ['groom', 'bride'].map((side) => (
        <fieldset className="mdm-opts" key={side}>
          <legend>{side === 'groom' ? 'The groom' : 'The bride'}</legend>
          {p.options[side].map((o) => <OptionRow key={o.person_id} o={o} name={`${side}${p.id}`} checked={pick[`${side}_id`] === o.person_id} onPick={() => setPick({ ...pick, [`${side}_id`]: o.person_id })} />)}
        </fieldset>
      ))}
      {!open && (
        <p className="mdm-sub">
          {PROPOSAL[p.status]?.[0] || p.status}{p.decided_by ? ` by ${p.decided_by}` : ''}{p.decided_at ? ` on ${fmtDate(p.decided_at)}` : ''}
          {p.rationale || p.note ? <> — reason recorded: “{p.rationale || p.note}”</> : null}
        </p>
      )}
      <div className="mdm-actions">
        {p.person_id && openPerson && <button type="button" className="mdm-link" onClick={() => openPerson(p.person_id)}>Open the person</button>}
        {openCase && p.event_id && <button type="button" className="mdm-link" onClick={() => openCase(p.event_id)}>Open the case</button>}
      </div>
      {open && (
        <div className="dx-decide">
          <label className="mdm-field grow">
            <span>{needs ? `Reason (required, at least ${minChars} characters)` : 'Note (optional)'}</span>
            <textarea rows={2} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
          </label>
          {needs && <span className="mdm-sub" aria-live="polite">{note.trim().length} / {minChars}</span>}
          <div className="mdm-actions">
            <button type="button" className="btn-primary small" disabled={busy || !ready || !reasonOk || waiting} onClick={() => send('APPROVE')}>
              {death ? 'Confirm this death' : marriage ? 'Confirm this marriage' : 'Approve'}
            </button>
            <button type="button" className="btn-secondary small" disabled={busy || !reasonOk} onClick={() => send('REJECT')}>{death || marriage ? 'None of these' : 'Reject'}</button>
          </div>
        </div>
      )}
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </div>
  )
}
