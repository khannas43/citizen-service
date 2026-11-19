import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchReports } from '../approvalsApi'
import { fmtDate } from '../approvalsFormat'

const STATUSES = ['ROUTED', 'CORRECTED_AT_SOURCE', 'CONFIRMED_AS_IS', 'REJECTED']

function pillClass(status) {
  if (status === 'CORRECTED_AT_SOURCE') return 'cert-pill--issued'
  return 'cert-pill--pending'
}

function Report({ item, t, i18n }) {
  const dept = item.department
    ? t(`requests.dept.${item.department}`, { defaultValue: item.department_name || item.department })
    : item.department_name
  const attr = t(`approvals.report.attr.${item.attribute}`, { defaultValue: item.attribute_label || item.attribute })
  const status = STATUSES.includes(item.status) ? item.status : 'ROUTED'
  const trail = (item.trail && item.trail.length ? item.trail : [{ status: 'ROUTED', at: item.raised_at }])
  return (
    <div className="consent-card" data-testid="my-report">
      <div className="consent-card-header">
        <div className="consent-card-dept"><strong>{attr}</strong></div>
        <span className={`cert-status-pill ${pillClass(status)}`}>
          {t(`approvals.report.status.${status}`)}
        </span>
      </div>
      <div className="consent-meta-grid">
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('approvals.report.recorded')}</span>
          <span className="cert-meta-value">{item.current_value || '—'}</span>
        </div>
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('approvals.report.shouldBe')}</span>
          <span className="cert-meta-value">{item.reported_value}</span>
        </div>
        <div className="consent-meta-row">
          <span className="cert-meta-label">{t('approvals.report.sentTo')}</span>
          <span className="cert-meta-value">{dept}</span>
        </div>
      </div>
      <ol aria-label={t('approvals.report.trail')} style={{ margin: '12px 0', paddingLeft: 20 }}>
        {trail.map((s, i) => {
          const st = STATUSES.includes(s.status) ? s.status : 'ROUTED'
          const last = i === trail.length - 1
          return (
            <li key={`${st}-${i}`} aria-current={last ? 'step' : undefined}>
              <strong>{t(`approvals.report.status.${st}`)}</strong>
              {s.at && <span className="muted small"> — {fmtDate(s.at, i18n.language)}</span>}
            </li>
          )
        })}
      </ol>
      {item.department_note && (
        <p>{t('approvals.report.deptNote', { note: item.department_note })}</p>
      )}
    </div>
  )
}

export default function MyReports() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })

  const load = useCallback(() => {
    fetchReports()
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

  const items = state.data.items || []
  return (
    <div>
      <p><Link to="/approvals">{t('approvals.back')}</Link></p>
      <h1 className="section-heading">{t('approvals.report.mineTitle')}</h1>
      <p className="muted">{t('approvals.report.mineIntro')}</p>
      <p><Link to="/approvals/report" className="btn-secondary">{t('approvals.report.menuReport')}</Link></p>
      {items.length === 0 && <p className="muted">{t('approvals.report.none')}</p>}
      {items.map((r) => <Report key={r.key || r.id} item={r} t={t} i18n={i18n} />)}
    </div>
  )
}
