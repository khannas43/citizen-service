import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import './dxLineage.css'

const TONE = { PROCESSED: 'ok', APPROVED: 'ok', GRANTED: 'ok', DELIVERED: 'ok', PROPOSED: 'warn', PENDING: 'warn', PENDING_CONSENT: 'warn', RETRYING: 'warn',
  LINKED: 'ok', AWAITING_APPROVAL: 'warn', REVOKED: 'bad', DEAD_LETTER: 'bad', BLOCKED_REVOKED: 'bad', NO_MATCH: 'bad' }
const KIND = { source: 'Source', event: 'Event', person: 'Person', proposal: 'Proposal', consent: 'Consent', delivery: 'Delivery', ledger: 'Clearing house', audit: 'Audit log' }
const toneOf = (n) => (n.status ? TONE[n.status] || (/^BLOCKED|REFUSED|REJECTED|WITHDRAWN|EXPIRED|NOT_APPROVED|NOT_MATCHED/.test(n.status) ? 'neutral' : 'info') : 'info')
const words = (s) => (s || '').toLowerCase().replace(/_/g, ' ')

/** Layers the nodes left to right by their longest path from a start node, then draws the edges between the measured boxes. */
export default function FlowGraph({ nodes, edges, onOpen }) {
  const wrap = useRef(null)
  const refs = useRef({})
  const [paths, setPaths] = useState([])
  const cols = useMemo(() => {
    const depth = Object.fromEntries(nodes.map((n) => [n.id, 0]))
    for (let i = 0; i < nodes.length; i++) edges.forEach((e) => { if (depth[e.from] + 1 > depth[e.to]) depth[e.to] = depth[e.from] + 1 })
    const out = []
    nodes.forEach((n) => { (out[depth[n.id]] = out[depth[n.id]] || []).push(n) })
    return out.filter(Boolean)
  }, [nodes, edges])

  useLayoutEffect(() => {
    const draw = () => {
      const box = wrap.current?.getBoundingClientRect()
      if (!box) return
      const pos = (id, side) => {
        const r = refs.current[id]?.getBoundingClientRect()
        return r ? [(side === 'r' ? r.right : r.left) - box.left + wrap.current.scrollLeft, r.top + r.height / 2 - box.top] : null
      }
      setPaths(edges.map((e) => {
        const a = pos(e.from, 'r'), b = pos(e.to, 'l')
        if (!a || !b) return null
        const mx = (a[0] + b[0]) / 2
        return { d: `M${a[0]},${a[1]} C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`, label: e.label, x: mx, y: (a[1] + b[1]) / 2, key: `${e.from}-${e.to}` }
      }).filter(Boolean))
    }
    draw()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null
    if (ro && wrap.current) ro.observe(wrap.current)
    return () => ro?.disconnect()
  }, [nodes, edges, cols])

  return (
    <div>
      <div className="flow-legend" aria-hidden="true">
        {[['#1a7a4a', 'Done / allowed'], ['#b45309', 'Waiting'], ['#b91c1c', 'Stopped or withdrawn'], ['#94a3b8', 'Not sent / refused']].map(([c, t]) => <span key={t}><i style={{ background: c }} />{t}</span>)}
      </div>
      <div className="flow" ref={wrap}>
        <svg className="flow-svg" aria-hidden="true">
          {paths.map((p) => <g key={p.key}><path d={p.d} /><text x={p.x} y={p.y} textAnchor="middle">{p.label}</text></g>)}
        </svg>
        <div className="flow-cols">
          {cols.map((col, i) => (
            <div className="flow-col" key={i}>
              {col.map((n) => (
                <button key={n.id} type="button" ref={(el) => { refs.current[n.id] = el }} className={`flow-node ${toneOf(n)}`} onClick={() => onOpen?.(n)}
                  aria-label={`${KIND[n.kind] || n.kind}: ${n.label}. ${n.status ? (n.status_text || words(n.status)) : ''}`}>
                  <span className="k">{KIND[n.kind] || n.kind}{n.status ? ` · ${n.status_text || words(n.status)}` : ''}</span>
                  <span className="l">{n.label}</span>
                  {n.sub && <span className="s">{n.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
