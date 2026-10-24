import { useCallback, useEffect, useState } from 'react'
import { decidePaymentLine, fetchPaymentBatch, fetchPaymentBatches, screenPaymentFile } from '../api'

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const VERDICTS = ['', 'HOLD', 'REVIEW', 'CLEAR']
const VERDICT_LABEL = { '': 'All', HOLD: 'Hold', REVIEW: 'Review', CLEAR: 'Clear' }

function decisionLabel(line) {
  if (line.decision === 'HOLD_CONFIRMED') return 'Hold confirmed'
  if (line.decision === 'RELEASED') return 'Released'
  return line.verdict === 'CLEAR' ? '' : 'Waiting for decision'
}

/** The pre-payment gate: upload a payment file, see what should not be paid, and decide each flagged line. */
export default function PaymentGate({ canDecide, onOpenPersonView }) {
  const [batches, setBatches] = useState([])
  const [selected, setSelected] = useState(null)
  const [verdict, setVerdict] = useState('HOLD')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [releasing, setReleasing] = useState(null)
  const [reason, setReason] = useState('')

  const fail = (err) => setMessage({ type: 'error', text: err?.message || 'Something went wrong.' })

  const loadBatches = useCallback(() => fetchPaymentBatches().then(setBatches).catch(fail), [])
  const open = useCallback(
    (id, v = verdict, p = 0) => fetchPaymentBatch(id, v, p).then((b) => { setSelected(b); setPage(p) }).catch(fail),
    [verdict],
  )

  useEffect(() => { loadBatches() }, [loadBatches])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const b = await screenPaymentFile(file)
      setVerdict('HOLD')
      await loadBatches()
      await open(b.id, 'HOLD')
      setMessage({ type: 'success', text: `Screened ${b.lineCount} payments.` })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const decide = async (line, action) => {
    setBusy(true)
    try {
      await decidePaymentLine(selected.id, line.id, action, reason)
      setReleasing(null)
      setReason('')
      await Promise.all([open(selected.id, verdict, page), loadBatches()])
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const pick = (v) => { setVerdict(v); if (selected) open(selected.id, v, 0) }

  return (
    <section className="ei-card pg" aria-label="Pre-payment gate">
      <h2>Pre-payment gate</h2>
      <p className="ei-sub">Upload the payment file before money is released. Each payment is checked against the entitlement, earlier payments, verified deaths and the schemes a person cannot hold together.</p>
      {message && <p className={`ei-message ${message.type}`} role="status">{message.text}</p>}
      {canDecide ? (
        <label className="ei-primary pg-upload">
          {busy ? 'Working…' : 'Screen a payment file (CSV)'}
          <input type="file" accept=".csv,text/csv" onChange={upload} disabled={busy} hidden />
        </label>
      ) : (
        <p className="ei-sub">Your role can view screened files but not upload or decide.</p>
      )}
      <p className="ei-sub pg-columns">Columns: payment_ref, unit_id, period_start, period_end, amount, bank_token (optional)</p>

      <table className="pg-batches">
        <thead>
          <tr><th>File</th><th>Uploaded</th><th>Payments</th><th>Hold</th><th>Review</th><th>Waiting</th><th></th></tr>
        </thead>
        <tbody>
          {batches.length === 0 && <tr><td colSpan={7}>No payment files screened yet.</td></tr>}
          {batches.map((b) => (
            <tr key={b.id} className={selected?.id === b.id ? 'selected' : ''}>
              <td>{b.name}</td>
              <td>{new Date(b.uploadedAt).toLocaleString('en-IN')}</td>
              <td>{b.lineCount} · {rupees(b.totalAmount)}</td>
              <td>{b.counts.HOLD} · {rupees(b.amounts.HOLD)}</td>
              <td>{b.counts.REVIEW}</td>
              <td>{b.undecided}</td>
              <td><button type="button" onClick={() => open(b.id)}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="pg-detail">
          <h3>{selected.name}</h3>
          <p>
            {selected.counts.HOLD} to hold ({rupees(selected.amounts.HOLD)}), {selected.counts.REVIEW} to review, {selected.counts.CLEAR} clear.
            {' '}{selected.holdsConfirmed} holds confirmed, {selected.released} released, {selected.undecided} waiting.
          </p>
          <div className="pg-filter" role="group" aria-label="Show payments">
            {VERDICTS.map((v) => (
              <button key={v || 'all'} type="button" aria-pressed={verdict === v} className={verdict === v ? 'active' : ''} onClick={() => pick(v)}>
                {VERDICT_LABEL[v]}
              </button>
            ))}
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Person</th><th>Scheme</th><th>Period</th><th>Amount</th><th>Result</th><th>Why</th><th></th></tr>
            </thead>
            <tbody>
              {selected.lines.length === 0 && <tr><td colSpan={8}>Nothing in this view.</td></tr>}
              {selected.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNo}</td>
                  <td>
                    {l.personId && onOpenPersonView ? (
                      <button type="button" className="person-profile-link" onClick={() => onOpenPersonView(l.personId, l.personName)}>
                        {l.personName || '—'}
                      </button>
                    ) : (l.personName || '—')}
                  </td>
                  <td>{l.schemeName || '—'}</td>
                  <td>{l.periodStart} to {l.periodEnd}</td>
                  <td>{rupees(l.amount)}</td>
                  <td><span className={`pg-verdict ${l.verdict.toLowerCase()}`}>{VERDICT_LABEL[l.verdict]}</span> {decisionLabel(l)}</td>
                  <td>
                    <ul className="pg-reasons">{(l.reasons || []).map((r) => <li key={r.code}>{r.text}</li>)}</ul>
                    {l.decisionReason && <em>Reason: {l.decisionReason} ({l.decidedBy})</em>}
                  </td>
                  <td>
                    {canDecide && l.verdict !== 'CLEAR' && l.decision === 'NONE' && (
                      releasing === l.id ? (
                        <span className="pg-release">
                          <input aria-label="Reason for releasing" placeholder="Why is this payment fine?" value={reason} onChange={(e) => setReason(e.target.value)} />
                          <button type="button" disabled={busy || !reason.trim()} onClick={() => decide(l, 'RELEASE')}>Release</button>
                          <button type="button" onClick={() => { setReleasing(null); setReason('') }}>Cancel</button>
                        </span>
                      ) : (
                        <span>
                          <button type="button" disabled={busy} onClick={() => decide(l, 'CONFIRM_HOLD')}>Confirm hold</button>
                          <button type="button" disabled={busy} onClick={() => setReleasing(l.id)}>Release…</button>
                        </span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected.totalLines > 50 && (
            <div className="pg-pager">
              <button type="button" disabled={page === 0} onClick={() => open(selected.id, verdict, page - 1)}>Previous</button>
              <span>Page {page + 1} of {Math.ceil(selected.totalLines / 50)}</span>
              <button type="button" disabled={(page + 1) * 50 >= selected.totalLines} onClick={() => open(selected.id, verdict, page + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
