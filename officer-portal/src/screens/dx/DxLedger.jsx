import { useState } from 'react'
import { useMdm, Status } from '../mdm/shared'
import { Tag, OUTCOME, fmtTime } from './dxShared'
import { PageHeader, DataTable, Drawer, FilterSelect, Facts } from './dxKit'

const KINDS = { VERIFY: 'Verification', QUERY: 'Population query', EVENT: 'Event / notice', PROPOSAL: 'Decision' }

export default function DxLedger() {
  const [kind, setKind] = useState('')
  const [outcome, setOutcome] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [sel, setSel] = useState(null)
  const limit = 15
  const { data, error, loading } = useMdm('/x/ledger', { kind, outcome, q: q.trim(), limit, offset }, [kind, outcome, q, offset])
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧾" title="Clearing house"
        subtitle="Every exchange is written here, answered or refused, with the policy versions in force at that moment. Answers are not stored; this is the evidence that a question was asked." />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search department, person, purpose or question' }}
          canClear={!!(kind || outcome || q)} onClear={() => { setKind(''); setOutcome(''); setQ(''); setOffset(0) }}
          filters={<>
            <FilterSelect label="Kind" value={kind} onChange={(v) => { setKind(v); setOffset(0) }} options={Object.entries(KINDS)} />
            <FilterSelect label="Outcome" value={outcome} onChange={(v) => { setOutcome(v); setOffset(0) }} options={Object.entries(OUTCOME).map(([k, v]) => [k, v[0]])} />
          </>}
          onRowClick={setSel} empty="Nothing recorded yet"
          columns={[
            { key: 'ts', label: 'When', render: (x) => <span className="dxk-muted">{fmtTime(x.ts)}</span> },
            { key: 'kind', label: 'Kind', render: (x) => KINDS[x.kind] || x.kind },
            { key: 'requester', label: 'Asked by', render: (x) => <>{x.requester}<div className="dxk-muted">{x.requester_actor}</div></> },
            { key: 'person_name', label: 'About', render: (x) => x.person_name || '—' },
            { key: 'question', label: 'Question', render: (x) => (x.question || '').replace(/_/g, ' ').toLowerCase() },
            { key: 'outcome', label: 'Outcome', render: (x) => <Tag map={OUTCOME} value={x.outcome} /> },
            { key: 'go', label: '', render: (x) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setSel(x) }}>Details</button> },
          ]} />
      )}
      <Drawer open={!!sel} onClose={() => setSel(null)} title="Exchange details" subtitle={sel ? `Exchange ${sel.id} · ${fmtTime(sel.ts)}` : ''}>
        {sel && (
          <>
            <Facts items={[['Kind', KINDS[sel.kind] || sel.kind], ['Asked by', `${sel.requester}${sel.requester_actor ? ` (${sel.requester_actor})` : ''}`], ['About', sel.person_name], ['Purpose', sel.purpose || '—'],
              ['Question', (sel.question || '').replace(/_/g, ' ').toLowerCase()], ['Outcome', <Tag key="o" map={OUTCOME} value={sel.outcome} />], ['Elapsed', sel.elapsed_ms != null ? `${sel.elapsed_ms} ms` : '—']]} />
            <hr className="dxk-rule" />
            <h3 className="dxk-h3">Policy versions in force</h3>
            <p className="dx-mono">{Object.entries(sel.policy_versions || {}).map(([k, v]) => `${k}=v${v}`).join(', ') || '—'}</p>
            <h3 className="dxk-h3">Returned</h3>
            <pre className="dxk-pre">{JSON.stringify(sel.answer, null, 2)}</pre>
          </>
        )}
      </Drawer>
    </div>
  )
}
