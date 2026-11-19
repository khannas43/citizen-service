import { useEffect, useState } from 'react'
import { mdm } from '../../mdmApi'
import { Link } from 'react-router-dom'
import { Tag, PROPOSAL, CONSENT, DELIVERY } from './dxShared'
import './dxTour.css'
import { tr } from '../../i18n/lang'
import { isDeptOfficerRole } from '../../auth'
import { HUBS } from '../../navTree'

/* A guided walk through one use case. Each step says what happens, who acts, what data moves, and opens the screen where it can be seen.
   "In the demo data" shows a real case from the platform, so the story can be checked against actual records. */

/** The name an officer sees in the side menu for a screen: "Menu entry › tab". Screens that are not in the menu keep the step's own wording. */
export function menuName(to, own, detail) {
  const [path, qs] = to.split('?')
  const hub = HUBS.find((h) => h.tabs.some(([t]) => t === path))
  let where = null
  if (hub) where = `${tr(hub.label.replace(/^\S+\s/, ''))} › ${tr(hub.tabs.find(([t]) => t === path)[1])}`
  else if (path === '/mdm') where = `${tr('Master Data')} › ${tr({ people: 'People', review: 'Review queue', quality: 'Data quality', rules: 'Rules & audit' }[new URLSearchParams(qs || '').get('tab') || 'people'])}`
  else if (path === '/dx/control') where = tr('Control Tower')
  if (!where) return tr(own)
  return detail ? `${where} · ${tr(detail)}` : where
}

const nodesOf = (flow, kind) => (flow?.nodes || []).filter((n) => n.kind === kind)

const BIRTH = {
  id: 'birth', uc: 'UC2', title: 'A child is born',
  intro: 'Follow one birth from the registration counter to the audit log. Seven steps, a few minutes. Use Next, or pick any step.',
  steps: [
    {
      t: 'Before the birth: we already know the parents', who: 'Master data and a steward',
      what: 'Departments each hold their own copy of the parents, often spelled differently. The platform checks each feed, then links the copies into one person. Where it is not sure, a steward decides.',
      data: 'Records from ten systems → one record per person, each value with its source.',
      ifnot: 'If two people look alike but are not, the link waits in the review queue instead of being guessed.',
      open: [['Feed Quality', '/dx/quality'], ['People', '/mdm?tab=people'], ['Trail', '/dx/lineage?tab=person', 'Where a value came from']],
      live: () => null,
    },
    {
      t: 'The birth is registered', who: 'Civil registration',
      what: 'The registering department publishes a birth. The platform matches it to the mother and father and records it as an event. Only a thin reference is kept, not a copy of the certificate.',
      data: 'Birth event: child name, date, registration number, parents → matched to the family.',
      ifnot: 'A birth with no name yet is held until the name arrives. A repeated or late event is recognised, not processed twice.',
      open: [['Event stream', '/dx/events']],
      live: (f) => (f ? [[f.nodes.find((n) => n.kind === 'event')?.label, f.nodes.find((n) => n.kind === 'event')?.sub, f.nodes.find((n) => n.kind === 'event')?.status]] : null),
      liveTag: 'plain',
    },
    {
      t: 'The platform proposes, an officer decides', who: 'An officer',
      what: 'The platform works out what each department should do, for example add the child to the family ration card, and proposes it. It does nothing until an officer approves and writes the reason.',
      data: 'Proposal: what to do, for whom, and why → approved or rejected with a recorded reason.',
      ifnot: 'A proposal without a reason cannot be approved. A rejected one is kept with its reason.',
      open: [['Approvals', '/dx/approvals']],
      live: (f) => nodesOf(f, 'proposal').map((n) => [n.label, n.sub, n.status]), liveTag: 'proposal',
    },
    {
      t: 'The parent agrees or refuses', who: 'The parent (or an operator helping them)',
      what: 'For each use of the child\'s data the parent is asked separately. They may allow the ration card and refuse a welfare scheme. They can withdraw later.',
      data: 'Consent per purpose: granted, refused or withdrawn, with date and channel.',
      ifnot: 'No answer in time means the request lapses. Nothing is sent without a yes.',
      open: [['Consent', '/dx/consent'], ['The citizen\'s own view', '/dx/citizen/consents']],
      live: (f) => nodesOf(f, 'consent').map((n) => [n.label, n.sub, n.status]), liveTag: 'consent',
    },
    {
      t: 'Only what was allowed is sent', who: 'The platform, per department',
      what: 'Each department receives only the items the parent allowed and the officer approved. A refused item is shown as not sent. If a department is down, delivery is retried and finally kept for review.',
      data: 'Thin notice per department: what changed and which child, nothing more.',
      ifnot: 'If consent is withdrawn after sending, a withdrawal notice follows and further sending stops.',
      open: [['Control tower', '/dx/control']],
      live: (f) => nodesOf(f, 'delivery').map((n) => [n.label, n.sub, n.status]), liveTag: 'delivery',
    },
    {
      t: 'Every step is written down', who: 'The platform',
      what: 'The clearing house records each exchange, answered or refused, with the policy in force. The audit log records every action, and each line fingerprints the one before it, so history cannot be quietly changed.',
      data: 'Ledger line per exchange; audit line per action. The answers themselves are not stored.',
      ifnot: 'A withdrawal removes personal content but never the proof that something happened.',
      open: [['Clearing house', '/dx/ledger'], ['Audit log', '/dx/audit']],
      live: (f) => [...nodesOf(f, 'ledger'), ...nodesOf(f, 'audit')].map((n) => [n.label, n.sub, null]),
    },
    {
      t: 'See it all as one picture', who: 'You',
      what: 'The lineage view draws this whole journey for one real event: source, event, proposals, consents, deliveries, ledger and audit, with the status of each box.',
      data: 'Nothing new moves here. This is a read-only view of the steps you just walked.',
      ifnot: 'Select any box in the picture to open the screen that handles it.',
      open: [['Trail', '/dx/lineage?tab=event', 'Journey of an event']],
      live: () => null, last: true,
    },
  ],
}

const TOURS = [BIRTH]
const MAPS = { proposal: PROPOSAL, consent: CONSENT, delivery: DELIVERY }

export default function DxTour() {
  const [step, setStep] = useState(0)
  const tour = BIRTH
  const [pick, setPick] = useState({ id: null, flow: null, done: false })
  const role = typeof localStorage !== 'undefined' ? localStorage.getItem('officer_role') : null
  useEffect(() => {
    if (isDeptOfficerRole(role)) return undefined
    let live = true
    ;(async () => {
      try {
        const list = (await mdm('/x/events', { params: { uc: tour.uc, status: 'PROCESSED', limit: 10 } })).items || []
        let best = null
        for (const e of list) {                       // prefer a case that went through consent and delivery, so every step has something to show
          const flow = await mdm(`/x/lineage/event/${e.id}`)
          if (!best) best = { id: e.id, flow }
          if (nodesOf(flow, 'consent').length && nodesOf(flow, 'delivery').length) { best = { id: e.id, flow }; break }
        }
        if (live) setPick({ ...(best || { id: null, flow: null }), done: true })
      } catch { if (live) setPick({ id: null, flow: null, done: true }) }
    })()
    return () => { live = false }
  }, [tour.uc])
  const evId = pick.id
  const f = pick.flow?.nodes ? pick.flow : null
  const s = tour.steps[step]
  const rows = f ? s.live(f) : null
  const journey = evId ? `/dx/lineage?tab=event&event=${evId}` : '/dx/lineage?tab=event'

  if (isDeptOfficerRole(role)) return null

  return (
    <section className="tour" aria-label={tr('Guided tour')}>
      <div className="tour-head">
        <div>
          <span className="tour-eyebrow">{tr('Guided tour')}</span>
          <h2 className="tour-title">{tour.uc} · {tour.title}</h2>
          <p className="tour-intro">{tour.intro}</p>
        </div>
        <div className="tour-pick" role="group" aria-label={tr('Use case')}>
          {TOURS.map((x) => <button key={x.id} type="button" className="on" aria-pressed="true">{x.uc} {x.title}</button>)}
          {['UC3 A death', 'UC4 Eligibility', 'UC5 Household', 'UC6 Marriage'].map((n) => <button key={n} type="button" disabled title={tr('Coming next')}>{n}</button>)}
        </div>
      </div>

      <ol className="tour-dots">
        {tour.steps.map((x, i) => (
          <li key={x.t}>
            <button type="button" className={`${i === step ? 'on' : ''}${i < step ? ' done' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${x.t}`}>
              <span>{i < step ? '✓' : i + 1}</span><em>{x.t}</em>
            </button>
          </li>
        ))}
      </ol>

      <div className="tour-body">
        <div className="tour-main">
          <span className="tour-count">{tr('Step {v} of {length}', { v: step + 1, length: tour.steps.length })}</span>
          <h3 className="tour-step-title">{s.t}</h3>
          <p className="tour-who"><strong>{tr('Who acts:')}</strong> {s.who}</p>
          <p className="tour-what">{s.what}</p>
          <div className="tour-box data"><strong>{tr('What data moves')}</strong><span>{s.data}</span></div>
          <div className="tour-box ifnot"><strong>{tr('What if it goes differently')}</strong><span>{s.ifnot}</span></div>
          <div className="tour-open">
            <span>{tr('See it on screen:')}</span>
            {s.open.map(([n, to, detail]) => <Link key={to} to={s.last ? journey : to} className="btn-secondary small">{menuName(to, n, detail)} ↗</Link>)}
          </div>
        </div>
        <aside className="tour-live" aria-label={tr('In the demo data')}>
          <strong>{tr('In the demo data')}</strong>
          {rows && rows.length > 0 ? (
            <ul>
              {rows.map(([a, b, st], i) => (
                <li key={`${a}-${i}`}>
                  <span><b>{a}</b>{b && <em>{b}</em>}</span>
                  {st && (MAPS[s.liveTag] ? <Tag map={MAPS[s.liveTag]} value={st} /> : <span className="tour-st">{String(st).replace(/_/g, ' ').toLowerCase()}</span>)}
                </li>
              ))}
            </ul>
          ) : <p className="tour-none">{!f ? (pick.done ? 'No example birth found yet. Run the scenarios to create one.' : 'Finding an example…') : rows ? 'This example case has nothing at this step.' : 'This step is about the platform as a whole, so there is no single record to show.'}</p>}
          {f && <Link to={journey} className="tour-more">{tr('Open this whole case ↗')}</Link>}
        </aside>
      </div>

      <div className="tour-nav">
        <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>{tr('← Back')}</button>
        <div className="tour-bar"><i style={{ width: `${((step + 1) / tour.steps.length) * 100}%` }} /></div>
        {step < tour.steps.length - 1
          ? <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>{tr('Next →')}</button>
          : <button type="button" className="btn-secondary" onClick={() => setStep(0)}>{tr('Start again')}</button>}
      </div>
    </section>
  )
}
