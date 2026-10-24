import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import GUJARAT_DISTRICTS from '../data/gujaratDistricts.json'
import './MoneyMap.css'

export const METRICS = {
  flaggedAmount: { label: 'Flagged', ramp: ['#fde8c8', '#f9b872', '#ef8a3c', '#d9561d', '#a93a0f'] },
  confirmedAmount: { label: 'Confirmed', ramp: ['#d8e6f7', '#9cc0e8', '#5d97d6', '#2f6cb5', '#164a8a'] },
  recoveredAmount: { label: 'Recovered', ramp: ['#d7efe0', '#9bd6b2', '#5cb883', '#2f9460', '#16683f'] },
}

const lakh = (n) => {
  const v = Number(n) || 0
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)} Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)} L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)} K`
  return `₹${v}`
}

function pick(ramp, p) {
  return ramp[Math.min(ramp.length - 1, Math.floor(p * ramp.length))]
}

/** Gujarat on a clean basemap: districts with data are tinted, each carries a bubble sized by the chosen amount. */
export default function MoneyMap({ rows, selected, onSelect, metric = 'flaggedAmount' }) {
  const el = useRef(null)
  const map = useRef(null)
  const group = useRef(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomSnap: 0.25, zoomDelta: 0.5, zoomControl: true, scrollWheelZoom: false, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 12, className: 'mm-tiles',
    }).addTo(m)
    m.fitBounds([[20.1, 68.1], [24.7, 74.5]])
    map.current = m
    return () => { m.remove(); map.current = null; group.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (group.current) group.current.remove()
    const ramp = (METRICS[metric] ?? METRICS.flaggedAmount).ramp
    const byName = new Map((rows ?? []).map((r) => [r.district, r]))
    const max = Math.max(0, ...(rows ?? []).map((r) => Number(r[metric]) || 0))
    const g = L.layerGroup().addTo(m)
    group.current = g

    const poly = L.geoJSON(GUJARAT_DISTRICTS, {
      style: (f) => {
        const r = byName.get(f.properties.name)
        const v = Number(r?.[metric]) || 0
        const isSel = selected === f.properties.name
        return {
          fillColor: v > 0 ? pick(ramp, v / max) : '#cfd6e2',
          fillOpacity: v > 0 ? 0.62 : 0.35,
          color: isSel ? '#0f172a' : '#ffffff',
          weight: isSel ? 3 : 1.2,
        }
      },
      onEachFeature: (f, layer) => {
        const name = f.properties.name
        const r = byName.get(name)
        layer.on('mouseover', () => layer.setStyle({ weight: 2.5, color: '#334155' }))
        layer.on('mouseout', () => poly.resetStyle(layer))
        layer.on('click', () => onSelectRef.current?.(name))
        if (r) {
          layer.bindTooltip(
            `<strong>${name}</strong><br/>${r.openAlerts} open alerts<br/>Flagged ${lakh(r.flaggedAmount)} · Confirmed ${lakh(r.confirmedAmount)}`,
            { sticky: true, className: 'mm-tip' },
          )
        } else {
          layer.bindTooltip(`${name}: no data loaded`, { sticky: true, className: 'mm-tip' })
        }
      },
    }).addTo(g)

    // one bubble per district that has money in the chosen view, biggest drawn first so small ones stay clickable
    const bubbles = []
    poly.eachLayer((layer) => {
      const name = layer.feature.properties.name
      const r = byName.get(name)
      const v = Number(r?.[metric]) || 0
      if (!r || v <= 0) return
      bubbles.push({ name, r, v, at: layer.getBounds().getCenter() })
    })
    bubbles.sort((a, b) => b.v - a.v).forEach(({ name, r, v, at }, i) => {
      const size = Math.round(30 + 34 * Math.sqrt(v / max))
      const color = pick(ramp, Math.min(0.99, v / max))
      const icon = L.divIcon({
        className: 'mm-bubble-wrap',
        iconSize: [size, size],
        html: `<div class="mm-bubble${i === 0 ? ' mm-top' : ''}${selected === name ? ' mm-sel' : ''}" style="width:${size}px;height:${size}px;background:${color}">
                 <b>${lakh(v)}</b><span>${r.openAlerts} open</span></div>`,
      })
      L.marker(at, { icon, keyboard: true, title: `${name}: ${lakh(v)}` })
        .on('click', () => onSelectRef.current?.(name))
        .addTo(g)
    })

    const focus = selected ? poly.getLayers().find((l) => l.feature.properties.name === selected) : null
    setTimeout(() => {
      m.invalidateSize()
      if (focus) m.fitBounds(focus.getBounds(), { padding: [60, 60], maxZoom: 8.5 })
      else m.fitBounds(poly.getBounds(), { padding: [10, 10] })
    }, 150)
  }, [rows, selected, metric])

  return <div ref={el} className="money-map" role="img" aria-label="Map of Gujarat with a bubble for the amount in each district" />
}
