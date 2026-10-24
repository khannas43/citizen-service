import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pinDemoSchemeFirst, translateCriterion, uniqueSchemeEnrollments } from '../reasonUtils'
import SchemeDetailsModal, { SchemeNameButton } from './SchemeDetailsModal'
import './SchemeRecommendations.css'

const AI_BASE = import.meta.env.VITE_AI_BASE || '/ai-intelligence-service'
const REC_TIMEOUT_MS = 30000

function recsFromIdentified(enrollments) {
  return uniqueSchemeEnrollments(enrollments)
    .filter((e) => e.status === 'IDENTIFIED')
    .map((e) => ({
      scheme_id: e.schemeId || e.scheme_id || e.id,
      scheme_name: e.schemeName || e.scheme_name,
      person_name: e.personName,
      explanation: null,
      eligibility_reasons: String(e.eligibilityReason || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean),
    }))
}

function cafApplyPath(rec) {
  const params = new URLSearchParams({ services: 'scheme' })
  const id = rec.schemeId || rec.scheme_id
  const name = rec.scheme_name || rec.schemeName
  if (id) params.set('schemeId', id)
  if (name) params.set('schemeName', name)
  return `/apply/caf?${params}`
}

/**
 * AI-2 scheme recommendations via POST /v1/recommendations (LightGBM rank + Gemma explain).
 * @param {'home'|'family'} variant — home: dismissible + trending; family: embedded in My Family tab
 */
export default function SchemeRecommendations({ enrollments, profile, variant = 'home' }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'gu' ? 'gu' : 'en'
  const isFamily = variant === 'family'
  const dismissKey = isFamily ? 'ai_rec_dismissed_family' : 'ai_rec_dismissed'

  const [dismissed, setDismissed] = useState(
    () => !isFamily && sessionStorage.getItem(dismissKey) === '1'
  )
  const [aiRecs, setAiRecs] = useState([])
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState(null)
  const [detailsSchemeId, setDetailsSchemeId] = useState(null)
  const [detailsTriggerRef, setDetailsTriggerRef] = useState(null)
  const navigate = useNavigate()
  const abortRef = useRef(null)

  const alreadyEnrolled = (enrollments ?? [])
    .filter((e) => ['ACTIVE', 'CONFIRMED', 'DISBURSED'].includes(e.status))
    .map((e) => e.schemeName ?? e.scheme_name ?? '')
    .filter(Boolean)
  const enrolledKey = alreadyEnrolled.slice().sort().join('|')

  useEffect(() => {
    if (!profile?.aadhaarRef) return undefined

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), REC_TIMEOUT_MS)

    setRecLoading(true)
    setRecError(null)

    const age = profile?.dob
      ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
      : undefined

    fetch(`${AI_BASE}/v1/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        profile: {
          aadhaarRef: profile.aadhaarRef,
          casteCategory: profile.casteCategory,
          annualIncome: profile.annualIncome,
          age,
        },
        enrolled_scheme_names: alreadyEnrolled,
        top_k: isFamily ? 8 : 4,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => setAiRecs(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err.name === 'AbortError') {
          setRecError(t('aiRec.timeout', 'Recommendations timed out — please try again.'))
        } else {
          setRecError(t('aiRec.error', 'Could not load recommendations.'))
        }
        setAiRecs([])
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setRecLoading(false)
      })

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
    // enrolledKey keeps this stable when the parent passes a new array of the same enrollments
  }, [profile?.aadhaarRef, profile?.casteCategory, profile?.annualIncome, profile?.dob, enrolledKey, isFamily, t])

  if (!isFamily && dismissed) return null

  const rawRecs = aiRecs.length > 0 ? aiRecs : recsFromIdentified(enrollments)
  const seen = new Set()
  const displayRecs = pinDemoSchemeFirst(rawRecs.filter((rec) => {
    const key = `${rec.person_name || rec.personName || ''}|${rec.scheme_name || rec.schemeName || rec.scheme_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }))

  const title = isFamily
    ? t('myFamilyPage.schemesEligible')
    : t('aiRec.title', 'Recommended for Your Family')

  const sectionClass = isFamily
    ? 'ai-rec-section ai-rec-section--embedded'
    : 'ai-rec-section'

  if (recLoading && displayRecs.length === 0) {
    return (
      <section className={sectionClass}>
        <div className="ai-rec-header">
          <span className="ai-rec-title">
            <span className="ai-rec-badge">🤖 AI</span>
            {title}
          </span>
        </div>
        <p className="ai-rec-loading">{t('aiRec.loading', 'Finding recommendations…')}</p>
      </section>
    )
  }

  if (recError && displayRecs.length === 0) {
    return (
      <section className={sectionClass}>
        <div className="ai-rec-header">
          <span className="ai-rec-title">
            <span className="ai-rec-badge">🤖 AI</span>
            {title}
          </span>
        </div>
        <p className="ai-rec-error muted small">{recError}</p>
      </section>
    )
  }

  if (displayRecs.length === 0) {
    if (isFamily) {
      return (
        <p className="muted small" style={{ marginTop: '0.5rem' }}>
          {t('myFamilyPage.noEligible')}
        </p>
      )
    }
    return null
  }

  function dismiss() {
    sessionStorage.setItem(dismissKey, '1')
    setDismissed(true)
  }

  const trending = [
    { name: 'Caste Certificate', icon: '📜' },
    { name: 'Ayushman Gujarat', icon: '🏥' },
    { name: 'PM Kisan Samman Nidhi', icon: '🌱' },
  ]

  return (
    <section className={sectionClass}>
      <div className="ai-rec-header">
        <span className="ai-rec-title">
          <span className="ai-rec-badge">🤖 AI</span>
          {title}
        </span>
        {!isFamily && (
          <button type="button" className="ai-rec-dismiss" onClick={dismiss} title="Dismiss">✕</button>
        )}
      </div>

      {isFamily && (
        <p className="muted small ai-rec-sub">{t('myFamilyPage.schemesEligibleSub')}</p>
      )}

      <div className="ai-rec-cards">
        {displayRecs.map((rec) => (
          <div key={rec.scheme_id} className="ai-rec-card">
            <div className="ai-rec-card-top">
              <div>
                <SchemeNameButton
                  schemeId={rec.scheme_id}
                  className="ai-rec-scheme-name"
                  onOpen={(id, ref) => { setDetailsSchemeId(id); setDetailsTriggerRef(ref) }}
                >
                  {rec.scheme_name}
                </SchemeNameButton>
                {rec.person_name && isFamily && (
                  <div className="ai-rec-beneficiary muted small">{rec.person_name}</div>
                )}
                {rec.explanation && (
                  <>
                    <div className="ai-rec-person">{rec.explanation}</div>
                    <div className="sr-gemma-tag">
                      ✨ Explanation by Gemma 4 · on-premise LLM
                    </div>
                  </>
                )}
              </div>
              <span className="ai-identified-badge">{t('aiRec.identified', 'AI Identified')}</span>
            </div>
            {(rec.eligibility_reasons ?? []).length > 0 && (
              <div className="ai-rec-reasons">
                {rec.eligibility_reasons.map((r, i) => (
                  <span key={i} className="ai-rec-reason-chip">
                    ✓ {translateCriterion(r, lang)}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              className="ai-rec-apply-btn"
              onClick={() => navigate(cafApplyPath(rec))}
            >
              {t('aiRec.applyNow', 'Apply Now →')}
            </button>
          </div>
        ))}
      </div>

      {detailsSchemeId && (
        <SchemeDetailsModal
          schemeId={detailsSchemeId}
          guestShell={false}
          triggerRef={detailsTriggerRef}
          onClose={() => setDetailsSchemeId(null)}
        />
      )}

      {!isFamily && (
        <div className="ai-trending-row">
          <span className="ai-trending-label">{t('aiRec.trending', '📈 Trending in your area:')}</span>
          {trending.map((item) => (
            <button
              key={item.name}
              type="button"
              className="ai-trending-chip"
              onClick={() => navigate('/apply/caf')}
            >
              {item.icon} {item.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
