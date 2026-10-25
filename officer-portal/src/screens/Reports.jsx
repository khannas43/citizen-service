import { useEffect, useRef, useState } from 'react'
import { embedDashboard } from '@superset-ui/embedded-sdk'
import { AI_BASE } from '../api'
import DistrictScopeBanner from '../components/DistrictScopeBanner'
import './Reports.css'

const DASHBOARDS = [
  { id: 'welfare-pulse', label: 'Gujarat Welfare Pulse', slug: 'gujarat-welfare-pulse' },
  { id: 'scheme-perf', label: 'Scheme Performance', slug: 'scheme-performance' },
]

function defaultSupersetUrl() {
  // Local demos always use the port-forward; baked LAN IPs go stale when Wi‑Fi changes.
  const pageHost = window.location.hostname
  if (pageHost === 'localhost' || pageHost === '127.0.0.1') {
    return `${window.location.protocol}//127.0.0.1:31176`
  }
  const fromEnv = (import.meta.env.VITE_SUPERSET_URL ?? '').replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return `${window.location.protocol}//${pageHost}:31176`
}

const SUPERSET_URL = defaultSupersetUrl()

async function fetchEmbedCreds(slug) {
  const r = await fetch(`${AI_BASE}/v1/superset/guest-token?slug=${encodeURIComponent(slug)}`)
  if (!r.ok) throw new Error(`proxy ${r.status}`)
  return r.json()
}

export default function Reports() {
  const [activeId, setActiveId] = useState('welfare-pulse')
  const [loading, setLoading] = useState(true)
  const [embedError, setEmbedError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const mountRef = useRef(null)
  const embedRef = useRef(null)

  const current = DASHBOARDS.find((d) => d.id === activeId) ?? DASHBOARDS[0]

  useEffect(() => {
    const mountPoint = mountRef.current
    if (!mountPoint) return undefined

    let cancelled = false
    setLoading(true)
    setEmbedError(false)
    mountPoint.innerHTML = ''
    embedRef.current = null

    async function mount() {
      try {
        const { embed_uuid } = await fetchEmbedCreds(current.slug)
        if (cancelled) return

        const embedded = await embedDashboard({
          id: embed_uuid,
          supersetDomain: SUPERSET_URL,
          mountPoint,
          fetchGuestToken: async () => {
            const { guest_token } = await fetchEmbedCreds(current.slug)
            return guest_token
          },
          dashboardUiConfig: {
            hideTitle: true,
            hideTab: true,
            hideChartControls: true,
            filters: { visible: false, expanded: false },
          },
          iframeTitle: current.label,
        })

        if (cancelled) return
        embedRef.current = embedded
        setLoading(false)
      } catch {
        if (cancelled) return
        setEmbedError(true)
        setLoading(false)
      }
    }

    mount()

    return () => {
      cancelled = true
      mountPoint.innerHTML = ''
      embedRef.current = null
    }
  }, [activeId, current.slug, current.label, retryKey])

  return (
    <div className="rpt-root">
      <div className="rpt-bar">
        <div className="rpt-bar-left">
          <div className="rpt-title">Analytics & Reports</div>
          <div className="rpt-sub">Citizen Services Platform · Live data</div>
          <DistrictScopeBanner noun="reports" />
        </div>
        <div className="rpt-tabs">
          {DASHBOARDS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`rpt-tab ${activeId === d.id ? 'rpt-tab-active' : ''}`}
              onClick={() => setActiveId(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <a
          className="rpt-open-link"
          href={`${SUPERSET_URL}/superset/dashboard/${current.slug}/`}
          target="_blank"
          rel="noreferrer"
        >
          ↗ Open in Superset
        </a>
      </div>

      <div className="rpt-frame-wrap">
        {loading && !embedError && (
          <div className="rpt-loading">
            <div className="rpt-spinner" aria-hidden="true" />
            <div className="rpt-loading-text">Loading {current.label}…</div>
            <div className="rpt-loading-hint">
              First load may take 30–60 seconds while charts query live data.
            </div>
          </div>
        )}
        {embedError && (
          <div className="rpt-error">
            <div className="rpt-error-title">Dashboard connection failed</div>
            <p className="rpt-error-body">
              Could not reach Superset or the AI service guest-token proxy.
              Verify both pods are running, then retry.
            </p>
            <div className="rpt-error-actions">
              <button
                type="button"
                className="rpt-retry-btn"
                onClick={() => { setEmbedError(false); setLoading(true); setRetryKey((k) => k + 1) }}
              >
                Retry
              </button>
              <a
                className="rpt-open-link rpt-open-link-inline"
                href={`${SUPERSET_URL}/superset/dashboard/${current.slug}/`}
                target="_blank"
                rel="noreferrer"
              >
                ↗ Open in Superset
              </a>
            </div>
          </div>
        )}
        <div
          ref={mountRef}
          className={`rpt-embed-mount${loading || embedError ? ' rpt-embed-hidden' : ''}`}
          aria-label={current.label}
        />
      </div>
    </div>
  )
}
