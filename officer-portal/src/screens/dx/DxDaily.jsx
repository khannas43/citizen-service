import { useState } from 'react'
import { Link } from 'react-router-dom'
import { runDailyChecks } from '../../mdmApi'
import { useMdm } from '../mdm/shared'
import { Card, Banner } from './dxKit'
import { fmtTime } from './dxShared'
import { tr } from '../../i18n/lang'

function handoverLine(h) {
  const n = h?.persons || 0
  if (n <= 0) return tr('Nobody has turned 18 since the last check.')
  if (n === 1) return tr("1 person turned 18: their parent's permission ended and they were asked for their own.")
  return tr("{n} people turned 18: their parents' permission ended and they were asked for their own.", { n })
}

function summary(r) {
  if (!r) return null
  const s = r.sweep || {}
  const i = r.invitations || {}
  const c = r.certificate_reminders || {}
  return [
    tr('Consents lapsed: {n}', { n: (s.no_response || 0) + (s.term_ended || 0) }),
    handoverLine(r.handover),
    tr('Invited to apply: {n}', { n: i.invited || 0 }),
    tr('Certificate reminders sent: {n}', { n: c.sent || 0 }),
  ]
}

/** Admin only: run the daily checks now, and see when they last ran and what they did. Nobody is enrolled by this. */
export function DailyChecks() {
  const { data, error, reload } = useMdm('/x/jobs/last', undefined, [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const last = data?.ran ? data : null

  async function run() {
    setBusy(true); setMsg(null)
    try {
      const out = await runDailyChecks()
      setMsg({ ok: true, lines: summary(out) })
      reload()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={tr('Daily checks')} hint={tr('Lapses old requests, hands over at 18, invites people about to turn 18 and reminds about certificates that are ending. Run it again and it finds nothing new. Nobody is enrolled.')}
      actions={<button type="button" className="btn-primary small" disabled={busy} onClick={run}>{tr('Run daily checks now')}</button>}>
      {error && <Banner tone="bad">{error}</Banner>}
      {last ? (
        <div data-testid="daily-last">
          <p className="dxk-muted" style={{ margin: 0 }}>{tr('Last run {when} by {who}', { when: fmtTime(last.ran_at), who: last.actor || '—' })}</p>
          <ul style={{ margin: '6px 0 0' }}>{summary(last.result).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : (!error && data && <p className="dxk-muted" style={{ margin: 0 }}>{tr('The daily checks have not run yet.')}</p>)}
      {msg && (msg.ok
        ? <Banner tone="ok"><div>{tr('The daily checks ran.')}</div><ul style={{ margin: '4px 0 0' }}>{msg.lines.map((l) => <li key={l}>{l}</li>)}</ul></Banner>
        : <Banner tone="bad">{msg.text}</Banner>)}
    </Card>
  )
}

const OUTCOMES = [
  ['answered', 'ANSWERED', 'Answered'],
  ['no_consent', 'DENIED_NO_CONSENT', 'Not answered: no consent'],
  ['denied_policy', 'DENIED_POLICY', 'Not answered: policy'],
  ['expired', 'EXPIRED_SOURCE', 'Certificate expired'],
  ['conflict', 'CONFLICT', 'Sources disagree'],
  ['no_record', 'NO_RECORD', 'No record'],
]
const OPEN = [
  ['CERT_EXPIRED', 'Certificate expired'],
  ['CERT_CONFLICT', 'Certificates disagree'],
  ['OTHER_STATE', 'Lives in another state'],
]

/** Education row: scholarship eligibility checks by outcome over the last seven days. Counts only. Each number opens the clearing house on that outcome. */
export function EducationOutcomes({ days = 7 }) {
  const { data } = useMdm('/x/eligibility/outcomes', { days }, [days])
  if (!data?.by_outcome) return null
  const filt = (o) => `/dx/ledger?kind=VERIFY&outcome=${encodeURIComponent(o)}&q=${encodeURIComponent(data.purpose || 'SCHOLARSHIP_ELIGIBILITY')}`
  return (
    <Card flush>
      <div className="dxk-table-wrap">
        <table className="mdm-table dxk-table" aria-label={tr('Education: scholarship checks')}>
          <thead>
            <tr>
              <th>{tr('Education: scholarship checks')}</th>
              {OUTCOMES.map(([, , label]) => <th key={label} className="num">{tr(label)}</th>)}
              {OPEN.map(([, label]) => <th key={label} className="num">{tr('Open: {what}', { what: tr(label) })}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr data-testid="education-row">
              <td><span className="dxk-main">{tr('Last {n} days', { n: data.days || days })}</span></td>
              {OUTCOMES.map(([key, code]) => {
                const n = data.by_outcome[key] || 0
                return (
                  <td key={key} className="num">
                    {n ? <Link className="dxk-main" to={filt(code)} style={{ textDecoration: 'underline' }}>{n.toLocaleString('en-IN')}</Link> : <span className="dxk-muted">0</span>}
                  </td>
                )
              })}
              {OPEN.map(([code]) => {
                const n = data.open_items?.[code] || 0
                return (
                  <td key={code} className="num">
                    {n ? <Link className="dxk-main" to={`/dx/work/${code}`} style={{ textDecoration: 'underline' }}>{n.toLocaleString('en-IN')}</Link> : <span className="dxk-muted">0</span>}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="dxk-muted" style={{ margin: '8px 12px' }}>{tr('Counts only. No income or category is shown here.')}</p>
    </Card>
  )
}
