import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMdm, Status, Pager } from '../mdm/shared'
import { ApprovalCard, PROPOSAL } from './dxShared'

/** The departments' queue: every follow-up action waits here for a person to approve or reject it, with a reason on record. */
export default function DxApprovals() {
  const nav = useNavigate()
  const [system, setSystem] = useState('')
  const [status, setStatus] = useState('PROPOSED')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const limit = 20
  const { data, error, loading } = useMdm('/x/approvals', { system, status, limit, offset }, [system, status, offset, tick])
  return (
    <div className="mdm-hub">
      <h1 className="page-title">Approvals</h1>
      <p className="mdm-intro">Nothing that affects a person's benefits happens on its own. Each action waits in its department's queue until an authorised officer approves or rejects it, and the reason is kept with their name.</p>
      <p className="mdm-note">Approving records the decision and marks the action ready for the department. This build does not change any department's system.</p>
      <form className="mdm-filters" onSubmit={(e) => e.preventDefault()}>
        <label className="mdm-field"><span>Department</span>
          <select value={system} onChange={(e) => { setSystem(e.target.value); setOffset(0) }}>
            <option value="">All departments</option>
            {(data?.by_system || []).map((s) => <option key={s.system} value={s.system}>{s.system} ({s.n})</option>)}
          </select></label>
        <label className="mdm-field"><span>Status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
            {Object.entries(PROPOSAL).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></label>
      </form>
      <Status loading={loading && !data} error={error} />
      {data && data.total === 0 && <p className="mdm-note">Nothing here.</p>}
      {data && data.items.map((p) => (
        <ApprovalCard key={p.id} p={p} minChars={data.rationale_min_chars} reload={() => setTick((n) => n + 1)}
          openPerson={(id) => nav(`/mdm?tab=people&person=${id}`)} openCase={(id) => nav(`/dx/events?case=${id}`)} />
      ))}
      {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
    </div>
  )
}
