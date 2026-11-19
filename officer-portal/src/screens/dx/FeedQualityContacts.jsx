import { useEffect, useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Collapse, Banner } from './dxKit'
import { fmtTime } from './dxShared'
import { tr } from '../../i18n/lang'

export default function FeedQualityContacts({ onSaved }) {
  const [tick, setTick] = useState(0)
  const { data, error, loading } = useMdm('/x/quality/contacts', {}, [tick])
  const [rows, setRows] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  useEffect(() => { if (data?.items) setRows(Object.fromEntries(data.items.map((c) => [c.source, { name: c.name || '', role: c.role || '', email: c.email || '', phone: c.phone || '' }]))) }, [data])
  const set = (s, k) => (e) => setRows({ ...rows, [s]: { ...rows[s], [k]: e.target.value } })
  const save = async (s) => {
    setBusy(s); setMsg(null)
    try { await mdm(`/x/quality/contacts/${s}`, { method: 'PUT', body: rows[s] }); setMsg({ tone: 'info', text: tr('Saved the contact for {feed}.', { feed: data.items.find((c) => c.source === s).feed }) }); setTick((x) => x + 1); onSaved?.() } catch (e) { setMsg({ tone: 'warn', text: e.message }) }
    setBusy('')
  }
  const pending = data?.items ? data.items.filter((c) => c.placeholder).length : 0
  return (
    <Collapse id="fq-contacts" title={tr('Department contacts')} summary={data?.items ? `One contact per feed, shown in “What to do” when a check fails${pending ? ` · ${pending} still placeholders` : ''}` : 'One contact per feed'}>
      <Status loading={loading && !data} error={error} />
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      {data?.items && (
        <div className="dxk-table-wrap">
          <table className="mdm-table fq-contacts">
            <thead><tr><th>{tr('Feed')}</th><th>{tr('Name')}</th><th>{tr('Role')}</th><th>{tr('Email')}</th><th>{tr('Phone')}</th><th>{tr('Last changed')}</th><th><span className="sr-only">{tr('Save')}</span></th></tr></thead>
            <tbody>
              {data.items.map((c) => rows[c.source] && (
                <tr key={c.source}>
                  <td>{c.feed}{c.placeholder && <> <Badge tone="warn">{tr('Placeholder')}</Badge></>}</td>
                  {['name', 'role', 'email', 'phone'].map((k) => <td key={k}><input value={rows[c.source][k]} onChange={set(c.source, k)} aria-label={`${c.feed}: ${k}`} /></td>)}
                  <td className="lin-meta">{c.updated_at ? `${fmtTime(c.updated_at)} · ${c.updated_by}` : '—'}</td>
                  <td><button type="button" className="btn-secondary small" disabled={busy === c.source} onClick={() => save(c.source)}>{busy === c.source ? 'Saving…' : 'Save'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Collapse>
  )
}
