import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Drawer, Banner } from './dxKit'

export default function DxAccess() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/access', undefined, [tick])
  const [who, setWho] = useState('')
  const [why, setWhy] = useState('')
  const [stopping, setStopping] = useState(false)
  const [lift, setLift] = useState({})
  const [msg, setMsg] = useState(null)
  const [onlyRefused, setOnlyRefused] = useState(false)
  const post = async (path, body) => {
    setMsg(null)
    try { await mdm(path, { method: 'POST', body }); setTick((n) => n + 1); return true } catch (e) { setMsg(e.message); return false }
  }
  if (!data) return <div className="mdm-hub"><PageHeader icon="🛡️" title="Access and misuse controls" /><Status loading={loading} error={error} /></div>
  const open = data.blocks.filter((b) => !b.lifted_at).length
  const acts = onlyRefused ? data.activity.filter((a) => a.refused > 0 || a.blocked) : data.activity
  return (
    <div className="mdm-hub">
      <PageHeader icon="🛡️" title="Access and misuse controls"
        subtitle={`Who can do what, who has been looking at whom, and how a user's access is stopped and restored. More than ${data.limit_per_hour} lookups of one person by one user in an hour is refused and flagged automatically; the limit is a policy value.`}
        actions={<button type="button" className="btn-primary" onClick={() => setStopping(true)}>Stop a user's access</button>} />
      <Stats items={[
        { label: 'Active users, 24h', value: data.activity.length },
        { label: 'With refusals', value: data.activity.filter((a) => a.refused > 0).length, tone: 'warn', active: onlyRefused, onClick: () => setOnlyRefused(!onlyRefused) },
        { label: 'Stopped now', value: open, tone: open ? 'bad' : 'neutral' },
        { label: 'Misuse flags', value: data.alerts.length, tone: data.alerts.length ? 'warn' : 'neutral' },
      ]} />
      {msg && <Banner tone="bad">{msg}</Banner>}
      <Card title="Access levels" flush>
        <DataTable rows={data.roles} rowKey="role" dense pageSize={10} pageSizes={[10]}
          columns={[
            { key: 'role', label: 'Level', render: (r) => <span className="dxk-main">{r.role}</span> },
            { key: 'who', label: 'Roles', sort: false, render: (r) => <span className="dxk-muted">{r.who.join(', ')}</span> },
            { key: 'can', label: 'Can' },
          ]} />
      </Card>
      <Card title="Lookup activity, last 24 hours" flush>
        <DataTable rows={acts} rowKey="actor" search={{ placeholder: 'Search users or keys', text: (a) => a.actor }} pageSize={10} pageSizes={[10, 25]}
          empty="No lookups in the last day." canClear={onlyRefused} onClear={() => setOnlyRefused(false)}
          columns={[
            { key: 'actor', label: 'User or key', render: (a) => <>{a.actor}{a.blocked && <> <Badge tone="bad">blocked</Badge></>}</> },
            { key: 'lookups', label: 'Lookups', align: 'num' },
            { key: 'people', label: 'Different people', align: 'num' },
            { key: 'refused', label: 'Refused', align: 'num' },
            { key: 'go', label: '', sort: false, render: (a) => !a.blocked && <button type="button" className="btn-secondary small" onClick={() => { setWho(a.actor); setWhy(''); setStopping(true) }}>Stop access…</button> },
          ]} />
      </Card>
      <Card title="Stopped and restored" flush>
        <DataTable rows={data.blocks} dense pageSize={10} pageSizes={[10]} search={{ placeholder: 'Search stopped users', text: (b) => `${b.actor} ${b.reason}` }} empty="Nobody has been stopped."
          columns={[
            { key: 'actor', label: 'User' },
            { key: 'reason', label: 'Why' },
            { key: 'blocked_at', label: 'By / when', render: (b) => <span className="mdm-sub">{b.blocked_by}<br />{fmtTime(b.blocked_at)}</span> },
            { key: 'lifted_at', label: 'State', sort: false, render: (b) => b.lifted_at ? <span className="mdm-sub">Restored by {b.lifted_by} · {b.lift_note}</span> : (
              <div className="dx-decide"><input aria-label={`Reason to restore ${b.actor}`} placeholder="Reason to restore" value={lift[b.id] || ''} onChange={(e) => setLift({ ...lift, [b.id]: e.target.value })} />
                <button type="button" className="btn-secondary small" disabled={(lift[b.id] || '').trim().length < 10} onClick={() => post(`/x/access/${b.id}/lift`, { reason: lift[b.id] })}>Restore</button></div>) },
          ]} />
      </Card>
      <Card title="Possible misuse flagged">
        {data.alerts.length ? <ul className="mdm-plain">{data.alerts.map((a) => <li key={a.seq}>{fmtTime(a.ts)} · {a.actor} · {a.subject} · {a.detail?.reason?.replace(/_/g, ' ').toLowerCase()}</li>)}</ul> : <p className="mdm-note">Nothing flagged.</p>}
      </Card>
      <Drawer open={stopping} onClose={() => setStopping(false)} title="Stop a user's access" subtitle="Recorded against your name. A reason of at least 10 characters is needed.">
        <div className="dxk-stackform">
          <label className="dxk-field"><span>User or key (e.g. partner:k1a2b3c4)</span><input value={who} onChange={(e) => setWho(e.target.value)} /></label>
          <label className="dxk-field"><span>Reason (recorded)</span><input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!who.trim() || why.trim().length < 10} onClick={async () => { if (await post('/x/access/block', { actor: who.trim(), reason: why })) { setWho(''); setWhy(''); setStopping(false) } }}>Stop access</button></div>
        </div>
      </Drawer>
    </div>
  )
}
