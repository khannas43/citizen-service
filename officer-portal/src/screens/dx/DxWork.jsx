import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { PageHeader, Stats, DataTable, Drawer, FilterSelect, Banner, Segmented, EmptyState } from './dxKit'
import { tr } from '../../i18n/lang'
import { departmentForRole, departmentLabel } from '../../auth'

function BatchDialog({ reason, open, onClose, onDone }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const [step, setStep] = useState('preview') // preview | confirm | receipt
  const [prev, setPrev] = useState(null)
  const [seen, setSeen] = useState({})
  const [rationale, setRationale] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState(null)
  const minChars = 10

  useEffect(() => {
    if (!open) return undefined
    triggerRef.current = document.activeElement
    setStep('preview'); setPrev(null); setSeen({}); setRationale(''); setErr(''); setReceipt(null)
    mdm('/x/work/batch/preview', { method: 'POST', body: { reason } })
      .then(setPrev)
      .catch((e) => setErr(e.message))
    return undefined
  }, [open, reason])

  useEffect(() => {
    if (!open) return undefined
    const root = dialogRef.current
    if (!root) return undefined
    root.focus()
    const focusables = () => [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0]; const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (triggerRef.current && triggerRef.current.focus) triggerRef.current.focus()
    }
  }, [open, onClose, step])

  if (!open) return null
  const sampleIds = prev
    ? [...new Set([...(prev.sample?.random || []), ...(prev.sample?.lowest_confidence || []), ...(prev.sample?.outliers || [])])]
    : []
  const allSeen = sampleIds.length > 0 && sampleIds.every((id) => seen[id])
  const openedCount = sampleIds.filter((id) => seen[id]).length
  const reasonLen = rationale.trim().length
  const reasonOk = reasonLen >= minChars
  const canApprove = allSeen && reasonOk && !busy

  async function approve() {
    setBusy(true); setErr('')
    try {
      const out = await mdm('/x/work/batch/approve', {
        method: 'POST',
        body: { token: prev.token, rationale: rationale.trim(), sample_opened: sampleIds },
      })
      setReceipt(out); setStep('receipt'); onDone?.(out)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <h2 id={titleId}>{tr('Batch approve')}</h2>
        {err && <Banner tone="bad">{err}</Banner>}
        {step === 'preview' && prev && (
          <>
            <p>{tr('Approving {count} items across departments.', { count: prev.count })}</p>
            <ul>{Object.entries(prev.by_system || {}).map(([s, n]) => <li key={s}>{s}: {n}</li>)}</ul>
            {reason === 'LINK_LOW_SEPARATE' && (
              <p className="dxk-muted" role="note">{tr('Each record is kept separate from its candidate. They can still be linked later.')}</p>
            )}
            {prev.held_for_consent > 0 && (
              <p className="dxk-muted" role="note">{tr('{n} more items are not included: they are waiting for the parent\'s consent.', { n: prev.held_for_consent })}</p>
            )}
            <h3>{tr('Sample — open each row')}</h3>
            <p className="dxk-muted" role="status" style={{ margin: '4px 0 8px' }}>
              {tr('Opened {done} of {total} sample rows', { done: openedCount, total: sampleIds.length })}
            </p>
            <table className="mdm-table dxk-table">
              <tbody>
                {(prev.items_in_sample || []).map((it) => (
                  <tr key={it.id}>
                    <td>
                      <button type="button" className="btn-secondary small" onClick={() => setSeen((s) => ({ ...s, [it.id]: true }))}>
                        {seen[it.id] ? tr('Seen') : tr('Open')}
                      </button>
                    </td>
                    <td><div className="dxk-main">{it.summary}</div><div className="dxk-muted">{it.system} · {tr('Confidence')} {(it.confidence * 100).toFixed(0)}%</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label style={{ display: 'block', marginTop: 12 }}>
              {tr('Reason (at least {n} characters)', { n: minChars })}
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} style={{ display: 'block', width: '100%' }} />
            </label>
            {!reasonOk && (
              <p className="dxk-muted" style={{ margin: '4px 0 0' }}>
                {tr('{n} more characters needed', { n: minChars - reasonLen })}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn-primary" disabled={!canApprove} onClick={() => setStep('confirm')}>{tr('Continue')}</button>
              <button type="button" className="btn-secondary" onClick={onClose}>{tr('Cancel')}</button>
            </div>
            {!allSeen && (
              <p className="dxk-muted" style={{ margin: '8px 0 0' }}>{tr('Open every sample row to continue')}</p>
            )}
          </>
        )}
        {step === 'confirm' && prev && (
          <>
            <p>{tr('Confirm approving {count} items in this group?', { count: prev.count })}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={approve}>{tr('Approve batch')}</button>
              <button type="button" className="btn-secondary" onClick={() => setStep('preview')}>{tr('Back')}</button>
            </div>
          </>
        )}
        {step === 'receipt' && receipt && (
          <>
            <p>{tr('Batch {id}: {approved} approved, {skipped} skipped', { id: receipt.batch_id, approved: receipt.approved, skipped: receipt.skipped })}</p>
            {(receipt.skipped_detail || []).length > 0 && (
              <ul>{receipt.skipped_detail.map((s) => <li key={s.id}>#{s.id}: {s.reason}</li>)}</ul>
            )}
            <p><Link to="/dx/lineage">{tr('Open Events › Trail')}</Link></p>
            <button type="button" className="btn-primary" onClick={onClose}>{tr('Done')}</button>
          </>
        )}
        {!prev && !err && <p className="dxk-muted">{tr('Loading…')}</p>}
      </div>
    </div>
  )
}

// UC1 identity linkage: these groups hold review tasks (r-) and source conflicts (i-). A link is always a person's decision.
const IDENTITY_REASONS = ['LINK_NEAR', 'LINK_AMBIGUOUS', 'LINK_LOW_SEPARATE', 'SOURCE_CONFLICT']
const BATCHABLE_IDENTITY = ['LINK_LOW_SEPARATE']
const keyOf = (r) => r.key ?? r.id

function typingInField(e) {
  const t = e.target?.tagName
  return t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT'
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function dobText(o) {
  if (o.dob) return String(o.dob).slice(0, 10)
  if (o.birth_year) return tr('Year {y}', { y: o.birth_year })
  return '—'
}

function scoreText(scores) {
  if (!scores || typeof scores !== 'object') return ''
  return Object.entries(scores).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')
}

/** A value that differs is bold and says so in words, so the difference does not rely on colour. */
function Cell({ differs, children }) {
  if (!differs) return <>{children}</>
  return <><strong>{children}</strong> <span className="dxk-bad">· {tr('differs')}</span></>
}

/** One link decision: the record and each candidate side by side. Link, keep separate, or skip. Keys: A, 1-9, S, N. */
function LinkReview({ item, minChars = 10, onDecided, onNext }) {
  const ev = item.evidence || {}
  const rec = ev.record || {}
  const cands = ev.candidates || []
  const needsReason = !!(item.needs_rationale || ev.reason_required)
  const [chosen, setChosen] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const noteLen = note.trim().length
  const reasonOk = !needsReason || noteLen >= minChars

  async function decide(decision) {
    if (busy) return
    const cand = cands.find((c) => c.n === chosen) || cands[0]
    if (decision === 'LINK' && !cand) { setErr(tr('There is no candidate to link to.')); return }
    if (!reasonOk) { setErr(tr('Give a reason of at least {n} characters', { n: minChars })); return }
    setBusy(true); setErr('')
    try {
      const body = { decision, note: note.trim() || null }
      if (decision === 'LINK') body.person_id = cand.person_id
      await mdm(`/x/work/review/${item.id}/decide`, { method: 'POST', body })
      onDecided?.(decision === 'LINK' ? tr('Linked to candidate {n}', { n: cand.n }) : tr('Kept separate'))
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    function onKey(e) {
      if (typingInField(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'a') { e.preventDefault(); decide('LINK') }
      else if (/^[1-9]$/.test(k)) { if (Number(k) <= cands.length) { e.preventDefault(); setChosen(Number(k)) } }
      else if (k === 's') { e.preventDefault(); decide('SEPARATE') }
      else if (k === 'n') { e.preventDefault(); onNext?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const fields = [
    ['name', tr('Name')], ['dob', tr('Date of birth')], ['gender', tr('Gender')], ['district', tr('District')],
    ['mandal', tr('Mandal')], ['village', tr('Village')], ['address', tr('Address')], ['parents', tr('Parents')],
    ['ration_card', tr('Ration card')],
  ]
  const anyDiffers = (f) => cands.some((c) => (c.differs || []).includes(f))
  const value = (o, f) => (f === 'dob' ? dobText(o) : fmtVal(o[f]))

  return (
    <div>
      <p role="note" className="dxk-muted" data-testid="link-legend">
        {tr('Keyboard: A link (the first candidate, or the one chosen with 1 to 9), S keep separate, N next')}
      </p>
      {err && <Banner tone="bad">{err}</Banner>}
      <div className="dxk-main">{item.summary}</div>
      <div className="dxk-muted">{tr('Score')} {item.score != null ? `${Math.round(item.score * 100)}%` : '—'} · {tr('Class')} {item.risk_class}</div>
      {!cands.length && <p className="dxk-muted">{tr('This record has no candidate. It can only be kept separate.')}</p>}
      <div className="dxk-table-wrap" style={{ marginTop: 8 }}>
        <table className="mdm-table dxk-table" aria-label={tr('Record and candidates side by side')}>
          <thead>
            <tr>
              <th scope="col">{tr('Detail')}</th>
              <th scope="col">{tr('This record')}</th>
              {cands.map((c) => (
                <th scope="col" key={c.person_id}>
                  <button type="button" className={chosen === c.n ? 'btn-primary small' : 'btn-secondary small'} aria-pressed={chosen === c.n}
                    onClick={() => setChosen(c.n)}>{tr('Candidate {n}', { n: c.n })}</button>
                  <div className="dxk-muted">{c.mdm_id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map(([f, label]) => (
              <tr key={f}>
                <th scope="row">{label}{anyDiffers(f) && <span className="dxk-bad"> · {tr('differs')}</span>}</th>
                <td><Cell differs={anyDiffers(f)}>{value(rec, f)}</Cell></td>
                {cands.map((c) => (
                  <td key={c.person_id}><Cell differs={(c.differs || []).includes(f)}>{value(c, f)}</Cell></td>
                ))}
              </tr>
            ))}
            {(rec.transliteration || cands.some((c) => c.transliteration)) && (
              <tr>
                <th scope="row">{tr('Name in Latin letters')}</th>
                <td>{fmtVal(rec.transliteration)}</td>
                {cands.map((c) => <td key={c.person_id}>{fmtVal(c.transliteration)}</td>)}
              </tr>
            )}
            {((rec.skeleton || []).length > 0 || cands.some((c) => (c.skeleton || []).length)) && (
              <tr>
                <th scope="row">{tr('Sounds like')}</th>
                <td>{fmtVal(rec.skeleton)}</td>
                {cands.map((c) => <td key={c.person_id}>{fmtVal(c.skeleton)}</td>)}
              </tr>
            )}
            <tr>
              <th scope="row">{tr('Department and date')}</th>
              <td>{fmtVal(rec.source_name)}{rec.as_of ? ` · ${String(rec.as_of).slice(0, 10)}` : ''}</td>
              {cands.map((c) => (
                <td key={c.person_id}>{(c.sources || []).map((s) => `${s.source_name || s.source}${s.as_of ? ` · ${String(s.as_of).slice(0, 10)}` : ''}`).join('; ') || '—'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">{tr('Match score')}</th>
              <td>—</td>
              {cands.map((c) => (
                <td key={c.person_id}>
                  {c.score != null ? `${Math.round(c.score * 100)}%` : '—'}
                  {scoreText(c.scores) && <div className="dxk-muted">{scoreText(c.scores)}</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <label style={{ display: 'block', marginTop: 12 }}>
        {needsReason ? tr('Reason (required, at least {n} characters)', { n: minChars }) : tr('Reason (optional)')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ display: 'block', width: '100%' }} />
      </label>
      {needsReason && !reasonOk && (
        <p className="dxk-muted" style={{ margin: '4px 0 0' }}>{tr('{n} more characters needed', { n: minChars - noteLen })}</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy || !cands.length || !reasonOk} onClick={() => decide('LINK')}>
          {tr('Link to candidate {n}', { n: chosen })}
        </button>
        <button type="button" className="btn-secondary" disabled={busy || !reasonOk} onClick={() => decide('SEPARATE')}>{tr('Keep separate')}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => onNext?.()}>{tr('Skip')}</button>
      </div>
    </div>
  )
}

/** Two departments disagree. The steward can only ask the owning department to correct its own record. */
function ConflictReview({ item, minChars = 10, onDecided, onNext }) {
  const ev = item.evidence || {}
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const noteLen = note.trim().length
  const reasonOk = noteLen >= minChars
  const attrLabel = { dob: tr('Date of birth'), gender: tr('Gender'), name: tr('Name') }[ev.attribute] || fmtVal(ev.attribute)

  async function request() {
    if (busy) return
    if (!reasonOk) { setErr(tr('Give a reason of at least {n} characters', { n: minChars })); return }
    setBusy(true); setErr('')
    try {
      await mdm(`/dq/issues/${item.id}/correction`, { method: 'POST', body: { note: note.trim() } })
      onDecided?.(tr('Correction requested'))
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    function onKey(e) {
      if (typingInField(e) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); onNext?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <p role="note" className="dxk-muted" data-testid="link-legend">{tr('Keyboard: N next')}</p>
      {err && <Banner tone="bad">{err}</Banner>}
      <div className="dxk-main">{item.summary}</div>
      <div className="dxk-muted">{attrLabel}{ev.owner ? ` · ${tr('Owned by {dept}', { dept: ev.owner })}` : ''}</div>
      <p className="dxk-muted">{tr('You do not change the record here. The department that owns the value corrects its own record.')}</p>
      <table className="mdm-table dxk-table" aria-label={tr('What each department holds')}>
        <thead><tr><th scope="col">{tr('Department')}</th><th scope="col">{tr('Value')}</th><th scope="col">{tr('As of')}</th></tr></thead>
        <tbody>
          {(ev.values || []).map((v, i) => (
            <tr key={`${v.source}-${i}`}>
              <td>{v.source_name || v.source}</td>
              <td><Cell differs>{fmtVal(v.value)}</Cell></td>
              <td>{v.as_of ? String(v.as_of).slice(0, 10) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label style={{ display: 'block', marginTop: 12 }}>
        {tr('Reason (required, at least {n} characters)', { n: minChars })}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ display: 'block', width: '100%' }} />
      </label>
      {!reasonOk && <p className="dxk-muted" style={{ margin: '4px 0 0' }}>{tr('{n} more characters needed', { n: minChars - noteLen })}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy || !reasonOk} onClick={request}>{tr('Request correction')}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => onNext?.()}>{tr('Skip')}</button>
      </div>
    </div>
  )
}

// Class C items that always need a written reason; there is no approve all for them.
// UC5: DUPLICATE_BENEFIT and HOUSEHOLD_CONFLICT (display fix so the reason box is required).
const DECISION_ONLY = ['CERT_CONFLICT', 'DUPLICATE_BENEFIT', 'HOUSEHOLD_CONFLICT']
const DECISION_NOTE = {
  CERT_CONFLICT: 'Each conflict is decided by a person, one at a time, with a reason. There is no approve all for these.',
  DUPLICATE_BENEFIT: 'Each item is decided by a person, one at a time, with a reason. There is no approve all for these.',
  HOUSEHOLD_CONFLICT: 'Each item is decided by a person, one at a time, with a reason. There is no approve all for these.',
}

function TriageDrawer({ reason, open, onClose, onDone, minChars = 10 }) {
  const [item, setItem] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const loadNext = () => {
    setErr(''); setNote('')
    mdm('/x/work/items', { params: { reason, claimed: 'none', limit: 1 } })
      .then((d) => setItem(d.items?.[0] || null))
      .catch((e) => setErr(e.message))
  }

  useEffect(() => { if (open) loadNext() }, [open, reason]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      if (k === 'a') { e.preventDefault(); decide('APPROVE') }
      else if (k === 'r') { e.preventDefault(); decide('REJECT') }
      else if (k === 's' || k === 'n') { e.preventDefault(); loadNext() }
      else if (k === 'escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const reasonRequired = DECISION_ONLY.includes(reason)
  const reasonOk = !reasonRequired || note.trim().length >= minChars

  async function decide(decision) {
    if (!item || busy) return
    if (!reasonOk) { setErr(tr('Give a reason of at least {n} characters', { n: minChars })); return }
    setBusy(true); setErr('')
    try {
      await mdm(`/proposals/${item.id}/decision`, { method: 'POST', body: { decision, note: note.trim() || 'Reviewed in triage' } })
      onDone?.(); loadNext()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <Drawer open={open} onClose={onClose} title={tr('Review one by one')} wide
      subtitle={tr('Keyboard: A approve, R reject, S skip, N next')}>
      {err && <Banner tone="bad">{err}</Banner>}
      {!item && <p className="dxk-muted">{tr('No more unclaimed items in this group.')}</p>}
      {item && (
        <>
          <div className="dxk-main">{item.summary}</div>
          <div className="dxk-muted">{item.system} · {item.person_name || '—'}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(item.evidence, null, 2)}</pre>
          <label>{reasonRequired ? tr('Reason (required, at least {n} characters)', { n: minChars }) : tr('Reason')}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ display: 'block', width: '100%' }} /></label>
          {reasonRequired && !reasonOk && <p className="dxk-muted" style={{ margin: '4px 0 0' }}>{tr('{n} more characters needed', { n: minChars - note.trim().length })}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={busy || !reasonOk} onClick={() => decide('APPROVE')}>{tr('Approve')} (A)</button>
            <button type="button" className="btn-secondary" disabled={busy || !reasonOk} onClick={() => decide('REJECT')}>{tr('Reject')} (R)</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={loadNext}>{tr('Skip')} (S)</button>
          </div>
        </>
      )}
    </Drawer>
  )
}

function GroupList() {
  const [sp] = useSearchParams()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const deptCode = departmentForRole(role)
  const deptName = departmentLabel(role)
  const [system, setSystem] = useState(deptCode || sp.get('system') || '')
  const [risk, setRisk] = useState(sp.get('risk_class') || '')
  const [claimed, setClaimed] = useState('any')
  const [q, setQ] = useState('')
  const reasonsFilter = (sp.get('reasons') || '').split(',').filter(Boolean)
  const { data, error, loading, reload } = useMdm('/x/work/groups', {
    system: system || undefined, risk_class: risk || undefined,
    claimed: claimed === 'any' ? undefined : claimed, q: q.trim() || undefined,
  }, [system, risk, claimed, q])

  const groups = reasonsFilter.length
    ? (data?.groups || []).filter((g) => reasonsFilter.includes(g.reason_code))
    : (data?.groups || [])
  const openItems = groups.reduce((n, g) => n + (g.count || 0), 0)
  const classC = groups.filter((g) => g.risk_class === 'C').reduce((n, g) => n + (g.count || 0), 0)
  const classB = groups.filter((g) => g.batchable || g.risk_class === 'B').reduce((n, g) => n + (g.count || 0), 0)
  const oldest = groups.reduce((m, g) => Math.max(m, g.oldest_hours || 0), 0)

  return (
    <div className="mdm-hub">
      <PageHeader icon="✅" title={tr('Work queue')}
        subtitle={deptName
          ? tr('Items that need a person in {dept}, grouped by reason.', { dept: tr(deptName) })
          : tr('Items that need a person, grouped by reason. Batch approve where the class allows it.')} />
      <Stats items={[
        { label: tr('Open items'), value: openItems.toLocaleString('en-IN') },
        { label: tr('Person decides (class C)'), value: classC.toLocaleString('en-IN') },
        { label: tr('Batchable (class B)'), value: classB.toLocaleString('en-IN') },
        { label: tr('Oldest waiting'), value: oldest ? `${oldest}h` : '—' },
      ]} />
      <Status loading={loading && !data} error={error} />
      {reasonsFilter.length > 0 && (
        <Banner>
          {tr('Showing only the identity linkage groups.')} <Link to="/dx/work">{tr('Show all groups')}</Link>
        </Banner>
      )}
      <DataTable
        rows={groups} rowKey="reason_code"
        searchValue={q} onSearch={setQ} search={{ placeholder: tr('Search reason or person') }}
        canClear={!!((!deptCode && system) || risk || claimed !== 'any' || q)}
        onClear={() => { if (!deptCode) setSystem(''); setRisk(''); setClaimed('any'); setQ('') }}
        filters={<>
          {!deptCode && (
            <FilterSelect label={tr('Department')} value={system} all={tr('All departments')} onChange={setSystem}
              options={[...new Set((data?.groups || []).flatMap((g) => g.systems || []))].map((s) => [s, s])} />
          )}
          <FilterSelect label={tr('Class')} value={risk} all={tr('Any class')} onChange={setRisk}
            options={[['B', 'B'], ['C', 'C']]} />
          <div className="dxk-filter"><span>{tr('Claimed')}</span>
            <Segmented label={tr('Claimed')} value={claimed} onChange={setClaimed}
              options={[{ value: 'any', label: tr('Anyone') }, { value: 'me', label: tr('Mine') }, { value: 'none', label: tr('Unclaimed') }]} /></div>
        </>}
        empty={deptName
          ? tr('Nothing needs a person in {dept} right now', { dept: tr(deptName) })
          : tr('Nothing needs a person right now')}
        columns={[
          { key: 'label', label: tr('Reason'), render: (g) => (
            <Link to={`/dx/work/${g.reason_code}${system ? `?system=${encodeURIComponent(system)}` : ''}`}>
              <div className="dxk-main">{g.label}</div>
              <div className="dxk-muted">{g.suggestion}</div>
            </Link>
          ) },
          { key: 'count', label: tr('Count'), align: 'num' },
          { key: 'oldest_hours', label: tr('Oldest'), align: 'num', render: (g) => `${g.oldest_hours}h${g.overdue ? ` · ${tr('Overdue')}` : ''}` },
          { key: 'risk_class', label: tr('Class') },
          { key: 'claimed', label: tr('Claimed'), align: 'num' },
          { key: 'batchable', label: tr('Batch'), render: (g) => (g.batchable ? tr('Yes') : tr('No')) },
        ]}
      />
      <p className="dxk-muted"><button type="button" className="btn-secondary small" onClick={reload}>{tr('Refresh')}</button></p>
    </div>
  )
}

function GroupPage() {
  const { reason } = useParams()
  const [sp] = useSearchParams()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const deptCode = departmentForRole(role)
  // Department officers always load their own system, even if the URL names another.
  const system = deptCode || sp.get('system') || ''
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState('')
  // Default Anyone so a claimed item that is still waiting never disappears from the group.
  const [claimed, setClaimed] = useState('any')
  const [minAge, setMinAge] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(25)
  const [sort, setSort] = useState({ key: 'age', dir: 'desc' })
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})
  const [evidence, setEvidence] = useState(null)
  const [evIdx, setEvIdx] = useState(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [triageOpen, setTriageOpen] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState('')

  const load = () => {
    setLoading(true); setErr('')
    const params = {
      reason,
      system: system || department || undefined,
      department: department || undefined,
      q: q.trim() || undefined,
      claimed: claimed === 'any' ? undefined : claimed,
      min_age_hours: minAge || undefined,
      sort: sort.key, dir: sort.dir,
      limit, offset,
    }
    mdm('/x/work/items', { params })
      .then((d) => { setMeta(d); setRows(d.items || []) })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [reason, system, department, q, claimed, minAge, sort.key, sort.dir, limit, offset]) // eslint-disable-line react-hooks/exhaustive-deps

  const isIdentity = IDENTITY_REASONS.includes(reason)
  const canBatch = !!meta?.batchable && !DECISION_ONLY.includes(reason) && (!isIdentity || BATCHABLE_IDENTITY.includes(reason))
  const ids = rows.filter((r) => selected[keyOf(r)]).map(keyOf)
  const allSelected = rows.length > 0 && rows.every((r) => selected[keyOf(r)])
  const minChars = meta?.rationale_min_chars || 10
  const reload = () => { setOffset(0); setSelected({}); load() }
  const open = evIdx != null ? rows[evIdx] : null
  const anyFilter = !!(q || department || claimed !== 'any' || minAge)
  const st = meta?.stats || {}

  function afterDecision(label) {
    setMsg(label)
    const left = rows.length - 1
    setRows((prev) => prev.filter((x) => keyOf(x) !== keyOf(open)))
    if (left <= 0) { setEvIdx(null); load() } else setEvIdx((i) => Math.min(i, left - 1))
  }
  const nextItem = () => setEvIdx((i) => (rows.length > 1 ? (i + 1) % rows.length : i))

  async function claim(mine) {
    setErr('')
    try {
      const path = mine ? '/x/work/claim' : '/x/work/unclaim'
      const body = ids.length ? { ids } : { reason, system: system || undefined }
      const out = await mdm(path, { method: 'POST', body })
      setMsg(mine ? tr('Claimed {n}', { n: out.claimed }) : tr('Released {n}', { n: out.released }))
      setSelected({})
      load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="mdm-hub">
      <p><Link to="/dx/work">{tr('Back to groups')}</Link></p>
      <PageHeader icon="✅" title={meta?.label || reason}
        subtitle={`${tr('Class')} ${meta?.risk_class || '—'} · ${meta?.batchable ? tr('Batchable — open the sample, give a reason, then approve the group.') : tr('Not batchable — each item needs a person to decide.')}`}
        actions={<>
          <button type="button" className="btn-secondary small"
            onClick={() => (isIdentity ? (rows.length && setEvIdx(0)) : setTriageOpen(true))}>{tr('Review one by one')}</button>
          {canBatch ? (
            <button type="button" className="btn-primary small" onClick={() => setBatchOpen(true)}>{tr('Approve all in group')}</button>
          ) : isIdentity ? (
            <span className="dxk-muted" role="note">{tr('Each link is decided by a person, one at a time. There is no approve all for these.')}</span>
          ) : DECISION_ONLY.includes(reason) ? (
            <span className="dxk-muted" role="note">{tr(DECISION_NOTE[reason] || DECISION_NOTE.CERT_CONFLICT)}</span>
          ) : (
            <span className="dxk-muted">{tr('Needs two people: arrives with the next release')}</span>
          )}
        </>} />
      <Stats items={[
        { label: tr('Items in group'), value: (st.items ?? meta?.total ?? rows.length).toLocaleString('en-IN') },
        { label: tr('Claimed by me'), value: (st.claimed_by_me ?? 0).toLocaleString('en-IN') },
        { label: tr('Oldest'), value: st.oldest_hours != null ? `${st.oldest_hours}h` : '—' },
      ]} />
      {msg && <Banner tone="ok">{msg}</Banner>}
      {err && <Banner tone="bad">{err} <button type="button" className="dxk-link" onClick={load}>{tr('Retry')}</button></Banner>}
      {loading && !meta && <Status loading error={null} />}
      {!loading && err && !meta && (
        <EmptyState title={tr('Could not load the list')} hint={err}
          action={<button type="button" className="btn-secondary" onClick={load}>{tr('Retry')}</button>} />
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary small" onClick={() => {
          if (allSelected) setSelected({})
          else setSelected(Object.fromEntries(rows.map((r) => [keyOf(r), true])))
        }}>{tr('Select all in group')}</button>
        {reason !== 'SOURCE_CONFLICT' && (
          <>
            <button type="button" className="btn-secondary small" onClick={() => claim(true)}>{tr('Assign to me')}</button>
            <button type="button" className="btn-secondary small" onClick={() => claim(false)}>{tr('Release')}</button>
          </>
        )}
      </div>
      <DataTable
        rows={rows} rowKey="key"
        server={{
          total: meta?.total ?? rows.length, limit, offset, onPage: setOffset,
          onLimit: (n) => { setLimit(n); setOffset(0) }, pageSizes: [10, 25, 50, 100],
          sort, onSort: (key, dir) => { setSort({ key, dir }); setOffset(0) },
        }}
        searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300}
        search={{ placeholder: tr('Search person or summary') }}
        canClear={anyFilter} onClear={() => { setQ(''); setDepartment(''); setClaimed('any'); setMinAge(''); setOffset(0) }}
        filters={<>
          {!deptCode && (
            <FilterSelect label={tr('Department')} value={department} all={tr('All departments')}
              onChange={(v) => { setDepartment(v); setOffset(0) }}
              options={[...new Set(rows.map((r) => r.system).filter(Boolean))].map((s) => [s, s])} />
          )}
          <div className="dxk-filter"><span>{tr('Claimed')}</span>
            <Segmented label={tr('Claimed')} value={claimed} onChange={(v) => { setClaimed(v); setOffset(0) }}
              options={[{ value: 'any', label: tr('Anyone') }, { value: 'me', label: tr('Mine') }, { value: 'none', label: tr('Unclaimed') }]} /></div>
          <FilterSelect label={tr('Age')} value={minAge} all={tr('Any age')}
            onChange={(v) => { setMinAge(v); setOffset(0) }}
            options={[['24', tr('Older than 1 day')], ['72', tr('Older than 3 days')], ['168', tr('Older than 7 days')]]} />
        </>}
        empty={tr('No open items in this group')}
        emptyHint={anyFilter ? tr('Try a different search or clear the filters.') : undefined}
        columns={[
          { key: 'sel', label: '', sort: false, render: (r) => (
            <input type="checkbox" checked={!!selected[keyOf(r)]}
              onChange={(e) => setSelected((s) => ({ ...s, [keyOf(r)]: e.target.checked }))} aria-label={tr('Select')} />
          ) },
          { key: 'summary', sortKey: 'action', label: tr('Action'), render: (r) => (
            <><div className="dxk-main">{r.summary}</div>
              <div className="dxk-muted">{r.overdue ? tr('Overdue') : (r.suggestion || '—')}</div></>
          ) },
          { key: 'person_name', sortKey: 'person', label: tr('Person'), render: (r) => r.person_name || '—' },
          { key: 'system', sortKey: 'department', label: tr('Department') },
          { key: 'claimed_by', sortKey: 'claimed', label: tr('Claimed'), render: (r) => (
            r.claimed_by ? <span data-testid={`claimed-${keyOf(r)}`}>{r.claimed_by}</span> : '—'
          ) },
          { key: 'age_hours', sortKey: 'age', label: tr('Age'), align: 'num', render: (r) => `${r.age_hours}h` },
          { key: 'ev', label: '', sort: false, render: (r) => (
            <button type="button" className="btn-secondary small"
              onClick={() => (isIdentity ? setEvIdx(rows.findIndex((x) => keyOf(x) === keyOf(r))) : setEvidence(r))}>{tr('Evidence')}</button>
          ) },
        ]}
      />
      <Drawer open={!!evidence} onClose={() => setEvidence(null)} title={tr('Evidence')} wide>
        {evidence && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(evidence.evidence, null, 2)}</pre>}
      </Drawer>
      <Drawer open={!!open} onClose={() => setEvIdx(null)} title={tr('Evidence')} wide
        subtitle={open ? tr('Item {i} of {n} loaded', { i: evIdx + 1, n: rows.length }) : undefined}>
        {open && (open.kind === 'ISSUE' || reason === 'SOURCE_CONFLICT'
          ? <ConflictReview key={keyOf(open)} item={open} minChars={minChars} onDecided={afterDecision} onNext={nextItem} />
          : <LinkReview key={keyOf(open)} item={open} minChars={minChars} onDecided={afterDecision} onNext={nextItem} />)}
      </Drawer>
      <BatchDialog reason={reason} open={batchOpen} onClose={() => setBatchOpen(false)} onDone={reload} />
      <TriageDrawer reason={reason} open={triageOpen} onClose={() => setTriageOpen(false)} onDone={reload} minChars={minChars} />
    </div>
  )
}

export default function DxWork() {
  const { reason } = useParams()
  return reason ? <GroupPage /> : <GroupList />
}
