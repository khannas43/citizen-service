import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchApprovals } from '../approvalsApi'
import { fmtDate } from '../approvalsFormat'

function statusClass(status) {
  if (status === 'PENDING') return 'cert-pill--pending'
  if (status === 'ANSWERED' || status === 'CONFIRMED' || status === 'GRANTED') return 'cert-pill--issued'
  return 'cert-pill--pending'
}

function singleNs(item) {
  return item.purpose === 'HOUSEHOLD_BENEFIT' ? 'approvals.uc5' : 'approvals.uc4'
}

function rowStatus(item, t) {
  if (item.kind === 'CONSENT_SINGLE') {
    const ns = singleNs(item)
    if (item.status === 'ENDED') return t(`${ns}.status.ENDED`)
    if (item.waiting_for_parent) return t(`${ns}.statusWaitingParent`)
    if (item.result) return t(`${ns}.result.${item.result}`)
    return t(`${ns}.status.${item.status}`, { defaultValue: item.status })
  }
  return t(`approvals.status.${item.status}`, { defaultValue: item.status })
}

function Row({ item, t, i18n }) {
  const about = item.kind === 'CONSENT_GROUP'
    ? (item.child?.name || t('approvals.aChild'))
    : item.kind === 'CONSENT_SINGLE'
      ? (item.purpose === 'HOUSEHOLD_BENEFIT'
        ? t('approvals.uc5.rowSelf')
        : (item.role === 'parent' && item.student?.name
          ? t('approvals.uc4.rowFor', { student: item.student.name })
          : t('approvals.uc4.rowSelf')))
      : item.kind === 'INVITATION'
        ? t('approvals.invite.row')
        : item.kind === 'DEATH_NOTICE'
          ? t('approvals.death.row')
          : item.summary
  const depts = item.kind === 'CONSENT_GROUP' ? (item.lines?.length || 0) : null
  return (
    <Link to={`/approvals/${item.key}`} className="consent-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="consent-card-header">
        <div className="consent-card-dept">
          <strong>{about}</strong>
          {depts != null && (
            <span className="muted small" style={{ marginLeft: 8 }}>
              {t('approvals.deptCount', { count: depts })}
            </span>
          )}
        </div>
        <span className={`cert-status-pill ${statusClass(item.status)}`}>
          {rowStatus(item, t)}
        </span>
      </div>
      <div className="consent-meta-grid">
        <div className="consent-meta-row">
          <span className="cert-meta-label">{item.kind === 'INVITATION' || item.kind === 'DEATH_NOTICE' ? t('approvals.invite.invitedOn') : t('approvals.askedOn')}</span>
          <span className="cert-meta-value">{fmtDate(item.asked_at, i18n.language)}</span>
        </div>
        {item.kind !== 'INVITATION' && item.kind !== 'DEATH_NOTICE' && (
          <div className="consent-meta-row">
            <span className="cert-meta-label">{t('approvals.answerBy')}</span>
            <span className="cert-meta-value">{fmtDate(item.respond_by, i18n.language)}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function Approvals() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: !s.data }))
    fetchApprovals()
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
      <h1 className="section-heading">{t('approvals.title')}</h1>
      <p className="muted">{t('approvals.intro')}</p>
      <nav aria-label={t('approvals.report.menuTitle')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <Link to="/approvals/report" className="btn-secondary">{t('approvals.report.menuReport')}</Link>
        <Link to="/approvals/reports" className="btn-secondary">{t('approvals.report.menuMine')}</Link>
      </nav>
      {items.length === 0 && <p className="muted">{t('requests.none')}</p>}
      {items.map((i) => <Row key={i.key} item={i} t={t} i18n={i18n} />)}
    </div>
  )
}
