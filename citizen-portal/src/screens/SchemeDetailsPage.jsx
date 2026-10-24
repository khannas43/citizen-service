import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { fetchNearbyOffices, fetchSchemePublicDetails } from '../api'
import LandingChromeHeader from '../components/LandingChromeHeader'
import { findMatchForScheme, loadGuestEligibilitySession } from '../guestEligibility/eligibilitySession'
import { criterionStatusFromMatch } from '../guestEligibility/schemeDetailsUtils'
import { formatBenefit, formatCriterionValue, formatDate, humanize } from '../guestEligibility/schemeDetailsFormatting'
import { directionsUrl } from '../utils/officeRouting'
import './SchemeDetailsPage.css'

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

function isNotFoundError(err) {
  const msg = String(err?.message || '').toLowerCase()
  return err?.status === 404 || msg.includes('404') || msg.includes('not found')
}

export default function SchemeDetailsPage({ guestShell = false }) {
  const { schemeId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'gu' ? 'gu' : 'en'
  const landingLang = lang

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [offices, setOffices] = useState([])
  const [openFaq, setOpenFaq] = useState(null)

  const eligibilityMatch = findMatchForScheme(schemeId)
  const guestSession = loadGuestEligibilitySession()

  const load = useCallback(async () => {
    if (!schemeId) return
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const res = await fetchSchemePublicDetails(schemeId)
      setData(res)
    } catch (err) {
      if (isNotFoundError(err)) {
        setNotFound(true)
        setData(null)
      } else {
        setError(err.message || t('schemeDetails.errorGeneric'))
        setData(null)
      }
    } finally {
      setLoading(false)
    }
  }, [schemeId, t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data?.id) {
      setOffices([])
      return undefined
    }
    const district = guestSession?.form?.district
    if (!district) {
      setOffices([])
      return undefined
    }
    const controller = new AbortController()
    fetchNearbyOffices({ schemeId: data.id, district, limit: 3 }, controller.signal)
      .then((res) => setOffices(res?.offices?.slice(0, 3) || []))
      .catch(() => setOffices([]))
    return () => controller.abort()
  }, [data?.id, guestSession?.form?.district])

  const displayName = data
    ? (lang === 'gu' && data.nameGujarati ? data.nameGujarati : data.name)
    : ''

  useEffect(() => {
    if (loading && !data) {
      document.title = t('schemeDetailsPage.metaTitleLoading')
      return
    }
    if (notFound) {
      document.title = t('schemeDetailsPage.metaTitleNotFound')
      return
    }
    if (displayName) {
      document.title = t('schemeDetailsPage.metaTitle', { name: displayName })
    }
  }, [loading, data, displayName, notFound, t])

  useEffect(() => {
    let tag = document.querySelector('meta[name="description"]')
    const created = !tag
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'description')
      document.head.appendChild(tag)
    }
    if (data?.description) {
      tag.setAttribute('content', data.description.slice(0, 160))
    } else if (displayName) {
      tag.setAttribute('content', t('schemeDetailsPage.metaDescription', { name: displayName }))
    }
    return () => {
      if (created && tag.parentNode) tag.parentNode.removeChild(tag)
    }
  }, [data, displayName, t])

  function toggleLang() {
    const next = lang === 'en' ? 'gu' : 'en'
    localStorage.setItem('lang', next)
    localStorage.setItem('landing_lang', next)
    i18n.changeLanguage(next)
  }

  function statusChip(status, validTo) {
    if (status === 'ACTIVE' && validTo) {
      return t('schemeDetails.statusActiveUntil', { date: formatDate(validTo) })
    }
    if (status === 'ACTIVE') return t('schemeDetails.statusActive')
    if (status === 'UPCOMING') return t('schemeDetails.statusUpcoming')
    if (status === 'ENDED') return t('schemeDetails.statusEnded')
    return status
  }

  function officeDisplayName(o) {
    return lang === 'gu' && o.nameGujarati ? o.nameGujarati : o.name
  }

  function pickLocalized(en, gu) {
    return lang === 'gu' && gu ? gu : en
  }

  const body = (
    <div className="scheme-details-page">
      <nav className="scheme-details-breadcrumb" aria-label={t('schemeDetailsPage.breadcrumbLabel')}>
        <Link to="/">{t('schemeDetailsPage.breadcrumbHome')}</Link>
        <span className="sep" aria-hidden="true">/</span>
        <Link to="/eligibility-check">{t('schemeDetailsPage.breadcrumbEligibility')}</Link>
        <span className="sep" aria-hidden="true">/</span>
        <span aria-current="page">{displayName || t('schemeDetails.loadingTitle')}</span>
      </nav>

      {loading && !data && !notFound && (
        <p className="scheme-details-loading muted">{t('schemeDetailsPage.loading')}</p>
      )}

      {notFound && (
        <div className="scheme-details-error-panel card scheme-details-panel" role="alert">
          <h1>{t('schemeDetailsPage.notFoundTitle')}</h1>
          <p className="muted">{t('schemeDetailsPage.notFoundBody')}</p>
          <Link to="/eligibility-check" className="btn-primary">{t('schemeDetailsPage.backEligibility')}</Link>
        </div>
      )}

      {error && !notFound && (
        <div className="scheme-details-error-panel card scheme-details-panel" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>{t('schemeDetails.retry')}</button>
        </div>
      )}

      {data && (
        <>
          <header className="scheme-details-hero">
            <h1>{displayName}</h1>
            <div className="scheme-details-chips">
              {data.department && <span className="chip muted">{data.department}</span>}
              {data.category && humanize(data.category).toLowerCase() !== String(data.department || '').toLowerCase() && (
                <span className="chip">
                  {t(`schemeDetails.categories.${data.category}`, { defaultValue: humanize(data.category) })}
                </span>
              )}
              {data.status && (
                <span className={`chip status-${data.status.toLowerCase()}`}>
                  {statusChip(data.status, data.validTo)}
                </span>
              )}
            </div>
          </header>

          {data.contentIsSample && (
            <p className="scheme-details-sample-banner" role="status">
              {t('schemeDetailsPage.sampleContentBanner')}
            </p>
          )}

          <div className="scheme-details-layout">
            <div className="scheme-details-main">
              <section className="scheme-details-panel card" aria-labelledby="scheme-overview-heading">
                <h2 id="scheme-overview-heading">{t('schemeDetails.overview')}</h2>
                <p className="scheme-details-desc">
                  {(lang === 'gu' && data.overviewGu) || data.description || t('schemeDetails.noDescription')}
                </p>
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-benefits-heading">
                <h2 id="scheme-benefits-heading">{t('schemeDetails.benefits')}</h2>
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
                {((lang === 'gu' && data.benefitsNoteGu) || data.benefitsNote) && (
                  <p className="scheme-details-note">{(lang === 'gu' && data.benefitsNoteGu) || data.benefitsNote}</p>
                )}
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-eligibility-heading">
                <h2 id="scheme-eligibility-heading">{t('schemeDetailsPage.whoCanApply')}</h2>
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
                {((lang === 'gu' && data.eligibilityNoteGu) || data.eligibilityNote) && (
                  <p className="scheme-details-note">{(lang === 'gu' && data.eligibilityNoteGu) || data.eligibilityNote}</p>
                )}
                <p className="muted small" style={{ marginTop: '0.85rem' }}>{t('schemeDetails.disclaimer')}</p>
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-docs-heading">
                <h2 id="scheme-docs-heading">{t('schemeDetailsPage.documents')}</h2>
                {!data.documentsRequired?.length ? (
                  <p className="muted">{t('schemeDetailsPage.noDocuments')}</p>
                ) : (
                  <ul className="doc-checklist">
                    {data.documentsRequired.map((doc, idx) => (
                      <li key={`${doc.title}-${idx}`}>
                        <input type="checkbox" id={`doc-${idx}`} />
                        <label htmlFor={`doc-${idx}`}>
                          <strong>{pickLocalized(doc.title, doc.titleGu)}</strong>
                          {pickLocalized(doc.note, doc.noteGu) && (
                            <span className="muted small block">{pickLocalized(doc.note, doc.noteGu)}</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-steps-heading">
                <h2 id="scheme-steps-heading">{t('schemeDetailsPage.steps')}</h2>
                {!data.applicationSteps?.length ? (
                  <p className="muted">{t('schemeDetailsPage.noSteps')}</p>
                ) : (
                  <ol className="steps-list">
                    {data.applicationSteps.map((step, idx) => (
                      <li key={`${step.title}-${idx}`}>
                        <span className="step-num" aria-hidden="true">{idx + 1}</span>
                        <strong>{pickLocalized(step.title, step.titleGu)}</strong>
                        {pickLocalized(step.detail, step.detailGu) && (
                          <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
                            {pickLocalized(step.detail, step.detailGu)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-faq-heading">
                <h2 id="scheme-faq-heading">{t('schemeDetailsPage.faq')}</h2>
                {!data.faqs?.length ? (
                  <p className="muted">{t('schemeDetailsPage.noFaqs')}</p>
                ) : (
                  <ul className="faq-list">
                    {data.faqs.map((faq, idx) => {
                      const open = openFaq === idx
                      const q = pickLocalized(faq.question, faq.questionGu)
                      return (
                        <li key={`${q}-${idx}`} className="faq-item">
                          <button
                            type="button"
                            className="faq-question"
                            aria-expanded={open}
                            aria-controls={`faq-answer-${idx}`}
                            id={`faq-question-${idx}`}
                            onClick={() => setOpenFaq(open ? null : idx)}
                          >
                            {q}
                            <span aria-hidden="true">{open ? '−' : '+'}</span>
                          </button>
                          {open && (
                            <p className="faq-answer" id={`faq-answer-${idx}`} role="region" aria-labelledby={`faq-question-${idx}`}>
                              {pickLocalized(faq.answer, faq.answerGu)}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="scheme-details-panel card" aria-labelledby="scheme-related-heading">
                <h2 id="scheme-related-heading">{t('schemeDetailsPage.relatedSchemes')}</h2>
                {!data.relatedSchemes?.length ? (
                  <p className="muted">{t('schemeDetailsPage.noRelated')}</p>
                ) : (
                  <ul className="related-schemes-list">
                    {data.relatedSchemes.map((s) => (
                      <li key={s.id}>
                        <Link to={`/schemes/${encodeURIComponent(s.id)}`}>
                          {lang === 'gu' && s.nameGujarati ? s.nameGujarati : s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="scheme-details-aside" aria-label={t('schemeDetailsPage.sideCardLabel')}>
              <div className="scheme-details-side-card card">
                <div className="side-actions">
                  {guestShell ? (
                    <Link to="/" className="btn-primary">{t('eligibilityCheck.loginToApply')}</Link>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => navigate(`/apply/scheme?schemeId=${data.id}`)}
                    >
                      {t('eligibilityCheck.apply')}
                    </button>
                  )}
                  <Link
                    to={`/nearby-offices?schemeId=${encodeURIComponent(data.id)}`}
                    className="btn-secondary"
                  >
                    {t('nearbyOffices.findNearest')}
                  </Link>
                  <Link to="/eligibility-check" className="btn-secondary">
                    {t('schemeDetailsPage.checkEligibility')}
                  </Link>
                </div>

                {(data.helplineNumber || data.officialUrl) && (
                  <div className="side-helpline">
                    {data.helplineLabel && data.helplineNumber && (
                      <p>
                        {pickLocalized(data.helplineLabel, null) || t('schemeDetailsPage.helpline')}
                        {' '}
                        <a href={`tel:${String(data.helplineNumber).replace(/\s/g, '')}`}>{data.helplineNumber}</a>
                      </p>
                    )}
                    {data.officialUrl && (
                      <p>
                        <a href={data.officialUrl} target="_blank" rel="noopener noreferrer">
                          {t('schemeDetailsPage.officialSite')}
                        </a>
                      </p>
                    )}
                  </div>
                )}

                <h3>{t('schemeDetailsPage.nearbyOffices')}</h3>
                {offices.length === 0 ? (
                  <p className="muted small">{t('schemeDetailsPage.noOfficesHint')}</p>
                ) : (
                  <ul className="side-offices-list">
                    {offices.map((o) => (
                      <li key={o.id}>
                        <strong>{officeDisplayName(o)}</strong>
                        <span className="muted small block">{o.address}</span>
                        <a
                          href={directionsUrl({ lat: o.latitude, lng: o.longitude }, null)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('nearbyOffices.getDirections')}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>

          <p className="muted small" style={{ marginTop: '1.25rem' }}>
            {t('schemeDetails.validFromTo', {
              from: formatDate(data.validFrom),
              to: formatDate(data.validTo),
            })}
          </p>
        </>
      )}
    </div>
  )

  if (!guestShell) {
    return <div className="scheme-details-authed">{body}</div>
  }

  return (
    <div className={`dg-landing eligibility-on-landing${landingLang === 'gu' ? ' dg-landing-gu' : ''}`}>
      <LandingChromeHeader lang={landingLang} onToggleLang={toggleLang} activeRoute="/eligibility-check" />
      <main className="eligibility-guest-main" id="main-content">{body}</main>
    </div>
  )
}
