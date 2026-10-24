import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchSchemeContent,
  fetchSchemeContentHistory,
  fetchSchemeContentList,
  saveSchemeContent,
} from '../api'
import { getCitizenLandingUrl } from '../auth'
import './SchemeContentEditor.css'

const HTML_PATTERN = /<[^>]+>/
const CONTROL_PATTERN = /[\u0000-\u001F\u007F]/
const HELPLINE_PATTERN = /^[0-9+\s-]{3,24}$/

const LIMITS = {
  title: 160,
  note: 2000,
  overview: 2000,
  wording: 1000,
  docsMax: 20,
  stepsMax: 15,
  faqsMax: 20,
}

function emptyDoc() {
  return { title: '', titleGu: '', note: '', noteGu: '' }
}

function emptyStep() {
  return { title: '', titleGu: '', detail: '', detailGu: '' }
}

function emptyFaq() {
  return { question: '', questionGu: '', answer: '', answerGu: '' }
}

function trimOrNull(s) {
  if (s == null || String(s).trim() === '') return null
  return String(s).trim()
}

function checkText(errors, field, value, max, required) {
  const text = value == null ? '' : String(value)
  if (!text.trim()) {
    if (required) errors[field] = 'Required'
    return
  }
  if (text.length > max) errors[field] = `Max length ${max}`
  if (HTML_PATTERN.test(text)) errors[field] = 'HTML not allowed'
  if (CONTROL_PATTERN.test(text)) errors[field] = 'Invalid control characters'
}

export function validateSchemeContentDraft(draft) {
  const errors = {}
  const docs = draft.documentsRequired ?? []
  const steps = draft.applicationSteps ?? []
  const faqs = draft.faqs ?? []

  if (docs.length > LIMITS.docsMax) errors.documentsRequired = `At most ${LIMITS.docsMax} documents`
  docs.forEach((d, i) => {
    checkText(errors, `documentsRequired[${i}].title`, d.title, LIMITS.title, true)
    checkText(errors, `documentsRequired[${i}].titleGu`, d.titleGu, LIMITS.title, false)
    checkText(errors, `documentsRequired[${i}].note`, d.note, LIMITS.note, false)
    checkText(errors, `documentsRequired[${i}].noteGu`, d.noteGu, LIMITS.note, false)
  })

  if (steps.length > LIMITS.stepsMax) errors.applicationSteps = `At most ${LIMITS.stepsMax} steps`
  steps.forEach((s, i) => {
    checkText(errors, `applicationSteps[${i}].title`, s.title, LIMITS.title, true)
    checkText(errors, `applicationSteps[${i}].titleGu`, s.titleGu, LIMITS.title, false)
    checkText(errors, `applicationSteps[${i}].detail`, s.detail, LIMITS.note, false)
    checkText(errors, `applicationSteps[${i}].detailGu`, s.detailGu, LIMITS.note, false)
  })

  if (faqs.length > LIMITS.faqsMax) errors.faqs = `At most ${LIMITS.faqsMax} FAQs`
  faqs.forEach((f, i) => {
    checkText(errors, `faqs[${i}].question`, f.question, LIMITS.title, true)
    checkText(errors, `faqs[${i}].questionGu`, f.questionGu, LIMITS.title, false)
    checkText(errors, `faqs[${i}].answer`, f.answer, LIMITS.note, true)
    checkText(errors, `faqs[${i}].answerGu`, f.answerGu, LIMITS.note, false)
  })

  checkText(errors, 'overview', draft.overview, LIMITS.overview, false)
  checkText(errors, 'overviewGu', draft.overviewGu, LIMITS.overview, false)
  checkText(errors, 'benefitsNote', draft.benefitsNote, LIMITS.wording, false)
  checkText(errors, 'benefitsNoteGu', draft.benefitsNoteGu, LIMITS.wording, false)
  checkText(errors, 'eligibilityNote', draft.eligibilityNote, LIMITS.wording, false)
  checkText(errors, 'eligibilityNoteGu', draft.eligibilityNoteGu, LIMITS.wording, false)

  checkText(errors, 'helplineLabel', draft.helplineLabel, LIMITS.title, false)
  const helpline = draft.helplineNumber
  if (helpline != null && String(helpline).trim() !== '') {
    if (!HELPLINE_PATTERN.test(String(helpline).trim())) {
      errors.helplineNumber = 'Invalid helpline format'
    }
  }
  const url = draft.officialUrl
  if (url != null && String(url).trim() !== '') {
    const u = String(url).trim()
    if (!u.startsWith('https://')) {
      errors.officialUrl = 'URL must start with https://'
    } else {
      try {
        const parsed = URL.parse ? URL.parse(u) : new URL(u)
        if (!parsed) errors.officialUrl = 'Invalid URL'
      } catch {
        errors.officialUrl = 'Invalid URL'
      }
    }
  }

  return errors
}

function responseToDraft(data) {
  return {
    version: data.version ?? 0,
    documentsRequired: (data.documentsRequired ?? []).map((d) => ({ ...d })),
    applicationSteps: (data.applicationSteps ?? []).map((s) => ({ ...s })),
    faqs: (data.faqs ?? []).map((f) => ({ ...f })),
    overview: data.overview ?? '',
    overviewGu: data.overviewGu ?? '',
    benefitsNote: data.benefitsNote ?? '',
    benefitsNoteGu: data.benefitsNoteGu ?? '',
    eligibilityNote: data.eligibilityNote ?? '',
    eligibilityNoteGu: data.eligibilityNoteGu ?? '',
    helplineLabel: data.helplineLabel ?? '',
    helplineNumber: data.helplineNumber ?? '',
    officialUrl: data.officialUrl ?? '',
  }
}

function draftSnapshot(draft) {
  return JSON.stringify({
    documentsRequired: draft.documentsRequired,
    applicationSteps: draft.applicationSteps,
    faqs: draft.faqs,
    overview: trimOrNull(draft.overview),
    overviewGu: trimOrNull(draft.overviewGu),
    benefitsNote: trimOrNull(draft.benefitsNote),
    benefitsNoteGu: trimOrNull(draft.benefitsNoteGu),
    eligibilityNote: trimOrNull(draft.eligibilityNote),
    eligibilityNoteGu: trimOrNull(draft.eligibilityNoteGu),
    helplineLabel: trimOrNull(draft.helplineLabel),
    helplineNumber: trimOrNull(draft.helplineNumber),
    officialUrl: trimOrNull(draft.officialUrl),
  })
}

function savePayload(draft) {
  return {
    version: draft.version ?? 0,
    documentsRequired: draft.documentsRequired,
    applicationSteps: draft.applicationSteps,
    faqs: draft.faqs,
    overview: trimOrNull(draft.overview),
    overviewGu: trimOrNull(draft.overviewGu),
    benefitsNote: trimOrNull(draft.benefitsNote),
    benefitsNoteGu: trimOrNull(draft.benefitsNoteGu),
    eligibilityNote: trimOrNull(draft.eligibilityNote),
    eligibilityNoteGu: trimOrNull(draft.eligibilityNoteGu),
    helplineLabel: trimOrNull(draft.helplineLabel),
    helplineNumber: trimOrNull(draft.helplineNumber),
    officialUrl: trimOrNull(draft.officialUrl),
  }
}

function listChip(item) {
  if (!item.hasContent) return { label: 'Missing', className: 'sce-chip sce-chip-missing' }
  if (item.contentSource === 'OFFICER') return { label: 'Officer', className: 'sce-chip sce-chip-officer' }
  return { label: 'Sample', className: 'sce-chip sce-chip-sample' }
}

export function citizenSchemePreviewUrl(schemeId) {
  const base = getCitizenLandingUrl()
  return `${base}schemes/${encodeURIComponent(schemeId)}`
}

const BENEFIT_SUFFIX = {
  MONTHLY: 'per month',
  ANNUAL: 'per year',
  INSURANCE: 'insurance cover',
  LOAN: 'loan',
  SUBSIDY: 'subsidy',
}

function humanize(value) {
  return String(value ?? '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

// Rule-based criteria carry raw enum values (WIDOWED, FARMER,AGRICULTURIST); show them as the citizen page does.
export function formatCriterionValue(value, source) {
  const s = String(value ?? '')
  if (source !== 'OVERLAY' || !/^[A-Z_]+(\s*,\s*[A-Z_]+)*$/.test(s)) return s
  return s.split(',').map((p) => humanize(p.trim())).join(', ')
}

function formatRupees(amount) {
  return amount == null ? '—' : `₹${Number(amount).toLocaleString('en-IN')}`
}

export function formatBenefitHeadline(type, value) {
  const raw = String(value ?? '').trim()
  if (!raw && !type) return '—'
  if (/^\d+$/.test(raw)) {
    const suffix = BENEFIT_SUFFIX[type]
    return `${formatRupees(raw)}${suffix ? ` ${suffix}` : ''}`
  }
  return raw || humanize(type)
}

function ReadOnlyFact({ label, children }) {
  return (
    <div className="sce-readonly">
      <span className="sce-readonly-label">{label}</span>
      <div className="sce-readonly-value">{children}</div>
    </div>
  )
}

function CharCount({ value, max }) {
  const len = String(value ?? '').length
  const over = len > max
  return (
    <span className={`sce-char-count${over ? ' sce-char-over' : ''}`} aria-live="polite">
      {len}/{max}
    </span>
  )
}

function FieldError({ errors, name }) {
  const msg = errors[name]
  if (!msg) return null
  return (
    <span className="sce-field-error" role="alert">
      {msg}
    </span>
  )
}

function ReorderButtons({ index, total, onMove }) {
  return (
    <div className="sce-reorder">
      <button type="button" className="sce-icon-btn" disabled={index <= 0} onClick={() => onMove(index, -1)} aria-label="Move up">
        ↑
      </button>
      <button type="button" className="sce-icon-btn" disabled={index >= total - 1} onClick={() => onMove(index, 1)} aria-label="Move down">
        ↓
      </button>
    </div>
  )
}

function moveItem(list, index, delta) {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export default function SchemeContentEditor() {
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(null)
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [meta, setMeta] = useState(null)
  const [schemeFacts, setSchemeFacts] = useState(null)
  const [draft, setDraft] = useState(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveNotice, setSaveNotice] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.department?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q),
    )
  }, [list, search])

  const dirty = draft && savedSnapshot ? draftSnapshot(draft) !== savedSnapshot : false

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    setForbidden(false)
    try {
      const rows = await fetchSchemeContentList()
      setList(Array.isArray(rows) ? rows : [])
    } catch (err) {
      if (err?.code === 'FORBIDDEN') {
        setForbidden(true)
      } else {
        setListError(err?.message ?? 'Could not load schemes')
      }
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const applyDetail = useCallback((data) => {
    const nextDraft = responseToDraft(data)
    setMeta({
      schemeId: data.schemeId,
      schemeName: data.schemeName,
      department: data.department,
      contentSource: data.contentSource,
      updatedBy: data.updatedBy,
      updatedAt: data.updatedAt,
    })
    setSchemeFacts(data.scheme ?? null)
    setDraft(nextDraft)
    setSavedSnapshot(draftSnapshot(nextDraft))
    setFieldErrors({})
    setLoadError(null)
    setConflict(false)
    setSaveNotice(null)
  }, [])

  const loadDetail = useCallback(async (schemeId) => {
    setDetailLoading(true)
    setLoadError(null)
    try {
      const data = await fetchSchemeContent(schemeId)
      if (!data) {
        setLoadError('Scheme not found')
        setDraft(null)
        setMeta(null)
        return
      }
      applyDetail(data)
    } catch (err) {
      if (err?.code === 'FORBIDDEN') {
        setForbidden(true)
      } else {
        setLoadError(err?.message ?? 'Load failed')
      }
    } finally {
      setDetailLoading(false)
    }
  }, [applyDetail])

  const trySelectScheme = useCallback(
    (schemeId) => {
      if (schemeId === selectedId) return
      if (dirty) {
        const ok = window.confirm('You have unsaved changes. Discard them and switch scheme?')
        if (!ok) return
      }
      setSelectedId(schemeId)
      loadDetail(schemeId)
    },
    [dirty, loadDetail, selectedId],
  )

  useEffect(() => {
    if (!dirty) return undefined
    function onBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const openHistory = async () => {
    if (!selectedId) return
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const rows = await fetchSchemeContentHistory(selectedId)
      setHistory(Array.isArray(rows) ? rows : [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSave = async () => {
    if (!draft || !selectedId) return
    const errors = validateSchemeContentDraft(draft)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setSaveNotice({ type: 'error', text: 'Fix validation errors before saving.' })
      return
    }
    setSaving(true)
    setSaveNotice(null)
    setConflict(false)
    try {
      const saved = await saveSchemeContent(selectedId, savePayload(draft))
      applyDetail(saved)
      setSaveNotice({ type: 'success', text: 'Saved successfully.' })
      await loadList()
    } catch (err) {
      if (err?.code === 'CONFLICT') {
        setConflict(true)
        setSaveNotice({
          type: 'error',
          text: 'Another officer saved this scheme while you were editing. Reload to get the latest version.',
        })
      } else if (err?.code === 'VALIDATION') {
        setFieldErrors(err.fieldErrors ?? {})
        setSaveNotice({ type: 'error', text: 'Server rejected some fields.' })
      } else if (err?.code === 'FORBIDDEN') {
        setForbidden(true)
      } else {
        setSaveNotice({ type: 'error', text: err?.message ?? 'Save failed' })
      }
    } finally {
      setSaving(false)
    }
  }

  const updateDraft = (patch) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  if (forbidden) {
    return (
      <section className="sce-root" data-testid="scheme-content-forbidden">
        <div className="sce-forbidden">
          <h1>Scheme content unavailable</h1>
          <p role="status">Your role cannot edit citizen-facing scheme content. Contact a scheme department administrator if you need access.</p>
          <Link to="/" className="sce-btn sce-btn-secondary">
            Back to home
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="sce-root">
      <header className="sce-header">
        <div>
          <h1 className="sce-title">Scheme Content Editor</h1>
          <p className="sce-subtitle">Overview, benefits, eligibility guidance, documents, steps, FAQs, and helpline shown on the citizen portal</p>
        </div>
        <div className="sce-header-actions">
          <Link to="/schemes" className="sce-btn sce-btn-secondary">
            ← Scheme Management
          </Link>
        </div>
      </header>

      {listError && (
        <div className="sce-banner sce-banner-error" role="alert">
          {listError}
          <button type="button" className="sce-link-btn" onClick={loadList}>
            Retry
          </button>
        </div>
      )}

      <div className="sce-layout">
        <aside className="sce-list-panel">
          <label className="sce-search-label">
            Search schemes
            <input
              type="search"
              className="sce-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, department, category…"
            />
          </label>
          {listLoading ? (
            <p className="sce-muted">Loading schemes…</p>
          ) : (
            <ul className="sce-scheme-list" role="listbox" aria-label="Schemes">
              {filteredList.map((item) => {
                const chip = listChip(item)
                const active = item.schemeId === selectedId
                return (
                  <li key={item.schemeId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`sce-scheme-item${active ? ' sce-scheme-item-active' : ''}`}
                      onClick={() => trySelectScheme(item.schemeId)}
                    >
                      <span className="sce-scheme-name">{item.name}</span>
                      <span className="sce-scheme-dept">{item.department}</span>
                      <span className={chip.className}>{chip.label}</span>
                    </button>
                  </li>
                )
              })}
              {!filteredList.length && !listLoading ? (
                <li className="sce-muted">No schemes match your search.</li>
              ) : null}
            </ul>
          )}
        </aside>

        <section className="sce-editor-panel" aria-busy={detailLoading}>
          {!selectedId && (
            <p className="sce-placeholder">Select a scheme from the list to edit its citizen-facing content.</p>
          )}
          {selectedId && loadError && (
            <div className="sce-banner sce-banner-error" role="alert">
              {loadError}
            </div>
          )}
          {selectedId && draft && meta && (
            <>
              <div className="sce-editor-toolbar">
                <div>
                  <h2 className="sce-scheme-heading">{meta.schemeName}</h2>
                  <p className="sce-muted">
                    {meta.department}
                    {meta.updatedBy ? ` · Last saved by ${meta.updatedBy}` : ''}
                    {draft.version != null ? ` · Version ${draft.version}` : ''}
                  </p>
                </div>
                <div className="sce-toolbar-buttons">
                  <button
                    type="button"
                    className="sce-btn sce-btn-secondary"
                    onClick={() => window.open(citizenSchemePreviewUrl(selectedId), '_blank', 'noopener,noreferrer')}
                  >
                    Preview on citizen portal
                  </button>
                  <button type="button" className="sce-btn sce-btn-secondary" onClick={openHistory}>
                    History
                  </button>
                  {conflict && (
                    <button type="button" className="sce-btn sce-btn-secondary" onClick={() => loadDetail(selectedId)}>
                      Reload
                    </button>
                  )}
                  <button type="button" className="sce-btn sce-btn-primary" disabled={saving || !dirty} onClick={handleSave}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {saveNotice && (
                <div className={`sce-banner sce-banner-${saveNotice.type}`} role="status">
                  {saveNotice.text}
                </div>
              )}
              {dirty && !saveNotice && (
                <p className="sce-unsaved" role="status">
                  Unsaved changes
                </p>
              )}

              <div className="sce-sections">
                <section className="sce-section" aria-labelledby="sce-overview-heading">
                  <div className="sce-section-head">
                    <h3 id="sce-overview-heading">Overview</h3>
                  </div>
                  <p className="sce-hint">
                    Shown at the top of the scheme page. Leave blank to show the scheme description.
                  </p>
                  <ReadOnlyFact label="Current scheme description">
                    {schemeFacts?.description ? <p>{schemeFacts.description}</p> : <p className="sce-muted">No description on the scheme record.</p>}
                  </ReadOnlyFact>
                  <div className="sce-field-grid">
                    <label>
                      Overview (EN)
                      <textarea
                        rows={4}
                        value={draft.overview ?? ''}
                        onChange={(e) => updateDraft({ overview: e.target.value })}
                      />
                      <CharCount value={draft.overview} max={LIMITS.overview} />
                      <FieldError errors={fieldErrors} name="overview" />
                    </label>
                    <label>
                      Overview (GU)
                      <textarea
                        rows={4}
                        value={draft.overviewGu ?? ''}
                        onChange={(e) => updateDraft({ overviewGu: e.target.value })}
                      />
                      <CharCount value={draft.overviewGu} max={LIMITS.overview} />
                      <FieldError errors={fieldErrors} name="overviewGu" />
                    </label>
                  </div>
                </section>

                <section className="sce-section" aria-labelledby="sce-benefits-heading">
                  <div className="sce-section-head">
                    <h3 id="sce-benefits-heading">Benefits</h3>
                  </div>
                  <p className="sce-hint">
                    The benefit type and amounts come from the scheme record and are changed in{' '}
                    <Link to="/schemes">Scheme Management</Link>. Add plain-language details for citizens below.
                  </p>
                  <ReadOnlyFact label="Benefit shown to citizens">
                    <strong>{formatBenefitHeadline(schemeFacts?.benefitType, schemeFacts?.benefitValue)}</strong>
                    {schemeFacts?.benefitType ? <span className="sce-muted"> · {humanize(schemeFacts.benefitType)}</span> : null}
                  </ReadOnlyFact>
                  {(schemeFacts?.benefitComponents ?? []).length > 0 && (
                    <table className="sce-facts-table">
                      <thead>
                        <tr>
                          <th scope="col">Course</th>
                          <th scope="col">Tuition</th>
                          <th scope="col">Boarding</th>
                          <th scope="col">Books</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schemeFacts.benefitComponents.map((c) => (
                          <tr key={c.courseCategory}>
                            <th scope="row">{humanize(c.courseCategory)}</th>
                            <td>{formatRupees(c.tuitionAmount)}</td>
                            <td>{formatRupees(c.boardingAmount)}</td>
                            <td>{formatRupees(c.booksAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="sce-field-grid">
                    <label>
                      Benefit details (EN)
                      <textarea
                        rows={3}
                        value={draft.benefitsNote ?? ''}
                        onChange={(e) => updateDraft({ benefitsNote: e.target.value })}
                        placeholder="e.g. Paid into the beneficiary's bank account every month."
                      />
                      <CharCount value={draft.benefitsNote} max={LIMITS.wording} />
                      <FieldError errors={fieldErrors} name="benefitsNote" />
                    </label>
                    <label>
                      Benefit details (GU)
                      <textarea
                        rows={3}
                        value={draft.benefitsNoteGu ?? ''}
                        onChange={(e) => updateDraft({ benefitsNoteGu: e.target.value })}
                      />
                      <CharCount value={draft.benefitsNoteGu} max={LIMITS.wording} />
                      <FieldError errors={fieldErrors} name="benefitsNoteGu" />
                    </label>
                  </div>
                </section>

                <section className="sce-section" aria-labelledby="sce-eligibility-heading">
                  <div className="sce-section-head">
                    <h3 id="sce-eligibility-heading">Who can apply</h3>
                  </div>
                  <p className="sce-hint">
                    These criteria are the scheme&apos;s eligibility rules. They also drive the citizen eligibility check, so
                    they can&apos;t be changed here; use <Link to="/schemes">Scheme Management</Link> or the{' '}
                    <Link to="/scheme-simulator">Scheme Simulator</Link>. Add guidance for citizens below.
                  </p>
                  {(schemeFacts?.eligibility ?? []).length > 0 ? (
                    <ul className="sce-criteria" aria-label="Eligibility criteria">
                      {schemeFacts.eligibility.map((c, i) => (
                        <li key={`${c.key}-${i}`}>
                          <span className="sce-criteria-label">{c.label}</span>
                          <span className="sce-criteria-value">{formatCriterionValue(c.value, c.source)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sce-muted">No specific eligibility criteria are published for this scheme.</p>
                  )}
                  <div className="sce-field-grid">
                    <label>
                      Eligibility guidance (EN)
                      <textarea
                        rows={3}
                        value={draft.eligibilityNote ?? ''}
                        onChange={(e) => updateDraft({ eligibilityNote: e.target.value })}
                        placeholder="e.g. Applicants must be widowed; remarried widows are not eligible."
                      />
                      <CharCount value={draft.eligibilityNote} max={LIMITS.wording} />
                      <FieldError errors={fieldErrors} name="eligibilityNote" />
                    </label>
                    <label>
                      Eligibility guidance (GU)
                      <textarea
                        rows={3}
                        value={draft.eligibilityNoteGu ?? ''}
                        onChange={(e) => updateDraft({ eligibilityNoteGu: e.target.value })}
                      />
                      <CharCount value={draft.eligibilityNoteGu} max={LIMITS.wording} />
                      <FieldError errors={fieldErrors} name="eligibilityNoteGu" />
                    </label>
                  </div>
                </section>

                <section className="sce-section">
                  <div className="sce-section-head">
                    <h3>Required documents</h3>
                    <button
                      type="button"
                      className="sce-btn sce-btn-secondary sce-btn-small"
                      disabled={(draft.documentsRequired?.length ?? 0) >= LIMITS.docsMax}
                      onClick={() =>
                        updateDraft({ documentsRequired: [...(draft.documentsRequired ?? []), emptyDoc()] })
                      }
                    >
                      + Add document
                    </button>
                  </div>
                  <FieldError errors={fieldErrors} name="documentsRequired" />
                  {(draft.documentsRequired ?? []).map((doc, i) => (
                    <div className="sce-card" key={`doc-${i}`}>
                      <div className="sce-card-head">
                        <span className="sce-card-index">#{i + 1}</span>
                        <ReorderButtons
                          index={i}
                          total={draft.documentsRequired.length}
                          onMove={(idx, delta) =>
                            updateDraft({ documentsRequired: moveItem(draft.documentsRequired, idx, delta) })
                          }
                        />
                        <button
                          type="button"
                          className="sce-link-btn sce-danger"
                          onClick={() =>
                            updateDraft({
                              documentsRequired: draft.documentsRequired.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="sce-field-grid">
                        <label>
                          Title (EN) *
                          <input
                            value={doc.title ?? ''}
                            onChange={(e) => {
                              const documentsRequired = [...draft.documentsRequired]
                              documentsRequired[i] = { ...doc, title: e.target.value }
                              updateDraft({ documentsRequired })
                            }}
                          />
                          <CharCount value={doc.title} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`documentsRequired[${i}].title`} />
                        </label>
                        <label>
                          Title (GU)
                          <input
                            value={doc.titleGu ?? ''}
                            onChange={(e) => {
                              const documentsRequired = [...draft.documentsRequired]
                              documentsRequired[i] = { ...doc, titleGu: e.target.value }
                              updateDraft({ documentsRequired })
                            }}
                          />
                          <CharCount value={doc.titleGu} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`documentsRequired[${i}].titleGu`} />
                        </label>
                      </div>
                      <label>
                        Note (EN)
                        <textarea
                          rows={2}
                          value={doc.note ?? ''}
                          onChange={(e) => {
                            const documentsRequired = [...draft.documentsRequired]
                            documentsRequired[i] = { ...doc, note: e.target.value }
                            updateDraft({ documentsRequired })
                          }}
                        />
                        <CharCount value={doc.note} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`documentsRequired[${i}].note`} />
                      </label>
                      <label>
                        Note (GU)
                        <textarea
                          rows={2}
                          value={doc.noteGu ?? ''}
                          onChange={(e) => {
                            const documentsRequired = [...draft.documentsRequired]
                            documentsRequired[i] = { ...doc, noteGu: e.target.value }
                            updateDraft({ documentsRequired })
                          }}
                        />
                        <CharCount value={doc.noteGu} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`documentsRequired[${i}].noteGu`} />
                      </label>
                    </div>
                  ))}
                </section>

                <section className="sce-section">
                  <div className="sce-section-head">
                    <h3>Application steps</h3>
                    <button
                      type="button"
                      className="sce-btn sce-btn-secondary sce-btn-small"
                      disabled={(draft.applicationSteps?.length ?? 0) >= LIMITS.stepsMax}
                      onClick={() =>
                        updateDraft({ applicationSteps: [...(draft.applicationSteps ?? []), emptyStep()] })
                      }
                    >
                      + Add step
                    </button>
                  </div>
                  <FieldError errors={fieldErrors} name="applicationSteps" />
                  {(draft.applicationSteps ?? []).map((step, i) => (
                    <div className="sce-card" key={`step-${i}`}>
                      <div className="sce-card-head">
                        <span className="sce-card-index">Step {i + 1}</span>
                        <ReorderButtons
                          index={i}
                          total={draft.applicationSteps.length}
                          onMove={(idx, delta) =>
                            updateDraft({ applicationSteps: moveItem(draft.applicationSteps, idx, delta) })
                          }
                        />
                        <button
                          type="button"
                          className="sce-link-btn sce-danger"
                          onClick={() =>
                            updateDraft({
                              applicationSteps: draft.applicationSteps.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <div className="sce-field-grid">
                        <label>
                          Title (EN) *
                          <input
                            value={step.title ?? ''}
                            onChange={(e) => {
                              const applicationSteps = [...draft.applicationSteps]
                              applicationSteps[i] = { ...step, title: e.target.value }
                              updateDraft({ applicationSteps })
                            }}
                          />
                          <CharCount value={step.title} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`applicationSteps[${i}].title`} />
                        </label>
                        <label>
                          Title (GU)
                          <input
                            value={step.titleGu ?? ''}
                            onChange={(e) => {
                              const applicationSteps = [...draft.applicationSteps]
                              applicationSteps[i] = { ...step, titleGu: e.target.value }
                              updateDraft({ applicationSteps })
                            }}
                          />
                          <CharCount value={step.titleGu} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`applicationSteps[${i}].titleGu`} />
                        </label>
                      </div>
                      <label>
                        Detail (EN)
                        <textarea
                          rows={2}
                          value={step.detail ?? ''}
                          onChange={(e) => {
                            const applicationSteps = [...draft.applicationSteps]
                            applicationSteps[i] = { ...step, detail: e.target.value }
                            updateDraft({ applicationSteps })
                          }}
                        />
                        <CharCount value={step.detail} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`applicationSteps[${i}].detail`} />
                      </label>
                      <label>
                        Detail (GU)
                        <textarea
                          rows={2}
                          value={step.detailGu ?? ''}
                          onChange={(e) => {
                            const applicationSteps = [...draft.applicationSteps]
                            applicationSteps[i] = { ...step, detailGu: e.target.value }
                            updateDraft({ applicationSteps })
                          }}
                        />
                        <CharCount value={step.detailGu} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`applicationSteps[${i}].detailGu`} />
                      </label>
                    </div>
                  ))}
                </section>

                <section className="sce-section">
                  <div className="sce-section-head">
                    <h3>FAQs</h3>
                    <button
                      type="button"
                      className="sce-btn sce-btn-secondary sce-btn-small"
                      disabled={(draft.faqs?.length ?? 0) >= LIMITS.faqsMax}
                      onClick={() => updateDraft({ faqs: [...(draft.faqs ?? []), emptyFaq()] })}
                    >
                      + Add FAQ
                    </button>
                  </div>
                  <FieldError errors={fieldErrors} name="faqs" />
                  {(draft.faqs ?? []).map((faq, i) => (
                    <div className="sce-card" key={`faq-${i}`}>
                      <div className="sce-card-head">
                        <span className="sce-card-index">FAQ {i + 1}</span>
                        <ReorderButtons
                          index={i}
                          total={draft.faqs.length}
                          onMove={(idx, delta) => updateDraft({ faqs: moveItem(draft.faqs, idx, delta) })}
                        />
                        <button
                          type="button"
                          className="sce-link-btn sce-danger"
                          onClick={() => updateDraft({ faqs: draft.faqs.filter((_, j) => j !== i) })}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="sce-field-grid">
                        <label>
                          Question (EN) *
                          <input
                            value={faq.question ?? ''}
                            onChange={(e) => {
                              const faqs = [...draft.faqs]
                              faqs[i] = { ...faq, question: e.target.value }
                              updateDraft({ faqs })
                            }}
                          />
                          <CharCount value={faq.question} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`faqs[${i}].question`} />
                        </label>
                        <label>
                          Question (GU)
                          <input
                            value={faq.questionGu ?? ''}
                            onChange={(e) => {
                              const faqs = [...draft.faqs]
                              faqs[i] = { ...faq, questionGu: e.target.value }
                              updateDraft({ faqs })
                            }}
                          />
                          <CharCount value={faq.questionGu} max={LIMITS.title} />
                          <FieldError errors={fieldErrors} name={`faqs[${i}].questionGu`} />
                        </label>
                      </div>
                      <label>
                        Answer (EN) *
                        <textarea
                          rows={2}
                          value={faq.answer ?? ''}
                          onChange={(e) => {
                            const faqs = [...draft.faqs]
                            faqs[i] = { ...faq, answer: e.target.value }
                            updateDraft({ faqs })
                          }}
                        />
                        <CharCount value={faq.answer} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`faqs[${i}].answer`} />
                      </label>
                      <label>
                        Answer (GU)
                        <textarea
                          rows={2}
                          value={faq.answerGu ?? ''}
                          onChange={(e) => {
                            const faqs = [...draft.faqs]
                            faqs[i] = { ...faq, answerGu: e.target.value }
                            updateDraft({ faqs })
                          }}
                        />
                        <CharCount value={faq.answerGu} max={LIMITS.note} />
                        <FieldError errors={fieldErrors} name={`faqs[${i}].answerGu`} />
                      </label>
                    </div>
                  ))}
                </section>

                <section className="sce-section">
                  <h3>Helpline &amp; official link</h3>
                  <div className="sce-field-grid">
                    <label>
                      Helpline label
                      <input
                        value={draft.helplineLabel ?? ''}
                        onChange={(e) => updateDraft({ helplineLabel: e.target.value })}
                      />
                      <CharCount value={draft.helplineLabel} max={LIMITS.title} />
                      <FieldError errors={fieldErrors} name="helplineLabel" />
                    </label>
                    <label>
                      Helpline number
                      <input
                        value={draft.helplineNumber ?? ''}
                        onChange={(e) => updateDraft({ helplineNumber: e.target.value })}
                        placeholder="e.g. 1800-123-4567"
                      />
                      <FieldError errors={fieldErrors} name="helplineNumber" />
                    </label>
                  </div>
                  <label>
                    Official URL (https)
                    <input
                      value={draft.officialUrl ?? ''}
                      onChange={(e) => updateDraft({ officialUrl: e.target.value })}
                      placeholder="https://"
                    />
                    <FieldError errors={fieldErrors} name="officialUrl" />
                  </label>
                </section>
              </div>
            </>
          )}
        </section>
      </div>

      {historyOpen && (
        <div className="sce-drawer-overlay" role="presentation" onClick={() => setHistoryOpen(false)}>
          <aside
            className="sce-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Content change history"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sce-drawer-head">
              <h2>History</h2>
              <button type="button" className="sce-icon-btn" onClick={() => setHistoryOpen(false)} aria-label="Close">
                ×
              </button>
            </header>
            {historyLoading ? (
              <p className="sce-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="sce-muted">No history yet.</p>
            ) : (
              <ul className="sce-history-list">
                {history.map((ev, idx) => (
                  <li key={`${ev.timestamp}-${idx}`}>
                    <time className="sce-history-time">{ev.timestamp}</time>
                    <div className="sce-history-actor">{ev.actor}</div>
                    <div className="sce-history-detail">{ev.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
