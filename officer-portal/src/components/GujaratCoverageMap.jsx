import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GUJARAT_GEOJSON } from '../data/gujaratGeoJSON'
import { fetchGeographicTalukas, fetchGeographicVillages } from '../api'
import './GujaratCoverageMap.css'

function choroplethColor(count, max, isSelected) {
  if (isSelected) return '#e65100'
  if (!max || count <= 0) return '#dce8f5'
  const p = Math.min(1, count / max)
  if (p < 0.15) return '#93bfdf'
  if (p < 0.30) return '#6aa3cc'
  if (p < 0.50) return '#4287ba'
  if (p < 0.70) return '#2468a2'
  if (p < 0.85) return '#114d87'
  return '#0a3366'
}

// Opens an interactive Leaflet popup with taluka drill-down, then villages
async function openDrillPopup(map, latlng, districtName, districtCount, schemeId, popupRef) {
  // Close any existing popup first
  if (popupRef.current) {
    popupRef.current.remove()
    popupRef.current = null
  }

  const popup = L.popup({ className: 'gcm-drill-popup', maxWidth: 310, autoPan: true })
    .setLatLng(latlng)
    .setContent(buildLoadingHTML(districtName))
    .addTo(map)
  popupRef.current = popup

  popup.on('remove', () => {
    if (popupRef.current === popup) popupRef.current = null
  })

  try {
    const resp = await fetchGeographicTalukas(schemeId, districtName, {
      sortBy: 'count', sortDir: 'desc', offset: 0, limit: 10,
    })
    const talukas = resp.results ?? []

    // Bail if popup was closed while fetching
    if (popupRef.current !== popup) return

    const container = document.createElement('div')
    container.className = 'gcm-pop'
    container.innerHTML = `
      <div class="gcm-pop-header">
        <span class="gcm-pop-district">${districtName}</span>
        <span class="gcm-pop-badge">${districtCount.toLocaleString()} beneficiaries</span>
      </div>
      <div class="gcm-pop-section-label">Talukas</div>
      <div class="gcm-pop-taluka-list">
        ${talukas.length === 0
          ? '<div class="gcm-pop-empty">No taluka data available</div>'
          : talukas.map(t => `
            <div class="gcm-pop-taluka" data-name="${escHtml(t.name)}" data-count="${t.beneficiaryCount}">
              <button class="gcm-pop-taluka-btn" type="button">
                <span class="gcm-pop-arrow">▸</span>
                <span class="gcm-pop-taluka-name">${t.name}</span>
                <span class="gcm-pop-taluka-count">${t.beneficiaryCount.toLocaleString()}</span>
              </button>
              <div class="gcm-pop-village-list" hidden></div>
            </div>
          `).join('')
        }
      </div>
    `

    // Wire up taluka expand/collapse
    container.querySelectorAll('.gcm-pop-taluka').forEach(talukaEl => {
      const btn = talukaEl.querySelector('.gcm-pop-taluka-btn')
      const villagesEl = talukaEl.querySelector('.gcm-pop-village-list')
      const arrowEl = btn.querySelector('.gcm-pop-arrow')
      const talukaName = talukaEl.dataset.name
      let loaded = false
      let expanded = false

      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        expanded = !expanded
        arrowEl.textContent = expanded ? '▾' : '▸'
        talukaEl.classList.toggle('gcm-pop-taluka-open', expanded)

        if (!expanded) {
          villagesEl.hidden = true
          return
        }

        villagesEl.hidden = false

        if (!loaded) {
          villagesEl.innerHTML = '<div class="gcm-pop-loading-sm">Loading villages…</div>'
          try {
            const vResp = await fetchGeographicVillages(schemeId, districtName, talukaName, {
              sortBy: 'count', sortDir: 'desc', offset: 0, limit: 12,
            })
            const villages = vResp.results ?? []
            loaded = true
            villagesEl.innerHTML = villages.length > 0
              ? villages.map(v => `
                  <div class="gcm-pop-village">
                    <span class="gcm-pop-village-name">${v.name}</span>
                    <span class="gcm-pop-village-count">${v.beneficiaryCount.toLocaleString()}</span>
                  </div>
                `).join('')
              : '<div class="gcm-pop-empty">No village data</div>'
          } catch {
            villagesEl.innerHTML = '<div class="gcm-pop-empty">Failed to load</div>'
            loaded = false
            expanded = false
            arrowEl.textContent = '▸'
            talukaEl.classList.remove('gcm-pop-taluka-open')
            villagesEl.hidden = true
          }
        }

        popup.update()
      })
    })

    popup.setContent(container)
    popup.update()
  } catch {
    if (popupRef.current === popup) {
      popup.setContent('<div class="gcm-pop-error">Failed to load taluka data</div>')
    }
  }
}

function buildLoadingHTML(name) {
  return `<div class="gcm-pop-loading"><span class="gcm-pop-spinner">⟳</span> Loading ${name}…</div>`
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isOutsideFocus(name, focusDistrict) {
  if (!focusDistrict) return false
  return String(name || '').trim().toLowerCase() !== String(focusDistrict).trim().toLowerCase()
}

export default function GujaratCoverageMap({ districts, selectedDistrict, onSelectDistrict, schemeId, focusDistrict }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const geoLayerRef = useRef(null)
  const popupRef = useRef(null)

  const districtMap = useMemo(() => {
    const m = new Map()
    ;(districts ?? []).forEach(d => m.set(d.districtName, d))
    return m
  }, [districts])

  const maxCount = useMemo(
    () => Math.max(0, ...(districts ?? []).map(d => d.totalCitizens ?? 0)),
    [districts]
  )

  const totalCitizens = useMemo(
    () => (districts ?? []).reduce((s, d) => s + (d.totalCitizens ?? 0), 0),
    [districts]
  )

  const topDistricts = useMemo(
    () => [...(districts ?? [])]
      .filter(d => (d.totalCitizens ?? 0) > 0)
      .sort((a, b) => (b.totalCitizens ?? 0) - (a.totalCitizens ?? 0))
      .slice(0, 6),
    [districts]
  )

  // Refs so closures inside the one-time map init always read latest values
  const districtMapRef = useRef(districtMap)
  const maxCountRef = useRef(maxCount)
  const totalCitizensRef = useRef(totalCitizens)
  const selectedDistrictRef = useRef(selectedDistrict)
  const onSelectRef = useRef(onSelectDistrict)
  const schemeIdRef = useRef(schemeId)
  const focusDistrictRef = useRef(focusDistrict)

  useEffect(() => { districtMapRef.current = districtMap }, [districtMap])
  useEffect(() => { maxCountRef.current = maxCount }, [maxCount])
  useEffect(() => { totalCitizensRef.current = totalCitizens }, [totalCitizens])
  useEffect(() => { selectedDistrictRef.current = selectedDistrict }, [selectedDistrict])
  useEffect(() => { onSelectRef.current = onSelectDistrict }, [onSelectDistrict])
  useEffect(() => { schemeIdRef.current = schemeId }, [schemeId])
  useEffect(() => { focusDistrictRef.current = focusDistrict }, [focusDistrict])

  // Initialize Leaflet once — runs only on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    })
    mapRef.current = map

    // OSM tile base layer — same as Niyantran
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const geoLayer = L.geoJSON(GUJARAT_GEOJSON, {
      style: (feature) => {
        const name = feature.properties.name
        if (isOutsideFocus(name, focusDistrictRef.current)) {
          return {
            fillColor: '#cbd5e1',
            fillOpacity: 0.22,
            color: '#ffffff',
            weight: 1,
            opacity: 1,
          }
        }
        const data = districtMapRef.current.get(name)
        const count = data?.totalCitizens ?? 0
        return {
          fillColor: choroplethColor(count, maxCountRef.current, selectedDistrictRef.current === name),
          fillOpacity: 0.7,
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
        }
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name
        layer.on({
          mouseover(e) {
            const l = e.target
            const locked = isOutsideFocus(name, focusDistrictRef.current)
            l.setStyle({ weight: 3, color: '#0f172a', fillOpacity: locked ? 0.35 : 0.9 })
            l.bringToFront()
            const data = districtMapRef.current.get(name)
            const count = data?.totalCitizens ?? 0
            const total = totalCitizensRef.current
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
            const hasScheme = Boolean(schemeIdRef.current)
            l.bindTooltip(
              `<div class="gcm-lf-tip-title">${name}</div>` +
              `<div class="gcm-lf-tip-row"><span>Beneficiaries</span><strong>${count.toLocaleString()}</strong></div>` +
              `<div class="gcm-lf-tip-row"><span>${hasScheme ? '% of scheme' : '% of total'}</span><strong>${pct}%</strong></div>` +
              `<div class="gcm-lf-tip-hint">${locked ? 'Outside your assigned district' : hasScheme ? 'Click to drill into talukas ▸' : 'Click to view this district'}</div>`,
              { sticky: true, className: 'gcm-lf-tooltip' }
            ).openTooltip()
          },
          mouseout(e) {
            geoLayer.resetStyle(e.target)
            e.target.unbindTooltip()
          },
          click(e) {
            if (isOutsideFocus(name, focusDistrictRef.current)) return
            onSelectRef.current?.(name)
            const sid = schemeIdRef.current
            if (!sid) return
            const data = districtMapRef.current.get(name)
            const count = data?.totalCitizens ?? 0
            openDrillPopup(map, e.latlng, name, count, sid, popupRef)
          },
        })
      },
    })
    geoLayer.addTo(map)
    geoLayerRef.current = geoLayer

    // invalidateSize first, then fitBounds so Leaflet uses the true container dimensions
    setTimeout(() => {
      map.invalidateSize()
      map.fitBounds([[20.1, 68.1], [24.7, 74.5]], { padding: [20, 20] })
    }, 150)

    return () => {
      map.remove()
      mapRef.current = null
      geoLayerRef.current = null
      popupRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-style polygons whenever district data or selection changes
  useEffect(() => {
    const geoLayer = geoLayerRef.current
    if (!geoLayer) return
    geoLayer.setStyle((feature) => {
      const name = feature.properties.name
      if (isOutsideFocus(name, focusDistrict)) {
        return {
          fillColor: '#cbd5e1',
          fillOpacity: 0.22,
          color: '#ffffff',
          weight: 1,
          opacity: 1,
        }
      }
      const data = districtMap.get(name)
      const count = data?.totalCitizens ?? 0
      return {
        fillColor: choroplethColor(count, maxCount, selectedDistrict === name),
        fillOpacity: 0.7,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
      }
    })
  }, [districtMap, maxCount, selectedDistrict, focusDistrict])

  return (
    <div className="gcm-wrap">
      <div className="gcm-header">
        <div className="gcm-legend-row">
          <span className="gcm-legend-label">Beneficiary density</span>
          <div className="gcm-gradient-bar">
            <span className="gcm-legend-end">None</span>
            <div className="gcm-gradient" />
            <span className="gcm-legend-end">High</span>
          </div>
        </div>
        <div className="gcm-total-pill">
          {totalCitizens.toLocaleString()} total beneficiaries
        </div>
      </div>

      <div className="gcm-map-container">
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>

      {topDistricts.length > 0 && (
        <div className="gcm-district-pills">
          <span className="gcm-pills-label">Top districts:</span>
          {topDistricts
            .filter((d) => !focusDistrict || !isOutsideFocus(d.districtName, focusDistrict))
            .map(d => (
            <button
              key={d.districtName}
              type="button"
              className={`gcm-pill ${selectedDistrict === d.districtName ? 'gcm-pill-active' : ''}`}
              onClick={() => onSelectDistrict?.(d.districtName)}
            >
              {d.districtName}
              <span className="gcm-pill-count">{(d.totalCitizens ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
