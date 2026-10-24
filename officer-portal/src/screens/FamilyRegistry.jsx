import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FAMILY_API, SCHEME_API, fetchTalukasForDistrict, fetchVillagesForTaluka, searchPersons } from '../api'
import { getOfficerDistrictScope, matchesOfficerDistrict } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import './FamilyRegistry.css'

const GUJARAT_DISTRICTS = [
  'Ahmedabad','Surat','Vadodara','Rajkot','Mehsana','Banaskantha','Anand',
  'Gandhinagar','Kutch','Bharuch','Junagadh','Amreli','Bhavnagar','Surendranagar',
  'Patan','Kheda','Panchmahal','Dahod','Narmada','Navsari','Valsad','Tapi',
  'Morbi','Jamnagar','Porbandar','Gir Somnath','Botad','Aravalli','Mahisagar',
  'Chhota Udaipur','Devbhumi Dwarka','Sabarkantha',
]

const EMPTY_FILTERS = {
  name:'',aadhaar:'',mobile:'',dob:'',gender:'',occupation:'',
  incomeMin:'',incomeMax:'',casteCategory:'',educationLevel:'',
  maritalStatus:'',employmentStatus:'',relationship:'',
  familyId:'',address:'',village:'',taluka:'',district:'',state:'',
}

const CASTE_COLORS = { GENERAL:'#1e40af',OBC:'#0891b2',SC:'#7c3aed',ST:'#059669',NT:'#d97706' }
const GENDER_LABEL = { M: 'Male', F: 'Female', O: 'Other' }

function genderLabel(gender) {
  if (!gender) return ''
  return GENDER_LABEL[gender] ?? gender
}

// Solid colors used in search result cards
const REL_COLORS = {
  HEAD:'#1a3c5e',SPOUSE:'#9f1239',
  SON:'#0c4a6e',DAUGHTER:'#5b21b6',
  FATHER:'#78350f',MOTHER:'#7c2d12',MOTHER_IN_LAW:'#7c2d12',
  BROTHER:'#064e3b',SISTER:'#134e4a',
  GRANDSON:'#1e3a8a',GRANDDAUGHTER:'#4c1d95',
}

// Professional white-card palette — accent color per role
const TREE_PALETTE = {
  HEAD:          { accent:'#4f46e5', light:'#eef2ff', dark:'#312e81', border:'#c7d2fe' },
  SPOUSE:        { accent:'#db2777', light:'#fdf2f8', dark:'#831843', border:'#f9a8d4' },
  SON:           { accent:'#0284c7', light:'#e0f2fe', dark:'#0c4a6e', border:'#7dd3fc' },
  DAUGHTER:      { accent:'#7c3aed', light:'#f5f3ff', dark:'#4c1d95', border:'#ddd6fe' },
  FATHER:        { accent:'#b45309', light:'#fffbeb', dark:'#78350f', border:'#fde68a' },
  MOTHER:        { accent:'#c2410c', light:'#fff7ed', dark:'#7c2d12', border:'#fed7aa' },
  MOTHER_IN_LAW: { accent:'#c2410c', light:'#fff7ed', dark:'#7c2d12', border:'#fed7aa' },
  BROTHER:       { accent:'#059669', light:'#ecfdf5', dark:'#064e3b', border:'#a7f3d0' },
  SISTER:        { accent:'#0d9488', light:'#f0fdfa', dark:'#134e4a', border:'#99f6e4' },
  GRANDSON:      { accent:'#2563eb', light:'#eff6ff', dark:'#1e3a8a', border:'#bfdbfe' },
  GRANDDAUGHTER: { accent:'#be185d', light:'#fce7f3', dark:'#831843', border:'#fbcfe8' },
  MEMBER:        { accent:'#475569', light:'#f8fafc', dark:'#1e293b', border:'#e2e8f0' },
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const MIN_QUERY_LEN = 3

function ageFromDob(dob) {
  if (!dob) return '—'
  const d = new Date(dob), now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  return age
}

function fmt(n) {
  if (n == null) return '—'
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${n.toLocaleString('en-IN')}`
}

function buildCriteria(query, filters) {
  const criteria = { limit: 50 }
  const q = query.trim()
  if (q) criteria.q = q
  Object.entries(filters).forEach(([key, value]) => {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return
    if (key === 'incomeMin' || key === 'incomeMax') {
      const num = Number(trimmed)
      if (!Number.isNaN(num)) criteria[key] = num
      return
    }
    criteria[key] = trimmed
  })
  const hasFieldFilters = Object.keys(criteria).some((k) => k !== 'q' && k !== 'limit')
  if (!q && !hasFieldFilters) return null
  // Require min chars for free-text quick search only (advanced filters bypass this)
  if (q && q.length < MIN_QUERY_LEN && !hasFieldFilters) return null
  return criteria
}

function withDistrictScope(criteria, districtScope) {
  if (!criteria || !districtScope) return criteria
  return { ...criteria, district: districtScope }
}

// ── Member card ───────────────────────────────────────────
function MemberCard({ member, highlight }) {
  const rel     = member.relationshipToHead || 'MEMBER'
  const palette = TREE_PALETTE[rel] || TREE_PALETTE.MEMBER
  const dead    = member.isAlive === false
  const initial = (member.name || '?').charAt(0).toUpperCase()
  return (
    <div
      className={`fr-mc ${dead ? 'fr-mc-dead' : ''} ${highlight ? 'fr-mc-head' : ''}`}
      style={{
        '--mc-accent': palette.accent,
        '--mc-light':  palette.light,
        '--mc-dark':   palette.dark,
        '--mc-border': palette.border,
      }}
    >
      {/* Accent stripe */}
      <div className="fr-mc-stripe" />

      {/* Avatar */}
      <div className="fr-mc-avatar-wrap">
        <div className="fr-mc-avatar">{initial}</div>
        {highlight && <span className="fr-mc-crown">👑</span>}
      </div>

      {/* Relationship chip */}
      <span className="fr-mc-rel-chip">{rel}</span>

      {/* Name */}
      <div className="fr-mc-name">{dead ? <s>{member.name}</s> : member.name}</div>

      {/* Age + gender */}
      <div className="fr-mc-age">
        {ageFromDob(member.dob)} yrs{member.gender ? ` · ${genderLabel(member.gender)}` : ''}
      </div>

      {/* Caste + occupation */}
      <div className="fr-mc-chips">
        {member.casteCategory && <span className="fr-mc-chip">{member.casteCategory}</span>}
        {member.occupation     && <span className="fr-mc-chip">💼 {member.occupation}</span>}
      </div>

      {/* Income */}
      {member.annualIncome > 0 && (
        <div className="fr-mc-income">{fmt(member.annualIncome)}/yr</div>
      )}

      {dead && <div className="fr-mc-deceased">✝ Deceased</div>}
    </div>
  )
}

function ConnectorLabel({ label }) {
  return (
    <div className="fr-connector">
      <div className="fr-connector-vline" />
      {label && <span className="fr-connector-label">{label}</span>}
      <div className="fr-connector-vline" />
    </div>
  )
}

// ── Citizen 360° profile ──────────────────────────────────
function Citizen360({ family, income, eligibility, enrolled, selectedPersonId, onSelectPerson }) {
  const [expandedScheme, setExpandedScheme] = useState(null)
  const members = family?.members || []
  const person =
    members.find((m) => m.id === selectedPersonId) ||
    members.find((m) => m.relationshipToHead === 'HEAD') ||
    members[0]

  if (!person) return <p className="muted" style={{ padding: '1.5rem' }}>No citizen data.</p>

  const personIncome = income?.breakdown?.find((b) => b.personId === person.id)
  const personAnnualIncome = personIncome?.annualIncome ?? person.annualIncome ?? 0
  const totalFamilyIncome = income?.totalAnnualIncome || 0
  const incomeShare = totalFamilyIncome > 0 ? Math.round((personAnnualIncome / totalFamilyIncome) * 100) : 0
  const personEnrolled = enrolled.filter((b) => b.personId === person.id)
  const eligibleSchemes = eligibility.filter((e) => e.eligible)

  const infoRows = [
    { label: 'Ration Card',   value: family.rationCardNumber },
    { label: 'Age',            value: ageFromDob(person.dob) ? `${ageFromDob(person.dob)} yrs` : null },
    { label: 'Gender',         value: genderLabel(person.gender) },
    { label: 'Date of Birth',  value: person.dob },
    { label: 'Caste',          value: person.casteCategory },
    { label: 'Education',      value: person.educationLevel?.replace(/_/g, ' ') },
    { label: 'Employment',     value: person.employmentStatus?.replace(/_/g, ' ') },
    { label: 'Occupation',     value: person.occupation },
    { label: 'Marital Status', value: person.maritalStatus },
  ].filter((r) => r.value)

  return (
    <div className="fr-c360-root">
      {/* Member selector */}
      <div className="fr-c360-strip">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`fr-c360-chip${m.id === person.id ? ' fr-c360-chip-active' : ''}`}
            onClick={() => onSelectPerson(m.id)}
          >
            <span className="fr-c360-chip-init">{(m.name || '?').charAt(0)}</span>
            <div className="fr-c360-chip-info">
              <span className="fr-c360-chip-name">{m.name}</span>
              <span className="fr-c360-chip-rel">{m.relationshipToHead || 'MEMBER'}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Profile body */}
      <div className="fr-c360-body">
        {/* Left: identity */}
        <div className="fr-c360-left">
          <div className="fr-c360-avatar">{(person.name || '?').charAt(0)}</div>
          <div className="fr-c360-name">{person.name}</div>
          <div className="fr-c360-rel-badge">{person.relationshipToHead || 'MEMBER'}</div>
          {person.isAlive === false && <div className="fr-c360-deceased">✝ Deceased</div>}

          <div className="fr-c360-divider" />

          <div className="fr-c360-info-list">
            {infoRows.map((r) => (
              <div key={r.label} className="fr-c360-info-row">
                <span className="fr-c360-info-label">{r.label}</span>
                <span className="fr-c360-info-value">{r.value}</span>
              </div>
            ))}
          </div>

          <div className="fr-c360-address">
            📍 {[family.village, family.taluka, family.district].filter(Boolean).join(', ') || '—'}
          </div>
        </div>

        {/* Right: financials + schemes */}
        <div className="fr-c360-right">
          <div className="fr-c360-card">
            <div className="fr-c360-card-heading">Income</div>
            <div className="fr-c360-income-amount">{fmt(personAnnualIncome)}</div>
            <div className="fr-c360-income-sub">Annual · {incomeShare}% of family total</div>
            <div className="fr-c360-income-track">
              <div className="fr-c360-income-fill" style={{ width: `${Math.min(incomeShare, 100)}%` }} />
            </div>
          </div>

          <div className="fr-c360-card">
            <div className="fr-c360-card-heading">Enrolled Schemes</div>
            {personEnrolled.length === 0 ? (
              <p className="fr-c360-none">No scheme enrollments for this person</p>
            ) : personEnrolled.map((b) => (
              <div key={b.id || b.schemeName} className="fr-c360-scheme-row">
                <span className="fr-c360-scheme-name">{b.schemeName?.replace(/_/g, ' ')}</span>
                <span className={`fr-c360-status fr-c360-s-${(b.status || '').toLowerCase()}`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>

          {eligibleSchemes.length > 0 && (
            <div className="fr-c360-card">
              <div className="fr-c360-card-heading">
                Scheme Eligibility
                <span className="fr-c360-card-hint"> · click to view parameters</span>
              </div>
              {eligibleSchemes.map((e) => {
                const isOpen = expandedScheme === e.schemeName
                const isEnrolled = enrolled.some((b) =>
                  b.schemeName?.toLowerCase().includes(e.schemeName?.toLowerCase().slice(0, 5))
                )
                return (
                  <div key={e.schemeName} className="fr-c360-elig-item">
                    <button
                      type="button"
                      className={`fr-c360-elig-row fr-c360-elig-btn${isOpen ? ' fr-c360-elig-open' : ''}`}
                      onClick={() => setExpandedScheme(isOpen ? null : e.schemeName)}
                    >
                      <span className="fr-c360-elig-tick">✓</span>
                      <span className="fr-c360-elig-name">{e.schemeName?.replace(/_/g, ' ')}</span>
                      {isEnrolled && <span className="fr-c360-enrolled-chip">Enrolled</span>}
                      <span className="fr-c360-elig-chevron">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="fr-c360-elig-detail">
                        <div className="fr-c360-elig-detail-label">Eligibility Parameters</div>
                        <p className="fr-c360-elig-detail-text">{e.reason}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Family tree ───────────────────────────────────────────
function FamilyTree({ family }) {
  const groups = useMemo(() => {
    const m = family?.members || []
    const head    = m.find((x) => x.relationshipToHead === 'HEAD') || m[0]
    const spouse  = m.find((x) => x.relationshipToHead === 'SPOUSE')
    const parents = m.filter((x) => ['FATHER','MOTHER','MOTHER_IN_LAW'].includes(x.relationshipToHead))
    const children= m.filter((x) => ['SON','DAUGHTER','GRANDSON','GRANDDAUGHTER'].includes(x.relationshipToHead))
    const others  = m.filter((x) =>
      x.id !== head?.id &&
      !['SPOUSE','FATHER','MOTHER','MOTHER_IN_LAW','SON','DAUGHTER','GRANDSON','GRANDDAUGHTER'].includes(x.relationshipToHead)
    )
    return { head, spouse, parents, children, others }
  }, [family])

  const { head, spouse, parents, children, others } = groups

  if (!head) return <p className="muted" style={{padding:'1rem'}}>No family members found.</p>

  return (
    <div className="fr-tree-bg">
    <div className="fr-tree">
      {/* Parents row */}
      {parents.length > 0 && (
        <>
          <div className="fr-tree-row">
            {parents.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
          <ConnectorLabel label="Parents" />
        </>
      )}

      {/* Head + Spouse */}
      <div className="fr-tree-couple">
        <MemberCard member={head} highlight />
        {spouse && (
          <>
            <div className="fr-couple-bridge">
              <div className="fr-couple-line" />
              <span className="fr-couple-label">SPOUSE</span>
              <div className="fr-couple-line" />
            </div>
            <MemberCard member={spouse} />
          </>
        )}
      </div>

      {/* Children */}
      {children.length > 0 && (
        <>
          <ConnectorLabel label="Children" />
          <div className="fr-tree-row">
            {children.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
        </>
      )}

      {/* Others */}
      {others.length > 0 && (
        <>
          <div className="fr-tree-section-label">Other household members</div>
          <div className="fr-tree-row">
            {others.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
        </>
      )}
    </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function FamilyRegistry() {
  const location = useLocation()
  const districtScope = getOfficerDistrictScope()
  const scopedFilters = useMemo(
    () => (districtScope ? { ...EMPTY_FILTERS, district: districtScope } : EMPTY_FILTERS),
    [districtScope],
  )
  const [query, setQuery]             = useState('')
  const [filters, setFilters]         = useState(scopedFilters)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [results, setResults]         = useState([])
  const [searchMeta, setSearchMeta]   = useState(null)
  const [family, setFamily]           = useState(null)
  const [income, setIncome]           = useState(null)
  const [eligibility, setEligibility] = useState([])
  const [enrolled, setEnrolled]       = useState([])
  const [tab, setTab]                 = useState('tree')
  const [selectedPersonId, setSelectedPersonId] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  // Result list controls
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(20)
  const [sortField, setSortField]     = useState('name')
  const [sortDir, setSortDir]         = useState('asc')
  const [filterCaste, setFilterCaste] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('')

  const [talukaOptions, setTalukaOptions] = useState([])
  const [villageOptions, setVillageOptions] = useState([])
  const [talukaLoading, setTalukaLoading] = useState(false)
  const [villageLoading, setVillageLoading] = useState(false)

  const abortRef = useRef(null)

  // Auto-load family when navigated from Fraud Signals citizen link
  useEffect(() => {
    const { familyId: incomingFamilyId, personId: incomingPersonId } = location.state || {}
    if (incomingFamilyId) {
      if (incomingPersonId) setSelectedPersonId(incomingPersonId)
      setTab('profile')
      loadFamily(incomingFamilyId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSearch = useCallback(async (criteria, isRefresh = false) => {
    if (!criteria) { setResults([]); setSearchMeta(null); setError(null); return }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!isRefresh) setPage(1)
    setLoading(true); setError(null)
    try {
      const data = await searchPersons(criteria, controller.signal)
      if (controller.signal.aborted) return
      setResults(data.results ?? [])
      setSearchMeta({
        totalMatched: data.totalMatched ?? data.results?.length ?? 0,
        limited: Boolean(data.limited),
        limit: data.limit ?? 50,
      })
    } catch (e) {
      if (e?.name === 'AbortError') return
      setResults([]); setSearchMeta(null)
      setError('Search failed. Please narrow your search or try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Quick search (debounced, min 3 chars). District is injected only once a real query exists.
  useEffect(() => {
    if (showAdvanced) return undefined
    const criteria = withDistrictScope(buildCriteria(query, EMPTY_FILTERS), districtScope)
    const t = setTimeout(() => runSearch(criteria), 500)
    return () => clearTimeout(t)
  }, [query, showAdvanced, runSearch, districtScope])

  // Advanced search (debounced)
  useEffect(() => {
    if (!showAdvanced) return undefined
    const criteria = withDistrictScope(buildCriteria(query, filters), districtScope)
    const t = setTimeout(() => runSearch(criteria), 500)
    return () => clearTimeout(t)
  }, [showAdvanced, query, filters, runSearch, districtScope])

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleDistrictFilterChange(district) {
    if (districtScope) return
    setFilters((prev) => ({ ...prev, district, taluka: '', village: '' }))
    setVillageOptions([])
  }

  function handleTalukaFilterChange(taluka) {
    setFilters((prev) => ({ ...prev, taluka, village: '' }))
  }

  useEffect(() => {
    const district = filters.district?.trim()
    if (!district) {
      setTalukaOptions([])
      return undefined
    }
    let cancelled = false
    setTalukaLoading(true)
    fetchTalukasForDistrict(district)
      .then((rows) => { if (!cancelled) setTalukaOptions(rows ?? []) })
      .catch(() => { if (!cancelled) setTalukaOptions([]) })
      .finally(() => { if (!cancelled) setTalukaLoading(false) })
    return () => { cancelled = true }
  }, [filters.district])

  useEffect(() => {
    const district = filters.district?.trim()
    const taluka = filters.taluka?.trim()
    if (!district || !taluka) {
      setVillageOptions([])
      return undefined
    }
    let cancelled = false
    setVillageLoading(true)
    fetchVillagesForTaluka(district, taluka)
      .then((rows) => { if (!cancelled) setVillageOptions(rows ?? []) })
      .catch(() => { if (!cancelled) setVillageOptions([]) })
      .finally(() => { if (!cancelled) setVillageLoading(false) })
    return () => { cancelled = true }
  }, [filters.district, filters.taluka])

  function handleAdvancedSearch(e) {
    e.preventDefault()
    runSearch(withDistrictScope(buildCriteria(query, filters), districtScope))
  }
  function handleClear() {
    setQuery(''); setFilters(scopedFilters)
    setTalukaOptions([]); setVillageOptions([])
    setResults([]); setSearchMeta(null); setError(null); setFamily(null)
    setPage(1)
  }
  function handleRefresh() {
    const base = showAdvanced ? filters : EMPTY_FILTERS
    runSearch(withDistrictScope(buildCriteria(query, base), districtScope), true)
  }
  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(1)
  }

  async function loadFamily(familyId) {
    setFamily(null); setIncome(null); setEligibility([]); setEnrolled([]); setTab('profile')
    const [famRes, incRes, eligRes, schemesRes] = await Promise.all([
      fetch(`${FAMILY_API}/v1/families/${familyId}`),
      fetch(`${FAMILY_API}/v1/families/${familyId}/income`),
      fetch(`${FAMILY_API}/v1/families/${familyId}/scheme-eligibility`),
      fetch(`${SCHEME_API}/v1/schemes`),
    ])
    if (famRes.ok) {
      const fam = await famRes.json()
      if (districtScope && !matchesOfficerDistrict(fam.district, districtScope)) {
        setError(`This family is outside ${districtScope} district.`)
        return
      }
      setFamily(fam)
    }
    if (incRes.ok) setIncome(await incRes.json())
    if (eligRes.ok) setEligibility(await eligRes.json())
    if (schemesRes.ok) {
      const schemes = await schemesRes.json()
      const lists = await Promise.all(schemes.map(async (s) => {
        const r = await fetch(`${SCHEME_API}/v1/schemes/${s.id}/beneficiaries`)
        if (!r.ok) return []
        return (await r.json()).filter(
          (b) => b.familyId === familyId && ['IDENTIFIED','CONFIRMED','ACTIVE'].includes(b.status)
        )
      }))
      setEnrolled(lists.flat())
    }
  }

  // Filtered + sorted + paginated results
  const processedResults = useMemo(() => {
    let rows = [...results]
    if (districtScope) rows = rows.filter((r) => matchesOfficerDistrict(r.district, districtScope))
    if (filterCaste)    rows = rows.filter((r) => r.casteCategory === filterCaste)
    if (filterDistrict) rows = rows.filter((r) => r.district === filterDistrict)
    rows.sort((a, b) => {
      let av, bv
      if (sortField === 'name')   { av = a.name || ''; bv = b.name || '' }
      if (sortField === 'income') { av = a.annualIncome || 0; bv = b.annualIncome || 0 }
      if (sortField === 'caste')  { av = a.casteCategory || ''; bv = b.casteCategory || '' }
      if (sortField === 'district'){ av = a.district || ''; bv = b.district || '' }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [results, sortField, sortDir, filterCaste, filterDistrict, districtScope])

  const totalPages   = Math.max(1, Math.ceil(processedResults.length / pageSize))
  const pageRows     = processedResults.slice((page - 1) * pageSize, page * pageSize)
  const castes       = useMemo(() => [...new Set(results.map((r) => r.casteCategory).filter(Boolean))].sort(), [results])
  const districts    = useMemo(() => [...new Set(results.map((r) => r.district).filter(Boolean))].sort(), [results])
  const maxIncome    = income?.breakdown?.reduce((m, x) => Math.max(m, x.annualIncome || 0), 0) || 1
  const isEmptyState = !query && !searchMeta && !loading && !showAdvanced

  return (
    <div className="fr-root">
      <DistrictScopeBanner noun="families" />
      <div className="fr-search-bar">
        <div className="fr-search-input-wrap">
          <span className="fr-search-icon">🔍</span>
          <input
            type="search"
            className="fr-search-input"
            placeholder={`Search by name, Aadhaar, mobile, village… (min ${MIN_QUERY_LEN} chars)`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          />
          {query && (
            <button type="button" className="fr-search-clear" onClick={handleClear} title="Clear">✕</button>
          )}
        </div>
        <button
          type="button"
          className="fr-icon-btn"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh search"
        >🔄</button>
        <button
          type="button"
          className={`btn-secondary fr-advanced-toggle ${showAdvanced ? 'active' : ''}`}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          ⚙ {showAdvanced ? 'Hide filters' : 'Advanced filters'}
        </button>
      </div>

      {/* ── Min-chars hint ── */}
      {!showAdvanced && query.length > 0 && query.trim().length < MIN_QUERY_LEN && (
        <p className="fr-hint">Type {MIN_QUERY_LEN - query.trim().length} more character{MIN_QUERY_LEN - query.trim().length !== 1 ? 's' : ''} to search…</p>
      )}

      {/* ── Advanced filters ── */}
      {showAdvanced && (
        <form className="fr-advanced-panel" onSubmit={handleAdvancedSearch}>
          <div className="fr-filter-grid">
            {[
              { label:'Full Name', key:'name', type:'text' },
              { label:'Aadhaar', key:'aadhaar', type:'text' },
              { label:'Mobile', key:'mobile', type:'text' },
              { label:'Date of Birth', key:'dob', type:'date' },
              { label:'Occupation', key:'occupation', type:'text' },
              { label:'Income Min (₹)', key:'incomeMin', type:'number' },
              { label:'Income Max (₹)', key:'incomeMax', type:'number' },
              { label:'Family ID', key:'familyId', type:'text' },
            ].map(({ label, key, type }) => (
              <label key={key} className="fr-filter-label">
                {label}
                <input type={type} value={filters[key]} onChange={(e) => handleFilterChange(key, e.target.value)} />
              </label>
            ))}
            <label className="fr-filter-label">
              District
              <select
                value={filters.district}
                disabled={Boolean(districtScope)}
                onChange={(e) => handleDistrictFilterChange(e.target.value)}
              >
                {!districtScope && <option value="">Any</option>}
                {(districtScope ? [districtScope] : GUJARAT_DISTRICTS).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="fr-filter-label">
              Taluka
              <select
                value={filters.taluka}
                disabled={!filters.district || talukaLoading}
                onChange={(e) => handleTalukaFilterChange(e.target.value)}
              >
                <option value="">
                  {!filters.district ? 'Select district first' : talukaLoading ? 'Loading…' : 'Any'}
                </option>
                {talukaOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="fr-filter-label">
              Village / City
              <select
                value={filters.village}
                disabled={!filters.taluka || villageLoading}
                onChange={(e) => handleFilterChange('village', e.target.value)}
              >
                <option value="">
                  {!filters.taluka ? 'Select taluka first' : villageLoading ? 'Loading…' : 'Any'}
                </option>
                {villageOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            {[
              { label:'Gender', key:'gender', opts:[{v:'',l:'Any'},{v:'M',l:'Male'},{v:'F',l:'Female'}] },
              { label:'Caste', key:'casteCategory', opts:[{v:'',l:'Any'},...['GENERAL','OBC','SC','ST','NT'].map((c)=>({v:c,l:c}))] },
              { label:'Education', key:'educationLevel', opts:[{v:'',l:'Any'},...['NONE','PRIMARY','SECONDARY','MATRIC','HIGHER_SEC','GRADUATE','POST_GRADUATE'].map((v)=>({v,l:v.replace(/_/g,' ')}))] },
              { label:'Marital Status', key:'maritalStatus', opts:[{v:'',l:'Any'},...['SINGLE','MARRIED','WIDOWED','DIVORCED','SEPARATED'].map((v)=>({v,l:v}))] },
              { label:'Employment', key:'employmentStatus', opts:[{v:'',l:'Any'},...['EMPLOYED','UNEMPLOYED','SELF_EMPLOYED','STUDENT','HOMEMAKER','RETIRED'].map((v)=>({v,l:v.replace(/_/g,' ')}))] },
              { label:'Relationship', key:'relationship', opts:[{v:'',l:'Any'},...['HEAD','SPOUSE','SON','DAUGHTER','FATHER','MOTHER','OTHER'].map((v)=>({v,l:v}))] },
            ].map(({ label, key, opts }) => (
              <label key={key} className="fr-filter-label">
                {label}
                <select value={filters[key]} onChange={(e) => handleFilterChange(key, e.target.value)}>
                  {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="fr-filter-actions">
            <button type="submit" className="btn-primary">Search</button>
            <button type="button" className="btn-secondary" onClick={handleClear}>Clear all</button>
          </div>
        </form>
      )}

      {/* ── Status ── */}
      {loading && (
        <div className="fr-loading">
          <span className="fr-spinner" />
          <span>Searching…</span>
          <button type="button" className="fr-cancel-btn" onClick={() => abortRef.current?.abort()}>Cancel</button>
        </div>
      )}
      {error && <p className="fr-error">{error}</p>}
      {searchMeta && !loading && (
        <p className="fr-meta muted">
          {searchMeta.totalMatched === 0
            ? 'No citizens found.'
            : (() => {
                const filtered = processedResults.length
                const total    = searchMeta.totalMatched
                const fetched  = results.length
                const hasClientFilter = filterCaste || filterDistrict
                if (hasClientFilter) {
                  return `${filtered.toLocaleString()} of ${fetched} fetched results (${total.toLocaleString()} total server matches)`
                }
                return searchMeta.limited
                  ? `Showing first ${fetched} of ${total.toLocaleString()} matches — refine your search to see more.`
                  : `${total.toLocaleString()} match${total === 1 ? '' : 'es'} found.`
              })()}
        </p>
      )}

      {/* ── Empty state ── */}
      {isEmptyState && !family && (
        <div className="fr-empty-state">
          <div className="fr-empty-icon">👨‍👩‍👧‍👦</div>
          <h3 className="fr-empty-title">Search Family Registry</h3>
          <p className="fr-empty-sub">
            {districtScope
              ? `${districtScope} district family registry`
              : '2,21,000+ families · 10,00,000+ citizens across Gujarat'}
          </p>
          <div className="fr-empty-chips">
            <span className="fr-empty-chip">🔍 Name · Aadhaar · Mobile</span>
            <span className="fr-empty-chip">📍 Village · District</span>
            <span className="fr-empty-chip">📋 Caste · Education · Employment</span>
            <span className="fr-empty-chip">⚙ Advanced filters for precise lookup</span>
          </div>
        </div>
      )}

      {/* ── Search results ── */}
      {!family && results.length > 0 && (
        <div className="fr-results-panel">

          {/* Sort + filter toolbar */}
          <div className="fr-result-toolbar">
            <div className="fr-sort-row">
              <span className="fr-toolbar-label">Sort:</span>
              {[['name','Name'],['income','Income'],['caste','Caste'],['district','District']].map(([f,l]) => (
                <button
                  key={f}
                  type="button"
                  className={`fr-sort-btn ${sortField === f ? 'active' : ''}`}
                  onClick={() => toggleSort(f)}
                >
                  {l} {sortField === f ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </button>
              ))}
            </div>
            <div className="fr-filter-row">
              <span className="fr-toolbar-label">Filter:</span>
              {castes.length > 1 && (
                <select className="fr-mini-select" value={filterCaste} onChange={(e) => { setFilterCaste(e.target.value); setPage(1) }}>
                  <option value="">All castes</option>
                  {castes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {districts.length > 1 && !districtScope && (
                <select className="fr-mini-select" value={filterDistrict} onChange={(e) => { setFilterDistrict(e.target.value); setPage(1) }}>
                  <option value="">All districts</option>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {(filterCaste || filterDistrict) && (
                <button type="button" className="fr-clear-filters" onClick={() => { setFilterCaste(''); setFilterDistrict(''); setPage(1) }}>
                  ✕ Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Result cards */}
          <div className="fr-results">
            {pageRows.length === 0 ? (
              <p className="muted" style={{padding:'1rem'}}>No results match the active filters.</p>
            ) : pageRows.map((p) => (
              <button key={p.id} type="button" className="fr-result-card" onClick={() => { setTab('profile'); setSelectedPersonId(p.id); loadFamily(p.familyId) }}>
                <div className="fr-result-avatar" style={{ background: CASTE_COLORS[p.casteCategory] || '#6b7280' }}>
                  {(p.name || '?').charAt(0)}
                </div>
                <div className="fr-result-body">
                  <div className="fr-result-name">{p.name}</div>
                  <div className="fr-result-location">
                    📍 {[p.village, p.district].filter(Boolean).join(', ') || '—'}
                    {p.relationshipToHead && p.relationshipToHead !== 'HEAD'
                      ? <span className="fr-rel-chip">{p.relationshipToHead}</span>
                      : null}
                  </div>
                  <div className="fr-result-tags">
                    {p.occupation && <span className="fr-tag">💼 {p.occupation}</span>}
                    {p.educationLevel && <span className="fr-tag">📚 {p.educationLevel.replace(/_/g,' ')}</span>}
                    {p.employmentStatus && <span className="fr-tag">🏢 {p.employmentStatus.replace(/_/g,' ')}</span>}
                  </div>
                </div>
                <div className="fr-result-right">
                  {p.casteCategory && (
                    <span className="fr-caste-badge" style={{ background: CASTE_COLORS[p.casteCategory] || '#6b7280' }}>
                      {p.casteCategory}
                    </span>
                  )}
                  <span className="fr-result-income">{fmt(p.annualIncome)}</span>
                  <span className="fr-result-arrow">›</span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {(totalPages > 1 || processedResults.length > 0) && (
            <div className="fr-pagination">
              <button
                type="button"
                className="fr-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >‹ Prev</button>
              <span className="fr-page-info">
                Page {page} of {totalPages}
                <span className="fr-page-count"> · {processedResults.length} results</span>
              </span>
              <button
                type="button"
                className="fr-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >Next ›</button>
              <label className="fr-page-size-label">
                Show
                <select
                  className="fr-mini-select"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                / page
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── Family detail ── */}
      {family && (
        <div className="fr-family-detail">
          <div className="fr-family-header">
            <div className="fr-family-header-left">
              <h2 className="fr-family-title">
                {family.members?.find((m) => m.relationshipToHead === 'HEAD')?.name ||
                 family.members?.[0]?.name ||
                 'Family Detail'}
              </h2>
              <div className="fr-family-header-meta">
                <span className="fr-meta-chip">
                  📍 {[family.village, family.district].filter(Boolean).join(', ') || '—'}
                </span>
                {family.rationCardNumber && (
                  <span className="fr-meta-chip">🪪 {family.rationCardNumber}</span>
                )}
                <span className="fr-meta-chip">👥 {family.members?.length || 0} members</span>
                {income?.totalAnnualIncome != null && (
                  <span className="fr-meta-chip">💰 {fmt(income.totalAnnualIncome)}/yr</span>
                )}
                {enrolled.length > 0 && (
                  <span className="fr-meta-chip fr-chip-enrolled">✓ {enrolled.length} scheme{enrolled.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setFamily(null)}>
              ← Back to results
            </button>
          </div>

          <div className="fr-detail-tabs">
            {[
              { key:'profile', label:'🧑 Citizen 360°' },
              { key:'tree',    label:'👨‍👩‍👧 Family Tree' },
              { key:'income',  label:'💰 Income Overview' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`fr-tab ${tab === key ? 'fr-tab-active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <Citizen360
              family={family}
              income={income}
              eligibility={eligibility}
              enrolled={enrolled}
              selectedPersonId={selectedPersonId}
              onSelectPerson={setSelectedPersonId}
            />
          )}

          {tab === 'tree' && <FamilyTree family={family} />}

          {tab === 'income' && income && (
            <div className="fr-income-panel">
              <div className="fr-income-total">
                <span className="fr-income-amount">{fmt(income.totalAnnualIncome)}</span>
                <span className="fr-income-label">Total family annual income</span>
              </div>
              <div className="fr-income-rows">
                {income.breakdown?.map((m) => (
                  <div key={m.personId} className="fr-income-row">
                    <div className="fr-income-avatar">{(m.name || '?').charAt(0)}</div>
                    <span className="fr-income-name">{m.name}</span>
                    <div className="fr-income-bar-wrap">
                      <div className="fr-income-bar"
                        style={{ width: `${Math.max(4, Math.round(((m.annualIncome || 0) / maxIncome) * 100))}%` }} />
                    </div>
                    <span className="fr-income-val">{fmt(m.annualIncome)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
