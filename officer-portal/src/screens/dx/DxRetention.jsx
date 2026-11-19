import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { PersonPicker } from './dxShared'
import { PageHeader, Card, DataTable, Banner, Facts } from './dxKit'
import { tr } from '../../i18n/lang'

export default function DxRetention() {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/retention', undefined, [tick])
  const { data: purposes } = useMdm('/x/purposes', undefined, [])
  const [msg, setMsg] = useState(null)
  const [thin, setThin] = useState(false)
  const [person, setPerson] = useState(null)
  const [purpose, setPurpose] = useState('SCHOLARSHIP_ELIGIBILITY')
  const [rep, setRep] = useState(null)
  const post = async (path, body) => {
    setMsg(null)
    try { const r = await mdm(path, { method: 'POST', body }); setTick((n) => n + 1); return r } catch (e) { setMsg({ ok: false, text: e.message }); return null }
  }
  const purge = async (what) => {
    const r = await post('/x/retention/purge', { what, thin_events: thin })
    if (r) setMsg({ ok: true, text: tr('Before: {a} temporary results. After: {b}. Removed {c}{thin}. Recorded in the audit log as entry {seq}.', { a: r.before.temp_results, b: r.after.temp_results, c: r.removed.temp_results, thin: thin ? tr(', thinned {n} old event payloads', { n: r.removed.event_payloads_thinned }) : '', seq: r.audit_seq }) })
  }
  const withdraw = async () => {
    const r = await post('/x/retention/withdraw', { person_id: person.id, purpose })
    if (r) setRep(r)
  }
  return (
    <div className="mdm-hub">
      <PageHeader icon="🗑️" title={tr('Retention and purge')} subtitle={tr('What is kept, for how long, and what a withdrawal removes. Removal is recorded; the record of removal is never removed.')} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.classes} rowKey="data" search={{ placeholder: 'Search data classes', text: (c) => `${c.data} ${c.kept} ${c.purge}` }} csv={{ name: 'retention' }}
          columns={[
            { key: 'data', label: 'Data', render: (c) => <span className="dxk-main">{c.data}</span> },
            { key: 'kept', label: 'Kept' },
            { key: 'count', label: 'Held now', align: 'num', render: (c) => c.count.toLocaleString('en-IN') },
            { key: 'purge', label: 'Removal', render: (c) => <span className="dxk-muted">{c.purge}</span> },
          ]} />
      )}
      {msg && <Banner tone={msg.ok ? 'ok' : 'bad'}>{msg.text}</Banner>}
      <div className="dxk-split">
        <Card title={tr('Clear temporary results')}>
          <div className="dxk-actions">
            <button type="button" className="btn-secondary" onClick={() => purge('expired_results')}>{tr('Remove expired results')}</button>
            <button type="button" className="btn-secondary" onClick={() => purge('all_results')}>{tr('Remove all temporary results')}</button>
          </div>
          <label className="mdm-check" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}><input type="checkbox" checked={thin} onChange={(e) => setThin(e.target.checked)} /> {tr('Also thin event payloads older than the retention period (cannot be undone)')}</label>
        </Card>
        <Card title={tr('Withdraw consent and purge')}>
          <div className="dxk-stackform">
            <PersonPicker onPick={setPerson} label={tr('Who is withdrawing')} />
            {person && <Banner>{tr('Person:')} <strong>{person.name}</strong></Banner>}
            <label className="dxk-field"><span>{tr('For which use')}</span>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{(purposes || []).filter((p) => p.consent_required).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
            <div className="dxk-actions"><button type="button" className="btn-primary" disabled={!person} onClick={withdraw}>{tr('Withdraw and purge')}</button></div>
            {rep && <Facts items={[
              ['Consent', rep.consent_withdrawn ? tr('Withdrawn') : tr('There was no active consent')],
              ['Departments told', rep.departments_told.join(', ') || tr('None had received data')],
              ['Temporary rows removed', rep.temp_rows_removed], ['Stops', rep.stops], ['Remains', rep.remains], ['Audit entry', rep.audit_seq],
            ]} />}
          </div>
        </Card>
      </div>
    </div>
  )
}
