import { useState } from 'react'
import { useMdm, Status, Pager } from '../mdm/shared'
import { Tag, OUTCOME, fmtTime } from './dxShared'

const KINDS = { VERIFY: 'Verification', QUERY: 'Population query', EVENT: 'Event / notice', PROPOSAL: 'Decision' }

export default function DxLedger() {
  const [kind, setKind] = useState('')
  const [outcome, setOutcome] = useState('')
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(null)
  const limit = 25
  const { data, error, loading } = useMdm('/x/ledger', { kind, outcome, limit, offset }, [kind, outcome, offset])
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Clearing house</h1>
      <p className="mdm-intro">Every exchange is written here, answered or refused, with the policy versions in force at that moment. Answers are not stored; this is the evidence that a question was asked.</p>
      <div className="mdm-filters">
        <label className="mdm-field"><span>Kind</span><select value={kind} onChange={(e) => { setKind(e.target.value); setOffset(0) }}><option value="">All</option>{Object.entries(KINDS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="mdm-field"><span>Outcome</span><select value={outcome} onChange={(e) => { setOutcome(e.target.value); setOffset(0) }}><option value="">All</option>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></label>
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <section className="mdm-card flush">
          <div className="mdm-table-wrap">
            <table className="mdm-table">
              <thead><tr><th>When</th><th>Kind</th><th>Asked by</th><th>About</th><th>Question</th><th>Outcome</th><th /></tr></thead>
              <tbody>
                {data.items.flatMap((x) => [
                  <tr key={x.id}>
                    <td className="mdm-sub">{fmtTime(x.ts)}</td><td>{KINDS[x.kind] || x.kind}</td><td>{x.requester}<div className="mdm-sub">{x.requester_actor}</div></td>
                    <td>{x.person_name || '—'}</td><td>{(x.question || '').replace(/_/g, ' ').toLowerCase()}</td><td><Tag map={OUTCOME} value={x.outcome} /></td>
                    <td><button type="button" className="mdm-link" onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? 'Hide' : 'Details'}</button></td>
                  </tr>,
                  open === x.id && (
                    <tr key={`${x.id}d`}><td colSpan={7}>
                      <dl className="dx-kv"><dt>Purpose</dt><dd>{x.purpose || '—'}</dd><dt>Elapsed</dt><dd>{x.elapsed_ms != null ? `${x.elapsed_ms} ms` : '—'}</dd>
                        <dt>Policy versions</dt><dd className="dx-mono">{Object.entries(x.policy_versions || {}).map(([k, v]) => `${k}=v${v}`).join(', ') || '—'}</dd>
                        <dt>Returned</dt><dd className="dx-mono">{JSON.stringify(x.answer)}</dd></dl>
                    </td></tr>
                  ),
                ])}
                {!data.items.length && <tr><td colSpan={7} className="mdm-empty">Nothing recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </section>
      )}
    </div>
  )
}
