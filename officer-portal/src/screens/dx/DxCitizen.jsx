import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { Badge } from '../mdm/shared'
import { Card, Tabs as KitTabs, DataTable, Banner, Facts, EmptyState } from './dxKit'
import { Tag, CONSENT, OUTCOME, DISC, fmtTime } from './dxShared'
import { useCitizenParams, useCitizen, Frame, Status } from './citizenShared'

const nice = (s) => String(s).replace(/_/g, ' ')
const NAV = [['My data', '/dx/citizen'], ['My consents', '/dx/citizen/consents'], ['Report a wrong value', '/dx/citizen/report']]

function Tabs({ here, token, operator }) {
  const nav = useNavigate()
  const q = `?token=${encodeURIComponent(token)}${operator ? `&operator=${encodeURIComponent(operator)}` : ''}`
  return <KitTabs label="Citizen views" value={here} onChange={(p) => nav(p + q)} tabs={NAV.map(([label, id]) => ({ id, label }))} />
}

export default function DxMyData() {
  const { token, operator, set } = useCitizenParams()
  const { data, error, loading } = useCitizen(token)
  return (
    <Frame title="My data" intro="Everything held about the citizen, and which department each part came from." token={token} operator={operator} onToken={set}>
      <Tabs here="/dx/citizen" token={token} operator={operator} />
      <Status loading={loading && !data?.person} error={error} />
      {data?.person && (
        <>
          <Card title={data.person.name} hint={data.note}>
            <Facts items={[['Born', data.person.dob || data.person.birth_year || '—'], ['Gender', data.person.gender || '—'], ['District', data.person.district || '—'], ['Address', data.person.address || '—']]} />
          </Card>
          <Card title="What each department holds" flush>
            <DataTable rows={data.held} rowKey={(h) => `${h.source_name}${h.kind}${h.as_of}`} pageSize={10} pageSizes={[10, 25]}
              search={{ placeholder: 'Search what is held', text: (h) => `${h.source_name} ${h.kind} ${JSON.stringify(h.details)}` }} csv={{ name: 'my-data' }}
              columns={[
                { key: 'source_name', label: 'Department' },
                { key: 'kind', label: 'What it holds', render: (h) => nice(h.kind) },
                { key: 'as_of', label: 'As of', render: (h) => <span className="dxk-muted">{h.as_of ? String(h.as_of).slice(0, 10) : '—'}</span> },
                { key: 'details', label: 'Details', sort: false, csv: (h) => JSON.stringify(h.details), render: (h) => <span className="dxk-muted">{Object.entries(h.details).slice(0, 6).map(([k, v]) => `${nice(k)}: ${v}`).join(' · ') || h.address || '—'}</span> },
              ]} />
          </Card>
          <Card title="Who has asked about me" flush>
            <DataTable rows={data.asked} pageSize={10} pageSizes={[10, 25]} dense empty="Nobody has asked."
              search={{ placeholder: 'Search requests', text: (x) => `${x.requester} ${x.question || x.kind}` }}
              columns={[
                { key: 'ts', label: 'When', render: (x) => <span className="dxk-muted">{fmtTime(x.ts)}</span> },
                { key: 'requester', label: 'Who asked' },
                { key: 'question', label: 'About', render: (x) => nice((x.question || x.kind).toLowerCase()) },
                { key: 'outcome', label: 'Outcome', render: (x) => <Tag map={OUTCOME} value={x.outcome} /> },
              ]} />
          </Card>
        </>
      )}
    </Frame>
  )
}

export function DxMyConsents() {
  const { token, operator, mode, set } = useCitizenParams()
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useCitizen(token, [tick])
  const [msg, setMsg] = useState(null)
  const [pick] = useState({})
  const act = async (c, what, body) => {
    setMsg(null)
    try { await mdm(`/x/citizen/${encodeURIComponent(token)}/consents/${c.id}/${what}`, { method: 'POST', body: { ...body, channel: mode.channel, operator: mode.operator } }); setTick((n) => n + 1) } catch (e) { setMsg(e.message) }
  }
  return (
    <Frame title="My consents" intro="Each use of the citizen's data needs their agreement. They can agree to part, refuse, or withdraw at any time. A withdrawal is passed on to departments that had received data." token={token} operator={operator} onToken={set}>
      <Tabs here="/dx/citizen/consents" token={token} operator={operator} />
      <Status loading={loading && !data?.person} error={error} />
      {msg && <Banner tone="bad">{msg}</Banner>}
      {data?.person && (data.consents.length ? (
        <DataTable rows={data.consents} pageSize={10} pageSizes={[10, 25]}
          search={{ placeholder: 'Search consents', text: (c) => `${c.purpose_name} ${c.system_name} ${c.status}` }}
          columns={[
            { key: 'purpose_name', label: 'Use', render: (c) => <span className="dxk-main">{c.purpose_name}</span> },
            { key: 'system_name', label: 'Asked by' },
            { key: 'status', label: 'Status', render: (c) => <Tag map={CONSENT} value={c.status} /> },
            { key: 'act', label: '', sort: false, render: (c) => (
              <div className="dxk-actions">
                {c.status === 'PENDING' && <>
                  <button type="button" className="btn-primary small" onClick={() => act(c, 'respond', { decision: 'GRANT', elements: pick[c.id] ?? null })}>I agree</button>
                  <button type="button" className="btn-secondary small" onClick={() => act(c, 'respond', { decision: 'REFUSE' })}>I do not agree</button>
                </>}
                {c.status === 'GRANTED' && <><span className="dxk-muted">Valid until {fmtTime(c.expires_at)}</span><button type="button" className="btn-secondary small" onClick={() => act(c, 'withdraw', {})}>Withdraw my consent</button></>}
              </div>) },
          ]} />
      ) : <EmptyState title="No department has asked for consent." />)}
    </Frame>
  )
}

const ATTRS = { name: 'Name', date_of_birth: 'Date of birth', gender: 'Gender', address: 'Address', income: 'Income', category: 'Social category', land: 'Land', electricity: 'Electricity connection', pension: 'Pension', housing: 'Housing' }

export function DxReportWrong() {
  const { token, operator, mode, set } = useCitizenParams()
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useCitizen(token, [tick])
  const [f, setF] = useState({ attribute: 'name', current_value: '', reported_value: '', reason: '' })
  const [spouse, setSpouse] = useState('')
  const [msg, setMsg] = useState(null)
  const post = async (path, body) => {
    setMsg(null)
    try { const r = await mdm(`/x/citizen/${encodeURIComponent(token)}/${path}`, { method: 'POST', body: { ...body, channel: mode.channel, operator: mode.operator } }); setMsg({ ok: true, text: r.note }); setTick((n) => n + 1) } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  return (
    <Frame title="Report a wrong value" intro="The citizen says what is wrong. It goes to the department that owns that value, and the citizen can follow it here. Nothing is changed in this system directly." token={token} operator={operator} onToken={set}>
      <Tabs here="/dx/citizen/report" token={token} operator={operator} />
      <Status loading={loading && !data?.person} error={error} />
      {data?.person && (
        <>
          <div className="dxk-split">
            <Card title="What is wrong?">
              <div className="dxk-stackform">
                <label className="dxk-field"><span>Which value</span><select value={f.attribute} onChange={(e) => setF({ ...f, attribute: e.target.value })}>{Object.entries(ATTRS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                <label className="dxk-field"><span>Shown now</span><input value={f.current_value} onChange={(e) => setF({ ...f, current_value: e.target.value })} /></label>
                <label className="dxk-field"><span>It should be</span><input value={f.reported_value} onChange={(e) => setF({ ...f, reported_value: e.target.value })} /></label>
                <label className="dxk-field"><span>Anything we should know (optional)</span><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
                <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!f.reported_value.trim()} onClick={() => post('report', f)}>Send my report</button></div>
              </div>
            </Card>
            <Card title="Married, but not shown as married?" hint="A statement is kept as the citizen's own word and shown as unverified. It does not create a marriage record.">
              <div className="dxk-stackform">
                <label className="dxk-field"><span>Spouse's name</span><input value={spouse} onChange={(e) => setSpouse(e.target.value)} /></label>
                <div className="dxk-actions"><button type="button" className="btn-secondary" disabled={!spouse.trim()} onClick={() => post('declaration', { spouse_name: spouse })}>Record my statement</button></div>
              </div>
            </Card>
          </div>
          {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
          <Card title="My reports" flush>
            <DataTable rows={data.reports} dense pageSize={10} pageSizes={[10]} empty="No reports yet."
              search={{ placeholder: 'Search reports', text: (r) => `${ATTRS[r.attribute] || r.attribute} ${r.current_value} ${r.reported_value} ${r.owner}` }}
              columns={[
                { key: 'status', label: 'Status', render: (r) => <Tag map={DISC} value={r.status} /> },
                { key: 'attribute', label: 'Value', render: (r) => ATTRS[r.attribute] || r.attribute },
                { key: 'reported_value', label: 'Change', sort: false, render: (r) => <>{r.current_value || '—'} → <strong>{r.reported_value}</strong></> },
                { key: 'owner', label: 'With' },
                { key: 'raised_at', label: 'Raised', render: (r) => <span className="dxk-muted">{fmtTime(r.raised_at)}</span> },
              ]} />
          </Card>
        </>
      )}
    </Frame>
  )
}

export { Badge }
