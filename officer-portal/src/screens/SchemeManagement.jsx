import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchGeographicDistricts,
  fetchGeographicTalukas,
  fetchGeographicVillages,
  fetchSchemeStatusCounts,
  SCHEME_API,
} from '../api'
import { getOfficerAccessToken, getOfficerDistrictScope, matchesOfficerDistrict } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import { CATEGORY_META, categoryLabel } from '../constants/schemeCategories'
import {
  collectSchemeExportData,
  downloadSchemeExcel,
  downloadSchemePdf,
} from '../utils/schemeExport'
import './SchemeManagement.css'

const PIPELINE = [
  { key: 'IDENTIFIED', label: 'Identified', icon: '🔍', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: '✓', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'ACTIVE', label: 'Active', icon: '⚡', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'REMOVED', label: 'Removed', icon: '✕', color: '#dc2626', bg: '#fff5f5', border: '#fecaca' },
]

const DISTRICT_PAGE_SIZE = 15
const CHILD_PAGE_SIZE = 20
const DEMO_DEFAULT_SCHEME_ID = 'a1000001-0000-0000-0000-000000000001'

function stageStyle(key) {
  return PIPELINE.find(p => p.key === key) || PIPELINE[0]
}

function normalizeSchemeId(id) {
  if (id == null || id === '') return null
  const text = String(id).trim()
  if (!text || text === 'NaN' || text === 'undefined') return null
  return text
}

function schemeIdsMatch(a, b) {
  const left = normalizeSchemeId(a)
  const right = normalizeSchemeId(b)
  return Boolean(left && right && left === right)
}

function SortTh({ col, label, sortCol, sortDir, onSort, align = 'left' }) {
  const active = sortCol === col
  return (
    <th
      className={`sm-geo-th-sort sm-geo-th-${align} ${active ? 'sm-geo-th-sort-active' : ''}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="sm-geo-sort-icon">{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
    </th>
  )
}

function GeoPagination({ offset, limit, total, onPageChange }) {
  if (total <= limit) return null
  const page = Math.floor(offset / limit)
  const totalPages = Math.ceil(total / limit)
  return (
    <div className="sm-geo-pagination">
      <button type="button" className="sm-btn-secondary" disabled={offset <= 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
        ‹ Previous
      </button>
      <span className="muted">Page {page + 1} of {totalPages} · {total.toLocaleString()} total</span>
      <button type="button" className="sm-btn-secondary" disabled={offset + limit >= total} onClick={() => onPageChange(offset + limit)}>
        Next ›
      </button>
    </div>
  )
}

function GeographicExplorer({ schemeId, statusTotal }) {
  const districtScope = getOfficerDistrictScope()
  const [districtRows, setDistrictRows] = useState([])
  const [districtMeta, setDistrictMeta] = useState(null)
  const [districtSearch, setDistrictSearch] = useState(districtScope || '')
  const [districtSortCol, setDistrictSortCol] = useState('name')
  const [districtSortDir, setDistrictSortDir] = useState('asc')
  const [districtOffset, setDistrictOffset] = useState(0)
  const [districtLoading, setDistrictLoading] = useState(false)

  const [expandedDistrict, setExpandedDistrict] = useState(null)
  const [talukaRows, setTalukaRows] = useState([])
  const [talukaMeta, setTalukaMeta] = useState(null)
  const [talukaSearch, setTalukaSearch] = useState('')
  const [talukaSortCol, setTalukaSortCol] = useState('name')
  const [talukaSortDir, setTalukaSortDir] = useState('asc')
  const [talukaOffset, setTalukaOffset] = useState(0)
  const [talukaLoading, setTalukaLoading] = useState(false)

  const [expandedTaluka, setExpandedTaluka] = useState(null)
  const [villageRows, setVillageRows] = useState([])
  const [villageMeta, setVillageMeta] = useState(null)
  const [villageSearch, setVillageSearch] = useState('')
  const [villageSortCol, setVillageSortCol] = useState('name')
  const [villageSortDir, setVillageSortDir] = useState('asc')
  const [villageOffset, setVillageOffset] = useState(0)
  const [villageLoading, setVillageLoading] = useState(false)

  const loadDistricts = useCallback(async () => {
    setDistrictLoading(true)
    try {
      const data = await fetchGeographicDistricts(schemeId, {
        search: districtScope || districtSearch || undefined,
        sortBy: districtSortCol,
        sortDir: districtSortDir,
        offset: districtOffset,
        limit: DISTRICT_PAGE_SIZE,
      })
      const rows = data.results ?? []
      setDistrictRows(
        districtScope
          ? rows.filter((r) => matchesOfficerDistrict(r.name, districtScope))
          : rows,
      )
      setDistrictMeta(data)
    } catch {
      setDistrictRows([])
      setDistrictMeta(null)
    } finally {
      setDistrictLoading(false)
    }
  }, [schemeId, districtSearch, districtSortCol, districtSortDir, districtOffset, districtScope])

  useEffect(() => {
    setExpandedDistrict(null)
    setExpandedTaluka(null)
    setDistrictSearch('')
    setDistrictOffset(0)
    setTalukaSearch('')
    setTalukaOffset(0)
    setVillageSearch('')
    setVillageOffset(0)
  }, [schemeId])

  useEffect(() => {
    const t = setTimeout(loadDistricts, districtSearch ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadDistricts, districtSearch])

  async function loadTalukas(district, offset = 0) {
    setTalukaLoading(true)
    try {
      const data = await fetchGeographicTalukas(schemeId, district, {
        search: talukaSearch || undefined,
        sortBy: talukaSortCol,
        sortDir: talukaSortDir,
        offset,
        limit: CHILD_PAGE_SIZE,
      })
      setTalukaRows(data.results ?? [])
      setTalukaMeta(data)
      setTalukaOffset(offset)
    } catch {
      setTalukaRows([])
      setTalukaMeta(null)
    } finally {
      setTalukaLoading(false)
    }
  }

  async function loadVillages(district, taluka, offset = 0) {
    setVillageLoading(true)
    try {
      const data = await fetchGeographicVillages(schemeId, district, taluka, {
        search: villageSearch || undefined,
        sortBy: villageSortCol,
        sortDir: villageSortDir,
        offset,
        limit: CHILD_PAGE_SIZE,
      })
      setVillageRows(data.results ?? [])
      setVillageMeta(data)
      setVillageOffset(offset)
    } catch {
      setVillageRows([])
      setVillageMeta(null)
    } finally {
      setVillageLoading(false)
    }
  }

  useEffect(() => {
    if (!expandedDistrict) return undefined
    const t = setTimeout(() => loadTalukas(expandedDistrict, talukaOffset), talukaSearch ? 350 : 0)
    return () => clearTimeout(t)
  }, [expandedDistrict, talukaSearch, talukaSortCol, talukaSortDir, talukaOffset])

  useEffect(() => {
    if (!expandedDistrict || !expandedTaluka) return undefined
    const t = setTimeout(
      () => loadVillages(expandedDistrict, expandedTaluka, villageOffset),
      villageSearch ? 350 : 0,
    )
    return () => clearTimeout(t)
  }, [expandedDistrict, expandedTaluka, villageSearch, villageSortCol, villageSortDir, villageOffset])

  function handleDistrictSort(col) {
    const apiCol = col === 'beneficiaryCount' ? 'count' : 'name'
    if (districtSortCol === apiCol) setDistrictSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setDistrictSortCol(apiCol); setDistrictSortDir('asc') }
    setDistrictOffset(0)
  }

  function handleTalukaSort(col) {
    const apiCol = col === 'beneficiaryCount' ? 'count' : 'name'
    if (talukaSortCol === apiCol) setTalukaSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setTalukaSortCol(apiCol); setTalukaSortDir('asc') }
    setTalukaOffset(0)
  }

  function handleVillageSort(col) {
    const apiCol = col === 'beneficiaryCount' ? 'count' : 'name'
    if (villageSortCol === apiCol) setVillageSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setVillageSortCol(apiCol); setVillageSortDir('asc') }
    setVillageOffset(0)
  }

  function toggleDistrict(name) {
    if (expandedDistrict === name) {
      setExpandedDistrict(null)
      setExpandedTaluka(null)
      return
    }
    setExpandedDistrict(name)
    setExpandedTaluka(null)
    setTalukaSearch('')
    setTalukaOffset(0)
    setVillageSearch('')
    setVillageOffset(0)
    loadTalukas(name, 0)
  }

  function toggleTaluka(name) {
    if (expandedTaluka === name) {
      setExpandedTaluka(null)
      return
    }
    setExpandedTaluka(name)
    setVillageSearch('')
    setVillageOffset(0)
    loadVillages(expandedDistrict, name, 0)
  }

  const breadcrumb = [
    'Gujarat',
    expandedDistrict,
    expandedTaluka,
  ].filter(Boolean)

  return (
    <div className="sm-geo-panel">
      <div className="sm-geo-header">
        <div className="sm-geo-title">Beneficiary Coverage by Geography</div>
        <div className="sm-geo-breadcrumb">
          {breadcrumb.map((part, i) => (
            <Fragment key={part}>
              {i > 0 && <span className="sm-geo-crumb-sep">›</span>}
              <span className={i === breadcrumb.length - 1 ? 'sm-geo-crumb-active' : ''}>{part}</span>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="sm-geo-table-section">
        <div className="sm-geo-table-toolbar">
          <div className="sm-geo-level-label">Districts</div>
          <input
            className="sm-geo-search"
            placeholder="Search district…"
            value={districtSearch}
            disabled={Boolean(districtScope)}
            onChange={e => { setDistrictSearch(e.target.value); setDistrictOffset(0) }}
          />
        </div>

        <div className="sm-geo-table-wrap">
          <table className="sm-geo-table">
            <thead>
              <tr>
                <th className="sm-geo-expand-col" />
                <SortTh
                  col="name"
                  label="District"
                  sortCol={districtSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                  sortDir={districtSortDir}
                  onSort={() => handleDistrictSort('name')}
                />
                <SortTh
                  col="beneficiaryCount"
                  label="Beneficiaries"
                  sortCol={districtSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                  sortDir={districtSortDir}
                  onSort={() => handleDistrictSort('beneficiaryCount')}
                  align="center"
                />
              </tr>
            </thead>
            <tbody>
              {districtLoading && (
                <tr><td colSpan={3} className="sm-geo-empty">Loading districts…</td></tr>
              )}
              {!districtLoading && districtRows.map(row => (
                <Fragment key={row.name}>
                  <tr
                    className={`sm-geo-row ${expandedDistrict === row.name ? 'sm-geo-row-expanded' : ''}`}
                    onClick={() => toggleDistrict(row.name)}
                  >
                    <td className="sm-geo-expand-col">{expandedDistrict === row.name ? '▾' : '▸'}</td>
                    <td>{row.name}</td>
                    <td className="sm-ben-count">{row.beneficiaryCount.toLocaleString()}</td>
                  </tr>
                  {expandedDistrict === row.name && (
                    <tr className="sm-geo-detail-row">
                      <td colSpan={3}>
                        <div className="sm-geo-child-panel">
                          <div className="sm-geo-child-toolbar">
                            <div className="sm-geo-child-title">Talukas in {row.name}</div>
                            <input
                              className="sm-geo-search"
                              placeholder="Search taluka…"
                              value={talukaSearch}
                              onChange={e => { setTalukaSearch(e.target.value); setTalukaOffset(0) }}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          {talukaLoading && <p className="muted sm-geo-empty">Loading talukas…</p>}
                          {!talukaLoading && (
                            <table className="sm-geo-table sm-geo-child-table">
                              <thead>
                                <tr>
                                  <th className="sm-geo-expand-col" />
                                  <SortTh
                                    col="name"
                                    label="Taluka"
                                    sortCol={talukaSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                                    sortDir={talukaSortDir}
                                    onSort={() => handleTalukaSort('name')}
                                  />
                                  <SortTh
                                    col="beneficiaryCount"
                                    label="Beneficiaries"
                                    sortCol={talukaSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                                    sortDir={talukaSortDir}
                                    onSort={() => handleTalukaSort('beneficiaryCount')}
                                    align="center"
                                  />
                                </tr>
                              </thead>
                              <tbody>
                                {talukaRows.map(t => (
                                  <Fragment key={t.name}>
                                    <tr className="sm-geo-row" onClick={() => toggleTaluka(t.name)}>
                                      <td className="sm-geo-expand-col">{expandedTaluka === t.name ? '▾' : '▸'}</td>
                                      <td>{t.name}</td>
                                      <td className="sm-ben-count">{t.beneficiaryCount.toLocaleString()}</td>
                                    </tr>
                                    {expandedTaluka === t.name && (
                                      <tr className="sm-geo-detail-row">
                                        <td colSpan={3}>
                                          <div className="sm-geo-child-panel sm-geo-village-panel">
                                            <div className="sm-geo-child-toolbar">
                                              <div className="sm-geo-child-title">Villages / Cities in {t.name}</div>
                                              <input
                                                className="sm-geo-search"
                                                placeholder="Search village or city…"
                                                value={villageSearch}
                                                onChange={e => { setVillageSearch(e.target.value); setVillageOffset(0) }}
                                                onClick={e => e.stopPropagation()}
                                              />
                                            </div>
                                            {villageLoading && <p className="muted sm-geo-empty">Loading villages…</p>}
                                            {!villageLoading && (
                                              <>
                                                <table className="sm-geo-table sm-geo-child-table">
                                                  <thead>
                                                    <tr>
                                                      <SortTh
                                                        col="name"
                                                        label="Village / City"
                                                        sortCol={villageSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                                                        sortDir={villageSortDir}
                                                        onSort={() => handleVillageSort('name')}
                                                      />
                                                      <SortTh
                                                        col="beneficiaryCount"
                                                        label="Beneficiaries"
                                                        sortCol={villageSortCol === 'count' ? 'beneficiaryCount' : 'name'}
                                                        sortDir={villageSortDir}
                                                        onSort={() => handleVillageSort('beneficiaryCount')}
                                                        align="center"
                                                      />
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {villageRows.map(v => (
                                                      <tr key={v.name}>
                                                        <td>{v.name}</td>
                                                        <td className="sm-ben-count">{v.beneficiaryCount.toLocaleString()}</td>
                                                      </tr>
                                                    ))}
                                                    {villageRows.length === 0 && (
                                                      <tr><td colSpan={2} className="sm-geo-empty">No villages match.</td></tr>
                                                    )}
                                                  </tbody>
                                                </table>
                                                <GeoPagination
                                                  offset={villageOffset}
                                                  limit={CHILD_PAGE_SIZE}
                                                  total={villageMeta?.totalMatched ?? 0}
                                                  onPageChange={next => loadVillages(expandedDistrict, expandedTaluka, next)}
                                                />
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                                {talukaRows.length === 0 && !talukaLoading && (
                                  <tr><td colSpan={3} className="sm-geo-empty">No taluka data.</td></tr>
                                )}
                              </tbody>
                            </table>
                          )}
                          <GeoPagination
                            offset={talukaOffset}
                            limit={CHILD_PAGE_SIZE}
                            total={talukaMeta?.totalMatched ?? 0}
                            onPageChange={next => loadTalukas(expandedDistrict, next)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!districtLoading && districtRows.length === 0 && (
                <tr><td colSpan={3} className="sm-geo-empty">
                  {districtSearch
                    ? 'No districts match your search.'
                    : statusTotal === 0
                      ? 'No beneficiaries enrolled for this scheme yet. Run Identification Scan or pick Old Age Pension for demo data.'
                      : 'No district coverage data available.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <GeoPagination
          offset={districtOffset}
          limit={DISTRICT_PAGE_SIZE}
          total={districtMeta?.totalMatched ?? 0}
          onPageChange={setDistrictOffset}
        />
      </div>
    </div>
  )
}

export default function SchemeManagement() {
  const districtScope = getOfficerDistrictScope()
  const [schemes, setSchemes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [statusCounts, setStatusCounts] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)

  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [schemeSearch, setSchemeSearch] = useState('')
  const [schemesLoading, setSchemesLoading] = useState(true)
  const [schemesError, setSchemesError] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')

  const loadSchemes = useCallback(async () => {
    setSchemesLoading(true)
    setSchemesError(null)
    let lastStatus
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${SCHEME_API}/v1/schemes`)
        lastStatus = res.status
        if (res.ok) {
          setSchemes(await res.json())
          setSchemesLoading(false)
          return
        }
        if (![502, 503, 504].includes(res.status) || attempt === 2) break
      } catch {
        if (attempt === 2) break
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    setSchemes([])
    setSchemesError(lastStatus ? `Could not load schemes (HTTP ${lastStatus})` : 'Could not load schemes')
    setSchemesLoading(false)
  }, [])

  const loadStatusCounts = useCallback(async (schemeId) => {
    if (!schemeId) return
    setStatusLoading(true)
    setStatusError(null)
    try {
      const data = await fetchSchemeStatusCounts(schemeId, districtScope || undefined)
      setStatusCounts(data)
    } catch (err) {
      setStatusCounts(null)
      setStatusError(err?.message ?? 'Could not load beneficiary counts')
    } finally {
      setStatusLoading(false)
    }
  }, [districtScope])

  useEffect(() => { loadSchemes() }, [loadSchemes])

  useEffect(() => {
    const id = normalizeSchemeId(selectedId)
    if (selectedId != null && id == null) {
      setSelectedId(null)
      setStatusCounts(null)
      return
    }
    if (!id) {
      setStatusCounts(null)
      return
    }
    loadStatusCounts(id)
  }, [selectedId, loadStatusCounts])

  const filteredSchemes = useMemo(() => {
    const q = schemeSearch.trim().toLowerCase()
    return schemes.filter(s => {
      if (categoryFilter !== 'ALL' && (s.category || 'OTHER') !== categoryFilter) return false
      if (!q) return true
      return s.name?.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q)
    })
  }, [schemes, categoryFilter, schemeSearch])

  useEffect(() => {
    if (schemesLoading || schemes.length === 0) return
    const id = normalizeSchemeId(selectedId)
    if (id && filteredSchemes.some((s) => schemeIdsMatch(s.id, id))) return
    const preferred =
      filteredSchemes.find((s) => schemeIdsMatch(s.id, DEMO_DEFAULT_SCHEME_ID)) ??
      filteredSchemes[0] ??
      null
    setSelectedId(preferred ? String(preferred.id) : null)
    if (!preferred) setStatusCounts(null)
  }, [schemesLoading, schemes, filteredSchemes, selectedId])

  const categoriesInData = useMemo(() => {
    const c = {}
    schemes.forEach(s => { const k = s.category || 'OTHER'; c[k] = (c[k] || 0) + 1 })
    return Object.entries(c).sort((a, b) => b[1] - a[1])
  }, [schemes])

  const selectedScheme = useMemo(
    () => schemes.find((s) => schemeIdsMatch(s.id, selectedId)) ?? null,
    [schemes, selectedId]
  )

  const selectedIdForSelect = useMemo(() => {
    const id = normalizeSchemeId(selectedId)
    if (!id) return ''
    return filteredSchemes.some((s) => schemeIdsMatch(s.id, id)) ? id : ''
  }, [selectedId, filteredSchemes])

  const stageCounts = useMemo(() => {
    if (!statusCounts) return {}
    return {
      IDENTIFIED: statusCounts.identified ?? 0,
      CONFIRMED: statusCounts.confirmed ?? 0,
      ACTIVE: statusCounts.active ?? 0,
      REMOVED: statusCounts.removed ?? 0,
    }
  }, [statusCounts])

  const pendingCount = statusCounts?.identified ?? 0
  const disbursableCount = statusCounts?.disbursable ?? 0
  const totalForPipeline = statusCounts?.total ?? 0

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000)
      const res = await fetch(`${SCHEME_API}/v1/admin/run-identification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getOfficerAccessToken()}` },
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.status === 401 || res.status === 403) {
        setScanResult({ error: 'You do not have permission to run the scan. Please sign in again.' })
      } else if (res.ok) {
        const r = await res.json()
        setScanResult(r)
        if (selectedId) loadStatusCounts(selectedId)
        loadSchemes()
      } else {
        setScanResult({ error: `Scan failed (HTTP ${res.status}). Check scheme-engine logs.` })
      }
    } catch (err) {
      const msg = err?.name === 'AbortError'
        ? 'Scan timed out after 30 minutes — it may still be running on the server.'
        : (err?.message ?? 'Scan request failed')
      setScanResult({ error: msg })
    } finally {
      setScanning(false)
    }
  }

  async function confirmDeactivate() {
    const res = await fetch(`${SCHEME_API}/v1/schemes/${deactivateTarget.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getOfficerAccessToken()}` },
    })
    if (res.status === 401 || res.status === 403) {
      setDeactivateTarget(null)
      setScanResult({ error: 'You do not have permission to deactivate schemes. Please sign in again.' })
      return
    }
    if (selectedId === deactivateTarget.id) {
      setSelectedId(null)
      setStatusCounts(null)
    }
    setDeactivateTarget(null)
    loadSchemes()
  }

  async function handleExport(format) {
    if (!selectedScheme || exporting) return
    setExporting(true)
    setExportStatus('Starting export…')
    let lastProgressAt = 0
    const reportProgress = (msg) => {
      const now = Date.now()
      if (now - lastProgressAt < 450) return
      lastProgressAt = now
      setExportStatus(msg)
    }
    try {
      const geoRows = await collectSchemeExportData(selectedScheme.id, reportProgress)
      setExportStatus('Building file…')
      if (format === 'excel') {
        downloadSchemeExcel(selectedScheme, statusCounts, geoRows)
      } else {
        downloadSchemePdf(selectedScheme, statusCounts, geoRows)
      }
      setExportStatus('')
    } catch (err) {
      setExportStatus(err.message ?? 'Export failed')
      setTimeout(() => setExportStatus(''), 3000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="sm-root">
      <div className="sm-command-bar">
        <div className="sm-command-left">
          <div className="sm-command-title">Beneficiary Operations</div>
          <div className="sm-command-sub">Scheme Management · Gujarat Government</div>
          <DistrictScopeBanner noun="scheme operations" />
        </div>
        <div className="sm-command-kpis">
          <div className="sm-ckpi">
            <div className="sm-ckpi-val">{schemes.length}</div>
            <div className="sm-ckpi-label">Active Schemes</div>
          </div>
          <div className="sm-ckpi">
            <div className="sm-ckpi-val">{pendingCount.toLocaleString()}</div>
            <div className="sm-ckpi-label">Pending Confirmation</div>
          </div>
          <div className="sm-ckpi">
            <div className="sm-ckpi-val sm-ckpi-green">{disbursableCount.toLocaleString()}</div>
            <div className="sm-ckpi-label">Ready to Disburse</div>
          </div>
        </div>
        <div className="sm-command-actions">
          {scanResult && !scanResult.error && (
            <div className="sm-scan-result">
              ✓ {scanResult.newlyIdentified?.toLocaleString() ?? 0} new identified from {scanResult.familiesScanned?.toLocaleString() ?? 0} families
            </div>
          )}
          {scanResult?.error && (
            <div className="sm-scan-result sm-scan-error">{scanResult.error}</div>
          )}
          <button type="button" className="sm-scan-btn" disabled={scanning} onClick={runScan}>
            {scanning ? <><span className="sm-spin">⟳</span> Scanning…</> : '⟳ Run Identification Scan'}
          </button>
          <Link to="/scheme-simulator" className="sm-design-link">
            + Design New Scheme
          </Link>
          <Link to="/scheme-content" className="sm-design-link">
            📝 Edit Scheme Content
          </Link>
          <div className="sm-cmd-divider" />
          <select
            className="sm-cmd-select"
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value)
              setScanResult(null)
            }}
            disabled={schemesLoading || schemes.length === 0}>
            <option value="ALL">All Categories</option>
            {categoriesInData.map(([cat]) => (
              <option key={cat} value={cat}>{categoryLabel(cat)}</option>
            ))}
          </select>
          <input
            className="sm-cmd-search"
            placeholder="Search scheme…"
            value={schemeSearch}
            onChange={e => setSchemeSearch(e.target.value)} />
          <select
            className="sm-cmd-scheme-select"
            value={selectedIdForSelect}
            onChange={e => {
              const val = normalizeSchemeId(e.target.value)
              if (!val) { setSelectedId(null); setStatusCounts(null); return }
              setSelectedId(val)
              setScanResult(null)
            }}
            disabled={schemesLoading || filteredSchemes.length === 0}>
            <option value="">
              {schemesLoading ? 'Loading schemes…' : filteredSchemes.length ? '— Select scheme —' : 'No schemes available'}
            </option>
            {filteredSchemes.map(s => {
              const meta = CATEGORY_META[s.category || 'OTHER'] || CATEGORY_META.OTHER
              const schemeId = String(s.id)
              return <option key={schemeId} value={schemeId}>{meta.icon} {s.name}</option>
            })}
          </select>
          {selectedScheme && (
            <button type="button" className="sm-cmd-deactivate" onClick={() => setDeactivateTarget(selectedScheme)}>
              Deactivate
            </button>
          )}
        </div>
      </div>

      {schemesError && (
        <div className="sm-schemes-error">
          {schemesError}.{' '}
          <button type="button" className="sm-schemes-retry" onClick={loadSchemes}>
            Retry
          </button>
        </div>
      )}

      {statusError && selectedScheme && (
        <div className="sm-schemes-error">
          {statusError}.{' '}
          <button type="button" className="sm-schemes-retry" onClick={() => loadStatusCounts(selectedId)}>
            Retry
          </button>
        </div>
      )}

      <div className="sm-body">
        <div className="sm-right">
          {!selectedScheme ? (
            <div className="sm-placeholder">
              <div className="sm-placeholder-icon">📋</div>
              <div className="sm-placeholder-title">Select a scheme to manage beneficiaries</div>
              <div className="sm-placeholder-sub">Use the scheme dropdown above to view district, taluka, and village coverage</div>
            </div>
          ) : (
            <>
              <div className="sm-scheme-strip">
                <div className="sm-strip-badge" style={{ background: (CATEGORY_META[selectedScheme.category || 'OTHER'] || CATEGORY_META.OTHER).color }}>
                  {(CATEGORY_META[selectedScheme.category || 'OTHER'] || CATEGORY_META.OTHER).icon}
                </div>
                <div className="sm-strip-info">
                  <div className="sm-strip-name">{selectedScheme.name}</div>
                  <div className="sm-strip-meta">
                    {selectedScheme.department}
                    {selectedScheme.benefitValue && <span> · {selectedScheme.benefitType}: {selectedScheme.benefitValue}</span>}
                    {selectedScheme.incomeCeiling != null && (
                      <span> · Income ≤ ₹{Number(selectedScheme.incomeCeiling).toLocaleString()}</span>
                    )}
                    {(selectedScheme.minAge || selectedScheme.maxAge) && (
                      <span> · Age {selectedScheme.minAge || 0}–{selectedScheme.maxAge || '∞'}</span>
                    )}
                    {selectedScheme.eligibleCastes && <span> · {selectedScheme.eligibleCastes}</span>}
                    {selectedScheme.validFrom && <span> · {selectedScheme.validFrom} → {selectedScheme.validTo}</span>}
                  </div>
                </div>
                <div className="sm-export-actions">
                  <button
                    type="button"
                    className="sm-export-btn"
                    disabled={exporting}
                    onClick={() => handleExport('excel')}
                  >
                    📊 Download Excel
                  </button>
                  <button
                    type="button"
                    className="sm-export-btn"
                    disabled={exporting}
                    onClick={() => handleExport('pdf')}
                  >
                    📄 Download PDF
                  </button>
                </div>
              </div>

              <div className="sm-pipeline-wrap">
                {PIPELINE.map((stage, idx) => {
                  const count = stageCounts[stage.key] || 0
                  const total = totalForPipeline || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={stage.key} className="sm-pipeline-stage-wrap">
                      <div
                        className="sm-pipeline-stage sm-pipeline-stage-static"
                        style={{ '--stage-color': stage.color, '--stage-bg': stage.bg, '--stage-border': stage.border }}
                      >
                        <div className="sm-stage-top">
                          <span className="sm-stage-icon">{stage.icon}</span>
                          <span className="sm-stage-count">
                            {statusLoading ? '…' : count.toLocaleString()}
                          </span>
                        </div>
                        <div className="sm-stage-label">{stage.label}</div>
                        <div className="sm-stage-bar">
                          <div className="sm-stage-bar-fill" style={{ width: `${pct}%`, background: stage.color }} />
                        </div>
                        <div className="sm-stage-pct">{pct}% of total</div>
                      </div>
                      {idx < PIPELINE.length - 1 && <div className="sm-pipeline-arrow">›</div>}
                    </div>
                  )
                })}
              </div>

              <GeographicExplorer schemeId={selectedScheme.id} statusTotal={totalForPipeline} />
            </>
          )}
        </div>
      </div>

      {deactivateTarget && (
        <div className="sm-modal-overlay" onClick={() => setDeactivateTarget(null)}>
          <div className="sm-modal sm-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="sm-modal-header">
              <div className="sm-modal-title" style={{ color: '#dc2626' }}>⚠ Deactivate Scheme</div>
              <button type="button" className="sm-modal-close" onClick={() => setDeactivateTarget(null)}>✕</button>
            </div>
            <div className="sm-modal-warn-box">
              <p>You are about to deactivate:</p>
              <p className="sm-modal-warn-name">{deactivateTarget.name}</p>
              <p>This will remove the scheme from the active list. All existing beneficiary records are preserved. This action cannot be undone.</p>
            </div>
            <div className="sm-modal-footer">
              <button type="button" className="sm-btn-secondary" onClick={() => setDeactivateTarget(null)}>Cancel</button>
              <button type="button" className="sm-btn-danger" onClick={confirmDeactivate}>
                Yes, Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {exporting && (
        <div className="sm-export-overlay" role="status" aria-live="polite">
          <div className="sm-export-dialog">
            <span className="sm-export-spinner sm-spin" aria-hidden="true">⟳</span>
            <div className="sm-export-dialog-title">Preparing scheme export</div>
            <div className="sm-export-dialog-status">{exportStatus || 'Please wait…'}</div>
            <p className="sm-export-dialog-hint">Geographic data is loading in the background. The page layout will stay fixed.</p>
          </div>
        </div>
      )}
    </div>
  )
}
