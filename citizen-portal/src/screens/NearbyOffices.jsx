import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import {
  fetchActiveSchemes,
  fetchNearbyOffices,
  fetchOfficeFilters,
  fetchTalukasForDistrict,
  fetchVillagesForTaluka,
} from '../api'
import LandingChromeHeader from '../components/LandingChromeHeader'
import OfficesMap from '../components/OfficesMap'
import { directionsUrl, fetchRoadRoute, geocodePlace, haversineKm } from '../utils/officeRouting'
import './NearbyOffices.css'

const OFFICE_CHIP_TYPES = [
  'JAN_SEVA_KENDRA',
  'MAMLATDAR',
  'DISTRICT_COLLECTORATE',
  'DEPARTMENT_OFFICE',
  'TALUKA_PANCHAYAT',
]

const GEO_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000,
}

export default function NearbyOffices({ guestShell = false }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialSchemeId = searchParams.get('schemeId') || ''

  const [schemes, setSchemes] = useState([])
  const [filters, setFilters] = useState(null)
  const [schemeId, setSchemeId] = useState(initialSchemeId)
  const [schemeQuery, setSchemeQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [taluka, setTaluka] = useState('')
  const [village, setVillage] = useState('')
  const [registryTalukas, setRegistryTalukas] = useState([])
  const [registryVillages, setRegistryVillages] = useState([])
  const [villagesLoading, setVillagesLoading] = useState(false)
  const [officeTypes, setOfficeTypes] = useState([])
  const [locateMode, setLocateMode] = useState('manual')
  const [origin, setOrigin] = useState(null) // { lat, lng, label, kind: 'gps' | 'entered' }
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState(null)
  const [placeSearching, setPlaceSearching] = useState(false)
  const [placeError, setPlaceError] = useState(null)
  const [viewMode, setViewMode] = useState('cards')
  const [route, setRoute] = useState(null) // { status, kind, coords, distanceKm, durationMin }
  const [geoError, setGeoError] = useState(null)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [result, setResult] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mobilePane, setMobilePane] = useState('list')

  const fetchAbort = useRef(null)
  const debounceRef = useRef(null)
  const [wideLayout, setWideLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)')
    const onChange = () => setWideLayout(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const lang = i18n.language
  const landingLang = lang === 'gu' ? 'gu' : 'en'

  function toggleLang() {
    const next = lang === 'en' ? 'gu' : 'en'
    localStorage.setItem('lang', next)
    i18n.changeLanguage(next)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchActiveSchemes(), fetchOfficeFilters()])
      .then(([schemeRows, filterRows]) => {
        if (cancelled) return
        setSchemes(schemeRows)
        setFilters(filterRows)
      })
      .catch(() => {
        if (!cancelled) setFetchError(t('nearbyOffices.errorLoad'))
      })
    return () => { cancelled = true }
  }, [t])

  useEffect(() => {
    if (initialSchemeId) setSchemeId(initialSchemeId)
  }, [initialSchemeId])

  // Talukas: those with a listed office plus the ones the rest of the portal uses (family registry).
  useEffect(() => {
    setRegistryTalukas([])
    if (!district) return undefined
    let cancelled = false
    Promise.resolve(fetchTalukasForDistrict(district))
      .then((rows) => { if (!cancelled) setRegistryTalukas(Array.isArray(rows) ? rows : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [district])

  const talukaOptions = useMemo(() => {
    if (!district) return []
    const fromOffices = filters?.talukasByDistrict?.[district] || []
    return [...new Set([...fromOffices, ...registryTalukas])].sort((a, b) => a.localeCompare(b))
  }, [filters, district, registryTalukas])

  // Villages / city areas follow the chosen taluka: those that have an office plus the registry's.
  const villageOptions = useMemo(() => {
    if (!district || !taluka) return []
    const fromOffices = filters?.villagesByTaluka?.[district]?.[taluka] || []
    return [...new Set([...fromOffices, ...registryVillages])].sort((a, b) => a.localeCompare(b))
  }, [filters, district, taluka, registryVillages])

  // Villages follow the chosen taluka (same geography source as the eligibility form).
  useEffect(() => {
    setRegistryVillages([])
    if (!district || !taluka) {
      setVillagesLoading(false)
      return undefined
    }
    let cancelled = false
    setVillagesLoading(true)
    Promise.resolve(fetchVillagesForTaluka(district, taluka))
      .then((rows) => { if (!cancelled) setRegistryVillages(Array.isArray(rows) ? rows : []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVillagesLoading(false) })
    return () => { cancelled = true }
  }, [district, taluka])

  const filteredSchemes = useMemo(() => {
    const q = schemeQuery.trim().toLowerCase()
    if (!q) return schemes
    return schemes.filter((s) => {
      const name = (s.name || '').toLowerCase()
      const gu = (s.nameGujarati || '').toLowerCase()
      return name.includes(q) || gu.includes(q)
    })
  }, [schemes, schemeQuery])

  // Only the point we search around should retrigger a fetch; in district mode a starting point is
  // used just for distances and directions.
  const searchCenter = locateMode === 'geo' ? origin : null

  const runFetch = useCallback(() => {
    if (fetchAbort.current) fetchAbort.current.abort()
    const controller = new AbortController()
    fetchAbort.current = controller

    const params = {
      limit: 50,
      radiusKm: 25,
    }
    if (schemeId) params.schemeId = schemeId
    if (officeTypes.length) params.officeType = officeTypes

    if (locateMode === 'geo' && origin) {
      params.lat = origin.lat
      params.lng = origin.lng
    } else {
      if (!district) {
        setResult(null)
        return
      }
      params.district = district
      if (taluka) params.taluka = taluka
      if (village.trim()) params.village = village.trim()
    }

    setLoading(true)
    setFetchError(null)
    fetchNearbyOffices(params, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setResult(data)
        setSelectedId(data?.offices?.[0]?.id ?? null)
      })
      .catch((err) => {
        if (err.name === 'AbortError' || controller.signal.aborted) return
        setFetchError(err.message || t('nearbyOffices.errorFetch'))
        setResult(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
  }, [schemeId, officeTypes, locateMode, searchCenter, district, taluka, village, t])

  useEffect(() => {
    if (locateMode === 'geo') {
      if (searchCenter) runFetch()
      return
    }
    if (!district) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runFetch, 350)
    return () => clearTimeout(debounceRef.current)
  }, [locateMode, searchCenter, district, taluka, village, schemeId, officeTypes, runFetch])

  function useMyLocation() {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError(t('nearbyOffices.geoUnsupported'))
      setLocateMode('manual')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: t('nearbyOffices.startGps'),
          kind: 'gps',
        })
        setPlaceResults(null)
        setLocateMode('geo')
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocateMode('manual')
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(t('nearbyOffices.geoDenied'))
        } else if (err.code === err.TIMEOUT) {
          setGeoError(t('nearbyOffices.geoTimeout'))
        } else {
          setGeoError(t('nearbyOffices.geoError'))
        }
      },
      GEO_OPTIONS,
    )
  }

  async function searchPlace(e) {
    e?.preventDefault()
    const q = placeQuery.trim()
    if (q.length < 3) {
      setPlaceError(t('nearbyOffices.placeTooShort'))
      return
    }
    setPlaceError(null)
    setPlaceSearching(true)
    setPlaceResults(null)
    try {
      const rows = await geocodePlace(q)
      if (rows.length === 0) setPlaceError(t('nearbyOffices.placeNotFound'))
      setPlaceResults(rows)
    } catch {
      setPlaceError(t('nearbyOffices.placeError'))
    } finally {
      setPlaceSearching(false)
    }
  }

  function pickPlace(row) {
    setOrigin({ lat: row.lat, lng: row.lng, label: row.label, kind: 'entered' })
    setPlaceResults(null)
    setPlaceError(null)
    setGeoError(null)
    setLocateMode('geo')
  }

  function clearOrigin() {
    setOrigin(null)
    setPlaceResults(null)
    setPlaceQuery('')
    setRoute(null)
    setLocateMode('manual')
  }

  function toggleOfficeType(type) {
    setOfficeTypes((prev) => (
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]
    ))
  }

  function officeDisplayName(o) {
    return lang === 'gu' && o.nameGujarati ? o.nameGujarati : o.name
  }

  function formatDistance(km) {
    if (km == null) return null
    if (km < 1) return t('nearbyOffices.distanceM', { m: Math.round(km * 1000) })
    return t('nearbyOffices.distanceKm', { km: km.toFixed(1) })
  }

  const mapCenter = useMemo(() => {
    if (result?.mapCenterLat != null && result?.mapCenterLng != null) {
      return { lat: result.mapCenterLat, lng: result.mapCenterLng }
    }
    return null
  }, [result])

  const offices = useMemo(() => {
    const rows = result?.offices ?? []
    if (!origin) return rows
    // District searches carry no distance; derive a straight-line one from the starting point.
    return rows.map((o) => (o.distanceKm != null
      ? o
      : { ...o, distanceKm: haversineKm(origin, { lat: o.latitude, lng: o.longitude }) }))
  }, [result, origin])
  const resultCount = offices.length
  const selectedOffice = useMemo(
    () => offices.find((o) => o.id === selectedId) || null,
    [offices, selectedId],
  )

  // Road route from the starting point to the selected office (selected only, to be gentle on OSRM).
  useEffect(() => {
    if (!origin || !selectedOffice) {
      setRoute(null)
      return undefined
    }
    const dest = { lat: selectedOffice.latitude, lng: selectedOffice.longitude }
    const straight = {
      status: 'straight',
      kind: 'straight',
      coords: [[origin.lat, origin.lng], [dest.lat, dest.lng]],
      distanceKm: haversineKm(origin, dest),
    }
    const controller = new AbortController()
    setRoute({ ...straight, status: 'loading' })
    fetchRoadRoute(origin, dest, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return
        setRoute({ status: 'road', kind: 'road', coords: r.coords, distanceKm: r.distanceKm, durationMin: r.durationMin })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoute(straight)
      })
    return () => controller.abort()
  }, [origin, selectedOffice])

  function officeDirectionsHref(o) {
    return directionsUrl({ lat: o.latitude, lng: o.longitude }, origin)
  }

  const body = (
    <div className="nearby-offices-page">
      <header className="nearby-offices-hero">
        <h1>{t('nearbyOffices.title')}</h1>
        <p className="muted">{t('nearbyOffices.subtitle')}</p>
      </header>

      <div className="nearby-offices-card card">
        <h2 className="nearby-offices-card-title">{t('nearbyOffices.findTitle')}</h2>

        <div className="nearby-field scheme-picker">
          <label htmlFor="office-scheme">{t('nearbyOffices.schemeLabel')}</label>
          <input
            id="office-scheme-search"
            type="search"
            className="scheme-search"
            value={schemeQuery}
            onChange={(e) => setSchemeQuery(e.target.value)}
            placeholder={t('nearbyOffices.schemeSearchPlaceholder')}
            autoComplete="off"
          />
          <select
            id="office-scheme"
            value={schemeId}
            onChange={(e) => setSchemeId(e.target.value)}
          >
            <option value="">{t('nearbyOffices.anyService')}</option>
            {filteredSchemes.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === 'gu' && s.nameGujarati ? s.nameGujarati : s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="nearby-locate-row">
          <button
            type="button"
            className="btn-primary locate-btn"
            onClick={useMyLocation}
            disabled={locating}
          >
            {locating ? t('nearbyOffices.locating') : t('nearbyOffices.useMyLocation')}
          </button>
          <p className="locate-privacy muted small">{t('nearbyOffices.locationPrivacy')}</p>
        </div>
        {geoError && <p className="geo-error" role="alert">{geoError}</p>}

        <form className="nearby-place-form" onSubmit={searchPlace}>
          <label htmlFor="office-place">{t('nearbyOffices.enterLocationLabel')}</label>
          <div className="nearby-place-row">
            <input
              id="office-place"
              type="search"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder={t('nearbyOffices.enterLocationPlaceholder')}
              autoComplete="off"
            />
            <button type="submit" className="btn-secondary" disabled={placeSearching}>
              {placeSearching ? t('nearbyOffices.searching') : t('nearbyOffices.enterLocationButton')}
            </button>
          </div>
          {placeError && <p className="geo-error" role="alert">{placeError}</p>}
          {placeResults?.length > 0 && (
            <ul className="place-suggestions" aria-label={t('nearbyOffices.placePickPrompt')}>
              {placeResults.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button type="button" onClick={() => pickPlace(r)}>{r.label}</button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {origin && (
          <p className="start-point" role="status">
            <span className="muted small">{t('nearbyOffices.startingPoint')}</span>
            <strong>{origin.label}</strong>
            <button type="button" className="link-btn" onClick={clearOrigin}>{t('nearbyOffices.clearStart')}</button>
          </p>
        )}
        <p className="muted small third-party-note">{t('nearbyOffices.thirdPartyNote')}</p>

        <div className="nearby-geo-grid">
          <label>
            <span>{t('nearbyOffices.district')}</span>
            <select
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value)
                setTaluka('')
                setVillage('')
                setLocateMode('manual')
              }}
            >
              <option value="">{t('nearbyOffices.selectDistrict')}</option>
              {(filters?.districts || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('nearbyOffices.taluka')}</span>
            <select
              value={taluka}
              disabled={!district}
              onChange={(e) => { setTaluka(e.target.value); setVillage(''); setLocateMode('manual') }}
            >
              <option value="">{t('nearbyOffices.allTalukas')}</option>
              {talukaOptions.map((tl) => (
                <option key={tl} value={tl}>{tl}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('nearbyOffices.village')}</span>
            {villageOptions.length > 0 ? (
              <select
                value={village}
                onChange={(e) => { setVillage(e.target.value); setLocateMode('manual') }}
              >
                <option value="">{t('nearbyOffices.allVillages')}</option>
                {villageOptions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : taluka && !villagesLoading ? (
              <input
                type="text"
                value={village}
                onChange={(e) => { setVillage(e.target.value); setLocateMode('manual') }}
                placeholder={t('nearbyOffices.villageNoList')}
              />
            ) : (
              <select disabled value="">
                <option value="">
                  {villagesLoading ? t('nearbyOffices.loadingVillages') : t('nearbyOffices.selectTalukaFirst')}
                </option>
              </select>
            )}
          </label>
        </div>

        <div className="office-type-chips" role="group" aria-label={t('nearbyOffices.officeTypeFilter')}>
          {OFFICE_CHIP_TYPES.map((type) => {
            const pressed = officeTypes.includes(type)
            return (
              <button
                key={type}
                type="button"
                className={`type-chip${pressed ? ' active' : ''}`}
                aria-pressed={pressed}
                onClick={() => toggleOfficeType(type)}
              >
                {t(`nearbyOffices.officeType.${type}`)}
              </button>
            )
          })}
        </div>
      </div>

      {result?.demoData && (
        <p className="demo-notice" role="status">{t('nearbyOffices.demoNotice')}</p>
      )}

      <p className="sr-only" aria-live="polite">
        {loading ? t('nearbyOffices.loading') : t('nearbyOffices.resultCount', { count: resultCount })}
      </p>

      {fetchError && <p className="fetch-error" role="alert">{fetchError}</p>}

      {result?.widened && (
        <p className="widened-notice" role="status">
          {locateMode === 'geo'
            ? t('nearbyOffices.widened', { district: result.widenedDistrict || district })
            : t('nearbyOffices.widenedTaluka', { taluka, district: result.widenedDistrict || district })}
        </p>
      )}

      <div className="results-toolbar">
        <div className="view-switch" role="group" aria-label={t('nearbyOffices.viewSwitchLabel')}>
          <button
            type="button"
            aria-pressed={viewMode === 'cards'}
            className={viewMode === 'cards' ? 'active' : ''}
            onClick={() => setViewMode('cards')}
          >
            {t('nearbyOffices.viewCards')}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'table'}
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
          >
            {t('nearbyOffices.viewTable')}
          </button>
        </div>
        {resultCount > 0 && (
          <span className="muted small">{t('nearbyOffices.resultCount', { count: resultCount })}</span>
        )}
      </div>

      {viewMode === 'cards' && (
        <div className="mobile-pane-toggle" role="group" aria-label={t('nearbyOffices.viewToggle')}>
          <button
            type="button"
            aria-pressed={mobilePane === 'list'}
            className={mobilePane === 'list' ? 'active' : ''}
            onClick={() => setMobilePane('list')}
          >
            {t('nearbyOffices.listView')}
          </button>
          <button
            type="button"
            aria-pressed={mobilePane === 'map'}
            className={mobilePane === 'map' ? 'active' : ''}
            onClick={() => setMobilePane('map')}
          >
            {t('nearbyOffices.mapView')}
          </button>
        </div>
      )}

      <div className={`nearby-results-layout view-${viewMode}`}>
        {viewMode === 'cards' && (
          <div className={`nearby-list-pane${mobilePane === 'map' ? ' mobile-hidden' : ''}`}>
            {loading && <p className="muted">{t('nearbyOffices.loading')}</p>}
            {!loading && !district && locateMode !== 'geo' && (
              <p className="muted">{t('nearbyOffices.pickLocation')}</p>
            )}
            {!loading && offices.length === 0 && (district || locateMode === 'geo') && (
              <p className="muted">{t('nearbyOffices.noResults')}</p>
            )}
            <ul className="office-card-list">
              {offices.map((o) => {
                const selected = o.id === selectedId
                return (
                  <li key={o.id}>
                    <div
                      className={`office-card${selected ? ' selected' : ''}`}
                      onClick={() => setSelectedId(o.id)}
                    >
                      <div className="office-card-head">
                        <strong>{officeDisplayName(o)}</strong>
                        <span className="type-pill">
                          {t(`nearbyOffices.officeType.${o.officeType}`, { defaultValue: o.officeType })}
                        </span>
                      </div>
                      <p className="office-address">{o.address}</p>
                      <div className="office-meta">
                        {o.distanceKm != null && (
                          <span className="distance">{formatDistance(o.distanceKm)}</span>
                        )}
                        {o.isOpenNow === true && (
                          <span className="open-pill open">{t('nearbyOffices.openNow')}</span>
                        )}
                        {o.isOpenNow === false && (
                          <span className="open-pill closed">{t('nearbyOffices.closedNow')}</span>
                        )}
                      </div>
                      {o.workingHours && (
                        <p className="muted small">{o.workingHours}{o.weeklyOff ? ` · ${o.weeklyOff}` : ''}</p>
                      )}
                      <div className="office-links">
                        {o.phone && (
                          <a href={`tel:${o.phone.replace(/\s/g, '')}`}>{o.phone}</a>
                        )}
                        {o.email && <a href={`mailto:${o.email}`}>{o.email}</a>}
                        <a
                          href={officeDirectionsHref(o)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('nearbyOffices.getDirections')}
                        </a>
                        <button
                          type="button"
                          className="link-btn show-on-map"
                          aria-pressed={selected}
                          onClick={() => { setSelectedId(o.id); setMobilePane('map') }}
                        >
                          {t('nearbyOffices.showOnMap')}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className={`nearby-map-pane card${viewMode === 'cards' && mobilePane === 'list' ? ' mobile-hidden' : ''}`}>
          <OfficesMap
            offices={offices}
            origin={origin}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mapCenter={mapCenter}
            visible={viewMode === 'table' || wideLayout || mobilePane === 'map'}
            route={route && route.status !== 'loading' ? route : null}
            layoutKey={viewMode}
          />
          {route && selectedOffice && (
            <p className={`route-summary ${route.kind === 'road' ? 'road' : 'straight'}`} role="status">
              {route.status === 'loading' && t('nearbyOffices.routeLoading')}
              {route.status === 'road' && t('nearbyOffices.routeRoad', {
                km: route.distanceKm.toFixed(1),
                min: route.durationMin,
                name: officeDisplayName(selectedOffice),
              })}
              {route.status === 'straight' && t('nearbyOffices.routeStraight', {
                km: route.distanceKm.toFixed(1),
                name: officeDisplayName(selectedOffice),
              })}
            </p>
          )}
          {!origin && offices.length > 0 && (
            <p className="route-summary hint">{t('nearbyOffices.routeHint')}</p>
          )}
        </div>

        {viewMode === 'table' && (
          <div className="nearby-table-pane">
            {loading && <p className="muted">{t('nearbyOffices.loading')}</p>}
            {!loading && offices.length === 0 && (district || locateMode === 'geo') && (
              <p className="muted">{t('nearbyOffices.noResults')}</p>
            )}
            {offices.length > 0 && (
              <div className="office-table-wrap">
                <table className="office-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('nearbyOffices.colOffice')}</th>
                      <th scope="col">{t('nearbyOffices.colAddress')}</th>
                      <th scope="col">{t('nearbyOffices.colPhone')}</th>
                      <th scope="col">{t('nearbyOffices.colEmail')}</th>
                      <th scope="col">{t('nearbyOffices.colHours')}</th>
                      <th scope="col" className="num">{t('nearbyOffices.colDistance')}</th>
                      <th scope="col">{t('nearbyOffices.colDirections')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offices.map((o) => (
                      <tr
                        key={o.id}
                        className={o.id === selectedId ? 'selected' : ''}
                        onClick={() => setSelectedId(o.id)}
                      >
                        <th scope="row" className="col-office">
                          <span className="office-name">{officeDisplayName(o)}</span>
                          <span className="type-pill">
                            {t(`nearbyOffices.officeType.${o.officeType}`, { defaultValue: o.officeType })}
                          </span>
                        </th>
                        <td>{o.address}</td>
                        <td>{o.phone ? <a href={`tel:${o.phone.replace(/\s/g, '')}`}>{o.phone}</a> : '—'}</td>
                        <td>{o.email ? <a href={`mailto:${o.email}`}>{o.email}</a> : '—'}</td>
                        <td>
                          <span>{o.workingHours || '—'}</span>
                          {o.weeklyOff && <span className="muted small block">{o.weeklyOff}</span>}
                          {o.isOpenNow === true && <span className="open-pill open">{t('nearbyOffices.openNow')}</span>}
                          {o.isOpenNow === false && <span className="open-pill closed">{t('nearbyOffices.closedNow')}</span>}
                        </td>
                        <td className="num">{o.distanceKm != null ? formatDistance(o.distanceKm) : '—'}</td>
                        <td>
                          <a
                            className="btn-secondary small"
                            href={officeDirectionsHref(o)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('nearbyOffices.getDirections')}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {!guestShell && (
        <p className="back-link-wrap">
          <Link to="/eligibility-check">{t('nearbyOffices.backEligibility')}</Link>
        </p>
      )}
    </div>
  )

  if (!guestShell) {
    return (
      <div className="nearby-offices-authed">
        {body}
      </div>
    )
  }

  return (
    <div className={`dg-landing eligibility-on-landing${landingLang === 'gu' ? ' dg-landing-gu' : ''}`}>
      <LandingChromeHeader lang={landingLang} onToggleLang={toggleLang} activeRoute="/nearby-offices" />
      <main className="eligibility-guest-main" id="main-content">{body}</main>
    </div>
  )
}
