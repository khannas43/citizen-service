import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { PageHeader, Card, Tabs, DataTable, Drawer, Banner, Segmented } from './dxKit'
import { tr, tObj } from '../../i18n/lang'

const SCOPE = { DEFAULT: ['Anything else', 'neutral'], EVENT: ['Event', 'info'], USE: ['Specific use', 'ok'] }
const CHANNEL_TEXT = tObj({ FEED: 'Feed only', PORTAL: 'Portal only', BOTH: 'Feed and portal' })
const CHANNEL_HINT = tObj({
  FEED: 'The department pulls its notices with its key and posts its answers back. It never signs in here.',
  PORTAL: 'The department signs in to a portal inbox. Its feed is switched off.',
  BOTH: 'Either route works. Both record the same answer in the same way.',
})

function RuleEditor({ rule, addable, done }) {
  const adding = !rule
  const [key, setKey] = useState(rule?.key || '')
  const [days, setDays] = useState(String(rule?.days ?? 7))
  const [kind, setKind] = useState(rule?.day_kind || 'CALENDAR')
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const n = Number(days)
  const ok = Number.isInteger(n) && n >= 1 && n <= 90 && note.trim().length >= 10 && (!adding || key)
  const save = async () => {
    setBusy(true); setErr(null)
    try { await mdm('/x/response-rules', { method: 'PUT', body: { scope: rule?.scope || 'USE', key: rule?.key || key, days: n, day_kind: kind, note: note.trim() } }); done() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true); setErr(null)
    try { await mdm('/x/response-rules/remove', { method: 'POST', body: { scope: 'USE', key: rule.key, note: note.trim() } }); done() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div>
      {adding && (
        <label className="dxk-field"><span>{tr('Which use or action')}</span>
          <select value={key} onChange={(e) => setKey(e.target.value)} aria-label={tr('Which use or action')}>
            <option value="">{tr('Choose…')}</option>
            {addable.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select></label>
      )}
      <div className="dxk-form" style={{ marginTop: '0.75rem' }}>
        <label className="dxk-field"><span>{tr('Number of days')}</span><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label={tr('Number of days')} /></label>
        <div className="dxk-field"><span>{tr('Counted as')}</span>
          <Segmented label={tr('Counted as')} value={kind} onChange={setKind} options={[{ value: 'CALENDAR', label: 'Calendar days' }, { value: 'WORKING', label: 'Working days' }]} /></div>
      </div>
      <p className="mdm-sub">{tr('Working days are Monday to Friday. Public holidays are not modelled. A change applies to notices issued from now on; a notice already issued keeps the deadline it was given.')}</p>
      <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('Why is this changing? (recorded against your name, at least 10 characters)')}</span>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={tr('Reason for the change')} /></label>
      <div className="dxk-actions" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn-primary" disabled={busy || !ok} onClick={save}>{adding ? 'Add this rule' : 'Apply the change'}</button>
        {!adding && rule.scope === 'USE' && <button type="button" className="btn-secondary" disabled={busy || note.trim().length < 10} onClick={remove}>{tr('Remove, follow the event\'s time')}</button>}
      </div>
      {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
    </div>
  )
}

function RuleHistory({ rule }) {
  const { data, error, loading } = useMdm('/x/response-rules/history', { scope: rule.scope, key: rule.key }, [rule.scope, rule.key])
  if (!data) return <Status loading={loading} error={error} />
  return (
    <DataTable rows={data.history} rowKey="version" dense pageSize={10} pageSizes={[10]}
      columns={[
        { key: 'version', label: 'Version', render: (h) => <>{h.version}{h.active && <> <Badge tone="ok">{tr('in force')}</Badge></>}</> },
        { key: 'days', label: 'Time allowed', sort: false, render: (h) => `${h.days} ${h.day_kind === 'WORKING' ? 'working' : 'calendar'} days` },
        { key: 'changed_by', label: 'Changed by' },
        { key: 'changed_at', label: 'When', render: (h) => <span className="mdm-sub">{fmtTime(h.changed_at)}</span> },
        { key: 'note', label: 'Why', render: (h) => <span className="mdm-sub">{h.note}</span> },
      ]} />
  )
}

function ChannelEditor({ dept, done }) {
  const [channel, setChannel] = useState(dept.channel)
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setErr(null)
    try { await mdm(`/x/channels/${dept.system}`, { method: 'PUT', body: { channel, note: note.trim() } }); done() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div>
      <Segmented label={tr('Channel')} value={channel} onChange={setChannel} options={Object.entries(CHANNEL_TEXT).map(([value, label]) => ({ value, label }))} />
      <p className="mdm-sub" style={{ marginTop: '0.5rem' }}>{CHANNEL_HINT[channel]}</p>
      <label className="dxk-field" style={{ marginTop: '0.75rem' }}><span>{tr('Why is this changing? (recorded, at least 10 characters)')}</span>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label={tr('Reason for the change')} /></label>
      <div className="dxk-actions" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn-primary" disabled={busy || channel === dept.channel || note.trim().length < 10} onClick={save}>{tr('Apply the change')}</button>
      </div>
      {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
    </div>
  )
}

export default function DxResponseTimes() {
  const [tab, setTab] = useState('times')
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState(null)       // a rule, or 'new'
  const [hist, setHist] = useState(null)
  const [dept, setDept] = useState(null)
  const { data, error, loading } = useMdm('/x/response-rules', undefined, [tick])
  const { data: ch, error: chErr, loading: chLoading } = useMdm('/x/channels', undefined, [tick])
  const after = () => { setEdit(null); setDept(null); setTick((n) => n + 1) }
  return (
    <div className="mdm-hub">
      <PageHeader icon="⏱" title={tr('Response times and channels')}
        subtitle={tr('How long a department has to answer a notice, set for each kind of event, with an override for a specific action such as a pension stop. Each department is also set to receive its notices by feed, by portal, or both.')} />
      <Tabs label={tr('Sections')} value={tab} onChange={setTab} tabs={[{ id: 'times', label: 'Response times', count: data?.rules.length }, { id: 'channels', label: 'Department channels', count: ch?.channels.length }]} />
      {tab === 'times' && (
        <>
          <Status loading={loading && !data} error={error} />
          {data && (
            <Card title={tr('Time allowed to answer')} hint={data.note} flush
              actions={<button type="button" className="btn-secondary small" onClick={() => setEdit('new')}>{tr('Add a rule for a specific use')}</button>}>
              <DataTable rows={data.rules} rowKey="id" dense pageSize={20} pageSizes={[20]} csv={{ name: 'response-times' }}
                search={{ placeholder: 'Search events and uses', text: (r) => `${r.label} ${r.key} ${r.text}` }}
                columns={[
                  { key: 'label', label: 'Applies to', render: (r) => <span className="dxk-main">{r.label}</span>, csv: (r) => r.label },
                  { key: 'scope', label: 'Rule for', render: (r) => <Badge tone={SCOPE[r.scope][1]}>{SCOPE[r.scope][0]}</Badge>, csv: (r) => SCOPE[r.scope][0] },
                  { key: 'days', label: 'Time allowed', render: (r) => <strong>{r.text}</strong>, csv: (r) => r.text },
                  { key: 'version', label: 'Version', align: 'num' },
                  { key: 'changed_at', label: 'Last changed', render: (r) => <span className="mdm-sub">{r.changed_by}<br />{fmtTime(r.changed_at)}</span>, csv: (r) => r.changed_at },
                  { key: 'go', label: '', sort: false, render: (r) => (
                    <div className="dxk-actions">
                      <button type="button" className="btn-secondary small" onClick={() => setEdit(r)}>{tr('Change')}</button>
                      {r.version > 1 && <button type="button" className="mdm-link" onClick={() => setHist(r)}>{tr('History ({version})', { version: r.version })}</button>}
                    </div>) },
                ]} />
            </Card>
          )}
        </>
      )}
      {tab === 'channels' && (
        <>
          <Status loading={chLoading && !ch} error={chErr} />
          {ch && (
            <Card title={tr('How each department receives notices')} flush hint={tr('A department on the feed uses its key from Security and Keys. A department set to portal only has its feed switched off.')}>
              <DataTable rows={ch.channels} rowKey="system" dense pageSize={20} pageSizes={[20]} csv={{ name: 'department-channels' }}
                search={{ placeholder: 'Search departments', text: (d) => d.name }}
                columns={[
                  { key: 'name', label: 'Department', render: (d) => <span className="dxk-main">{d.name}</span>, csv: (d) => d.name },
                  { key: 'channel', label: 'Receives notices', render: (d) => <Badge tone={d.channel === 'BOTH' ? 'ok' : 'info'}>{CHANNEL_TEXT[d.channel]}</Badge>, csv: (d) => CHANNEL_TEXT[d.channel] },
                  { key: 'changed_at', label: 'Last changed', render: (d) => d.changed_by ? <span className="mdm-sub">{d.changed_by}<br />{fmtTime(d.changed_at)}</span> : <span className="mdm-sub">{tr('Never changed')}</span>, csv: (d) => d.changed_at || '' },
                  { key: 'go', label: '', sort: false, render: (d) => <button type="button" className="btn-secondary small" onClick={() => setDept(d)}>{tr('Change')}</button> },
                ]} />
            </Card>
          )}
        </>
      )}
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'Add a rule for a specific use' : edit ? edit.label : ''}
        subtitle={edit && edit !== 'new' ? `Now ${edit.text}` : 'It wins over the rule for the event'}>
        {edit && <RuleEditor key={edit === 'new' ? 'new' : `${edit.scope}/${edit.key}`} rule={edit === 'new' ? null : edit} addable={data?.addable_uses || []} done={after} />}
      </Drawer>
      <Drawer open={!!hist} onClose={() => setHist(null)} title={hist ? `History: ${hist.label}` : ''} wide>
        {hist && <RuleHistory rule={hist} />}
      </Drawer>
      <Drawer open={!!dept} onClose={() => setDept(null)} title={dept ? dept.name : ''} subtitle={tr('How this department receives its notices')}>
        {dept && <ChannelEditor key={dept.system} dept={dept} done={after} />}
      </Drawer>
    </div>
  )
}
