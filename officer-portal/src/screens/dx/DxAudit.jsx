import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, DataTable, Drawer, SearchBox, Banner, Facts } from './dxKit'

export default function DxAudit() {
  const [f, setF] = useState({ actor: '', action: '', subject: '', q: '' })
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(null)
  const [demo, setDemo] = useState(null)
  const [err, setErr] = useState(null)
  const limit = 25
  const set = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setOffset(0) }
  const { data, error, loading, reload } = useMdm('/x/audit', { ...f, limit, offset }, [JSON.stringify(f), offset])
  const { data: chain, reload: recheck } = useMdm('/audit/verify', undefined, [])
  const tamper = async () => {
    setErr(null); setDemo(null)
    try { setDemo(await mdm('/x/audit/tamper-demo', { method: 'POST', body: {} })); reload(); recheck() } catch (e) { setErr(e.message) }
  }
  const any = Object.values(f).some(Boolean)
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧾" title="Audit explorer"
        subtitle="Every action is written to a log where each line carries a fingerprint of the one before. Changing or deleting a past line breaks the chain, and the check shows exactly where."
        actions={chain ? (chain.ok ? <Badge tone="ok">Chain intact · {chain.checked.toLocaleString('en-IN')} entries</Badge> : <Badge tone="bad">Chain broken at entry {chain.broken_at}</Badge>) : null} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} rowKey="seq" server={{ total: data.total, limit, offset, onPage: setOffset }}
          searchValue={f.q} onSearch={set('q')} searchDelay={300} search={{ placeholder: 'Search any text' }}
          canClear={any} onClear={() => { setF({ actor: '', action: '', subject: '', q: '' }); setOffset(0) }}
          filters={<>
            <SearchBox value={f.actor} onChange={set('actor')} delay={300} placeholder="Who" label="Filter by who" />
            <SearchBox value={f.action} onChange={set('action')} delay={300} placeholder="Action" label="Filter by action" />
            <SearchBox value={f.subject} onChange={set('subject')} delay={300} placeholder="About" label="Filter by subject" />
          </>}
          onRowClick={(a) => setOpen(a)} empty="No entries match"
          columns={[
            { key: 'seq', label: '#', align: 'num' },
            { key: 'ts', label: 'When', render: (a) => <span className="dxk-muted">{fmtTime(a.ts)}</span> },
            { key: 'actor', label: 'Who' },
            { key: 'action', label: 'Action', render: (a) => a.action.replace(/_/g, ' ').toLowerCase() },
            { key: 'subject', label: 'About', render: (a) => <span className="dxk-muted">{a.subject}</span> },
            { key: 'go', label: '', render: (a) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setOpen(a) }}>Details</button> },
          ]} />
      )}
      <Card title="Tamper test" hint="Changes one old line for a moment, runs the check, and then undoes the change. Nothing is lost.">
        <div className="dxk-actions"><button type="button" className="btn-secondary" onClick={tamper}>Run the tamper test</button></div>
        {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
        {demo && (
          <ol className="dx-timeline" aria-label="Tamper test result">
            <li>Before the edit: <strong>{demo.before.ok ? 'intact' : 'broken'}</strong></li>
            <li>After editing entry {demo.edited_seq}: <strong>{demo.while_edited.ok ? 'intact' : `broken at entry ${demo.while_edited.broken_at}`}</strong></li>
            <li>After undoing it: <strong>{demo.after_rollback.ok ? 'intact' : 'broken'}</strong></li>
          </ol>
        )}
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Entry ${open.seq}` : ''} subtitle={open ? open.action.replace(/_/g, ' ').toLowerCase() : ''}>
        {open && <>
          <Facts items={[['When', fmtTime(open.ts)], ['Who', open.actor], ['About', open.subject], ['Fingerprint', <span key="h" className="dx-mono">{open.hash}…</span>]]} />
          <h3 className="dxk-h3">Detail</h3>
          <pre className="dxk-pre">{JSON.stringify(open.detail, null, 2)}</pre>
        </>}
      </Drawer>
    </div>
  )
}
