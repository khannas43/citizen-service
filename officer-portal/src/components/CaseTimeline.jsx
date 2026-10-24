import { useEffect, useMemo, useState } from 'react'
import { fetchIntegrityTimeline } from '../api'
import './CaseTimeline.css'

const DAY = 86400000
const day = (s) => Date.parse(`${s}T00:00:00Z`)

/** Gives each item a row inside its lane so that bars that overlap in time sit on top of each other, not over each other. */
export function packRows(items) {
  const rowEnds = []
  return items.map((item) => {
    const start = day(item.start)
    const end = Math.max(day(item.end), start) + (item.start === item.end ? 6 * DAY : 0)
    let row = rowEnds.findIndex((e) => e + DAY <= start)
    if (row === -1) { row = rowEnds.length; rowEnds.push(end) } else rowEnds[row] = end
    return { ...item, row, startMs: start, endMs: end }
  })
}

/** Month ticks (quarterly when the span is long) so that the bars can be read against dates. */
export function axisTicks(from, to) {
  const start = new Date(day(from)), end = day(to)
  const span = (end - start.getTime()) / DAY
  const step = span > 720 ? 6 : span > 300 ? 3 : 1
  const ticks = []
  let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  let n = 0
  while (d.getTime() <= end) {
    if (n % step === 0) ticks.push({ ms: d.getTime(), label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }) })
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    n++
  }
  if (ticks.length < 2) {
    const fmt = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    return [{ ms: start.getTime(), label: fmt(start.getTime()) }, { ms: end, label: fmt(end) }]
  }
  return ticks
}

const KIND_LABEL = { ENTITLEMENT: 'Entitlement', PAYMENT: 'Payment', REVERSAL: 'Reversal', EVENT: 'Event', CHANGE: 'Record change', CERTIFICATE: 'Certificate' }

export default function CaseTimeline({ caseId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    setData(null); setError(null); setPicked(null)
    let live = true
    fetchIntegrityTimeline(caseId).then((d) => live && setData(d)).catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [caseId])

  const laid = useMemo(() => {
    if (!data?.from || !data?.to) return null
    const from = day(data.from)
    const to = Math.max(day(data.to), from + 30 * DAY)
    const pad = (to - from) * 0.02
    const lo = from - pad, span = to + pad - lo
    return {
      lo, span,
      lanes: data.lanes.map((l) => {
        const items = packRows(l.items)
        return { ...l, items, rows: Math.max(1, ...items.map((i) => i.row + 1)) }
      }),
      ticks: axisTicks(data.from, new Date(to).toISOString().slice(0, 10)),
    }
  }, [data])

  if (error) return <p className="ct-note">{error}</p>
  if (!data) return <p className="ct-note">Loading the timeline…</p>
  if (!laid) return <p className="ct-note">No dated records to show for this case.</p>

  const pct = (ms) => `${(((ms - laid.lo) / laid.span) * 100).toFixed(2)}%`

  return (
    <div className="ct" aria-label="Case timeline">
      <div className="ct-legend" aria-hidden="true">
        <span><i className="ct-k ct-ENTITLEMENT" />Entitlement</span>
        <span><i className="ct-k ct-PAYMENT" />Payment</span>
        <span><i className="ct-k ct-REVERSAL" />Reversal</span>
        <span><i className="ct-k ct-EVENT" />Event</span>
        <span><i className="ct-k ct-CHANGE" />Record change</span>
        <span><i className="ct-k ct-flag" />What the alert is about</span>
      </div>
      <div className="ct-chart">
        <div className="ct-axis">
          {laid.ticks.map((t) => <span key={t.ms} style={{ left: pct(t.ms) }}>{t.label}</span>)}
        </div>
        {laid.lanes.map((lane) => (
          <div className="ct-lane" key={lane.key}>
            <div className="ct-lane-name">{lane.label}</div>
            <div className="ct-track" style={{ height: `${lane.rows * 26 + 6}px` }}>
              {laid.ticks.map((t) => <i key={t.ms} className="ct-grid" style={{ left: pct(t.ms) }} />)}
              {lane.items.map((i) => {
                const point = i.start === i.end && i.kind !== 'PAYMENT'
                return (
                  <button
                    key={i.id}
                    type="button"
                    className={`ct-item ct-${i.kind}${i.flagged ? ' ct-flagged' : ''}${point ? ' ct-point' : ''}${picked?.id === i.id ? ' ct-picked' : ''}`}
                    style={{ left: pct(i.startMs), width: point ? undefined : `max(8px, calc(${pct(i.endMs)} - ${pct(i.startMs)}))`, top: `${i.row * 26 + 3}px` }}
                    title={`${i.label}${i.detail ? ` — ${i.detail}` : ''} (${i.start}${i.end !== i.start ? ` to ${i.end}` : ''})`}
                    aria-label={`${KIND_LABEL[i.kind]}: ${i.label}, ${i.start}${i.end !== i.start ? ` to ${i.end}` : ''}${i.flagged ? ', part of what the alert is about' : ''}`}
                    onClick={() => setPicked(i)}
                  >
                    {!point && <span>{i.label}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="ct-picked-text" role="status">
        {picked
          ? <><b>{picked.label}</b> · {picked.start}{picked.end !== picked.start ? ` to ${picked.end}` : ''}{picked.detail ? ` · ${picked.detail}` : ''}{picked.flagged ? ' · part of what the alert is about' : ''}</>
          : 'Select any bar or marker for its details. Outlined items are the records the alert is about.'}
      </p>
    </div>
  )
}
