import { useState } from 'react'
import { tr } from '../../i18n/lang'

const INK = 'var(--color-text-primary, #1a2340)'
const MUTED = 'var(--color-text-muted, #6b7385)'
const MARK = '#1b3c74'
const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const nice = (max) => {
  if (max <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(max)); const m = max / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

/** One measure per day, as bars (count) or a line (percent). One axis, one series, no legend needed: the title names it. */
export function DayChart({ title, days, value, unit = '', kind = 'bar', format = (v) => v.toLocaleString('en-IN'), label, reference = null, referenceLabel = '', flag = null, flagLabel = '', onPick = null }) {
  const [hi, setHi] = useState(null)
  const W = 560, H = 190, L = 44, R = 10, T = 12, B = 26
  const vals = days.map(value)
  const top = nice(Math.max(...vals, reference || 0))
  const x = (i) => L + (days.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (days.length - 1))
  const slot = (W - L - R) / Math.max(days.length, 1)
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const ticks = [0, top / 2, top]
  const every = Math.ceil(days.length / 7)
  const point = (i) => (kind === 'bar' ? L + slot * i + slot / 2 : x(i))
  const h = hi !== null ? days[hi] : null
  return (
    <figure className="fq-chart" aria-label={label || title}>
      <figcaption>{title}</figcaption>
      {days.length === 0 ? <p className="mdm-note">{tr('No records were received in this window.')}</p> : (
        <div className="fq-chart-box">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${days.length} days`} onMouseLeave={() => setHi(null)}>
            {ticks.map((t) => (
              <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(148,163,184,.35)" strokeWidth="1" />
                <text x={L - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize="10" fill={MUTED}>{format(t)}{unit}</text></g>
            ))}
            {kind === 'bar' && days.map((d, i) => {
              const bw = Math.max(2, Math.min(28, slot - 2)); const yy = y(value(d))
              return <rect key={d.day} x={point(i) - bw / 2} y={yy} width={bw} height={Math.max(0, H - B - yy)} rx="3" fill={MARK} opacity={hi === null || hi === i ? 1 : 0.45} />
            })}
            {reference !== null && reference !== undefined && <line x1={L} x2={W - R} y1={y(reference)} y2={y(reference)} stroke="#b45309" strokeWidth="1.5" strokeDasharray="5 4" />}
            {kind === 'line' && (
              <>
                <polyline fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" points={days.map((d, i) => `${x(i)},${y(value(d))}`).join(' ')} />
                {days.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(value(d))} r={hi === i ? 5 : days.length > 20 ? 0 : 3} fill={MARK} stroke="var(--color-surface, #fff)" strokeWidth="2" />)}
                {flag && days.map((d, i) => flag(d) && <g key={`f${d.day}`}><circle cx={x(i)} cy={y(value(d))} r="7" fill="none" stroke="#b45309" strokeWidth="2" /><circle cx={x(i)} cy={y(value(d))} r="3.5" fill="#b45309" /></g>)}
              </>
            )}
            {days.map((d, i) => (i % every === 0) && <text key={d.day} x={point(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED}>{fmtDay(d.day)}</text>)}
            {days.map((d, i) => <rect key={d.day} x={point(i) - slot / 2} y={T} width={slot} height={H - T - B} fill="transparent" onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} tabIndex={0} style={onPick ? { cursor: 'pointer' } : undefined}
              onClick={onPick ? () => onPick(d.day) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter') onPick(d.day) } : undefined}
              aria-label={`${fmtDay(d.day)}: ${format(value(d))}${unit}${onPick ? '. Select to see only this day' : ''}`} />)}
            {hi !== null && kind === 'line' && <line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} stroke={INK} strokeWidth="1" strokeDasharray="3 3" />}
          </svg>
          {h && <div className="fq-tip" style={{ left: `${(point(hi) / W) * 100}%` }}><strong>{fmtDay(h.day)}</strong><span>{format(value(h))}{unit}</span>{h.checks !== undefined && kind === 'line' && <span>{tr('{failed} of {checks} checks', { failed: h.failed.toLocaleString('en-IN'), checks: h.checks.toLocaleString('en-IN') })}</span>}{flag && flag(h) && <span>{flagLabel}</span>}</div>}
          {(reference !== null && reference !== undefined) && (
            <p className="fq-legend"><span className="fq-lg-line" aria-hidden="true" /> {referenceLabel}{flag && <><span className="fq-lg-dot" aria-hidden="true" /> {flagLabel}</>}</p>
          )}
        </div>
      )}
    </figure>
  )
}

/** A small trend line: the pass rate over the last runs. */
export function Spark({ values, label }) {
  if (!values || values.length < 2) return <span className="lin-meta">{tr('First run')}</span>
  const W = 72, H = 22, lo = Math.min(...values, 100), hi = 100
  const flat = hi - lo < 0.5
  const pts = values.map((v, i) => `${(i * (W - 4)) / (values.length - 1) + 2},${flat ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6)}`)
  const last = values[values.length - 1], prev = values[values.length - 2]
  const dir = last > prev + 0.05 ? 'up' : last < prev - 0.05 ? 'down' : 'flat'
  return (
    <span className={`fq-spark ${dir}`} title={`${label}: ${values.map((v) => `${v}%`).join(', ')}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, last ${values.length} runs`}>
        <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2.6" fill="currentColor" />
      </svg>
      <em>{dir === 'up' ? '▲ improving' : dir === 'down' ? '▼ worse' : '● steady'}</em>
    </span>
  )
}

/** The rules that failed most in the window, one bar each. */
export function RuleBars({ title, rows }) {
  const [hi, setHi] = useState(null)
  const max = Math.max(...rows.map((r) => r.percent_failed || 0), 0.01)
  return (
    <figure className="fq-chart" aria-label={title}>
      <figcaption>{title}</figcaption>
      {rows.length === 0 ? <p className="mdm-note">{tr('No rule has a failed record in this window.')}</p> : (
        <ul className="fq-rbars">
          {rows.map((r, i) => (
            <li key={`${r.source}-${r.rule_key}`} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} className={hi === i ? 'on' : ''}>
              <span className="fq-rb-n" title={`${r.feed}: ${r.description}`}>{r.description}<em>{r.feed}</em></span>
              <span className="fq-rb-bar"><i style={{ width: `${Math.max(2, ((r.percent_failed || 0) / max) * 100)}%` }} /></span>
              <span className="fq-rb-v">{r.percent_failed}%<em>{tr('{failed} of {checked}', { failed: r.failed.toLocaleString('en-IN'), checked: r.checked.toLocaleString('en-IN') })}</em></span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
