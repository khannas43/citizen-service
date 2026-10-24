import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, { Background, Controls } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  CITIZEN_PORTAL,
  FAMILY_API,
  SCHEME_API,
  schemeIdForName,
  searchPersons,
} from './api'
import './App.css'

function ageFromDob(dob) {
  if (!dob) return '—'
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    age -= 1
  }
  return age
}

function nodeColor(rel) {
  switch (rel) {
    case 'HEAD':
      return '#1a3c5e'
    case 'SPOUSE':
      return '#7b2d8b'
    case 'SON':
    case 'DAUGHTER':
      return '#2e7d32'
    case 'FATHER':
    case 'MOTHER':
    case 'MOTHER_IN_LAW':
      return '#e65100'
    default:
      return '#555'
  }
}

function layoutTree(members) {
  const head = members.find((m) => m.relationshipToHead === 'HEAD') || members[0]
  const spouse = members.filter((m) => m.relationshipToHead === 'SPOUSE')
  const children = members.filter((m) => ['SON', 'DAUGHTER'].includes(m.relationshipToHead))
  const parents = members.filter((m) => ['FATHER', 'MOTHER', 'MOTHER_IN_LAW'].includes(m.relationshipToHead))
  const others = members.filter(
    (m) =>
      m.id !== head?.id &&
      !spouse.some((s) => s.id === m.id) &&
      !children.some((c) => c.id === m.id) &&
      !parents.some((p) => p.id === m.id)
  )

  const positions = {}
  if (head) positions[head.id] = { x: 300, y: 50 }
  spouse.forEach((m, i) => {
    positions[m.id] = { x: 500 + i * 160, y: 50 }
  })
  parents.forEach((m, i) => {
    positions[m.id] = { x: 140 + i * 160, y: -120 }
  })
  children.forEach((m, i) => {
    positions[m.id] = { x: 80 + i * 160, y: 200 }
  })
  others.forEach((m, i) => {
    positions[m.id] = { x: 80 + i * 160, y: 350 }
  })

  return { head, positions }
}

function FamilyTree({ family, t }) {
  const { nodes, edges } = useMemo(() => {
    if (!family?.members?.length) return { nodes: [], edges: [] }
    const { head, positions } = layoutTree(family.members)
    const ns = family.members.map((m) => ({
      id: m.id,
      type: 'default',
      data: {
        label: (
          <div>
            <strong>{m.name}</strong>
            <div className="node-sub">
              {ageFromDob(m.dob)} {t('ageLabel')} · {m.occupation || '—'}
            </div>
          </div>
        ),
      },
      position: positions[m.id] || { x: 0, y: 0 },
      style: {
        background: m.isAlive === false ? '#aaa' : nodeColor(m.relationshipToHead),
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        textDecoration: m.isAlive === false ? 'line-through' : 'none',
      },
    }))
    const es = family.members
      .filter((m) => m.id !== head?.id)
      .map((m) => ({
        id: `${head?.id}-${m.id}`,
        source: head?.id,
        target: m.id,
        label: m.relationshipToHead,
      }))
    return { nodes: ns, edges: es }
  }, [family, t])

  return (
    <div className="flow-wrap">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.5}>
        <Background variant="dots" />
        <Controls />
      </ReactFlow>
    </div>
  )
}

function IncomeTab({ income, members, t }) {
  const aliveMap = useMemo(() => {
    const map = {}
    members?.forEach((m) => {
      map[m.id] = m.isAlive !== false
    })
    return map
  }, [members])

  const sorted = [...(income?.breakdown || [])].sort(
    (a, b) => (b.annualIncome || 0) - (a.annualIncome || 0)
  )
  const maxIncome = sorted.reduce((m, x) => Math.max(m, x.annualIncome || 0), 0) || 1

  return (
    <div className="income-panel">
      <div className="income-total">
        ₹{income?.totalAnnualIncome?.toLocaleString('en-IN') ?? 0}
      </div>
      <p className="muted">{t('totalIncome')}</p>
      {sorted.map((m) => {
        const alive = aliveMap[m.personId] !== false
        return (
          <div key={m.personId} className={`income-row ${alive ? '' : 'deceased-row'}`}>
            <div className="income-label">
              <span className={alive ? '' : 'strike'}>{m.name}</span>
              <span className="small muted">{m.occupation}</span>
              {!alive && <span className="deceased-badge">{t('deceased')}</span>}
            </div>
            <div className="income-bar-wrap">
              <div
                className="income-bar"
                style={{
                  width: `${Math.round(((m.annualIncome || 0) / maxIncome) * 100)}%`,
                  background: alive ? '#1a3c5e' : '#aaa',
                }}
              />
            </div>
            <span className="income-amount">₹{(m.annualIncome || 0).toLocaleString('en-IN')}</span>
          </div>
        )
      })}
    </div>
  )
}

function SchemesTab({ familyId, eligibility, schemes, enrolled, t }) {
  return (
    <div className="schemes-grid">
      {eligibility.map((e) => {
        const schemeId = schemeIdForName(schemes, e.schemeName)
        const isEnrolled = enrolled.some(
          (b) =>
            b.familyId === familyId &&
            (b.schemeName?.replace(/\s/g, '_').toUpperCase().includes(e.schemeName) ||
              e.schemeName.includes(b.schemeName?.replace(/\s/g, '_').slice(0, 5).toUpperCase() || ''))
        )
        return (
          <div key={e.schemeName} className={`scheme-card ${e.eligible ? 'eligible' : 'ineligible'}`}>
            <div className="scheme-icon">{e.eligible ? '✅' : '❌'}</div>
            <div className="scheme-body">
              <strong>{e.schemeName.replace(/_/g, ' ')}</strong>
              <p className="small muted">{e.reason}</p>
              <div className="scheme-meta">
                <span className={e.eligible ? 'tag-green' : 'tag-grey'}>
                  {e.eligible ? t('eligible') : t('notEligible')}
                </span>
                {isEnrolled && <span className="tag-enrolled">{t('enrolled')}</span>}
              </div>
              {e.eligible && !isEnrolled && schemeId && (
                <a
                  className="apply-link"
                  href={`${CITIZEN_PORTAL}/apply/scheme?schemeId=${schemeId}&familyId=${familyId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('applyNow')}
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [family, setFamily] = useState(null)
  const [income, setIncome] = useState(null)
  const [eligibility, setEligibility] = useState([])
  const [schemes, setSchemes] = useState([])
  const [enrolled, setEnrolled] = useState([])
  const [tab, setTab] = useState('tree')

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'gu' : 'en'
    localStorage.setItem('lang', next)
    i18n.changeLanguage(next)
  }

  const loadFamily = useCallback(async (familyId) => {
    setTab('tree')
    const [famRes, incRes, eligRes, schemesRes] = await Promise.all([
      fetch(`${FAMILY_API}/v1/families/${familyId}`),
      fetch(`${FAMILY_API}/v1/families/${familyId}/income`),
      fetch(`${FAMILY_API}/v1/families/${familyId}/scheme-eligibility`),
      fetch(`${SCHEME_API}/v1/schemes`),
    ])
    if (famRes.ok) setFamily(await famRes.json())
    if (incRes.ok) setIncome(await incRes.json())
    if (eligRes.ok) setEligibility(await eligRes.json())

    if (schemesRes.ok) {
      const schemeList = await schemesRes.json()
      setSchemes(schemeList)
      const enrolledLists = await Promise.all(
        schemeList.map(async (s) => {
          const r = await fetch(`${SCHEME_API}/v1/schemes/${s.id}/beneficiaries`)
          if (!r.ok) return []
          return (await r.json()).filter(
            (b) =>
              b.familyId === familyId &&
              ['IDENTIFIED', 'CONFIRMED', 'ACTIVE'].includes(b.status)
          )
        })
      )
      setEnrolled(enrolledLists.flat())
    }
  }, [])

  const doSearch = useCallback(
    async (q) => {
      if (!q?.trim()) {
        setResults([])
        return
      }
      setLoading(true)
      const data = await searchPersons(q)
      setResults(data)
      setLoading(false)
      if (data.length === 1) {
        await loadFamily(data[0].familyId)
      }
    },
    [loadFamily]
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const aadhaar = params.get('aadhaar')
    if (aadhaar) {
      setQuery(aadhaar)
      doSearch(aadhaar)
    }
  }, [doSearch])

  function handleSubmit(e) {
    e.preventDefault()
    doSearch(query)
  }

  function resetSearch() {
    setFamily(null)
    setIncome(null)
    setEligibility([])
    setEnrolled([])
    setResults([])
    window.history.replaceState({}, '', window.location.pathname)
  }

  return (
    <div className="family-app">
      <header className="top-header">
        <span className="top-header-left">{t('appTitle')}</span>
        <span className="top-header-center">{t('familyPortal')}</span>
        <button type="button" className="lang-toggle" onClick={toggleLang}>
          {t('langToggle')}
        </button>
      </header>

      {!family ? (
        <div className="landing">
          <div className="search-card card">
            <form onSubmit={handleSubmit}>
              <input
                type="search"
                className="search-input"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn-primary">
                {t('searchBtn')}
              </button>
            </form>
            {loading && <p className="muted">{t('searching')}</p>}
            {!loading && results.length === 0 && query && (
              <p className="muted">{t('noResults')}</p>
            )}
            {results.length > 0 && (
              <ul className="results-list">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="result-item" onClick={() => loadFamily(p.familyId)}>
                      <strong>{p.name}</strong>
                      <span className="muted">
                        {p.casteCategory} · {p.occupation}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="profile-page">
          <div className="profile-header">
            <button type="button" className="btn-back" onClick={resetSearch}>
              ← {t('back')}
            </button>
            <h2>
              {family.village}, {family.taluka}, {family.district}
            </h2>
          </div>

          <div className="tabs">
            {['tree', 'income', 'schemes'].map((key) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'tab active' : 'tab'}
                onClick={() => setTab(key)}
              >
                {t(`tabs.${key}`)}
              </button>
            ))}
          </div>

          <div className="tab-panel card">
            {tab === 'tree' && <FamilyTree family={family} t={t} />}
            {tab === 'income' && (
              <IncomeTab income={income} members={family.members} t={t} />
            )}
            {tab === 'schemes' && (
              <SchemesTab
                familyId={family.id}
                eligibility={eligibility}
                schemes={schemes}
                enrolled={enrolled}
                t={t}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
