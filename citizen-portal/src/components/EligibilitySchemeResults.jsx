import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { bucketMatches, matchOutcome, FIELD_TO_FORM } from '../guestEligibility/eligibilityShared'
import { translateCriterion } from '../reasonUtils'
import SchemeDetailsModal, { SchemeNameButton } from './SchemeDetailsModal'

const PAGE_SIZE = 8

function ReasonList({ reasons, lang }) {
  if (!reasons?.length) return null
  return (
    <ul className="reason-list compact">
      {reasons.slice(0, 4).map((r, i) => {
        const text = typeof r === 'string' ? r : r.text
        const passed = typeof r === 'string' ? true : r.passed
        return (
          <li key={i} className={passed ? 'reason-pass' : 'reason-fail'}>
            {translateCriterion(text, lang)}
          </li>
        )
      })}
    </ul>
  )
}

export default function EligibilitySchemeResults({
  result,
  guestShell = false,
  onFillMissingField,
  showSaveCta = false,
  onSaveResults,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language
  const [outcomeFilter, setOutcomeFilter] = useState('LIKELY_POSSIBLE')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('outcome')
  const [page, setPage] = useState(1)
  const [detailsSchemeId, setDetailsSchemeId] = useState(null)
  const [detailsTriggerRef, setDetailsTriggerRef] = useState(null)

  const buckets = useMemo(() => bucketMatches(result), [result])

  const detailsMatch = useMemo(() => {
    if (!detailsSchemeId || !result?.matches) return null
    return result.matches.find((m) => m.schemeId === detailsSchemeId) || null
  }, [detailsSchemeId, result])

  function openDetails(schemeId, btnRef) {
    setDetailsSchemeId(schemeId)
    setDetailsTriggerRef(btnRef)
  }

  const allRows = useMemo(() => {
    if (!result?.matches) return []
    return result.matches.map((m) => ({ ...m, outcome: matchOutcome(m) }))
  }, [result])

  const filteredRows = useMemo(() => {
    let rows = allRows
    if (outcomeFilter === 'LIKELY_POSSIBLE') {
      rows = rows.filter((m) => m.outcome === 'LIKELY_ELIGIBLE' || m.outcome === 'POSSIBLE')
    } else if (outcomeFilter !== 'ALL') {
      rows = rows.filter((m) => m.outcome === outcomeFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((m) => {
        const name = (lang === 'gu' && m.schemeNameGujarati ? m.schemeNameGujarati : m.schemeName) || ''
        return name.toLowerCase().includes(q) || (m.department || '').toLowerCase().includes(q)
      })
    }
    const sorted = [...rows]
    if (sortBy === 'name') {
      sorted.sort((a, b) => {
        const an = (lang === 'gu' && a.schemeNameGujarati ? a.schemeNameGujarati : a.schemeName) || ''
        const bn = (lang === 'gu' && b.schemeNameGujarati ? b.schemeNameGujarati : b.schemeName) || ''
        return an.localeCompare(bn)
      })
    } else {
      const rank = { LIKELY_ELIGIBLE: 0, POSSIBLE: 1, NOT_ELIGIBLE: 2 }
      sorted.sort((a, b) => (rank[a.outcome] ?? 9) - (rank[b.outcome] ?? 9))
    }
    return sorted
  }, [allRows, outcomeFilter, search, sortBy, lang])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function fillMissingField(fieldKey) {
    const formKey = FIELD_TO_FORM[fieldKey] || fieldKey
    onFillMissingField?.(formKey)
  }

  function schemeName(m) {
    return lang === 'gu' && m.schemeNameGujarati ? m.schemeNameGujarati : m.schemeName
  }

  function outcomeBadge(outcome) {
    if (outcome === 'LIKELY_ELIGIBLE') return <span className="badge-green">{t('eligibilityCheck.badgeEligible')}</span>
    if (outcome === 'POSSIBLE') return <span className="badge-amber">{t('eligibilityCheck.badgePossible')}</span>
    return <span className="badge-grey">{t('eligibilityCheck.badgeNotEligible')}</span>
  }

  if (!result) {
    return (
      <section className="eligibility-results card eligibility-results-empty">
        <h2>{t('eligibilityCheck.resultsTitle')}</h2>
        <p className="muted">{t('eligibilityCheck.resultsPlaceholder')}</p>
      </section>
    )
  }

  return (
    <section className="eligibility-results card" aria-live="polite">
      <div className="eligibility-results-head">
        <h2>{t('eligibilityCheck.resultsTitle')}</h2>
        <p className="muted">
          {t('eligibilityCheck.resultsSummaryTri', {
            likely: result.likelyCount ?? buckets.likely.length ?? 0,
            possible: result.possibleCount ?? buckets.possible.length ?? 0,
            total: result.schemesChecked,
          })}
        </p>
      </div>

      <div className="eligibility-results-toolbar">
        <label className="toolbar-field">
          <span className="sr-only">{t('eligibilityCheck.filterOutcome')}</span>
          <select value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1) }}>
            <option value="LIKELY_POSSIBLE">{t('eligibilityCheck.filterLikelyPossible')}</option>
            <option value="ALL">{t('eligibilityCheck.filterAll')}</option>
            <option value="LIKELY_ELIGIBLE">{t('eligibilityCheck.badgeEligible')}</option>
            <option value="POSSIBLE">{t('eligibilityCheck.badgePossible')}</option>
            <option value="NOT_ELIGIBLE">{t('eligibilityCheck.badgeNotEligible')}</option>
          </select>
        </label>
        <label className="toolbar-field grow">
          <span className="sr-only">{t('eligibilityCheck.searchSchemes')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('eligibilityCheck.searchSchemes')}
          />
        </label>
        <label className="toolbar-field">
          <span className="sr-only">{t('eligibilityCheck.sortBy')}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="outcome">{t('eligibilityCheck.sortOutcome')}</option>
            <option value="name">{t('eligibilityCheck.sortName')}</option>
          </select>
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <p className="muted">{t('eligibilityCheck.noMatches')}</p>
      ) : (
        <>
          <ul className="scheme-card-list">
            {pageRows.map((m) => (
              <li key={m.schemeId} className={`scheme-card row-outcome-${m.outcome.toLowerCase()}`}>
                <div className="scheme-card-head">
                  <div className="scheme-card-title">
                    <SchemeNameButton schemeId={m.schemeId} onOpen={openDetails}>
                      {schemeName(m)}
                    </SchemeNameButton>
                    {m.department && <span className="scheme-card-dept">{m.department}</span>}
                  </div>
                  {outcomeBadge(m.outcome)}
                </div>
                {m.outcome === 'POSSIBLE' && m.missingFields?.length > 0 && (
                  <div className="missing-fields inline">
                    {m.missingFields.map((f) => (
                      <span key={f} className="missing-tag">
                        {t(`eligibilityCheck.field.${f}`, { defaultValue: f })}
                        {onFillMissingField && (
                          <button type="button" className="link-btn" onClick={() => fillMissingField(f)}>
                            {t('eligibilityCheck.addInfo')}
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <ReasonList
                  reasons={(m.reasons?.length ? m.reasons : m.reasonLines).filter(
                    (r) => m.outcome !== 'POSSIBLE' || typeof r === 'string' || r.passed,
                  )}
                  lang={lang}
                />
                {(m.outcome === 'LIKELY_ELIGIBLE' || m.outcome === 'POSSIBLE') && (
                  <div className="scheme-card-action">
                    <Link
                      to={`/nearby-offices?schemeId=${encodeURIComponent(m.schemeId)}`}
                      className="link-btn small"
                    >
                      {t('nearbyOffices.findNearest')}
                    </Link>
                    {m.outcome === 'LIKELY_ELIGIBLE' && (
                      guestShell ? (
                        <Link to="/" className="btn-secondary small">{t('eligibilityCheck.loginToApply')}</Link>
                      ) : (
                        <button type="button" className="btn-secondary small" onClick={() => navigate(`/apply/scheme?schemeId=${m.schemeId}`)}>
                          {t('eligibilityCheck.apply')}
                        </button>
                      )
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="eligibility-pagination">
            <button type="button" className="btn-secondary small" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('eligibilityCheck.prevPage')}
            </button>
            <span className="muted small">
              {t('eligibilityCheck.pageOf', { page: safePage, total: totalPages, count: filteredRows.length })}
            </span>
            <button type="button" className="btn-secondary small" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t('eligibilityCheck.nextPage')}
            </button>
          </div>
        </>
      )}

      {showSaveCta && guestShell && onSaveResults && (
        <div className="save-results-cta">
          <button type="button" className="btn-secondary" onClick={onSaveResults}>
            {t('eligibilityCheck.saveResults')}
          </button>
          <p className="muted small">{t('eligibilityCheck.saveResultsHint')}</p>
        </div>
      )}

      <p className="eligibility-disclaimer muted small">{t('eligibilityCheck.disclaimer')}</p>

      {detailsSchemeId && (
        <SchemeDetailsModal
          schemeId={detailsSchemeId}
          eligibilityMatch={detailsMatch}
          guestShell={guestShell}
          triggerRef={detailsTriggerRef}
          onClose={() => setDetailsSchemeId(null)}
        />
      )}
    </section>
  )
}
