import { useCallback, useEffect, useState } from 'react'
import { mdm } from '../../mdmApi'

/** Load once and whenever deps change. Returns { data, error, loading, reload }. */
export function useMdm(path, params, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const key = JSON.stringify([path, params, ...deps])
  const run = useCallback(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    mdm(path, { params })
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => run(), [run])
  return { ...state, reload: run }
}

export function Status({ loading, error }) {
  if (loading) return <p className="mdm-note" role="status">Loading…</p>
  if (error) return <p className="mdm-error" role="alert">{error}</p>
  return null
}

export function Tile({ label, value, hint, tone }) {
  return (
    <div className={`mdm-tile${tone ? ` tone-${tone}` : ''}`}>
      <div className="mdm-tile-value">{value}</div>
      <div className="mdm-tile-label">{label}</div>
      {hint && <div className="mdm-tile-hint">{hint}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`mdm-badge tone-${tone}`}>{children}</span>
}

export function Pager({ total, limit, offset, onChange }) {
  if (!total) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="mdm-pager">
      <span>{from}–{to} of {total.toLocaleString('en-IN')}</span>
      <button type="button" className="btn-secondary small" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
      <button type="button" className="btn-secondary small" disabled={to >= total} onClick={() => onChange(offset + limit)}>Next</button>
    </div>
  )
}

export function Bar({ value, max, tone = 'primary' }) {
  const w = max ? Math.max(2, Math.round((100 * value) / max)) : 0
  return <span className="mdm-bar" aria-hidden="true"><span className={`mdm-bar-fill tone-${tone}`} style={{ width: `${w}%` }} /></span>
}
