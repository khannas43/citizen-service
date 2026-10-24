import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { APIs } from '../api'

const TIME_SLOTS = ['9:00 AM', '11:00 AM', '2:00 PM', '4:00 PM']

const FAQ_COUNT = 6

const SERVICE_DEFS = [
  { prefix: 'CAS', labelKey: 'contact.serviceCaste',    base: APIs.caste },
  { prefix: 'PEN', labelKey: 'contact.servicePension',  base: APIs.pension },
  { prefix: 'MAR', labelKey: 'contact.serviceMarriage', base: APIs.marriage },
  { prefix: 'SCH', labelKey: 'contact.serviceScheme',   base: APIs.scheme },
  { prefix: 'FAM', labelKey: 'contact.serviceFamilyMb', base: APIs.familyMb },
]

const STATUS_KEYS = {
  PENDING: 'contact.statusPending',
  APPROVED: 'contact.statusApproved',
  REJECTED: 'contact.statusRejected',
  ESCALATED: 'contact.statusEscalated',
}

const STATUS_COLORS = {
  PENDING: 'badge-amber',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
  ESCALATED: 'badge-red',
}

// ── Callback Modal ────────────────────────────────────────────────────────────
function CallbackModal({ onClose }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const refNum = 'CB-2026-441'

  if (confirmed) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '2.5rem' }}>✅</div>
            <h3 style={{ margin: 0 }}>{t('contact.callbackScheduled')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('contact.callbackScheduledHint')} <strong>{selected}</strong> {t('contact.callbackToday')}
            </p>
            <div className="cert-number-box">{t('contact.callbackRef')}: {refNum}</div>
            <button type="button" className="btn-primary" onClick={onClose}>{t('common.done')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="complaints-modal-header">
          <h2 style={{ margin: 0 }}>{t('contact.callbackTitle')}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="muted small" style={{ margin: 0 }}>
            {t('contact.callbackHint')}
          </p>
          <div className="contact-slot-grid">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`contact-slot-btn${selected === slot ? ' active' : ''}`}
                onClick={() => setSelected(slot)}
              >
                {slot}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!selected}
            onClick={() => setConfirmed(true)}
          >
            {t('contact.confirmCallback')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Track Without Login ───────────────────────────────────────────────────────
function TrackWidget() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleTrack(e) {
    e.preventDefault()
    const ref = input.trim().toUpperCase()
    if (!ref) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const prefixMatch = ref.match(/^(CAS|PEN|MAR|SCH|FAM)-/)
      let found = null

      if (prefixMatch) {
        const svc = SERVICE_DEFS.find((s) => s.prefix === prefixMatch[1])
        if (svc) {
          const res = await fetch(`${svc.base}/v1/applications/track/${encodeURIComponent(ref)}`)
          if (res.ok) {
            const data = await res.json()
            found = { ...data, serviceLabel: t(svc.labelKey) }
          }
        }
      } else {
        const attempts = await Promise.allSettled(
          SERVICE_DEFS.map(({ base, labelKey }) =>
            fetch(`${base}/v1/applications/track/${encodeURIComponent(ref)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => (data ? { ...data, serviceLabel: t(labelKey) } : null))
          )
        )
        found = attempts.filter((r) => r.status === 'fulfilled' && r.value !== null).map((r) => r.value)[0]
      }

      if (found) setResult(found)
      else setError(t('contact.trackNotFound'))
    } catch {
      setError(t('contact.trackNotFound'))
    }
    setLoading(false)
  }

  return (
    <div className="contact-track-widget">
      <form className="contact-track-form" onSubmit={handleTrack}>
        <input
          type="text"
          className="contact-track-input"
          placeholder={t('contact.trackPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          {loading ? '…' : t('contact.track')}
        </button>
      </form>

      {error && (
        <div className="contact-track-error muted small">{error}</div>
      )}

      {result && (
        <div className="contact-track-result card">
          <div className="contact-track-result-row">
            <span className="muted small">{t('contact.trackService')}</span>
            <strong>{result.serviceLabel || '—'}</strong>
          </div>
          <div className="contact-track-result-row">
            <span className="muted small">{t('contact.trackReference')}</span>
            <span className="mono-cell small">{result.applicationNo || result.engineRef || input}</span>
          </div>
          <div className="contact-track-result-row">
            <span className="muted small">{t('contact.trackStatus')}</span>
            <span className={`status-badge ${STATUS_COLORS[result.status] || 'badge-grey'}`}>
              {STATUS_KEYS[result.status] ? t(STATUS_KEYS[result.status]) : result.status}
            </span>
          </div>
          {result.currentTask && (
            <div className="contact-track-result-row">
              <span className="muted small">{t('contact.trackCurrentStep')}</span>
              <span className="muted">{result.currentTask}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────
function FaqAccordion() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(null)

  return (
    <div className="faq-list">
      {Array.from({ length: FAQ_COUNT }, (_, i) => (
        <div key={i} className={`faq-item${open === i ? ' faq-item--open' : ''}`}>
          <button
            type="button"
            className="faq-question"
            onClick={() => setOpen((prev) => (prev === i ? null : i))}
          >
            <span>{t(`contact.faq${i}q`)}</span>
            <span className="faq-chevron">{open === i ? '▲' : '▼'}</span>
          </button>
          {open === i && (
            <div className="faq-answer">
              {i === 5 ? (
                <>
                  {t('contact.faq5aBefore')}
                  <button
                    type="button"
                    className="faq-inline-link"
                    onClick={() => navigate('/my-consents')}
                  >
                    {t('contact.faqLink')}
                  </button>
                  {t('contact.faq5aAfter')}
                </>
              ) : t(`contact.faq${i}a`)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ContactCentre() {
  const { t } = useTranslation()
  const [showCallback, setShowCallback] = useState(false)

  return (
    <div className="screen-wrap">
      <h2 className="page-title">📞 {t('contact.title')}</h2>

      {/* ── Section 1: Help Options ── */}
      <div className="contact-help-grid">
        {/* Helpline */}
        <div className="contact-help-card">
          <div className="contact-help-icon">📞</div>
          <div className="contact-help-title">{t('contact.helpline')}</div>
          <div className="contact-help-number">{t('contact.helplineNumber')}</div>
          <div className="muted small" style={{ marginBottom: '0.75rem' }}>
            {t('contact.helplineHours')}<br />{t('contact.helplineLang')}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%' }}
            onClick={() => setShowCallback(true)}
          >
            📅 {t('contact.requestCallback')}
          </button>
        </div>

        {/* AI Chatbot */}
        <div className="contact-help-card">
          <div className="contact-help-icon">💬</div>
          <div className="contact-help-title">{t('contact.aiAssistant')}</div>
          <div className="contact-help-number" style={{ fontSize: '1rem' }}>{t('contact.chatbotName')}</div>
          <div className="muted small" style={{ marginBottom: '0.75rem' }}>
            {t('contact.chatbotHint')}<br />{t('contact.chatbotSub')}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%' }}
            onClick={() => document.querySelector('.chat-bubble')?.click()}
          >
            💬 {t('contact.openAssistant')}
          </button>
        </div>

        {/* Nearest JSK */}
        <div className="contact-help-card">
          <div className="contact-help-icon">🏢</div>
          <div className="contact-help-title">{t('contact.nearestJsk')}</div>
          <div className="contact-help-number" style={{ fontSize: '0.95rem' }}>{t('contact.jskName')}</div>
          <div className="muted small" style={{ marginBottom: '0.75rem' }}>
            {t('contact.jskDistance')}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}
            disabled
          >
            🗺 {t('contact.getDirections')}
          </button>
        </div>
      </div>

      {/* ── Section 2: Track Without Login ── */}
      <section className="section-card">
        <h3 className="payments-section-title">🔍 {t('contact.trackTitle')}</h3>
        <p className="muted small" style={{ marginBottom: '1rem' }}>
          {t('contact.trackSub')}
        </p>
        <TrackWidget />
      </section>

      {/* ── Section 3: FAQ ── */}
      <section className="section-card">
        <h3 className="payments-section-title">❓ {t('contact.faqTitle')}</h3>
        <FaqAccordion />
      </section>

      {showCallback && <CallbackModal onClose={() => setShowCallback(false)} />}
    </div>
  )
}
