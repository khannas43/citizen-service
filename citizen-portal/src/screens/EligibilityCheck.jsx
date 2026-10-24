import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { fetchGuestEligibility, fetchTalukasForDistrict, fetchVillagesForTaluka } from '../api'
import { loadCitizenProfile } from '../auth'
import EligibilitySchemeResults from '../components/EligibilitySchemeResults'
import LandingChromeHeader from '../components/LandingChromeHeader'
import VoiceEligibilityAssistant from '../components/VoiceEligibilityAssistant'
import {
  buildPayload,
  CASTE_OPTIONS,
  COURSE_CATEGORY_OPTIONS,
  DISTRICTS,
  EDUCATION_OPTIONS,
  emptyForm,
  EMPLOYMENT_OPTIONS,
  EXAM_TYPE_OPTIONS,
  formatIncomeBlur,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  parseIncomeDisplay,
} from '../guestEligibility/eligibilityShared'
import './EligibilityCheck.css'

const GUEST_PROFILE_KEY = 'dg20_guest_eligibility_profile'
const GUEST_PENDING_FIELD_KEY = 'dg20_guest_eligibility_pending_field'

export default function EligibilityCheck({ guestShell = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = guestShell ? null : loadCitizenProfile()
  const [form, setForm] = useState(() => emptyForm(profile))
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [talukaOptions, setTalukaOptions] = useState([])
  const [villageOptions, setVillageOptions] = useState([])
  const [talukaLoading, setTalukaLoading] = useState(false)
  const [villageLoading, setVillageLoading] = useState(false)
  const fieldRefs = useRef({})

  const lang = i18n.language
  const landingLang = lang === 'gu' ? 'gu' : 'en'

  useEffect(() => {
    if (profile) setForm(emptyForm(profile))
    else {
      try {
        const saved = JSON.parse(sessionStorage.getItem(GUEST_PROFILE_KEY) || 'null')
        if (saved?.form) setForm({ ...emptyForm(null), ...saved.form })
      } catch { /* ignore */ }
    }
    const pending = sessionStorage.getItem(GUEST_PENDING_FIELD_KEY)
    if (pending && fieldRefs.current[pending]) {
      fieldRefs.current[pending].focus?.()
      fieldRefs.current[pending].scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      sessionStorage.removeItem(GUEST_PENDING_FIELD_KEY)
    }
  }, [profile?.aadhaarRef])

  useEffect(() => {
    if (!form.district) {
      setTalukaOptions([])
      setTalukaLoading(false)
      return
    }
    let cancelled = false
    setTalukaLoading(true)
    fetchTalukasForDistrict(form.district).then((rows) => {
      if (cancelled) return
      const list = Array.isArray(rows) ? rows.filter(Boolean) : []
      setTalukaOptions(list)
      if (list.length > 0) {
        setForm((f) => (f.talukaFreeText ? { ...f, talukaFreeText: false } : f))
      }
    }).finally(() => {
      if (!cancelled) setTalukaLoading(false)
    })
    return () => { cancelled = true }
  }, [form.district])

  useEffect(() => {
    if (!form.district || !form.taluka || form.talukaFreeText) {
      setVillageOptions([])
      setVillageLoading(false)
      return
    }
    let cancelled = false
    setVillageLoading(true)
    fetchVillagesForTaluka(form.district, form.taluka).then((rows) => {
      if (cancelled) return
      const list = Array.isArray(rows) ? rows.filter(Boolean) : []
      setVillageOptions(list)
      if (list.length > 0) {
        setForm((f) => (f.villageFreeText ? { ...f, villageFreeText: false } : f))
      }
    }).finally(() => {
      if (!cancelled) setVillageLoading(false)
    })
    return () => { cancelled = true }
  }, [form.district, form.taluka, form.talukaFreeText])

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'district') {
        next.taluka = ''
        next.village = ''
        next.talukaFreeText = false
        next.villageFreeText = false
      }
      if (key === 'taluka') {
        next.village = ''
        next.villageFreeText = false
      }
      return next
    })
    setFieldErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validateForm() {
    const errs = {}
    if (!form.dob && !form.age) errs.dob = t('eligibilityCheck.errRequired')
    if (!form.gender) errs.gender = t('eligibilityCheck.errRequired')
    if (!form.casteCategory) errs.casteCategory = t('eligibilityCheck.errRequired')
    if (!form.district) errs.district = t('eligibilityCheck.errRequired')
    return errs
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = validateForm()
    setFieldErrors(errs)
    if (Object.keys(errs).length) {
      const first = ['dob', 'gender', 'casteCategory', 'district'].find((k) => errs[k])
      fieldRefs.current[first]?.focus?.()
      fieldRefs.current[first]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }
    setError(null)
    setLoading(true)
    setResult(null)
    try {
      const data = await fetchGuestEligibility(buildPayload(form))
      setResult(data)
    } catch (err) {
      setError(err.message || t('eligibilityCheck.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  function saveResultsForLogin() {
    sessionStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({ form, result, savedAt: new Date().toISOString() }))
    navigate('/')
  }

  function fillMissingField(formKey) {
    sessionStorage.setItem(GUEST_PENDING_FIELD_KEY, formKey)
    fieldRefs.current[formKey]?.focus?.()
    fieldRefs.current[formKey]?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  function toggleLang() {
    const next = i18n.language === 'en' ? 'gu' : 'en'
    localStorage.setItem('lang', next)
    localStorage.setItem('landing_lang', next)
    i18n.changeLanguage(next)
  }

  function renderTalukaControl() {
    if (!form.district) {
      return (
        <select disabled>
          <option>{t('eligibilityCheck.selectDistrictFirst')}</option>
        </select>
      )
    }
    if (talukaLoading) {
      return (
        <select disabled>
          <option>{t('eligibilityCheck.loadingOptions')}</option>
        </select>
      )
    }
    if (talukaOptions.length > 0 && !form.talukaFreeText) {
      return (
        <>
          <select value={form.taluka} onChange={(e) => updateField('taluka', e.target.value)}>
            <option value="">{t('eligibilityCheck.selectOptional')}</option>
            {talukaOptions.map((tl) => (
              <option key={tl} value={tl}>{tl}</option>
            ))}
          </select>
          <button type="button" className="link-btn geo-mode-btn" onClick={() => updateField('talukaFreeText', true)}>
            {t('eligibilityCheck.enterManually')}
          </button>
        </>
      )
    }
    return (
      <>
        <input
          type="text"
          value={form.taluka}
          onChange={(e) => updateField('taluka', e.target.value)}
          placeholder={t('eligibilityCheck.talukaPlaceholder')}
        />
        {talukaOptions.length > 0 && (
          <button type="button" className="link-btn geo-mode-btn" onClick={() => updateField('talukaFreeText', false)}>
            {t('eligibilityCheck.useDropdown')}
          </button>
        )}
      </>
    )
  }

  function renderVillageControl() {
    if (!form.district) {
      return (
        <select disabled>
          <option>{t('eligibilityCheck.selectDistrictFirst')}</option>
        </select>
      )
    }
    if (!form.taluka && !form.talukaFreeText) {
      return (
        <select disabled>
          <option>{t('eligibilityCheck.selectTalukaFirst')}</option>
        </select>
      )
    }
    if (villageLoading) {
      return (
        <select disabled>
          <option>{t('eligibilityCheck.loadingOptions')}</option>
        </select>
      )
    }
    if (villageOptions.length > 0 && !form.villageFreeText) {
      return (
        <>
          <select value={form.village} onChange={(e) => updateField('village', e.target.value)}>
            <option value="">{t('eligibilityCheck.selectOptional')}</option>
            {villageOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button type="button" className="link-btn geo-mode-btn" onClick={() => updateField('villageFreeText', true)}>
            {t('eligibilityCheck.enterManually')}
          </button>
        </>
      )
    }
    return (
      <>
        <input
          type="text"
          value={form.village}
          onChange={(e) => updateField('village', e.target.value)}
          placeholder={t('eligibilityCheck.villagePlaceholder')}
        />
        {villageOptions.length > 0 && (
          <button type="button" className="link-btn geo-mode-btn" onClick={() => updateField('villageFreeText', false)}>
            {t('eligibilityCheck.useDropdown')}
          </button>
        )}
      </>
    )
  }

  const body = (
    <div className="eligibility-page">
      <header className="eligibility-hero">
        <h1>{t('eligibilityCheck.title')}</h1>
        <p className="muted">{t('eligibilityCheck.subtitle')}</p>
        <p className="required-note">{t('eligibilityCheck.requiredNote')}</p>
      </header>

      <div className="eligibility-voice-slot">
        <VoiceEligibilityAssistant
          form={form}
          setForm={setForm}
          onResult={setResult}
          onCheckStart={() => setLoading(true)}
          onCheckEnd={() => setLoading(false)}
          onReset={() => {
            setForm(emptyForm(null))
            setResult(null)
            setFieldErrors({})
            setError(null)
            sessionStorage.removeItem(GUEST_PROFILE_KEY)
          }}
        />
      </div>

      <div className="eligibility-layout">
        <div className="eligibility-criteria">
          <form className="eligibility-form card" onSubmit={onSubmit} noValidate>
            <h2 className="eligibility-form-title">{t('eligibilityCheck.formTitle')}</h2>
            <div className="eligibility-form-grid">
          <label ref={(el) => { fieldRefs.current.dob = el }}>
            <span>{t('eligibilityCheck.dob')} *</span>
            <input type="date" value={form.dob} onChange={(e) => updateField('dob', e.target.value)} aria-invalid={Boolean(fieldErrors.dob)} />
            {fieldErrors.dob && <span className="field-error">{fieldErrors.dob}</span>}
          </label>
          <label ref={(el) => { fieldRefs.current.age = el }}>
            <span>{t('voiceEligibility.ageYears')}</span>
            <input
              type="number"
              min="1"
              max="120"
              value={form.age}
              onChange={(e) => updateField('age', e.target.value)}
              placeholder={t('eligibilityCheck.optional')}
            />
          </label>
          <label ref={(el) => { fieldRefs.current.gender = el }}>
            <span>{t('eligibilityCheck.gender')} *</span>
            <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)} aria-invalid={Boolean(fieldErrors.gender)}>
              <option value="">{t('eligibilityCheck.select')}</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{t(`eligibilityCheck.${g.labelKey}`)}</option>
              ))}
            </select>
            {fieldErrors.gender && <span className="field-error">{fieldErrors.gender}</span>}
          </label>
          <label ref={(el) => { fieldRefs.current.casteCategory = el }}>
            <span>{t('eligibilityCheck.caste')} *</span>
            <select value={form.casteCategory} onChange={(e) => updateField('casteCategory', e.target.value)} aria-invalid={Boolean(fieldErrors.casteCategory)}>
              <option value="">{t('eligibilityCheck.select')}</option>
              {CASTE_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {fieldErrors.casteCategory && <span className="field-error">{fieldErrors.casteCategory}</span>}
          </label>
          <label ref={(el) => { fieldRefs.current.district = el }}>
            <span>{t('eligibilityCheck.district')} *</span>
            <select value={form.district} onChange={(e) => updateField('district', e.target.value)} aria-invalid={Boolean(fieldErrors.district)}>
              <option value="">{t('eligibilityCheck.select')}</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {fieldErrors.district && <span className="field-error">{fieldErrors.district}</span>}
          </label>
          <label ref={(el) => { fieldRefs.current.maritalStatus = el }}>
            <span>{t('eligibilityCheck.maritalStatus')}</span>
            <select value={form.maritalStatus} onChange={(e) => updateField('maritalStatus', e.target.value)}>
              <option value="">{t('eligibilityCheck.selectOptional')}</option>
              {MARITAL_OPTIONS.map((v) => (
                <option key={v} value={v}>{t(`eligibilityCheck.marital.${v}`, { defaultValue: v })}</option>
              ))}
            </select>
          </label>
          <label ref={(el) => { fieldRefs.current.employmentStatus = el }}>
            <span>{t('eligibilityCheck.employment')}</span>
            <select value={form.employmentStatus} onChange={(e) => updateField('employmentStatus', e.target.value)}>
              <option value="">{t('eligibilityCheck.selectOptional')}</option>
              {EMPLOYMENT_OPTIONS.map((v) => (
                <option key={v} value={v}>{t(`eligibilityCheck.employmentOpt.${v}`, { defaultValue: v })}</option>
              ))}
            </select>
          </label>
          <label ref={(el) => { fieldRefs.current.educationLevel = el }}>
            <span>{t('eligibilityCheck.education')}</span>
            <select value={form.educationLevel} onChange={(e) => updateField('educationLevel', e.target.value)}>
              <option value="">{t('eligibilityCheck.selectOptional')}</option>
              {EDUCATION_OPTIONS.map((v) => (
                <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label ref={(el) => { fieldRefs.current.taluka = el }}>
            <span>{t('eligibilityCheck.taluka')}</span>
            <div className="geo-field">{renderTalukaControl()}</div>
          </label>
          <label ref={(el) => { fieldRefs.current.village = el }}>
            <span>{t('eligibilityCheck.village')}</span>
            <div className="geo-field">{renderVillageControl()}</div>
          </label>
          <label className="span-2">
            <span>{t('eligibilityCheck.income')}</span>
            <input
              ref={(el) => { fieldRefs.current.annualIncome = el }}
              type="text"
              inputMode="numeric"
              value={form.annualIncome}
              onChange={(e) => updateField('annualIncome', parseIncomeDisplay(e.target.value).display)}
              onBlur={() => updateField('annualIncome', formatIncomeBlur(form.annualIncome))}
              placeholder={t('eligibilityCheck.incomePlaceholder')}
            />
          </label>
        </div>

        <label className="eligibility-toggle">
          <input type="checkbox" checked={form.includeScholarship} onChange={(e) => updateField('includeScholarship', e.target.checked)} />
          <span>{t('eligibilityCheck.scholarshipToggle')}</span>
        </label>

        {form.includeScholarship && (
          <div className="eligibility-form-grid scholarship-block">
            <label ref={(el) => { fieldRefs.current.examType = el }}>
              <span>{t('eligibilityCheck.examType')}</span>
              <select value={form.examType} onChange={(e) => updateField('examType', e.target.value)}>
                <option value="">{t('eligibilityCheck.select')}</option>
                {EXAM_TYPE_OPTIONS.map((ex) => (
                  <option key={ex.value} value={ex.value}>{t(`eligibilityCheck.${ex.labelKey}`)}</option>
                ))}
              </select>
            </label>
            <label ref={(el) => { fieldRefs.current.examPercentile = el }}>
              <span>{t('eligibilityCheck.percentile')}</span>
              <input type="number" min="0" max="100" step="0.1" value={form.examPercentile} onChange={(e) => updateField('examPercentile', e.target.value)} />
            </label>
            <label ref={(el) => { fieldRefs.current.courseCategory = el }}>
              <span>{t('eligibilityCheck.course')}</span>
              <select value={form.courseCategory} onChange={(e) => updateField('courseCategory', e.target.value)}>
                <option value="">{t('eligibilityCheck.selectOptional')}</option>
                {COURSE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{t(`eligibilityCheck.${c.labelKey}`)}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p className="eligibility-error" role="alert">{error}</p>}

        <div className="eligibility-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('eligibilityCheck.checking') : t('eligibilityCheck.submit')}
          </button>
        </div>
          </form>
        </div>

        <div className="eligibility-results-pane">
          <EligibilitySchemeResults
            result={result}
            guestShell={guestShell}
            onFillMissingField={fillMissingField}
            showSaveCta={guestShell}
            onSaveResults={saveResultsForLogin}
          />
        </div>
      </div>
    </div>
  )

  if (!guestShell) return body

  return (
    <div className={`dg-landing eligibility-on-landing${landingLang === 'gu' ? ' dg-landing-gu' : ''}`}>
      <LandingChromeHeader lang={landingLang} onToggleLang={toggleLang} activeRoute="/eligibility-check" />
      <main className="eligibility-guest-main" id="main-content">{body}</main>
    </div>
  )
}
