import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from 'react-i18next'
import { directionsUrl } from '../utils/officeRouting'
import './OfficesMap.css'

const TYPE_COLORS = {
  JAN_SEVA_KENDRA: '#e4691f',
  MAMLATDAR: '#2563eb',
  DISTRICT_COLLECTORATE: '#7c3aed',
  DEPARTMENT_OFFICE: '#059669',
  TALUKA_PANCHAYAT: '#0d9488',
}

function markerColor(officeType) {
  return TYPE_COLORS[officeType] || '#64748b'
}

/**
 * Popup content is built from DOM nodes with textContent. Office names, addresses and phones can come
 * from an imported CSV, so they must never be interpolated into an HTML string.
 */
export function buildOfficePopup(office, { typeLabel, directionsLabel, origin }) {
  const root = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = office.name || ''
  root.appendChild(name)

  const type = document.createElement('div')
  type.textContent = typeLabel || ''
  root.appendChild(type)

  if (office.phone) {
    const phone = document.createElement('div')
    phone.textContent = office.phone
    root.appendChild(phone)
  }

  const link = document.createElement('a')
  link.href = directionsUrl({ lat: office.latitude, lng: office.longitude }, origin)
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = directionsLabel || ''
  root.appendChild(link)
  return root
}

function markerStyle(office, selected) {
  const color = markerColor(office.officeType)
  return {
    radius: selected ? 11 : 8,
    color: selected ? '#0f172a' : color,
    weight: selected ? 3 : 2,
    fillColor: color,
    fillOpacity: 0.85,
  }
}

export default function OfficesMap({
  offices = [],
  origin = null,
  selectedId = null,
  onSelect,
  mapCenter = null,
  visible = true,
  route = null, // { kind: 'road' | 'straight', coords: [[lat, lng], ...] }
  layoutKey = '', // change when the surrounding layout resizes the map container
}) {
  const { t } = useTranslation()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const officeLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markersRef = useRef(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([22.5, 71.5], 7)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)
    routeLayerRef.current = L.layerGroup().addTo(map)
    officeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      officeLayerRef.current = null
      routeLayerRef.current = null
      markersRef.current = new Map()
    }
  }, [])

  // Draw offices + starting point, then fit the view. Selection only restyles (see below).
  useEffect(() => {
    const map = mapRef.current
    const group = officeLayerRef.current
    if (!map || !group) return

    group.clearLayers()
    markersRef.current = new Map()
    const bounds = []

    offices.forEach((o) => {
      const marker = L.circleMarker([o.latitude, o.longitude], markerStyle(o, false))
      marker.bindPopup(buildOfficePopup(o, {
        typeLabel: t(`nearbyOffices.officeType.${o.officeType}`, { defaultValue: o.officeType }),
        directionsLabel: t('nearbyOffices.getDirections'),
        origin,
      }))
      marker.on('click', () => onSelectRef.current?.(o.id))
      marker.addTo(group)
      markersRef.current.set(o.id, { marker, office: o })
      bounds.push([o.latitude, o.longitude])
    })

    if (origin) {
      const you = L.circleMarker([origin.lat, origin.lng], {
        radius: 9,
        color: '#dc2626',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
      })
      you.bindTooltip(origin.label || t('nearbyOffices.youAreHere'), { permanent: false })
      you.addTo(group)
      bounds.push([origin.lat, origin.lng])
    }

    if (!visible) return
    requestAnimationFrame(() => {
      map.invalidateSize()
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
      } else if (mapCenter?.lat != null && mapCenter?.lng != null) {
        map.setView([mapCenter.lat, mapCenter.lng], 10)
      }
    })
  }, [offices, origin, mapCenter, visible, t])

  // Selection: highlight the pin and pan to it without re-fitting the whole view.
  useEffect(() => {
    markersRef.current.forEach(({ marker, office }, id) => {
      const selected = id === selectedId
      marker.setStyle(markerStyle(office, selected))
      if (selected) marker.bringToFront()
    })
    const picked = selectedId ? markersRef.current.get(selectedId) : null
    if (picked && mapRef.current) {
      mapRef.current.panTo([picked.office.latitude, picked.office.longitude], { animate: true })
    }
  }, [selectedId, offices])

  useEffect(() => {
    const layer = routeLayerRef.current
    const map = mapRef.current
    if (!layer || !map) return
    layer.clearLayers()
    if (!route?.coords?.length) return
    const line = L.polyline(route.coords, route.kind === 'road'
      ? { color: '#2563eb', weight: 5, opacity: 0.85 }
      : { color: '#64748b', weight: 3, opacity: 0.9, dashArray: '8 8' })
    line.addTo(layer)
    if (visible) {
      requestAnimationFrame(() => {
        map.invalidateSize()
        map.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 15 })
      })
    }
  }, [route, visible])

  useEffect(() => {
    if (!visible || !mapRef.current) return undefined
    const map = mapRef.current
    // Leaflet must be told when its container is resized, otherwise tiles only fill the old size.
    const first = requestAnimationFrame(() => map.invalidateSize())
    const second = setTimeout(() => map.invalidateSize(), 120)
    return () => {
      cancelAnimationFrame(first)
      clearTimeout(second)
    }
  }, [visible, layoutKey])

  return (
    <div
      ref={containerRef}
      className="offices-map-leaflet"
      role="region"
      aria-label={t('nearbyOffices.mapLabel')}
    />
  )
}
