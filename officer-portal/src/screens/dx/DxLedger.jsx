import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMdm, Status } from '../mdm/shared'
import { Tag, OUTCOME, fmtTime } from './dxShared'
import { PageHeader, DataTable, Drawer, FilterSelect, Facts, DateRange, useServerTable } from './dxKit'
import { tr, tObj } from '../../i18n/lang'

const KINDS = tObj({ VERIFY: 'Verification', QUERY: 'Population query', EVENT: 'Event / notice', PROPOSAL: 'Decision' })

export default function DxLedger() {
  const [sp] = useSearchParams()
  const [kind, setKind] = useState(sp.get('kind') || '')
  const [outcome, setOutcome] = useState(sp.get('outcome') || '')
  const [q, setQ] = useState(sp.get('q') || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const T = useServerTable(null, 15)
  const { offset, setOffset, limit } = T
  const [sel, setSel] = useState(null)
  const { data, error, loading } = useMdm('/x/ledger', { kind, outcome, q: q.trim(), date_from: from, date_to: to, limit, offset, ...T.sortParams }, [kind, outcome, q, from, to, offset, T.key])
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧾" title={tr('Clearing house')}
        subtitle={tr('Every exchange is written here, answered or refused, with the policy versions in force at that moment. Answers are not stored; this is the evidence that a question was asked.')} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={T.server(data.total)}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search department, person, purpose or question' }}
          canClear={!!(kind || outcome || q || from || to)} onClear={() => { setKind(''); setOutcome(''); setQ(''); setFrom(''); setTo(''); setOffset(0) }}
          filters={<>
            <FilterSelect label={tr('Kind')} value={kind} onChange={(v) => { setKind(v); setOffset(0) }} options={Object.entries(KINDS)} />
            <FilterSelect label={tr('Outcome')} value={outcome} onChange={(v) => { setOutcome(v); setOffset(0) }} options={Object.entries(OUTCOME).map(([k, v]) => [k, v[0]])} />
            <DateRange label={tr('Between')} from={from} to={to} onFrom={(v) => { setFrom(v); setOffset(0) }} onTo={(v) => { setTo(v); setOffset(0) }} />
          </>}
          onRowClick={setSel} empty={tr('Nothing recorded yet')}
          columns={[
            { key: 'ts', sortKey: 'ts', label: 'When', render: (x) => <span className="dxk-muted">{fmtTime(x.ts)}</span> },
            { key: 'kind', sortKey: 'kind', label: 'Kind', render: (x) => KINDS[x.kind] || x.kind },
            { key: 'requester', sortKey: 'requester', label: 'Asked by', render: (x) => <>{x.requester}<div className="dxk-muted">{x.requester_actor}</div></> },
            { key: 'person_name', sortKey: 'person_name', label: 'About', render: (x) => x.person_name || '—' },
            { key: 'question', sortKey: 'question', label: 'Question', render: (x) => (x.question || '').replace(/_/g, ' ').toLowerCase() },
            { key: 'outcome', sortKey: 'outcome', label: 'Outcome', render: (x) => <Tag map={OUTCOME} value={x.outcome} /> },
            { key: 'go', label: '', sort: false, render: (x) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setSel(x) }}>{tr('Details')}</button> },
          ]} />
      )}
      <Drawer open={!!sel} onClose={() => setSel(null)} title={tr('Exchange details')} subtitle={sel ? `${tr('Exchange {id}', { id: sel.id })} · ${fmtTime(sel.ts)}` : ''}>
        {sel && (
          <>
            <Facts items={[['Kind', KINDS[sel.kind] || sel.kind], ['Asked by', `${sel.requester}${sel.requester_actor ? ` (${sel.requester_actor})` : ''}`], ['About', sel.person_name], ['Purpose', sel.purpose || '—'],
              ['Question', (sel.question || '').replace(/_/g, ' ').toLowerCase()], ['Outcome', <Tag key="o" map={OUTCOME} value={sel.outcome} />], ['Elapsed', sel.elapsed_ms != null ? `${sel.elapsed_ms} ms` : '—']]} />
            <hr className="dxk-rule" />
            <h3 className="dxk-h3">{tr('Policy versions in force')}</h3>
            <p className="dx-mono">{Object.entries(sel.policy_versions || {}).map(([k, v]) => `${k}=v${v}`).join(', ') || '—'}</p>
            {sel.answer?.batch_id != null && (
              <>
                <h3 className="dxk-h3">{tr('Batch')}</h3>
                <p><Link to={`/dx/work?batch=${sel.answer.batch_id}`}>{tr('Batch {id}', { id: sel.answer.batch_id })}</Link></p>
              </>
            )}
            <h3 className="dxk-h3">{tr('Returned')}</h3>
            <pre className="dxk-pre">{JSON.stringify(sel.answer, null, 2)}</pre>
          </>
        )}
      </Drawer>
    </div>
  )
}
