import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  INTEGRITY_IMPORTS,
  fetchVerificationEventsLastLoaded,
  integrityImportTemplateHeader,
  uploadIntegrityImport,
  validateIntegrityImportFile,
} from '../api'
import './ImportData.css'

const GROUPS = [
  { id: 'beneficiary', title: 'Beneficiary payments' },
  { id: 'payroll', title: 'Payroll and pensions' },
]

function downloadTemplate(name) {
  const header = integrityImportTemplateHeader(name)
  const blob = new Blob([`${header}\n`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-template.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatLastLoaded(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

function atRiskMessage(count) {
  if (!count || count <= 0) return null
  const people = count === 1 ? '1 person has' : `${count} people have`
  return `${people} payments after a recorded death. Run detection to raise alerts.`
}

function ImportCard({ imp, file, result, busy, lastLoadedAt, onPickFile, onUpload }) {
  const inputId = `import-file-${imp.name}`
  const uploadDisabled = !file || busy

  return (
    <article id={`import-${imp.name}`} className="id-card" aria-labelledby={`import-title-${imp.name}`}>
      <h3 id={`import-title-${imp.name}`}>{imp.label}</h3>
      <p className="id-meta">
        Columns: <code>{imp.columns}</code>
      </p>
      <p className="id-meta">Needs first: {imp.needs}</p>
      {imp.hint && <p className="id-meta">{imp.hint}</p>}
      {imp.name === 'verification-events' && lastLoadedAt !== undefined && (
        <p className="id-meta">Last loaded: {lastLoadedAt ?? '—'}</p>
      )}
      <div className="id-actions">
        <button type="button" onClick={() => downloadTemplate(imp.name)}>
          Download template
        </button>
        <label htmlFor={inputId} className={`id-upload${busy ? ' disabled' : ''}`}>
          Choose CSV
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => onPickFile(imp.name, e.target.files?.[0] ?? null, e.target)}
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={uploadDisabled}
          aria-disabled={uploadDisabled}
          onClick={() => onUpload(imp.name)}
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {file && (
        <p className="id-meta" aria-live="polite">
          Selected: {file.name}
        </p>
      )}
      {result?.kind === 'success' && (
        <p className="id-result success" role="status">
          Loaded: {result.imported} new, {result.updated} updated, {result.skipped} already there (skipped)
        </p>
      )}
      {result?.kind === 'success' && atRiskMessage(result.newlyAtRisk) && (
        <p className="id-result success" role="status">
          {atRiskMessage(result.newlyAtRisk)}
        </p>
      )}
      {result?.kind === 'error' && (
        <p className="id-result error" role="alert">
          {result.message} Nothing was loaded.
        </p>
      )}
    </article>
  )
}

/** Load expenditure-integrity pilot data from CSV (department and IT admins only). */
export default function ImportData() {
  const byGroup = useMemo(() => {
    const map = { beneficiary: [], payroll: [] }
    for (const imp of INTEGRITY_IMPORTS) map[imp.group].push(imp)
    return map
  }, [])

  const [files, setFiles] = useState({})
  const [results, setResults] = useState({})
  const [busyName, setBusyName] = useState(null)
  const [anySuccess, setAnySuccess] = useState(false)
  const [verificationLastLoaded, setVerificationLastLoaded] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchVerificationEventsLastLoaded()
      .then((body) => {
        if (!cancelled) setVerificationLastLoaded(formatLastLoaded(body.lastLoadedAt))
      })
      .catch(() => {
        if (!cancelled) setVerificationLastLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pickFile = (name, file, input) => {
    if (input) input.value = ''
    if (!file) {
      setFiles((f) => ({ ...f, [name]: null }))
      return
    }
    const problem = validateIntegrityImportFile(file)
    if (problem) {
      setResults((r) => ({ ...r, [name]: { kind: 'error', message: problem } }))
      setFiles((f) => ({ ...f, [name]: null }))
      return
    }
    setFiles((f) => ({ ...f, [name]: file }))
    setResults((r) => ({ ...r, [name]: null }))
  }

  const upload = async (name) => {
    const file = files[name]
    const problem = validateIntegrityImportFile(file)
    if (problem) {
      setResults((r) => ({ ...r, [name]: { kind: 'error', message: problem } }))
      return
    }
    setBusyName(name)
    try {
      const body = await uploadIntegrityImport(name, file)
      setResults((r) => ({
        ...r,
        [name]: {
          kind: 'success',
          imported: body.imported ?? 0,
          updated: body.updated ?? 0,
          skipped: body.skipped ?? 0,
          newlyAtRisk: body.newlyAtRisk ?? 0,
        },
      }))
      if (name === 'verification-events') {
        fetchVerificationEventsLastLoaded()
          .then((fresh) => setVerificationLastLoaded(formatLastLoaded(fresh.lastLoadedAt)))
          .catch(() => {})
      }
      setAnySuccess(true)
    } catch (err) {
      setResults((r) => ({
        ...r,
        [name]: { kind: 'error', message: err?.message || 'Could not load the file.' },
      }))
    } finally {
      setBusyName(null)
    }
  }

  return (
    <div className="import-data">
      <h1>Load data</h1>
      <p>
        Upload CSV files to the expenditure integrity service. Dates use YYYY-MM-DD. A file is accepted whole or refused
        whole — if it is refused, nothing from it is loaded. Uploading the same file twice is safe: rows already loaded are
        skipped.
      </p>
      <p>
        Load in this order: units before settlements; employees before service events, payroll, pensions and life
        certificates.
      </p>

      {GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`import-group-${g.id}`}>
          <h2 id={`import-group-${g.id}`}>{g.title}</h2>
          {byGroup[g.id].map((imp) => (
            <ImportCard
              key={imp.name}
              imp={imp}
              file={files[imp.name]}
              result={results[imp.name]}
              busy={busyName === imp.name}
              lastLoadedAt={imp.name === 'verification-events' ? verificationLastLoaded : undefined}
              onPickFile={pickFile}
              onUpload={upload}
            />
          ))}
        </section>
      ))}

      {anySuccess && (
        <p className="id-detection-hint" role="status">
          Now run detection from{' '}
          <Link to="/expenditure-integrity">Expenditure integrity</Link>.
        </p>
      )}
    </div>
  )
}
