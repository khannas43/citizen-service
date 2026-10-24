import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState, useMemo } from 'react'
import { loadCitizenProfile } from '../auth'
import { displayAppNo, fetchMyApplications, certificateDownloadUrl, fetchClarifications, fetchNotifications } from '../api'
import AISearch from '../components/AISearch'
import InfoRequestSection, { hasPendingInfoRequest } from '../components/InfoRequestSection'
import { serviceLabel, statusLabel, appMetaLabel } from '../labels'

const STATUS_CLASS = {
  PENDING:   'badge-amber',
  APPROVED:  'badge-green',
  REJECTED:  'badge-red',
  ESCALATED: 'badge-red',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function AppDetailPanel({ app, profile, onClose, t }) {
  if (!app) return null
  const status = app.status || 'PENDING'
  const canDownload = app.service === 'caste' && status === 'APPROVED'
  const meta = appMetaLabel(app, t)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal app-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="complaints-modal-header">
          <h2 style={{ margin: 0 }}>{t('myApps.detailTitle')}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="app-detail-body">
          <div className="app-detail-row">
            <span className="app-detail-label">{t('myApps.detailAppNo')}</span>
            <span className="tracking-box small">{displayAppNo(app)}</span>
          </div>
          <div className="app-detail-row">
            <span className="app-detail-label">{t('myApps.detailService')}</span>
            <span>
              <strong>{serviceLabel(app.service, t)}</strong>
              {meta && <span className="muted small" style={{ marginLeft: '0.5rem' }}>({meta})</span>}
            </span>
          </div>
          <div className="app-detail-row">
            <span className="app-detail-label">{t('myApps.detailStatus')}</span>
            <span className={`status-badge ${STATUS_CLASS[status] || 'badge-grey'}`}>
              {statusLabel(status, t)}
            </span>
          </div>
          <div className="app-detail-row">
            <span className="app-detail-label">{t('myApps.detailSubmitted')}</span>
            <span>{formatDate(app.createdAt)}</span>
          </div>
          {app.currentTask && (
            <div className="app-detail-row">
              <span className="app-detail-label">{t('myApps.detailCurrentStep')}</span>
              <span className="muted">{app.currentTask}</span>
            </div>
          )}
          {app.engineRef && (
            <div className="app-detail-row">
              <span className="app-detail-label">{t('myApps.detailReference')}</span>
              <span className="mono-cell muted small">{app.engineRef}</span>
            </div>
          )}
          {profile && (
            <InfoRequestSection item={app} profile={profile} t={t} />
          )}
        </div>
        {canDownload && (
          <div className="app-detail-footer">
            <a className="btn-primary" href={certificateDownloadUrl(app.engineRef)} download>
              📄 {t('myApps.downloadCert')}
            </a>
          </div>
        )}
        {!canDownload && (
          <div className="app-detail-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('myApps.close')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = loadCitizenProfile()
  const displayName = profile?.name || ''

  // My Applications state
  const [apps, setApps] = useState([])
  const [appsLoading, setAppsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [serviceFilter, setServiceFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedApp, setSelectedApp] = useState(null)
  const [infoClarifications, setInfoClarifications] = useState([])
  const [notifications, setNotifications] = useState([])

  // Load applications from all services
  useEffect(() => {
    if (!profile?.aadhaarRef) { setAppsLoading(false); return }
    fetchMyApplications(profile.aadhaarRef).then((data) => {
      setApps(data)
      setAppsLoading(false)
    })
    const id = setInterval(() => {
      fetchMyApplications(profile.aadhaarRef).then(setApps)
    }, 15000)
    return () => clearInterval(id)
  }, [profile?.aadhaarRef])

  useEffect(() => {
    if (!profile?.aadhaarRef) return
    async function loadInfo() {
      const [clarifications, notifs] = await Promise.all([
        fetchClarifications(profile.aadhaarRef, null, 'OFFICER_TO_CITIZEN'),
        fetchNotifications(profile.aadhaarRef),
      ])
      setInfoClarifications(clarifications)
      setNotifications(notifs)
    }
    loadInfo()
    const id = setInterval(loadInfo, 10000)
    return () => clearInterval(id)
  }, [profile?.aadhaarRef])

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  function sortIndicator(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const mul = sortDir === 'asc' ? 1 : -1
    return apps
      .filter((a) => {
        if (serviceFilter !== 'ALL' && a.service !== serviceFilter) return false
        if (statusFilter !== 'ALL' && (a.status || 'PENDING') !== statusFilter) return false
        if (!q) return true
        const ref = displayAppNo(a).toLowerCase()
        const svc = serviceLabel(a.service, t).toLowerCase()
        return ref.includes(q) || svc.includes(q) || a.engineRef?.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (sortField === 'appNo')   return mul * displayAppNo(a).localeCompare(displayAppNo(b))
        if (sortField === 'service') return mul * (a.service || '').localeCompare(b.service || '')
        if (sortField === 'status')  return mul * (a.status || '').localeCompare(b.status || '')
        return mul * (new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      })
  }, [apps, search, sortField, sortDir, serviceFilter, statusFilter])

  const hasFilter = search || serviceFilter !== 'ALL' || statusFilter !== 'ALL'

  return (
    <div className="home-screen">

      {/* ── Welcome strip ── */}
      <section className="welcome-strip">
        <div className="welcome-text">
          <h1 className="welcome-greeting">
            {t('myApps.greeting', { name: displayName })}
          </h1>
          <p className="welcome-sub">
            {t('myApps.welcomeSub')}
          </p>
        </div>
        <AISearch profile={profile} />
      </section>

      {/* ── My Applications ── */}
      <section className="my-apps-section">
        <div className="my-apps-header">
          <div className="my-apps-header-left">
            <h2 className="section-heading" style={{ margin: 0 }}>📋 {t('myApps.sectionTitle')}</h2>
            <span className="muted small">{t('myApps.totalRefresh', { count: apps.length })}</span>
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/apply/caf')}>
            ➕ {t('myApps.newApplication')}
          </button>
        </div>

        {/* Search + filters — single row */}
        <div className="apps-toolbar">
          <div className="apps-search-wrap">
            <span className="apps-search-icon">🔍</span>
            <input
              type="text"
              className="apps-search"
              placeholder={t('myApps.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="apps-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          <select className="complaints-filter-select" style={{ minWidth: '150px' }}
            value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            <option value="ALL">{t('myApps.allServices')}</option>
            {['caste', 'marriage', 'pension', 'familyMb', 'scheme'].map((k) => (
              <option key={k} value={k}>{serviceLabel(k, t)}</option>
            ))}
          </select>

          <select className="complaints-filter-select" style={{ minWidth: '130px' }}
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">{t('myApps.allStatuses')}</option>
            <option value="PENDING">{statusLabel('PENDING', t)}</option>
            <option value="APPROVED">{statusLabel('APPROVED', t)}</option>
            <option value="ESCALATED">{statusLabel('ESCALATED', t)}</option>
          </select>

          {hasFilter && (
            <button type="button" className="complaints-filter-clear"
              onClick={() => { setSearch(''); setServiceFilter('ALL'); setStatusFilter('ALL') }}>
              ✕ {t('common.clear')}
            </button>
          )}
        </div>

        {appsLoading && <p className="muted" style={{ padding: '1rem 0' }}>{t('myApps.loadingApps')}</p>}

        {!appsLoading && apps.length === 0 && (
          <div className="apps-empty">
            <div className="apps-empty-icon">📭</div>
            <p>{t('myApps.empty')}</p>
            <button type="button" className="btn-primary" onClick={() => navigate('/apply/caf')}>
              ➕ {t('myApps.firstApp')}
            </button>
          </div>
        )}

        {!appsLoading && apps.length > 0 && (
          <div className="complaints-table-wrap card">
            <table className="complaints-table">
              <thead>
                <tr>
                  <th>
                    <button className={`th-sort${sortField === 'appNo' ? ' active' : ''}`} onClick={() => toggleSort('appNo')}>
                      {t('myApps.colAppNo')}{sortIndicator('appNo')}
                    </button>
                  </th>
                  <th>
                    <button className={`th-sort${sortField === 'service' ? ' active' : ''}`} onClick={() => toggleSort('service')}>
                      {t('myApps.colService')}{sortIndicator('service')}
                    </button>
                  </th>
                  <th>
                    <button className={`th-sort${sortField === 'createdAt' ? ' active' : ''}`} onClick={() => toggleSort('createdAt')}>
                      {t('myApps.colSubmitted')}{sortIndicator('createdAt')}
                    </button>
                  </th>
                  <th>
                    <button className={`th-sort${sortField === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                      {t('myApps.colStatus')}{sortIndicator('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                      {t('myApps.noMatch')}
                    </td>
                  </tr>
                )}
                {displayed.map((app) => {
                  const status = app.status || 'PENDING'
                  const display = displayAppNo(app)
                  const meta = appMetaLabel(app, t)
                  const needsInfo = hasPendingInfoRequest(infoClarifications, notifications, app)
                  return (
                    <tr
                      key={app.engineRef + app.service}
                      className="complaints-row complaints-row--clickable"
                      onClick={() => setSelectedApp(app)}
                      title={t('myApps.clickDetails')}
                    >
                      <td>
                        <span className="tracking-box small complaints-ref">{display}</span>
                      </td>
                      <td>
                        <strong>{serviceLabel(app.service, t)}</strong>
                        {meta && <span className="muted small" style={{ display: 'block' }}>{meta}</span>}
                      </td>
                      <td className="muted">{formatDate(app.createdAt)}</td>
                      <td>
                        <span className={`status-badge ${needsInfo ? 'badge-info-required' : (STATUS_CLASS[status] || 'badge-grey')}`}>
                          {needsInfo ? t('myApps.infoRequired') : statusLabel(status, t)}
                        </span>
                        {app.currentTask && (
                          <span className="muted small" style={{ display: 'block', marginTop: '0.2rem' }}>
                            {app.currentTask}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Application detail panel ── */}
      {selectedApp && (
        <AppDetailPanel app={selectedApp} profile={profile} onClose={() => setSelectedApp(null)} t={t} />
      )}
    </div>
  )
}
