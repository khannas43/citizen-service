import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, Stats, DataTable, Drawer, FilterSelect, Banner } from './dxKit'

const DEPTS = ['pds', 'health', 'welfare', 'citizen', 'education', 'housing', 'pension', 'revenue', 'electricity']

function Issue({ purposes, done }) {
  const [system, setSystem] = useState('education')
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState([])
  const [days, setDays] = useState('180')
  const [err, setErr] = useState(null)
  const mine = purposes.filter((p) => p.system === system)
  const send = async () => {
    setErr(null)
    try { done(await mdm('/x/keys', { method: 'POST', body: { system, label, scopes, days: Number(days) } })) } catch (e) { setErr(e.message) }
  }
  return (
    <div className="dxk-stackform">
      <div className="dxk-form">
        <label className="dxk-field"><span>Department</span><select value={system} onChange={(e) => { setSystem(e.target.value); setScopes([]) }}>{DEPTS.map((d) => <option key={d} value={d}>{purposes.find((p) => p.system === d)?.system_name || d}</option>)}</select></label>
        <label className="dxk-field"><span>Label</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Scholarship portal, production" /></label>
        <label className="dxk-field"><span>Lasts (days)</span><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <div className="dxk-checks" role="group" aria-label="Uses this key may ask under">
        <span className="mdm-sub">May ask under:</span>
        {mine.length ? mine.map((p) => <label className="mdm-check" key={p.code}><input type="checkbox" checked={scopes.includes(p.code)} onChange={() => setScopes((c) => (c.includes(p.code) ? c.filter((x) => x !== p.code) : [...c, p.code]))} /> {p.name}</label>) : <span className="mdm-note">This department has no registered use.</span>}
      </div>
      <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!scopes.length} onClick={send}>Issue the key</button></div>
      {err && <Banner tone="bad">{err}</Banner>}
    </div>
  )
}

export default function DxKeys() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/keys', undefined, [tick])
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const [shown, setShown] = useState(null)
  const [msg, setMsg] = useState(null)
  const [reason, setReason] = useState({})
  const [issuing, setIssuing] = useState(false)
  const [state, setState] = useState('')
  const [dept, setDept] = useState('')
  const act = async (id, what) => {
    setMsg(null)
    try {
      const r = await mdm(`/x/keys/${id}/${what}`, { method: 'POST', body: what === 'revoke' ? { reason: reason[id] || '' } : {} })
      if (r.key) setShown(r)
      setTick((n) => n + 1)
    } catch (e) { setMsg(e.message) }
  }
  const st = (k) => (k.status === 'REVOKED' ? 'REVOKED' : k.expired ? 'EXPIRED' : 'ACTIVE')
  const keys = data || []
  const rows = keys.filter((k) => (!state || st(k) === state) && (!dept || k.system_name === dept))
  const depts = [...new Set(keys.map((k) => k.system_name))].sort()
  return (
    <div className="mdm-hub">
      <PageHeader icon="🔑" title="Security and keys"
        subtitle="A department's own system calls the exchange with a key. Each key belongs to one department and may ask only under the uses listed. The secret is shown once; only a fingerprint is kept."
        actions={<button type="button" className="btn-primary" onClick={() => setIssuing(true)}>Issue a key</button>} />
      {shown && (
        <Banner tone="warn">
          <strong>Copy this key now.</strong> It will not be shown again.
          <div className="dx-mono" style={{ margin: '0.4rem 0', wordBreak: 'break-all' }}>{shown.key}</div>
          <button type="button" className="mdm-link" onClick={() => setShown(null)}>I have copied it</button>
        </Banner>
      )}
      <Status loading={loading && !data} error={error} />
      {msg && <Banner tone="bad">{msg}</Banner>}
      {data && <Stats items={[
        { label: 'Keys', value: keys.length },
        ...[['ACTIVE', 'Active', 'ok'], ['EXPIRED', 'Expired', 'warn'], ['REVOKED', 'Revoked', 'bad']].map(([v, l, t]) => ({ label: l, value: keys.filter((k) => st(k) === v).length, tone: t, active: state === v, onClick: () => setState(state === v ? '' : v) })),
      ]} />}
      {data && (
        <DataTable rows={rows} rowKey="key_id" search={{ placeholder: 'Search keys', text: (k) => `${k.key_id} ${k.label} ${k.system_name} ${k.scopes.join(' ')}` }} csv={{ name: 'keys' }}
          canClear={!!(state || dept)} onClear={() => { setState(''); setDept('') }}
          filters={<FilterSelect label="Department" value={dept} onChange={setDept} options={depts.map((d) => [d, d])} />}
          empty="No keys match" emptyHint={keys.length ? undefined : 'No keys issued yet.'}
          columns={[
            { key: 'key_id', label: 'Key', render: (k) => <><span className="dx-mono">{k.key_id}</span><div className="mdm-sub">{k.label}</div></> },
            { key: 'system_name', label: 'Department' },
            { key: 'scopes', label: 'May ask under', sort: false, render: (k) => <span className="dxk-muted">{k.scopes.map((s) => s.replace(/_/g, ' ').toLowerCase()).join(', ')}</span> },
            { key: 'status', label: 'State', render: (k) => <>{k.status === 'REVOKED' ? <Badge tone="bad">Revoked</Badge> : k.expired ? <Badge tone="warn">Expired</Badge> : <Badge tone="ok">Active</Badge>}<div className="mdm-sub">expires {fmtTime(k.expires_at)}</div></> },
            { key: 'last_used_at', label: 'Last used', render: (k) => <span className="dxk-muted">{k.last_used_at ? fmtTime(k.last_used_at) : 'never'} · {k.use_count} uses</span> },
            { key: 'act', label: '', sort: false, render: (k) => k.status === 'ACTIVE' && (
              <div className="dx-decide">
                <button type="button" className="btn-secondary small" onClick={() => act(k.key_id, 'rotate')}>Rotate</button>
                <input aria-label={`Reason to revoke ${k.key_id}`} placeholder="Reason to revoke" value={reason[k.key_id] || ''} onChange={(e) => setReason({ ...reason, [k.key_id]: e.target.value })} />
                <button type="button" className="btn-secondary small" disabled={(reason[k.key_id] || '').trim().length < 10} onClick={() => act(k.key_id, 'revoke')}>Revoke</button>
              </div>) },
          ]} />
      )}
      <Card title="How data is protected">
        <ul className="mdm-plain">
          <li>Questions are answered with an outcome, never with the underlying document or amount.</li>
          <li>No identity number is held. People are linked by an opaque reference token.</li>
          <li>Keys are stored as a one-way fingerprint and can be rotated or revoked at once.</li>
          <li>Every use of a key is written to the clearing house under the key's name.</li>
          <li>This demonstration runs on one laptop with synthetic data. Production hosting and encryption at rest are described in the written evidence, not shown here.</li>
        </ul>
      </Card>
      <Drawer open={issuing} onClose={() => setIssuing(false)} title="Issue a key to a department">
        {purposes && <Issue purposes={purposes} done={(r) => { setShown(r); setIssuing(false); setTick((n) => n + 1) }} />}
      </Drawer>
    </div>
  )
}
