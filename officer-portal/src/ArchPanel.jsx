import { useEffect, useState } from 'react'
import { fetchAllTasks } from './api'
import './ArchPanel.css'

const FLOWABLE_SERVICES = [
  'Caste Certificate',
  'Pension',
  'Family Member Change',
  'Marriage Certificate',
]

function ArchCard({ className, title, subtitle, rows, badges, live }) {
  return (
    <div className={`arch-card ${className}`}>
      <div className="arch-card-title">{title}</div>
      {subtitle && <div className="arch-card-sub">{subtitle}</div>}
      {live != null && (
        <div className="arch-card-row arch-card-live">
          <span className="arch-live-dot" />
          {live}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="arch-card-rows">
          {rows.map((row) => (
            <div key={row} className="arch-card-row">
              <span className="arch-row-bullet">•</span>
              {row}
            </div>
          ))}
        </div>
      )}
      {badges && badges.length > 0 && (
        <div className="arch-badge-row">
          {badges.map((b) => (
            <span key={b} className="arch-badge">{b}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function ArchConnector({ label }) {
  return (
    <div className="arch-connector">
      <span>{label}</span>
    </div>
  )
}

export default function ArchPanel({ open, onClose, pendingCounts }) {
  const [flowableCount, setFlowableCount] = useState(null)
  const [digitCount, setDigitCount] = useState(null)

  useEffect(() => {
    if (!open) return
    if (pendingCounts) {
      setFlowableCount(pendingCounts.flowable)
      setDigitCount(pendingCounts.digit)
      return undefined
    }

    let alive = true

    async function refresh() {
      const { tasks } = await fetchAllTasks()
      if (!alive) return
      const pending = tasks.filter((t) => (t.status || 'PENDING') === 'PENDING')
      setFlowableCount(
        pending.filter((t) => FLOWABLE_SERVICES.includes(t.service)).length
      )
      setDigitCount(
        pending.filter((t) => t.service === 'Marriage Certificate').length
      )
    }

    refresh()
    const id = setInterval(refresh, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [open, pendingCounts])

  if (!open) return null

  const flowableLive =
    flowableCount != null
      ? `${flowableCount} active task${flowableCount !== 1 ? 's' : ''}`
      : '4 services'
  const digitLive =
    digitCount != null
      ? `${digitCount} active task${digitCount !== 1 ? 's' : ''}`
      : '1 service'

  return (
    <>
      <div className="arch-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="arch-panel arch-panel-overlay dg-slide-right">
        <div className="arch-panel-header">
          <span className="arch-panel-title">DG 2.0 Platform Architecture</span>
          <button type="button" className="arch-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="arch-panel-body">
          <div className="arch-tier">
            <div className="arch-tier-label">Citizen Layer</div>
            <div className="arch-tier-cards">
              <ArchCard
                className="arch-card-citizen"
                title="📱 Citizen Portal"
                rows={['React 19 · Nginx', 'Gujarati i18n (530 keys)', 'NodePort 30074']}
              />
              <ArchCard
                className="arch-card-officer"
                title="🖥 Officer Portal"
                rows={[
                  'React 19 · Nginx',
                  '5 roles · Keycloak IAM',
                  'NodePort 30073',
                  '🗺 Leaflet 1.9 — Gujarat choropleth map',
                ]}
              />
            </div>
          </div>

          <ArchConnector label="HTTPS / NodePort" />

          <div className="arch-tier">
            <div className="arch-tier-label">Workflow + Rules Engines</div>
            <div className="arch-tier-cards arch-tier-cards-3">
              <ArchCard
                className="arch-card-flowable"
                title="⚙ Flowable BPM"
                rows={['Caste · Pension · Family', 'Marriage (4 services)']}
                live={flowableLive}
              />
              <ArchCard
                className="arch-card-digit"
                title="⚙ DIGIT Workflow"
                rows={['egov-workflow-v2', 'Marriage Certificate']}
                live={digitLive}
              />
              <ArchCard
                className="arch-card-scheme"
                title="🎯 Scheme Engine"
                rows={['Kafka consumer', 'Rules-based eligibility', '78,987 identified']}
              />
            </div>
          </div>

          <ArchConnector label="Kafka Event Bus ──── apache/kafka:latest (KRaft)" />

          <div className="arch-tier">
            <div className="arch-tier-label">AI + Analytics</div>
            <div className="arch-tier-cards">
              <ArchCard
                className="arch-card-ai"
                title="🤖 AI Intelligence Service"
                subtitle="ai-intelligence-service · FastAPI · Port 30089"
                rows={[
                  'Gemma 4 (8B) — semantic rerank + explanations',
                  'sentence-transformers + pgvector — semantic search',
                  'LightGBM + SHAP — recommendations + SLA prediction',
                ]}
                badges={['AI-1 Search', 'AI-2 Recommendations', 'AI-4 SLA']}
              />
              <ArchCard
                className="arch-card-superset"
                title="📊 Apache Superset 3.1"
                subtitle="Executive Dashboards · Port 30076"
                rows={[
                  'Gujarat Welfare Pulse dashboard',
                  'Scheme Performance dashboard',
                  'Embedded via @superset-ui/embedded-sdk · Guest tokens',
                ]}
              />
            </div>
          </div>

          <ArchConnector label="asyncpg · pgvector · JDBC" />

          <div className="arch-tier">
            <div className="arch-tier-label">Data Layer</div>
            <div className="arch-tier-cards">
              <ArchCard
                className="arch-card-postgres"
                title="🗄 PostgreSQL 16 + pgvector"
                rows={[
                  '9 schemas · ~221k families',
                  '~950k persons · 78,987 beneficiaries',
                  '24 service embeddings (384-dim vectors)',
                ]}
              />
              <ArchCard
                className="arch-card-valkey"
                title="⚡ Valkey"
                rows={['Valkey (Redis-compatible)', 'API rate limiting', 'Keycloak session store']}
              />
            </div>
          </div>

          <div className="arch-footer">
            Deployed on K3s (arm64) · Rancher Desktop · Apple Silicon · Single-node egov namespace
          </div>
        </div>
      </aside>
    </>
  )
}
