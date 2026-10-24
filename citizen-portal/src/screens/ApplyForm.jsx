import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { APIs, apiForService, fetchApplicationStatus, fetchMyApplications, saveCitizenApp, displayAppNo, fileToBase64, fetchCitizenDocuments, uploadCitizenDocument, fetchDocumentData, fetchFamily } from '../api'
import { pinDemoSchemeFirst } from '../reasonUtils'
import { loadCitizenProfile } from '../auth'
import { duplicateBlockMessage, findBlockingApplication } from '../caf/cafDuplicateCheck'
import { cafVisibleFileName, formatCafDocType } from '../caf/cafDocumentConfig'
import SchemeApplicationCheck from '../components/SchemeApplicationCheck'
import { ageFromDob } from '../utils/familyAccess'

const OLD_AGE_MIN = 60

const ACCEPTED_UPLOAD = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx'
const ACCEPTED_MIME   = ['application/pdf','image/jpeg','image/png','image/gif',
                         'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function fileIcon(type) {
  if (!type) return '📎'
  if (type === 'application/pdf') return '📄'
  if (type.startsWith('image/')) return '🖼️'
  if (type.includes('word')) return '📝'
  return '📎'
}

// Shows a value that came from the official profile — not editable
function ProfileField({ label, value, hint }) {
  if (!value && value !== 0) return null
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

function ProgressSteps({ status, t }) {
  const step = status === 'APPROVED' ? 3 : status === 'PENDING' || status === 'PENDINGAPPROVAL' ? 2 : 1
  return (
    <div className="progress-steps">
      {[1, 2, 3].map((n) => (
        <div key={n} className={`progress-step ${step >= n ? 'filled' : ''} ${step === n ? 'active' : ''}`}>
          <div className="step-dot">{n}</div>
          <span>{n === 1 ? t('steps.apply') : n === 2 ? t('steps.review') : t('steps.approved')}</span>
        </div>
      ))}
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

export default function ApplyForm({ service }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const profile = loadCitizenProfile()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [liveStatus, setLiveStatus] = useState(null)
  const [schemes, setSchemes] = useState([])
  const [rationCardNumber, setRationCardNumber] = useState(profile?.rationCardNumber || '')

  // Editable fields — only what the user must actually choose
  const [casteCode, setCasteCode] = useState(profile?.casteCategory || 'OBC')
  const [pensionType, setPensionType] = useState('OLD_AGE')

  // Marriage — groom details (bride = logged-in user)
  const [groomName, setGroomName] = useState('')
  const [groomAadhaar, setGroomAadhaar] = useState('')
  const [marriageDate, setMarriageDate] = useState('')
  const [witnessName, setWitnessName] = useState('')

  // Family member change
  const [changeType, setChangeType] = useState('ADD')
  const [personName, setPersonName] = useState('')
  const [personId, setPersonId] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('M')
  const [relationship, setRelationship] = useState('OTHER')
  const [occupation, setOccupation] = useState('')
  const [income, setIncome] = useState('')
  const [casteCategory, setCasteCategory] = useState(profile?.casteCategory || 'OBC')
  const [mobile, setMobile] = useState('')
  const [reason, setReason] = useState('')

  // Document vault
  const [vaultDocs, setVaultDocs] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [uploadDocType, setUploadDocType] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile?.aadhaarRef) return
    fetchCitizenDocuments(profile.aadhaarRef).then(setVaultDocs).catch(() => {})
  }, [profile?.aadhaarRef])

  useEffect(() => {
    if (!profile?.familyId) return
    fetchFamily(profile.familyId)
      .then((f) => { if (f?.rationCardNumber) setRationCardNumber(f.rationCardNumber) })
      .catch(() => {})
  }, [profile?.familyId])

  function toggleDoc(id) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleUploadNewDoc() {
    if (!uploadFile || !uploadDocType.trim()) return
    if (!ACCEPTED_MIME.includes(uploadFile.type)) {
      setUploadError('File type not allowed. Use PDF, JPG, PNG, GIF, Word.')
      return
    }
    if (uploadFile.size > 5 * 1024 * 1024) {
      setUploadError('File must be under 5 MB.')
      return
    }
    setUploadError(null)
    setUploading(true)
    try {
      const saved = await uploadCitizenDocument(profile.aadhaarRef, uploadDocType.trim(), uploadFile)
      setVaultDocs((prev) => [saved, ...prev])
      setSelectedDocIds((prev) => new Set([...prev, saved.id]))
      setUploadDocType('')
      setUploadFile(null)
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Scheme
  const [schemeId, setSchemeId] = useState(searchParams.get('schemeId') || '')
  const [schemeName, setSchemeName] = useState('')
  const [schemeBlocked, setSchemeBlocked] = useState(false)
  const [declaredIncome, setDeclaredIncome] = useState(
    profile?.annualIncome != null ? String(profile.annualIncome) : ''
  )

  useEffect(() => {
    if (service === 'scheme') {
      fetch(`${APIs.schemeEngine}/v1/schemes`)
        .then((r) => r.json())
        .then((rows) => setSchemes(pinDemoSchemeFirst(Array.isArray(rows) ? rows : [])))
        .catch(() => setSchemes([]))
    }
  }, [service])

  useEffect(() => {
    if (schemeId && schemes.length) {
      const s = schemes.find((x) => x.id === schemeId)
      if (s) setSchemeName(s.name)
    }
  }, [schemeId, schemes])

  const applicantAge = ageFromDob(profile?.dob)
  const pensionAgeBlocked =
    service === 'pension' && pensionType === 'OLD_AGE' && applicantAge != null && applicantAge < OLD_AGE_MIN
  const submitBlocked = (service === 'scheme' && schemeBlocked) || pensionAgeBlocked

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitBlocked) {
      setError(t('applyCheck.footerBlocked', 'This application cannot be submitted.'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (profile?.aadhaarRef && ['caste', 'pension', 'scheme'].includes(service)) {
        const existing = await fetchMyApplications(profile.aadhaarRef)
        const specific =
          service === 'pension'
            ? { pensionType }
            : service === 'scheme'
              ? { schemeId }
              : {}
        const blocking = findBlockingApplication(service, existing, specific)
        if (blocking) {
          setError(duplicateBlockMessage(service, { ...blocking, service }, t))
          return
        }
      }

      const base = apiForService(service)
      let body

      if (service === 'caste') {
        body = {
          applicantName: profile?.name,
          casteCode,
          tenantId: 'pg',
          aadhaarRef: profile?.aadhaarRef || null,
        }
      } else if (service === 'marriage') {
        body = {
          applicantName: profile?.name,
          casteCode: groomName,
          tenantId: 'pg',
        }
      } else if (service === 'pension') {
        body = {
          applicantName: profile?.name,
          pensionType,
          aadhaarRef: profile?.aadhaarRef,
          familyId: profile?.familyId || null,
          tenantId: 'pg',
        }
      } else if (service === 'familyMb') {
        body = {
          familyId: profile?.familyId,
          changeType,
          personName,
          personId,
          dob,
          gender,
          relationshipToHead: relationship,
          occupation,
          annualIncome: income,
          casteCategory,
          mobile,
          reason,
          tenantId: 'pg',
        }
      } else {
        body = {
          schemeId,
          schemeName,
          familyId: profile?.familyId,
          aadhaarRef: profile?.aadhaarRef,
          declaredIncome: Number(declaredIncome),
          tenantId: 'pg',
        }
      }

      // Fetch full data for selected vault documents, then attach
      const vaultSelected = await Promise.all(
        [...selectedDocIds].map((id) => fetchDocumentData(id).catch(() => null))
      )
      const attachedDocs = vaultSelected
        .filter(Boolean)
        .map((d) => ({ name: d.fileName, type: d.fileType, data: d.fileData }))
      if (attachedDocs.length) body.attachments = attachedDocs

      const res = await fetch(`${base}/v1/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Submit failed (HTTP ${res.status})`)
      const data = await res.json()
      saveCitizenApp({
        engineRef: data.engineRef,
        applicationNo: data.applicationNo,
        service,
        aadhaarRef: profile?.aadhaarRef,
      })
      setResult({ ...data, service })
      setLiveStatus(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function checkStatus() {
    if (!result) return
    try {
      const data = await fetchApplicationStatus(result.service, result.engineRef)
      setLiveStatus(data)
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Confirmation screen ──
  if (result) {
    const status = liveStatus?.status || result.status
    return (
      <div className="card confirmation-card">
        <ProgressSteps status={status} t={t} />
        <h2 className="confirm-title">✓ {t('confirmation.title')}</h2>
        <p className="muted">{t('confirmation.trackingLabel')}</p>
        <div className="tracking-box">{displayAppNo(result)}</div>
        <StatusBadge status={status} t={t} />
        {status === 'PENDING' && liveStatus?.currentTask && (
          <p>{t('confirmation.currentlyAt')}: {liveStatus.currentTask}</p>
        )}
        {status === 'APPROVED' && <p className="success-msg">{t('confirmation.approved')}</p>}
        {status === 'ESCALATED' && <p className="error-msg">{t('confirmation.escalated')}</p>}
        <div className="summary-card">
          <strong>{t(`services.${service}`)}</strong>
          {service === 'caste' && <div>{profile?.name} · {casteCode}</div>}
          {service === 'marriage' && <div>{profile?.name} & {groomName}</div>}
          {service === 'pension' && <div>{profile?.name} · {t(`pensionTypes.${pensionType}`)}</div>}
          {service === 'scheme' && <div>{schemeName} · {rationCardNumber}</div>}
        </div>
        <div className="btn-row">
          <button type="button" className="btn-primary" onClick={checkStatus}>{t('confirmation.checkStatus')}</button>
        </div>
      </div>
    )
  }

  // ── Apply form ──
  return (
    <div className="card form-card">
      <button type="button" className="btn-ghost small" style={{ marginBottom: '1rem' }} onClick={() => navigate('/apply')}>
        ← Back
      </button>
      <h1 className="page-title">{t(`services.${service}`)}</h1>

      <div className="profile-notice">
        🔒 Fields marked with a lock are pre-filled from your Aadhaar profile and cannot be changed here.
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="apply-form">

        {/* ── Caste Certificate ── */}
        {service === 'caste' && (
          <>
            <ProfileField label={t('form.fullName')} value={profile?.name} />
            <ProfileField label={t('form.aadhaarRef')} value={profile?.aadhaarRef} />
            <label className="field">
              {t('form.casteCategory')}
              <select value={casteCode} onChange={(e) => setCasteCode(e.target.value)}>
                {t('castes', { returnObjects: true }).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </>
        )}

        {/* ── Marriage Certificate ── */}
        {service === 'marriage' && (
          <>
            <div className="form-section-heading">Your details (Bride / Applicant)</div>
            <ProfileField label={t('form.fullName')} value={profile?.name} />
            <ProfileField label={t('form.aadhaarRef')} value={profile?.aadhaarRef} />
            <div className="form-section-heading" style={{ marginTop: '1rem' }}>Groom details</div>
            <label className="field">
              {t('form.groomName')}
              <input required value={groomName} onChange={(e) => setGroomName(e.target.value)} />
            </label>
            <label className="field">
              {t('form.groomAadhaar')}
              <input required value={groomAadhaar} onChange={(e) => setGroomAadhaar(e.target.value)} />
            </label>
            <label className="field">
              {t('form.marriageDate')}
              <input type="date" required value={marriageDate} onChange={(e) => setMarriageDate(e.target.value)} />
            </label>
            <label className="field">
              {t('form.witness')}
              <input required value={witnessName} onChange={(e) => setWitnessName(e.target.value)} />
            </label>
          </>
        )}

        {/* ── Pension Application ── */}
        {service === 'pension' && (
          <>
            <ProfileField label={t('form.fullName')} value={profile?.name} />
            <ProfileField label={t('form.aadhaarRef')} value={profile?.aadhaarRef} />
            <ProfileField label={t('form.rationCardNumberRequired')} value={rationCardNumber} />
            <label className="field">
              {t('form.pensionType')}
              <select value={pensionType} onChange={(e) => setPensionType(e.target.value)}>
                {Object.keys(t('pensionTypes', { returnObjects: true })).map((k) => (
                  <option key={k} value={k}>{t(`pensionTypes.${k}`)}</option>
                ))}
              </select>
            </label>
            {pensionAgeBlocked && (
              <div className="error-banner" role="alert">
                {t('applyCheck.oldAgeBlocked', {
                  name: profile?.name || 'You',
                  age: applicantAge,
                  min: OLD_AGE_MIN,
                  defaultValue: `${profile?.name || 'You'} is ${applicantAge} years old. Old Age Pension is only for citizens aged ${OLD_AGE_MIN} or above. This application cannot be submitted.`,
                })}
              </div>
            )}
          </>
        )}

        {/* ── Family Member Change ── */}
        {service === 'familyMb' && (
          <>
            <ProfileField label={t('form.rationCardNumberRequired')} value={rationCardNumber} />
            <label className="field">
              {t('form.changeType')}
              <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
                {Object.keys(t('changeTypes', { returnObjects: true })).map((k) => (
                  <option key={k} value={k}>{t(`changeTypes.${k}`)}</option>
                ))}
              </select>
            </label>
            {changeType === 'ADD' ? (
              <>
                <label className="field">{t('form.personName')}<input required value={personName} onChange={(e) => setPersonName(e.target.value)} /></label>
                <label className="field">{t('form.dob')}<input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></label>
                <label className="field">
                  {t('form.gender')}
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="M">{t('genders.M')}</option>
                    <option value="F">{t('genders.F')}</option>
                  </select>
                </label>
                <label className="field">
                  {t('form.relationship')}
                  <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                    {Object.keys(t('relationships', { returnObjects: true })).map((k) => (
                      <option key={k} value={k}>{t(`relationships.${k}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">{t('form.occupation')}<input value={occupation} onChange={(e) => setOccupation(e.target.value)} /></label>
                <label className="field">{t('form.income')}<input type="number" value={income} onChange={(e) => setIncome(e.target.value)} /></label>
                <label className="field">
                  {t('form.casteCategory')}
                  <select value={casteCategory} onChange={(e) => setCasteCategory(e.target.value)}>
                    {t('castes', { returnObjects: true }).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">{t('form.mobile')}<input value={mobile} onChange={(e) => setMobile(e.target.value)} /></label>
              </>
            ) : (
              <label className="field">{t('form.personId')}<input required value={personId} onChange={(e) => setPersonId(e.target.value)} /></label>
            )}
            <label className="field">{t('form.reason')}<input required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </>
        )}

        {/* ── Scheme Application ── */}
        {service === 'scheme' && (
          <>
            <ProfileField label={t('form.aadhaarRef')} value={profile?.aadhaarRef} />
            <ProfileField label={t('form.rationCardNumberRequired')} value={rationCardNumber} />
            <ProfileField
              label={t('form.declaredIncome')}
              value={profile?.annualIncome != null ? `₹ ${Number(profile.annualIncome).toLocaleString('en-IN')}` : null}
              hint="From your family record — update if changed"
            />
            {profile?.annualIncome == null && (
              <label className="field">
                {t('form.declaredIncome')}
                <input type="number" required value={declaredIncome} onChange={(e) => setDeclaredIncome(e.target.value)} />
              </label>
            )}
            <label className="field">
              {t('form.schemeId')}
              <select required value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                <option value="">— Select a scheme —</option>
                {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <SchemeApplicationCheck
              schemeId={schemeId}
              familyId={profile?.familyId}
              aadhaarRef={profile?.aadhaarRef}
              onResult={(data) => setSchemeBlocked(Boolean(data?.blocked || data?.outcome === 'BLOCK'))}
            />
          </>
        )}

        {/* ── Supporting Documents ── */}
        <div className="attach-docs-section">
          <div className="form-section-heading" style={{ marginBottom: 'var(--space-3)' }}>
            Supporting Documents
          </div>

          {/* Available in system */}
          <div className="vault-subsection">
            <div className="vault-subsection-title">Available documents in system</div>
            {vaultDocs.length === 0 ? (
              <p className="muted small">No documents on file yet. Upload below to add.</p>
            ) : (
              <div className="vault-doc-list">
                {vaultDocs.map((doc) => (
                  <label key={doc.id} className={`vault-doc-row${selectedDocIds.has(doc.id) ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    <span className="vault-doc-icon">{fileIcon(doc.fileType)}</span>
                    <div className="vault-doc-info">
                      <span className="vault-doc-type">{formatCafDocType(doc.docType)}</span>
                      {cafVisibleFileName(doc.fileName) ? (
                        <span className="vault-doc-name muted small">{cafVisibleFileName(doc.fileName)}</span>
                      ) : null}
                    </div>
                    <span className="vault-doc-date muted small">
                      {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Upload new document */}
          <div className="vault-subsection" style={{ marginTop: 'var(--space-4)' }}>
            <div className="vault-subsection-title">Upload document</div>
            <p className="muted small" style={{ marginBottom: 'var(--space-3)' }}>
              Accepted: PDF, JPG, PNG, GIF, Word · max 5 MB
            </p>
            <div className="vault-upload-row">
              <input
                type="text"
                className="vault-doctype-input"
                placeholder="Document type (e.g. Aadhaar, Income Certificate…)"
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
              />
              <label className={`attach-doc-btn${uploadFile ? ' attached' : ''}`}>
                {uploadFile ? `📎 ${uploadFile.name}` : '📎 Choose file'}
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
                {uploading ? 'Saving…' : '⬆ Save to system'}
              </button>
            </div>
            {uploadError && <p className="error-text small" style={{ marginTop: 'var(--space-2)' }}>{uploadError}</p>}
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={submitting || submitBlocked}>
          {submitting ? t('form.submitting') : t('form.submit')}
        </button>
      </form>
    </div>
  )
}
