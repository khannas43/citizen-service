import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMdm, Status } from '../mdm/shared'
import { PageHeader, Banner } from './dxKit'
import DxTour from './DxTour'
import './dxLineage.css'
import './dxStory.css'
import { tr } from '../../i18n/lang'

/* Where the data moves in each use case. Every step is a real screen; the words on the arrows say what travels between them. */
const SPINE = [
  ['Department feeds', '/dx/quality', 'records arrive'], ['Master data', '/mdm?tab=people', 'one person, one record'], ['Event stream', '/dx/events', 'life event published'],
  ['Proposals', '/dx/approvals', 'an officer decides, with a reason'], ['Consent', '/dx/consent', 'the citizen agrees or not'], ['Deliveries', '/dx/control', 'only what was agreed is sent'],
  ['Clearing house', '/dx/ledger', 'every exchange recorded'], ['Audit log', '/dx/audit', 'tamper-evident trail'],
]

const LANES = [
  { uc: 'UC1', title: 'Know the person', story: 'One person is held by several departments under different spellings. The platform recognises them as one, shows who said what, and asks a steward when it is not sure.',
    steps: [
      { n: 'Department feeds', to: '/dx/quality', moves: 'Records from ten systems, checked on arrival' },
      { n: 'Match and link', to: '/mdm?tab=people', moves: 'Name, birth date, district compared across systems' },
      { n: 'Steward review', to: '/mdm?tab=review', moves: 'Doubtful matches wait for a person to decide' },
      { n: 'Person record', to: '/mdm?tab=people', moves: 'Chosen values, each with its source and rule' },
      { n: 'Data lineage', to: '/dx/lineage?tab=person', moves: 'Which system supplied which value' },
    ] },
  { uc: 'UC2', title: 'A child is born', story: 'Civil registration publishes a birth. The platform proposes what each department should do, asks the parent, and sends only what the parent allowed.',
    steps: [
      { n: 'Event stream', to: '/dx/events', moves: 'Birth registered, matched to the parents' },
      { n: 'Proposals', to: '/dx/approvals', moves: 'Add to ration card, request an identity reference' },
      { n: 'Consent', to: '/dx/consent', moves: 'Parent allows some uses, refuses others' },
      { n: 'Deliveries', to: '/dx/control', moves: 'Sent, held or stopped, per department' },
      { n: 'Department notices', to: '/dx/notices', moves: 'Each department answers: accepted, applied, or rejected and sent back' },
      { n: 'Clearing house', to: '/dx/ledger', moves: 'What was released, to whom' },
      { n: 'Audit log', to: '/dx/audit', moves: 'Each step, fingerprinted' },
    ] },
  { uc: 'UC3', title: 'A death is registered', story: 'A death stops what must stop: pensions and benefits are proposed for suspension, and nothing happens until an officer approves with a reason.',
    steps: [
      { n: 'Event stream', to: '/dx/events', moves: 'Death registered, person identified (or not)' },
      { n: 'Person record', to: '/mdm?tab=people', moves: 'Marked as deceased, with the source' },
      { n: 'Proposals', to: '/dx/approvals', moves: 'Stop pension, close benefits' },
      { n: 'Deliveries', to: '/dx/control', moves: 'Notices to the departments concerned' },
      { n: 'Audit log', to: '/dx/audit', moves: 'Who approved, and why' },
    ] },
  { uc: 'UC4', title: 'Eligibility without moving documents', story: 'A department asks a yes or no question. It gets the answer, not the document, and only if the citizen consented.',
    steps: [
      { n: 'Verification', to: '/dx/verify', moves: 'A question about one person, with a purpose' },
      { n: 'Consent', to: '/dx/consent', moves: 'Is there a current consent for this purpose?' },
      { n: 'Policy', to: '/dx/policy', moves: 'The rule in force at that moment' },
      { n: 'Group queries', to: '/dx/query', moves: 'Counts only, small groups refused' },
      { n: 'Clearing house', to: '/dx/ledger', moves: 'The question and outcome, not the answer' },
    ] },
  { uc: 'UC5', title: 'Household benefits', story: 'The household is seen as a whole, so a benefit paid twice or a member who should be added is noticed and proposed, not acted on silently.',
    steps: [
      { n: 'Person 360', to: '/mdm?tab=people', moves: 'Household members, relationships and benefits across systems' },
      { n: 'Proposals', to: '/dx/approvals', moves: 'Possible duplicate, add a member' },
      { n: 'Deliveries', to: '/dx/control', moves: 'Alerts with the minimum content' },
      { n: 'Audit log', to: '/dx/audit', moves: 'Decision and rationale' },
    ] },
  { uc: 'UC6', title: 'Marriage', story: 'A marriage links two people and their households. The platform proposes the record changes each department needs and asks both people.',
    steps: [
      { n: 'Event stream', to: '/dx/events', moves: 'Marriage registered, both people matched' },
      { n: 'Person 360', to: '/mdm?tab=people', moves: 'Spouse link and the new household' },
      { n: 'Proposals', to: '/dx/approvals', moves: 'Update ration card and records' },
      { n: 'Consent', to: '/dx/consent', moves: 'Each person answers for their own data' },
      { n: 'Deliveries', to: '/dx/control', moves: 'Sent to the departments agreed' },
    ] },
]

const SUPPORT = [
  ['Connectors', '/dx/connectors', 'How each department system is plugged in'], ['Keys and access', '/dx/keys', 'Who may call what'], ['Standards', '/dx/standards', 'Formats and codes in use'],
  ['Retention', '/dx/retention', 'What is kept, for how long, and purged'], ['Citizen view', '/dx/citizen', 'A person sees their own data and consents'], ['Assisted service', '/dx/assisted', 'An operator helps in person'],
  ['Data lineage', '/dx/lineage', 'Where every value came from'], ['Feed quality', '/dx/quality', 'Each feed checked against its contract'], ['Scenario runner', '/dx/scenarios', 'Run the scripted scenarios and see the evidence'],
]

/** A box that starts closed and opens on demand; the header always shows what it is about. */
function Fold({ id, open, onToggle, title, hint, tone, aside, children }) {
  return (
    <section className={`dxk-card story-fold${tone ? ` tone-${tone}` : ''}${open ? ' open' : ''}`}>
      <div className="dxk-card-head story-fold-head">
        <button type="button" className="story-fold-btn" aria-expanded={open} aria-controls={`fold-${id}`} onClick={onToggle}>
          <span className="story-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span>
            <h2 className="dxk-card-title">{title}</h2>
            {hint && <p className="dxk-card-hint">{hint}</p>}
          </span>
        </button>
        {aside && <div className="dxk-card-actions">{aside}</div>}
      </div>
      {open && <div id={`fold-${id}`} className="dxk-card-body">{children}</div>}
    </section>
  )
}

function tally(items, uc) {
  const mine = items.filter((i) => i.uc === uc)
  const last = mine.map((i) => i.last?.status)
  return { total: mine.length, pass: last.filter((s) => s === 'PASS').length, gap: last.filter((s) => s === 'PARTIAL').length,
    fail: last.filter((s) => s && s !== 'PASS' && s !== 'PARTIAL').length, none: last.filter((s) => !s).length }
}

export default function DxStory() {
  const nav = useNavigate()
  const { data, error, loading } = useMdm('/x/demo/scenarios', {}, [])
  const items = data?.items || []
  const ids = ['spine', ...LANES.map((l) => l.uc), 'support']
  const [open, setOpen] = useState({})
  const flip = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))
  const allOpen = ids.every((i) => open[i])
  return (
    <div className="mdm-hub">
      <PageHeader icon="🗺" title={tr('How the pieces fit')}
        subtitle={tr('Six use cases, each shown as the screens a case passes through, with what moves from one to the next. Select a step to open that screen. The status under each use case is the latest result of its scripted scenarios.')} />

      <DxTour />

      <div className="story-bar">
        <h2 className="story-sub">{tr('All use cases at a glance')}</h2>
        <button type="button" className="btn-secondary small" onClick={() => setOpen(Object.fromEntries(ids.map((i) => [i, !allOpen])))}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
      </div>

      <Fold id="spine" open={!!open.spine} onToggle={() => flip('spine')} title={tr('The common path')} hint={tr('Every use case rides the same spine. What differs is which steps it uses.')}>
        <ol className="story-spine">
          {SPINE.map(([n, to, moves], i) => (
            <li key={n}>
              <Link to={to} className="story-spine-step"><strong>{n}</strong><span>{moves}</span></Link>
              {i < SPINE.length - 1 && <span className="story-arrow" aria-hidden="true">➜</span>}
            </li>
          ))}
        </ol>
      </Fold>

      <Status loading={loading && !data} error={error} />
      {LANES.map((l) => {
        const t = tally(items, l.uc)
        const tone = t.fail ? 'bad' : t.gap || t.none ? 'warn' : t.total ? 'ok' : undefined
        return (
          <Fold key={l.uc} id={l.uc} open={!!open[l.uc]} onToggle={() => flip(l.uc)} tone={tone} title={`${l.uc} · ${l.title}`} hint={l.story}
            aside={data && (
              <button type="button" className="btn-secondary small" onClick={() => nav('/dx/scenarios')} aria-label={`${l.uc} scenarios`}>
                {tr('{pass} of {total} scenarios passed{v}{v2}{v3}', { pass: t.pass, total: t.total, v: t.gap ? ` · ${tr('{n} with a gap', { n: t.gap })}` : '', v2: t.fail ? ` · ${tr('{n} failed', { n: t.fail })}` : '', v3: t.none ? ` · ${tr('{n} not run', { n: t.none })}` : '' })}
              </button>
            )}>
            <ol className="story-lane">
              {l.steps.map((s, i) => (
                <li key={`${s.n}-${i}`}>
                  <Link to={s.to} className="story-step"><span className="story-no">{i + 1}</span><strong>{s.n}</strong><span>{s.moves}</span></Link>
                  {i < l.steps.length - 1 && <span className="story-arrow" aria-hidden="true">➜</span>}
                </li>
              ))}
            </ol>
          </Fold>
        )
      })}

      <Fold id="support" open={!!open.support} onToggle={() => flip('support')} title={tr('Behind every use case')} hint={tr('The supporting screens that make the flows safe, visible and checkable.')}>
        <div className="story-support">
          {SUPPORT.map(([n, to, why]) => <Link key={n} to={to} className="story-step"><strong>{n}</strong><span>{why}</span></Link>)}
        </div>
      </Fold>
      <Banner tone="info">{tr('Nothing in these flows acts on its own. Each consequential action is a proposal that a person approves with a recorded reason, and every step lands in the audit log.')}</Banner>
    </div>
  )
}
