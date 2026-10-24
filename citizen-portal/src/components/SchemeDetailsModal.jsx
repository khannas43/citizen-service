import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { fetchSchemePublicDetails } from '../api'
import { criterionStatusFromMatch } from '../guestEligibility/schemeDetailsUtils'
import { formatBenefit, formatCriterionValue, formatDate, humanize } from '../guestEligibility/schemeDetailsFormatting'
import './SchemeDetailsModal.css'

function formatMoney(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

function StatusIcon({ status, t }) {
  if (status === 'met') return <span className="crit-status met" title={t('schemeDetails.statusMet')}>✓</span>
  if (status === 'not_met') return <span className="crit-status not-met" title={t('schemeDetails.statusNotMet')}>✗</span>
  if (status === 'needs') return <span className="crit-status needs" title={t('schemeDetails.statusNeeds')}>?</span>
  return null
}

export default function SchemeDetailsModal({
  schemeId,
  eligibilityMatch,
  guestShell = false,
  onClose,
  triggerRef,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'gu' ? 'gu' : 'en'
  const titleId = useId()
  const dialogRef = useRef(null)
  const closeBtnRef = useRef(null)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!schemeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSchemePublicDetails(schemeId)
      setData(res)
    } catch (err) {
      setError(err.message || t('schemeDetails.errorGeneric'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [schemeId, t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!schemeId) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      triggerRef?.current?.focus?.()
    }
  }, [schemeId, onClose, triggerRef])

  if (!schemeId) return null

  const displayName = data
    ? (lang === 'gu' && data.nameGujarati ? data.nameGujarati : data.name)
    : ''

  function statusChip(status, validTo) {
    if (status === 'ACTIVE' && validTo) {
      return t('schemeDetails.statusActiveUntil', { date: formatDate(validTo) })
    }
    if (status === 'ACTIVE') return t('schemeDetails.statusActive')
    if (status === 'UPCOMING') return t('schemeDetails.statusUpcoming')
    if (status === 'ENDED') return t('schemeDetails.statusEnded')
    return status
  }

  return (
    <div
      className="scheme-details-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="scheme-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <header className="scheme-details-header">
          {loading && !data ? (
            <div className="scheme-details-skeleton title" />
          ) : (
            <>
              <h2 id={titleId}>{displayName || t('schemeDetails.loadingTitle')}</h2>
              <div className="scheme-details-chips">
                {data?.department && <span className="chip muted">{data.department}</span>}
                {data?.category && humanize(data.category).toLowerCase() !== String(data.department || '').toLowerCase() && <span className="chip">{t(`schemeDetails.categories.${data.category}`, { defaultValue: humanize(data.category) })}</span>}
                {data?.status && (
                  <span className={`chip status-${data.status.toLowerCase()}`}>
                    {statusChip(data.status, data.validTo)}
                  </span>
                )}
              </div>
            </>
          )}
        </header>

        <div className="scheme-details-body">
          {loading && !data && (
            <div className="scheme-details-skeleton block" aria-busy="true" />
          )}

          {error && (
            <div className="scheme-details-error" role="alert">
              <p>{error}</p>
              <button type="button" className="btn-secondary" onClick={load}>{t('schemeDetails.retry')}</button>
            </div>
          )}

          {data && (
            <>
              <section>
                <h3>{t('schemeDetails.overview')}</h3>
                <p className="scheme-details-desc">{data.description || t('schemeDetails.noDescription')}</p>
              </section>

              <section>
                <h3>{t('schemeDetails.benefits')}</h3>
                <p className="benefit-summary">
                  {formatBenefit(data.benefitType, data.benefitValue, t) || t('schemeDetails.noBenefitSummary')}
                </p>
                {data.benefitComponents?.length > 0 && (
                  <div className="benefit-table-wrap">
                    <table className="benefit-table">
                      <thead>
                        <tr>
                          <th>{t('schemeDetails.colCourse')}</th>
                          <th>{t('schemeDetails.colTuition')}</th>
                          <th>{t('schemeDetails.colBoarding')}</th>
                          <th>{t('schemeDetails.colBooks')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.benefitComponents.map((row) => (
                          <tr key={row.courseCategory}>
                            <td>{row.courseCategory?.replace(/_/g, ' ')}</td>
                            <td>{formatMoney(row.tuitionAmount)}</td>
                            <td>{formatMoney(row.boardingAmount)}</td>
                            <td>{formatMoney(row.booksAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3>{t('schemeDetails.eligibilityTitle')}</h3>
                {!data.eligibility?.length ? (
                  <p className="muted">{t('schemeDetails.noCriteria')}</p>
                ) : (
                  <ul className="criteria-list">
                    {data.eligibility.map((c, idx) => {
                      const label = lang === 'gu' && c.labelGu ? c.labelGu : c.label
                      const status = criterionStatusFromMatch(c.key, eligibilityMatch)
                      return (
                        <li key={`${c.key}-${idx}`}>
                          {status ? <StatusIcon status={status} t={t} /> : <span className="crit-status" aria-hidden="true" />}
                          <span className="crit-label">{label}</span>
                          <span className="crit-value">{c.source === 'OVERLAY' ? formatCriterionValue(c.value) : c.value}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="validity-section">
                <h3>{t('schemeDetails.validity')}</h3>
                <p className="muted small">
                  {t('schemeDetails.validFromTo', {
                    from: formatDate(data.validFrom),
                    to: formatDate(data.validTo),
                  })}
                </p>
              </section>
            </>
          )}
        </div>

        <footer className="scheme-details-footer">
          <p className="muted small">{t('schemeDetails.disclaimer')}</p>
          <div className="scheme-details-actions">
            <button type="button" className="btn-secondary" ref={closeBtnRef} onClick={onClose}>
              {t('schemeDetails.close')}
            </button>
            {data && (
              <Link
                to={`/schemes/${encodeURIComponent(data.id)}`}
                className="btn-secondary"
              >
                {t('schemeDetailsPage.viewFullDetails')}
              </Link>
            )}
            {data && (
              <Link
                to={`/nearby-offices?schemeId=${encodeURIComponent(data.id)}`}
                className="btn-secondary"
              >
                {t('nearbyOffices.findNearest')}
              </Link>
            )}
            {data && guestShell && (
              <Link to="/" className="btn-primary">{t('eligibilityCheck.loginToApply')}</Link>
            )}
            {data && !guestShell && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate(`/apply/scheme?schemeId=${data.id}`)}
              >
                {t('eligibilityCheck.apply')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

/** Clickable scheme name — opens details modal via parent state. */
export function SchemeNameButton({ schemeId, children, onOpen, className = '' }) {
  const btnRef = useRef(null)
  return (
    <button
      type="button"
      ref={btnRef}
      className={`scheme-name-link ${className}`.trim()}
      onClick={() => onOpen?.(schemeId, btnRef)}
    >
      {children}
    </button>
  )
}
