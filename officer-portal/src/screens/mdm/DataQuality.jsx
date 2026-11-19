import { useRef, useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge, Pager } from './shared'
import { dqLabel } from './labels'
import { DataTable, FilterSelect, Drawer, Banner, Card, DateRange, Hero, Stats, useServerTable } from '../dx/dxKit'
import './dq.css'
import { tr } from '../../i18n/lang'

export default function DataQuality({ initial = {}, openPerson }) {
  const [code, setCode] = useState(initial.code || '')
  const [severity, setSeverity] = useState('')
  const [source, setSource] = useState(initial.source || '')
  const [status, setStatus] = useState('OPEN')
  const [district, setDistrict] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const T = useServerTable(null, 200, [25, 50, 100, 200])
  const { offset, setOffset, limit } = T
  const [tick, setTick] = useState(0)
  const [asking, setAsking] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const { data: sum } = useMdm('/dq/summary', undefined, [tick])
  const { data: facets } = useMdm('/persons/facets', undefined, [])
  const { data, error, loading } = useMdm('/dq/issues', { code, severity, source, status, district, date_from: from, date_to: to, limit, offset, ...T.sortParams }, [code, severity, source, status, district, from, to, offset, tick, T.key])

  const send = async () => {
    setErr(null)
    try {
      await mdm(`/dq/issues/${asking.id}/correction`, { method: 'POST', body: { note: note.trim() || 'Please verify and correct this record.' } })
      setAsking(null); setNote(''); setTick((n) => n + 1)
    } catch (e) { setErr(e.message) }
  }
  const sevName = (s) => (s === 'HIGH' ? 'High' : s === 'MEDIUM' ? 'Medium' : 'Low')
  const f = (setter) => (v) => { setter(v); setOffset(0) }
  const rowsRef = useRef(null)
  const pick = (c) => { setCode(c); setOffset(0); setTimeout(() => rowsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150) }
  const by = sum?.by_code || []
  const open = by.reduce((n, c) => n + c.open, 0)
  const requested = by.reduce((n, c) => n + c.requested, 0)
  const high = by.filter((c) => c.severity === 'HIGH').reduce((n, c) => n + c.open, 0)
  const maxOpen = Math.max(1, ...by.map((c) => c.open))
  const codes = [...new Set((sum?.by_code || []).map((c) => c.code))]
  return (
    <div className="mdm-stack dq">
      <Hero eyebrow={tr('Data quality')} title={tr('Problems found by comparing departments')}
        text={tr('Each issue comes from putting the departments\' records side by side. A department record cannot be edited here: you ask the owning department to correct it, and the request is logged.')}
        aside={sum ? <>
          <div className="dxk-hero-fig"><strong>{open.toLocaleString('en-IN')}</strong><span>{tr('open issues')}</span></div>
          <div className="dxk-hero-fig"><strong>{high.toLocaleString('en-IN')}</strong><span>{tr('high severity')}</span></div>
        </> : null} />
      {sum && <Stats items={[
        { label: 'Open issues', value: open.toLocaleString('en-IN'), hint: `across ${new Set(by.map((c) => c.code)).size} kinds of issue`, tone: 'info' },
        { label: 'High severity, open', value: high.toLocaleString('en-IN'), hint: 'death and age conflicts first', tone: high ? 'warn' : 'ok' },
        { label: 'Correction requested', value: requested.toLocaleString('en-IN'), hint: 'waiting on a department' },
        { label: 'Systems involved', value: (sum.by_source || []).length, hint: 'where issues were found' },
      ]} />}
      {sum && (
        <Card title={tr('Summary by issue')} flush>
          <DataTable rows={sum.by_code} rowKey={(c) => c.code + c.severity} dense pageSize={10} pageSizes={[10, 25]} onRowClick={(c) => pick(c.code)} initialSort={{ key: 'open', dir: 'desc' }}
            search={{ placeholder: 'Search issue types', text: (c) => dqLabel(c.code) }}
            columns={[
              { key: 'code', label: 'Issue', render: (c) => dqLabel(c.code) },
              { key: 'severity', label: 'Severity', render: (c) => sevName(c.severity) },
              { key: 'open', label: 'Open', align: 'num', render: (c) => <span className="dq-open"><span className="dq-bar" aria-hidden="true"><i style={{ width: `${Math.round((100 * c.open) / maxOpen)}%` }} /></span><b>{c.open.toLocaleString('en-IN')}</b></span>, sort: (c) => c.open },
              { key: 'requested', label: 'Correction requested', align: 'num' },
              { key: 'go', label: '', sort: false, render: (c) => <button type="button" className="mdm-link" onClick={() => pick(c.code)}>{tr('Show')}</button> },
            ]} />
        </Card>
      )}
      <Status loading={loading && !data} error={error} />
      <div ref={rowsRef} className="dq-scope">
        <h2 className="dq-h">{code ? dqLabel(code) : 'All issues'}</h2>
        <p className="dq-sub">{tr('{v} Use the filters to narrow them; change “Rows” at the foot of the table to see more at once (up to 200).', { v: data ? `${data.total.toLocaleString('en-IN')} ${status === 'OPEN' ? 'open' : 'with a correction requested'}${data.total > limit ? `, ${limit} per page` : ', all shown below'}.` : 'Loading…' })}</p>
      </div>
      {data && (
        <DataTable rows={data.items} server={T.server(data.total)}
          search={{ placeholder: 'Search this page by person or detail', text: (i) => `${i.name} ${i.detail} ${dqLabel(i.code)}` }}
          canClear={!!(code || severity || source || district || from || to || status !== 'OPEN')} onClear={() => { setCode(''); setSeverity(''); setSource(''); setStatus('OPEN'); setDistrict(''); setFrom(''); setTo(''); setOffset(0) }}
          filters={<>
            <FilterSelect label={tr('Issue')} value={code} onChange={f(setCode)} options={codes.map((c) => [c, dqLabel(c)])} all="All issues" />
            <FilterSelect label={tr('Severity')} value={severity} onChange={f(setSeverity)} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <FilterSelect label={tr('Status')} value={status} onChange={f(setStatus)} all={null} options={[['OPEN', 'Open'], ['CORRECTION_REQUESTED', 'Correction requested']]} />
            <FilterSelect label={tr('System')} value={source} onChange={f(setSource)} options={(sum?.by_source || []).map((s) => [s.source, s.name])} />
            <FilterSelect label={tr('District')} value={district} onChange={f(setDistrict)} all="All districts" options={(facets?.districts || []).map((d) => [d.value, d.value])} />
            <DateRange label={tr('Found between')} from={from} to={to} onFrom={f(setFrom)} onTo={f(setTo)} />
          </>}
          empty={tr('No issues match.')}
          columns={[
            { key: 'code', sortKey: 'code', label: 'Issue', render: (i) => dqLabel(i.code) },
            { key: 'severity', sortKey: 'code', label: 'Severity', render: (i) => sevName(i.severity) },
            { key: 'name', sortKey: 'name', label: 'Person', render: (i) => <button type="button" className="mdm-link" onClick={() => openPerson(i.person_id)}>{i.name}</button> },
            { key: 'detail', sortKey: 'detail', label: 'Detail', render: (i) => <span className="mdm-sub">{i.detail}{i.correction_note && <div>{tr('Request: {correction_note} ({requested_by})', { correction_note: i.correction_note, requested_by: i.requested_by })}</div>}</span> },
            { key: 'source_name', sortKey: 'source_name', label: 'System', render: (i) => i.source_name || '—' },
            { key: 'district', sortKey: 'district', label: 'District', render: (i) => i.district || '—' },
            { key: 'go', label: '', sort: false, render: (i) => i.status === 'OPEN' && <button type="button" className="btn-secondary small" onClick={() => { setAsking(i); setNote('') }}>{tr('Ask department to correct')}</button> },
          ]} />
      )}
      <Drawer open={!!asking} onClose={() => setAsking(null)} title={asking ? `Ask ${asking.source_name || 'the department'} to correct this` : ''} subtitle={asking ? `${dqLabel(asking.code)}: ${asking.name}` : ''}>
        {asking && (
          <div className="dxk-stackform" role="dialog" aria-label={tr('Request a correction')}>
            <p className="mdm-sub">{asking.detail}</p>
            <label className="dxk-field"><span>{tr('What should they check?')}</span><textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
            {err && <Banner tone="bad">{err}</Banner>}
            <div className="dxk-actions"><button type="button" className="btn-primary" onClick={send}>{tr('Send request')}</button><button type="button" className="btn-secondary" onClick={() => setAsking(null)}>{tr('Cancel')}</button></div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
