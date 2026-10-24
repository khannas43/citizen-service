import { Fragment, useState, useEffect, useMemo } from 'react'
import { fetchSchemes, runSimulation, fetchRules, saveRule as apiSaveRule, deleteRule as apiDeleteRule } from '../api'
import CitizenProfileModal from '../components/CitizenProfileModal'
import { getOfficerDistrictScope, matchesOfficerDistrict } from '../auth'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import './SchemeSimulator.css'

const ALL_CASTES = ['OBC', 'SC', 'ST', 'NT', 'GENERAL']

const CATEGORY_META = {
  EDUCATION:         { label: 'Education Scholarship',  icon: '🎓', color: '#1e40af' },
  SENIOR_CITIZEN:    { label: 'Senior Citizen Welfare', icon: '👴', color: '#7c3aed' },
  WOMEN_EMPOWERMENT: { label: 'Women Empowerment',      icon: '👩', color: '#be185d' },
  CHILD_WELFARE:     { label: 'Child Welfare',           icon: '👶', color: '#059669' },
  AGRICULTURE:       { label: 'Agriculture Support',     icon: '🌾', color: '#d97706' },
  LIVELIHOOD:        { label: 'Livelihood & Skill',      icon: '💼', color: '#0891b2' },
  HOUSING:           { label: 'Housing',                 icon: '🏠', color: '#64748b' },
  HEALTH:            { label: 'Health & Medical',        icon: '🏥', color: '#dc2626' },
  OTHER:             { label: 'Other / General',         icon: '📋', color: '#6b7280' },
}

const CATEGORY_TEMPLATES = {
  EDUCATION: {
    logic: 'AND',
    conditions: [
      { field: 'age',    operator: '>=', value: '6'      },
      { field: 'age',    operator: '<=', value: '25'     },
      { field: 'income', operator: '<=', value: '250000' },
      { field: 'caste',  operator: 'IN', value: 'SC,ST,OBC' },
      { field: 'education', operator: '>=', value: 'MATRIC' },
    ],
  },
  SENIOR_CITIZEN: {
    logic: 'AND',
    conditions: [
      { field: 'age',    operator: '>=', value: '60'     },
      { field: 'income', operator: '<=', value: '150000' },
      { field: 'employment', operator: 'IN', value: 'RETIRED,UNEMPLOYED,HOMEMAKER' },
    ],
  },
  WOMEN_EMPOWERMENT: {
    logic: 'AND',
    conditions: [
      { field: 'gender', operator: '=',  value: 'Female' },
      { field: 'age',    operator: '>=', value: '18'     },
      { field: 'age',    operator: '<=', value: '60'     },
      { field: 'income', operator: '<=', value: '200000' },
    ],
  },
  CHILD_WELFARE: {
    logic: 'AND',
    conditions: [
      { field: 'age',    operator: '<=', value: '14'     },
      { field: 'income', operator: '<=', value: '200000' },
    ],
  },
  AGRICULTURE: {
    logic: 'AND',
    conditions: [
      { field: 'income', operator: '<=', value: '400000' },
    ],
  },
  LIVELIHOOD: {
    logic: 'AND',
    conditions: [
      { field: 'age',    operator: '>=', value: '18'     },
      { field: 'age',    operator: '<=', value: '45'     },
      { field: 'income', operator: '<=', value: '300000' },
      { field: 'employment', operator: 'IN', value: 'UNEMPLOYED,SELF_EMPLOYED' },
    ],
  },
  HOUSING: {
    logic: 'AND',
    conditions: [
      { field: 'income', operator: '<=', value: '150000' },
      { field: 'caste',  operator: 'IN', value: 'SC,ST,OBC,NT' },
    ],
  },
  HEALTH: {
    logic: 'AND',
    conditions: [
      { field: 'income', operator: '<=', value: '300000' },
    ],
  },
  OTHER: {
    logic: 'AND',
    conditions: [
      { field: 'income', operator: '<=', value: '250000' },
    ],
  },
}

const CASTE_COLORS = {
  OBC: '#1e40af', SC: '#7c3aed', ST: '#059669',
  NT: '#d97706', GENERAL: '#6b7280',
}
const GENDER_COLORS = { Female: '#be185d', Male: '#1d4ed8', Unknown: '#6b7280' }

function formatIncome(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`
  return `₹${amount.toLocaleString()}`
}

function formatCrore(amount) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`
  return `₹${amount.toLocaleString()}`
}

function PieChart({ data, size = 200 }) {
  const [tooltip, setTooltip] = useState(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const ir = size * 0.2

  let startAngle = -Math.PI / 2
  const slices = data.map((d) => {
    const angle = (d.value / total) * 2 * Math.PI
    const endAngle = startAngle + angle
    const mid = startAngle + angle / 2
    const slice = { ...d, startAngle, endAngle, mid, pct: ((d.value / total) * 100).toFixed(1) }
    startAngle = endAngle
    return slice
  })

  function arcPath(sa, ea) {
    const x1 = cx + r * Math.cos(sa)
    const y1 = cy + r * Math.sin(sa)
    const x2 = cx + r * Math.cos(ea)
    const y2 = cy + r * Math.sin(ea)
    const ix1 = cx + ir * Math.cos(ea)
    const iy1 = cy + ir * Math.sin(ea)
    const ix2 = cx + ir * Math.cos(sa)
    const iy2 = cy + ir * Math.sin(sa)
    const large = ea - sa > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2} Z`
  }

  return (
    <div className="sim-pie-wrap">
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path
              key={i}
              d={arcPath(s.startAngle, s.endAngle)}
              fill={s.color}
              opacity={tooltip && tooltip.label !== s.label ? 0.6 : 0.9}
              stroke="#fff"
              strokeWidth="1.5"
              onMouseEnter={(e) => setTooltip({ ...s, ex: e.clientX, ey: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            />
          ))}
          <text x={cx} y={cy - 7} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-text)">
            {total.toLocaleString()}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="var(--color-text-muted)">
            total
          </text>
        </svg>
        {tooltip && (
          <div className="sim-pie-tooltip" style={{ left: tooltip.ex + 14, top: tooltip.ey - 14 }}>
            <strong>{tooltip.label}</strong>
            <div>{tooltip.value.toLocaleString()} ({tooltip.pct}%)</div>
            {tooltip.cost != null && <div>{formatCrore(tooltip.cost)}</div>}
          </div>
        )}
      </div>
      <div className="sim-pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="sim-pie-legend-row">
            <span className="sim-pie-legend-dot" style={{ background: s.color }} />
            <span className="sim-pie-legend-label">{s.label}</span>
            <span className="sim-pie-legend-val">{s.value.toLocaleString()} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SortTh({ label, field, sort, onSort }) {
  const active = sort.field === field
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onSort(field)}
    >
      {label}{' '}
      <span style={{ opacity: active ? 1 : 0.3 }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  )
}

const RULE_FIELDS = [
  { value: 'income',   label: 'Family Income (₹)' },
  { value: 'age',      label: 'Member Age (yrs)' },
  { value: 'caste',    label: 'Caste Category' },
  { value: 'gender',   label: 'Head Gender' },
  { value: 'district', label: 'District' },
  { value: 'education',      label: 'Education Level' },
  { value: 'marital_status', label: 'Marital Status'  },
  { value: 'employment',     label: 'Employment Status' },
]

const DATA_SOURCES = {
  income:         { label: 'Family Registry',          icon: '📋', color: '#0891b2' },
  age:            { label: 'UIDAI · Aadhaar',          icon: '🔐', color: '#7c3aed' },
  caste:          { label: 'Mamlatdar · Caste Cert',   icon: '📜', color: '#059669' },
  gender:         { label: 'UIDAI · Aadhaar',          icon: '🔐', color: '#7c3aed' },
  district:       { label: 'Family Registry',          icon: '📋', color: '#0891b2' },
  education:      { label: 'GSEB / DigiLocker',        icon: '📚', color: '#1e40af' },
  marital_status: { label: 'Civil Registration (CRS)', icon: '🏛', color: '#64748b' },
  employment:     { label: 'NCS Portal',               icon: '💼', color: '#d97706' },
}

function operatorOptions(field) {
  if (field === 'income' || field === 'age') {
    return [
      { value: '<=', label: '≤ at most' },
      { value: '>=', label: '≥ at least' },
      { value: '=',  label: '= equals' },
      { value: '!=', label: '≠ not equals' },
    ]
  }
  if (field === 'gender') {
    return [
      { value: '=',  label: '= is' },
      { value: '!=', label: '≠ is not' },
    ]
  }
  if (field === 'education') {
    return [
      { value: '>=',     label: '≥ at least (e.g. ≥ MATRIC)' },
      { value: '<=',     label: '≤ at most' },
      { value: '=',      label: '= exactly' },
      { value: '!=',     label: '≠ not' },
      { value: 'IN',     label: '∈ is one of' },
      { value: 'NOT_IN', label: '∉ is not one of' },
    ]
  }
  if (field === 'marital_status' || field === 'employment') {
    return [
      { value: '=',      label: '= is' },
      { value: '!=',     label: '≠ is not' },
      { value: 'IN',     label: '∈ is one of' },
      { value: 'NOT_IN', label: '∉ is not one of' },
    ]
  }
  return [
    { value: '=',      label: '= equals' },
    { value: '!=',     label: '≠ not equals' },
    { value: 'IN',     label: '∈ is one of' },
    { value: 'NOT_IN', label: '∉ is not one of' },
  ]
}

function valuePlaceholder(field) {
  switch (field) {
    case 'income':   return 'e.g. 250000'
    case 'age':      return 'e.g. 18'
    case 'caste':    return 'e.g. OBC or OBC,SC,ST'
    case 'gender':   return 'Male or Female'
    case 'district': return 'e.g. Ahmedabad'
    case 'education':      return 'e.g. MATRIC or MATRIC,HIGHER_SEC,GRADUATE'
    case 'marital_status': return 'e.g. WIDOWED or SINGLE,DIVORCED'
    case 'employment':     return 'e.g. UNEMPLOYED or EMPLOYED,SELF_EMPLOYED'
    default:         return ''
  }
}

function emptyCondition() {
  return { field: 'income', operator: '<=', value: '' }
}

export default function SchemeSimulator() {
  const districtScope = getOfficerDistrictScope()
  const [schemes, setSchemes] = useState([])
  const [baseSchemeId, setBaseSchemeId] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [maxIncome, setMaxIncome] = useState('')
  const [castes, setCastes] = useState([...ALL_CASTES])
  const [benefitAmount, setBenefitAmount] = useState('')
  const [projectionYears, setProjectionYears] = useState('5')
  const [growthRate, setGrowthRate] = useState('3')
  const [attritionRate, setAttritionRate] = useState('0')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Rule Builder state
  const [paramsOpen, setParamsOpen] = useState(true)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [ruleConditions, setRuleConditions] = useState([emptyCondition()])
  const [ruleLogic, setRuleLogic] = useState('AND')
  const [ruleName, setRuleName] = useState('')
  const [savedRules, setSavedRules] = useState([])
  const [selectedRuleId, setSelectedRuleId] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [ruleSaveMsg, setRuleSaveMsg] = useState(null)
  const [ruleDeleteMsg, setRuleDeleteMsg] = useState(null)

  const [profileSubject, setProfileSubject] = useState(null)

  const [districtSearch, setDistrictSearch] = useState('')
  const [districtSort, setDistrictSort] = useState({ field: 'count', dir: 'desc' })
  const [districtShowAll, setDistrictShowAll] = useState(false)
  const [distExpandedDistrict, setDistExpandedDistrict] = useState(null)
  const [distExpandedTaluka, setDistExpandedTaluka] = useState(null)

  const [benFilterGender, setBenFilterGender] = useState('ALL')
  const [benFilterDistrict, setBenFilterDistrict] = useState(districtScope || 'ALL')
  const [benFilterTaluka, setBenFilterTaluka] = useState('ALL')
  const [benFilterVillage, setBenFilterVillage] = useState('ALL')
  const [benFilterCaste, setBenFilterCaste] = useState('ALL')
  const [benFilterMinAge, setBenFilterMinAge] = useState('')
  const [benFilterMaxAge, setBenFilterMaxAge] = useState('')
  const [benSort, setBenSort] = useState({ field: 'name', dir: 'asc' })
  const [benPage, setBenPage] = useState(1)
  const BEN_PAGE_SIZE = 10

  useEffect(() => { fetchSchemes().then(setSchemes) }, [])
  useEffect(() => {
    if (ruleOpen && savedRules.length === 0) {
      fetchRules().then(setSavedRules)
    }
  }, [ruleOpen])

  function handleBaseSchemeChange(e) {
    const id = e.target.value
    setBaseSchemeId(id)
    if (id) {
      const scheme = schemes.find((s) => s.id === id)
      if (scheme) {
        if (scheme.minAge) setMinAge(String(scheme.minAge))
        if (scheme.maxAge) setMaxAge(String(scheme.maxAge))
        if (scheme.incomeCeiling) setMaxIncome(String(scheme.incomeCeiling))
        if (scheme.eligibleCastes) {
          setCastes(scheme.eligibleCastes.split(',').map((c) => c.trim().toUpperCase()))
        }
        if (scheme.benefitValue) {
          const parsed = parseInt(String(scheme.benefitValue).replace(/[^\d]/g, ''), 10)
          if (!isNaN(parsed) && parsed > 0) setBenefitAmount(String(parsed))
        }
      }
    }
  }

  function toggleCaste(caste) {
    setCastes((prev) => (prev.includes(caste) ? prev.filter((c) => c !== caste) : [...prev, caste]))
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    setResult(null)
    resetFilters()
    try {
      const data = await runSimulation(baseSchemeId || null, {
        minAge: minAge ? parseInt(minAge, 10) : null,
        maxAge: maxAge ? parseInt(maxAge, 10) : null,
        maxIncome: maxIncome ? parseInt(maxIncome, 10) : null,
        eligibleCastes: castes.length > 0 ? castes : null,
        benefitAmountPerYear: benefitAmount ? parseInt(benefitAmount, 10) : null,
        projectionYears: projectionYears ? parseInt(projectionYears, 10) : 5,
        annualGrowthRate: growthRate ? parseFloat(growthRate) / 100 : 0.03,
        annualAttritionRate: attritionRate ? parseFloat(attritionRate) / 100 : 0.0,
      })
      setResult(data)
    } catch (err) {
      setError(err?.message || 'Simulation failed.')
    } finally {
      setRunning(false)
    }
  }

  function resetFilters() {
    setDistrictSearch('')
    setDistrictShowAll(false)
    setDistExpandedDistrict(null)
    setDistExpandedTaluka(null)
    setBenFilterGender('ALL')
    setBenFilterDistrict(districtScope || 'ALL')
    setBenFilterTaluka('ALL')
    setBenFilterVillage('ALL')
    setBenFilterCaste('ALL')
    setBenFilterMinAge('')
    setBenFilterMaxAge('')
    setBenPage(1)
  }

  // Rule builder helpers
  function addCondition() {
    setRuleConditions((prev) => [...prev, emptyCondition()])
    setSelectedRuleId('')
  }

  function removeCondition(idx) {
    setRuleConditions((prev) => prev.filter((_, i) => i !== idx))
    setSelectedRuleId('')
  }

  function updateCondition(idx, key, val) {
    setRuleConditions((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: val }
      if (key === 'field') {
        const ops = operatorOptions(val)
        const curOp = next[idx].operator
        if (!ops.find((o) => o.value === curOp)) {
          next[idx].operator = ops[0].value
        }
      }
      return next
    })
    setSelectedRuleId('')
    setSelectedCategory(null)
  }

  function loadSavedRule(ruleId) {
    setSelectedRuleId(ruleId)
    if (!ruleId) return
    const rule = savedRules.find((r) => r.id === ruleId)
    if (rule) {
      setRuleConditions(rule.conditions?.length ? rule.conditions : [emptyCondition()])
      setRuleLogic(rule.conditionLogic || 'AND')
      setRuleName(rule.name || '')
    }
    setRuleSaveMsg(null)
  }

  function applyCategory(catKey) {
    const tmpl = CATEGORY_TEMPLATES[catKey]
    if (!tmpl) return
    setSelectedCategory(catKey)
    setRuleConditions(tmpl.conditions.map((c) => ({ ...c })))
    setRuleLogic(tmpl.logic)
    setSelectedRuleId('')
    setRuleSaveMsg(null)
    setRuleName(CATEGORY_META[catKey]?.label || '')
  }

  async function handleSaveRule() {
    if (!ruleName.trim() || ruleConditions.length === 0) return
    setRuleSaveMsg(null)
    const createdBy = localStorage.getItem('officer_name') || 'Officer'
    try {
      const saved = await apiSaveRule(ruleName.trim(), ruleLogic, ruleConditions, createdBy)
      setSavedRules((prev) => [saved, ...prev])
      setSelectedRuleId(saved.id)
      setRuleSaveMsg('✓ Saved')
    } catch {
      setRuleSaveMsg('Save failed')
    }
  }

  async function handleDeleteRule() {
    if (!selectedRuleId) return
    try {
      await apiDeleteRule(selectedRuleId)
      setSavedRules((prev) => prev.filter((r) => r.id !== selectedRuleId))
      setSelectedRuleId('')
      setRuleConditions([emptyCondition()])
      setRuleName('')
      setRuleDeleteMsg('Deleted')
      setTimeout(() => setRuleDeleteMsg(null), 2000)
    } catch {
      setRuleDeleteMsg('Delete failed')
    }
  }

  async function handleRunWithRule() {
    if (ruleConditions.length === 0 || ruleConditions.every((c) => !c.value.trim())) return
    setRunning(true)
    setError(null)
    setResult(null)
    resetFilters()
    try {
      const ruleId = selectedRuleId || null
      const inlineConditions = ruleId ? null : ruleConditions
      const inlineLogic = ruleId ? null : ruleLogic
      const data = await runSimulation(
        baseSchemeId || null,
        {
          benefitAmountPerYear: benefitAmount ? parseInt(benefitAmount, 10) : null,
          projectionYears: projectionYears ? parseInt(projectionYears, 10) : 5,
          annualGrowthRate: growthRate ? parseFloat(growthRate) / 100 : 0.03,
          annualAttritionRate: attritionRate ? parseFloat(attritionRate) / 100 : 0.0,
        },
        ruleId,
        inlineConditions,
        inlineLogic,
      )
      setResult(data)
    } catch (err) {
      setError(err?.message || 'Simulation failed.')
    } finally {
      setRunning(false)
    }
  }

  function handleBeneficiaryClick(b) {
    setProfileSubject({ personName: b.personName, familyId: b.familyId, personId: b.personId })
  }

  function toggleDistrictSort(field) {
    setDistrictSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  function toggleBenSort(field) {
    setBenSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const districtRows = useMemo(() => {
    if (!result) return []
    const breakdown = result.districtBreakdown || {}
    const budget = result.districtBudget || {}
    const total = Object.values(breakdown).reduce((s, v) => s + v, 0) || 1
    let rows = Object.entries(breakdown).map(([district, count]) => ({
      district,
      count,
      budget: budget[district] ?? null,
      pct: ((count / total) * 100).toFixed(1),
    }))
    if (districtScope) {
      rows = rows.filter((r) => matchesOfficerDistrict(r.district, districtScope))
    }
    if (districtSearch.trim()) {
      const q = districtSearch.trim().toLowerCase()
      rows = rows.filter((r) => r.district.toLowerCase().includes(q))
    }
    rows.sort((a, b) => {
      let av = districtSort.field === 'district'
        ? a.district
        : districtSort.field === 'budget'
          ? (a.budget ?? -1)
          : a.count
      let bv = districtSort.field === 'district'
        ? b.district
        : districtSort.field === 'budget'
          ? (b.budget ?? -1)
          : b.count
      if (typeof av === 'string') {
        return districtSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return districtSort.dir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [result, districtSearch, districtSort, districtScope])

  const districtDisplay = districtShowAll ? districtRows : districtRows.slice(0, 10)

  const benDistrictOptions = useMemo(() => {
    if (!result?.projectedBeneficiaries) return []
    const names = [...new Set(result.projectedBeneficiaries.map((b) => b.district).filter(Boolean))]
    return names
      .filter((d) => !districtScope || matchesOfficerDistrict(d, districtScope))
      .sort()
  }, [result, districtScope])

  const benCasteOptions = useMemo(() => {
    if (!result?.projectedBeneficiaries) return []
    return [...new Set(result.projectedBeneficiaries.map((b) => b.casteCategory).filter(Boolean))].sort()
  }, [result])

  const benTalukaOptions = useMemo(() => {
    if (benFilterDistrict === 'ALL' || !result?.talukaBreakdown?.[benFilterDistrict]) return []
    return Object.entries(result.talukaBreakdown[benFilterDistrict])
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [result, benFilterDistrict])

  const benVillageOptions = useMemo(() => {
    if (benFilterDistrict === 'ALL' || benFilterTaluka === 'ALL') return []
    const villages = result?.villageBreakdown?.[benFilterDistrict]?.[benFilterTaluka]
    if (!villages) return []
    return Object.entries(villages)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [result, benFilterDistrict, benFilterTaluka])

  const benRows = useMemo(() => {
    if (!result?.projectedBeneficiaries) return []
    let rows = result.projectedBeneficiaries.filter((b) => {
      const gender = b.gender === 'F' ? 'Female' : b.gender === 'M' ? 'Male' : b.gender
      if (benFilterGender !== 'ALL' && gender !== benFilterGender) return false
      if (benFilterDistrict !== 'ALL' && b.district !== benFilterDistrict) return false
      if (benFilterTaluka !== 'ALL' && b.taluka !== benFilterTaluka) return false
      if (benFilterVillage !== 'ALL' && b.village !== benFilterVillage) return false
      if (benFilterCaste !== 'ALL' && b.casteCategory !== benFilterCaste) return false
      if (benFilterMinAge && b.age < parseInt(benFilterMinAge, 10)) return false
      if (benFilterMaxAge && b.age > parseInt(benFilterMaxAge, 10)) return false
      return true
    })
    rows.sort((a, b) => {
      let av
      let bv
      if (benSort.field === 'name') { av = a.personName; bv = b.personName }
      if (benSort.field === 'age') { av = a.age; bv = b.age }
      if (benSort.field === 'income') { av = a.annualIncome; bv = b.annualIncome }
      if (benSort.field === 'caste') { av = a.casteCategory; bv = b.casteCategory }
      if (typeof av === 'string') {
        return benSort.dir === 'asc' ? av?.localeCompare(bv) : bv?.localeCompare(av)
      }
      return benSort.dir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [result, benFilterGender, benFilterDistrict, benFilterTaluka, benFilterVillage, benFilterCaste, benFilterMinAge, benFilterMaxAge, benSort])

  const benTotalPages = Math.max(1, Math.ceil(benRows.length / BEN_PAGE_SIZE))
  const benPageRows = benRows.slice((benPage - 1) * BEN_PAGE_SIZE, benPage * BEN_PAGE_SIZE)

  const castePieData = useMemo(() => {
    if (!result?.casteBreakdown) return []
    return Object.entries(result.casteBreakdown).map(([label, value]) => ({
      label,
      value,
      cost: result.casteBudget?.[label] ?? null,
      color: CASTE_COLORS[label] ?? '#94a3b8',
    }))
  }, [result])

  const genderPieData = useMemo(() => {
    if (!result?.genderBreakdown) return []
    return Object.entries(result.genderBreakdown).map(([key, value]) => {
      const label = key === 'F' ? 'Female' : key === 'M' ? 'Male' : key
      return {
        label,
        value,
        cost: result.genderBudget?.[key] ?? null,
        color: GENDER_COLORS[label] ?? '#94a3b8',
      }
    })
  }, [result])

  const hasFilters = benFilterGender !== 'ALL'
    || (!districtScope && benFilterDistrict !== 'ALL')
    || benFilterTaluka !== 'ALL' || benFilterVillage !== 'ALL'
    || benFilterCaste !== 'ALL' || benFilterMinAge || benFilterMaxAge

  const schemesByCategory = useMemo(() => {
    const grouped = {}
    schemes.forEach((s) => {
      const cat = s.category || 'OTHER'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(s)
    })
    return grouped
  }, [schemes])

  return (
    <>
    <div className="sim-root">
      <h2 className="sim-title">🔮 Scheme Eligibility Simulator</h2>
      <p className="muted" style={{ marginBottom: '0.35rem' }}>
        Adjust eligibility parameters and see projected beneficiary count and budget before publishing a scheme.
        All projections run against live family registry data.
      </p>
      <DistrictScopeBanner noun="projections" />

      <div className="dg-card sim-rule-card">
        <button type="button" className="sim-rule-toggle" onClick={() => setParamsOpen((v) => !v)}>
          <span>📋 Simulation Parameters</span>
          <span className="sim-rule-toggle-arrow">{paramsOpen ? '▲' : '▼'}</span>
        </button>
        {paramsOpen && (
        <div className="sim-rule-body">
        <div className="sim-field" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <label className="sim-field-label">Base scheme (optional — pre-fills parameters)</label>
          <select className="sim-field-input" value={baseSchemeId} onChange={handleBaseSchemeChange}>
            <option value="">— No baseline (fresh simulation) —</option>
            {Object.entries(schemesByCategory).map(([cat, list]) => {
              const meta = CATEGORY_META[cat] || CATEGORY_META.OTHER
              return (
                <optgroup key={cat} label={`${meta.icon}  ${meta.label}`}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              )
            })}
          </select>
        </div>
        <div className="sim-param-grid">
          <div className="sim-field">
            <label className="sim-field-label">Min Age</label>
            <input className="sim-field-input" type="number" placeholder="e.g. 18" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
          </div>
          <div className="sim-field">
            <label className="sim-field-label">Max Age</label>
            <input className="sim-field-input" type="number" placeholder="e.g. 60" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
          </div>
          <div className="sim-field">
            <label className="sim-field-label">Income Ceiling (₹)</label>
            <input className="sim-field-input" type="number" placeholder="e.g. 250000" value={maxIncome} onChange={(e) => setMaxIncome(e.target.value)} />
          </div>
        </div>
        <div className="sim-field" style={{ marginBottom: '1.25rem' }}>
          <label className="sim-field-label">Eligible Castes</label>
          <div className="sim-caste-chips">
            {ALL_CASTES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCaste(c)}
                className={`sim-caste-chip${castes.includes(c) ? ' active' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="sim-section-divider">
          <span className="sim-section-label">Budget Forecasting (optional)</span>
        </div>
        <div className="sim-budget-grid">
          <div className="sim-field">
            <label className="sim-field-label">Benefit per beneficiary (₹/year)</label>
            <input className="sim-field-input" type="number" placeholder="e.g. 18000" value={benefitAmount} onChange={(e) => setBenefitAmount(e.target.value)} />
          </div>
          <div className="sim-field">
            <label className="sim-field-label">Projection (years)</label>
            <input className="sim-field-input" type="number" min="1" max="10" value={projectionYears} onChange={(e) => setProjectionYears(e.target.value)} />
          </div>
          <div className="sim-field">
            <label className="sim-field-label">Annual growth rate (%)</label>
            <input className="sim-field-input" type="number" min="0" max="20" step="0.5" value={growthRate} onChange={(e) => setGrowthRate(e.target.value)} />
          </div>
          <div className="sim-field">
            <label className="sim-field-label">Annual attrition rate (%) <span className="sim-field-hint">deaths, age-outs</span></label>
            <input className="sim-field-input" type="number" min="0" max="20" step="0.5" value={attritionRate} onChange={(e) => setAttritionRate(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn-primary" disabled={running} onClick={handleRun} style={{ minWidth: '160px' }}>
          {running ? '⏳ Running simulation…' : '🔮 Run Simulation'}
        </button>
        {error && <p className="error-text" style={{ marginTop: '0.5rem' }}>{error}</p>}
        </div>
        )}
      </div>

      {/* Custom Rule Builder */}
      <div className="dg-card sim-rule-card">
        <button type="button" className="sim-rule-toggle" onClick={() => setRuleOpen((v) => !v)}>
          <span>⚡ Custom Rule Builder</span>
          <span className="sim-rule-toggle-arrow">{ruleOpen ? '▲' : '▼'}</span>
        </button>
        {ruleOpen && (
          <div className="sim-rule-body">
            {/* Load saved rule */}
            <div className="sim-rule-saved-row">
              <div className="sim-field" style={{ flex: 1 }}>
                <label className="sim-field-label">Load a saved rule</label>
                <select
                  className="sim-field-input"
                  value={selectedRuleId}
                  onChange={(e) => loadSavedRule(e.target.value)}
                >
                  <option value="">— Select a saved rule —</option>
                  {savedRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              {selectedRuleId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="sim-rule-delete-btn" onClick={handleDeleteRule}>
                    🗑 Delete Rule
                  </button>
                  {ruleDeleteMsg && <span className="sim-rule-msg error">{ruleDeleteMsg}</span>}
                </div>
              )}
            </div>

            <div className="sim-section-divider" style={{ margin: '0.85rem 0 0.75rem' }}>
              <span className="sim-section-label">1 · Pick a Category (pre-fills conditions)</span>
            </div>

            <div className="sim-category-grid">
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  className={`sim-category-card${selectedCategory === key ? ' active' : ''}`}
                  style={{ '--cat-color': meta.color }}
                  onClick={() => applyCategory(key)}
                >
                  <span className="sim-category-icon">{meta.icon}</span>
                  <span className="sim-category-label">{meta.label}</span>
                </button>
              ))}
            </div>

            <div className="sim-section-divider" style={{ margin: '0.85rem 0 0.75rem' }}>
              <span className="sim-section-label">2 · Refine Conditions</span>
            </div>

            {/* AND / OR logic toggle */}
            <div className="sim-rule-logic-row">
              <span className="sim-field-label">Match:</span>
              <label className="sim-rule-logic-option">
                <input
                  type="radio"
                  checked={ruleLogic === 'AND'}
                  onChange={() => { setRuleLogic('AND'); setSelectedRuleId('') }}
                />
                AND <span className="muted">(all conditions)</span>
              </label>
              <label className="sim-rule-logic-option">
                <input
                  type="radio"
                  checked={ruleLogic === 'OR'}
                  onChange={() => { setRuleLogic('OR'); setSelectedRuleId('') }}
                />
                OR <span className="muted">(any condition)</span>
              </label>
            </div>

            {/* Condition rows */}
            <div className="sim-rule-conditions">
              {ruleConditions.map((c, i) => (
                <div key={i} className="sim-rule-row">
                  <select
                    className="sim-rule-select"
                    value={c.field}
                    onChange={(e) => updateCondition(i, 'field', e.target.value)}
                  >
                    {RULE_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    className="sim-rule-select sim-rule-select-op"
                    value={c.operator}
                    onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                  >
                    {operatorOptions(c.field).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    className="sim-rule-val"
                    type={c.field === 'income' || c.field === 'age' ? 'number' : 'text'}
                    value={c.value}
                    onChange={(e) => updateCondition(i, 'value', e.target.value)}
                    placeholder={valuePlaceholder(c.field)}
                  />
                  {DATA_SOURCES[c.field] && (
                    <div className="sim-rule-source-badge" title={`Verified from: ${DATA_SOURCES[c.field].label}`}>
                      <span>{DATA_SOURCES[c.field].icon}</span>
                      <span>{DATA_SOURCES[c.field].label}</span>
                    </div>
                  )}
                  {ruleConditions.length > 1 && (
                    <button
                      type="button"
                      className="sim-rule-remove"
                      onClick={() => removeCondition(i)}
                      title="Remove condition"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button type="button" className="sim-rule-add-btn" onClick={addCondition}>
              + Add Condition
            </button>

            <div className="sim-section-divider" style={{ margin: '0.85rem 0 0.75rem' }}>
              <span className="sim-section-label">3 · Save / Run</span>
            </div>

            <div className="sim-rule-actions">
              <div className="sim-rule-save-row">
                <input
                  className="sim-field-input"
                  type="text"
                  placeholder="Rule name (required to save)"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!ruleName.trim() || ruleConditions.every((c) => !c.value.trim())}
                  onClick={handleSaveRule}
                >
                  💾 Save Rule
                </button>
                {ruleSaveMsg && (
                  <span className={`sim-rule-msg${ruleSaveMsg.startsWith('✓') ? '' : ' error'}`}>
                    {ruleSaveMsg}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={running || ruleConditions.every((c) => !c.value.trim())}
                onClick={handleRunWithRule}
                style={{ minWidth: '220px' }}
              >
                {running ? '⏳ Running…' : '⚡ Run Simulation with Rule'}
              </button>
            </div>

            {error && <p className="error-text" style={{ marginTop: '0.5rem' }}>{error}</p>}
          </div>
        )}
      </div>

      {result && (
        <>
          {result.appliedRuleName && (
            <div className="sim-rule-applied-banner">
              ⚡ <strong>Rule applied:</strong> {result.appliedRuleName}
            </div>
          )}
          <div className="sim-kpi-row">
            <div className="dg-card sim-kpi-card">
              <div className="sim-kpi-value">{result.projectedCount.toLocaleString()}</div>
              <div className="sim-kpi-label">Citizens Qualify</div>
              {baseSchemeId && result.currentCount > 0 && (
                <div className={`sim-delta-chip${result.delta >= 0 ? ' positive' : ' negative'}`} style={{ marginTop: '0.4rem' }}>
                  {result.delta >= 0 ? '▲' : '▼'} {Math.abs(result.delta).toLocaleString()} vs current ({result.currentCount.toLocaleString()})
                </div>
              )}
            </div>
            {result.totalAnnualCost != null && (
              <div className="dg-card sim-kpi-card">
                <div className="sim-kpi-value accent">{formatCrore(result.totalAnnualCost)}</div>
                <div className="sim-kpi-label">Annual Budget Required</div>
              </div>
            )}
            {result.yearlyProjection?.length > 0 && (
              <div className="dg-card sim-kpi-card">
                <div className="sim-kpi-value accent">
                  {formatCrore(result.yearlyProjection.reduce((s, y) => s + y.totalCost, 0))}
                </div>
                <div className="sim-kpi-label">{result.yearlyProjection.length}-Year Cumulative Cost</div>
              </div>
            )}
          </div>

          {result.yearlyProjection?.length > 0 && (
            <div className="dg-card" style={{ marginBottom: '1.5rem' }}>
              <h3 className="sim-section-title">Year-wise Budget Projection</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Projected Beneficiaries</th>
                      <th>Annual Cost</th>
                      <th>Cumulative Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let cum = 0
                      return result.yearlyProjection.map((y) => {
                        cum += y.totalCost
                        return (
                          <tr key={y.year}>
                            <td>Year {y.year}</td>
                            <td>{y.beneficiaryCount.toLocaleString()}</td>
                            <td>{formatCrore(y.totalCost)}</td>
                            <td>{formatCrore(cum)}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {districtRows.length > 0 && (
            <div className="dg-card" style={{ marginBottom: '1.5rem' }}>
              <div className="sim-table-header">
                <h3 className="sim-section-title" style={{ margin: 0 }}>
                  District-wise Distribution
                  {result.districtBudget && <span className="sim-section-subtitle"> with Budget</span>}
                </h3>
                <input
                  className="sim-district-search"
                  type="text"
                  placeholder="Search district…"
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                />
              </div>
              <p className="sim-geo-hint">Click ▸ on a district to expand talukas; click a taluka to expand villages / cities.</p>
              <div className="table-wrap">
                <table className="data-table sim-geo-table">
                  <thead>
                    <tr>
                      <th className="sim-geo-expand-col" />
                      <SortTh label="District / Taluka / Village" field="district" sort={districtSort} onSort={toggleDistrictSort} />
                      <SortTh label="Beneficiaries" field="count" sort={districtSort} onSort={toggleDistrictSort} />
                      <th>% Share</th>
                      {result.districtBudget && (
                        <SortTh label="Annual Budget" field="budget" sort={districtSort} onSort={toggleDistrictSort} />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {districtDisplay.map((row) => {
                      const talukas = result.talukaBreakdown?.[row.district] || {}
                      const talukaEntries = Object.entries(talukas).sort((a, b) => b[1] - a[1])
                      const districtExpanded = distExpandedDistrict === row.district
                      return (
                        <Fragment key={row.district}>
                          <tr
                            className={`sim-geo-row ${districtExpanded ? 'sim-geo-row-expanded' : ''}`}
                            onClick={() => {
                              setDistExpandedDistrict(districtExpanded ? null : row.district)
                              setDistExpandedTaluka(null)
                            }}
                          >
                            <td className="sim-geo-expand-col">{talukaEntries.length ? (districtExpanded ? '▾' : '▸') : ''}</td>
                            <td><strong>{row.district}</strong></td>
                            <td>{row.count.toLocaleString()}</td>
                            <td>
                              <div className="sim-pct-cell">
                                <div className="sim-pct-bar" style={{ width: `${row.pct}%` }} />
                                <span>{row.pct}%</span>
                              </div>
                            </td>
                            {result.districtBudget && (
                              <td>{row.budget != null ? formatCrore(row.budget) : '—'}</td>
                            )}
                          </tr>
                          {districtExpanded && talukaEntries.map(([taluka, talukaCount]) => {
                            const talukaPct = row.count > 0 ? ((talukaCount / row.count) * 100).toFixed(1) : '0.0'
                            const talukaBudget = result.talukaBudget?.[row.district]?.[taluka]
                            const villages = result.villageBreakdown?.[row.district]?.[taluka] || {}
                            const villageEntries = Object.entries(villages).sort((a, b) => b[1] - a[1])
                            const talukaExpanded = distExpandedTaluka === `${row.district}|${taluka}`
                            return (
                              <Fragment key={`${row.district}-${taluka}`}>
                                <tr
                                  className={`sim-geo-row sim-geo-child-row ${talukaExpanded ? 'sim-geo-row-expanded' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDistExpandedTaluka(talukaExpanded ? null : `${row.district}|${taluka}`)
                                  }}
                                >
                                  <td className="sim-geo-expand-col">{villageEntries.length ? (talukaExpanded ? '▾' : '▸') : ''}</td>
                                  <td className="sim-geo-indent-1">{taluka}</td>
                                  <td>{talukaCount.toLocaleString()}</td>
                                  <td>
                                    <div className="sim-pct-cell">
                                      <div className="sim-pct-bar sim-pct-bar-sub" style={{ width: `${talukaPct}%` }} />
                                      <span>{talukaPct}%</span>
                                    </div>
                                  </td>
                                  {result.districtBudget && (
                                    <td>{talukaBudget != null ? formatCrore(talukaBudget) : '—'}</td>
                                  )}
                                </tr>
                                {talukaExpanded && villageEntries.map(([village, villageCount]) => {
                                  const villagePct = talukaCount > 0 ? ((villageCount / talukaCount) * 100).toFixed(1) : '0.0'
                                  const villageBudget = result.villageBudget?.[row.district]?.[taluka]?.[village]
                                  return (
                                    <tr key={`${row.district}-${taluka}-${village}`} className="sim-geo-row sim-geo-village-row">
                                      <td />
                                      <td className="sim-geo-indent-2">{village}</td>
                                      <td>{villageCount.toLocaleString()}</td>
                                      <td>
                                        <div className="sim-pct-cell">
                                          <div className="sim-pct-bar sim-pct-bar-sub" style={{ width: `${villagePct}%` }} />
                                          <span>{villagePct}%</span>
                                        </div>
                                      </td>
                                      {result.districtBudget && (
                                        <td>{villageBudget != null ? formatCrore(villageBudget) : '—'}</td>
                                      )}
                                    </tr>
                                  )
                                })}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {districtRows.length > 10 && (
                <button type="button" className="sim-show-more" onClick={() => setDistrictShowAll((v) => !v)}>
                  {districtShowAll ? '▲ Show top 10' : `▼ Show all ${districtRows.length} districts`}
                </button>
              )}
              {districtSearch && districtRows.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                  No districts match &quot;{districtSearch}&quot;
                </p>
              )}
            </div>
          )}

          {(castePieData.length > 0 || genderPieData.length > 0) && (
            <div className="sim-pie-row">
              {castePieData.length > 0 && (
                <div className="dg-card sim-pie-card">
                  <h3 className="sim-section-title">Caste-wise Breakdown</h3>
                  <PieChart data={castePieData} size={200} />
                </div>
              )}
              {genderPieData.length > 0 && (
                <div className="dg-card sim-pie-card">
                  <h3 className="sim-section-title">Gender-wise Breakdown</h3>
                  <PieChart data={genderPieData} size={200} />
                </div>
              )}
            </div>
          )}

          <div className="dg-card">
            <div className="sim-table-header">
              <div>
                <h3 className="sim-section-title" style={{ margin: 0 }}>
                  Projected Beneficiaries
                </h3>
                <p className="sim-sample-note">
                  Showing a representative sample of {result.projectedBeneficiaries.length} from{' '}
                  <strong>{result.projectedCount.toLocaleString()}</strong> qualifying citizens.
                  Use District → Taluka → Village filters below; counts in the banner reflect full projections.
                </p>
              </div>
            </div>

            <div className="sim-ben-filters">
              <select
                className="sim-filter-select"
                value={benFilterGender}
                onChange={(e) => { setBenFilterGender(e.target.value); setBenPage(1) }}
              >
                <option value="ALL">All Genders</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
              <select
                className="sim-filter-select"
                value={benFilterCaste}
                onChange={(e) => { setBenFilterCaste(e.target.value); setBenPage(1) }}
              >
                <option value="ALL">All Castes</option>
                {benCasteOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                className="sim-filter-select"
                value={benFilterDistrict}
                disabled={Boolean(districtScope)}
                onChange={(e) => {
                  if (districtScope) return
                  setBenFilterDistrict(e.target.value)
                  setBenFilterTaluka('ALL')
                  setBenFilterVillage('ALL')
                  setBenPage(1)
                }}
              >
                {!districtScope && <option value="ALL">All Districts</option>}
                {benDistrictOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                className="sim-filter-select"
                value={benFilterTaluka}
                disabled={benFilterDistrict === 'ALL'}
                onChange={(e) => {
                  setBenFilterTaluka(e.target.value)
                  setBenFilterVillage('ALL')
                  setBenPage(1)
                }}
              >
                <option value="ALL">{benFilterDistrict === 'ALL' ? 'Select district first' : 'All Talukas'}</option>
                {benTalukaOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                    {result?.talukaBreakdown?.[benFilterDistrict]?.[t]
                      ? ` (${result.talukaBreakdown[benFilterDistrict][t].toLocaleString()})`
                      : ''}
                  </option>
                ))}
              </select>
              <select
                className="sim-filter-select"
                value={benFilterVillage}
                disabled={benFilterTaluka === 'ALL'}
                onChange={(e) => { setBenFilterVillage(e.target.value); setBenPage(1) }}
              >
                <option value="ALL">{benFilterTaluka === 'ALL' ? 'Select taluka first' : 'All Villages / Cities'}</option>
                {benVillageOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                    {result?.villageBreakdown?.[benFilterDistrict]?.[benFilterTaluka]?.[v]
                      ? ` (${result.villageBreakdown[benFilterDistrict][benFilterTaluka][v].toLocaleString()})`
                      : ''}
                  </option>
                ))}
              </select>
              <div className="sim-age-range">
                <input
                  className="sim-filter-age"
                  type="number"
                  placeholder="Min age"
                  value={benFilterMinAge}
                  onChange={(e) => { setBenFilterMinAge(e.target.value); setBenPage(1) }}
                />
                <span className="muted">–</span>
                <input
                  className="sim-filter-age"
                  type="number"
                  placeholder="Max age"
                  value={benFilterMaxAge}
                  onChange={(e) => { setBenFilterMaxAge(e.target.value); setBenPage(1) }}
                />
              </div>
              {hasFilters && (
                <button
                  type="button"
                  className="sim-clear-filters"
                  onClick={() => {
                    setBenFilterGender('ALL')
                    setBenFilterDistrict(districtScope || 'ALL')
                    setBenFilterTaluka('ALL')
                    setBenFilterVillage('ALL')
                    setBenFilterCaste('ALL')
                    setBenFilterMinAge('')
                    setBenFilterMaxAge('')
                    setBenPage(1)
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>

            {benFilterDistrict !== 'ALL' && result.districtBreakdown?.[benFilterDistrict] != null && (
              <div className="sim-district-context">
                <span>
                  📍 <strong>{benFilterDistrict}</strong>
                  {benFilterTaluka !== 'ALL' && <> · <strong>{benFilterTaluka}</strong></>}
                  {benFilterVillage !== 'ALL' && <> · <strong>{benFilterVillage}</strong></>}
                  {' — '}
                  {(benFilterVillage !== 'ALL' && result.villageBreakdown?.[benFilterDistrict]?.[benFilterTaluka]?.[benFilterVillage] != null)
                    ? result.villageBreakdown[benFilterDistrict][benFilterTaluka][benFilterVillage].toLocaleString()
                    : (benFilterTaluka !== 'ALL' && result.talukaBreakdown?.[benFilterDistrict]?.[benFilterTaluka] != null)
                      ? result.talukaBreakdown[benFilterDistrict][benFilterTaluka].toLocaleString()
                      : result.districtBreakdown[benFilterDistrict].toLocaleString()}{' '}
                  total qualifying citizens
                  {(benFilterVillage !== 'ALL' && result.villageBudget?.[benFilterDistrict]?.[benFilterTaluka]?.[benFilterVillage])
                    ? ` · ${formatCrore(result.villageBudget[benFilterDistrict][benFilterTaluka][benFilterVillage])} annual budget`
                    : (benFilterTaluka !== 'ALL' && result.talukaBudget?.[benFilterDistrict]?.[benFilterTaluka])
                      ? ` · ${formatCrore(result.talukaBudget[benFilterDistrict][benFilterTaluka])} annual budget`
                      : result.districtBudget?.[benFilterDistrict]
                        && ` · ${formatCrore(result.districtBudget[benFilterDistrict])} annual budget`}
                </span>
                <span className="sim-sample-note" style={{ marginLeft: '0.5rem' }}>
                  ({benRows.length} in sample list)
                </span>
              </div>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortTh label="Name" field="name" sort={benSort} onSort={toggleBenSort} />
                    <SortTh label="Age" field="age" sort={benSort} onSort={toggleBenSort} />
                    <SortTh label="Income" field="income" sort={benSort} onSort={toggleBenSort} />
                    <SortTh label="Caste" field="caste" sort={benSort} onSort={toggleBenSort} />
                    <th>District / Taluka / Village</th>
                    <th>Qualifying Criteria</th>
                  </tr>
                </thead>
                <tbody>
                  {benRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                        No beneficiaries match the filters
                      </td>
                    </tr>
                  ) : benPageRows.map((b, i) => (
                    <tr key={i}>
                      <td>
                        <button
                          type="button"
                          className="ben-name-link"
                          onClick={() => handleBeneficiaryClick(b)}
                        >
                          {b.personName}
                        </button>
                      </td>
                      <td>{b.age > 0 ? b.age : '—'}</td>
                      <td>{formatIncome(b.annualIncome)}</td>
                      <td>{b.casteCategory || '—'}</td>
                      <td className="small muted">
                        {[b.district, b.taluka, b.village].filter(Boolean).join(' / ')}
                      </td>
                      <td>
                        <div className="sim-criteria-chips">
                          {b.qualifyingCriteria.map((c, j) => (
                            <span key={j} className="sim-criteria-chip">✓ {c}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {benTotalPages > 1 && (
              <div className="sim-pagination">
                <button type="button" className="sim-page-btn" disabled={benPage === 1}
                  onClick={() => setBenPage(1)}>«</button>
                <button type="button" className="sim-page-btn" disabled={benPage === 1}
                  onClick={() => setBenPage((p) => p - 1)}>‹</button>

                {Array.from({ length: benTotalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === benTotalPages || Math.abs(p - benPage) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) => (p === '…'
                    ? <span key={`e${i}`} className="sim-page-ellipsis">…</span>
                    : (
                      <button
                        key={p}
                        type="button"
                        className={`sim-page-btn${p === benPage ? ' active' : ''}`}
                        onClick={() => setBenPage(p)}
                      >
                        {p}
                      </button>
                    )
                  ))}

                <button type="button" className="sim-page-btn" disabled={benPage === benTotalPages}
                  onClick={() => setBenPage((p) => p + 1)}>›</button>
                <button type="button" className="sim-page-btn" disabled={benPage === benTotalPages}
                  onClick={() => setBenPage(benTotalPages)}>»</button>
                <span className="sim-page-info">
                  {(benPage - 1) * BEN_PAGE_SIZE + 1}–{Math.min(benPage * BEN_PAGE_SIZE, benRows.length)} of {benRows.length}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    <CitizenProfileModal subject={profileSubject} onClose={() => setProfileSubject(null)} />
    </>
  )
}
