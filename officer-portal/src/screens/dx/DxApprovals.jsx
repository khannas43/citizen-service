import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMdm, Status } from '../mdm/shared'
import { ApprovalCard, PROPOSAL, Tag, fmtTime } from './dxShared'
import { PageHeader, DataTable, Drawer, Segmented, FilterSelect } from './dxKit'

const kindLabel = (k) => (k || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** The departments' queue: every follow-up action waits here for a person to approve or reject it, with a reason on record. */
export default function DxApprovals() {
  const nav = useNavigate()
  const [system, setSystem] = useState('')
  const [uc, setUc] = useState('')
  const [status, setStatus] = useState('PROPOSED')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [sel, setSel] = useState(null)
  const limit = 15
  const { data, error, loading } = useMdm('/x/approvals', { system, uc, status, q: q.trim(), limit, offset }, [system, uc, status, q, offset, tick])
  const reset = () => { setSystem(''); setUc(''); setQ(''); setOffset(0) }
  return (
    <div className="mdm-hub">
      <PageHeader icon="✅" title="Approvals"
        subtitle="Nothing that affects a person's benefits happens on its own. Each action waits here until an authorised officer approves or rejects it; the reason is kept with their name. Approving marks the action ready for the department; this build does not change any department's system." />
      <Status loading={loading && !data} error={error} />
      <DataTable
        rows={data?.items || []} server={data ? { total: data.total, limit, offset, onPage: setOffset } : { total: 0, limit, offset, onPage: setOffset }}
        searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search action, person or MDM id' }}
        canClear={!!(system || uc || q)} onClear={reset}
        filters={<>
          <div className="dxk-filter"><span>Status</span>
            <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0) }}
              options={Object.entries(PROPOSAL).map(([k, [t]]) => ({ value: k, label: t }))} /></div>
          <FilterSelect label="Department" value={system} all="All departments" onChange={(v) => { setSystem(v); setOffset(0) }}
            options={(data?.by_system || []).map((s) => [s.system, `${s.system} (${s.n})`])} />
          <FilterSelect label="Use case" value={uc} onChange={(v) => { setUc(v); setOffset(0) }} options={['UC1', 'UC2', 'UC3', 'UC4', 'UC5', 'UC6']} />
        </>}
        empty="No actions here" emptyHint={status === 'PROPOSED' ? 'Nothing is waiting for a decision.' : undefined}
        onRowClick={setSel} rowKey="id"
        columns={[
          { key: 'created_at', label: 'Raised', render: (p) => <span className="dxk-muted">{fmtTime(p.created_at)}</span> },
          { key: 'summary', label: 'Action', render: (p) => <><div className="dxk-main">{p.summary}</div><div className="dxk-muted">{kindLabel(p.kind)}{p.uc ? ` · ${p.uc}` : ''}</div></> },
          { key: 'system', label: 'Department' },
          { key: 'person_name', label: 'Person', render: (p) => p.person_name || '—' },
          { key: 'status', label: 'Status', render: (p) => <Tag map={PROPOSAL} value={p.status} /> },
          { key: 'go', label: '', render: (p) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setSel(p) }}>{p.status === 'PROPOSED' ? 'Review' : 'View'}</button> },
        ]}
      />
      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? kindLabel(sel.kind) : ''} subtitle={sel ? `${sel.system}${sel.person_name ? ` · ${sel.person_name}` : ''}` : ''} wide>
        {sel && (
          <ApprovalCard p={sel} minChars={data?.rationale_min_chars} reload={() => { setSel(null); setTick((n) => n + 1) }}
            openPerson={(id) => nav(`/mdm?tab=people&person=${id}`)} openCase={(id) => nav(`/dx/events?case=${id}`)} />
        )}
      </Drawer>
    </div>
  )
}
