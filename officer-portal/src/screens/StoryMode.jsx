import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchIntegrityStory } from '../api'
import CaseTimeline from '../components/CaseTimeline'
import './StoryMode.css'

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

// What each story says, in plain words. The numbers and names come from the live case, not from here.
const STORIES = {
  DUPLICATE_PAYMENT: {
    how: 'Rule 802 adds up what has been settled against each entitlement and compares it with what the scheme authorised.',
    next: 'The officer reads the timeline, decides whether it is a true overpayment, and records a recovery or a correction at the source.',
  },
  DOUBLE_SALARY: {
    how: 'Rule S01 looks for one employee paid basic salary by two offices for overlapping days, usually after a transfer.',
    next: 'Payroll staff confirm the transfer date with HR, then record the excess for recovery. The figure is the overlap at the lower daily rate.',
  },
  PAID_AFTER_STATUS_CHANGE: {
    how: 'Rule S02 compares the last pay date with the date an employee retired, died or was suspended.',
    next: 'The case shows the loop closing: the overpayment is confirmed, recovered, and then checked by a second look.',
  },
}

const STATUS_TEXT = { OPEN: 'Open — ready to act on', RESOLVED: 'Already ruled on' }

/** A guided walk through three real cases, then a one-page summary of what the pilot found. */
export default function StoryMode() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)

  useEffect(() => { fetchIntegrityStory().then(setData).catch((e) => setError(e.message)) }, [])

  if (error) return <p className="sm-error" role="alert">{error}</p>
  if (!data) return <p>Loading…</p>

  const scenarios = data.scenarios ?? []
  const last = scenarios.length
  const current = step < last ? scenarios[step] : null
  const s = data.summary ?? {}

  return (
    <div className="story-mode">
      <header>
        <h1>The demo data in three cases</h1>
        <p className="sm-sub">Real cases from the loaded data, then what the demo data found overall.</p>
      </header>

      <nav className="sm-steps" aria-label="Story steps">
        {scenarios.map((sc, i) => (
          <button key={sc.key} type="button" aria-current={step === i ? 'step' : undefined} className={step === i ? 'active' : ''} onClick={() => setStep(i)}>
            {i + 1}. {sc.title.split(' ').slice(0, 3).join(' ')}…
          </button>
        ))}
        <button type="button" aria-current={step === last ? 'step' : undefined} className={step === last ? 'active' : ''} onClick={() => setStep(last)}>
          {last + 1}. What the demo data found
        </button>
      </nav>

      {current && (
        <section className="sm-card" aria-label={current.title}>
          <h2>{current.title}</h2>
          <p className="sm-headline">{current.headline}</p>
          <p className="sm-meta">
            {current.subject ? `${current.subject} · ` : ''}{current.amount != null ? `${rupees(current.amount)} at stake · ` : ''}{STATUS_TEXT[current.status] ?? current.status}
          </p>
          <div className="sm-cols">
            <div><h3>How it was spotted</h3><p>{STORIES[current.key]?.how}</p></div>
            <div><h3>What the officer does next</h3><p>{STORIES[current.key]?.next}</p></div>
          </div>
          <CaseTimeline caseId={current.caseId} />
          <button type="button" className="sm-primary" onClick={() => navigate(`/expenditure-integrity?domain=${current.domain === 'PAYROLL' ? 'payroll' : 'beneficiary'}&case=${current.caseId}`)}>
            Open this case
          </button>
        </section>
      )}

      {scenarios.length === 0 && <p>No example cases are available for your role.</p>}

      {step === last && (
        <section className="sm-card sm-summary" aria-label="What the demo data found">
          <h2>What the demo data found</h2>
          <ul>
            <li><b>{rupees(s.flaggedAmount)}</b> flagged across <b>{s.openAlerts}</b> open alerts</li>
            <li><b>{rupees(s.confirmedAmount)}</b> confirmed as overpaid, of which <b>{rupees(s.recoveredAmount)}</b> has a recovery recorded</li>
            <li><b>{rupees(s.gatePreventedAmount)}</b> stopped before payment by the pre-payment check</li>
            <li><b>{s.verifiedClosedCases}</b> cases verified closed, <b>{s.awaitingVerification}</b> waiting for a second look</li>
            <li>{s.avgDaysToMasterCorrection == null ? 'No' : `About ${s.avgDaysToMasterCorrection} days on average to`} correct the source record{s.recurrenceRate == null ? '' : `; ${s.recurrenceRate}% of confirmed findings were flagged again`}</li>
          </ul>
          <p className="sm-note">Figures come from the loaded demo data and are totals only. They are not a projection for the state.</p>
          <button type="button" className="sm-primary sm-print" onClick={() => window.print()}>Print this page</button>
        </section>
      )}

      <div className="sm-nav">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <button type="button" disabled={step === last} onClick={() => setStep(step + 1)}>Next</button>
      </div>
    </div>
  )
}
