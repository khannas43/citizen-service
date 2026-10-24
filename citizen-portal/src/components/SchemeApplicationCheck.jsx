import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchSchemeApplicationCheck } from '../api'
import './SchemeApplicationCheck.css'

const OUTCOME_LABEL = {
  CLEAR: 'applyCheck.outcomeClear',
  ADVICE: 'applyCheck.outcomeAdvice',
  REVIEW: 'applyCheck.outcomeReview',
  BLOCK: 'applyCheck.outcomeBlock',
}

const ITEM_ICON = {
  ok: '✓',
  advice: 'i',
  warning: '!',
  block: '✕',
}

/** Identification scan ≠ currently availing. Hide that as a duplicate warning. */
function sanitizeApplicationCheck(data) {
  if (!data) return data
  const items = (data.items || []).filter((item) => {
    if (item?.code !== 'ALREADY_ENROLLED') return true
    const detail = String(item.detail || '').toLowerCase()
    return !detail.includes('identified as eligible')
  })
  const hasBlock = items.some((i) => i.level === 'block')
  const hasWarning = items.some((i) => i.level === 'warning')
  const hasAdvice = items.some((i) => i.level === 'advice')
  const outcome = hasBlock ? 'BLOCK' : hasWarning ? 'REVIEW' : hasAdvice ? 'ADVICE' : 'CLEAR'
  const summary = hasBlock
    ? data.summary
    : hasWarning
      ? data.summary
      : hasAdvice
        ? 'You appear eligible. A few points to check before you submit.'
        : 'Live check complete — your profile looks consistent with this scheme.'
  return {
    ...data,
    items,
    outcome,
    blocked: Boolean(data.blocked) && outcome === 'BLOCK',
    summary: outcome === data.outcome ? data.summary : summary,
  }
}

export default function SchemeApplicationCheck({ schemeId, familyId, aadhaarRef, onResult }) {
  const { t } = useTranslation()
  const [check, setCheck] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    if (!schemeId || !familyId) {
      setCheck(null)
      setError(null)
      setLoading(false)
      onResultRef.current?.(null)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setCheck(null)
    onResultRef.current?.(null)

    fetchSchemeApplicationCheck(schemeId, familyId, aadhaarRef, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        const next = sanitizeApplicationCheck(data)
        setCheck(next)
        onResultRef.current?.(next)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(t('applyCheck.failed', 'Could not run the live check. You can still apply.'))
        onResultRef.current?.(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [schemeId, familyId, aadhaarRef, t])

  if (!schemeId || !familyId) return null

  const outcome = (check?.outcome || 'CLEAR').toUpperCase()
  const outcomeClass =
    outcome === 'BLOCK' ? 'block'
      : outcome === 'REVIEW' ? 'review'
        : outcome === 'ADVICE' ? 'advice'
          : 'clear'

  return (
    <div className={`sac-card sac-${outcomeClass}`} role="status" aria-live="polite">
      <div className="sac-head">
        <span className="sac-live">● {t('applyCheck.live', 'Live')}</span>
        <strong className="sac-title">{t('applyCheck.title', 'Application check')}</strong>
        {!loading && check && (
          <span className={`sac-outcome sac-outcome-${outcomeClass}`}>
            {t(OUTCOME_LABEL[outcome] || OUTCOME_LABEL.CLEAR, check.summary)}
          </span>
        )}
      </div>

      {loading && (
        <p className="sac-loading">
          {t('applyCheck.scanning', 'Checking your family record against this scheme…')}
        </p>
      )}

      {error && !loading && <p className="sac-error">{error}</p>}

      {!loading && check && (
        <>
          <p className="sac-summary">{check.summary}</p>
          <ul className="sac-items">
            {(check.items || []).map((item) => (
              <li key={item.code} className={`sac-item sac-item-${item.level || 'ok'}`}>
                <span className="sac-item-icon" aria-hidden="true">
                  {ITEM_ICON[item.level] || '•'}
                </span>
                <div>
                  <div className="sac-item-title">{item.title}</div>
                  <div className="sac-item-detail">{item.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="sac-footer">
            {check.blocked || outcome === 'BLOCK'
              ? t('applyCheck.footerBlocked', 'This application cannot be submitted.')
              : t(
                  'applyCheck.footer',
                  'Same registry checks officers use. This does not block your application.'
                )}
          </p>
        </>
      )}
    </div>
  )
}
