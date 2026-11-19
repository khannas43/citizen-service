import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { Badge } from '../mdm/shared'
import { Banner } from './dxKit'
import { fmtTime } from './dxShared'
import { tr } from '../../i18n/lang'

export const NOTICE_STATE = {
  WAITING: ['Waiting for the department', 'warn'], OVERDUE: ['Overdue', 'bad'], ACCEPTED: ['Accepted by the department', 'ok'], APPLIED: ['Applied by the department', 'ok'],
  ACKNOWLEDGED: ['Acknowledged by the department', 'ok'], REJECTED: ['Rejected by the department, sent back', 'bad'],
}
export const EVENT_LABEL = { BIRTH_REGISTERED: 'Birth registered', BIRTH_AMENDED: 'Birth amended', BIRTH_WITHDRAWN: 'Birth withdrawn', DEATH_REGISTERED: 'Death registered', MARRIAGE_REGISTERED: 'Marriage registered' }
export const ROUTE = { FEED: 'by feed', FILE: 'by file', PORTAL: 'in the portal', SIMULATED: 'simulated' }
export const OUTCOME_TEXT = { ACCEPTED: 'Accept', APPLIED: 'Applied in our system', REJECTED: 'Reject', ACKNOWLEDGED: 'Acknowledge' }

export function NoticeBadge({ state }) {
  const [t, tone] = NOTICE_STATE[state] || [state, 'neutral']
  return <Badge tone={tone}>{t}</Badge>
}

/** What a department did with a notice, in one line. */
export function answerText(n) {
  if (!n.outcome) return n.state === 'OVERDUE' ? tr('No answer yet, past the deadline') : tr('No answer yet')
  const bits = [NOTICE_STATE[n.outcome]?.[0] || n.outcome]
  if (n.department_ref) bits.push(tr('their ref {ref}', { ref: n.department_ref }))
  if (n.route) bits.push(ROUTE[n.route] || n.route.toLowerCase())
  return bits.join(' · ')
}

export const dueText = (n) => `${fmtTime(n.respond_by)}${n.rule_text ? ` (${tr('{rule} allowed', { rule: n.rule_text })})` : ''}`

/** A demo stand-in for the department's own system. It goes through the same rules as the real feed and says SIMULATED. */
export function SimulateAnswer({ notice, done }) {
  const options = notice.allowed_outcomes || []
  const [outcome, setOutcome] = useState(options[0])
  const [reason, setReason] = useState('')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true); setErr(null)
    try { done(await mdm(`/x/notices/${notice.id}/simulate`, { method: 'POST', body: { outcome, reason: reason.trim() || null, department_ref: ref.trim() || null } })) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div>
      <Banner tone="warn"><strong>{tr('Simulated.')}</strong> {tr('This stands in for {system_name}\'s own system, which is not connected in this build. It follows the same rules as a real answer by feed, and the record says it was simulated.', { system_name: notice.system_name })}</Banner>
      <div className="dxk-checks" role="radiogroup" aria-label={tr('The department\'s answer')} style={{ marginTop: '0.75rem' }}>
        {options.map((o) => (
          <label key={o} className="mdm-check"><input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} /> {OUTCOME_TEXT[o] || o}</label>
        ))}
      </div>
      {outcome === 'REJECTED' && (
        <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('Why is the department rejecting it? (required; it goes back to a person)')}</span>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} aria-label={tr('Reason for the rejection')} /></label>
      )}
      {outcome === 'APPLIED' && (
        <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('The department\'s own reference (left blank, a simulated one is made)')}</span>
          <input value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} aria-label={tr('The department\'s reference')} /></label>
      )}
      <div className="dxk-actions" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn-primary" disabled={busy || !outcome || (outcome === 'REJECTED' && reason.trim().length < 5)} onClick={send}>{tr('Record this answer')}</button>
      </div>
      {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
    </div>
  )
}
