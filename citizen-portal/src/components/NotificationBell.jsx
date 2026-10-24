import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { loadCitizenProfile } from '../auth'
import { fetchNotifications, markNotificationRead } from '../api'

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return t('common.justNow')
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function NotificationBell() {
  const { t } = useTranslation()
  const profile = loadCitizenProfile()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = useCallback(async () => {
    if (!profile?.aadhaarRef) return
    const data = await fetchNotifications(profile.aadhaarRef)
    setNotifications(data)
  }, [profile?.aadhaarRef])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function handleClick(n) {
    if (!n.isRead) {
      await markNotificationRead(n.id)
      setNotifications(prev =>
        prev.map(x => x.id === n.id ? { ...x, isRead: true } : x)
      )
    }
  }

  const unread = notifications.filter(n => !n.isRead).length

  return (
    <div className="notification-bell" ref={ref}>
      <button
        type="button"
        className="bell-btn"
        onClick={() => setOpen(prev => !prev)}
        aria-label={t('bell.ariaLabel')}
      >
        🔔
        {unread > 0 && (
          <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">
            <span>{t('bell.title')}</span>
            {unread > 0 && (
              <span className="bell-unread-count">{t('bell.unread', { count: unread })}</span>
            )}
          </div>
          {notifications.length === 0 && (
            <p className="bell-empty">{t('bell.empty')}</p>
          )}
          {notifications.map(n => (
            <div
              key={n.id}
              className={`bell-item${n.isRead ? ' bell-item-read' : ''}`}
              onClick={() => handleClick(n)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleClick(n)}
            >
              <div className="bell-item-title">
                {!n.isRead && <span className="bell-dot" />}
                {n.title}
              </div>
              <div className="bell-item-message">{n.message}</div>
              <div className="bell-item-meta">
                {n.serviceName && (
                  <span className="bell-service">{n.serviceName}</span>
                )}
                <span className="bell-time">{timeAgo(n.createdAt, t)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
