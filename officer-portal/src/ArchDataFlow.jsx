import { useState } from 'react'
import './ArchDataFlow.css'

/* The data flow and the life of the data, in one place. Screen names are the ones in the menu. */

const FLOW = [
  { n: 'Department feeds', tag: 'Source', tone: 'src', what: 'Ten systems hand in records: civil registration, identity reference, pension MIS, revenue certificates and land, civil supplies (PDS), education, marriage register, electricity, housing.',
    how: 'REST, daily file, read-only views, event feed', screen: 'Connectors', store: 'Stays in the department system' },
  { n: 'Check on arrival', tag: 'Quality', tone: 'qa', what: 'Each feed is tested against its own contract with Great Expectations: keys present and well formed, values possible, expected fields filled, data current.',
    how: 'Scheduled job or on demand; results kept per run', screen: 'Feed Quality', store: 'mdm.quality_run, quality_result' },
  { n: 'Load and match', tag: 'Master data', tone: 'mdm', what: 'Records are loaded as a numbered run. The identity reference token links first; name, birth date and address match as the fallback. Doubtful matches wait for a steward.',
    how: 'Fuzzy matching, transliteration, scores kept', screen: 'Master Data: People, Review queue', store: 'mdm.source_record, review_task' },
  { n: 'One record per person', tag: 'Master data', tone: 'mdm', what: 'For each field the most trusted source is chosen by a visible rule, and the other values stay listed. Parent, spouse and household links are derived.',
    how: 'Survivorship rules, versioned', screen: 'Person 360, Data Lineage', store: 'mdm.person, golden_attribute, relationship' },
  { n: 'Life event', tag: 'Exchange', tone: 'exg', what: 'A birth, death or marriage published by the registering department is matched to the people it concerns. Late, duplicate and out-of-order events are handled.',
    how: 'Event feed, thin reference only', screen: 'Event stream', store: 'mdm.event' },
  { n: 'Proposal', tag: 'Exchange', tone: 'exg', what: 'The platform proposes what each department should do. Nothing consequential happens until an officer approves, and the reason is written down.',
    how: 'Human decision, rationale required', screen: 'Approvals', store: 'mdm.proposal' },
  { n: 'Consent', tag: 'Exchange', tone: 'exg', what: 'The citizen, or a parent for a child, agrees or refuses for each use. Withdrawal stops delivery at once.',
    how: 'Portal or assisted channel, operator recorded', screen: 'Consent, My Consents', store: 'mdm.consent, consent_log' },
  { n: 'Delivery', tag: 'Exchange', tone: 'exg', what: 'Only what was agreed goes to each department, with retry and a dead-letter queue if one is down. Questions come back as a yes or no, not a document.',
    how: 'Per-subscriber delivery, verification, group counts', screen: 'Control tower, Verify, Query', store: 'mdm.delivery' },
  { n: 'Clearing house', tag: 'Evidence', tone: 'evi', what: 'Every exchange is written down, answered or refused, with the policy versions in force. The answer itself is not stored.',
    how: 'One ledger line per exchange', screen: 'Clearing house', store: 'mdm.exchange' },
  { n: 'Audit log', tag: 'Evidence', tone: 'evi', what: 'Every step above also writes a line that fingerprints the one before it, so any change to history is detectable.',
    how: 'Hash-chained, tamper test available', screen: 'Audit', store: 'mdm.audit' },
]

const CONSUMERS = ['Civil supplies (PDS)', 'Health', 'Citizen record', 'Women and child welfare', 'Education / scholarship', 'Pension / social security', 'Housing', 'Revenue']

const LIFE = [
  { s: 'Collect', d: 'Records arrive from a department feed.', k: 'Source copy in the department; a numbered load run here' },
  { s: 'Validate', d: 'The feed contract is checked; failures are shown to a steward.', k: 'Each check result kept per run' },
  { s: 'Link', d: 'Records are matched to one person, or queued for a steward.', k: 'Link status, score and reason kept with each record' },
  { s: 'Consolidate', d: 'One chosen value per field, with the rule and the alternatives.', k: 'Until the next refresh; marked stale after a set period' },
  { s: 'Use and share', d: 'Events, proposals, consented deliveries, yes or no answers.', k: 'Only what was agreed; nothing leaves without consent' },
  { s: 'Retain', d: 'Evidence is kept for a stated period.', k: 'See the table below' },
  { s: 'Purge', d: 'A withdrawal or expiry removes personal copies and keeps the proof.', k: 'Audit lines stay; personal content goes' },
]

const KEEP = [
  ['Identity link between records', 'While the person is active in any source', 'Follows the source records'],
  ['Consolidated attributes (chosen values)', 'Until the next refresh; flagged stale after a set period', 'Replaced by the next load'],
  ['Verification answer (yes or no)', 'Not stored', 'Only a ledger line: who asked, why, outcome'],
  ['Group query result', 'About 15 minutes', 'Expires on its own'],
  ['Life event', 'Thin reference for 90 days', 'Purged after the retention window'],
  ['Consent record', 'The grant period plus an evidence period', 'Then purged; the audit line stays'],
  ['Quality check results', 'Every run kept for comparison', 'Not purged automatically'],
  ['Audit log', 'Longest of all', 'Never purged by a withdrawal'],
]

const STACK = [
  ['Screens', 'React 19, Vite, react-router, one shared component kit', 'Served by Nginx; officer, citizen and family portals'],
  ['Sign-in and roles', 'Keycloak, JWT tokens checked by the service (PyJWT)', 'Role decides who may read, change or administer'],
  ['Master data service', 'Python 3.12, FastAPI, Uvicorn, Pydantic', 'One service, port 8100, behind the portal proxy'],
  ['Matching', 'RapidFuzz, transliteration, scored rules', 'Identity token first, name, birth date and address as fallback'],
  ['Database', 'PostgreSQL 16, schema mdm, psycopg 3', 'Row-level security keeps each state\'s data apart'],
  ['Feed quality', 'Great Expectations 1.24, pandas', 'Runs inside the service; results stored per run'],
  ['Lineage', 'Computed from stored records; OpenLineage-format JSON export', 'OpenMetadata is the proposed production catalogue, not installed in the demo'],
  ['Audit', 'Hash-chained rows in PostgreSQL', 'Tamper test on the Audit screen'],
  ['Runs on', 'Docker images, Kubernetes (K3s) in Rancher Desktop', 'Single-node citizen namespace on a laptop'],
]

export default function ArchDataFlow() {
  const [open, setOpen] = useState(null)
  return (
    <div className="adf">
      <section>
        <h3 className="adf-h">How data moves, from department to audit</h3>
        <p className="adf-lead">Read top to bottom. Select a step to see how it works and where it is stored.</p>
        <ol className="adf-flow">
          {FLOW.map((f, i) => (
            <li key={f.n}>
              <button type="button" className={`adf-step adf-${f.tone}${open === i ? ' open' : ''}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="adf-no">{i + 1}</span>
                <span className="adf-step-main"><strong>{f.n}</strong><span className="adf-tag">{f.tag}</span></span>
                <span className="adf-chev" aria-hidden="true">{open === i ? '▾' : '▸'}</span>
              </button>
              {open === i && (
                <div className={`adf-detail adf-${f.tone}`}>
                  <p>{f.what}</p>
                  <dl>
                    <div><dt>How</dt><dd>{f.how}</dd></div>
                    <div><dt>Screen</dt><dd>{f.screen}</dd></div>
                    <div><dt>Stored in</dt><dd><code>{f.store}</code></dd></div>
                  </dl>
                </div>
              )}
              {i < FLOW.length - 1 && <span className="adf-down" aria-hidden="true">↓</span>}
            </li>
          ))}
        </ol>
        <div className="adf-out">
          <span className="adf-out-h">Delivered to</span>
          {CONSUMERS.map((c) => <span key={c} className="adf-chip">{c}</span>)}
        </div>
      </section>

      <section>
        <h3 className="adf-h">Technology stack</h3>
        <p className="adf-lead">What each layer is built with.</p>
        <table className="adf-table">
          <thead><tr><th>Layer</th><th>Built with</th><th>Note</th></tr></thead>
          <tbody>{STACK.map(([a, b, c]) => <tr key={a}><td><strong>{a}</strong></td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </section>

      <section>
        <h3 className="adf-h">Life of the data</h3>
        <p className="adf-lead">From the day a record is collected to the day it is purged.</p>
        <ol className="adf-life">
          {LIFE.map((l, i) => (
            <li key={l.s}>
              <span className="adf-life-n">{i + 1}</span>
              <strong>{l.s}</strong>
              <span>{l.d}</span>
              <em>{l.k}</em>
            </li>
          ))}
        </ol>
        <table className="adf-table">
          <thead><tr><th>Data</th><th>How long it is kept</th><th>What happens after</th></tr></thead>
          <tbody>{KEEP.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
        <p className="adf-note">Nothing consequential acts on its own: each action is a proposal approved by a person with a recorded reason. Demonstration values; production hosting and retention are set with the client.</p>
      </section>
    </div>
  )
}
