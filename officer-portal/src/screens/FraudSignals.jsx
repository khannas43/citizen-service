import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFraudSignals } from '../api'
import { askAboutSignal, fraudSignalKey, generateAIBrief, maskAadhaar } from '../utils/fraudAI'
import './FraudSignals.css'

const FRAUD_RULES = [
  {
    type: 'MULTI_SCHEME_OVERLAP',
    severity: 'HIGH',
    title: 'Multi-Scheme Overlap',
    logic: 'Same person enrolled in 2+ cash-transfer schemes at once — possible duplicate benefits.',
  },
  {
    type: 'INCOME_CLIFF',
    severity: 'MEDIUM',
    title: 'Income Cliff',
    logic: 'Household income 90–100% of scheme ceiling — possible deliberate under-reporting.',
  },
  {
    type: 'AGE_ANOMALY',
    severity: 'LOW',
    title: 'Age Anomaly',
    logic: "A member's DOB implies age > 100 — likely a data-entry error.",
  },
  {
    type: 'FAMILY_INCOME_MISMATCH',
    severity: 'HIGH',
    title: 'Income Mismatch',
    logic: 'Household total < ₹50k but one member declares > ₹1.8L — inconsistent data.',
  },
]

const SIGNAL_LABEL = {
  MULTI_SCHEME_OVERLAP: 'Multi-Scheme Overlap',
  INCOME_CLIFF: 'Income Cliff',
  AGE_ANOMALY: 'Age Anomaly',
  FAMILY_INCOME_MISMATCH: 'Income Mismatch',
}

const SIGNAL_ICON = {
  MULTI_SCHEME_OVERLAP: '🔁',
  INCOME_CLIFF: '📊',
  AGE_ANOMALY: '🎂',
  FAMILY_INCOME_MISMATCH: '⚖️',
}

const SUGGESTED_QUESTIONS = [
  'What documents to request?',
  'How urgent is this?',
  'What are the next steps?',
]

function priorityBarClass(score) {
  if (score >= 80) return 'fs-pbar-high'
  if (score >= 60) return 'fs-pbar-mid'
  return 'fs-pbar-low'
}

function SignalCard({
  signal,
  openBrief,
  briefLoading,
  brief,
  askInput,
  askResponse,
  onToggleBrief,
  onAskInputChange,
  onAskSubmit,
  onSuggestedQuestion,
  onNameClick,
}) {
  const id = fraudSignalKey(signal)
  const maskedAadhaar = maskAadhaar(signal.aadhaarRef)
  const isBriefOpen = openBrief.has(id)
  const sev = (signal.severity || 'LOW').toLowerCase()

  function handleAskKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onAskSubmit(id, signal)
    }
  }

  return (
    <div className={`fs-card fs-stripe-${sev}`}>
      <div className="fs-card-inner">
        {/* Header row */}
        <div className="fs-card-head">
          <div className={`fs-card-icon-wrap fs-icon-bg-${sev}`}>
            <span className="fs-card-icon">{SIGNAL_ICON[signal.signalType] || '⚠'}</span>
          </div>
          <div className="fs-card-title-block">
            <div className="fs-card-title">
              {SIGNAL_LABEL[signal.signalType] || signal.signalType}
            </div>
            <div className="fs-card-meta">
              <button
                type="button"
                className="fs-card-person-link"
                onClick={() => onNameClick(signal.familyId, signal.personId)}
                title="View Citizen 360° Profile"
              >
                {signal.personName}
              </button>
              {maskedAadhaar && (
                <>
                  <span className="fs-meta-sep">·</span>
                  <span className="fs-card-aadhaar">{maskedAadhaar}</span>
                </>
              )}
              {signal.schemeName && (
                <>
                  <span className="fs-meta-sep">·</span>
                  <em className="fs-card-scheme">{signal.schemeName}</em>
                </>
              )}
            </div>
          </div>
          <span className={`fs-sev-badge fs-sev-${sev}`}>{signal.severity}</span>
        </div>

        {/* Rule chip + detected time */}
        <div className="fs-rule-code-row">
          <span className="fs-rule-chip">{signal.signalType}</span>
          <span className="fs-detected-time">
            {new Date(signal.detectedAt).toLocaleString()}
          </span>
        </div>

        {/* Finding block */}
        <div className={`fs-finding fs-finding-${sev}`}>
          <div className="fs-finding-label">Finding</div>
          <div className="fs-finding-text">{signal.detail}</div>
        </div>

        {/* Status badges */}
        <div className="fs-badge-row">
          <span className="fs-badge-rule">⚡ Rule-detected</span>
          <span className="fs-badge-ai">✦ AI-enhanced</span>
        </div>

        {/* AI Brief toggle */}
        <button
          type="button"
          className={`fs-ai-btn${isBriefOpen ? ' fs-ai-btn-active' : ''}`}
          onClick={() => onToggleBrief(id, signal)}
        >
          <span className="fs-ai-btn-icon">✦</span>
          {isBriefOpen ? 'Hide AI Brief' : 'Open AI Brief'}
        </button>

        {/* AI Brief panel */}
        {isBriefOpen && (
          <div className="fs-ai-panel">
            {briefLoading.has(id) && (
              <div className="fs-shimmer">
                <div className="fs-shimmer-line" style={{ width: '90%' }} />
                <div className="fs-shimmer-line" style={{ width: '75%' }} />
                <div className="fs-shimmer-line" style={{ width: '60%' }} />
              </div>
            )}
            {!briefLoading.has(id) && brief && (
              <>
                <div className="fs-ai-priority-wrap">
                  <div className="fs-ai-priority-label-row">
                    <span>Investigation Priority</span>
                    <span className="fs-ai-priority-score">{brief.investigationPriority}/100</span>
                  </div>
                  <div className="fs-ai-priority-track">
                    <div
                      className={`fs-ai-priority-fill ${priorityBarClass(brief.investigationPriority)}`}
                      style={{ width: `${brief.investigationPriority}%` }}
                    />
                  </div>
                </div>
                <p className="fs-ai-summary">{brief.summary}</p>
                <div className="fs-ai-actions-label">Recommended Actions</div>
                <ol className="fs-ai-actions">
                  {brief.recommendedActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
                <p className="fs-ai-disclaimer">{brief.aiDisclaimer}</p>
              </>
            )}
          </div>
        )}

        {/* Q&A */}
        <div className="fs-qa-wrap">
          <div className="fs-qa-row">
            <span className="fs-qa-icon">💬</span>
            <input
              type="text"
              className="fs-qa-input"
              placeholder="Ask about documents, next steps, timeline…"
              value={askInput[id] || ''}
              onChange={(e) => onAskInputChange(id, e.target.value)}
              onKeyDown={handleAskKeyDown}
            />
            <button
              type="button"
              className="fs-qa-btn"
              onClick={() => onAskSubmit(id, signal)}
            >
              Ask
            </button>
          </div>
          <div className="fs-qa-chips">
            {SUGGESTED_QUESTIONS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="fs-qa-chip"
                onClick={() => onSuggestedQuestion(id, chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          {askResponse[id] && (
            <div className="fs-qa-response">
              <span className="fs-qa-response-icon">✦</span>
              <span>
                {askResponse[id].split('\n').map((line, idx) => (
                  <span key={idx}>
                    {line}
                    {idx < askResponse[id].split('\n').length - 1 && <br />}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FraudSignals() {
  const navigate = useNavigate()
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastScan, setLastScan] = useState(null)
  const [activeRule, setActiveRule] = useState(FRAUD_RULES[0].type)
  const [openBrief, setOpenBrief] = useState(() => new Set())
  const [briefLoading, setBriefLoading] = useState(() => new Set())
  const [briefCache, setBriefCache] = useState({})
  const [askInput, setAskInput] = useState({})
  const [askResponse, setAskResponse] = useState({})

  const [loadError, setLoadError] = useState(null)

  // A failed scan keeps what was already on screen and says so: it must never look like "no signals found".
  const load = useCallback(async () => {
    try {
      const data = await fetchFraudSignals()
      setSignals(Array.isArray(data) ? data : [])
      setLastScan(new Date())
      setLoadError(null)
    } catch (err) {
      setLoadError(err?.message || 'Could not load scheme-overlap signals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  function handleToggleBrief(id, signal) {
    setOpenBrief((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (!briefCache[id]) {
          setBriefLoading((bl) => new Set(bl).add(id))
          setTimeout(() => {
            setBriefCache((cache) => ({ ...cache, [id]: generateAIBrief(signal) }))
            setBriefLoading((bl) => {
              const n = new Set(bl)
              n.delete(id)
              return n
            })
          }, 400)
        }
      }
      return next
    })
  }

  function handleAskInputChange(id, value) {
    setAskInput((prev) => ({ ...prev, [id]: value }))
  }

  function handleAskSubmit(id, signal) {
    const question = askInput[id]?.trim()
    if (!question) return
    const answer = askAboutSignal(signal, question)
    setAskResponse((prev) => ({ ...prev, [id]: answer }))
    setAskInput((prev) => ({ ...prev, [id]: '' }))
  }

  function handleSuggestedQuestion(id, chip) {
    setAskInput((prev) => ({ ...prev, [id]: chip }))
  }

  function handleNameClick(familyId, personId) {
    navigate('/families', { state: { familyId, personId } })
  }

  function handleRuleClick(ruleType) {
    setActiveRule((prev) => (prev === ruleType ? null : ruleType))
  }

  const high = signals.filter((s) => s.severity === 'HIGH').length
  const medium = signals.filter((s) => s.severity === 'MEDIUM').length
  const low = signals.filter((s) => s.severity === 'LOW').length

  const visibleSignals = activeRule
    ? signals.filter((s) => s.signalType === activeRule)
    : signals

  return (
    <div className="fs-root">
      {/* Command Bar */}
      <div className="fs-command-bar">
        <div className="fs-command-left">
          <span className="fs-live-dot" />
          <span className="fs-command-title">Scheme Overlapping identification Engine</span>
          <span className="fs-command-divider" />
          <span className="fs-command-meta">5 hero families · 4 rules active</span>
        </div>
        <div className="fs-command-right">
          {lastScan && (
            <span className="fs-last-scan">Last scan: {lastScan.toLocaleTimeString()}</span>
          )}
          <span className="fs-command-badge">Auto-refresh 30s</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="fs-kpi-row">
        <div className="fs-kpi-card fs-kpi-high">
          <div className="fs-kpi-value">{loading || (loadError && !signals.length) ? '—' : high}</div>
          <div className="fs-kpi-label">High Risk</div>
          <div className="fs-kpi-sublabel">Immediate review</div>
        </div>
        <div className="fs-kpi-card fs-kpi-medium">
          <div className="fs-kpi-value">{loading || (loadError && !signals.length) ? '—' : medium}</div>
          <div className="fs-kpi-label">Medium Risk</div>
          <div className="fs-kpi-sublabel">Monitor closely</div>
        </div>
        <div className="fs-kpi-card fs-kpi-low">
          <div className="fs-kpi-value">{loading || (loadError && !signals.length) ? '—' : low}</div>
          <div className="fs-kpi-label">Low Risk</div>
          <div className="fs-kpi-sublabel">Routine check</div>
        </div>
        <div className="fs-kpi-card fs-kpi-total">
          <div className="fs-kpi-value">{loading || (loadError && !signals.length) ? '—' : signals.length}</div>
          <div className="fs-kpi-label">Total Signals</div>
          <div className="fs-kpi-sublabel">Across all rules</div>
        </div>
      </div>

      {/* Detection Rules */}
      <div className="fs-section-block">
        <div className="fs-section-label">
          <span className="fs-section-accent" />
          <span>Detection Rules</span>
          <span className="fs-section-count">4 active</span>
        </div>
        <div className="fs-rules-grid">
          {FRAUD_RULES.map((rule) => {
            const count = signals.filter((s) => s.signalType === rule.type).length
            const isActive = activeRule === rule.type
            return (
              <button
                key={rule.type}
                type="button"
                className={`fs-rule-card${isActive ? ' fs-rule-card-active' : ''}`}
                onClick={() => handleRuleClick(rule.type)}
              >
                <div className="fs-rule-card-top">
                  <span className={`fs-rule-dot fs-rule-dot-${rule.severity.toLowerCase()}`} />
                  <span className="fs-rule-card-title">{rule.title}</span>
                  <span className={`fs-rule-sev fs-rule-sev-${rule.severity.toLowerCase()}`}>
                    {rule.severity}
                  </span>
                </div>
                <div className="fs-rule-card-bottom">
                  <span className="fs-rule-card-code">{rule.type}</span>
                  {count > 0 && (
                    <span className="fs-rule-signal-count">{count} signal{count !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className="fs-rule-card-logic">{rule.logic}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Signals */}
      <div className="fs-section-label" style={{ marginTop: 'var(--space-6)' }}>
        <span className="fs-section-accent" />
        <span>Active Signals</span>
        {!loading && signals.length > 0 && (
          <span className="fs-section-count">
            {activeRule
              ? `${visibleSignals.length} of ${signals.length}`
              : `${signals.length} flagged`}
          </span>
        )}
        {activeRule && (
          <span className="fs-filter-label">
            Filtered: {FRAUD_RULES.find((r) => r.type === activeRule)?.title}
            <button
              type="button"
              className="fs-filter-clear"
              onClick={() => setActiveRule(null)}
            >
              ✕ Clear
            </button>
          </span>
        )}
      </div>

      {loading && (
        <div className="fs-loading-state">
          <span className="fs-loading-dot" />
          <span>Analysing beneficiary data…</span>
        </div>
      )}

      {loadError && (
        <div className="fs-error" role="alert">
          <span>{signals.length > 0 ? 'The latest scan failed, so these signals may be out of date. ' : ''}{loadError}</span>
          <button type="button" onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !loadError && signals.length === 0 && (
        <div className="fs-empty-state">
          <div className="fs-empty-icon">✓</div>
          <div className="fs-empty-title">No fraud signals detected</div>
          <div className="fs-empty-sub">
            The engine scans IDENTIFIED / CONFIRMED / ACTIVE beneficiaries in demo hero families.
            When a rule matches, signals appear here with rule code, detail, and AI brief.
          </div>
        </div>
      )}

      {!loading && signals.length > 0 && visibleSignals.length === 0 && (
        <div className="fs-empty-state">
          <div className="fs-empty-icon">○</div>
          <div className="fs-empty-title">No signals for this rule</div>
          <div className="fs-empty-sub">
            No cases matched the selected detection rule in the current scan.
          </div>
        </div>
      )}

      {!loading && visibleSignals.length > 0 && (
        <div className="fs-signals-grid">
          {visibleSignals.map((s) => {
            const id = fraudSignalKey(s)
            return (
              <SignalCard
                key={id}
                signal={s}
                openBrief={openBrief}
                briefLoading={briefLoading}
                brief={briefCache[id]}
                askInput={askInput}
                askResponse={askResponse}
                onToggleBrief={handleToggleBrief}
                onAskInputChange={handleAskInputChange}
                onAskSubmit={handleAskSubmit}
                onSuggestedQuestion={handleSuggestedQuestion}
                onNameClick={handleNameClick}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
