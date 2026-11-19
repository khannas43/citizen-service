import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { Badge } from '../mdm/shared'
import { fmtDate } from '../mdm/labels'
import { OptionRow } from '../mdm/eventLabels'
import '../mdm/mdm.css'
import './dx.css'
import { tr } from '../../i18n/lang'

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
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Name, ration card or MDM id')} /></label>
        <button type="submit" className="btn-secondary">{tr('Search')}</button>
      </form>
      {err && <p className="mdm-error" role="alert">{err}</p>}
      {rows && (rows.length ? (
        <ul className="dxk-picklist">
          {rows.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setRows(null) }}>
                <strong>{p.name}</strong>
                <span className="mdm-sub">{tr('{mdm_id} · born {v} · {district}', { mdm_id: p.mdm_id, v: p.dob || p.birth_year || 'unknown', district: p.district })}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mdm-note">{tr('Nobody found.')}</p>)}
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
  const [byGuardian, setByGuardian] = useState(false)
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
      <legend>{tr('Record the answer')}</legend>
      <div className="mdm-filters">
        <label className="mdm-check"><input type="radio" name={`d${consent.id}`} checked={decision === 'GRANT'} onChange={() => setDecision('GRANT')} /> {tr('Agrees')}</label>
        <label className="mdm-check"><input type="radio" name={`d${consent.id}`} checked={decision === 'REFUSE'} onChange={() => setDecision('REFUSE')} /> {tr('Declines')}</label>
        <label className="mdm-field"><span>{tr('Answered')}</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="PORTAL">{tr('By the citizen, in the portal')}</option><option value="ASSISTED">{tr('With an operator present')}</option>
          </select></label>
        {channel === 'ASSISTED' && <label className="mdm-field"><span>{tr('Operator name')}</span><input value={operator} onChange={(e) => setOperator(e.target.value)} /></label>}
        <label className="mdm-check"><input type="checkbox" checked={byGuardian} onChange={(e) => { setByGuardian(e.target.checked); if (!e.target.checked) setGuardian('') }} /> {tr('A guardian is answering for a minor')}</label>
        {byGuardian && <label className="mdm-field"><span>{tr('Guardian\'s person number (digits only, as shown on their person page)')}</span><input inputMode="numeric" value={guardian} onChange={(e) => setGuardian(e.target.value.replace(/\D/g, ''))} aria-label={tr('Guardian\'s person number')} /></label>}
      </div>
      {decision === 'GRANT' && all.length > 0 && (
        <div className="mdm-filters" role="group" aria-label={tr('What the person agrees to share')}>
          <span className="mdm-sub">{tr('Agrees to share:')}</span>
          {all.map((e) => <label className="mdm-check" key={e}><input type="checkbox" checked={els.includes(e)} onChange={() => toggle(e)} /> {e.replace(/_/g, ' ')}</label>)}
        </div>
      )}
      <div className="mdm-actions">
        <input className="mdm-note-input" placeholder={tr('Note (optional): type here')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={tr('Note')} />
        <button type="button" className="btn-primary small" disabled={busy || (decision === 'GRANT' && !els.length)} onClick={send}>{tr('Save answer')}</button>
      </div>
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </fieldset>
  )
}

/** One proposal that a person approves or rejects. Sensitive actions need a recorded reason. */
export function ApprovalCard({ p, minChars = 10, reload, openPerson, openCase, openConsent }) {
  const [pick, setPick] = useState({ person_id: p.detail?.suggested || null, groom_id: p.detail?.suggested?.groom || null, bride_id: p.detail?.suggested?.bride || null })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const open = p.status === 'PROPOSED'
  const death = p.kind === 'CONFIRM_DEATH'
  const marriage = p.kind === 'CONFIRM_MARRIAGE'
  const needs = !!p.needs_rationale
  const reasonOk = !needs || note.trim().length >= minChars
  const held = p.gate?.held
  const waiting = !!(p.gate && !['GRANTED', 'NOT_REQUESTED'].includes(p.gate.status)) || !!held
  const ready = death ? !!pick.person_id : marriage ? !!(pick.groom_id && pick.bride_id) : true
  const whyNot = busy ? null
    : held ? held
    : waiting ? `Approval is unavailable until ${p.gate.who || 'the parent'} grants the consent “${p.gate.purpose_name}”. You can still reject.`
    : !ready ? (death ? 'Choose who this is, or use “None of these”.' : 'Choose the groom and the bride, or use “None of these”.')
    : !reasonOk ? `Write a reason of at least ${minChars} characters; it is kept with your name.` : null
  const send = async (decision) => {
    setBusy(true); setErr(null)
    try {
      await mdm(`/proposals/${p.id}/decision`, { method: 'POST', body: { decision, note: note.trim() || null, ...pick } })
      const who = p.person_name ? ` for ${p.person_name}` : ''
      reload(decision === 'APPROVE'
        ? { ok: true, text: `Approved: ${p.summary}${who}.${p.dept?.department ? ` ${p.dept.department} now has a notice to answer.` : ''}` }
        : { ok: true, text: `${death || marriage ? 'Not confirmed' : 'Rejected'}: ${p.summary}${who}. Your reason is on record.` })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div className={`mdm-prop${p.parent_id ? ' child' : ''}`}>
      <div className="mdm-prop-head">
        <div><strong>{p.summary}</strong><div className="mdm-sub">{p.system}{p.person_name ? ` · ${p.person_name}` : ''}</div></div>
        <Tag map={PROPOSAL} value={p.status} />
      </div>
      {p.dept_return && (
        <p className="dx-banner warn" role="status"><strong>{tr('Sent back by {department}.', { department: p.dept_return.department })}</strong> {tr('Their reason: "{reason}". Decide again, or contact the department. Nothing has been changed in their system.', { reason: p.dept_return.reason })}</p>
      )}
      {p.dept?.department && (
        <p className="mdm-note">
          {p.status === 'PROPOSED'
            ? <>{tr('After approval, {department} receives a notice and has {respond_within} to answer{v}.', { department: p.dept.department, respond_within: p.dept.respond_within, v: p.dept.statutory ? '. It acknowledges a statutory notice and cannot reject it' : '' })} </>
            : p.dept.notice
              ? <>{p.dept.department}: {p.dept.notice.outcome ? p.dept.notice.outcome.toLowerCase() : p.dept.notice.state === 'OVERDUE' ? 'no answer, past the deadline' : 'waiting for its answer'}{p.dept.notice.department_ref ? ` (their ref ${p.dept.notice.department_ref})` : ''}. </>
              : null}
        </p>
      )}
      {open && p.kind === 'REVIEW_DEPARTMENT_REJECTION' && (
        <p className="mdm-note"><strong>{tr('Approve')}</strong> {tr('sends the notice to {v} again, and it has the full time to answer.', { v: p.detail?.department || 'the department' })} <strong>{tr('Reject')}</strong> {tr('accepts the department\'s decision, and nothing is sent again. The earlier rejection stays on record either way.')}</p>
      )}
      {p.dept?.consent_notice && (() => {
        const n = p.dept.consent_notice
        const said = n.outcome ? n.outcome.toLowerCase() : n.state === 'OVERDUE' ? 'has not answered, past the deadline' : 'has not answered yet'
        return (
          <p className={`dx-banner ${n.outcome === 'REJECTED' ? 'warn' : ''}`} role="status">
            <strong>{n.department}</strong> {n.outcome ? `answered: ${said}` : said}{n.reason ? ` ("${n.reason}")` : ''}{n.department_ref ? ` (their ref ${n.department_ref})` : ''}.
            {n.outcome === 'REJECTED' ? ' It is back with a person for review; approving here did not change their system.' : n.revision > 1 ? ' This notice was sent again.' : ''}
          </p>
        )
      })()}
      {p.detail?.outside_state && <p className="mdm-note">{tr('Registered outside the state ({place_of_death}). Check with that registrar before confirming.', { place_of_death: p.detail.place_of_death })}</p>}
      {p.detail?.urgent && <p className="mdm-note"><Badge tone="bad">{tr('Urgent')}</Badge> {tr('A payment is due on {next_payment_on}. The stop applies from that cycle; a payment already in flight is left as it is.', { next_payment_on: p.detail.next_payment_on })}</p>}
      {held && <p className="dx-banner warn" role="status">{held}</p>}
      {p.gate && !held && p.gate.status !== 'GRANTED' && (
        <p className={`dx-banner ${waiting ? 'warn' : ''}`} role="status">
          {p.gate.status === 'NOT_REQUESTED'
            ? 'No consent was requested for this older event, so it can be decided without one.'
            : `Waiting for consent from ${p.gate.who || 'the parent'}: "${p.gate.purpose_name}" is ${(CONSENT[p.gate.status]?.[0] || p.gate.status).toLowerCase()}. Approval is unavailable until it is granted.`}
          {p.gate.parties?.length > 0 && <ul className="mdm-plain">{p.gate.parties.map((x) => <li key={x.consent_id}>{x.name}: {(CONSENT[x.status]?.[0] || x.status).toLowerCase()}</li>)}</ul>}
          {waiting && openCase && <> <button type="button" className="mdm-link" onClick={() => openCase(p.event_id)}>{tr('Open the case to record the answer')}</button></>}
          {waiting && openConsent && p.gate.consent_id && <> <button type="button" className="mdm-link" onClick={() => openConsent(p.gate.consent_id)}>{tr('Open this consent request')}</button></>}
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
          {PROPOSAL[p.status]?.[0] || p.status}{p.decided_by ? ` by ${p.decided_by} (our officer)` : ''}{p.decided_at ? ` on ${fmtDate(p.decided_at)}` : ''}
          {p.rationale || p.note ? <> {tr('— reason recorded: “{v}”', { v: p.rationale || p.note })}</> : null}
          {p.dept?.consent_notice && <> · {p.dept.consent_notice.department}: {p.dept.consent_notice.outcome ? `${p.dept.consent_notice.outcome.toLowerCase()} by the department` : 'no answer yet'}</>}
        </p>
      )}
      <div className="mdm-actions">
        {p.person_id && openPerson && <button type="button" className="mdm-link" onClick={() => openPerson(p.person_id)}>{tr('Open the person')}</button>}
        {openCase && p.event_id && <button type="button" className="mdm-link" onClick={() => openCase(p.event_id)}>{tr('Open the case')}</button>}
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
          {whyNot && <p className="mdm-sub" role="status" data-testid="why-not">{whyNot}</p>}
        </div>
      )}
      {err && <p className="mdm-error" role="alert">{err}</p>}
    </div>
  )
}
