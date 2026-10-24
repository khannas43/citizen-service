import { useCallback, useEffect, useState } from 'react'
import { answerClarification, fetchCitizenResponses, fetchPendingClarifications } from '../api'

export default function Clarifications() {
  const [items, setItems] = useState([])
  const [responses, setResponses] = useState([])
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(null)

  const load = useCallback(async () => {
    setItems(await fetchPendingClarifications())
    setResponses(await fetchCitizenResponses())
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  async function submitAnswer(id) {
    const text = answers[id]?.trim()
    if (!text || text.length < 5) return
    setSaving(id)
    try {
      await answerClarification(id, text)
      setAnswers((prev) => ({ ...prev, [id]: '' }))
      await load()
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <h1 className="page-title">💬 Clarifications</h1>
      <p className="muted">Citizen questions on specific applications — reply to notify the citizen.</p>

      {items.length === 0 && <p className="muted">No pending questions.</p>}

      <div className="card-list">
        {items.map((c) => (
          <article key={c.id} className="app-card stripe-pending">
            <div className="card-body">
              <div className="card-row">
                <span className="applicant-name">{c.citizenName}</span>
                <span className="badge-service">{c.serviceName}</span>
                <span className={`status-badge ${c.status === 'ANSWERED' ? 'badge-green' : 'badge-grey'}`}>
                  {c.status}
                </span>
              </div>
              <p className="small muted">App: {c.applicationRef}</p>
              <p style={{ margin: '0.5rem 0' }}><strong>Q:</strong> {c.question}</p>
              {c.status === 'PENDING' && (
                <>
                  <textarea
                    rows={3}
                    placeholder="Type your answer…"
                    value={answers[c.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                  />
                  <button
                    type="button"
                    className="btn-approve"
                    disabled={saving === c.id}
                    onClick={() => submitAnswer(c.id)}
                  >
                    {saving === c.id ? 'Sending…' : 'Submit Answer'}
                  </button>
                </>
              )}
              {c.answer && <p className="answer-line"><strong>A:</strong> {c.answer}</p>}
            </div>
          </article>
        ))}
      </div>

      <h2 className="page-subtitle" style={{ marginTop: '2rem' }}>📨 Citizen Responses to Info Requests</h2>
      <p className="muted">Responses citizens submitted after you requested additional information.</p>

      {responses.length === 0 && <p className="muted">No citizen responses yet.</p>}

      <div className="card-list">
        {responses.map((c) => (
          <article key={c.id} className="app-card stripe-approved">
            <div className="card-body">
              <div className="card-row">
                <span className="badge-service">{c.serviceName}</span>
                <span className="status-badge badge-green">RESPONDED</span>
              </div>
              <p className="small muted">App: {c.applicationRef}</p>
              <p style={{ margin: '0.5rem 0' }}>
                <strong>Your request:</strong> {c.question}
              </p>
              <p className="answer-line">
                <strong>Citizen response:</strong> {c.answer}
              </p>
              {c.answeredAt && (
                <p className="small muted">
                  Responded: {new Date(c.answeredAt).toLocaleString()}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
