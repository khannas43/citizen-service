import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  APIs,
  displayAppNo,
  fetchCitizenDocuments,
  fetchMyApplications,
  fetchCafCommonProfile,
  saveCitizenApp,
  uploadCitizenDocument,
  syncTrustedDocuments,
} from '../api'
import { loadCitizenProfile } from '../auth'
import {
  CAF_PHASE1_SERVICES,
  CAF_SERVICE_CONFIG,
  getCafServiceTiles,
  submitServiceApplication,
} from '../caf/cafServiceConfig'
import {
  formatCafDocType,
  mergeCafVaultDocs,
  validateCafDocuments,
} from '../caf/cafDocumentConfig'
import {
  duplicateBlockMessage,
  findAllBlocking,
  findBlockingApplication,
} from '../caf/cafDuplicateCheck'
import SchemeApplicationCheck from '../components/SchemeApplicationCheck'
import { pinDemoSchemeFirst } from '../reasonUtils'
import './CommonApplicationForm.css'

const ACCEPTED_UPLOAD = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx'
const ACCEPTED_MIME = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function uploadFileAllowed(file) {
  if (!file) return false
  if (ACCEPTED_MIME.includes(file.type)) return true
  return /\.(pdf|jpe?g|png|gif|docx?)$/i.test(file.name || '')
}

const STEP_KEYS = ['profile', 'services', 'details', 'documents', 'review']

function fileIcon(type) {
  if (!type) return '📎'
  if (type === 'application/pdf') return '📄'
  if (type.startsWith('image/')) return '🖼️'
  if (type.includes('word')) return '📝'
  return '📎'
}

function ProfileField({ label, value, hint }) {
  if (value == null || value === '') return null
  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      <span className="profile-field-value">
        <span className="profile-field-lock">🔒</span>
        {value}
      </span>
      {hint && <span className="profile-field-hint">{hint}</span>}
    </div>
  )
}

function StatusBadge({ status, t }) {
  const cls =
    status === 'APPROVED'
      ? 'badge-green'
      : status === 'ESCALATED' || status === 'REJECTED'
        ? 'badge-red'
        : 'badge-grey'
  return <span className={`status-badge ${cls}`}>{t(`status.${status}`, status)}</span>
}

function defaultSpecificForService(key) {
  return { ...(CAF_SERVICE_CONFIG[key]?.defaultSpecific ?? {}) }
}

function parseInitialServices(searchParams) {
  const raw = searchParams.get('services')
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => CAF_PHASE1_SERVICES.includes(s))
}

function trustedSourceLabel(source, t) {
  if (source === 'UIDAI') return t('caf.trustedUidai')
  if (source === 'DigiLocker') return t('caf.trustedDigilocker')
  return source
}

function trustedSourceIcon(source) {
  if (source === 'UIDAI') return '🪪'
  if (source === 'DigiLocker') return '📂'
  return '📎'
}

export default function CommonApplicationForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionProfile = loadCitizenProfile()
  const schemeIdFromUrl = searchParams.get('schemeId')
  const schemeNameFromUrl = searchParams.get('schemeName')

  const [step, setStep] = useState(() => {
    const services = parseInitialServices(searchParams)
    if (services.includes('scheme') && (searchParams.get('schemeId') || searchParams.get('schemeName'))) {
      return 3
    }
    return 1
  })
  const [common, setCommon] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  const [selectedServices, setSelectedServices] = useState(() => parseInitialServices(searchParams))
  const [specific, setSpecific] = useState(() => {
    const init = parseInitialServices(searchParams)
    return Object.fromEntries(init.map((k) => [k, defaultSpecificForService(k)]))
  })

  const [schemes, setSchemes] = useState([])
  const [vaultDocs, setVaultDocs] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [docsSyncing, setDocsSyncing] = useState(false)
  const [docsSyncError, setDocsSyncError] = useState(null)
  const [showAdditionalUpload, setShowAdditionalUpload] = useState(false)
  const [uploadDocType, setUploadDocType] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [stepError, setStepError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResults, setSubmitResults] = useState(null)
  const [retryingKey, setRetryingKey] = useState(null)
  const [existingApps, setExistingApps] = useState([])
  const [schemeBlocked, setSchemeBlocked] = useState(false)

  useEffect(() => {
    if (!sessionProfile?.aadhaarRef) {
      setProfileLoading(false)
      setProfileError(t('caf.loginRequired'))
      return
    }
    let cancelled = false
    async function load() {
      setProfileLoading(true)
      setProfileError(null)
      try {
        const profile = await fetchCafCommonProfile(
          sessionProfile.aadhaarRef,
          sessionProfile.familyId
        )
        if (cancelled) return
        if (!profile.name) profile.name = sessionProfile.name
        setCommon(profile)
        fetchMyApplications(sessionProfile.aadhaarRef).then(setExistingApps).catch(() => {})
      } catch {
        if (!cancelled) setProfileError(t('caf.loadProfileError'))
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sessionProfile?.aadhaarRef, sessionProfile?.familyId, sessionProfile?.name])

  useEffect(() => {
    if (!selectedServices.includes('scheme')) return
    fetch(`${APIs.schemeEngine}/v1/schemes`)
      .then((r) => r.json())
      .then((rows) => setSchemes(pinDemoSchemeFirst(Array.isArray(rows) ? rows : [])))
      .catch(() => setSchemes([]))
  }, [selectedServices])

  useEffect(() => {
    if (!schemes.length) return
    if (!selectedServices.includes('scheme')) return
    const s = schemes.find((x) => x.id === schemeIdFromUrl)
      || schemes.find((x) => schemeNameFromUrl && x.name === schemeNameFromUrl)
    if (s) {
      setSpecific((prev) => ({
        ...prev,
        scheme: { schemeId: s.id, schemeName: s.name },
      }))
    }
  }, [schemeIdFromUrl, schemeNameFromUrl, schemes, selectedServices])

  const selectedServicesKey = selectedServices.slice().sort().join(',')

  // Step 4: auto-pull from UIDAI (Aadhaar auth) + DigiLocker
  useEffect(() => {
    if (step !== 4 || !common?.aadhaarRef || !selectedServices.length) return
    let cancelled = false
    async function pullTrustedDocs() {
      setDocsSyncing(true)
      setDocsSyncError(null)
      try {
        const docs = await syncTrustedDocuments(
          common.aadhaarRef,
          selectedServices,
          specific.pension?.pensionType ?? null
        )
        if (cancelled) return
        setVaultDocs((prev) => mergeCafVaultDocs(docs, prev))
        setSelectedDocIds((prev) => {
          const next = new Set(prev)
          for (const d of docs || []) {
            if (d?.id && d.trustedSource) next.add(d.id)
          }
          return next
        })
      } catch {
        if (!cancelled) {
          setDocsSyncError(t('caf.docsSyncError'))
          fetchCitizenDocuments(common.aadhaarRef)
            .then((docs) => {
              if (!cancelled) setVaultDocs((prev) => mergeCafVaultDocs(docs, prev))
            })
            .catch(() => {})
        }
      } finally {
        if (!cancelled) setDocsSyncing(false)
      }
    }
    pullTrustedDocs()
    return () => { cancelled = true }
  }, [step, common?.aadhaarRef, selectedServicesKey, specific.pension?.pensionType])

  const trustedDocs = useMemo(
    () => vaultDocs.filter((d) => d.trustedSource),
    [vaultDocs]
  )
  const manualDocs = useMemo(
    () => vaultDocs.filter((d) => !d.trustedSource),
    [vaultDocs]
  )

  const docValidation = useMemo(() => {
    if (!selectedServices.length) return { missingRequired: [], warnings: [] }
    return validateCafDocuments(selectedServices, vaultDocs, selectedDocIds, specific)
  }, [selectedServices, vaultDocs, selectedDocIds, specific])

  function toggleService(key) {
    if (!selectedServices.includes(key)) {
      const blocking = findBlockingApplication(key, existingApps, specific[key] ?? {})
      if (blocking) {
        setStepError(duplicateBlockMessage(key, { ...blocking, service: key }, t))
        return
      }
    }
    setSelectedServices((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key)
        setSpecific((sp) => {
          const copy = { ...sp }
          delete copy[key]
          return copy
        })
        return next
      }
      setSpecific((sp) => ({ ...sp, [key]: defaultSpecificForService(key) }))
      return [...prev, key]
    })
    setStepError(null)
  }

  function updateSpecific(serviceKey, patch) {
    setSpecific((prev) => ({
      ...prev,
      [serviceKey]: { ...prev[serviceKey], ...patch },
    }))
  }

  function toggleDoc(id) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleUploadNewDoc() {
    if (!uploadFile || !uploadDocType.trim() || !common?.aadhaarRef) return
    if (!uploadFileAllowed(uploadFile)) {
      setUploadError(t('caf.uploadFileTypeError'))
      return
    }
    if (uploadFile.size > 5 * 1024 * 1024) {
      setUploadError(t('caf.uploadSizeError'))
      return
    }
    setUploadError(null)
    setUploading(true)
    try {
      const saved = await uploadCitizenDocument(common.aadhaarRef, uploadDocType.trim(), uploadFile)
      const row = {
        ...saved,
        docType: formatCafDocType(saved.docType || uploadDocType.trim()),
        fileName: saved.fileName || uploadFile.name,
        fileType: saved.fileType || uploadFile.type,
        trustedSource: saved.trustedSource || null,
      }
      setVaultDocs((prev) => [row, ...prev.filter((d) => d.id !== row.id)])
      if (row.id) {
        setSelectedDocIds((prev) => new Set([...prev, row.id]))
      }
      setUploadDocType('')
      setUploadFile(null)
    } catch {
      setUploadError(t('caf.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  function validateStep(currentStep) {
    if (currentStep === 2 && selectedServices.length === 0) {
      return t('caf.selectOneService')
    }
    if (currentStep === 3) {
      for (const key of selectedServices) {
        const err = CAF_SERVICE_CONFIG[key].validateSpecific(specific[key] ?? {})
        if (err) return err
      }
      if (selectedServices.includes('caste') && !common?.casteCategory) {
        return t('caf.casteMissing')
      }
      const dupes = findAllBlocking(selectedServices, existingApps, specific)
      if (dupes.length) {
        return duplicateBlockMessage(dupes[0].serviceKey, { ...dupes[0].app, service: dupes[0].serviceKey }, t)
      }
    }
    if (currentStep === 5) {
      const dupes = findAllBlocking(selectedServices, existingApps, specific)
      if (dupes.length) {
        return duplicateBlockMessage(dupes[0].serviceKey, { ...dupes[0].app, service: dupes[0].serviceKey }, t)
      }
    }
    if (currentStep === 4) {
      if (docsSyncing) return t('caf.fetchingWait')
      const { missingRequired } = validateCafDocuments(
        selectedServices, vaultDocs, selectedDocIds, specific
      )
      if (missingRequired.length) {
        return t('caf.missingDocs', { list: missingRequired.join(', ') })
      }
    }
    return null
  }

  function goNext() {
    const err = validateStep(step)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    setStep((s) => Math.min(5, s + 1))
  }

  function goBack() {
    setStepError(null)
    if (step === 1) navigate('/')
    else setStep((s) => s - 1)
  }

  async function handleSubmitAll() {
    setSubmitting(true)
    setStepError(null)

    const toSubmit = selectedServices.filter((key) => {
      if (findBlockingApplication(key, existingApps, specific[key] ?? {})) return false
      if (key === 'scheme' && schemeBlocked) return false
      return true
    })

    if (toSubmit.length === 0) {
      const dupes = findAllBlocking(selectedServices, existingApps, specific)
      setStepError(
        schemeBlocked && selectedServices.includes('scheme')
          ? t('applyCheck.footerBlocked', 'This application cannot be submitted.')
          : dupes.length
            ? duplicateBlockMessage(dupes[0].serviceKey, { ...dupes[0].app, service: dupes[0].serviceKey }, t)
            : t('caf.noServicesSubmit')
      )
      setSubmitting(false)
      return
    }

    const settled = await Promise.all(
      toSubmit.map(async (serviceKey) => {
        try {
          const data = await submitServiceApplication(
            serviceKey,
            common,
            specific[serviceKey] ?? {}
          )
          saveCitizenApp({
            engineRef: data.engineRef,
            applicationNo: data.applicationNo,
            service: serviceKey,
            aadhaarRef: common.aadhaarRef,
          })
          return { serviceKey, ok: true, data }
        } catch (err) {
          return { serviceKey, ok: false, error: err.message }
        }
      })
    )

    setSubmitResults(settled)
    if (common?.aadhaarRef) {
      fetchMyApplications(common.aadhaarRef).then(setExistingApps).catch(() => {})
    }
    setSubmitting(false)
  }

  const retryFailed = useCallback(async (serviceKey) => {
    setRetryingKey(serviceKey)
    try {
      const data = await submitServiceApplication(
        serviceKey,
        common,
        specific[serviceKey] ?? {}
      )
      saveCitizenApp({
        engineRef: data.engineRef,
        applicationNo: data.applicationNo,
        service: serviceKey,
        aadhaarRef: common.aadhaarRef,
      })
      setSubmitResults((prev) =>
        prev.map((r) =>
          r.serviceKey === serviceKey
            ? { serviceKey, ok: true, data }
            : r
        )
      )
    } catch (err) {
      setSubmitResults((prev) =>
        prev.map((r) =>
          r.serviceKey === serviceKey
            ? { serviceKey, ok: false, error: err.message }
            : r
        )
      )
    } finally {
      setRetryingKey(null)
    }
  }, [common, specific])

  if (profileLoading) {
    return (
      <div className="card form-card">
        <p className="muted">{t('caf.loadingProfile')}</p>
      </div>
    )
  }

  if (profileError || !common) {
    return (
      <div className="card form-card">
        <div className="error-banner">{profileError || t('caf.profileUnavailable')}</div>
        <button type="button" className="btn-ghost small" onClick={() => navigate('/')}>← {t('common.back')}</button>
      </div>
    )
  }

  if (submitResults) {
    const successCount = submitResults.filter((r) => r.ok).length
    return (
      <div className="card confirmation-card caf-result-card">
        <h2 className="confirm-title">
          {successCount === submitResults.length ? '✓ ' : ''}
          {t('caf.submittedTitle', { count: submitResults.length })}
        </h2>
        <p className="muted">
          {t('caf.submittedSummary', { success: successCount, total: submitResults.length, count: submitResults.length })}
        </p>

        <div className="caf-result-rows">
          {submitResults.map((r) => {
            const cfg = CAF_SERVICE_CONFIG[r.serviceKey]
            return (
              <div key={r.serviceKey} className={`caf-result-row${r.ok ? ' ok' : ' fail'}`}>
                <div className="caf-result-row-head">
                  <span className="caf-result-icon">{r.ok ? '✓' : '✗'}</span>
                  <strong>{t(cfg.labelKey)}</strong>
                </div>
                {r.ok ? (
                  <>
                    <div className="tracking-box small caf-tracking-simple">
                      {displayAppNo({ ...r.data, service: r.serviceKey })}
                    </div>
                    <StatusBadge status={r.data.status || 'PENDING'} t={t} />
                  </>
                ) : (
                  <>
                    <p className="error-text small">{r.error}</p>
                    <button
                      type="button"
                      className="btn-primary small"
                      disabled={retryingKey === r.serviceKey}
                      onClick={() => retryFailed(r.serviceKey)}
                    >
                      {retryingKey === r.serviceKey ? t('caf.retrying') : t('caf.retry')}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="caf-result-footer">
          <button type="button" className="caf-track-btn" onClick={() => navigate('/')}>
            {t('caf.trackApps')}
          </button>
        </div>
      </div>
    )
  }

  const incomeDisplay =
    common.annualIncome != null
      ? `₹ ${Number(common.annualIncome).toLocaleString('en-IN')}`
      : null

  return (
    <div className="card form-card caf-wizard">
      <button type="button" className="btn-ghost small caf-back" onClick={goBack}>
        ← {step === 1 ? t('caf.backHome') : t('caf.previousStep')}
      </button>

      <h1 className="page-title">{t('caf.title')}</h1>
      <p className="muted caf-subtitle">
        {t('caf.subtitle')}
      </p>

      <div className="caf-stepper">
        {STEP_KEYS.map((key, i) => (
          <div
            key={key}
            className={`caf-step${step === i + 1 ? ' active' : ''}${step > i + 1 ? ' done' : ''}`}
          >
            <span className="caf-step-num">{i + 1}</span>
            <span className="caf-step-label">{t(`caf.steps.${key}`)}</span>
          </div>
        ))}
      </div>

      {stepError && <div className="error-banner">{stepError}</div>}

      {step === 1 && (
        <section className="caf-step-content">
          <div className="profile-notice">
            🔒 {t('caf.profileNotice')}
          </div>
          <ProfileField label={t('form.fullName')} value={common.name} />
          <ProfileField label={t('form.aadhaarRef')} value={common.aadhaarRef} />
          <ProfileField label={t('form.rationCardNumberRequired')} value={common.rationCardNumber} />
          <ProfileField label={t('caf.district')} value={common.district} />
          <ProfileField label={t('caf.taluka')} value={common.taluka} />
          <ProfileField label={t('caf.villageCity')} value={common.village} />
          <ProfileField label={t('form.casteCategory')} value={common.casteCategory} />
          <ProfileField label={t('form.declaredIncome')} value={incomeDisplay} hint={t('confirmation.familyIncome')} />
          <ProfileField label={t('form.mobile')} value={common.mobile} />
        </section>
      )}

      {step === 2 && (
        <section className="caf-step-content">
          <p className="muted small">{t('caf.selectServicesHint')}</p>
          <div className="apply-page-grid caf-service-grid">
            {getCafServiceTiles().map((tile) => {
              const selected = selectedServices.includes(tile.key)
              const blocking = findBlockingApplication(
                tile.key,
                existingApps,
                specific[tile.key] ?? defaultSpecificForService(tile.key)
              )
              const blocked = !!blocking && !selected
              return (
                <button
                  key={tile.key}
                  type="button"
                  disabled={blocked}
                  className={`apply-page-tile caf-service-tile${selected ? ' selected' : ''}${blocked ? ' blocked' : ''}`}
                  onClick={() => toggleService(tile.key)}
                >
                  <span className="apply-page-tile-icon">{tile.icon}</span>
                  <div className="apply-page-tile-body">
                    <div className="apply-page-tile-name">{t(tile.labelKey)}</div>
                    <div className="apply-page-tile-desc">
                      {blocked
                        ? duplicateBlockMessage(tile.key, { ...blocking, service: tile.key }, t)
                        : t(`descriptions.${tile.key}`)}
                    </div>
                  </div>
                  <span className="caf-tile-check">
                    {blocked ? '⛔' : selected ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="caf-step-content">
          {selectedServices.map((key) => {
            const cfg = CAF_SERVICE_CONFIG[key]
            return (
              <div key={key} className="caf-service-section">
                <div className="form-section-heading">
                  {cfg.icon} {t(cfg.labelKey)}
                </div>

                {key === 'caste' && (
                  <>
                    <ProfileField label={t('form.fullName')} value={common.name} />
                    <ProfileField label={t('form.aadhaarRef')} value={common.aadhaarRef} />
                    <ProfileField label={t('form.casteCategory')} value={common.casteCategory} />
                    <p className="muted small">{t('caf.casteFromRecord')}</p>
                  </>
                )}

                {key === 'pension' && (
                  <>
                    <ProfileField label={t('form.fullName')} value={common.name} />
                    <ProfileField label={t('form.aadhaarRef')} value={common.aadhaarRef} />
                    <ProfileField label={t('form.rationCardNumber')} value={common.rationCardNumber} />
                    <label className="field">
                      {t('form.pensionType')}
                      <select
                        value={specific.pension?.pensionType ?? 'WIDOW'}
                        onChange={(e) => updateSpecific('pension', { pensionType: e.target.value })}
                      >
                        {Object.keys(t('pensionTypes', { returnObjects: true })).map((k) => (
                          <option key={k} value={k}>{t(`pensionTypes.${k}`)}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                {key === 'scheme' && (
                  <>
                    <ProfileField label={t('form.aadhaarRef')} value={common.aadhaarRef} />
                    <ProfileField label={t('form.rationCardNumberRequired')} value={common.rationCardNumber} />
                    <ProfileField label={t('form.declaredIncome')} value={incomeDisplay} />
                    <label className="field">
                      {t('form.schemeId')}
                      <select
                        required
                        value={specific.scheme?.schemeId ?? ''}
                        onChange={(e) => {
                          const s = schemes.find((x) => x.id === e.target.value)
                          updateSpecific('scheme', {
                            schemeId: e.target.value,
                            schemeName: s?.name ?? '',
                          })
                        }}
                      >
                        <option value="">{t('caf.selectScheme')}</option>
                        {schemes.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    <SchemeApplicationCheck
                      schemeId={specific.scheme?.schemeId}
                      familyId={common.familyId}
                      aadhaarRef={common.aadhaarRef}
                      onResult={(data) => setSchemeBlocked(Boolean(data?.blocked || data?.outcome === 'BLOCK'))}
                    />
                  </>
                )}
              </div>
            )
          })}
        </section>
      )}

      {step === 4 && (
        <section className="caf-step-content">
          <div className="profile-notice" style={{ marginBottom: '1rem' }}>
            {t('caf.docsNotice')}
          </div>

          {docsSyncing && (
            <p className="muted caf-docs-syncing">{t('caf.fetchingDocs')}</p>
          )}
          {docsSyncError && <div className="error-banner">{docsSyncError}</div>}

          {!docsSyncing && trustedDocs.length > 0 && (
            <div className="vault-subsection">
              <div className="vault-subsection-title">{t('caf.verifiedDocs')}</div>
              <div className="vault-doc-list">
                {trustedDocs.map((doc) => (
                  <div key={doc.id} className="vault-doc-row trusted-doc-row selected">
                    <span className="vault-doc-icon">{trustedSourceIcon(doc.trustedSource)}</span>
                    <div className="vault-doc-info">
                      <span className="vault-doc-type">{formatCafDocType(doc.docType)}</span>
                      <span className="caf-trusted-badge">{trustedSourceLabel(doc.trustedSource, t)}</span>
                    </div>
                    <span className="caf-trusted-lock" title={t('caf.autoAttached')}>🔒</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualDocs.length > 0 && (
            <div className="vault-subsection" style={{ marginTop: 'var(--space-4)' }}>
              <div className="vault-subsection-title">{t('caf.uploadedDocs')}</div>
              <div className="vault-doc-list">
                {manualDocs.map((doc) => (
                  <label key={doc.id} className={`vault-doc-row${selectedDocIds.has(doc.id) ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    <span className="vault-doc-icon">{fileIcon(doc.fileType)}</span>
                    <div className="vault-doc-info">
                      <span className="vault-doc-type">{formatCafDocType(doc.docType)}</span>
                      <span className="vault-doc-name muted small">
                        {doc.fileName || t('caf.fileAttached')}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {docValidation.warnings.length > 0 && !docsSyncing && (
            <div className="caf-doc-warn" style={{ marginTop: '1rem' }}>
              {t('caf.recommended', { list: docValidation.warnings.join(', ') })}
            </div>
          )}

          <div className="vault-subsection caf-additional-docs" style={{ marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn-ghost small caf-additional-toggle"
              onClick={() => setShowAdditionalUpload((v) => !v)}
            >
              {showAdditionalUpload ? t('caf.hideShort') : t('caf.showUploadToggle')}
            </button>
            {showAdditionalUpload && (
              <>
                <p className="muted small" style={{ margin: '0.75rem 0' }}>
                  {t('caf.uploadAdditionalHint')}
                </p>
                <div className="vault-upload-row">
                  <input
                    type="text"
                    className="vault-doctype-input"
                    placeholder={t('caf.docTypePlaceholder')}
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                  />
                  <label className={`attach-doc-btn${uploadFile ? ' attached' : ''}`}>
                    {uploadFile ? `📎 ${uploadFile.name}` : `📎 ${t('caf.chooseFile')}`}
                    <input
                      type="file"
                      accept={ACCEPTED_UPLOAD}
                      hidden
                      onChange={(e) => { setUploadFile(e.target.files[0] || null); setUploadError(null) }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary small"
                    disabled={!uploadFile || !uploadDocType.trim() || uploading}
                    onClick={handleUploadNewDoc}
                  >
                    {uploading ? t('caf.uploading') : `⬆ ${t('caf.upload')}`}
                  </button>
                </div>
                {uploadError && <p className="error-text small">{uploadError}</p>}
              </>
            )}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="caf-step-content">
          <div className="form-section-heading">{t('caf.commonProfile')}</div>
          <ProfileField label={t('form.fullName')} value={common.name} />
          <ProfileField label={t('form.casteCategory')} value={common.casteCategory} />
          <ProfileField label={t('caf.location')} value={[common.village, common.taluka, common.district].filter(Boolean).join(', ')} />

          {selectedServices.map((key) => {
            const cfg = CAF_SERVICE_CONFIG[key]
            return (
              <div key={key} className="summary-card" style={{ marginTop: '1rem' }}>
                <strong>{t(cfg.labelKey)}</strong>
                <div>{cfg.summaryLine(common, specific[key] ?? {}, t)}</div>
              </div>
            )
          })}

          <div className="summary-card" style={{ marginTop: '1rem' }}>
            <strong>{t('caf.documents')}</strong>
            <div>
              {t('caf.verifiedOnFile', { count: trustedDocs.length })}
              {manualDocs.length > 0 && ` · ${t('caf.additionalUpload', { count: manualDocs.length })}`}
              {' '}{t('caf.linkedAadhaar')}
            </div>
          </div>
        </section>
      )}

      <div className="caf-wizard-nav">
        {step < 5 ? (
          <button type="button" className="btn-primary" onClick={goNext} disabled={step === 4 && docsSyncing}>
            {step === 4 && docsSyncing ? t('caf.fetchingDocsBtn') : t('caf.continue')}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={
              submitting
              || (schemeBlocked && selectedServices.includes('scheme') && selectedServices.every((k) => k === 'scheme'))
            }
            onClick={handleSubmitAll}
          >
            {submitting ? t('form.submitting') : t('caf.submitAll')}
          </button>
        )}
      </div>
    </div>
  )
}
