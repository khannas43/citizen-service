import { useState, useEffect, useMemo, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import {
  submitGrievance,
  fetchCitizenGrievances,
  fetchGrievanceThread,
  addGrievanceComment,
  fileToBase64,
  base64ToBlob,
  fetchMyApplications,
  displayAppNo,
} from '../api'
import { serviceLabel } from '../labels'

const STATUS_CLASS = {
  OPEN: 'badge-red',
  ACKNOWLEDGED: 'badge-amber',
  QUERY_RAISED: 'badge-orange',
  RESOLVED: 'badge-green',
}

const STATUS_LABEL = {
  OPEN: 'Awaiting Response',
  ACKNOWLEDGED: 'Under Review',
  QUERY_RAISED: 'Officer Query — Please Respond',
  RESOLVED: 'Closed',
}

const CATEGORY_LABELS = {
  DELAYED_PROCESSING: 'Delayed Processing',
  DOCUMENT_REJECTION: 'Document Rejected',
  WRONG_INFORMATION: 'Wrong Information',
  CERTIFICATE_NOT_RECEIVED: 'Certificate Not Received',
  SCHEME_ELIGIBILITY: 'Eligibility Dispute',
  BENEFIT_NOT_RECEIVED: 'Benefit Not Credited',
  TECHNICAL_ISSUE: 'Technical Issue',
  OFFICER_CONDUCT: 'Officer Conduct',
  OTHER: 'Other',
}


const PRIORITY_CLASS = {
  LOW: 'badge-grey',
  NORMAL: 'badge-blue',
  HIGH: 'badge-amber',
  URGENT: 'badge-red badge-urgent-pulse',
}

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low — not time-sensitive' },
  { value: 'NORMAL', label: 'Normal — standard processing' },
  { value: 'HIGH', label: 'High — needs attention soon' },
  { value: 'URGENT', label: 'Urgent — immediate attention required' },
]

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function truncate(text, max) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function priorityBadgeClass(priority) {
  return PRIORITY_CLASS[priority] || 'badge-grey'
}

function fileIcon(type) {
  if (type === 'application/pdf') return '📄'
  if (type?.startsWith('image/')) return '🖼️'
  return '📎'
}

function downloadAttachment({ name, type, data }) {
  const blob = base64ToBlob(data, type)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function MyComplaints() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [grievances, setGrievances] = useState([])
  const [myApps, setMyApps] = useState([])
  const [trackingRef, setTrackingRef] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [complaintText, setComplaintText] = useState('')
  const [attachedFiles, setAttachedFiles] = useState([])
  const [fileError, setFileError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)
  const [thread, setThread] = useState(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [followUpText, setFollowUpText] = useState('')
  const [followUpFile, setFollowUpFile] = useState(null)
  const [sendingComment, setSendingComment] = useState(false)

  useEffect(() => {
    if (!profile?.aadhaarRef) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchCitizenGrievances(profile.aadhaarRef)
      .then(setGrievances)
      .finally(() => setLoading(false))
    fetchMyApplications(profile.aadhaarRef).then(setMyApps).catch(() => {})
  }, [profile?.aadhaarRef])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const displayed = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1
    return grievances
      .filter((g) => statusFilter === 'ALL' || g.status === statusFilter)
      .filter((g) => categoryFilter === 'ALL' || g.category === categoryFilter)
      .sort((a, b) => {
        if (sortField === 'createdAt') {
          return mul * (new Date(a.createdAt) - new Date(b.createdAt))
        }
        if (sortField === 'status') {
          return mul * (a.status || '').localeCompare(b.status || '')
        }
        if (sortField === 'priority') {
          const ao = PRIORITY_ORDER[a.priority] ?? 9
          const bo = PRIORITY_ORDER[b.priority] ?? 9
          return mul * (ao - bo)
        }
        return 0
      })
  }, [grievances, statusFilter, categoryFilter, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'createdAt' ? 'desc' : 'asc')
    }
  }

  function sortIndicator(field) {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  function openModal() {
    setError(null)
    setFileError(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (submitting) return
    setModalOpen(false)
    setError(null)
    setFileError(null)
  }

  function resetForm() {
    setTrackingRef('')
    setCategory('')
    setPriority('NORMAL')
    setComplaintText('')
    setAttachedFiles([])
    setFileError(null)
  }

  async function handleFileSelect(e) {
    setFileError(null)
    const files = Array.from(e.target.files)
    if (attachedFiles.length + files.length > 3) {
      setFileError('Maximum 3 attachments allowed.')
      return
    }
    for (const f of files) {
      if (f.size > 2 * 1024 * 1024) {
        setFileError(`${f.name} exceeds 2 MB limit.`)
        return
      }
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setFileError('Only PDF, JPG, PNG files are accepted.')
        return
      }
    }
    const encoded = await Promise.all(files.map(fileToBase64))
    setAttachedFiles((prev) => [
      ...prev,
      ...encoded.map((e) => ({
        ...e,
        sizeKB: Math.round((e.data.length * 0.75) / 1024),
      })),
    ])
    e.target.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!complaintText.trim() || !category) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitGrievance(
        profile.aadhaarRef,
        profile.name,
        trackingRef.trim() || null,
        complaintText.trim(),
        category,
        priority,
        attachedFiles.map((f) => ({ name: f.name, type: f.type, data: f.data }))
      )
      resetForm()
      setModalOpen(false)
      setToast(result.grievanceRef)
      const updated = await fetchCitizenGrievances(profile.aadhaarRef)
      setGrievances(updated)
    } catch {
      setError(t('complaints.error', 'Failed to submit. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleExpand(g) {
    if (expandedId === g.id) {
      setExpandedId(null)
      setThread(null)
      setFollowUpText('')
      setFollowUpFile(null)
      return
    }
    setExpandedId(g.id)
    setThreadLoading(true)
    setFollowUpText('')
    setFollowUpFile(null)
    const data = await fetchGrievanceThread(g.id)
    setThread(data)
    setThreadLoading(false)
  }

  async function submitFollowUp() {
    if (!followUpText.trim() && !followUpFile) return
    if (thread?.grievance?.status === 'RESOLVED') return
    setSendingComment(true)
    try {
      const att = followUpFile ? await fileToBase64(followUpFile) : null
      await addGrievanceComment(expandedId, profile.name, followUpText.trim(), att)
      setFollowUpText('')
      setFollowUpFile(null)
      const data = await fetchGrievanceThread(expandedId)
      setThread(data)
    } finally {
      setSendingComment(false)
    }
  }

  return (
    <div className="my-complaints-screen">
      {toast && (
        <div className="complaints-toast">✅ Complaint {toast} submitted</div>
      )}

      <div className="complaints-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          🔔 {t('complaints.title', 'Grievances')}
        </h1>
        <button type="button" className="btn-primary" onClick={openModal}>
          ➕ {t('complaints.raise', 'Raise Complaint')}
        </button>
      </div>

      <div className="complaints-filters">
        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="status-filter">
            {t('complaints.status', 'Status')}
          </label>
          <select
            id="status-filter"
            className="complaints-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">{t('complaints.filterAll', 'All statuses')}</option>
            <option value="OPEN">{t('complaints.filterOpen', 'Awaiting Response')}</option>
            <option value="ACKNOWLEDGED">{t('complaints.filterAcknowledged', 'Under Review')}</option>
            <option value="QUERY_RAISED">Officer Query — Please Respond</option>
            <option value="RESOLVED">{t('complaints.filterResolved', 'Closed')}</option>
          </select>
        </div>

        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="category-filter">
            {t('complaints.category', 'Category')}
          </label>
          <select
            id="category-filter"
            className="complaints-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">{t('complaints.filterAll', 'All categories')}</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="sort-select">
            {t('complaints.sort', 'Sort by')}
          </label>
          <select
            id="sort-select"
            className="complaints-filter-select"
            value={`${sortField}_${sortDir}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split('_')
              setSortField(field)
              setSortDir(dir)
            }}
          >
            <option value="createdAt_desc">Date Filed (newest first)</option>
            <option value="createdAt_asc">Date Filed (oldest first)</option>
            <option value="priority_asc">Priority (urgent first)</option>
            <option value="priority_desc">Priority (low first)</option>
            <option value="status_asc">Status (A–Z)</option>
          </select>
        </div>

        {(statusFilter !== 'ALL' || categoryFilter !== 'ALL') && (
          <button
            type="button"
            className="complaints-filter-clear"
            onClick={() => { setStatusFilter('ALL'); setCategoryFilter('ALL') }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {!profile?.aadhaarRef && !loading && (
        <div className="complaints-empty">
          <p className="muted">{t('complaints.loginRequired', 'Please log in to view your grievances.')}</p>
        </div>
      )}

      {profile?.aadhaarRef && loading && <p className="muted">Loading…</p>}

      {profile?.aadhaarRef && !loading && grievances.length === 0 && (
        <div className="complaints-empty">
          <div className="complaints-empty-icon" aria-hidden="true">📭</div>
          <p>
            {t(
              'complaints.emptyHint',
              'No complaints yet. Use the button above to raise one.'
            )}
          </p>
        </div>
      )}

      {profile?.aadhaarRef && !loading && grievances.length > 0 && (
        <div className="complaints-table-wrap card">
          <table className="complaints-table">
            <thead>
              <tr>
                <th style={{ width: '2rem' }} />
                <th>{t('complaints.ref', 'Grievance Ref')}</th>
                <th>
                  <button
                    type="button"
                    className={`th-sort${sortField === 'createdAt' ? ' active' : ''}`}
                    onClick={() => toggleSort('createdAt')}
                  >
                    {t('complaints.dateFiled', 'Date Filed')}
                    {sortIndicator('createdAt')}
                  </button>
                </th>
                <th>{t('complaints.category', 'Category')}</th>
                <th>{t('complaints.appRef', 'Application Ref')}</th>
                <th>
                  <button
                    type="button"
                    className={`th-sort${sortField === 'priority' ? ' active' : ''}`}
                    onClick={() => toggleSort('priority')}
                  >
                    {t('complaints.priority', 'Priority')}
                    {sortIndicator('priority')}
                  </button>
                </th>
                <th>{t('complaints.issue', 'Issue')}</th>
                <th>
                  <button
                    type="button"
                    className={`th-sort${sortField === 'status' ? ' active' : ''}`}
                    onClick={() => toggleSort('status')}
                  >
                    {t('complaints.status', 'Status')}
                    {sortIndicator('status')}
                  </button>
                </th>
                <th>{t('complaints.officerResponse', 'Officer Response')}</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    {t('complaints.noMatch', 'No complaints match this filter.')}
                  </td>
                </tr>
              )}
              {displayed.map((g) => (
                <Fragment key={g.id}>
                  <tr
                    className={`complaints-row${expandedId === g.id ? ' row-expanded' : ''}`}
                    onClick={() => toggleExpand(g)}
                  >
                    <td className="expand-cell">{expandedId === g.id ? '▼' : '▶'}</td>
                    <td>
                      <span className="tracking-box small complaints-ref">{g.grievanceRef}</span>
                    </td>
                    <td>{formatDate(g.createdAt)}</td>
                    <td>{CATEGORY_LABELS[g.category] || g.category || '—'}</td>
                    <td className="mono-cell">{g.trackingRef || '—'}</td>
                    <td>
                      <span className={`status-badge ${priorityBadgeClass(g.priority)}`}>
                        {g.priority || 'NORMAL'}
                      </span>
                    </td>
                    <td title={g.complaintText}>{truncate(g.complaintText, 40)}</td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASS[g.status] || 'badge-grey'}`}>
                        {STATUS_LABEL[g.status] || g.status}
                      </span>
                    </td>
                    <td title={g.officerNotes || undefined}>
                      {g.officerNotes ? (
                        truncate(g.officerNotes, 60)
                      ) : (
                        <span className="muted">
                          {t('complaints.awaitingResponse', 'Awaiting response')}
                        </span>
                      )}
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0 }}>
                        <div className="grievance-thread-panel">
                          {threadLoading && <p className="muted">Loading thread…</p>}
                          {thread && (
                            <>
                              <p className="thread-original">
                                <strong>Original complaint:</strong> {thread.grievance.complaintText}
                              </p>
                              {thread.attachments.length > 0 && (
                                <div className="thread-attachments">
                                  <strong>
                                    Attachments ({thread.attachments.length})
                                  </strong>
                                  {thread.attachments.map((a, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className="attachment-chip"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        downloadAttachment(a)
                                      }}
                                    >
                                      {fileIcon(a.type)} {a.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="thread-messages">
                                {thread.comments.length === 0 && (
                                  <p className="muted small">No follow-up messages yet.</p>
                                )}
                                {thread.comments.map((c) => (
                                  <div
                                    key={c.id}
                                    className={`thread-msg thread-msg--${c.authorType.toLowerCase()}`}
                                  >
                                    <span className="thread-author">
                                      {c.authorType === 'OFFICER_QUERY' ? '❓ ' : ''}{c.authorName}
                                    </span>
                                    <span className={`thread-role-badge${c.authorType === 'OFFICER_QUERY' ? ' badge-query' : ''}`}>
                                      {c.authorType === 'OFFICER_QUERY' ? 'Officer Query' : c.authorType === 'OFFICER' ? 'Officer' : 'You'}
                                    </span>
                                    {c.commentText && <p>{c.commentText}</p>}
                                    {c.attachmentName && (
                                      <button
                                        type="button"
                                        className="attachment-chip"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          downloadAttachment({
                                            name: c.attachmentName,
                                            type: c.attachmentType,
                                            data: c.attachmentData,
                                          })
                                        }}
                                      >
                                        {fileIcon(c.attachmentType)} {c.attachmentName}
                                      </button>
                                    )}
                                    <span className="thread-time muted">
                                      {new Date(c.createdAt).toLocaleString()}
                                    </span>
                                    {c.authorType === 'OFFICER_QUERY' && thread.grievance.status !== 'RESOLVED' && (
                                      <button
                                        type="button"
                                        className="btn-ghost small respond-btn"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setFollowUpText('Response to officer query: ')
                                          document.getElementById(`followup-${thread.grievance.id}`)?.focus()
                                        }}
                                      >
                                        ↩ Respond
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {thread.grievance.status === 'RESOLVED' ? (
                                <p className="muted small thread-closed-notice">
                                  {t(
                                    'complaints.resolvedNoReply',
                                    'This complaint is resolved. Follow-ups are no longer accepted.'
                                  )}
                                </p>
                              ) : (
                                <div
                                  className="thread-followup"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <textarea
                                    id={`followup-${thread.grievance.id}`}
                                    rows={2}
                                    placeholder="Add a follow-up comment…"
                                    value={followUpText}
                                    onChange={(e) => setFollowUpText(e.target.value)}
                                  />
                                  <div className="followup-actions">
                                    <label className="attach-btn">
                                      📎 {followUpFile ? followUpFile.name : 'Attach file'}
                                      <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        hidden
                                        onChange={(e) => setFollowUpFile(e.target.files[0] || null)}
                                      />
                                    </label>
                                    {followUpFile && (
                                      <button
                                        type="button"
                                        className="btn-ghost small"
                                        onClick={() => setFollowUpFile(null)}
                                      >
                                        ✕
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-primary small"
                                      disabled={
                                        sendingComment ||
                                        (!followUpText.trim() && !followUpFile)
                                      }
                                      onClick={submitFollowUp}
                                    >
                                      {sendingComment ? 'Sending…' : 'Send Follow-up'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card complaints-modal" onClick={(e) => e.stopPropagation()}>
            <div className="complaints-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {t('complaints.raise', 'Raise a Complaint')}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="complaint-form">
              <label className="field">
                {t('complaints.trackingRef', 'Related application (optional)')}
                <select
                  value={trackingRef}
                  onChange={(e) => setTrackingRef(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— None / General complaint —</option>
                  {myApps.map((app) => (
                    <option key={app.engineRef + app.service} value={app.engineRef}>
                      {displayAppNo(app)} — {serviceLabel(app.service, t)}
                      {app.status ? ` (${app.status})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('complaints.category', 'Category')} *
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  disabled={submitting}
                >
                  <option value="">{t('complaints.selectCategory', 'Select category…')}</option>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('complaints.priority', 'Priority')}
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={submitting}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('complaints.describe', 'Describe your issue')} *
                <textarea
                  rows={4}
                  maxLength={500}
                  placeholder={t(
                    'complaints.placeholder',
                    'E.g. My caste certificate has been pending for 5 days...'
                  )}
                  value={complaintText}
                  onChange={(e) => setComplaintText(e.target.value)}
                  required
                  disabled={submitting}
                />
              </label>
              <div className="char-count">{complaintText.length}/500</div>
              <div className="attachment-section">
                <label className="field-label">
                  Attachments (optional — max 3 files, 2 MB each, PDF/JPG/PNG)
                </label>
                <label className="attach-btn">
                  📎 Add file
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    hidden
                    onChange={handleFileSelect}
                    disabled={submitting}
                  />
                </label>
                {fileError && <p className="error-text">{fileError}</p>}
                {attachedFiles.length > 0 && (
                  <div className="attachment-preview">
                    {attachedFiles.map((f, i) => (
                      <div key={i} className="attachment-chip">
                        {fileIcon(f.type)} {f.name}{' '}
                        <span className="muted">({f.sizeKB} KB)</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachedFiles((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  {t('complaints.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !complaintText.trim() || !category}
                >
                  {submitting
                    ? t('complaints.submitting', 'Submitting…')
                    : t('complaints.submit', 'Submit Complaint')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
