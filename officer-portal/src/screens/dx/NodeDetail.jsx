import { Drawer, Facts } from './dxKit'
import { Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { tr } from '../../i18n/lang'

const KIND = { source: 'Source system', event: 'Life event', person: 'Person', proposal: 'Proposed action', consent: 'Consent', delivery: 'Delivery', ledger: 'Clearing house', audit: 'Audit log' }
const WHAT = {
  source: 'The department feed that published this event.',
  event: 'The life event as received. Everything to its right happened because of it.',
  person: 'The master-data person the event was matched to.',
  proposal: 'An action the system proposed for a person or department to approve.',
  consent: 'The permission asked of the person before data may be shared.',
  delivery: 'A notice sent to a department system, only where consent allowed it.',
  ledger: 'Every release of data about this person under these consents: what, to whom, and the outcome.',
  audit: 'Tamper-evident log lines for this event, each fingerprinting the one before.',
}
const words = (s) => (s ? String(s).toLowerCase().replace(/_/g, ' ') : s)
const TONE = { LINKED: 'ok', AWAITING_APPROVAL: 'warn', PROCESSED: 'ok', APPROVED: 'ok', GRANTED: 'ok', DELIVERED: 'ok', ALLOWED: 'ok', PROPOSED: 'warn', PENDING: 'warn', PENDING_CONSENT: 'warn', RETRYING: 'warn', REVOKED: 'bad', DEAD_LETTER: 'bad', NO_MATCH: 'bad' }

function Rows({ rows, cols }) {
  if (!rows?.length) return null
  return (
    <div className="lin-nd-table">
      <table className="mdm-table">
        <thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.seq ?? r.id ?? i}>{cols.map(([k, l, f]) => <td key={l}>{f ? f(r[k], r) : r[k] ?? '—'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** Right-hand drawer with what one box of an event's journey means and the facts behind it. */
export default function NodeDetail({ node, onClose, onOpen }) {
  const d = node?.detail || {}
  const facts = node ? [
    ['When', node.ts ? fmtTime(node.ts) : null],
    ['Key', d.event_key], ['Use case', d.uc], ['Scenario', d.scenario], ['Interface', d.interface],
    ['Kind', d.kind && words(d.kind)], ['System', d.system], ['Purpose', d.purpose], ['Consent', d.consent_id ? `Consent ${d.consent_id}` : null],
    ['Answered through', d.answered_via && words(d.answered_via)], ['Attempts', d.attempts], ['Decided by', d.decided_by], ['Proposed', d.proposed_at ? fmtTime(d.proposed_at) : null],
    ['Role', d.role], ['As registered', d.registered_name], ['Why', d.rationale], ['Note', d.note],
  ] : []
  return (
    <Drawer open={!!node} onClose={onClose} title={node?.label || ''} subtitle={node ? `${KIND[node.kind] || node.kind}${node.sub ? ` · ${node.sub}` : ''}` : ''}>
      {node && (
        <div className="lin-nd">
          {node.status && <p className="lin-nd-status"><Badge tone={TONE[node.status] || 'neutral'}>{node.status_text || words(node.status)}</Badge></p>}
          <p className="mdm-note" style={{ marginTop: 0 }}>{WHAT[node.kind]}</p>
          <Facts items={facts} />
          <Rows rows={d.rows && node.kind === 'ledger' ? d.rows : null} cols={[['id', 'No.'], ['ts', 'When', (v) => fmtTime(v)], ['kind', 'Kind', words], ['requester', 'To'], ['outcome', 'Outcome', words]]} />
          <Rows rows={d.rows && node.kind === 'audit' ? d.rows : null} cols={[['seq', 'No.'], ['ts', 'When', (v) => fmtTime(v)], ['actor', 'By'], ['action', 'Action', words], ['subject', 'About']]} />
          {node.link && <div className="lin-nd-actions"><button type="button" className="btn-primary" onClick={() => onOpen(node)}>{tr('Open the full screen →')}</button></div>}
        </div>
      )}
    </Drawer>
  )
}
