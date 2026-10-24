import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AUTH_API } from '../auth'
import { fetchConsents } from '../api'
import { uniqueSchemeEnrollments } from '../reasonUtils'
import {
  ageFromDob,
  grantProfileConsent,
  isMinor,
  maskAadhaar,
  maskMobile,
} from '../utils/familyAccess'

function ProfileSection({ title, children }) {
  return (
    <section className="profile360-section">
      <h3 className="profile360-section-title">{title}</h3>
      {children}
    </section>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="profile360-row">
      <span className="profile360-label">{label}</span>
      <span className="profile360-value">{value ?? '—'}</span>
    </div>
  )
}

export default function MemberProfile360({
  member,
  enrolled,
  onClose,
  viewerAadhaar,
  requireOtp = false,
}) {
  const { t } = useTranslation()
  const [consents, setConsents] = useState([])
  const [otpStep, setOtpStep] = useState(requireOtp ? 'sending' : 'profile')
  const [otp, setOtp] = useState('')
  const [maskedMobile, setMaskedMobile] = useState('')
  const [otpError, setOtpError] = useState(null)
  const [otpLoading, setOtpLoading] = useState(false)

  const personSchemes = uniqueSchemeEnrollments(enrolled || []).filter(
    (b) => b.personId === member.id || b.personName === member.name
  )

  useEffect(() => {
    if (!member?.aadhaarRef || otpStep !== 'profile') return
    fetchConsents(member.aadhaarRef).then(setConsents)
  }, [member?.aadhaarRef, otpStep])

  useEffect(() => {
    if (requireOtp && otpStep === 'sending') sendConsentOtp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireOtp, member?.aadhaarRef])

  async function sendConsentOtp() {
    setOtpError(null)
    setOtpLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef: member.aadhaarRef }),
      })
      if (!res.ok) throw new Error('send failed')
      const data = await res.json()
      setMaskedMobile(data.maskedMobile || 'XXXXXX****')
      setOtpStep('otp')
    } catch {
      setOtpError(t('profile360.otpSendFailed'))
    } finally {
      setOtpLoading(false)
    }
  }

  async function verifyConsentOtp() {
    setOtpError(null)
    setOtpLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/v1/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarRef: member.aadhaarRef, otp }),
      })
      if (res.status === 401) {
        setOtpError(t('profile360.otpInvalid'))
        return
      }
      if (!res.ok) throw new Error('verify failed')
      grantProfileConsent(viewerAadhaar, member.aadhaarRef)
      setOtpStep('profile')
    } catch {
      setOtpError(t('profile360.otpSendFailed'))
    } finally {
      setOtpLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile360-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile360-header">
          <div>
            <h2 className="profile360-title">{member.name}</h2>
            <p className="profile360-sub">
              {t('profile360.subtitle')} · {t('relationships.' + member.relationshipToHead, member.relationshipToHead)}
            </p>
          </div>
          <button type="button" className="profile360-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {otpStep === 'otp' && (
          <div className="profile360-consent section-card">
            <h3>{t('profile360.consentTitle', { name: member.name })}</h3>
            <p className="muted">
              {t('profile360.consentBody', {
                name: member.name,
                mobile: maskedMobile,
              })}
            </p>
            <label className="field">
              {t('profile360.otpLabel')}
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
              />
            </label>
            {otpError && <p className="error-text">{otpError}</p>}
            <div className="btn-row">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={otp.length !== 6 || otpLoading}
                onClick={verifyConsentOtp}
              >
                {otpLoading ? '…' : t('profile360.verifyOtp')}
              </button>
            </div>
            <p className="small muted">{t('login.demoOtp')}</p>
          </div>
        )}

        {otpStep === 'profile' && (
          <div className="profile360-body">
            {isMinor(member) && (
              <p className="profile360-note">{t('profile360.minorNote')}</p>
            )}

            <ProfileSection title={t('profile360.identity')}>
              <DetailRow label={t('profile360.age')} value={`${ageFromDob(member.dob) ?? '—'} ${t('myFamilyPage.years')}`} />
              <DetailRow label={t('form.gender')} value={member.gender} />
              <DetailRow label={t('form.aadhaarRef')} value={maskAadhaar(member.aadhaarRef)} />
              <DetailRow label={t('form.mobile')} value={maskMobile(member.mobile)} />
              <DetailRow
                label={t('profile360.status')}
                value={member.isAlive === false ? t('myFamilyPage.deceased') : t('profile360.alive')}
              />
            </ProfileSection>

            <ProfileSection title={t('profile360.economic')}>
              <DetailRow label={t('form.occupation')} value={member.occupation} />
              <DetailRow
                label={t('form.income')}
                value={`₹${(member.annualIncome || 0).toLocaleString('en-IN')}`}
              />
              <DetailRow label={t('form.casteCategory')} value={member.casteCategory} />
              <DetailRow label="Education" value={member.educationLevel} />
              <DetailRow label="Marital Status" value={member.maritalStatus} />
              <DetailRow label="Employment" value={member.employmentStatus} />
            </ProfileSection>

            <ProfileSection title={t('profile360.schemes')}>
              {personSchemes.length === 0 ? (
                <p className="muted small">{t('profile360.noSchemes')}</p>
              ) : (
                personSchemes.map((s) => (
                  <div key={s.id} className="profile360-scheme-row">
                    <strong>{s.schemeName}</strong>
                    <span className={`status-badge ${s.status === 'IDENTIFIED' ? 'status-pending' : 'status-approved'}`}>
                      {s.status}
                    </span>
                  </div>
                ))
              )}
            </ProfileSection>

            <ProfileSection title={t('profile360.consents')}>
              {consents.length === 0 ? (
                <p className="muted small">{t('profile360.noConsents')}</p>
              ) : (
                consents.map((c) => (
                  <div key={c.id} className="profile360-consent-row">
                    <strong>{c.department}</strong>
                    <span className="small muted">{c.dataCategory} · {c.status}</span>
                  </div>
                ))
              )}
            </ProfileSection>
          </div>
        )}

        {otpStep === 'sending' && (
          <div className="profile360-consent section-card">
            <p className="muted">{t('profile360.sendingOtp')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
