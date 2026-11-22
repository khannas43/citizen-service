import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchRecords } from '../approvalsApi'
import DeptAccount from '../components/DeptAccount'
import './MyRecords.css'

export default function MyRecords() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })
  const [open, setOpen] = useState({})              // department source -> expanded; collapsed by default

  const load = useCallback(() => {
    fetchRecords()
      .then((d) => setState({ data: d }))
      .catch((e) => {
        if (e.status === 401) { navigate('/login'); return }
        setState({ error: e.status === 404 ? 'unlinked' : 'failed' })
      })
  }, [navigate])

  useEffect(() => { load() }, [load])

  if (state.loading) return <p className="muted">{t('approvals.loading')}</p>
  if (state.error === 'unlinked') return <p className="muted">{t('requests.unlinked')}</p>
  if (state.error) {
    return (
      <div>
        <p className="muted" role="alert">{t('approvals.failed')}</p>
        <button type="button" className="btn-secondary" onClick={load}>{t('approvals.retry')}</button>
      </div>
    )
  }

  const d = state.data
  return (
    <div className="ut">
      <div>
        <h1 className="section-heading">{t('records.title', { defaultValue: 'My department records' })}</h1>
        <p className="ut-lead">{t('records.intro', { defaultValue: 'What each department holds about you: your connections, cards and applications, the history of bills and payments, and any benefit you receive.' })}</p>
      </div>
      <article className="ut-card" data-testid="my-address">
        <header className="ut-head">
          <div>
            <h3 className="ut-title">{t('records.addressTitle', { defaultValue: 'Your address on record' })}</h3>
            <p className="ut-sub">{d.address.master || t('records.noAddress', { defaultValue: 'No address on record yet' })}</p>
          </div>
        </header>
        {d.address.held_by.length > 0 && (
          <div className="ut-body">
            <h3 className="ut-h3" style={{ margin: 0 }}>{t('records.heldBy', { defaultValue: 'Addresses held by departments' })}</h3>
            <dl className="ut-kv">{d.address.held_by.map((h) => <div key={`${h.department}-${h.address}`}><dt>{h.department}</dt><dd>{h.address}</dd></div>)}</dl>
          </div>
        )}
      </article>
      {d.departments.length === 0 && <p className="ut-note">{t('records.none', { defaultValue: 'No department records are linked to you yet.' })}</p>}
      {d.departments.length > 0 && (
        <div className="ut-tools">
          <button type="button" className="btn-secondary" onClick={() => setOpen(Object.fromEntries(d.departments.map((x) => [x.source, true])))}>{t('records.expandAll', { defaultValue: 'Expand all' })}</button>
          <button type="button" className="btn-secondary" onClick={() => setOpen({})}>{t('records.collapseAll', { defaultValue: 'Collapse all' })}</button>
        </div>
      )}
      {d.departments.map((dep) => {
        const isOpen = !!open[dep.source]
        return (
          <section key={dep.source} aria-label={dep.department} className="ut-box">
            <button type="button" className="ut-box-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [dep.source]: !o[dep.source] }))}>
              <span className="ut-dept"><span aria-hidden="true">{dep.icon}</span><h2>{dep.department}</h2></span>
              <span className="ut-box-meta">{t('records.count', { count: dep.accounts.length, defaultValue: '{{count}} record(s)' })}<span className="ut-chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span></span>
            </button>
            {isOpen && <div className="ut ut-box-body">{dep.accounts.map((a) => <DeptAccount key={`${a.source}-${a.id}`} a={a} />)}</div>}
          </section>
        )
      })}
      <p className="ut-note">{d.note}</p>
    </div>
  )
}
