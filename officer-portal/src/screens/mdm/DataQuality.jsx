import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { dqLabel } from './labels'
import { DataTable, FilterSelect, Drawer, Banner, Card } from '../dx/dxKit'

export default function DataQuality({ initial = {}, openPerson }) {
  const [code, setCode] = useState(initial.code || '')
  const [severity, setSeverity] = useState('')
  const [source, setSource] = useState(initial.source || '')
  const [status, setStatus] = useState('OPEN')
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [asking, setAsking] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const limit = 25
  const { data: sum } = useMdm('/dq/summary', undefined, [tick])
  const { data, error, loading } = useMdm('/dq/issues', { code, severity, source, status, limit, offset }, [code, severity, source, status, offset, tick])

  const send = async () => {
    setErr(null)
    try {
      await mdm(`/dq/issues/${asking.id}/correction`, { method: 'POST', body: { note: note.trim() || 'Please verify and correct this record.' } })
      setAsking(null); setNote(''); setTick((n) => n + 1)
    } catch (e) { setErr(e.message) }
  }
  const sevTone = (s) => (s === 'HIGH' ? 'bad' : s === 'MEDIUM' ? 'warn' : 'neutral')
  const sevName = (s) => (s === 'HIGH' ? 'High' : s === 'MEDIUM' ? 'Medium' : 'Low')
  const f = (setter) => (v) => { setter(v); setOffset(0) }
  const codes = [...new Set((sum?.by_code || []).map((c) => c.code))]
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">Problems found by comparing departments with each other. You cannot edit a department record here; you ask the owning department to correct it, and the request is logged.</p>
      {sum && (
        <Card title="Summary by issue" flush>
          <DataTable rows={sum.by_code} rowKey={(c) => c.code + c.severity} dense pageSize={10} pageSizes={[10, 25]}
            search={{ placeholder: 'Search issue types', text: (c) => dqLabel(c.code) }}
            columns={[
              { key: 'code', label: 'Issue', render: (c) => dqLabel(c.code) },
              { key: 'severity', label: 'Severity', render: (c) => <Badge tone={sevTone(c.severity)}>{sevName(c.severity)}</Badge> },
              { key: 'open', label: 'Open', align: 'num' },
              { key: 'requested', label: 'Correction requested', align: 'num' },
              { key: 'go', label: '', sort: false, render: (c) => <button type="button" className="mdm-link" onClick={() => { setCode(c.code); setOffset(0) }}>Show</button> },
            ]} />
        </Card>
      )}
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} server={{ total: data.total, limit, offset, onPage: setOffset }}
          search={{ placeholder: 'Search this page by person or detail', text: (i) => `${i.name} ${i.detail} ${dqLabel(i.code)}` }}
          canClear={!!(code || severity || source || status !== 'OPEN')} onClear={() => { setCode(''); setSeverity(''); setSource(''); setStatus('OPEN'); setOffset(0) }}
          filters={<>
            <FilterSelect label="Issue" value={code} onChange={f(setCode)} options={codes.map((c) => [c, dqLabel(c)])} all="All issues" />
            <FilterSelect label="Severity" value={severity} onChange={f(setSeverity)} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <FilterSelect label="Status" value={status} onChange={f(setStatus)} all={null} options={[['OPEN', 'Open'], ['CORRECTION_REQUESTED', 'Correction requested']]} />
            <FilterSelect label="System" value={source} onChange={f(setSource)} options={(sum?.by_source || []).map((s) => [s.source, s.name])} />
          </>}
          empty="No issues match."
          columns={[
            { key: 'code', label: 'Issue', render: (i) => <><Badge tone={sevTone(i.severity)}>{sevName(i.severity)}</Badge> {dqLabel(i.code)}</> },
            { key: 'name', label: 'Person', render: (i) => <button type="button" className="mdm-link" onClick={() => openPerson(i.person_id)}>{i.name}</button> },
            { key: 'detail', label: 'Detail', sort: false, render: (i) => <span className="mdm-sub">{i.detail}{i.correction_note && <div>Request: {i.correction_note} ({i.requested_by})</div>}</span> },
            { key: 'source_name', label: 'System', render: (i) => i.source_name || '—' },
            { key: 'go', label: '', sort: false, render: (i) => i.status === 'OPEN' && <button type="button" className="btn-secondary small" onClick={() => { setAsking(i); setNote('') }}>Ask department to correct</button> },
          ]} />
      )}
      <Drawer open={!!asking} onClose={() => setAsking(null)} title={asking ? `Ask ${asking.source_name || 'the department'} to correct this` : ''} subtitle={asking ? `${dqLabel(asking.code)}: ${asking.name}` : ''}>
        {asking && (
          <div className="dxk-stackform" role="dialog" aria-label="Request a correction">
            <p className="mdm-sub">{asking.detail}</p>
            <label className="dxk-field"><span>What should they check?</span><textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
            {err && <Banner tone="bad">{err}</Banner>}
            <div className="dxk-actions"><button type="button" className="btn-primary" onClick={send}>Send request</button><button type="button" className="btn-secondary" onClick={() => setAsking(null)}>Cancel</button></div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
