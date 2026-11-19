import { useRef, useState } from 'react'
import { mdm, mdmDownload, mdmUploadCsv } from '../../mdmApi'
import { Banner } from './dxKit'
import { OUTCOME_TEXT } from './NoticeKit'
import { tr } from '../../i18n/lang'

const RESULT = { RECORDED: ['Recorded', 'ok'], WOULD_RECORD: ['Would be recorded', 'ok'], UNCHANGED: ['Already recorded', 'muted'], REFUSED: ['Refused', 'bad'], SKIPPED: ['Left blank', 'muted'] }
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

function saveResults(res) {
  const rows = [['line', 'notice_id', 'result', 'outcome', 'message'], ...res.results.map((r) => [r.line, r.notice_id, r.result, r.outcome || '', r.message || ''])]
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = res.batch_ref ? `results-${res.batch_ref}.csv` : 'results-check.csv'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BulkResults({ res }) {
  const c = res.counts
  const bad = res.results.filter((r) => r.result === 'REFUSED' || r.result === 'SKIPPED')
  return (
    <div style={{ marginTop: '1rem' }} aria-live="polite">
      <Banner tone={c.refused ? 'warn' : 'ok'}>
        {res.check_only ? <strong>{tr('Check only, nothing was recorded.')} </strong> : <strong>{tr('Batch {batch_ref}.', { batch_ref: res.batch_ref })} </strong>}
        {tr('{v}, {unchanged} already recorded, {refused} refused, {skipped} left blank (of {total}).', { v: res.check_only ? `${c.recorded} would be recorded` : `${c.recorded} recorded`, unchanged: c.unchanged, refused: c.refused, skipped: c.skipped, total: c.total })}
      </Banner>
      {bad.length > 0 && (
        <table className="mdm-table" style={{ marginTop: '0.5rem', width: '100%' }}>
          <thead><tr><th>{tr('Line')}</th><th>{tr('Notice')}</th><th>{tr('Result')}</th><th>{tr('Why')}</th></tr></thead>
          <tbody>{bad.slice(0, 50).map((r, i) => (
            <tr key={i}><td>{r.line}</td><td>{r.notice_id ?? ''}</td><td className={r.result === 'REFUSED' ? 'dxk-bad' : 'dxk-muted'}>{RESULT[r.result][0]}</td><td>{r.message}</td></tr>
          ))}</tbody>
        </table>
      )}
      {bad.length > 50 && <div className="dxk-muted">{tr('Showing the first 50 of {length}. The results file has every line.', { length: bad.length })}</div>}
      <div className="dxk-actions" style={{ marginTop: '0.5rem' }}>
        <button type="button" className="btn-secondary small" onClick={() => saveResults(res)}>{tr('Download the results (CSV)')}</button>
      </div>
    </div>
  )
}

/** Answer many notices for one department at once: everything waiting with one outcome, or a filled-in CSV file. The same rules as a single answer apply to every line. */
export default function BulkAnswer({ systems, system: initial, onDone }) {
  const [system, setSystem] = useState(initial || '')
  const [mode, setMode] = useState('all')
  const [outcome, setOutcome] = useState('ACCEPTED')
  const [reasonMode, setReasonMode] = useState('shared')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const dept = systems.find((d) => d[0] === system)?.[1] || ''
  const needsReason = outcome === 'REJECTED' && mode === 'all'
  const ready = system && (mode === 'all' ? (!needsReason || reason.trim().length >= 5) : !!file)

  const go = async (check) => {
    setBusy(true); setErr(null); setRes(null)
    try {
      let r
      if (mode === 'all') r = await mdm('/x/notices/answer-all', { method: 'POST', body: { system, outcome, reason: reason.trim() || null, check_only: check } })
      else r = await mdmUploadCsv('/x/notices/file', await file.text(), { system, check_only: check, shared_reason: reasonMode === 'shared' ? reason.trim() : '' })
      setRes(r)
      if (!check) onDone?.(r)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const download = async () => {
    setErr(null)
    try { await mdmDownload('/x/notices/export', { system }, `open-notices-${system}.csv`) } catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <Banner tone="warn"><strong>{tr('Simulated.')}</strong> {tr('This stands in for a department sending its answers by file or batch. Every line is judged on its own by the same rules as a single answer; the good ones are recorded and the rest are explained, so one bad line never blocks the others.')}</Banner>
      <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('Department')}</span>
        <select value={system} onChange={(e) => { setSystem(e.target.value); setRes(null) }} aria-label={tr('Department for the bulk answer')}>
          <option value="">{tr('Choose a department')}</option>
          {systems.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select></label>
      <div className="dxk-checks" role="radiogroup" aria-label={tr('How to answer')} style={{ marginTop: '0.75rem' }}>
        <label className="mdm-check"><input type="radio" name="bulkmode" checked={mode === 'all'} onChange={() => { setMode('all'); setRes(null) }} /> {tr('Answer everything waiting with one outcome')}</label>
        <label className="mdm-check"><input type="radio" name="bulkmode" checked={mode === 'file'} onChange={() => { setMode('file'); setRes(null) }} /> {tr('Answer from a file (CSV)')}</label>
      </div>

      {mode === 'all' && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="dxk-checks" role="radiogroup" aria-label={tr('The outcome for all')}>
            {['ACCEPTED', 'APPLIED', 'REJECTED', 'ACKNOWLEDGED'].map((o) => (
              <label key={o} className="mdm-check"><input type="radio" name="bulkoutcome" checked={outcome === o} onChange={() => setOutcome(o)} /> {OUTCOME_TEXT[o]}</label>
            ))}
          </div>
          <div className="dxk-muted" style={{ marginTop: '0.25rem' }}>{tr('A notice that cannot take this outcome (a statutory notice can only be acknowledged or applied) is refused and listed; the others are recorded.')}</div>
          {outcome === 'REJECTED' && (
            <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('One reason for every rejection (required; each goes back to a person)')}</span>
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} aria-label={tr('One reason for every rejection')} /></label>
          )}
        </div>
      )}

      {mode === 'file' && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="dxk-actions">
            <button type="button" className="btn-secondary small" disabled={!system} onClick={download}>{tr('Download the open notices (CSV)')}</button>
          </div>
          <div className="dxk-muted" style={{ margin: '0.25rem 0 0.75rem' }}>{tr('Fill in the outcome (ACCEPTED, APPLIED, REJECTED or ACKNOWLEDGED), the reason for a rejection and the department\'s own reference for APPLIED. A blank outcome leaves that notice alone.')}</div>
          <label className="dxk-field"><span>{tr('The filled-in file')}</span>
            <input ref={input} type="file" accept=".csv,text/csv" aria-label={tr('The filled-in CSV file')} onChange={(e) => { setFile(e.target.files?.[0] || null); setRes(null) }} /></label>
          <div className="dxk-checks" role="radiogroup" aria-label={tr('Reason for rejections')} style={{ marginTop: '0.75rem' }}>
            <label className="mdm-check"><input type="radio" name="reasonmode" checked={reasonMode === 'line'} onChange={() => setReasonMode('line')} /> {tr('Each rejection carries its own reason, written on its line')}</label>
            <label className="mdm-check"><input type="radio" name="reasonmode" checked={reasonMode === 'shared'} onChange={() => setReasonMode('shared')} /> {tr('One reason for the whole file (a line with its own reason keeps it)')}</label>
          </div>
          {reasonMode === 'shared' && (
            <label className="dxk-field" style={{ marginTop: '0.5rem' }}><span>{tr('The shared reason')}</span>
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} aria-label={tr('The shared reason for the file')} /></label>
          )}
        </div>
      )}

      <div className="dxk-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn-secondary" disabled={busy || !ready} onClick={() => go(true)}>{tr('Check only, record nothing')}</button>
        <button type="button" className="btn-primary" disabled={busy || !ready} onClick={() => go(false)}>{mode === 'all' ? tr('Record for {dept}', { dept: dept || tr('the department') }) : tr('Record the good lines')}</button>
      </div>
      {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
      {res && <BulkResults res={res} />}
    </div>
  )
}
