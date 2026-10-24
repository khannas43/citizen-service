import { useEffect, useState } from 'react'
import {
  answerClarification,
  certificateDownloadUrl,
  displayName,
  fetchApplicationByRef,
  fetchCitizenDocumentsMeta,
  fetchCitizenFamily,
  fetchCitizenPerson,
  fetchClarificationsForApplication,
  slaLabel,
  SLA_HOURS,
  taskCreatedAt,
  taskMeta,
} from '../api'

const APP_FIELD_LABELS = {
  applicationNo: 'Application number',
  engineRef: 'Engine reference',
  service: 'Service',
  applicantName: 'Applicant name',
  personName: 'Person name',
  aadhaarRef: 'Aadhaar',
  casteCode: 'Caste / spouse',
  pensionType: 'Pension type',
  familyIncome: 'Declared family income',
  declaredIncome: 'Declared income',
  registryIncome: 'Registry income',
  schemeName: 'Scheme',
  schemeId: 'Scheme ID',
  familyId: 'Family ID',
  changeType: 'Change type',
  reason: 'Reason',
  eligibilityNotes: 'Eligibility notes',
  tenantId: 'Tenant',
  status: 'Status',
  currentTask: 'Current workflow step',
  assignee: 'Assignee',
  candidateGroups: 'Candidate groups',
  createdAt: 'Submitted at',
}

const SKIP_KEYS = new Set(['live', 'attachments'])

const HIDDEN_VAULT_FILES = new Set([
  'income-certificate.pdf',
  'aadhaar-ekyc.pdf',
  'aadhar-ekyc.pdf',
])

function documentTypeLabel(doc) {
  const raw = String(doc?.docType || doc?.documentType || '').trim()
  if (/^aadha?ar(\s+card)?$/i.test(raw)) return 'Aadhar'
  return raw
}

function documentFileName(doc) {
  const name = String(doc?.fileName || doc?.name || '').trim()
  if (!name || HIDDEN_VAULT_FILES.has(name.toLowerCase())) return null
  return name
}

function presentDocuments(vaultDocs, app) {
  const vault = (Array.isArray(vaultDocs) ? vaultDocs : []).map((doc) => ({
    id: doc.id,
    type: documentTypeLabel(doc) || 'Document',
    fileName: documentFileName(doc),
    source: doc.trustedSource || (documentFileName(doc) ? 'Uploaded by citizen' : null),
  }))
  const attached = (Array.isArray(app?.attachments) ? app.attachments : []).map((doc, i) => ({
    id: `attached-${doc.name || i}`,
    type: documentTypeLabel(doc) || 'Uploaded with application',
    fileName: documentFileName(doc),
    source: 'Attached to this application',
  }))
  const seen = new Set()
  return [...vault, ...attached].filter((doc) => {
    const key = `${doc.type}|${doc.fileName || ''}|${doc.source || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return Boolean(doc.type || doc.fileName)
  })
}

function formatValue(key, value) {
  if (value == null || value === '') return null
  if (key === 'createdAt' || key.endsWith('At')) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toLocaleString()
  }
  if (typeof value === 'number' && /income/i.test(key)) {
    return `₹${value.toLocaleString('en-IN')}`
  }
  if (typeof value === 'string' && /^\d+$/.test(value) && /income/i.test(key)) {
    return `₹${Number(value).toLocaleString('en-IN')}`
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function applicationRows(app) {
  const preferred = Object.keys(APP_FIELD_LABELS)
  const extra = Object.keys(app || {}).filter(
    (key) => !preferred.includes(key) && !SKIP_KEYS.has(key) && app[key] != null && app[key] !== '',
  )
  return [...preferred, ...extra]
    .map((key) => {
      const value = formatValue(key, app?.[key])
      if (!value) return null
      return { key, label: APP_FIELD_LABELS[key] || key, value }
    })
    .filter(Boolean)
}

function personRows(person, family) {
  if (!person && !family) return []
  const income = person?.annualIncome ?? person?.personIncome?.annualIncome
  const rows = [
    { label: 'Citizen name', value: person?.name },
    { label: 'Ration card', value: family?.rationCardNumber },
    { label: 'Mobile', value: person?.mobile },
    { label: 'Date of birth', value: person?.dob },
    { label: 'Gender', value: person?.gender },
    { label: 'Occupation', value: person?.occupation },
    { label: 'Caste category', value: person?.casteCategory },
    { label: 'Annual income', value: income ? `₹${Number(income).toLocaleString('en-IN')}` : null },
    { label: 'District', value: person?.district || family?.district },
    { label: 'Taluka', value: person?.taluka || family?.taluka },
    { label: 'Village', value: person?.village || family?.village },
  ]
  return rows.filter((row) => row.value)
}

function formatWhen(value) {
  if (!value) return ''
  if (Array.isArray(value) && value.length >= 3) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = value
    return new Date(y, mo - 1, d, h, mi, s).toLocaleString()
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

function threadKind(item) {
  if (item.direction === 'OFFICER_TO_CITIZEN') return 'officer'
  return 'citizen'
}

export default function ApplicationDetailModal({ app, onClose, onRequestInfo, onViewCitizen }) {
  const [detail, setDetail] = useState(app)
  const [thread, setThread] = useState([])
  const [person, setPerson] = useState(null)
  const [family, setFamily] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [replies, setReplies] = useState({})
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setDetail(app)
    setLoading(true)

    async function load() {
      const [fresh, messages, citizen] = await Promise.all([
        fetchApplicationByRef(app).catch(() => app),
        fetchClarificationsForApplication(app).catch(() => []),
        app.aadhaarRef ? fetchCitizenPerson(app.aadhaarRef).catch(() => null) : Promise.resolve(null),
      ])
      if (cancelled) return
      setDetail(fresh)
      setThread(messages)
      setPerson(citizen)

      const familyId = fresh.familyId || citizen?.familyId || app.familyId
      const aadhaar = fresh.aadhaarRef || citizen?.aadhaarRef || app.aadhaarRef
      const [fam, docs] = await Promise.all([
        familyId ? fetchCitizenFamily(familyId).catch(() => null) : Promise.resolve(null),
        aadhaar ? fetchCitizenDocumentsMeta(aadhaar).catch(() => []) : Promise.resolve([]),
      ])
      if (cancelled) return
      setFamily(fam)
      setDocuments(presentDocuments(docs, fresh))
      setLoading(false)
    }

    load()
    const interval = setInterval(() => {
      fetchClarificationsForApplication(app).then((messages) => {
        if (!cancelled) setThread(messages)
      }).catch(() => {})
    }, 8000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [app])

  async function submitReply(item) {
    const text = replies[item.id]?.trim()
    if (!text || text.length < 5) return
    setSavingId(item.id)
    try {
      await answerClarification(item.id, text)
      setReplies((prev) => ({ ...prev, [item.id]: '' }))
      setThread(await fetchClarificationsForApplication(app))
    } finally {
      setSavingId(null)
    }
  }

  const rows = applicationRows(detail || app)
  const registryRows = personRows(person, family)
  const members = family?.members ?? []
  const sla = slaLabel(taskCreatedAt(detail || app), SLA_HOURS[(detail || app).service])
  const ref = (detail || app).applicationNo || (detail || app).engineRef

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card app-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="app-detail-header">
          <div>
            <p className="app-detail-kicker">Application details</p>
            <h3>{ref}</h3>
            <p className="muted">
              {displayName(detail || app)} · {(detail || app).service}
              {taskMeta(detail || app) ? ` · ${taskMeta(detail || app)}` : ''}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>

        {loading && <p className="muted">Loading submitted information…</p>}

        <div className="app-detail-layout">
          <section>
            <h4>Information shared by citizen</h4>
            <dl className="app-detail-grid">
              {rows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {sla && (
                <div>
                  <dt>SLA</dt>
                  <dd>{sla}</dd>
                </div>
              )}
            </dl>

            {registryRows.length > 0 && (
              <>
                <h4>Registry profile used with this application</h4>
                <dl className="app-detail-grid">
                  {registryRows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {members.length > 0 && (
              <>
                <h4>Family members</h4>
                <ul className="app-detail-members">
                  {members.map((m) => (
                    <li key={m.id || m.name}>
                      {m.name}
                      {m.relationshipToHead ? ` · ${m.relationshipToHead}` : ''}
                      {m.annualIncome ? ` · ₹${Number(m.annualIncome).toLocaleString('en-IN')}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h4>Citizen document vault</h4>
            {documents.length === 0 && !loading && (
              <p className="muted">No documents on file for this citizen.</p>
            )}
            {documents.length > 0 && (
              <ul className="app-detail-docs">
                {documents.map((doc) => (
                  <li key={doc.id}>
                    <strong>{doc.type}</strong>
                    {doc.fileName && <span className="app-detail-doc-file">{doc.fileName}</span>}
                    {doc.source && <span className="muted small">{doc.source}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>Questions and citizen responses</h4>
            {thread.length === 0 && !loading && (
              <p className="muted">No questions have been sent on this application yet.</p>
            )}
            <ol className="app-thread">
              {thread.map((item) => {
                const kind = threadKind(item)
                const pendingCitizenQ = kind === 'citizen' && item.status === 'PENDING'
                const waitingCitizen = kind === 'officer' && item.status === 'PENDING'
                return (
                  <li key={item.id} className={`app-thread-item app-thread-${kind}`}>
                    <div className="app-thread-meta">
                      <strong>{kind === 'officer' ? 'Officer asked citizen' : 'Citizen asked officer'}</strong>
                      <span>{formatWhen(item.askedAt)}</span>
                    </div>
                    {item.officerName && kind === 'officer' && (
                      <p className="muted small">From: {item.officerName}</p>
                    )}
                    <p className="app-thread-q">{item.question}</p>
                    {item.answer && (
                      <p className="app-thread-a">
                        <strong>{kind === 'officer' ? 'Citizen replied' : 'Officer replied'}:</strong> {item.answer}
                        {item.answeredAt && <span className="muted small"> · {formatWhen(item.answeredAt)}</span>}
                      </p>
                    )}
                    {waitingCitizen && <p className="muted small">Waiting for citizen response.</p>}
                    {pendingCitizenQ && (
                      <div className="app-thread-reply">
                        <textarea
                          rows={2}
                          placeholder="Type your reply to the citizen…"
                          value={replies[item.id] || ''}
                          onChange={(e) => setReplies((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-approve"
                          disabled={savingId === item.id}
                          onClick={() => submitReply(item)}
                        >
                          {savingId === item.id ? 'Sending…' : 'Send reply'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <div className="modal-actions app-detail-actions">
          <button type="button" className="btn-secondary" onClick={() => onViewCitizen?.(detail || app)}>
            Citizen 360°
          </button>
          {(detail || app).aadhaarRef && (detail || app).status === 'PENDING' && (
            <button type="button" className="btn-secondary" onClick={() => onRequestInfo?.(detail || app)}>
              Request info
            </button>
          )}
          {(detail || app).status === 'APPROVED' && (detail || app).service === 'Caste Certificate' && (
            <a className="btn-secondary" href={certificateDownloadUrl((detail || app).engineRef)} download>
              Certificate
            </a>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
