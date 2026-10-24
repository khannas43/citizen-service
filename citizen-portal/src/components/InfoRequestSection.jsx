import { useCallback, useEffect, useState } from 'react'
import {
  fetchClarifications,
  fetchNotifications,
  respondToInfoRequestByRef,
  appRefsMatch,
  trackingMatchesApp,
  parseInfoRequestNotification,
  displayAppNo,
} from '../api'
import { serviceLabel } from '../labels'

function mergeInfoRequests(clarifications, notifications, item) {
  const matched = clarifications.filter((c) => appRefsMatch(c, item))
  const answeredQueries = new Set(
    matched.filter((c) => c.status === 'ANSWERED').map((c) => c.question?.trim().toLowerCase())
  )
  const pendingQueries = new Set(
    matched.filter((c) => c.status === 'PENDING').map((c) => c.question?.trim().toLowerCase())
  )

  const fromNotifications = notifications
    .filter((n) => n.title === 'Additional Information Required')
    .filter((n) => trackingMatchesApp(n.trackingId, item))
    .map((n) => {
      const parsed = parseInfoRequestNotification(n.message)
      const q = parsed.query?.trim().toLowerCase()
      return {
        id: `notif-${n.id}`,
        notificationId: n.id,
        question: parsed.query,
        officerName: parsed.officerName,
        status: answeredQueries.has(q) ? 'ANSWERED' : 'PENDING',
        fromNotification: true,
        askedAt: n.createdAt,
      }
    })
    .filter((n) => {
      const q = n.question?.trim().toLowerCase()
      return n.question && !pendingQueries.has(q) && !answeredQueries.has(q)
    })

  const pendingOrAnswered = matched.filter((c) => c.status === 'PENDING' || c.status === 'ANSWERED')
  return [...pendingOrAnswered, ...fromNotifications].sort(
    (a, b) => new Date(b.askedAt || 0) - new Date(a.askedAt || 0)
  )
}

export default function InfoRequestSection({ item, profile, t }) {
  const [requests, setRequests] = useState([])
  const [responses, setResponses] = useState({})
  const [submitting, setSubmitting] = useState(null)
  const [errors, setErrors] = useState({})
  const [success, setSuccess] = useState({})

  const load = useCallback(async () => {
    if (!profile?.aadhaarRef) return
    const [clarifications, notifications] = await Promise.all([
      fetchClarifications(profile.aadhaarRef, null, 'OFFICER_TO_CITIZEN'),
      fetchNotifications(profile.aadhaarRef),
    ])
    setRequests(mergeInfoRequests(clarifications, notifications, item))
  }, [profile?.aadhaarRef, item])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  async function submitResponse(req, e) {
    e?.preventDefault()
    e?.stopPropagation()
    const text = responses[req.id]?.trim()
    if (!text || text.length < 5) {
      setErrors((prev) => ({ ...prev, [req.id]: t('infoRequests.tooShort') }))
      return
    }
    setSubmitting(req.id)
    setErrors((prev) => ({ ...prev, [req.id]: null }))
    setSuccess((prev) => ({ ...prev, [req.id]: false }))
    try {
      const clarificationId =
        req.fromNotification || String(req.id).startsWith('notif-') ? null : req.id
      await respondToInfoRequestByRef({
        clarificationId,
        aadhaarRef: profile.aadhaarRef,
        applicationRef: item.engineRef,
        displayRef: displayAppNo(item),
        serviceName: serviceLabel(item.service, t),
        query: req.question,
        officerName: req.officerName || 'Officer',
        answer: text,
      })
      setResponses((prev) => ({ ...prev, [req.id]: '' }))
      setSuccess((prev) => ({ ...prev, [req.id]: true }))
      await load()
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [req.id]: err?.message || t('infoRequests.failed'),
      }))
    } finally {
      setSubmitting(null)
    }
  }

  if (requests.length === 0) return null

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length

  return (
    <div
      className="info-request-box"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <strong>🔍 {t('infoRequests.title')}</strong>
      {pendingCount > 0 && (
        <p className="info-request-alert">{t('infoRequests.actionNeeded')}</p>
      )}
      {requests.map((req) => (
        <div key={req.id} className="info-request-item">
          <p className="info-request-query">
            {t('infoRequests.officerAsked', { name: req.officerName || 'Officer' })}
            <br />
            {req.question}
          </p>
          {req.status === 'PENDING' && (
            <>
              <textarea
                rows={3}
                value={responses[req.id] || ''}
                onChange={(e) =>
                  setResponses((prev) => ({ ...prev, [req.id]: e.target.value }))
                }
                placeholder={t('infoRequests.placeholder')}
                onClick={(e) => e.stopPropagation()}
              />
              {errors[req.id] && <p className="error-text">{errors[req.id]}</p>}
              {success[req.id] && (
                <p className="info-request-success">{t('infoRequests.submitted')}</p>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={submitting === req.id}
                onClick={(e) => submitResponse(req, e)}
              >
                {submitting === req.id ? t('infoRequests.submitting') : t('infoRequests.submit')}
              </button>
            </>
          )}
          {req.status === 'ANSWERED' && (
            <p className="answer-line">
              <strong>{t('infoRequests.submitted')}:</strong> {req.answer}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export function hasPendingInfoRequest(clarifications, notifications, item) {
  return mergeInfoRequests(clarifications, notifications, item).some((r) => r.status === 'PENDING')
}
