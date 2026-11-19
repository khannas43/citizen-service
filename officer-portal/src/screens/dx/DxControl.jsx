import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, DELIVERY, OUTCOME, fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Banner, EmptyState, FilterSelect, Segmented } from './dxKit'
import { tr } from '../../i18n/lang'
import { isDeptOfficerRole } from '../../auth'
import DxFlowBoard from './DxFlowBoard'

function Subscribers({ rows, reload }) {
  const [msg, setMsg] = useState(null)
  const [state, setState] = useState('')
  const flip = async (s) => {
    setMsg(null)
    try {
      const r = await mdm(`/x/subscribers/${s.system}`, { method: 'POST', body: { available: !s.available, note: s.available ? 'Taken offline from the control tower' : null } })
      if (r.retried) setMsg(tr('{name} is back. Waiting items: {a} sent, {b} still retrying, {c} set aside.', { name: s.name, a: r.retried.delivered, b: r.retried.still_retrying, c: r.retried.dead_letter }))
      reload()
    } catch (e) { setMsg(e.message) }
  }
  const retry = async () => {
    try { const r = await mdm('/x/deliveries/retry', { method: 'POST', body: {} }); setMsg(tr('Retry run: {a} sent, {b} still retrying, {c} set aside.', { a: r.delivered, b: r.still_retrying, c: r.dead_letter })); reload() } catch (e) { setMsg(e.message) }
  }
  const shown = rows.filter((s) => !state || (state === 'offline' ? !s.available : s.available))
  return (
    <Card title={tr('Departments receiving events')} flush
      hint={tr('Take a department offline to show that nothing is lost: its events wait, are retried, and are set aside for a person after the allowed number of attempts.')}
      actions={<button type="button" className="btn-secondary small" onClick={retry}>{tr('Retry waiting items now')}</button>}>
      {msg && <div style={{ padding: '0.6rem 1rem 0' }}><Banner tone="ok">{msg}</Banner></div>}
      <DataTable rows={shown} rowKey="system" pageSize={25} pageSizes={[25]} initialSort={{ key: 'name', dir: 'asc' }}
        search={{ placeholder: 'Search departments', text: (s) => `${s.name} ${s.system}` }}
        canClear={!!state} onClear={() => setState('')}
        filters={<FilterSelect label={tr('State')} value={state} onChange={setState} options={[['available', 'Available'], ['offline', 'Offline']]} />}
        rowClass={(s) => (s.available ? '' : 'dx-off')}
        columns={[
          { key: 'name', label: 'Department', sort: true, render: (s) => <span className="dxk-main">{s.name}</span> },
          { key: 'state', label: 'State', sort: (s) => (s.available ? 1 : 0), render: (s) => <>{s.available ? <Badge tone="ok">{tr('Available')}</Badge> : <Badge tone="bad">{tr('Offline')}</Badge>}{s.note && !s.available ? <div className="mdm-sub">{s.note}</div> : null}</> },
          { key: 'sent', label: 'Sent', align: 'num', sort: (s) => s.deliveries.DELIVERED || 0, render: (s) => s.deliveries.DELIVERED || 0 },
          { key: 'retry', label: 'Retrying', align: 'num', sort: (s) => s.deliveries.RETRYING || 0, render: (s) => s.deliveries.RETRYING || 0 },
          { key: 'dead', label: 'Set aside', align: 'num', sort: (s) => s.deliveries.DEAD_LETTER || 0, render: (s) => s.deliveries.DEAD_LETTER || 0 },
          { key: 'go', label: '', render: (s) => <button type="button" className="btn-secondary small" onClick={() => flip(s)}>{s.available ? tr('Take offline') : tr('Bring back')}</button> },
        ]} />
    </Card>
  )
}

function Overview() {
  const nav = useNavigate()
  const { data, error, loading, reload } = useMdm('/x/control', undefined, [])
  const { data: dead, reload: reloadDead } = useMdm('/x/deliveries', { status: 'DEAD_LETTER', limit: 50 }, [])
  const { data: nt } = useMdm('/x/notices', { limit: 1 }, [])
  const [msg, setMsg] = useState(null)
  if (!data) return <div className="mdm-hub"><PageHeader icon="🗼" title={tr('Overview')} /><Status loading={loading} error={error} /></div>
  const d = data
  const redeliver = async (id) => {
    setMsg(null)
    try { await mdm(`/x/deliveries/${id}/redeliver`, { method: 'POST', body: {} }); setMsg('Sent.') } catch (e) { setMsg(e.message) }
    reload(); reloadDead()
  }
  const openTotal = d.open_approvals.reduce((a, r) => a + r.n, 0)
  return (
    <div className="mdm-hub">
      <PageHeader icon="🗼" title={tr('Overview')} subtitle={tr('What is moving, what is waiting and what needs a person, across every department.')}
        actions={<button type="button" className="btn-secondary small" onClick={() => { reload(); reloadDead() }}>{tr('Refresh')}</button>} />
      <Stats items={[
        { label: 'Events received', value: d.events.n.toLocaleString('en-IN'), hint: tr('{n} in the last day', { n: d.events.day }), onClick: () => nav('/dx/events') },
        { label: 'Waiting for a decision', value: openTotal, tone: openTotal ? 'warn' : 'ok', hint: 'Open the approvals inbox', onClick: () => nav('/dx/approvals') },
        nt?.counts && { label: 'Departments yet to answer', value: (nt.counts.waiting + nt.counts.overdue).toLocaleString('en-IN'), tone: nt.counts.overdue ? 'bad' : nt.counts.waiting ? 'warn' : 'ok',
          hint: nt.counts.overdue ? tr('{n} past the deadline', { n: nt.counts.overdue }) : 'Open the department notices', onClick: () => nav('/dx/notices') },
        { label: 'Set aside after failures', value: d.dead_letters, tone: d.dead_letters ? 'bad' : 'ok' },
        { label: 'Open corrections', value: d.open_discrepancies, tone: d.open_discrepancies ? 'warn' : 'ok', onClick: () => nav('/dx/discrepancies') },
        { label: 'Possible misuse flags (24h)', value: d.misuse_alerts, tone: d.misuse_alerts ? 'bad' : 'ok', onClick: () => nav('/dx/access') },
        { label: 'Audit log', value: d.audit_chain.ok ? tr('Intact') : tr('BROKEN'), tone: d.audit_chain.ok ? 'ok' : 'bad', hint: tr('{n} entries checked', { n: d.audit_chain.checked.toLocaleString('en-IN') }), onClick: () => nav('/dx/audit') },
      ]} />
      <Subscribers rows={d.subscribers} reload={() => { reload(); reloadDead() }} />
      {dead?.items?.length > 0 && (
        <Card title={tr('Set aside for a person')} tone="bad" flush hint={tr('These could not be delivered after the allowed attempts. Send again once the department is back.')}>
          {msg && <div style={{ padding: '0.6rem 1rem 0' }}><Banner>{msg}</Banner></div>}
          <DataTable rows={dead.items} pageSize={10} pageSizes={[10, 25]} search={{ placeholder: 'Search department or purpose', text: (x) => `${x.system} ${x.purpose}` }}
            columns={[
              { key: 'status', label: 'Status', render: (x) => <Tag map={DELIVERY} value={x.status} /> },
              { key: 'system', label: 'Department', sort: true },
              { key: 'purpose', label: 'Purpose', sort: true },
              { key: 'attempts', label: 'Attempts', align: 'num', sort: true },
              { key: 'updated_at', label: 'Last tried', sort: true, render: (x) => <span className="dxk-muted">{fmtTime(x.updated_at)}</span> },
              { key: 'go', label: '', render: (x) => <button type="button" className="btn-secondary small" onClick={() => redeliver(x.id)}>{tr('Send again')}</button> },
            ]} />
        </Card>
      )}
      <div className="dxk-grid-2" style={{ marginBottom: '1rem' }}>
        <Card title={tr('Waiting for a person, by department')} flush actions={<button type="button" className="dxk-link" onClick={() => nav('/dx/approvals')}>{tr('Open the approvals inbox')}</button>}>
          {d.open_approvals.length ? (
            <table className="mdm-table dxk-table"><thead><tr><th>{tr('Department')}</th><th className="num">{tr('Open')}</th><th className="num">{tr('Oldest')}</th></tr></thead>
              <tbody>{d.open_approvals.map((r) => <tr key={r.system}><td>{r.system}</td><td className="num">{r.n}</td><td className="num dxk-muted">{r.oldest_hours} h</td></tr>)}</tbody></table>
          ) : <EmptyState icon="✅" title={tr('Nothing is waiting')} />}
        </Card>
        <Card title={tr('Requests answered and refused')} flush actions={<button type="button" className="dxk-link" onClick={() => nav('/dx/ledger')}>{tr('Open the clearing house')}</button>}>
          <table className="mdm-table dxk-table"><tbody>
            {Object.entries(d.exchanges).map(([k, n]) => <tr key={k}><td><Tag map={OUTCOME} value={k} /></td><td className="num">{n.toLocaleString('en-IN')}</td></tr>)}
          </tbody></table>
          {d.timing?.avg_ms != null && <p className="dxk-muted" style={{ padding: '0.5rem 1rem' }}>{tr('Average answer time {avg_ms} ms · slowest {max_ms} ms', { avg_ms: d.timing.avg_ms, max_ms: d.timing.max_ms })}</p>}
        </Card>
      </div>
      <Card title={tr('Load test evidence')} flush>
        {d.loadtests.length ? (
          <DataTable rows={d.loadtests} pageSize={10} pageSizes={[10]} initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'ts', label: 'When', sort: true, render: (r) => fmtTime(r.ts) },
              { key: 'requests', label: 'Requests', align: 'num', sort: true },
              { key: 'errors', label: 'Failed', align: 'num', sort: true },
              { key: 'p50_ms', label: 'Median', align: 'num', sort: true, render: (r) => `${r.p50_ms} ms` },
              { key: 'p95_ms', label: '95th percentile', align: 'num', sort: true, render: (r) => `${r.p95_ms} ms` },
              { key: 'rps', label: 'Per second', align: 'num', sort: true },
            ]} />
        ) : <EmptyState icon="📈" title={tr('No run recorded yet')} hint={tr('Run tools/loadtest.py on the laptop and the result appears here.')} />}
      </Card>
      <p className="mdm-sub">{tr('Also open: {open_review_tasks} identity matches waiting for a steward · {dq_high} serious data-quality issues.', { open_review_tasks: d.open_review_tasks, dq_high: d.dq_high })}</p>
    </div>
  )
}

export default function DxControl() {
  const [sp, setSp] = useSearchParams()
  const role = localStorage.getItem('officer_role') ?? 'UNKNOWN'
  const deptOnly = isDeptOfficerRole(role)
  const tab = (!deptOnly && sp.get('tab') === 'overview') ? 'overview' : 'flow'
  return (
    <div>
      <div style={{ padding: '0.75rem 1rem 0' }}>
        <Segmented
          label={tr('Control Tower')}
          value={tab}
          onChange={(v) => setSp(v === 'overview' && !deptOnly ? { tab: 'overview' } : {})}
          options={[
            { value: 'flow', label: tr('Flow board') },
            ...(!deptOnly ? [{ value: 'overview', label: tr('Overview') }] : []),
          ]}
        />
      </div>
      {tab === 'flow' ? <DxFlowBoard /> : <Overview />}
    </div>
  )
}
