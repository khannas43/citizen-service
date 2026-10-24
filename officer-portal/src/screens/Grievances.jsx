import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
  fetchAllGrievances,
  updateGrievance,
  fetchGrievanceThread,
  addGrievanceComment,
  fetchCitizenPerson,
  fetchCitizenFamily,
  fetchCitizenDocumentsMeta,
  filterRecordsByOfficerDistrict,
} from '../api'
import DistrictScopeBanner from '../components/DistrictScopeBanner'

const GENDER_LABEL = { M: 'Male', F: 'Female', O: 'Other' }
const RELATIONSHIP_LABEL = {
  HEAD: 'Head of Family', SPOUSE: 'Spouse', SON: 'Son', DAUGHTER: 'Daughter',
  FATHER: 'Father', MOTHER: 'Mother', MOTHER_IN_LAW: 'Mother-in-law', OTHER: 'Other',
}

function CitizenProfile({ grievance }) {
  const [person, setPerson] = useState(null)
  const [family, setFamily] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('personal')

  useEffect(() => {
    let cancelled = false
    const aadhaarRef = grievance?.aadhaarRef

    setPerson(null)
    setFamily(null)
    setDocs([])
    setTab('personal')

    if (!aadhaarRef) {
      setLoading(false)
      return undefined
    }

    setLoading(true)

    async function load() {
      try {
        const p = await fetchCitizenPerson(aadhaarRef)
        if (cancelled) return
        setPerson(p)
        if (p?.familyId) {
          fetchCitizenFamily(p.familyId)
            .then((f) => { if (!cancelled) setFamily(f) })
            .catch(() => {})
        }
        const d = await fetchCitizenDocumentsMeta(aadhaarRef).catch(() => [])
        if (!cancelled) setDocs(Array.isArray(d) ? d : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [grievance?.id, grievance?.aadhaarRef])

  if (loading) return <div className="citizen-profile-panel"><p className="muted small">Loading citizen data…</p></div>
  if (!person) return <div className="citizen-profile-panel"><p className="muted small">No registry record found for this citizen.</p></div>

  const personalRows = [
    { label: 'Full Name',        value: person.name || grievance.citizenName },
    { label: 'Aadhaar',         value: person.aadhaarRef, mono: true },
    { label: 'Date of Birth',   value: person.dob ? new Date(person.dob).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
    { label: 'Gender',          value: GENDER_LABEL[person.gender] || person.gender },
    { label: 'Mobile',          value: person.mobile },
    { label: 'Occupation',      value: person.occupation },
    { label: 'Annual Income',   value: person.annualIncome != null ? '₹ ' + Number(person.annualIncome).toLocaleString('en-IN') : '—' },
    { label: 'Caste Category',  value: person.casteCategory },
    { label: 'Education',        value: person.educationLevel,    source: '📚 GSEB / DigiLocker' },
    { label: 'Marital Status',   value: person.maritalStatus,     source: '🏛 Civil Registration (CRS)' },
    { label: 'Employment',       value: person.employmentStatus,  source: '💼 NCS Portal' },
    { label: 'Relationship',    value: RELATIONSHIP_LABEL[person.relationshipToHead] || person.relationshipToHead },
  ]

  const addressRows = [
    { label: 'Address',  value: family?.address },
    { label: 'Village/City',  value: family?.village },
    { label: 'Taluka',   value: family?.taluka },
    { label: 'District', value: family?.district },
    { label: 'State',    value: family?.state },
  ]

  return (
    <div className="citizen-profile-panel">
      <div className="citizen-profile-header">
        <span className="citizen-profile-name">{person.name || grievance.citizenName}</span>
        <span className="muted small">{person.aadhaarRef}</span>
      </div>

      <div className="citizen-profile-tabs">
        {['personal', 'address', 'family', 'docs'].map((t) => (
          <button key={t} type="button"
            className={`citizen-profile-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'personal' ? '👤 Personal' : t === 'address' ? '🏠 Address' : t === 'family' ? '👨‍👩‍👧 Family' : `📁 Docs${docs.length ? ` (${docs.length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <table className="mydata-table">
          <tbody>
            {personalRows.map(({ label, value, mono, source }) => (
              <tr key={label}>
                <td className="mydata-label">{label}</td>
                <td className={`mydata-value${mono ? ' mono-cell' : ''}`}>
                  <span>{value || <span className="muted">—</span>}</span>
                  {source && value && (
                    <span className="citizen-data-source-badge">{source}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'address' && (
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
      )}

      {tab === 'family' && (
        family?.members?.length > 0 ? (
          <table className="complaints-table" style={{ marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Relationship</th>
                <th>DOB</th>
                <th>Occupation</th>
              </tr>
            </thead>
            <tbody>
              {family.members.map((m) => (
                <tr key={m.id} style={{ opacity: m.isAlive === false ? 0.5 : 1 }}>
                  <td>
                    {m.name}
                    {m.isAlive === false && <span className="muted small" style={{ marginLeft: '0.3rem' }}>(Deceased)</span>}
                  </td>
                  <td className="muted">{RELATIONSHIP_LABEL[m.relationshipToHead] || m.relationshipToHead}</td>
                  <td className="muted">{m.dob ? new Date(m.dob).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</td>
                  <td className="muted">{m.occupation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted small" style={{ marginTop: '0.5rem' }}>No family data available.</p>
      )}

      {tab === 'docs' && (
        docs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
            {docs.map((d) => (
              <div key={d.id} className="citizen-profile-doc">
                <span>{d.docType}</span>
                <span className="muted small">{d.fileName}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted small" style={{ marginTop: '0.5rem' }}>No documents uploaded by citizen.</p>
      )}

      <div className="citizen-data-provenance">
        <div className="citizen-provenance-title">🔗 Data Provenance</div>
        <div className="citizen-provenance-grid">
          {[
            { field: 'Identity & DOB',  source: 'UIDAI · Aadhaar',         icon: '🔐', status: 'Verified' },
            { field: 'Caste',           source: 'Mamlatdar · Caste Cert',   icon: '📜', status: 'Verified' },
            { field: 'Income',          source: 'Family Registry',          icon: '📋', status: 'Self-declared' },
            { field: 'Education',       source: 'GSEB / DigiLocker',        icon: '📚', status: 'Board-verified' },
            { field: 'Marital Status',  source: 'Civil Registration (CRS)', icon: '🏛', status: 'Govt-verified' },
            { field: 'Employment',      source: 'NCS Portal',               icon: '💼', status: 'Registered' },
            { field: 'Address',         source: 'Family Registry',          icon: '📋', status: 'Self-declared' },
          ].map(({ field, source, icon, status }) => (
            <div key={field} className="citizen-provenance-item">
              <span className="citizen-provenance-icon">{icon}</span>
              <div className="citizen-provenance-detail">
                <span className="citizen-provenance-field">{field}</span>
                <span className="citizen-provenance-source">{source}</span>
              </div>
              <span className={`citizen-provenance-status ${status === 'Verified' || status.includes('verified') ? 'verified' : 'declared'}`}>
                {status === 'Verified' || status.includes('verified') ? '✓' : '○'} {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  QUERY_RAISED: 'Query Raised',
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

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }

function fileIcon(type) {
  if (type === 'application/pdf') return '📄'
  if (type?.startsWith('image/')) return '🖼️'
  return '📎'
}

function downloadAttachment({ name, type, data }) {
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const blob = new Blob([arr], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function truncate(text, max) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function Grievances() {
  const officerName = localStorage.getItem('officer_name') ?? 'Officer'
  const [grievances, setGrievances] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolveModal, setResolveModal] = useState(null)
  const [notes, setNotes] = useState('')
  const [updating, setUpdating] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [catFilter, setCatFilter] = useState('ALL')
  const [priFilter, setPriFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedId, setExpandedId] = useState(null)
  const [thread, setThread] = useState(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [queryMode, setQueryMode] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchAllGrievances()
    const scoped = await filterRecordsByOfficerDistrict(
      data,
      (g) => g.aadhaarRef,
      (g) => g.district,
    )
    setGrievances(scoped)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  // date-range filter applied to both cards and table rows
  const dateFiltered = useMemo(() => {
    return grievances.filter((g) => {
      const t = new Date(g.createdAt).getTime()
      if (dateFrom && t < new Date(dateFrom).getTime()) return false
      if (dateTo && t > new Date(dateTo + 'T23:59:59').getTime()) return false
      return true
    })
  }, [grievances, dateFrom, dateTo])

  const counts = useMemo(() => ({
    open: dateFiltered.filter((g) => g.status === 'OPEN').length,
    queryRaised: dateFiltered.filter((g) => g.status === 'QUERY_RAISED').length,
    urgent: dateFiltered.filter((g) => g.priority === 'URGENT').length,
    acknowledged: dateFiltered.filter((g) => g.status === 'ACKNOWLEDGED').length,
    closed: dateFiltered.filter((g) => g.status === 'RESOLVED').length,
  }), [dateFiltered])

  const displayed = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1
    return dateFiltered
      .filter((g) => statusFilter === 'ALL' || g.status === statusFilter)
      .filter((g) => catFilter === 'ALL' || g.category === catFilter)
      .filter((g) => priFilter === 'ALL' || g.priority === priFilter)
      .sort((a, b) => {
        if (sortField === 'priority') {
          return mul * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
        }
        if (sortField === 'status') {
          return mul * (a.status || '').localeCompare(b.status || '')
        }
        return mul * (new Date(a.createdAt) - new Date(b.createdAt))
      })
  }, [dateFiltered, statusFilter, catFilter, priFilter, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  function sortIndicator(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const hasFilter = statusFilter !== 'ALL' || catFilter !== 'ALL' || priFilter !== 'ALL' || dateFrom || dateTo

  async function acknowledge(g, e) {
    e.stopPropagation()
    setUpdating(true)
    try {
      await updateGrievance(g.id, 'ACKNOWLEDGED', null)
      await load()
    } finally {
      setUpdating(false)
    }
  }

  async function resolve() {
    if (!notes.trim()) return
    setUpdating(true)
    try {
      await updateGrievance(resolveModal.id, 'RESOLVED', notes.trim())
      setResolveModal(null)
      setNotes('')
      await load()
    } finally {
      setUpdating(false)
    }
  }

  async function toggleExpand(g) {
    if (expandedId === g.id) {
      setExpandedId(null)
      setThread(null)
      setReplyText('')
      setQueryMode(false)
      return
    }
    setExpandedId(g.id)
    setThreadLoading(true)
    setReplyText('')
    setQueryMode(false)
    const data = await fetchGrievanceThread(g.id)
    setThread(data)
    setThreadLoading(false)
  }

  async function submitReply() {
    if (!replyText.trim()) return
    setSendingReply(true)
    try {
      const type = queryMode ? 'OFFICER_QUERY' : 'OFFICER'
      await addGrievanceComment(expandedId, officerName, replyText.trim(), type)
      setReplyText('')
      setQueryMode(false)
      const data = await fetchGrievanceThread(expandedId)
      setThread(data)
    } finally {
      setSendingReply(false)
    }
  }

  return (
    <div className="grievances-screen">

      {/* ── Header ── */}
      <div className="grievances-header">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>🔔 Grievances</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Click a row to view the thread · auto-refreshes every 5 s
          </p>
          <DistrictScopeBanner noun="grievances" />
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!loading && (
        <div className="stats-bar grievances-stats" style={{ marginBottom: '1.5rem' }}>
          <div
            className="stat-card stat-card-breached"
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'OPEN' ? 'ALL' : 'OPEN')}
          >
            <span className="stat-label">Open</span>
            <span className="stat-value stat-value-breached">{counts.open}</span>
          </div>
          <div
            className="stat-card"
            style={{ cursor: 'pointer', borderTop: '3px solid #d97706' }}
            onClick={() => setStatusFilter(statusFilter === 'QUERY_RAISED' ? 'ALL' : 'QUERY_RAISED')}
          >
            <span className="stat-label">Query Raised</span>
            <span className="stat-value" style={{ color: '#d97706' }}>{counts.queryRaised}</span>
          </div>
          <div
            className="stat-card stat-card-urgent"
            style={{ cursor: 'pointer' }}
            onClick={() => setPriFilter(priFilter === 'URGENT' ? 'ALL' : 'URGENT')}
          >
            <span className="stat-label">Urgent</span>
            <span className="stat-value stat-value-urgent">{counts.urgent}</span>
          </div>
          <div
            className="stat-card stat-card-pending"
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'ACKNOWLEDGED' ? 'ALL' : 'ACKNOWLEDGED')}
          >
            <span className="stat-label">Acknowledged</span>
            <span className="stat-value stat-value-pending">{counts.acknowledged}</span>
          </div>
          <div
            className="stat-card"
            style={{ cursor: 'pointer', borderTop: '3px solid #15803d' }}
            onClick={() => setStatusFilter(statusFilter === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
          >
            <span className="stat-label">Closed</span>
            <span className="stat-value" style={{ color: '#15803d' }}>{counts.closed}</span>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="complaints-filters">
        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            className="complaints-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="QUERY_RAISED">Query Raised</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Closed</option>
          </select>
        </div>

        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="cat-filter">Category</label>
          <select
            id="cat-filter"
            className="complaints-filter-select"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="ALL">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="pri-filter">Priority</label>
          <select
            id="pri-filter"
            className="complaints-filter-select"
            value={priFilter}
            onChange={(e) => setPriFilter(e.target.value)}
          >
            <option value="ALL">All priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="complaints-filter-item" style={{ minWidth: '130px' }}>
          <label className="complaints-filter-label" htmlFor="date-from">From</label>
          <input
            id="date-from"
            type="date"
            className="complaints-filter-select"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="complaints-filter-item" style={{ minWidth: '130px' }}>
          <label className="complaints-filter-label" htmlFor="date-to">To</label>
          <input
            id="date-to"
            type="date"
            className="complaints-filter-select"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="complaints-filter-item">
          <label className="complaints-filter-label" htmlFor="sort-select">Sort by</label>
          <select
            id="sort-select"
            className="complaints-filter-select"
            value={`${sortField}_${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split('_')
              setSortField(f)
              setSortDir(d)
            }}
          >
            <option value="createdAt_desc">Date Submitted (newest)</option>
            <option value="createdAt_asc">Date Submitted (oldest)</option>
            <option value="priority_asc">Priority (urgent first)</option>
            <option value="priority_desc">Priority (low first)</option>
            <option value="status_asc">Status (A–Z)</option>
          </select>
        </div>

        {hasFilter && (
          <button
            type="button"
            className="complaints-filter-clear"
            onClick={() => {
              setStatusFilter('ALL')
              setCatFilter('ALL')
              setPriFilter('ALL')
              setDateFrom('')
              setDateTo('')
            }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* ── Table ── */}
      {loading && <p className="muted">Loading…</p>}

      {!loading && grievances.length === 0 && (
        <div className="complaints-empty">
          <div className="complaints-empty-icon" aria-hidden="true">🎉</div>
          <p>No open grievances at the moment.</p>
        </div>
      )}

      {!loading && grievances.length > 0 && (
        <div className="complaints-table-wrap card">
          <table className="complaints-table">
            <thead>
              <tr>
                <th style={{ width: '2rem' }} />
                <th>Ref</th>
                <th>Citizen</th>
                <th>Category</th>
                <th>
                  <button type="button" className={`th-sort${sortField === 'priority' ? ' active' : ''}`} onClick={() => toggleSort('priority')}>
                    Priority{sortIndicator('priority')}
                  </button>
                </th>
                <th>Tracking Ref</th>
                <th>Complaint</th>
                <th>
                  <button type="button" className={`th-sort${sortField === 'createdAt' ? ' active' : ''}`} onClick={() => toggleSort('createdAt')}>
                    Submitted{sortIndicator('createdAt')}
                  </button>
                </th>
                <th>
                  <button type="button" className={`th-sort${sortField === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                    Status{sortIndicator('status')}
                  </button>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No grievances match the selected filters.
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
                    <td>{g.citizenName || '—'}</td>
                    <td>{CATEGORY_LABELS[g.category] || g.category || '—'}</td>
                    <td>{g.priority || 'NORMAL'}</td>
                    <td className="mono-cell">
                      {g.trackingRef || <span className="muted">—</span>}
                    </td>
                    <td title={g.complaintText}>{truncate(g.complaintText, 60)}</td>
                    <td className="muted">{formatDate(g.createdAt)}</td>
                    <td>{STATUS_LABEL[g.status] || g.status}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="grievance-actions">
                        {g.status === 'OPEN' && (
                          <button
                            type="button"
                            className="grievance-action-link"
                            disabled={updating}
                            onClick={(e) => acknowledge(g, e)}
                          >
                            Acknowledge
                          </button>
                        )}
                        {g.status !== 'RESOLVED' && (
                          <button
                            type="button"
                            className="grievance-action-link"
                            onClick={() => { setResolveModal(g); setNotes('') }}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === g.id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div className="grievance-thread-panel">
                          <div className="thread-split">
                            <div className="thread-split-citizen" onClick={(e) => e.stopPropagation()}>
                              <CitizenProfile key={g.id} grievance={g} />
                            </div>
                            <div className="thread-split-main">
                          {threadLoading && <p className="muted">Loading thread…</p>}
                          {thread && (
                            <>
                              <p className="thread-original">
                                <strong>Original complaint:</strong>{' '}
                                {thread.grievance.complaintText}
                              </p>
                              {thread.attachments.length > 0 && (
                                <div className="thread-attachments">
                                  <strong>Attachments ({thread.attachments.length})</strong>
                                  {thread.attachments.map((a, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className="attachment-chip"
                                      onClick={(e) => { e.stopPropagation(); downloadAttachment(a) }}
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
                                      {c.authorType === 'OFFICER_QUERY' ? 'Query for Citizen' : c.authorType}
                                    </span>
                                    {c.commentText && <p>{c.commentText}</p>}
                                    {c.attachmentName && (
                                      <button
                                        type="button"
                                        className="attachment-chip"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          downloadAttachment({ name: c.attachmentName, type: c.attachmentType, data: c.attachmentData })
                                        }}
                                      >
                                        {fileIcon(c.attachmentType)} {c.attachmentName}
                                      </button>
                                    )}
                                    <span className="thread-time muted">
                                      {new Date(c.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="thread-followup" onClick={(e) => e.stopPropagation()}>
                                <div className="thread-mode-tabs">
                                  <button
                                    type="button"
                                    className={`thread-mode-tab${!queryMode ? ' active' : ''}`}
                                    onClick={() => setQueryMode(false)}
                                  >
                                    💬 Reply
                                  </button>
                                  <button
                                    type="button"
                                    className={`thread-mode-tab${queryMode ? ' active query' : ''}`}
                                    onClick={() => setQueryMode(true)}
                                  >
                                    ❓ Raise Query
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  placeholder={queryMode ? 'Type your query for the citizen…' : 'Reply to citizen…'}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                />
                                <div className="followup-actions">
                                  <button
                                    type="button"
                                    className={`btn-primary small${queryMode ? ' btn-query' : ''}`}
                                    disabled={sendingReply || !replyText.trim()}
                                    onClick={submitReply}
                                  >
                                    {sendingReply ? 'Sending…' : queryMode ? '❓ Send Query' : '💬 Reply'}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                            </div>
                          </div>
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

      {/* ── Resolve modal ── */}
      {resolveModal && (
        <div className="modal-overlay" onClick={() => setResolveModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Resolve Grievance</h2>
            <p className="muted small">
              Ref: {resolveModal.grievanceRef} | {resolveModal.citizenName}
            </p>
            <p style={{ margin: '0.5rem 0' }}>{resolveModal.complaintText}</p>
            <label className="form-grid">
              Officer Response / Resolution *
              <textarea
                rows={4}
                placeholder="Describe the action taken or resolution..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setResolveModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={updating || !notes.trim()}
                onClick={resolve}
              >
                {updating ? 'Saving…' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
