import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMdm, Status } from '../mdm/shared'
import { PageHeader, Card, Stats, DataTable, FilterSelect, Drawer, Banner, Facts, EmptyState, useServerTable } from './dxKit'
import BulkAnswer from './BulkAnswer'
import { NoticeBadge, SimulateAnswer, answerText, dueText, canAnswer, EVENT_LABEL } from './NoticeKit'
import { tr } from '../../i18n/lang'
import { Mt } from '../../i18n/mt'

const KIND_TEXT = { EVENT: 'A notice to act on', REVOCATION: 'Consent withdrawn: stop using the data' }

export default function DxNotices() {
  const nav = useNavigate()
  const [system, setSystem] = useState('')
  const [state, setState] = useState('')
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)
  const [bulk, setBulk] = useState(false)
  const T = useServerTable({ key: 'due', dir: 'asc' }, 15)
  const { offset, setOffset, limit } = T
  const { data, error, loading } = useMdm('/x/notices', { system, state, q: q.trim(), limit, offset, ...T.sortParams }, [system, state, q, offset, tick, T.key])
  const { data: ch } = useMdm('/x/channels', undefined, [])
  const c = data?.counts
  const pick = (s) => { setState(state === s ? '' : s); setOffset(0) }
  const reset = () => { setSystem(''); setState(''); setQ(''); setOffset(0) }
  const n = open && data?.items.find((x) => x.id === open)
  return (
    <div className="mdm-hub">
      <PageHeader icon="📨" title={tr('Department notices')}
        subtitle={tr('What each department has been told to act on, how long it has, and what it answered. A department answers in its own system through its feed, or in the portal. A rejection always goes back to a person with the department\'s reason. Response times are set on the Response Times page.')} />
      <div className="dxk-actions" style={{ marginBottom: '0.75rem' }}>
        <button type="button" className="btn-secondary" onClick={() => setBulk(true)}>{tr('Answer in bulk (simulated)')}</button>
      </div>
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
      <Stats items={[
        { label: 'Waiting for a department', value: (c?.waiting ?? 0).toLocaleString('en-IN'), tone: 'warn', onClick: () => pick('WAITING'), active: state === 'WAITING', hint: 'within the time allowed' },
        { label: 'Overdue', value: (c?.overdue ?? 0).toLocaleString('en-IN'), tone: 'bad', onClick: () => pick('OVERDUE'), active: state === 'OVERDUE', hint: 'past the time allowed' },
        { label: 'Answered', value: (c?.answered ?? 0).toLocaleString('en-IN'), tone: 'ok', onClick: () => pick('ACCEPTED'), active: state === 'ACCEPTED', hint: 'accepted, applied or acknowledged' },
        { label: 'Sent back', value: (c?.rejected ?? 0).toLocaleString('en-IN'), onClick: () => pick('REJECTED'), active: state === 'REJECTED', hint: 'rejected by the department' },
      ]} />
      <Status loading={loading && !data} error={error} />
      {data && data.total === 0 && !system && !state && !q && <Card><EmptyState icon="📨" title={tr('No notices yet')} hint={tr('A notice appears when a department is sent data with consent, or when an action for it is approved.')} /></Card>}
      {data && !(data.total === 0 && !system && !state && !q) && (
        <DataTable rows={data.items} server={T.server(data.total)} csv={{ name: 'department-notices' }}
          searchValue={q} onSearch={(v) => { setQ(v); setOffset(0) }} searchDelay={300} search={{ placeholder: 'Search citizen, use or their reference' }}
          canClear={!!(system || state || q)} onClear={reset}
          filters={<>
            <FilterSelect label={tr('Department')} value={system} onChange={(v) => { setSystem(v); setOffset(0) }} options={(ch?.channels || []).map((d) => [d.system, d.name])} />
            <FilterSelect label={tr('Status')} value={state} onChange={(v) => { setState(v); setOffset(0) }}
              options={[['WAITING', 'Waiting'], ['OVERDUE', 'Overdue'], ['ACCEPTED', 'Accepted'], ['APPLIED', 'Applied'], ['ACKNOWLEDGED', 'Acknowledged'], ['REJECTED', 'Rejected, sent back']]} />
          </>}
          empty={tr('No notices match')}
          columns={[
            { key: 'citizen', sortKey: 'citizen', label: 'Citizen', render: (r) => r.person_id
              ? <button type="button" className="dxk-namebtn" onClick={() => nav(`/mdm?tab=people&person=${r.person_id}`)}>{r.person_name}</button>
              : <span className="dxk-muted">{r.person_name || tr('Not matched')}</span>, csv: (r) => r.person_name || '' },
            { key: 'department', sortKey: 'department', label: 'Department', render: (r) => r.system_name, csv: (r) => r.system_name },
            { key: 'use', sortKey: 'use', label: 'For', render: (r) => <>{r.use_name}{r.kind === 'REVOCATION' && <div className="mdm-sub">{tr('Consent withdrawn')}</div>}{r.revision > 1 && <div className="mdm-sub">{tr('Sent again (notice {revision}); the earlier answer is kept', { revision: r.revision })}</div>}{r.statutory && r.kind !== 'REVOCATION' && <div className="mdm-sub">{tr('Statutory')}</div>}</>, csv: (r) => r.use_name },
            { key: 'event', sortKey: 'event', label: 'Event', render: (r) => <span className="dxk-muted">{EVENT_LABEL[r.event_type] || r.event_type}</span>, csv: (r) => r.event_type },
            { key: 'due', sortKey: 'due', label: 'Answer due', render: (r) => <span className={r.state === 'OVERDUE' ? 'dxk-bad' : 'dxk-muted'}>{dueText(r)}</span>, csv: (r) => r.respond_by },
            { key: 'state', sortKey: 'state', label: 'Status', render: (r) => <NoticeBadge state={r.state} />, csv: (r) => r.state },
            { key: 'go', label: '', sort: false, render: (r) => <button type="button" className="btn-secondary small" onClick={() => setOpen(r.id)}>{tr('Open')}</button> },
          ]} />
      )}
      <Drawer open={bulk} wide onClose={() => setBulk(false)} title={tr('Answer in bulk')} subtitle={tr('Everything waiting for a department, or a filled-in file')}>
        {bulk && <BulkAnswer systems={(ch?.channels || []).map((d) => [d.system, d.name])} system={system} onDone={() => setTick((x) => x + 1)} />}
      </Drawer>
      <Drawer open={!!n} onClose={() => setOpen(null)} title={n ? n.use_name : ''} subtitle={n ? `${n.system_name} · ${KIND_TEXT[n.kind] || n.kind}` : ''}>
        {n && (
          <div>
            <Facts items={[
              ['Citizen', n.person_name || tr('Not matched')],
              ['Status', <NoticeBadge key="s" state={n.state} />],
              ['Answer due', dueText(n)],
              ['Answer', answerText(n)],
              n.reason && ['Their reason', <Mt key="mt" text={n.reason} />],
              ['Kind of notice', n.statutory ? tr('Statutory: acknowledged, not rejected') : tr('Can be accepted, applied or rejected')],
            ].filter(Boolean)} />
            <div className="dxk-actions" style={{ margin: '0.75rem 0' }}>
              {n.event_id && <button type="button" className="btn-secondary" onClick={() => nav(`/dx/events?case=${n.event_id}`)}>{tr('Open the event case')}</button>}
              {n.reopened_proposal && <button type="button" className="btn-secondary" onClick={() => nav('/dx/approvals')}>{tr('See the proposal sent back')}</button>}
            </div>
            {canAnswer(n)
              ? <SimulateAnswer key={n.id} notice={n} done={(r) => { setOpen(null); setTick((x) => x + 1); setMsg({ ok: true, text: tr('Recorded (simulated): {outcome}', { outcome: r.outcome.toLowerCase() }) + (r.reopened_proposal ? tr('. It went back to a person for review.') : '.') }) }} />
              : <Banner tone="ok">{tr('This notice has been answered. The answer, the route and the department\'s reference are in the audit log.')}</Banner>}
          </div>
        )}
      </Drawer>
    </div>
  )
}
