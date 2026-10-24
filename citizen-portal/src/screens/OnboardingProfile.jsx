import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchOnboardingProfile, completeOnboarding } from '../api'
import { loadCitizenProfile } from '../auth'

const EDUCATION_OPTIONS = ['NONE', 'PRIMARY', 'SECONDARY', 'MATRIC', 'HIGHER_SEC', 'GRADUATE', 'POST_GRADUATE']
const MARITAL_OPTIONS = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED', 'SEPARATED']
const EMPLOYMENT_OPTIONS = ['EMPLOYED', 'UNEMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'HOMEMAKER', 'RETIRED']

function SourceField({ label, value, source }) {
  if (value == null || value === '') return null
  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      <span className="profile-field-value">
        <span className="profile-field-lock">🔒</span>
        {value}
      </span>
      <span className="profile-field-hint">{source}</span>
    </div>
  )
}

export default function OnboardingProfile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = loadCitizenProfile()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    if (!session?.aadhaarRef) {
      navigate('/', { replace: true })
      return
    }
    let cancelled = false
    fetchOnboardingProfile(session.aadhaarRef)
      .then((p) => {
        if (cancelled) return
        if (p.onboardingCompleted) {
          navigate('/', { replace: true })
          return
        }
        setProfile(p)
        setForm({
          occupation: p.occupation || '',
          annualIncome: p.annualIncome ?? '',
          casteCategory: p.casteCategory || '',
          educationLevel: p.educationLevel || '',
          maritalStatus: p.maritalStatus || '',
          employmentStatus: p.employmentStatus || '',
        })
      })
      .catch(() => { if (!cancelled) setError(t('onboarding.loadError')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await completeOnboarding(profile.personId, {
        occupation: form.occupation || null,
        annualIncome: form.annualIncome === '' ? null : Number(form.annualIncome),
        casteCategory: form.casteCategory || null,
        educationLevel: form.educationLevel || null,
        maritalStatus: form.maritalStatus || null,
        employmentStatus: form.employmentStatus || null,
      })
      navigate('/', { replace: true })
    } catch {
      setSubmitError(t('onboarding.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSkip() {
    navigate('/', { replace: true })
  }

  if (loading) return <p className="muted" style={{ padding: 'var(--space-6)' }}>{t('onboarding.loading')}</p>
  if (error) return <p className="error-text" style={{ padding: 'var(--space-6)' }}>{error}</p>
  if (!profile) return null

  const selfDeclared = [
    { key: 'occupation', labelKey: 'onboarding.occupation', type: 'text' },
    { key: 'annualIncome', labelKey: 'onboarding.annualIncome', type: 'number' },
    { key: 'casteCategory', labelKey: 'onboarding.casteCategory', type: 'text' },
    { key: 'educationLevel', labelKey: 'onboarding.educationLevel', type: 'select', options: EDUCATION_OPTIONS, optionPrefix: 'onboarding.education' },
    { key: 'maritalStatus', labelKey: 'onboarding.maritalStatus', type: 'select', options: MARITAL_OPTIONS, optionPrefix: 'onboarding.marital' },
    { key: 'employmentStatus', labelKey: 'onboarding.employmentStatus', type: 'select', options: EMPLOYMENT_OPTIONS, optionPrefix: 'onboarding.employment' },
  ]

  function renderSelfField(f) {
    const currentValue = profile[f.key]
    const hasValue = currentValue != null && currentValue !== ''
    if (hasValue) {
      const displayValue = f.type === 'select' ? t(`${f.optionPrefix}.${currentValue}`) : currentValue
      const source = f.key === 'maritalStatus' && profile.maritalStatusSource === 'viaRation'
        ? t('onboarding.viaRation')
        : t('onboarding.selfDeclared')
      return <SourceField key={f.key} label={t(f.labelKey)} value={displayValue} source={source} />
    }
    return (
      <label key={f.key} className="field">
        {t(f.labelKey)}
        {f.type === 'select' ? (
          <select value={form[f.key]} onChange={(e) => update(f.key, e.target.value)}>
            <option value="">{t('onboarding.selectOption')}</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>{t(`${f.optionPrefix}.${opt}`)}</option>
            ))}
          </select>
        ) : (
          <input
            type={f.type}
            value={form[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            placeholder={t('onboarding.enterValue')}
          />
        )}
      </label>
    )
  }

  return (
    <div className="page-content">
      <div className="onboarding-page">
        <h1>{t('onboarding.title', { name: profile.name })}</h1>
        <p className="muted">{t('onboarding.subtitle')}</p>

        <section className="caf-step-content">
          <div className="profile-notice">🔒 {t('onboarding.aadhaarNotice')}</div>
          <div className="profile-field-row">
            <SourceField label={t('onboarding.name')} value={profile.name} source={t('onboarding.viaAadhaar')} />
            <SourceField label={t('onboarding.aadhaar')} value={profile.aadhaarRef} source={t('onboarding.viaAadhaar')} />
          </div>
          <div className="profile-field-row">
            <SourceField label={t('onboarding.dob')} value={profile.dob} source={t('onboarding.viaAadhaar')} />
            <SourceField label={t('onboarding.gender')} value={profile.gender} source={t('onboarding.viaAadhaar')} />
            <SourceField label={t('onboarding.mobile')} value={profile.mobile} source={t('onboarding.viaAadhaar')} />
          </div>
        </section>

        <section className="caf-step-content">
          <div className="profile-notice">🔒 {t('onboarding.rationNotice')}</div>
          <div className="profile-field-row">
            <SourceField label={t('onboarding.address')} value={profile.address} source={t('onboarding.viaRation')} />
            <SourceField label={t('onboarding.village')} value={profile.village} source={t('onboarding.viaRation')} />
          </div>
          <div className="profile-field-row">
            <SourceField label={t('onboarding.taluka')} value={profile.taluka} source={t('onboarding.viaRation')} />
            <SourceField label={t('onboarding.district')} value={profile.district} source={t('onboarding.viaRation')} />
            <SourceField label={t('onboarding.rationCardNumber')} value={profile.rationCardNumber} source={t('onboarding.viaRation')} />
          </div>
        </section>

        <form onSubmit={handleSubmit} className="caf-step-content">
          <div className="form-section-heading">{t('onboarding.completeTitle')}</div>
          <p className="muted small">{t('onboarding.completeHint')}</p>

          <div className="profile-field-row">
            {selfDeclared.slice(0, 3).map(renderSelfField)}
          </div>
          <div className="profile-field-row">
            {selfDeclared.slice(3, 6).map(renderSelfField)}
          </div>

          {submitError && <p className="error-text">{submitError}</p>}
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn-secondary" onClick={handleSkip}>{t('onboarding.skip')}</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('onboarding.saving') : t('onboarding.saveContinue')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
