/**
 * Directions helpers for the nearby-offices page.
 *
 * Third-party services (the person's starting point is sent to them only when they ask for it):
 *  - OpenStreetMap Nominatim: turn a typed place into coordinates.
 *  - OSRM (default: the public demo server): driving route line, distance and time.
 *    Point VITE_OSRM_URL at your own instance for production; the public server is rate limited.
 *  - Google Maps: "Get directions" opens in a new tab and does its own routing.
 * Every call fails soft: the page falls back to a straight line and the Google Maps link.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OSRM_URL = (import.meta.env && import.meta.env.VITE_OSRM_URL) || 'https://router.project-osrm.org'

// Gujarat bounding box (left, top, right, bottom) used to keep place search local.
const GUJARAT_VIEWBOX = '68.1,24.8,74.5,20.0'

export function haversineKm(a, b) {
  const R = 6371
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Google Maps directions link; `origin` is optional (Google then asks for / uses the device location). */
export function directionsUrl(dest, origin) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
    travelmode: 'driving',
  })
  if (origin && origin.lat != null && origin.lng != null) {
    params.set('origin', `${origin.lat},${origin.lng}`)
  }
  return `https://www.google.com/maps/dir/?${params}`
}

function shortLabel(displayName) {
  // "Navrangpura, Ahmedabad, Ahmedabad District, Gujarat, 380009, India" -> first three parts
  return String(displayName || '').split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ')
}

/** @returns {Promise<{label: string, lat: number, lng: number}[]>} */
export async function geocodePlace(query, signal) {
  const q = String(query || '').trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    countrycodes: 'in',
    viewbox: GUJARAT_VIEWBOX,
    bounded: '1',
    limit: '5',
  })
  const res = await fetch(`${NOMINATIM_URL}?${params}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Place search failed (HTTP ${res.status})`)
  const rows = await res.json()
  return rows
    .map((r) => ({ label: shortLabel(r.display_name), lat: parseFloat(r.lat), lng: parseFloat(r.lon) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
}

/** @returns {Promise<{coords: [number, number][], distanceKm: number, durationMin: number}>} */
export async function fetchRoadRoute(origin, dest, signal) {
  const path = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`
  const res = await fetch(`${OSRM_URL}/route/v1/driving/${path}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`)
  const data = await res.json()
  const route = data?.routes?.[0]
  if (data?.code !== 'Ok' || !route) throw new Error('No road route found')
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
  }
}
