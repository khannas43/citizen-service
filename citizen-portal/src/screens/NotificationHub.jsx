import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { fetchNotifications, markNotificationRead } from '../api'

const PAGE_SIZE = 10

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return t('common.justNow')
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 172800000) return t('common.yesterday')
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function datePeriod(dateStr, t) {
  const today = new Date(); today.setHours(0,0,0,0)
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)
  const d = new Date(dateStr)
  if (d >= today) return t('common.today')
  if (d >= weekAgo) return t('common.thisWeek')
  return t('common.earlier')
}

function typeIcon(title = '', message = '') {
  const txt = (title + ' ' + message).toLowerCase()
  if (txt.includes('approved') || txt.includes('approval')) return '✅'
  if (txt.includes('disburs') || txt.includes('credit') || txt.includes('payment')) return '💰'
  if (txt.includes('clarif') || txt.includes('action') || txt.includes('required') || txt.includes('info')) return '⚠️'
  if (txt.includes('scheme') || txt.includes('eligible') || txt.includes('eligibility')) return '🔔'
  return '⏳'
}

function isActionRequired(n) {
  const txt = (n.title + ' ' + n.message).toLowerCase()
  return (
    txt.includes('action required') ||
    txt.includes('clarif') ||
    txt.includes('additional information') ||
    txt.includes('info required')
  )
}

// ── All Notifications Tab ────────────────────────────────────────────────────
function AllNotificationsTab({ notifications, onMarkRead }) {
  const { t } = useTranslation()
  const months = t('common.months', { returnObjects: true })
  const [expanded, setExpanded]   = useState(null)
  const [search, setSearch]       = useState('')
  const [monthFilter, setMonth]   = useState('')
  const [yearFilter, setYear]     = useState('')
  const [readFilter, setRead]     = useState('ALL')
  const [sort, setSort]           = useState({ field: 'date', dir: 'desc' })
  const [page, setPage]           = useState(1)

  function toggleSort(field) {
    setSort((s) => ({ field, dir: s.field === field && s.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }
  function sortIcon(field) {
    if (sort.field !== field) return ' ↕'
    return sort.dir === 'asc' ? ' ↑' : ' ↓'
  }

  const availableYears = useMemo(() => {
    const years = new Set(notifications.map((n) => new Date(n.createdAt).getFullYear()))
    return [...years].sort((a, b) => b - a)
  }, [notifications])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const mul = sort.dir === 'asc' ? 1 : -1
    return notifications
      .filter((n) => {
        if (readFilter === 'UNREAD' && n.isRead) return false
        if (readFilter === 'READ'   && !n.isRead) return false
        if (monthFilter !== '') {
          if (new Date(n.createdAt).getMonth() !== parseInt(monthFilter)) return false
        }
        if (yearFilter) {
          if (String(new Date(n.createdAt).getFullYear()) !== yearFilter) return false
        }
        if (q) {
          return (
            (n.title || '').toLowerCase().includes(q) ||
            (n.message || '').toLowerCase().includes(q) ||
            (n.serviceName || '').toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (sort.field === 'title')   return mul * (a.title || '').localeCompare(b.title || '')
        if (sort.field === 'service') return mul * (a.serviceName || '').localeCompare(b.serviceName || '')
        if (sort.field === 'status')  return mul * (Number(a.isRead) - Number(b.isRead))
        return mul * (new Date(a.createdAt) - new Date(b.createdAt))
      })
  }, [notifications, search, monthFilter, yearFilter, readFilter, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function clearFilters() {
    setSearch(''); setMonth(''); setYear(''); setRead('ALL'); setPage(1)
  }
  const hasFilter = search || monthFilter !== '' || yearFilter || readFilter !== 'ALL'

  if (notifications.length === 0) {
    return (
      <div className="notif-empty">
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔔</div>
        <p className="muted">{t('notifications.empty')}</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="apps-toolbar" style={{ marginBottom: '1rem' }}>
        <div className="apps-search-wrap">
          <span className="apps-search-icon">🔍</span>
          <input
            type="text"
            className="apps-search"
            placeholder={t('notifications.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
          {search && (
            <button type="button" className="apps-search-clear" onClick={() => { setSearch(''); setPage(1) }}>✕</button>
          )}
        </div>

        <select
          className="complaints-filter-select"
          value={monthFilter}
          onChange={(e) => { setMonth(e.target.value); setPage(1) }}
          style={{ minWidth: 110 }}
        >
          <option value="">{t('common.allMonths')}</option>
          {(Array.isArray(months) ? months : []).map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>

        <select
          className="complaints-filter-select"
          value={yearFilter}
          onChange={(e) => { setYear(e.target.value); setPage(1) }}
          style={{ minWidth: 100 }}
        >
          <option value="">{t('common.allYears')}</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          className="complaints-filter-select"
          value={readFilter}
          onChange={(e) => { setRead(e.target.value); setPage(1) }}
          style={{ minWidth: 100 }}
        >
          <option value="ALL">{t('common.all')}</option>
          <option value="UNREAD">{t('common.unread')}</option>
          <option value="READ">{t('common.read')}</option>
        </select>

        {hasFilter && (
          <button type="button" className="complaints-filter-clear" onClick={clearFilters}>
            ✕ {t('common.clear')}
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="muted">{t('notifications.noMatch')}</p>
      )}

      {filtered.length > 0 && (
        <>
          <div className="complaints-table-wrap card">
            <table className="complaints-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>
                    <button className={`th-sort${sort.field === 'title' ? ' active' : ''}`} onClick={() => toggleSort('title')}>
                      {t('notifications.notification')}{sortIcon('title')}
                    </button>
                  </th>
                  <th>
                    <button className={`th-sort${sort.field === 'service' ? ' active' : ''}`} onClick={() => toggleSort('service')}>
                      {t('notifications.service')}{sortIcon('service')}
                    </button>
                  </th>
                  <th>{t('notifications.period')}</th>
                  <th>
                    <button className={`th-sort${sort.field === 'date' ? ' active' : ''}`} onClick={() => toggleSort('date')}>
                      {t('notifications.time')}{sortIcon('date')}
                    </button>
                  </th>
                  <th>
                    <button className={`th-sort${sort.field === 'status' ? ' active' : ''}`} onClick={() => toggleSort('status')}>
                      {t('notifications.status')}{sortIcon('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((n) => (
                  <>
                    <tr
                      key={n.id}
                      className={`complaints-row complaints-row--clickable${!n.isRead ? ' notif-tr--unread' : ''}`}
                      onClick={() => {
                        if (!n.isRead) onMarkRead(n.id)
                        setExpanded((prev) => (prev === n.id ? null : n.id))
                      }}
                    >
                      <td style={{ textAlign: 'center', fontSize: '1.1rem' }}>{typeIcon(n.title, n.message)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {!n.isRead && <span className="notif-dot" style={{ flexShrink: 0 }} />}
                          <strong style={{ fontSize: 'var(--text-sm)' }}>{n.title}</strong>
                        </div>
                      </td>
                      <td className="muted small">{n.serviceName || '—'}</td>
                      <td>
                        <span className="notif-period-badge">{datePeriod(n.createdAt, t)}</span>
                      </td>
                      <td className="muted small">{timeAgo(n.createdAt, t)}</td>
                      <td>
                        <span className={`status-badge ${n.isRead ? 'badge-grey' : 'badge-blue'}`}>
                          {n.isRead ? t('common.read') : t('common.unread')}
                        </span>
                      </td>
                    </tr>
                    {expanded === n.id && (
                      <tr key={n.id + '-exp'} className="notif-expanded-row">
                        <td />
                        <td colSpan={5} className="muted small" style={{ paddingTop: 0, paddingBottom: 'var(--space-3)', lineHeight: 1.6 }}>
                          {n.message}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="payments-pagination">
            <span className="muted small">
              {t('notifications.showing', {
                from: (safePage - 1) * PAGE_SIZE + 1,
                to: Math.min(safePage * PAGE_SIZE, filtered.length),
                total: filtered.length,
              })}
            </span>
            <div className="payments-pagination-controls">
              <button type="button" className="payments-page-btn" disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
              <button type="button" className="payments-page-btn" disabled={safePage === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`ell-${i}`} className="payments-page-ellipsis">…</span>
                    : <button
                        key={p}
                        type="button"
                        className={`payments-page-btn${safePage === p ? ' active' : ''}`}
                        onClick={() => setPage(p)}
                      >{p}</button>
                )}
              <button type="button" className="payments-page-btn" disabled={safePage === totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              <button type="button" className="payments-page-btn" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Preferences Tab ──────────────────────────────────────────────────────────
const DEFAULT_CHANNELS = [
  { key: 'inapp',      labelKey: 'notifications.channelInApp',      locked: true,  active: true },
  { key: 'sms_status', labelKey: 'notifications.channelSmsStatus',  locked: false, active: true },
  { key: 'sms_disb',   labelKey: 'notifications.channelSmsDisb',    locked: false, active: true },
  { key: 'whatsapp',   labelKey: 'notifications.channelWhatsapp',   locked: false, active: false, unconfigured: true },
  { key: 'email',      labelKey: 'notifications.channelEmail',       locked: false, active: true },
]

function PreferencesTab() {
  const { t } = useTranslation()
  const [channels, setChannels] = useState(DEFAULT_CHANNELS)
  const [language, setLanguage] = useState('en')
  const [frequency, setFrequency] = useState('immediate')

  function toggle(key) {
    setChannels((prev) =>
      prev.map((c) => (c.key === key && !c.locked ? { ...c, active: !c.active } : c))
    )
  }

  return (
    <div className="notif-prefs">
      <section className="section-card">
        <h3 className="notif-prefs-title">{t('notifications.channelsTitle')}</h3>
        <div className="notif-channel-list">
          {channels.map((ch) => (
            <div key={ch.key} className="notif-channel-row">
              <div className="notif-channel-info">
                <span className="notif-channel-label">{t(ch.labelKey)}</span>
                {ch.unconfigured && !ch.active && (
                  <span className="notif-channel-tag notif-channel-tag--grey">{t('notifications.notConfigured')}</span>
                )}
                {ch.locked && (
                  <span className="notif-channel-tag notif-channel-tag--blue">{t('notifications.alwaysOn')}</span>
                )}
                {!ch.locked && !ch.unconfigured && ch.active && (
                  <span className="notif-channel-tag notif-channel-tag--green">{t('notifications.active')}</span>
                )}
              </div>
              <div className="notif-toggle-wrap">
                {ch.locked ? (
                  <span className="notif-toggle-locked" title="Cannot be disabled">🔒</span>
                ) : ch.unconfigured && !ch.active ? (
                  <button type="button" className="btn-secondary small" onClick={() => toggle(ch.key)}>
                    ➕ {t('notifications.setup')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`notif-toggle${ch.active ? ' notif-toggle--on' : ''}`}
                    onClick={() => toggle(ch.key)}
                    aria-label={ch.active ? 'Disable' : 'Enable'}
                  >
                    <span className="notif-toggle-knob" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h3 className="notif-prefs-title">{t('notifications.langPrefTitle')}</h3>
        <div className="notif-radio-group">
          {[['en', 'notifications.langEn'], ['gu', 'notifications.langGu']].map(([val, lblKey]) => (
            <label key={val} className="notif-radio-label">
              <input type="radio" name="notif-lang" value={val} checked={language === val} onChange={() => setLanguage(val)} />
              {t(lblKey)}
            </label>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h3 className="notif-prefs-title">{t('notifications.freqTitle')}</h3>
        <select
          className="complaints-filter-select"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          style={{ minWidth: 220 }}
        >
          <option value="immediate">{t('notifications.freqImmediate')}</option>
          <option value="daily">{t('notifications.freqDaily')}</option>
        </select>
        <p className="muted small" style={{ marginTop: '0.5rem' }}>
          {t('notifications.freqNote')}
        </p>
      </section>
    </div>
  )
}

// ── Important Alerts Tab ─────────────────────────────────────────────────────
function ImportantAlertsTab({ notifications, onMarkRead }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const alerts = notifications.filter(isActionRequired)

  if (alerts.length === 0) {
    return (
      <div className="notif-empty">
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
        <p className="muted">{t('notifications.alertsEmpty')}</p>
      </div>
    )
  }

  return (
    <div className="notif-alerts-list">
      {alerts.map((n) => (
        <div key={n.id} className="notif-alert-card">
          <div className="notif-alert-header">
            <span className="notif-alert-icon">⚠️</span>
            <div style={{ flex: 1 }}>
              <div className="notif-alert-title">{n.title}</div>
              <div className="muted small">{timeAgo(n.createdAt, t)}</div>
            </div>
            {!n.isRead && <span className="notif-dot" />}
          </div>
          <p className="notif-alert-message">{n.message}</p>
          <div className="notif-alert-actions">
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: 'var(--text-sm)' }}
              onClick={() => {
                if (!n.isRead) onMarkRead(n.id)
                navigate('/grievances')
              }}
            >
              {t('notifications.respond')}
            </button>
            {!n.isRead && (
              <button type="button" className="btn-secondary small" onClick={() => onMarkRead(n.id)}>
                {t('notifications.markRead')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function NotificationHub() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [tab, setTab] = useState('all')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.aadhaarRef) { setLoading(false); return }
    const data = await fetchNotifications(profile.aadhaarRef)
    setNotifications(data)
    setLoading(false)
  }, [profile?.aadhaarRef])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  async function handleMarkRead(id) {
    await markNotificationRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
  }

  const unread     = notifications.filter((n) => !n.isRead).length
  const alertCount = notifications.filter(isActionRequired).length

  const TABS = [
    { key: 'all',    label: t('notifications.tabAll'), badge: unread > 0 ? unread : null },
    { key: 'prefs',  label: t('notifications.tabPrefs'), badge: null },
    { key: 'alerts', label: t('notifications.tabAlerts'), badge: alertCount > 0 ? alertCount : null },
  ]

  return (
    <div className="screen-wrap">
      <h2 className="page-title">🔔 {t('notifications.title')}</h2>

      <div className="mydata-tabs" style={{ marginBottom: '1.5rem' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`mydata-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge && <span className="notif-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {loading && <p className="muted">{t('common.loading')}</p>}

      {!loading && tab === 'all' && (
        <AllNotificationsTab notifications={notifications} onMarkRead={handleMarkRead} />
      )}
      {tab === 'prefs' && <PreferencesTab />}
      {!loading && tab === 'alerts' && (
        <ImportantAlertsTab notifications={notifications} onMarkRead={handleMarkRead} />
      )}
    </div>
  )
}
