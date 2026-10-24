import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchGeographicBreakdown,
  fetchGeographicDistricts,
  fetchGeographicTalukas,
  fetchGeographicVillages,
  fetchSchemeCoverage,
  fetchSchemeDistribution,
} from '../api'
import GujaratCoverageMap from '../components/GujaratCoverageMap'
import { getOfficerDistrictScope, matchesOfficerDistrict } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import { CATEGORY_META, categoryLabel } from '../constants/schemeCategories'
import './SchemeCoverage.css'

const GUJARAT_CASTE_BENCHMARK = { OBC: 48, SC: 7, ST: 15, NT: 8, GENERAL: 22 }
const GUJARAT_DISTRICT_SHARE = {
  Ahmedabad: 16, Surat: 13, Vadodara: 8, Rajkot: 7, Mehsana: 5,
  Banaskantha: 5, Anand: 4, Gandhinagar: 3, Kutch: 3,
}
const DISTRICT_PAGE_SIZE = 15
const CHILD_PAGE_SIZE = 20
const DIST_GEO_STEP = 5
const DEFAULT_COVERAGE_SCHEME_ID = 'a1000001-0000-0000-0000-000000000002' // Post-Matric OBC Scholarship

function pickDefaultCoverageScheme(schemes) {
  if (!schemes.length) return null
  return schemes.find((s) => s.schemeId === DEFAULT_COVERAGE_SCHEME_ID)
    || schemes.find((s) => s.schemeName === 'Post-Matric OBC Scholarship')
    || schemes[0]
}

function computeInsights(geoData, distribution, selectedScheme) {
  const insights = []
  if (!geoData || !distribution) return insights
  const total = distribution.total || 0
  const districts = geoData.districts || []
  const districtCounts = distribution.districtCounts || {}
  const casteCounts = distribution.casteCounts || {}

  const sorted = [...districts].sort((a, b) => (b.totalCitizens ?? 0) - (a.totalCitizens ?? 0))
  const top3 = sorted.slice(0, 3)
  const top3sum = top3.reduce((s, d) => s + (d.totalCitizens ?? 0), 0)
  const top3pct = total > 0 ? Math.round((top3sum / total) * 100) : 0
  if (top3pct > 60) {
    insights.push({ type: 'warning', icon: '⚠', title: 'Geographic Concentration Risk',
      body: `${top3pct}% of beneficiaries are in just 3 districts (${top3.map(d => d.districtName).join(', ')}). Remaining districts are under-served.`,
      action: 'Review outreach strategy for low-coverage districts.' })
  } else {
    insights.push({ type: 'success', icon: '✓', title: 'Good Geographic Spread',
      body: `Top 3 districts hold ${top3pct}% of beneficiaries — reasonable spread across Gujarat.` })
  }

  const zeroDist = districts.filter(d => (d.totalCitizens ?? 0) === 0)
  if (zeroDist.length > 0) {
    insights.push({ type: 'critical', icon: '✕', title: `${zeroDist.length} District${zeroDist.length > 1 ? 's' : ''} with Zero Enrollment`,
      body: `No beneficiaries in: ${zeroDist.map(d => d.districtName).slice(0, 4).join(', ')}${zeroDist.length > 4 ? ` +${zeroDist.length - 4} more` : ''}.`,
      action: 'Trigger targeted identification drive in these districts.' })
  }

  const pending = selectedScheme?.identifiedCount ?? 0
  const active = selectedScheme?.activeCount ?? 0
  if (pending > 0) {
    const convPct = total > 0 ? Math.round((pending / total) * 100) : 0
    insights.push({ type: pending > 500 ? 'warning' : 'info', icon: '⏳',
      title: `${pending.toLocaleString()} Pending Activation (${convPct}%)`,
      body: `Active rate: ${total > 0 ? Math.round((active / total) * 100) : 0}%. ${pending.toLocaleString()} identified citizens awaiting activation.`,
      action: 'Process pending verifications to improve active beneficiary count.' })
  }

  const underrepresented = Object.entries(GUJARAT_CASTE_BENCHMARK)
    .filter(([caste, bench]) => {
      const pct = total > 0 ? ((casteCounts[caste] || 0) / total) * 100 : 0
      return pct < bench - 15
    })
    .map(([c]) => c)

  if (underrepresented.length > 0) {
    insights.push({ type: 'warning', icon: '⚡', title: 'Caste Equity Gap Detected',
      body: `${underrepresented.join(', ')} are significantly under-represented vs Gujarat population benchmarks.`,
      action: 'Consider targeted awareness campaigns for under-served communities.' })
  } else if (total > 0) {
    insights.push({ type: 'success', icon: '✓', title: 'Caste Representation On Track',
      body: 'No caste category is significantly under-represented relative to Gujarat population benchmarks.' })
  }

  const lowMajor = Object.entries(GUJARAT_DISTRICT_SHARE)
    .filter(([district, popShare]) => {
      const enrolledShare = total > 0 ? ((districtCounts[district] || 0) / total) * 100 : 0
      return enrolledShare < popShare / 2 && popShare > 4
    })
    .map(([d]) => d)

  if (lowMajor.length > 0) {
    insights.push({ type: 'warning', icon: '📍', title: 'Low Coverage in Major Districts',
      body: `${lowMajor.join(', ')} have disproportionately low enrollment relative to their population share.`,
      action: 'Increase field officer presence and registration camps in these areas.' })
  }
  return insights
}

function DistributionLoadMore({ shown, total, onLoadMore, label }) {
  if (total <= shown) return null
  const remaining = total - shown
  return (
    <button type="button" className="dist-load-more" onClick={onLoadMore}>
      {label} ({remaining.toLocaleString()} remaining)
    </button>
  )
}

function DistributionGeoBarRow({ label, count, shareTotal, maxCount, barClass, expanded, selected, onClick }) {
  const pct = shareTotal > 0 ? Math.round((count / shareTotal) * 100) : 0
  const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0
  const interactive = Boolean(onClick)
  return (
    <div
      className={`dist-row dist-row-geo ${interactive ? 'dist-row-clickable' : ''} ${selected ? 'dist-row-selected' : ''}`}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
    >
      {interactive && <span className="dist-expand-icon">{expanded ? '▾' : '▸'}</span>}
      <span className="dist-label dist-label-geo" title={label}>{label}</span>
      <div className="dist-bar-wrap">
        <div className="dist-bar-track">
          <div className={`dist-bar ${barClass || ''}`} style={{ width: `${barPct}%` }} />
        </div>
      </div>
      <span className="dist-pct">{pct}%</span>
      <span className="dist-count">({count.toLocaleString()})</span>
    </div>
  )
}

function DistributionGeoDrilldown({ schemeId, schemeTotal }) {
  const [districtRows, setDistrictRows] = useState([])
  const [districtTotal, setDistrictTotal] = useState(0)
  const [districtLimit, setDistrictLimit] = useState(DIST_GEO_STEP)
  const [districtLoading, setDistrictLoading] = useState(false)
  const [expandedDistrict, setExpandedDistrict] = useState(null)
  const [expandedDistrictCount, setExpandedDistrictCount] = useState(0)

  const [talukaRows, setTalukaRows] = useState([])
  const [talukaTotal, setTalukaTotal] = useState(0)
  const [talukaLimit, setTalukaLimit] = useState(DIST_GEO_STEP)
  const [talukaLoading, setTalukaLoading] = useState(false)
  const [expandedTaluka, setExpandedTaluka] = useState(null)
  const [expandedTalukaCount, setExpandedTalukaCount] = useState(0)

  const [villageRows, setVillageRows] = useState([])
  const [villageTotal, setVillageTotal] = useState(0)
  const [villageLimit, setVillageLimit] = useState(DIST_GEO_STEP)
  const [villageLoading, setVillageLoading] = useState(false)

  const loadDistricts = useCallback(async (limit) => {
    setDistrictLoading(true)
    try {
      const data = await fetchGeographicDistricts(schemeId, {
        sortBy: 'count',
        sortDir: 'desc',
        offset: 0,
        limit,
      })
      setDistrictRows(data.results ?? [])
      setDistrictTotal(data.totalMatched ?? 0)
    } catch {
      setDistrictRows([])
      setDistrictTotal(0)
    } finally {
      setDistrictLoading(false)
    }
  }, [schemeId])

  useEffect(() => {
    setExpandedDistrict(null)
    setExpandedTaluka(null)
    setDistrictLimit(DIST_GEO_STEP)
    setTalukaLimit(DIST_GEO_STEP)
    setVillageLimit(DIST_GEO_STEP)
  }, [schemeId])

  useEffect(() => {
    loadDistricts(districtLimit)
  }, [loadDistricts, districtLimit])

  async function loadTalukas(district, count, limit) {
    setTalukaLoading(true)
    try {
      const data = await fetchGeographicTalukas(schemeId, district, {
        sortBy: 'count',
        sortDir: 'desc',
        offset: 0,
        limit,
      })
      setTalukaRows(data.results ?? [])
      setTalukaTotal(data.totalMatched ?? 0)
      setExpandedDistrictCount(count)
    } catch {
      setTalukaRows([])
      setTalukaTotal(0)
    } finally {
      setTalukaLoading(false)
    }
  }

  async function loadVillages(district, taluka, count, limit) {
    setVillageLoading(true)
    try {
      const data = await fetchGeographicVillages(schemeId, district, taluka, {
        sortBy: 'count',
        sortDir: 'desc',
        offset: 0,
        limit,
      })
      setVillageRows(data.results ?? [])
      setVillageTotal(data.totalMatched ?? 0)
      setExpandedTalukaCount(count)
    } catch {
      setVillageRows([])
      setVillageTotal(0)
    } finally {
      setVillageLoading(false)
    }
  }

  useEffect(() => {
    if (!expandedDistrict) return
    loadTalukas(expandedDistrict, expandedDistrictCount, talukaLimit)
  }, [expandedDistrict, talukaLimit])

  useEffect(() => {
    if (!expandedDistrict || !expandedTaluka) return
    loadVillages(expandedDistrict, expandedTaluka, expandedTalukaCount, villageLimit)
  }, [expandedDistrict, expandedTaluka, villageLimit])

  function toggleDistrict(name, count) {
    if (expandedDistrict === name) {
      setExpandedDistrict(null)
      setExpandedTaluka(null)
      setTalukaLimit(DIST_GEO_STEP)
      setVillageLimit(DIST_GEO_STEP)
      return
    }
    setExpandedDistrict(name)
    setExpandedDistrictCount(count)
    setExpandedTaluka(null)
    setTalukaLimit(DIST_GEO_STEP)
    setVillageLimit(DIST_GEO_STEP)
    setTalukaRows([])
    setVillageRows([])
  }

  function toggleTaluka(name, count) {
    if (expandedTaluka === name) {
      setExpandedTaluka(null)
      setVillageLimit(DIST_GEO_STEP)
      return
    }
    setExpandedTaluka(name)
    setExpandedTalukaCount(count)
    setVillageLimit(DIST_GEO_STEP)
    setVillageRows([])
  }

  const districtMax = districtRows[0]?.beneficiaryCount || 1
  const talukaMax = talukaRows[0]?.beneficiaryCount || 1
  const villageMax = villageRows[0]?.beneficiaryCount || 1

  return (
    <div className="dist-geo-drill">
      <div className="dist-section-header" style={{ marginTop: '1.5rem' }}>Geographic Distribution</div>
      {districtLoading && districtRows.length === 0 && (
        <p className="muted sc-empty-inline">Loading districts…</p>
      )}
      {!districtLoading && districtRows.length === 0 && (
        <p className="muted sc-empty-inline">No district-level data available.</p>
      )}
      {districtRows.map(row => (
        <Fragment key={row.name}>
          <DistributionGeoBarRow
            label={row.name}
            count={row.beneficiaryCount}
            shareTotal={schemeTotal}
            maxCount={districtMax}
            expanded={expandedDistrict === row.name}
            selected={expandedDistrict === row.name}
            onClick={() => toggleDistrict(row.name, row.beneficiaryCount)}
          />
          {expandedDistrict === row.name && (
            <div className="dist-drill-panel dist-drill-taluka">
              <div className="dist-drill-title">Talukas in {row.name}</div>
              {talukaLoading && talukaRows.length === 0 && (
                <p className="muted sc-empty-inline">Loading talukas…</p>
              )}
              {talukaRows.map(t => (
                <Fragment key={t.name}>
                  <DistributionGeoBarRow
                    label={t.name}
                    count={t.beneficiaryCount}
                    shareTotal={expandedDistrictCount || 1}
                    maxCount={talukaMax}
                    barClass="dist-bar-taluka"
                    expanded={expandedTaluka === t.name}
                    selected={expandedTaluka === t.name}
                    onClick={() => toggleTaluka(t.name, t.beneficiaryCount)}
                  />
                  {expandedTaluka === t.name && (
                    <div className="dist-drill-panel dist-drill-village">
                      <div className="dist-drill-title">Villages / Cities in {t.name}</div>
                      {villageLoading && villageRows.length === 0 && (
                        <p className="muted sc-empty-inline">Loading villages…</p>
                      )}
                      {villageRows.map(v => (
                        <DistributionGeoBarRow
                          key={v.name}
                          label={v.name}
                          count={v.beneficiaryCount}
                          shareTotal={expandedTalukaCount || 1}
                          maxCount={villageMax}
                          barClass="dist-bar-village"
                        />
                      ))}
                      {!villageLoading && villageRows.length === 0 && (
                        <p className="muted sc-empty-inline">No village data for this taluka.</p>
                      )}
                      <DistributionLoadMore
                        shown={villageRows.length}
                        total={villageTotal}
                        label="See more villages / cities"
                        onLoadMore={() => setVillageLimit(l => l + DIST_GEO_STEP)}
                      />
                    </div>
                  )}
                </Fragment>
              ))}
              {!talukaLoading && talukaRows.length === 0 && (
                <p className="muted sc-empty-inline">No taluka data for this district.</p>
              )}
              <DistributionLoadMore
                shown={talukaRows.length}
                total={talukaTotal}
                label="See more talukas"
                onLoadMore={() => setTalukaLimit(l => l + DIST_GEO_STEP)}
              />
            </div>
          )}
        </Fragment>
      ))}
      <DistributionLoadMore
        shown={districtRows.length}
        total={districtTotal}
        label="Load more districts"
        onLoadMore={() => setDistrictLimit(l => l + DIST_GEO_STEP)}
      />
    </div>
  )
}

function DistributionTab({ schemeId, distribution }) {
  if (!distribution) return <p className="muted sc-empty">Loading distribution…</p>
  const total = distribution.total || 0
  if (total === 0) return <p className="muted sc-empty">No beneficiary data available.</p>
  const casteCounts = distribution.casteCounts || {}
  const genderCounts = distribution.genderCounts || {}
  const casteEquityScore = Math.round(
    Object.entries(GUJARAT_CASTE_BENCHMARK).reduce((sum, [caste, bench]) => {
      const pct = total > 0 ? ((casteCounts[caste] || 0) / total) * 100 : 0
      return sum + Math.min(100, (pct / bench) * 100)
    }, 0) / Object.keys(GUJARAT_CASTE_BENCHMARK).length
  )
  return (
    <div className="sc-dist-panel">
      <div className="sc-dist-equity-score">
        <div className="sc-dist-equity-label">Caste Equity Score</div>
        <div className={`sc-dist-equity-val ${casteEquityScore >= 80 ? 'good' : casteEquityScore >= 60 ? 'fair' : 'poor'}`}>
          {casteEquityScore}/100
        </div>
        <div className="sc-dist-equity-desc">
          {casteEquityScore >= 80 ? 'Well distributed' : casteEquityScore >= 60 ? 'Moderate gaps' : 'Significant under-representation'}
        </div>
      </div>
      <div className="dist-section-header">Caste Distribution vs Gujarat Population Benchmark</div>
      {Object.entries(GUJARAT_CASTE_BENCHMARK).map(([caste, benchmark]) => {
        const count = casteCounts[caste] || 0
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const flagged = pct < benchmark - 15
        return (
          <div key={caste} className={`dist-row ${flagged ? 'dist-flagged' : ''}`}>
            <span className="dist-label">{caste}</span>
            <div className="dist-bar-wrap">
              <div className="dist-bar-track">
                <div className="dist-bar" style={{ width: `${pct}%` }} />
                <div className="dist-bench-line" style={{ left: `${benchmark}%` }} />
              </div>
            </div>
            <span className="dist-pct">{pct}%</span>
            <span className="dist-count">({count.toLocaleString()})</span>
            <span className="dist-bench muted">pop {benchmark}%</span>
            {flagged && <span className="dist-warn">⚠ Under-served</span>}
          </div>
        )
      })}
      <div className="dist-section-header" style={{ marginTop: '1.5rem' }}>Gender of Household Head</div>
      {Object.entries(genderCounts).map(([g, count]) => {
        const n = Number(count) || 0
        const pct = total > 0 ? Math.round((n / total) * 100) : 0
        return (
          <div key={g} className="dist-row">
            <span className="dist-label">{g}</span>
            <div className="dist-bar-wrap">
              <div className="dist-bar-track">
                <div className="dist-bar" style={{ width: `${pct}%`, background: g === 'FEMALE' ? '#db2777' : '#2563eb' }} />
              </div>
            </div>
            <span className="dist-pct">{pct}%</span>
            <span className="dist-count">({n.toLocaleString()})</span>
          </div>
        )
      })}
      {schemeId && <DistributionGeoDrilldown schemeId={schemeId} schemeTotal={total} />}
    </div>
  )
}

function InsightsTab({ insights, selectedScheme, geoData, distribution, geoError }) {
  if (!distribution) return <div className="sc-loading-inline">Loading insights…</div>
  const total = distribution.total || 0
  if (total === 0) {
    return (
      <p className="muted sc-empty">
        No beneficiaries enrolled for this scheme yet. Run Identification Scan from Scheme Management or pick a scheme with demo data.
      </p>
    )
  }
  const active = selectedScheme?.activeCount ?? 0
  const pending = selectedScheme?.identifiedCount ?? 0
  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0
  const districts = geoData?.districts || []
  const covered = districts.filter(d => (d.totalCitizens ?? 0) > 0).length
  return (
    <div className="sc-insights-panel">
      <div className="sc-insights-kpi-row">
        <div className="sc-ins-kpi">
          <div className="sc-ins-kpi-val" style={{ color: activeRate >= 70 ? '#16a34a' : activeRate >= 40 ? '#d97706' : '#dc2626' }}>{activeRate}%</div>
          <div className="sc-ins-kpi-label">Active Rate</div>
          <div className="sc-ins-kpi-sub">{active.toLocaleString()} active / {total.toLocaleString()} total</div>
        </div>
        {geoData ? (
          <div className="sc-ins-kpi">
            <div className="sc-ins-kpi-val" style={{ color: covered === districts.length ? '#16a34a' : '#d97706' }}>{covered}/{districts.length}</div>
            <div className="sc-ins-kpi-label">Districts Covered</div>
            <div className="sc-ins-kpi-sub">{districts.length - covered} with zero enrollment</div>
          </div>
        ) : (
          <div className="sc-ins-kpi">
            <div className="sc-ins-kpi-val" style={{ color: '#64748b' }}>—</div>
            <div className="sc-ins-kpi-label">Districts Covered</div>
            <div className="sc-ins-kpi-sub">{geoError ? 'Geographic data unavailable' : 'Loading…'}</div>
          </div>
        )}
        <div className="sc-ins-kpi">
          <div className="sc-ins-kpi-val" style={{ color: pending > 500 ? '#dc2626' : '#d97706' }}>{pending.toLocaleString()}</div>
          <div className="sc-ins-kpi-label">Pending Activation</div>
          <div className="sc-ins-kpi-sub">Awaiting verification</div>
        </div>
        <div className="sc-ins-kpi">
          <div className="sc-ins-kpi-val" style={{ color: '#1d4ed8' }}>{total.toLocaleString()}</div>
          <div className="sc-ins-kpi-label">Total Enrolled</div>
          <div className="sc-ins-kpi-sub">{selectedScheme?.benefitType}</div>
        </div>
      </div>
      {geoError && <p className="sc-error">{geoError}</p>}
      {geoData && (
        <>
      <div className="sc-insights-title">AI-Assisted Analysis</div>
      <div className="sc-insights-cards">
        {insights.map((ins, i) => (
          <div key={i} className={`sc-insight-card sc-insight-${ins.type}`}>
            <div className="sc-insight-icon">{ins.icon}</div>
            <div className="sc-insight-body">
              <div className="sc-insight-title">{ins.title}</div>
              <div className="sc-insight-desc">{ins.body}</div>
              {ins.action && (
                <div className="sc-insight-action">
                  <span className="sc-insight-action-label">Recommended Action</span>
                  {ins.action}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  )
}

function SortTh({ col, label, sortCol, sortDir, onSort, align = 'left' }) {
  const active = sortCol === col
  return (
    <th className={`sc-th-sort sc-th-${align} ${active ? 'sc-th-sort-active' : ''}`} onClick={() => onSort(col)}>
      {label}
      <span className="sc-sort-icon">{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
    </th>
  )
}

function GeoPagination({ offset, limit, total, onPageChange }) {
  if (total <= limit) return null
  const page = Math.floor(offset / limit)
  const totalPages = Math.ceil(total / limit)
  return (
    <div className="sc-geo-pagination">
      <button type="button" className="btn-secondary" disabled={offset <= 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
        ‹ Previous
      </button>
      <span className="muted">Page {page + 1} of {totalPages} · {total.toLocaleString()} total</span>
      <button type="button" className="btn-secondary" disabled={offset + limit >= total} onClick={() => onPageChange(offset + limit)}>
        Next ›
      </button>
    </div>
  )
}

function GeographicTab({ schemeId, geoData, selectedMapDistrict, onSelectMapDistrict }) {
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
  const [talukaOffset, setTalukaOffset] = useState(0)
  const [talukaLoading, setTalukaLoading] = useState(false)
  const [expandedTaluka, setExpandedTaluka] = useState(null)
  const [villageRows, setVillageRows] = useState([])
  const [villageMeta, setVillageMeta] = useState(null)
  const [villageOffset, setVillageOffset] = useState(0)
  const [villageSearch, setVillageSearch] = useState('')
  const [villageSortCol, setVillageSortCol] = useState('name')
  const [villageSortDir, setVillageSortDir] = useState('asc')
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
    setDistrictOffset(0)
  }, [schemeId])

  useEffect(() => {
    setExpandedDistrict(null)
    setExpandedTaluka(null)
    setDistrictOffset(0)
  }, [schemeId])

  useEffect(() => {
    const t = setTimeout(loadDistricts, districtSearch ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadDistricts, districtSearch])

  async function loadTalukas(district, offset = 0) {
    setTalukaLoading(true)
    try {
      const data = await fetchGeographicTalukas(schemeId, district, {
        sortBy: 'name',
        sortDir: 'asc',
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
    if (!expandedTaluka) return undefined
    const t = setTimeout(() => {
      loadVillages(expandedDistrict, expandedTaluka, villageOffset)
    }, villageSearch ? 350 : 0)
    return () => clearTimeout(t)
  }, [expandedDistrict, expandedTaluka, villageSearch, villageSortCol, villageSortDir, villageOffset])

  function handleDistrictSort(col) {
    const apiCol = col === 'beneficiaryCount' ? 'count' : 'name'
    if (districtSortCol === apiCol) setDistrictSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setDistrictSortCol(apiCol); setDistrictSortDir('asc') }
    setDistrictOffset(0)
  }

  function handleVillageSort(col) {
    const apiCol = col === 'beneficiaryCount' ? 'count' : 'name'
    if (villageSortCol === apiCol) setVillageSortDir(d => d === 'asc' ? 'desc' : 'asc')
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
    setVillageSearch('')
    setVillageOffset(0)
    onSelectMapDistrict(name)
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

  const mapDistricts = geoData?.districts ?? []

  useEffect(() => {
    if (!districtScope || !districtRows.length || expandedDistrict) return
    const match = districtRows.find((r) => matchesOfficerDistrict(r.name, districtScope))
    if (!match) return
    setExpandedDistrict(match.name)
    onSelectMapDistrict(match.name)
    loadTalukas(match.name, 0)
  }, [districtScope, districtRows, expandedDistrict, onSelectMapDistrict])

  return (
    <div className="sc-geo-panel">
      {mapDistricts.length > 0 && (
        <div className="sc-geo-map-col sc-geo-map-top">
          <GujaratCoverageMap
            districts={mapDistricts}
            selectedDistrict={selectedMapDistrict}
            onSelectDistrict={onSelectMapDistrict}
            schemeId={schemeId}
            focusDistrict={districtScope}
          />
        </div>
      )}

      <div className="sc-geo-table-section">
        <div className="sc-geo-table-toolbar">
          <div className="sc-geo-drill-title">District-wise Coverage</div>
          <input
            className="sc-search sc-geo-search"
            placeholder="Search district…"
            value={districtSearch}
            disabled={Boolean(districtScope)}
            onChange={e => { setDistrictSearch(e.target.value); setDistrictOffset(0) }}
          />
        </div>

        <div className="sc-geo-table-wrap">
          <table className="sc-table sc-geo-table">
            <thead>
              <tr>
                <th className="sc-geo-expand-col" />
                <SortTh col="name" label="District" sortCol={districtSortCol === 'count' ? 'beneficiaryCount' : 'name'} sortDir={districtSortDir} onSort={() => handleDistrictSort('name')} />
                <SortTh col="beneficiaryCount" label="Beneficiaries" sortCol={districtSortCol === 'count' ? 'beneficiaryCount' : 'name'} sortDir={districtSortDir} onSort={() => handleDistrictSort('beneficiaryCount')} align="right" />
              </tr>
            </thead>
            <tbody>
              {districtLoading && (
                <tr><td colSpan={3} className="sc-empty">Loading districts…</td></tr>
              )}
              {!districtLoading && districtRows.map(row => (
                <Fragment key={row.name}>
                  <tr
                    className={`sc-geo-row ${expandedDistrict === row.name ? 'sc-geo-row-expanded' : ''} ${selectedMapDistrict === row.name ? 'sc-geo-row-selected' : ''}`}
                    onClick={() => toggleDistrict(row.name)}
                  >
                    <td className="sc-geo-expand-col">{expandedDistrict === row.name ? '▾' : '▸'}</td>
                    <td>{row.name}</td>
                    <td className="sc-num">{row.beneficiaryCount.toLocaleString()}</td>
                  </tr>
                  {expandedDistrict === row.name && (
                    <tr key={`${row.name}-detail`} className="sc-geo-detail-row">
                      <td colSpan={3}>
                        <div className="sc-geo-child-panel">
                          <div className="sc-geo-child-title">Talukas in {row.name}</div>
                          {talukaLoading && <p className="muted sc-empty">Loading talukas…</p>}
                          {!talukaLoading && (
                            <table className="sc-table sc-geo-child-table">
                              <thead>
                                <tr>
                                  <th className="sc-geo-expand-col" />
                                  <th>Taluka</th>
                                  <th className="sc-num">Beneficiaries</th>
                                </tr>
                              </thead>
                              <tbody>
                                {talukaRows.map(t => (
                                  <Fragment key={t.name}>
                                    <tr className="sc-geo-row" onClick={() => toggleTaluka(t.name)}>
                                      <td className="sc-geo-expand-col">{expandedTaluka === t.name ? '▾' : '▸'}</td>
                                      <td>{t.name}</td>
                                      <td className="sc-num">{t.beneficiaryCount.toLocaleString()}</td>
                                    </tr>
                                    {expandedTaluka === t.name && (
                                      <tr key={`${t.name}-villages`} className="sc-geo-detail-row">
                                        <td colSpan={3}>
                                          <div className="sc-geo-child-panel sc-geo-village-panel">
                                            <div className="sc-geo-child-title">Villages in {t.name}</div>
                                            <input
                                              className="sc-search sc-geo-search"
                                              placeholder="Search village…"
                                              value={villageSearch}
                                              onChange={e => { setVillageSearch(e.target.value); setVillageOffset(0) }}
                                              onClick={e => e.stopPropagation()}
                                            />
                                            {villageLoading && <p className="muted sc-empty">Loading villages…</p>}
                                            {!villageLoading && (
                                              <>
                                                <table className="sc-table sc-geo-child-table">
                                                  <thead>
                                                    <tr>
                                                      <SortTh col="name" label="Village" sortCol={villageSortCol === 'count' ? 'beneficiaryCount' : 'name'} sortDir={villageSortDir} onSort={() => handleVillageSort('name')} />
                                                      <SortTh col="beneficiaryCount" label="Beneficiaries" sortCol={villageSortCol === 'count' ? 'beneficiaryCount' : 'name'} sortDir={villageSortDir} onSort={() => handleVillageSort('beneficiaryCount')} align="right" />
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {villageRows.map(v => (
                                                      <tr key={v.name}>
                                                        <td>{v.name}</td>
                                                        <td className="sc-num">{v.beneficiaryCount.toLocaleString()}</td>
                                                      </tr>
                                                    ))}
                                                    {villageRows.length === 0 && (
                                                      <tr><td colSpan={2} className="sc-empty">No villages match.</td></tr>
                                                    )}
                                                  </tbody>
                                                </table>
                                                <GeoPagination
                                                  offset={villageOffset}
                                                  limit={CHILD_PAGE_SIZE}
                                                  total={villageMeta?.totalMatched ?? 0}
                                                  onPageChange={(next) => loadVillages(expandedDistrict, expandedTaluka, next)}
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
                                  <tr><td colSpan={3} className="sc-empty">No taluka data.</td></tr>
                                )}
                              </tbody>
                            </table>
                          )}
                          <GeoPagination
                            offset={talukaOffset}
                            limit={CHILD_PAGE_SIZE}
                            total={talukaMeta?.totalMatched ?? 0}
                            onPageChange={(next) => loadTalukas(expandedDistrict, next)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!districtLoading && districtRows.length === 0 && (
                <tr><td colSpan={3} className="sc-empty">No districts match.</td></tr>
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

export default function SchemeCoverage() {
  const [schemes, setSchemes] = useState([])
  const [selectedScheme, setSelectedScheme] = useState(null)
  const [geoData, setGeoData] = useState(null)
  const [distribution, setDistribution] = useState(null)
  const [activeTab, setActiveTab] = useState('insights')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [schemeSearch, setSchemeSearch] = useState('')
  const [selectedMapDistrict, setSelectedMapDistrict] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const loadVersionRef = useRef(0)

  const loadSchemes = useCallback(async () => {
    setLoadError(null); setLoading(true)
    try { const data = await fetchSchemeCoverage(); setSchemes(data) }
    catch { setLoadError('Could not load scheme coverage. The service may still be starting — try again.') }
    finally { setLoading(false); setRetrying(false) }
  }, [])

  useEffect(() => { loadSchemes() }, [loadSchemes])

  const selectScheme = useCallback(async (scheme) => {
    const version = ++loadVersionRef.current
    setSelectedScheme(scheme)
    setGeoData(null)
    setDistribution(null)
    setSelectedMapDistrict(null)
    setActiveTab('insights')
    setDetailError(null)
    setGeoError(null)
    setDetailLoading(true)
    try {
      const [distResult, geoResult] = await Promise.allSettled([
        fetchSchemeDistribution(scheme.schemeId),
        fetchGeographicBreakdown(scheme.schemeId),
      ])
      if (version !== loadVersionRef.current) return
      if (distResult.status === 'fulfilled') {
        setDistribution(distResult.value)
      } else {
        setDistribution(null)
        setDetailError('Could not load distribution data.')
      }
      if (geoResult.status === 'fulfilled') {
        const raw = geoResult.value
        const scope = getOfficerDistrictScope()
        if (scope && raw?.districts) {
          setGeoData({
            ...raw,
            districts: raw.districts.filter((d) => matchesOfficerDistrict(d.districtName, scope)),
          })
          setSelectedMapDistrict(scope)
        } else {
          setGeoData(raw)
        }
      } else {
        setGeoData(null)
        setGeoError('Could not load geographic breakdown.')
      }
    } finally {
      if (version === loadVersionRef.current) setDetailLoading(false)
    }
  }, [])

  const filteredSchemes = useMemo(() => {
    const q = schemeSearch.trim().toLowerCase()
    return schemes.filter(s => {
      if (categoryFilter !== 'ALL' && (s.category || 'OTHER') !== categoryFilter) return false
      if (!q) return true
      return s.schemeName?.toLowerCase().includes(q) || s.schemeNameGujarati?.toLowerCase().includes(q) || s.department?.toLowerCase().includes(q)
    })
  }, [schemes, categoryFilter, schemeSearch])

  useEffect(() => {
    if (loading || schemes.length === 0) return
    if (selectedScheme && filteredSchemes.some((s) => s.schemeId === selectedScheme.schemeId)) return
    const pick = pickDefaultCoverageScheme(filteredSchemes)
    if (pick) {
      selectScheme(pick)
      return
    }
    setSelectedScheme(null)
    setDistribution(null)
    setGeoData(null)
    setGeoError(null)
    setDetailError(null)
  }, [loading, schemes, filteredSchemes, selectedScheme, selectScheme])

  const totalSchemes = schemes.length
  const totalEnrolled = schemes.reduce((s, x) => s + (x.totalEnrolled || 0), 0)
  const totalActive = schemes.reduce((s, x) => s + (x.activeCount || 0), 0)
  const totalPending = schemes.reduce((s, x) => s + (x.identifiedCount || 0), 0)
  const activeRate = totalEnrolled > 0 ? Math.round((totalActive / totalEnrolled) * 100) : 0

  const categoriesInData = useMemo(() => {
    const counts = {}
    schemes.forEach(s => { const c = s.category || 'OTHER'; counts[c] = (counts[c] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [schemes])

  const insights = useMemo(() => computeInsights(geoData, distribution, selectedScheme), [geoData, distribution, selectedScheme])

  function handleMapDistrictSelect(name) {
    const scope = getOfficerDistrictScope()
    if (scope && !matchesOfficerDistrict(name, scope)) return
    setSelectedMapDistrict(name)
  }

  if (loading) return <div className="sc-loading">Loading scheme coverage…</div>
  if (loadError) {
    return (
      <div className="sc-error-panel">
        <p className="sc-error">{loadError}</p>
        <button type="button" className="btn-primary" disabled={retrying} onClick={() => { setRetrying(true); loadSchemes() }}>
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    )
  }

  return (
    <div className="sc-root">
      <div className="sc-command-bar">
        <div className="sc-command-left">
          <div className="sc-command-title">Scheme Coverage Intelligence</div>
          <div className="sc-command-sub">Gujarat Government · Welfare Scheme Analytics</div>
          <DistrictScopeBanner noun="coverage" />
        </div>
        <div className="sc-command-kpis">
          <div className="sc-ckpi"><div className="sc-ckpi-val">{totalSchemes}</div><div className="sc-ckpi-label">Schemes</div></div>
          <div className="sc-ckpi"><div className="sc-ckpi-val">{totalEnrolled.toLocaleString()}</div><div className="sc-ckpi-label">Enrolled</div></div>
          <div className="sc-ckpi"><div className="sc-ckpi-val sc-ckpi-active">{totalActive.toLocaleString()}</div><div className="sc-ckpi-label">Active</div></div>
          <div className="sc-ckpi"><div className="sc-ckpi-val sc-ckpi-pending">{totalPending.toLocaleString()}</div><div className="sc-ckpi-label">Pending</div></div>
          <div className="sc-ckpi sc-ckpi-rate-block">
            <div className="sc-ckpi-rate-val">{activeRate}%</div>
            <div className="sc-ckpi-label">Activation Rate</div>
            <div className="sc-ckpi-rate-bar"><div className="sc-ckpi-rate-fill" style={{ width: `${activeRate}%` }} /></div>
          </div>
        </div>
      </div>

      <div className="sc-filter-bar">
        <div className="sc-filter-group-inline">
          <label className="sc-filter-lbl">Category</label>
          <select className="sc-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="ALL">All Categories ({schemes.length})</option>
            {categoriesInData.map(([cat, count]) => {
              const meta = CATEGORY_META[cat] || CATEGORY_META.OTHER
              return <option key={cat} value={cat}>{meta.icon} {categoryLabel(cat)} ({count})</option>
            })}
          </select>
        </div>
        <div className="sc-filter-group-inline sc-filter-scheme-wrap">
          <label className="sc-filter-lbl">Scheme</label>
          <select
            className="sc-select sc-select-scheme"
            value={selectedScheme?.schemeId ?? ''}
            onChange={e => {
              const s = schemes.find(x => x.schemeId === e.target.value)
              if (s) selectScheme(s)
            }}
          >
            <option value="">— Select scheme —</option>
            {filteredSchemes.map(s => (
              <option key={s.schemeId} value={s.schemeId}>
                {s.schemeName}{s.schemeNameGujarati ? ` · ${s.schemeNameGujarati}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="sc-filter-group-inline">
          <label className="sc-filter-lbl">Search</label>
          <input className="sc-filter-search" placeholder="Search schemes…" value={schemeSearch} onChange={e => setSchemeSearch(e.target.value)} />
        </div>
        <div className="sc-filter-count muted">{filteredSchemes.length} of {totalSchemes} schemes</div>
      </div>

      <div className="sc-main">
        {selectedScheme ? (
          <div className="sc-detail-full">
            <div className="sc-detail-header">
              <div className="sc-detail-title-block">
                <span className="sc-detail-title">{selectedScheme.schemeName}</span>
                <span className="sc-detail-sub">{selectedScheme.benefitType} · {selectedScheme.benefitValue} · {selectedScheme.department}</span>
              </div>
              <div className="sc-tabs">
                {[['insights', '💡 Insights'], ['geo', '🗺 Geographic'], ['dist', '📊 Distribution']].map(([t, l]) => (
                  <button key={t} type="button" className={`sc-tab ${activeTab === t ? 'sc-tab-active' : ''}`} onClick={() => setActiveTab(t)}>{l}</button>
                ))}
              </div>
            </div>

            {detailError && <p className="sc-error">{detailError}</p>}
            {detailLoading && <div className="sc-loading-inline">Loading scheme summary…</div>}

            {activeTab === 'insights' && (
              <InsightsTab insights={insights} selectedScheme={selectedScheme} geoData={geoData} distribution={distribution} geoError={geoError} />
            )}

            {activeTab === 'geo' && selectedScheme && (
              <GeographicTab
                schemeId={selectedScheme.schemeId}
                geoData={geoData}
                selectedMapDistrict={selectedMapDistrict}
                onSelectMapDistrict={handleMapDistrictSelect}
              />
            )}

            {activeTab === 'dist' && (
              <DistributionTab schemeId={selectedScheme.schemeId} distribution={distribution} />
            )}
          </div>
        ) : (
          <div className="sc-placeholder">
            <div className="sc-placeholder-inner">
              <div className="sc-placeholder-icon">🗺</div>
              <div className="sc-placeholder-title">Select a scheme above to analyse</div>
              <div className="sc-placeholder-sub">Choose a category and scheme from the dropdowns above to view geographic coverage and distribution analytics</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
