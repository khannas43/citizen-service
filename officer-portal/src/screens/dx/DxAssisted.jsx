import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { TokenPicker } from './citizenShared'
import { PageHeader, Card, DataTable, Banner } from './dxKit'
import { tr } from '../../i18n/lang'

export default function DxAssisted() {
  const nav = useNavigate()
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/sessions', undefined, [tick])
  const [operator, setOperator] = useState('')
  const [reason, setReason] = useState('')
  const [token, setToken] = useState('')
  const [active, setActive] = useState(null)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const start = async () => {
    setErr(null); setDone(null)
    try { setActive(await mdm('/x/sessions', { method: 'POST', body: { operator, token, visit_reason: reason || null } })); setTick((n) => n + 1) } catch (e) { setErr(e.message) }
  }
  const end = async () => {
    try { setDone(await mdm(`/x/sessions/${active.id}/end`, { method: 'POST', body: {} })); setActive(null); setToken(''); setTick((n) => n + 1) } catch (e) { setErr(e.message) }
  }
  const open = (p) => nav(`${p}?token=${encodeURIComponent(token)}&operator=${encodeURIComponent(operator)}`)
  const endIt = async (id) => { await mdm(`/x/sessions/${id}/end`, { method: 'POST', body: {} }); setTick((n) => n + 1) }
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧑‍🤝‍🧑" title={tr('Assisted channel')}
        subtitle={tr('For citizens who come to a service centre. An operator helps them see their data, answer consent and report a wrong value. The operator\'s name is required and is recorded with every action, so it is clear that the citizen was helped.')} />
      {!active ? (
        <>
          <Card title={tr('Start a visit')}>
            <div className="dxk-stackform">
              <div className="dxk-form">
                <label className="dxk-field"><span>{tr('Operator name')}</span><input value={operator} onChange={(e) => setOperator(e.target.value)} /></label>
                <label className="dxk-field"><span>{tr('Reason for the visit (optional)')}</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              </div>
              {token ? <Banner>{tr('Citizen reference:')} <code>{token}</code> <button type="button" className="mdm-link" onClick={() => setToken('')}>{tr('change')}</button></Banner> : <TokenPicker onToken={setToken} />}
              <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!operator.trim() || !token} onClick={start}>{tr('Start the visit')}</button></div>
              {err && <Banner tone="bad">{err}</Banner>}
            </div>
          </Card>
          {done && <Banner tone="ok">{tr('Visit {id} ended. Consent actions:', { id: done.id })} {Object.entries(done.summary.consent_actions).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(', ') || 'none'} {tr('· reports raised: {reports_raised}.', { reports_raised: done.summary.reports_raised })}</Banner>}
        </>
      ) : (
        <Card title={tr('Visit in progress with {operator}', { operator: active.operator })} tone="ok">
          <div aria-label={tr('Visit in progress')} className="dxk-actions">
            <button type="button" className="btn-secondary" onClick={() => open('/dx/citizen')}>{tr('Show their data')}</button>
            <button type="button" className="btn-secondary" onClick={() => open('/dx/citizen/consents')}>{tr('Consents')}</button>
            <button type="button" className="btn-secondary" onClick={() => open('/dx/citizen/report')}>{tr('Report a wrong value')}</button>
            <button type="button" className="btn-primary" onClick={end}>{tr('End the visit')}</button>
          </div>
          {err && <Banner tone="bad">{err}</Banner>}
        </Card>
      )}
      <Status loading={loading && !data} error={error} />
      {data && (
        <Card title={tr('Recent visits')} flush>
          <DataTable rows={data} pageSize={10} pageSizes={[10, 25]} empty={tr('No visits yet.')} csv={{ name: 'visits' }}
            search={{ placeholder: 'Search visits', text: (s) => `${s.operator} ${s.person_name} ${s.visit_reason || ''}` }}
            columns={[
              { key: 'operator', label: 'Operator' },
              { key: 'person_name', label: 'Citizen', render: (s) => <>{s.person_name}<div className="mdm-sub">{s.visit_reason}</div></> },
              { key: 'started_at', label: 'Started', render: (s) => <span className="dxk-muted">{fmtTime(s.started_at)}</span> },
              { key: 'ended_at', label: 'Outcome', render: (s) => s.ended_at ? <span className="dxk-muted">{Object.values(s.summary.consent_actions || {}).reduce((x, y) => x + y, 0)} {tr('consent actions · {reports_raised} reports', { reports_raised: s.summary.reports_raised })}</span>
                : <>{tr('open')} <button type="button" className="mdm-link" onClick={() => endIt(s.id)}>{tr('End it')}</button></> },
            ]} />
        </Card>
      )}
    </div>
  )
}
