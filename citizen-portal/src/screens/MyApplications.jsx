import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { serviceLabel } from '../labels'
  submitClarification,
  fetchClarifications,
} from '../api'
import InfoRequestSection from '../components/InfoRequestSection'

function ClarificationSection({ item, profile, t }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!item.engineRef) return
    fetchClarifications(profile.aadhaarRef, item.engineRef, 'CITIZEN_TO_OFFICER').then(setHistory)
  }, [item.engineRef, profile.aadhaarRef])

  async function ask() {
    if (question.trim().length < 10) {
      setError(t('clarifications.tooShort'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitClarification(
        profile.aadhaarRef,
        profile.name,
        item.engineRef,
        serviceLabel(item.service, t),
        question.trim()
      )
      setQuestion('')
      setHistory(await fetchClarifications(profile.aadhaarRef, item.engineRef, 'CITIZEN_TO_OFFICER'))
    } catch {
      setError(t('clarifications.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="clarification-box">
      <strong>💬 {t('clarifications.askTitle')}</strong>
      <textarea
        rows={2}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('clarifications.placeholder')}
      />
      <button type="button" className="btn-secondary" disabled={submitting} onClick={ask}>
        {submitting ? '…' : t('clarifications.submit')}
      </button>
      {error && <p className="error-text">{error}</p>}
      {history.length > 0 && (
        <div className="clarification-history">
          {history.map((c) => (
            <div key={c.id} className="clarification-item">
              <p><strong>Q:</strong> {c.question}</p>
              {c.answer && <p className="answer-line"><strong>A:</strong> {c.answer}</p>}
              {!c.answer && <p className="muted small">{t('clarifications.pending')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusCard({ item, t, profile }) {
  const status = item.live?.status || 'PENDING'
  const cls =
    status === 'APPROVED'
      ? 'status-approved'
      : status === 'ESCALATED' || status === 'REJECTED'
        ? 'status-rejected'
        : 'status-pending'
  const stripeCls =
    status === 'APPROVED'
      ? 'app-stripe-approved'
      : status === 'ESCALATED' || status === 'REJECTED'
        ? 'app-stripe-rejected'
        : 'app-stripe-pending'
  const canDownload = item.service === 'caste' && status === 'APPROVED'

  return (
    <div className={`app-card ${stripeCls}`}>
      <div className="status-card-header">
        <code className="app-ref">{item.engineRef}</code>
        <span className={`status-badge ${cls}`}>{t(`status.${status}`, status)}</span>
      </div>
      <p className="app-service-line">
        <strong>{serviceLabel(item.service, t)}</strong>
        {item.checkedAt && (
          <span className="muted"> · {new Date(item.checkedAt).toLocaleDateString()}</span>
        )}
      </p>
      {item.live?.currentTask && <p className="small muted">{item.live.currentTask}</p>}
      {canDownload && (
        <a className="btn-primary cert-download" href={certificateDownloadUrl(item.engineRef)} download>
          📄 {t('myApps.downloadCert', 'Download Certificate')}
        </a>
      )}
      {profile && item.engineRef && (
        <>
          <InfoRequestSection item={item} profile={profile} t={t} />
          <ClarificationSection item={item} profile={profile} t={t} />
        </>
      )}
      {item.checkedAt && (
        <p className="small muted">{t('myApps.lastChecked')}: {new Date(item.checkedAt).toLocaleString()}</p>
      )}
    </div>
  )
}

export default function MyApplications() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [apps, setApps] = useState(null)
  const [trackingRef, setTrackingRef] = useState('')
  const [trackingService, setTrackingService] = useState('caste')
  const [trackingResult, setTrackingResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function enrichApps(raw) {
    return Promise.all(
      raw.map(async (app) => {
        try {
          const live = await fetchApplicationStatus(app.service, app.engineRef)
          return { ...app, live, checkedAt: new Date().toISOString() }
        } catch {
          return { ...app, live: null, checkedAt: new Date().toISOString() }
        }
      })
    )
  }

  useEffect(() => {
    if (!profile?.aadhaarRef) {
      setLoading(false)
      return
    }
    const stored = loadCitizenApps().filter((a) => a.aadhaarRef === profile.aadhaarRef)
    enrichApps(stored).then((enriched) => {
      setApps(enriched)
      setLoading(false)
    })
  }, [profile?.aadhaarRef])

  async function fetchByTracking() {
    setError(null)
    try {
      const live = await fetchApplicationStatus(trackingService, trackingRef.trim())
      setTrackingResult({
        service: trackingService,
        engineRef: trackingRef.trim(),
        live,
        checkedAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="my-apps-screen">
      <h1 className="page-title">{t('myApps.title')}</h1>

      {profile && (
        <section className="card form-card">
          <p className="muted">
            {t('myApps.loggedInAs', 'Showing applications for')} <strong>{profile.name}</strong>
          </p>
          {loading && <p className="muted">{t('myApps.loading')}</p>}
          {!loading && apps?.length === 0 && (
            <p className="muted">{t('myApps.noApps')}</p>
          )}
          {apps?.map((item) => (
            <StatusCard key={item.engineRef} item={item} t={t} profile={profile} />
          ))}
        </section>
      )}

      <section className="card form-card">
        <p className="muted">{t('myApps.orByTracking')}</p>
        <label className="field">
          {t('myApps.trackingLabel')}
          <input value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} placeholder="FLW-..." />
        </label>
        <label className="field">
          {t('form.selectService')}
          <select value={trackingService} onChange={(e) => setTrackingService(e.target.value)}>
            {['caste', 'marriage', 'pension', 'familyMb', 'scheme'].map((k) => (
              <option key={k} value={k}>{serviceLabel(k, t)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={fetchByTracking}>{t('myApps.fetch')}</button>
        {error && <div className="error-banner">{error}</div>}
        {trackingResult && <StatusCard item={trackingResult} t={t} profile={profile} />}
      </section>
    </div>
  )
}
