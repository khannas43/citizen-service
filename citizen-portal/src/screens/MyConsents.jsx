import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { APIs, fetchConsents, revokeConsent, restoreConsent, fetchDataExport, submitGrievance, fetchCitizenDocuments, uploadCitizenDocument, fetchDocumentData } from '../api'
import { cafVisibleFileName, formatCafDocType } from '../caf/cafDocumentConfig'

const ACCEPTED_UPLOAD = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx'
const ACCEPTED_MIME = ['application/pdf','image/jpeg','image/png','image/gif',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(n) {
  if (n == null) return '—'
  return '₹ ' + Number(n).toLocaleString('en-IN')
}

function genderLabel(g, t) {
  return { M: t('consents.genderM'), F: t('consents.genderF'), O: t('consents.genderO') }[g] || g
}

function relationshipLabel(r, t) {
  const map = {
    HEAD: t('consents.relHead'), SPOUSE: t('consents.relSpouse'), SON: t('consents.relSon'),
    DAUGHTER: t('consents.relDaughter'), FATHER: t('consents.relFather'), MOTHER: t('consents.relMother'),
    MOTHER_IN_LAW: t('consents.relMotherInLaw'),
    OTHER: t('consents.relOther'),
  }
  return map[r] || r
}

const UPDATE_FIELDS = [
  { labelKey: 'consents.fieldName', key: 'name' },
  { labelKey: 'consents.fieldDob', key: 'dob' },
  { labelKey: 'consents.fieldGender', key: 'gender' },
  { labelKey: 'consents.fieldMobile', key: 'mobile' },
  { labelKey: 'consents.fieldOccupation', key: 'occupation' },
  { labelKey: 'consents.fieldAnnualIncome', key: 'annualIncome' },
  { labelKey: 'consents.fieldCasteCategory', key: 'casteCategory' },
  { labelKey: 'consents.fieldAddress', key: 'address' },
  { labelKey: 'consents.fieldVillage', key: 'village' },
  { labelKey: 'consents.fieldTaluka', key: 'taluka' },
  { labelKey: 'consents.fieldDistrict', key: 'district' },
]

const DPDP_RIGHT_COUNT = 5

// ── My Data tab ──────────────────────────────────────────────────────────────
function MyDataTab({ profile }) {
  const { t } = useTranslation()
  const [person, setPerson] = useState(null)
  const [family, setFamily] = useState(null)
  const [loadingPerson, setLoadingPerson] = useState(true)
  const [updateModal, setUpdateModal] = useState(false)
  const [updateField, setUpdateField] = useState('')
  const [updateCurrent, setUpdateCurrent] = useState('')
  const [updateRequested, setUpdateRequested] = useState('')
  const [updateReason, setUpdateReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // document vault
  const [vaultDocs, setVaultDocs] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [uploadDocType, setUploadDocType] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile?.aadhaarRef) { setLoadingPerson(false); return }
    // fetch person record
    fetch(`${APIs.family}/v1/persons/search?aadhaar=${encodeURIComponent(profile.aadhaarRef)}`)
      .then((r) => r.ok ? r.json() : { results: [] })
      .then((data) => {
        const list = data.results ?? data
        if (Array.isArray(list) && list.length) setPerson(list[0])
      })
      .finally(() => setLoadingPerson(false))
  }, [profile?.aadhaarRef])

  useEffect(() => {
    if (!profile?.familyId) return
    fetch(`${APIs.family}/v1/families/${profile.familyId}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setFamily)
      .catch(() => {})
  }, [profile?.familyId])

  useEffect(() => {
    if (!profile?.aadhaarRef) return
    fetchCitizenDocuments(profile.aadhaarRef).then(setVaultDocs).catch(() => {})
  }, [profile?.aadhaarRef])

  const p = person || {}
  const f = family || {}

  function currentValueFor(fieldKey) {
    if (!fieldKey) return ''
    const src = { name: p.name, dob: p.dob ? new Date(p.dob).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      gender: genderLabel(p.gender, t) || p.gender || '', mobile: p.mobile || profile?.mobile || '',
      occupation: p.occupation || '', annualIncome: p.annualIncome != null ? '₹ ' + Number(p.annualIncome).toLocaleString('en-IN') : '',
      casteCategory: p.casteCategory || '', address: f.address || '', village: f.village || '',
      taluka: f.taluka || '', district: f.district || '',
    }
    return src[fieldKey] || ''
  }

  function handleFieldChange(fieldKey) {
    setUpdateField(fieldKey)
    setUpdateCurrent(currentValueFor(fieldKey))
  }

  function toggleDocId(id) {
    setSelectedDocIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function handleUploadDoc() {
    if (!uploadFile || !uploadDocType.trim()) return
    if (!ACCEPTED_MIME.includes(uploadFile.type)) { setUploadError(t('consents.fileTypeError')); return }
    if (uploadFile.size > 5 * 1024 * 1024) { setUploadError(t('consents.fileSizeError')); return }
    setUploadError(''); setUploading(true)
    try {
      const doc = await uploadCitizenDocument(profile.aadhaarRef, uploadDocType.trim(), uploadFile)
      setVaultDocs((prev) => [doc, ...prev])
      setSelectedDocIds((prev) => new Set([...prev, doc.id]))
      setUploadDocType(''); setUploadFile(null)
    } catch { setUploadError(t('consents.uploadFailed')) }
    finally { setUploading(false) }
  }

  const rows = [
    { label: t('consents.fullName'),           value: p.name || profile?.name },
    { label: t('consents.aadhaarNumber'),      value: p.aadhaarRef || profile?.aadhaarRef, mono: true },
    { label: t('consents.dob'),       value: formatDate(p.dob) },
    { label: t('consents.gender'),              value: genderLabel(p.gender, t) || p.gender },
    { label: t('consents.mobile'),              value: p.mobile || profile?.mobile },
    { label: t('consents.occupation'),          value: p.occupation },
    { label: t('consents.annualIncome'),       value: formatCurrency(p.annualIncome) },
    { label: t('consents.casteCategory'),      value: p.casteCategory },
    { label: t('consents.education'),           value: p.educationLevel },
    { label: t('consents.maritalStatus'),      value: p.maritalStatus },
    { label: t('consents.employment'),          value: p.employmentStatus },
    { label: t('consents.relationshipInFamily'), value: relationshipLabel(p.relationshipToHead, t) || p.relationshipToHead },
    { label: t('consents.rationCardNumber'),   value: f.rationCardNumber || profile?.rationCardNumber, mono: true },
  ]

  const addressRows = [
    { label: t('consents.fieldAddress'),  value: f.address },
    { label: t('consents.village'),  value: f.village },
    { label: t('consents.taluka'),   value: f.taluka },
    { label: t('consents.district'), value: f.district },
    { label: t('consents.state'),    value: f.state },
  ]

  async function handleSubmitUpdate(e) {
    e.preventDefault()
    if (!updateField || !updateRequested.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const fieldLabel = UPDATE_FIELDS.find((f) => f.key === updateField) ? t(UPDATE_FIELDS.find((f) => f.key === updateField).labelKey) : updateField
      const attachments = await Promise.all(
        [...selectedDocIds].map((id) => fetchDocumentData(id))
      )
      await submitGrievance(
        profile.aadhaarRef,
        profile.name,
        null,
        `Data Update Request\n\nField: ${fieldLabel}\nCurrent value: ${updateCurrent || 'Unknown'}\nRequested correction: ${updateRequested}\nReason: ${updateReason}`,
        'WRONG_INFORMATION',
        'NORMAL',
        attachments.filter(Boolean).map((d) => ({ name: d.fileName, type: d.fileType, data: d.fileData }))
      )
      setSubmitted(true)
      setUpdateModal(false)
      setUpdateField('')
      setUpdateCurrent('')
      setUpdateRequested('')
      setUpdateReason('')
      setSelectedDocIds(new Set())
    } catch {
      setSubmitError(t('consents.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingPerson) return <p className="muted" style={{ padding: '1rem 0' }}>{t('consents.loading')}</p>

  return (
    <div className="mydata-page">
      {submitted && (
        <div className="mydata-toast">
          ✅ {t('consents.updateSubmitted')}
        </div>
      )}

      {/* Personal info */}
      <section className="mydata-section card">
        <div className="mydata-section-header">
          <h3 className="mydata-section-title">👤 {t('consents.personalInfo')}</h3>
          <button type="button" className="btn-secondary small" onClick={() => setUpdateModal(true)}>
            ✏️ {t('consents.requestUpdate')}
          </button>
        </div>
        <table className="mydata-table">
          <tbody>
            {rows.map(({ label, value, mono }) => (
              <tr key={label}>
                <td className="mydata-label">{label}</td>
                <td className={`mydata-value${mono ? ' mono-cell' : ''}`}>{value || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Address */}
      <section className="mydata-section card" style={{ marginTop: 'var(--space-4)' }}>
        <h3 className="mydata-section-title">🏠 {t('consents.address')}</h3>
        <table className="mydata-table">
          <tbody>
            {addressRows.map(({ label, value }) => (
              <tr key={label}>
                <td className="mydata-label">{label}</td>
                <td className="mydata-value">{value || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Family members */}
      {family?.members?.length > 0 && (
        <section className="mydata-section card" style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="mydata-section-title">👨‍👩‍👧 {t('consents.familyMembers')}</h3>
          <div className="complaints-table-wrap" style={{ marginTop: 'var(--space-3)' }}>
            <table className="complaints-table">
              <thead>
                <tr>
                  <th>{t('consents.name')}</th>
                  <th>{t('consents.relationship')}</th>
                  <th>{t('consents.dob')}</th>
                  <th>{t('consents.gender')}</th>
                  <th>{t('consents.occupation')}</th>
                </tr>
              </thead>
              <tbody>
                {family.members.map((m) => (
                  <tr key={m.id} className={!m.isAlive ? 'mydata-deceased' : ''}>
                    <td>
                      {m.name}
                      {!m.isAlive && <span className="muted small" style={{ marginLeft: '0.4rem' }}>({t('consents.deceased')})</span>}
                    </td>
                    <td>{relationshipLabel(m.relationshipToHead, t) || m.relationshipToHead}</td>
                    <td className="muted">{formatDate(m.dob)}</td>
                    <td>{genderLabel(m.gender, t) || m.gender}</td>
                    <td className="muted">{m.occupation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Update request modal */}
      {updateModal && (
        <div className="modal-overlay" onClick={() => setUpdateModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="complaints-modal-header">
              <h2 style={{ margin: 0 }}>{t('consents.updateModalTitle')}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setUpdateModal(false)}>✕</button>
            </div>
            <p className="muted small" style={{ marginBottom: 'var(--space-4)' }}>
              {t('consents.updateModalHint')}
            </p>
            <form onSubmit={handleSubmitUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <label className="field">
                {t('consents.whichField')} *
                <select required value={updateField} onChange={(e) => handleFieldChange(e.target.value)}>
                  <option value="">{t('consents.selectField')}</option>
                  {UPDATE_FIELDS.map((f) => <option key={f.key} value={f.key}>{t(f.labelKey)}</option>)}
                </select>
              </label>
              <label className="field">
                {t('consents.currentValue')}
                <input
                  type="text"
                  placeholder={t('consents.currentPlaceholder')}
                  value={updateCurrent}
                  onChange={(e) => setUpdateCurrent(e.target.value)}
                />
              </label>
              <label className="field">
                {t('consents.correctValue')} *
                <input
                  required
                  type="text"
                  placeholder={t('consents.correctPlaceholder')}
                  value={updateRequested}
                  onChange={(e) => setUpdateRequested(e.target.value)}
                />
              </label>
              <label className="field">
                {t('consents.reasonNotes')}
                <textarea
                  rows={3}
                  placeholder={t('consents.reasonPlaceholder')}
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                />
              </label>

              {/* Supporting documents */}
              <div className="attach-docs-section">
                <div className="vault-subsection-title">{t('consents.supportingDocs')}</div>
                {vaultDocs.length > 0 && (
                  <div className="vault-subsection">
                    <div className="vault-doc-list">
                      {vaultDocs.map((d) => (
                        <label key={d.id} className={`vault-doc-row${selectedDocIds.has(d.id) ? ' selected' : ''}`}>
                          <input type="checkbox" checked={selectedDocIds.has(d.id)} onChange={() => toggleDocId(d.id)} />
                          <span className="vault-doc-icon">📎</span>
                          <span className="vault-doc-info">
                            <span className="vault-doc-type">{formatCafDocType(d.docType)}</span>
                            {cafVisibleFileName(d.fileName) ? (
                              <span className="vault-doc-name">{cafVisibleFileName(d.fileName)}</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="vault-subsection">
                  <div className="vault-upload-row">
                    <input
                      type="text"
                      className="vault-doctype-input"
                      placeholder={t('consents.docTypePlaceholder')}
                      value={uploadDocType}
                      onChange={(e) => setUploadDocType(e.target.value)}
                    />
                    <input
                      type="file"
                      accept={ACCEPTED_UPLOAD}
                      onChange={(e) => setUploadFile(e.target.files[0] || null)}
                      style={{ flex: 1, fontSize: '0.82rem' }}
                    />
                    <button
                      type="button"
                      className="attach-doc-btn"
                      disabled={uploading || !uploadFile || !uploadDocType.trim()}
                      onClick={handleUploadDoc}
                    >
                      {uploading ? '…' : t('common.save')}
                    </button>
                  </div>
                  <p className="muted" style={{ fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                    {t('consents.allowedFiles')}
                  </p>
                  {uploadError && <p className="error-text" style={{ marginTop: '0.25rem' }}>{uploadError}</p>}
                </div>
              </div>

              {submitError && <p className="error-text">{submitError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setUpdateModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={submitting || !updateField || !updateRequested.trim()}>
                  {submitting ? t('complaints.submitting') : t('consents.submitRequest')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Consents tab ─────────────────────────────────────────────────────────────

// ── Consent Card ─────────────────────────────────────────────────────────────
function ConsentCard({ consent, aadhaarRef, onUpdated }) {
  const { t } = useTranslation()
  const [acting, setActing] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const isRevoked = consent.status === 'REVOKED'

  async function handleRevoke() {
    setActing(true)
    try {
      const updated = await revokeConsent(aadhaarRef, consent.id)
      onUpdated(updated)
    } catch { /* silently */ }
    finally { setActing(false) }
  }

  async function handleRestore() {
    setActing(true)
    try {
      const updated = await restoreConsent(aadhaarRef, consent.id)
      onUpdated(updated)
    } catch { /* silently */ }
    finally { setActing(false) }
  }

  return (
    <div className={`consent-card${isRevoked ? ' consent-card--revoked' : ''}`}>
      <div className="consent-card-header">
        <div className="consent-card-dept">
          <span className="consent-dept-icon">🏛</span>
          <strong>{consent.department}</strong>
        </div>
        <span className={`cert-status-pill ${isRevoked ? 'cert-pill--pending' : 'cert-pill--issued'}`}>
          {isRevoked ? t('consents.revoked') : `● ${t('consents.activeStatus')}`}
        </span>
      </div>

      <div className="consent-meta-grid">
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('consents.dataShared')}</span>
          <span className="cert-meta-value">{consent.dataCategory}</span>
        </div>
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('consents.purpose')}</span>
          <span className="cert-meta-value">{consent.purpose}</span>
        </div>
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('consents.consentGiven')}</span>
          <span className="cert-meta-value">{formatDate(consent.grantedAt)}</span>
        </div>
        {consent.revokedAt && (
          <div className="consent-meta-row">
            <span className="cert-meta-label">{t('consents.revokedOn')}</span>
            <span className="cert-meta-value">{formatDate(consent.revokedAt)}</span>
          </div>
        )}
        {!isRevoked && (
          <div className="consent-meta-row">
            <span className="cert-meta-label">{t('consents.validUntil')}</span>
            <span className="cert-meta-value">
              {consent.grantedAt
                ? new Date(new Date(consent.grantedAt).setFullYear(new Date(consent.grantedAt).getFullYear() + 1))
                    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </span>
          </div>
        )}
      </div>

      <div className="consent-card-footer">
        <button
          type="button"
          className="cert-action-btn"
          onClick={() => setShowLogs((v) => !v)}
        >
          {showLogs ? t('consents.hideLogs') : t('consents.viewLogs')}
        </button>
        {!isRevoked ? (
          <button
            type="button"
            className="cert-action-btn consent-btn--revoke"
            disabled={acting}
            onClick={handleRevoke}
          >
            {acting ? '…' : t('consents.revoke')}
          </button>
        ) : (
          <button
            type="button"
            className="cert-action-btn"
            disabled={acting}
            onClick={handleRestore}
          >
            {acting ? '…' : t('consents.restore')}
          </button>
        )}
      </div>

      {showLogs && (
        <div className="consent-logs-box muted small">
          <div className="consent-log-row">
            <span>{formatDate(consent.grantedAt)}</span>
            <span>{t('consents.logGranted')}</span>
          </div>
          {!isRevoked && (
            <div className="consent-log-row">
              <span>{t('consents.last30Days')}</span>
              <span>{t('consents.logAccessed')}</span>
            </div>
          )}
          {isRevoked && consent.revokedAt && (
            <div className="consent-log-row">
              <span>{formatDate(consent.revokedAt)}</span>
              <span>{t('consents.logRevoked')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Consents & Rights Tab ────────────────────────────────────────────────────
function ConsentsTab({ profile }) {
  const { t } = useTranslation()
  const [consents, setConsents] = useState([])
  const [loading, setLoading] = useState(true)
  const [openRight, setOpenRight] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!profile?.aadhaarRef) { setLoading(false); return }
    fetchConsents(profile.aadhaarRef)
      .then(setConsents)
      .finally(() => setLoading(false))
  }, [profile?.aadhaarRef])

  function handleUpdated(updated) {
    setConsents((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  const active  = consents.filter((c) => c.status !== 'REVOKED')
  const revoked = consents.filter((c) => c.status === 'REVOKED')

  const depts = new Set(consents.map((c) => c.department)).size
  const lastReviewed = consents.length
    ? new Date(Math.max(...consents.map((c) => new Date(c.grantedAt || 0)))).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  async function handleDownload() {
    if (!profile?.aadhaarRef) return
    setDownloading(true)
    try {
      const data = await fetchDataExport(profile.aadhaarRef)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `digital-gujarat-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { /* silently fail */ }
    finally { setDownloading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* ── Summary strip ── */}
      <div className="consent-summary-strip">
        {[
          { value: depts,          label: t('consents.departments') },
          { value: active.length,  label: t('consents.activeConsents') },
          { value: revoked.length, label: t('consents.revokedConsents') },
          { value: lastReviewed,   label: t('consents.lastReviewed') },
        ].map(({ value, label }) => (
          <div key={label} className="consent-summary-tile">
            <div className="consent-summary-value">{value}</div>
            <div className="consent-summary-label">{label}</div>
          </div>
        ))}
      </div>

      {loading && <p className="muted">{t('consents.loadingConsents')}</p>}

      {/* ── Active Consents ── */}
      {!loading && (
        <section className="section-card">
          <h3 className="payments-section-title">{t('consents.activeConsents')}</h3>
          {active.length === 0 && <p className="muted small">{t('consents.noActiveConsents')}</p>}
          <div className="consent-cards-grid">
            {active.map((c) => (
              <ConsentCard key={c.id} consent={c} aadhaarRef={profile.aadhaarRef} onUpdated={handleUpdated} />
            ))}
          </div>
        </section>
      )}

      {/* ── Revoked Consents ── */}
      {!loading && revoked.length > 0 && (
        <section className="section-card">
          <h3 className="payments-section-title">{t('consents.revokedSection')}</h3>
          <div className="consent-cards-grid">
            {revoked.map((c) => (
              <ConsentCard key={c.id} consent={c} aadhaarRef={profile.aadhaarRef} onUpdated={handleUpdated} />
            ))}
          </div>
        </section>
      )}

      {/* ── Data Rights + Download ── */}
      <div className="consent-rights-row">
        {/* DPDP Rights accordion */}
        <section className="section-card" style={{ flex: 2 }}>
          <h3 className="payments-section-title">{t('consents.dataRightsTitle')}</h3>
          <div className="faq-list">
            {Array.from({ length: DPDP_RIGHT_COUNT }, (_, i) => (
              <div key={i} className={`faq-item${openRight === i ? ' faq-item--open' : ''}`}>
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => setOpenRight((p) => (p === i ? null : i))}
                >
                  <span>{t(`consents.right${i}title`)}</span>
                  <span className="faq-chevron">{openRight === i ? '▲' : '▼'}</span>
                </button>
                {openRight === i && <div className="faq-answer">{t(`consents.right${i}body`)}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Download My Data */}
        <section className="section-card consent-download-card" style={{ flex: 1 }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>📥</div>
          <h3 className="payments-section-title" style={{ marginBottom: 'var(--space-4)' }}>
            {t('consents.downloadTitle')}
          </h3>
          <p className="muted small" style={{ marginBottom: 'var(--space-4)' }}>
            {t('consents.downloadHint')}
          </p>
          <div className="consent-download-meta">
            <span className="muted small">{t('consents.format')}: <strong>JSON</strong></span>
            <span className="muted small">{t('consents.size')}: ~12 KB</span>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
            disabled={downloading}
            onClick={handleDownload}
          >
            {downloading ? t('consents.preparing') : `⬇ ${t('consents.downloadBtn')}`}
          </button>
        </section>
      </div>

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyData() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [tab, setTab] = useState('mydata')

  return (
    <div className="screen-wrap">
      <h2 className="page-title">🔐 {t('consents.title')}</h2>

      <div className="mydata-tabs">
        <button
          type="button"
          className={`mydata-tab${tab === 'mydata' ? ' active' : ''}`}
          onClick={() => setTab('mydata')}
        >
          👤 {t('consents.tabMyData')}
        </button>
        <button
          type="button"
          className={`mydata-tab${tab === 'consents' ? ' active' : ''}`}
          onClick={() => setTab('consents')}
        >
          🔗 {t('consents.tabConsents')}
        </button>
      </div>

      <div className="mydata-tab-content">
        {tab === 'mydata'    && <MyDataTab profile={profile} />}
        {tab === 'consents'  && <ConsentsTab profile={profile} />}
      </div>
    </div>
  )
}
