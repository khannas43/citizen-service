import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  answerConsentApproval, answerEventApproval, answerRequestApproval, fetchApproval, withdrawConsent,
} from '../approvalsApi'
import { detailLines, fieldLabel, fmtDate, fmtDateTime } from '../approvalsFormat'

function sexLabel(t, sex) {
  const s = (sex || '').toUpperCase()
  if (s === 'F') return t('approvals.sexFemale')
  if (s === 'M') return t('approvals.sexMale')
  if (s === 'O') return t('approvals.sexOther')
  if (s === 'T') return t('approvals.sexTransgender')
  if (s === 'N') return t('approvals.sexNotDisclosed')
  return sex || '—'
}

function ConsentForm({ detail, onDone, onConflict }) {
  const { t, i18n } = useTranslation()
  const child = detail.child?.name || t('approvals.aChild')
  const [share, setShare] = useState(() => Object.fromEntries((detail.lines || []).map((l) => [l.consent_id, true])))
  const [relationship, setRelationship] = useState('')
  const [declared, setDeclared] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dialogRef = useRef(null)
  const approveBtnRef = useRef(null)
  const titleId = useId()

  const selected = (detail.lines || []).filter((l) => share[l.consent_id])
  const canApprove = relationship && declared && !busy && selected.length > 0

  useEffect(() => {
    if (!confirming) return undefined
    const root = dialogRef.current
    if (!root) return undefined
    const previous = document.activeElement
    const focusables = () => [...root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    root.focus()
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirming(false)
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const back = approveBtnRef.current || previous
      if (back && typeof back.focus === 'function') back.focus()
    }
  }, [confirming])

  async function send(allRefuse) {
    setBusy(true); setErr('')
    const answers = (detail.lines || []).map((l) => ({
      consent_id: l.consent_id,
      decision: allRefuse || !share[l.consent_id] ? 'REFUSE' : 'GRANT',
    }))
    try {
      const out = await answerEventApproval(detail.event_id, {
        relationship: allRefuse ? null : relationship,
        declared: allRefuse ? false : declared,
        answers,
      })
      onDone(out)
    } catch (e) {
      if (e.status === 409) onConflict(e.detail || t('approvals.alreadyAnswered'))
      else setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false); setConfirming(false)
    }
  }

  if (!detail.can_answer) {
    return (
      <div className="consent-card">
        <p>{t('approvals.readOnly', {
          name: detail.answered_by || t('approvals.anotherParent'),
          date: fmtDate(detail.answered_at, i18n.language),
        })}</p>
      </div>
    )
  }

  return (
    <div>
      <p className="muted">{t('approvals.nothingShared')}</p>
      {(detail.lines || []).map((l) => {
        const dept = t(`requests.dept.${l.department}`, { defaultValue: l.department_name })
        const purpose = t(`requests.purposeName.${l.purpose}`, { defaultValue: l.purpose_name })
        return (
          <div key={l.consent_id} className="consent-card">
            <div className="consent-card-header">
              <strong>{dept}</strong>
            </div>
            <p>{purpose}</p>
            <ul>
              {(l.elements || []).map((e) => (
                <li key={e}>{t(`requests.element.${e}`, { defaultValue: e.replace(/_/g, ' ') })}</li>
              ))}
            </ul>
            <label>
              <input
                type="checkbox"
                checked={!!share[l.consent_id]}
                onChange={(ev) => setShare((s) => ({ ...s, [l.consent_id]: ev.target.checked }))}
              />
              {' '}{t('approvals.shareWithDept')}
            </label>
          </div>
        )
      })}

      <fieldset style={{ border: 'none', padding: 0, marginTop: 16 }}>
        <legend className="cert-meta-label">{t('approvals.relationship')}</legend>
        {['mother', 'father', 'guardian'].map((r) => (
          <label key={r} style={{ display: 'block', marginBottom: 6 }}>
            <input type="radio" name="relationship" value={r} checked={relationship === r} onChange={() => setRelationship(r)} />
            {' '}{t(`approvals.rel.${r}`)}
          </label>
        ))}
      </fieldset>

      <label style={{ display: 'block', marginTop: 12 }}>
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
        {' '}{t('approvals.declaration', { child })}
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary"
          ref={approveBtnRef}
          disabled={!canApprove}
          onClick={() => setConfirming(true)}
        >
          {t('approvals.approveSelected')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => send(true)}>
          {t('approvals.declineAll')}
        </button>
      </div>
      {err && <p className="muted" role="alert" style={{ color: 'var(--color-danger, #b00020)' }}>{err}</p>}

      {confirming && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirming(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            ref={dialogRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={titleId}>{t('approvals.confirmTitle')}</h2>
            <p>{t('approvals.confirmBody', { count: selected.length, child })}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => send(false)}>
                {t('approvals.confirm')}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>
                {t('approvals.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function elementNames(t, list) {
  return (list || []).map((e) => t(`requests.element.${e}`, { defaultValue: e.replace(/_/g, ' ') })).join(', ')
}

/** Copy namespace for a single-consent card: scholarship (uc4) or housing (uc5). */
function singleConsentNs(purpose) {
  return purpose === 'HOUSEHOLD_BENEFIT' ? 'approvals.uc5' : 'approvals.uc4'
}

/** One purpose-driven consent (scholarship or housing). Reuses the same answer route and elements.
 *  Scholarship: under 18 a recorded parent answers (with the declaration); the student sees it read-only; at 18 only the student.
 *  Housing: only the adult applicant answers; other household members and a minor never get an answerable card.
 *  Receipt wording follows the answer and never says "approved" after a refusal. */
function SingleConsent({ detail, onChanged }) {
  const { t, i18n } = useTranslation()
  const ns = singleConsentNs(detail.purpose)
  const tid = detail.purpose === 'HOUSEHOLD_BENEFIT' ? 'uc5' : 'uc4'
  const student = detail.student?.name || ''
  const all = detail.elements || []
  const [choice, setChoice] = useState('')
  const [picked, setPicked] = useState([])
  const [relationship, setRelationship] = useState('')
  const [declared, setDeclared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stopped, setStopped] = useState(null)

  const parentView = detail.role === 'parent'
  const [now] = useState(() => Date.now())
  const until = detail.expires_at
    || new Date(now + (detail.term_days || 90) * 86400000).toISOString()
  const date = fmtDate(until, i18n.language)
  const needsDeclaration = !!detail.needs_declaration
  const grant = choice === 'allow' || choice === 'some'
  const chosen = choice === 'allow' ? all : picked
  const canSend = !!choice && !busy
    && (choice !== 'some' || picked.length > 0)
    && (!grant || !needsDeclaration || (relationship && declared))

  async function send() {
    setBusy(true); setErr('')
    try {
      const body = grant
        ? { decision: 'GRANT', elements: chosen, relationship: needsDeclaration ? relationship : null, declared: needsDeclaration ? declared : false }
        : { decision: 'REFUSE' }
      const out = await answerConsentApproval(detail.consent_id, body)
      onChanged(out)
    } catch (e) {
      setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true); setErr('')
    try {
      const out = await withdrawConsent(detail.consent_id)
      setStopped(out)
      onChanged(null)
    } catch (e) {
      setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false)
    }
  }

  const wording = parentView
    ? t(`${ns}.wordingParent`, { student: student || t('approvals.aChild'), date })
    : t(`${ns}.wordingSelf`, { date })

  if (stopped) {
    return (
      <div className="consent-card" data-testid={`${tid}-stopped`}>
        <p style={{ fontSize: '1.5rem', margin: 0 }} aria-hidden="true">✓</p>
        <h2>{t(`${ns}.stoppedTitle`)}</h2>
        <p>{t(`${ns}.stoppedBody`, { items: elementNames(t, stopped.stopped) })}</p>
        <h3>{t(`${ns}.remainsTitle`)}</h3>
        <ul>
          {(stopped.remains || []).map((r) => (
            <li key={r}>{t(`${ns}.remains.${r}`, { defaultValue: r })}</li>
          ))}
        </ul>
        <p className="muted">{t(`${ns}.remainsNote`)}</p>
        <Link to="/approvals" className="btn-secondary">{t('approvals.back')}</Link>
      </div>
    )
  }

  if (detail.status !== 'PENDING') {
    const result = detail.result || (detail.status === 'REFUSED' ? 'NOT_ALLOWED' : null)
    const bodyKey = result === 'ALLOWED' ? 'bodyAllowed' : result === 'PARTLY_ALLOWED' ? 'bodyPartly' : 'bodyNotAllowed'
    return (
      <div className="consent-card" data-testid={`${tid}-receipt`}>
        <h2>{result ? t(`${ns}.result.${result}`) : t(`${ns}.status.${detail.status}`, { defaultValue: detail.status })}</h2>
        {result && (
          <p>{t(`${ns}.${bodyKey}`, { items: elementNames(t, detail.granted_elements), date: fmtDate(detail.expires_at, i18n.language) })}</p>
        )}
        {detail.answered_by && <p className="muted">{t(`${ns}.answeredBy`, { name: detail.answered_by })}</p>}
        <p className="muted">{fmtDateTime(detail.responded_at, i18n.language)}</p>
        <p className="muted">{t(`${ns}.reference`, { key: detail.key })}</p>
        {err && <p className="muted" role="alert">{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/approvals" className="btn-secondary">{t('approvals.back')}</Link>
          {detail.can_withdraw && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={stop}>{t(`${ns}.stop`)}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="consent-card" data-testid={`${tid}-card`}>
      {detail.handover && detail.can_answer && (
        <p role="status" data-testid={`${tid}-handover`}><strong>{t(`${ns}.handover`)}</strong></p>
      )}
      <p>{wording}</p>
      <ul>
        {all.map((e) => <li key={e}>{t(`requests.element.${e}`, { defaultValue: e.replace(/_/g, ' ') })}</li>)}
      </ul>
      {!detail.can_answer && (
        <p role="status" data-testid={`${tid}-waiting`}>{t(`${ns}.waitingForParent`)}</p>
      )}
      {detail.can_answer && (
        <>
          <fieldset style={{ border: 'none', padding: 0, marginTop: 12 }}>
            <legend className="cert-meta-label">{t(`${ns}.chooseLegend`)}</legend>
            {[['allow', 'allow'], ['some', 'allowSome'], ['no', 'notNow']].map(([code, key]) => (
              <label key={code} style={{ display: 'block', marginBottom: 6 }}>
                <input type="radio" name={`${tid}-choice`} value={code} checked={choice === code} onChange={() => { setChoice(code); setErr('') }} />
                {' '}{t(`${ns}.${key}`)}
              </label>
            ))}
          </fieldset>
          {choice === 'some' && (
            <fieldset style={{ border: 'none', padding: 0, marginTop: 8 }}>
              <legend className="cert-meta-label">{t(`${ns}.pickLegend`)}</legend>
              {all.map((e) => (
                <label key={e} style={{ display: 'block', marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(e)}
                    onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e] : p.filter((x) => x !== e)))}
                  />
                  {' '}{t(`requests.element.${e}`, { defaultValue: e.replace(/_/g, ' ') })}
                </label>
              ))}
            </fieldset>
          )}
          {grant && needsDeclaration && (
            <>
              <fieldset style={{ border: 'none', padding: 0, marginTop: 16 }}>
                <legend className="cert-meta-label">{t(`${ns}.relationship`)}</legend>
                {['mother', 'father', 'guardian'].map((r) => (
                  <label key={r} style={{ display: 'block', marginBottom: 6 }}>
                    <input type="radio" name={`${tid}-relationship`} value={r} checked={relationship === r} onChange={() => setRelationship(r)} />
                    {' '}{t(`approvals.rel.${r}`)}
                  </label>
                ))}
              </fieldset>
              <label style={{ display: 'block', marginTop: 12 }}>
                <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
                {' '}{t(`${ns}.declaration`, { student: student || t('approvals.aChild') })}
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={!canSend} onClick={send}>{t(`${ns}.send`)}</button>
          </div>
        </>
      )}
      {err && <p className="muted" role="alert">{err}</p>}
    </div>
  )
}

function receiptTitleKey(lines) {
  const statuses = (lines || []).map((l) => l.status)
  if (!statuses.length) return 'approvals.receiptMixed'
  if (statuses.every((s) => s === 'GRANTED')) return 'approvals.receiptTitle'
  if (statuses.every((s) => s === 'REFUSED' || s === 'REVOKED')) return 'approvals.receiptDeclined'
  return 'approvals.receiptMixed'
}

/** "Shared" is only said when the department really received it. An approved use whose delivery is still being retried says so. */
function lineLabel(t, l) {
  if (l.status === 'GRANTED' && (l.delivery === 'RETRYING' || l.delivery === 'DEAD_LETTER')) {
    return t('approvals.lineStatus.GRANTED_WAITING')
  }
  return t(`approvals.lineStatus.${l.status}`, { defaultValue: l.status })
}

function Receipt({ detail, onWithdraw }) {
  const { t, i18n } = useTranslation()
  const child = detail.child?.name || t('approvals.aChild')
  const ids = (detail.lines || []).map((l) => l.consent_id).join(', ')
  const titleKey = receiptTitleKey(detail.lines)
  return (
    <div className="consent-card" data-testid="approval-receipt">
      <p style={{ fontSize: '1.5rem', margin: 0 }} aria-hidden="true">✓</p>
      <h2>{t(titleKey, { child })}</h2>
      <ul>
        {(detail.lines || []).map((l) => (
          <li key={l.consent_id}>
            {t(`requests.dept.${l.department}`, { defaultValue: l.department_name })}
            {' — '}
            {lineLabel(t, l)}
          </li>
        ))}
      </ul>
      <p className="muted">{fmtDateTime(detail.answered_at, i18n.language)}</p>
      <p className="muted">{t('approvals.reference', { key: detail.key, ids })}</p>
      <p>{t('approvals.receiptNote')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to="/approvals" className="btn-secondary">{t('approvals.back')}</Link>
        {(detail.lines || []).filter((l) => l.status === 'GRANTED').map((l) => (
          <button key={l.consent_id} type="button" className="btn-secondary" onClick={() => onWithdraw(l.consent_id)}>
            {t('approvals.withdrawLine', { dept: t(`requests.dept.${l.department}`, { defaultValue: l.department_name }) })}
          </button>
        ))}
      </div>
    </div>
  )
}

function deptName(t, side) {
  if (!side) return ''
  return t(`requests.dept.${side.department}`, { defaultValue: side.department_name || side.department })
}

function isTwoValues(detail) {
  const d = detail.detail || {}
  return detail.request_kind === 'CONFIRM_DETAILS'
    && d.value_a && typeof d.value_a === 'object'
    && d.value_b && typeof d.value_b === 'object'
}

/** CONFIRM_DETAILS: two departments hold one detail differently (UC1). The answer never changes the record itself. */
function ConfirmDetailsForm({ detail, onDone }) {
  const { t } = useTranslation()
  const d = detail.detail || {}
  const a = d.value_a
  const b = d.value_b
  const attr = detail.attribute || d.attribute
  const [choice, setChoice] = useState('')
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  const needsTyped = choice === 'OTHER'
  const canSend = choice && (!needsTyped || typed.trim()) && !busy

  async function send() {
    if (needsTyped && !typed.trim()) { setErr(t('approvals.cd.typedRequired')); return }
    setBusy(true); setErr('')
    try {
      const body = choice === 'OTHER'
        ? { decision: 'DISPUTE', choice: 'OTHER', reported_value: typed.trim(), note: note.trim() || null }
        : { decision: 'CONFIRM', choice, note: note.trim() || null }
      const out = await answerRequestApproval(detail.request_id, body)
      setResult({ choice, out: out || {} })
      onDone()
    } catch (e) {
      setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const { choice: c, out } = result
    const picked = c === 'A' ? a : b
    const sentTo = c === 'OTHER'
      ? (out.sent_to || t('approvals.cd.thisDepartment'))
      : null
    return (
      <div className="consent-card" data-testid="confirm-details-receipt">
        <p style={{ fontSize: '1.5rem', margin: 0 }} aria-hidden="true">✓</p>
        <h2>{t('approvals.cd.receiptTitle')}</h2>
        {c === 'OTHER' ? (
          <p>{t('approvals.cd.receiptSent', { dept: sentTo })}</p>
        ) : (
          <p>{t('approvals.cd.receiptChosen', {
            which: t(c === 'A' ? 'approvals.cd.firstWord' : 'approvals.cd.secondWord'),
            value: picked?.value,
            dept: deptName(t, picked),
          })}</p>
        )}
        <Link to="/approvals" className="btn-secondary">{t('approvals.back')}</Link>
      </div>
    )
  }

  if (!detail.can_answer) {
    return <p>{t('approvals.requestThanks')}</p>
  }

  const sides = [['A', a, 'first'], ['B', b, 'second']]
  return (
    <div className="consent-card">
      <h2>{detail.summary}</h2>
      <p className="muted">{t('approvals.cd.intro')}</p>
      <div className="consent-meta-row">
        <span className="cert-meta-label">{t('approvals.cd.about')}</span>
        <span className="cert-meta-value">{t(`approvals.report.attr.${attr}`, { defaultValue: fieldLabel(t, attr) })}</span>
      </div>
      <div className="consent-meta-grid" style={{ marginTop: 12 }}>
        {sides.map(([code, side, word]) => (
          <div key={code} className="consent-meta-row" data-testid={`cd-value-${code}`}>
            <span className="cert-meta-label">{t(`approvals.cd.${word}Value`)}</span>
            <span className="cert-meta-value">
              <strong>{side.value}</strong>
              <div className="muted small">{t('approvals.cd.heldBy', { dept: deptName(t, side) })}</div>
            </span>
          </div>
        ))}
      </div>

      <fieldset style={{ border: 'none', padding: 0, marginTop: 16 }}>
        <legend className="cert-meta-label">{t('approvals.cd.chooseLegend')}</legend>
        {[['A', 'firstRight'], ['B', 'secondRight'], ['OTHER', 'neither']].map(([code, key]) => (
          <label key={code} style={{ display: 'block', marginBottom: 6 }}>
            <input
              type="radio"
              name="cd-choice"
              value={code}
              checked={choice === code}
              onChange={() => { setChoice(code); setErr('') }}
            />
            {' '}{t(`approvals.cd.${key}`)}
          </label>
        ))}
      </fieldset>

      {needsTyped && (
        <label style={{ display: 'block', marginTop: 12 }}>
          {t('approvals.cd.typedLabel')}
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-required="true"
            style={{ display: 'block', width: '100%' }}
          />
        </label>
      )}
      <label style={{ display: 'block', marginTop: 12 }}>
        {t('approvals.cd.reasonLabel')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ display: 'block', width: '100%' }} />
      </label>
      <p className="muted small">{t('approvals.cd.noDocuments')}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={!canSend} onClick={send}>
          {t('approvals.cd.send')}
        </button>
      </div>
      {err && <p className="muted" role="alert">{err}</p>}
    </div>
  )
}

function RequestForm({ detail, onDone }) {
  if (isTwoValues(detail)) return <ConfirmDetailsForm detail={detail} onDone={onDone} />
  return <PlainRequestForm detail={detail} onDone={onDone} />
}

function PlainRequestForm({ detail, onDone }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const rows = Object.entries(detail.detail || {})

  async function decide(decision) {
    setBusy(true); setErr('')
    try {
      await answerRequestApproval(detail.request_id, { decision, note: note || null })
      setDone(true)
      onDone()
    } catch (e) {
      setErr(e.detail || t('approvals.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done || !detail.can_answer) {
    return <p>{t('approvals.requestThanks')}</p>
  }

  return (
    <div className="consent-card">
      <h2>{detail.summary}</h2>
      {rows.map(([k, v]) => (
        <div key={k} className="consent-meta-row">
          <span className="cert-meta-label">{fieldLabel(t, k)}</span>
          <span className="cert-meta-value">
            {detailLines(t, v).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </span>
        </div>
      ))}
      <label style={{ display: 'block', marginTop: 12 }}>
        {t('approvals.note')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ display: 'block', width: '100%' }} />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide('CONFIRM')}>
          {t('approvals.confirmFact')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => decide('DISPUTE')}>
          {t('approvals.disputeFact')}
        </button>
      </div>
      {err && <p className="muted" role="alert">{err}</p>}
    </div>
  )
}

export default function ApprovalDetail() {
  const { key } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })
  const [receipt, setReceipt] = useState(null)
  const [conflict, setConflict] = useState('')

  const load = useCallback(() => {
    fetchApproval(key)
      .then((d) => setState({ data: d }))
      .catch((e) => {
        if (e.status === 401) { navigate('/login'); return }
        setState({ error: e.status === 404 ? 'unlinked' : 'failed' })
      })
  }, [key, navigate])

  useEffect(() => { load() }, [load])

  async function onWithdraw(cid) {
    try {
      await withdrawConsent(cid)
      const fresh = await fetchApproval(key)
      setReceipt(fresh)
      setState({ data: fresh })
    } catch (e) {
      setConflict(e.detail || t('approvals.failed'))
    }
  }

  if (state.loading && !state.data) return <p className="muted">{t('approvals.loading')}</p>
  if (state.error === 'unlinked') return <p className="muted">{t('requests.unlinked')}</p>
  if (state.error) {
    return (
      <div>
        <p className="muted" role="alert">{t('approvals.failed')}</p>
        <button type="button" className="btn-secondary" onClick={load}>{t('approvals.retry')}</button>
      </div>
    )
  }

  const detail = receipt || state.data
  const child = detail.child?.name || t('approvals.aChild')

  return (
    <div>
      <p><Link to="/approvals">{t('approvals.back')}</Link></p>
      {detail.kind === 'CONSENT_GROUP' && (
        <>
          <h1 className="section-heading">{t('approvals.detailTitle', { child })}</h1>
          <div className="consent-meta-grid" style={{ marginBottom: 16 }}>
            <div className="consent-meta-row">
              <span className="cert-meta-label">{t('approvals.dob')}</span>
              <span className="cert-meta-value">{fmtDate(detail.child?.dob, i18n.language)}</span>
            </div>
            <div className="consent-meta-row">
              <span className="cert-meta-label">{t('approvals.sex')}</span>
              <span className="cert-meta-value">{sexLabel(t, detail.child?.sex)}</span>
            </div>
            <div className="consent-meta-row">
              <span className="cert-meta-label">{t('approvals.askedBy')}</span>
              <span className="cert-meta-value">{detail.asked_by}</span>
            </div>
          </div>
          {conflict && <p className="muted" role="alert">{conflict}</p>}
          {receipt || detail.status === 'ANSWERED' ? (
            <Receipt detail={detail} onWithdraw={onWithdraw} />
          ) : (
            <ConsentForm
              detail={detail}
              onDone={(out) => setReceipt(out)}
              onConflict={setConflict}
            />
          )}
        </>
      )}
      {detail.kind === 'CONSENT_SINGLE' && (
        <>
          <h1 className="section-heading">{t(`${singleConsentNs(detail.purpose)}.title`)}</h1>
          <SingleConsent
            detail={detail}
            onChanged={(out) => { if (out) setState({ data: out }); else load() }}
          />
        </>
      )}
      {detail.kind === 'INVITATION' && (
        <>
          <h1 className="section-heading">{t('approvals.invite.title')}</h1>
          <p>{t('approvals.invite.body')}</p>
          <p className="muted">{t('approvals.invite.note')}</p>
          <p className="muted small">{t('approvals.invite.invitedOn')}: {fmtDate(detail.asked_at, i18n.language)}</p>
        </>
      )}
      {detail.kind === 'DEATH_NOTICE' && (
        <>
          <h1 className="section-heading">{t('approvals.death.title')}</h1>
          <p>{t(`approvals.death.body.${detail.stage === 'STOP_APPROVED' ? 'STOP_APPROVED' : 'CONTACTED'}`, { name: detail.deceased_name || t('approvals.death.someone') })}</p>
          <p className="muted">{t('approvals.death.note')}</p>
          <p className="muted small">{t('approvals.invite.invitedOn')}: {fmtDate(detail.asked_at, i18n.language)}</p>
        </>
      )}
      {detail.kind === 'REQUEST' && (
        <>
          <h1 className="section-heading">{t('approvals.requestTitle')}</h1>
          <RequestForm detail={detail} onDone={load} />
        </>
      )}
    </div>
  )
}
