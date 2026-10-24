import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchServices } from '../data/serviceCatalogue'
import './AISearch.css'

const AI_BASE = import.meta.env.VITE_AI_BASE ?? ''
const SEARCH_TIMEOUT_MS = 15000

function localToResults(local) {
  return local.map((r) => ({
    key: r.service.key,
    name: r.service.name,
    nameGu: r.service.nameGu,
    route: r.service.route,
    score: r.score,
    profileReason: r.profileReason ?? null,
    profileMatch: Boolean(r.profileReason),
  }))
}

const SERVICE_ICONS = {
  caste_cert: '📜',
  marriage_cert: '💍',
  pension: '👴',
  old_age_pension: '👴',
  widow_pension: '🕊️',
  bpl_ration: '🍚',
  obc_scholarship: '🎓',
  disability_pension: '♿',
}

function iconFor(key) {
  return SERVICE_ICONS[key] ?? '📋'
}

export default function AISearch({ profile }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const wrapRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      setError(null)
      return undefined
    }

    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

      setLoading(true)
      setError(null)
      const localResults = localToResults(searchServices(query, profile))
      setResults(localResults)
      setOpen(localResults.length > 0)

      if (!AI_BASE) {
        setLoading(false)
        return
      }

      try {
        const age = profile?.dob
          ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
          : undefined

        const res = await fetch(`${AI_BASE}/v1/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query,
            profile: {
              casteCategory: profile?.casteCategory,
              annualIncome: profile?.annualIncome,
              age,
            },
            top_k: 6,
          }),
        })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        const mapped = data.map((r) => ({
          key: r.key,
          name: r.name,
          nameGu: r.name_gu,
          route: r.route,
          score: r.score,
          profileReason: r.rerank_reason ?? null,
          profileMatch: r.profile_match ?? false,
        }))
        setResults(mapped.length > 0 ? mapped : localResults)
        setOpen((mapped.length > 0 ? mapped : localResults).length > 0)
      } catch {
        // Keep local catalogue results already shown
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [query, profile])

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKey(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setError(null)
    }
  }

  const profileResults = results.filter((r) => r.profileMatch)
  const generalResults = results.filter((r) => !r.profileMatch)

  return (
    <div className="ai-search-wrap" ref={wrapRef}>
      <div className="ai-search-bar">
        <span className="ai-search-icon">🔍</span>
        <input
          type="text"
          className="ai-search-input"
          placeholder="Search services and schemes… (English or ગુજરાતી)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => (results.length > 0 || error) && setOpen(true)}
          onKeyDown={handleKey}
          autoComplete="off"
        />
        {query && (
          <button type="button" className="ai-search-clear" onClick={() => { setQuery(''); setOpen(false); setError(null) }}>✕</button>
        )}
        <span className="ai-search-hint">{loading ? 'Searching…' : 'AI-powered'}</span>
      </div>

      {open && results.length > 0 && (
        <div className="ai-search-dropdown">
          {profileResults.length > 0 && (
            <>
              <div className="ai-search-section-label">⭐ For Your Profile</div>
              {profileResults.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className="ai-search-result"
                  onClick={() => { navigate(r.route || '/apply/caf'); setOpen(false); setQuery('') }}
                >
                  <span className="ai-result-icon">{iconFor(r.key)}</span>
                  <div className="ai-result-info">
                    <div className="ai-result-name">{r.name}</div>
                    <div className="ai-result-reason">{r.profileReason}</div>
                  </div>
                  <span className="ai-result-arrow">→</span>
                </button>
              ))}
            </>
          )}
          {generalResults.length > 0 && (
            <>
              {profileResults.length > 0 && <div className="ai-search-divider" />}
              <div className="ai-search-section-label">Services & Schemes</div>
              {generalResults.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className="ai-search-result"
                  onClick={() => { navigate(r.route || '/apply/caf'); setOpen(false); setQuery('') }}
                >
                  <span className="ai-result-icon">{iconFor(r.key)}</span>
                  <div className="ai-result-info">
                    <div className="ai-result-name">{r.name}</div>
                    <div className="ai-result-desc">{r.nameGu || r.name}</div>
                  </div>
                  <span className="ai-result-arrow">→</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
