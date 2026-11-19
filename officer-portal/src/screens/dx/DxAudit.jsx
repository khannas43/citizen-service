import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { fmtTime } from './dxShared'
import { Hero, Card, Stats, DataTable, Drawer, SearchBox, FilterSelect, Banner, Facts } from './dxKit'
import { tr } from '../../i18n/lang'

const nice = (a) => String(a || '').replace(/_/g, ' ').toLowerCase()
const EMPTY = { actor_is: '', action_is: '', subject: '', q: '', date_from: '', date_to: '' }

export default function DxAudit() {
  const [f, setF] = useState(EMPTY)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(25)
  const [sort, setSort] = useState({ key: 'seq', dir: 'desc' })
  const [open, setOpen] = useState(null)
  const [demo, setDemo] = useState(null)
  const [err, setErr] = useState(null)
  const set = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setOffset(0) }
  const { data, error, loading, reload } = useMdm('/x/audit', { ...f, limit, offset, sort: sort.key, dir: sort.dir }, [JSON.stringify(f), offset, limit, sort.key, sort.dir])
  const { data: facets } = useMdm('/x/audit/facets', undefined, [])
  const { data: chain, reload: recheck } = useMdm('/audit/verify', undefined, [])
  const tamper = async () => {
    setErr(null); setDemo(null)
    try { setDemo(await mdm('/x/audit/tamper-demo', { method: 'POST', body: {} })); reload(); recheck() } catch (e) { setErr(e.message) }
  }
  const any = Object.values(f).some(Boolean)
  const reset = () => { setF(EMPTY); setOffset(0) }
  const last = facets?.range?.last
  return (
    <div className="mdm-hub">
      <Hero eyebrow={tr('Trust · Audit trail')} title={tr('Audit explorer')}
        text={tr('Every action is written to a log where each line carries a fingerprint of the one before. Changing or deleting a past line breaks the chain, and the check shows exactly where.')}
        aside={chain ? <>
          <div className="dxk-hero-fig"><span className={`dxk-pill tone-${chain.ok ? 'ok' : 'bad'}`}>{chain.ok ? 'Chain intact' : `Broken at ${chain.broken_at}`}</span><span>{tr('{checked} entries checked', { checked: chain.checked.toLocaleString('en-IN') })}</span></div>
        </> : null} />
      <Stats items={[
        { label: 'Entries in the log', value: (facets?.actions ? facets.actions.reduce((a, x) => a + x.n, 0) : 0).toLocaleString('en-IN') },
        { label: 'People and systems that acted', value: facets?.actors?.length ?? 0, hint: 'listed under Who' },
        { label: 'Kinds of action', value: facets?.actions?.length ?? 0, hint: 'listed under Action' },
        { label: 'Latest entry', value: last ? fmtTime(last).split(',')[0] : '—', hint: any ? tr('{n} match the filters', { n: (data?.total ?? 0).toLocaleString('en-IN') }) : (last ? fmtTime(last).split(',')[1]?.trim() : undefined) },
      ]} />
      <Status loading={loading && !data} error={error} />
      {data && (
        <DataTable rows={data.items} rowKey="seq"
          server={{ total: data.total, limit, offset, onPage: setOffset, onLimit: (n) => { setLimit(n); setOffset(0) }, pageSizes: [10, 25, 50, 100],
            sort, onSort: (key, dir) => { setSort({ key, dir }); setOffset(0) } }}
          searchValue={f.q} onSearch={set('q')} searchDelay={300} search={{ placeholder: 'Search any text in the entry' }}
          canClear={any} onClear={reset}
          filters={<>
            <FilterSelect label={tr('Who')} value={f.actor_is} onChange={set('actor_is')} all="Anyone" options={(facets?.actors || []).map((x) => [x.value, `${x.value} (${x.n.toLocaleString('en-IN')})`])} />
            <FilterSelect label={tr('Action')} value={f.action_is} onChange={set('action_is')} all="Any action" options={(facets?.actions || []).map((x) => [x.value, `${nice(x.value)} (${x.n.toLocaleString('en-IN')})`])} />
            <div className="dxk-filter dxk-daterange"><span>{tr('Date between')}</span>
              <div className="dxk-dates">
                <input type="date" value={f.date_from} max={f.date_to || undefined} aria-label={tr('From date')} onChange={(e) => set('date_from')(e.target.value)} />
                <em>{tr('to')}</em>
                <input type="date" value={f.date_to} min={f.date_from || undefined} aria-label={tr('To date')} onChange={(e) => set('date_to')(e.target.value)} />
              </div></div>
            <SearchBox value={f.subject} onChange={set('subject')} delay={300} placeholder={tr('About, e.g. person:123')} label={tr('Filter by what it was about')} />
          </>}
          onRowClick={(a) => setOpen(a)} empty={tr('No entries match')}
          columns={[
            { key: 'seq', sortKey: 'seq', label: '#', align: 'num' },
            { key: 'ts', sortKey: 'ts', label: 'When', render: (a) => <span className="dxk-muted">{fmtTime(a.ts)}</span> },
            { key: 'actor', sortKey: 'actor', label: 'Who', render: (a) => <span className="dxk-main">{a.actor}</span> },
            { key: 'action', sortKey: 'action', label: 'Action', render: (a) => <Badge>{nice(a.action)}</Badge> },
            { key: 'subject', sortKey: 'subject', label: 'About', render: (a) => <span className="dxk-muted">{a.subject}</span> },
            { key: 'go', label: '', render: (a) => <button type="button" className="btn-secondary small" onClick={(e) => { e.stopPropagation(); setOpen(a) }}>{tr('Details')}</button> },
          ]} />
      )}
      <Card title={tr('Tamper test')} hint={tr('Changes one old line for a moment, runs the check, and then undoes the change. Nothing is lost.')}>
        <div className="dxk-actions"><button type="button" className="btn-secondary" onClick={tamper}>{tr('Run the tamper test')}</button></div>
        {err && <div style={{ marginTop: '0.75rem' }}><Banner tone="bad">{err}</Banner></div>}
        {demo && (
          <ol className="dx-timeline" aria-label={tr('Tamper test result')}>
            <li>{tr('Before the edit:')} <strong>{demo.before.ok ? tr('intact') : tr('broken')}</strong></li>
            <li>{tr('After editing entry {edited_seq}:', { edited_seq: demo.edited_seq })} <strong>{demo.while_edited.ok ? tr('intact') : tr('broken at entry {n}', { n: demo.while_edited.broken_at })}</strong></li>
            <li>{tr('After undoing it:')} <strong>{demo.after_rollback.ok ? tr('intact') : tr('broken')}</strong></li>
          </ol>
        )}
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Entry ${open.seq}` : ''} subtitle={open ? open.action.replace(/_/g, ' ').toLowerCase() : ''}>
        {open && <>
          <Facts items={[['When', fmtTime(open.ts)], ['Who', open.actor], ['About', open.subject], ['Fingerprint', <span key="h" className="dx-mono">{open.hash}…</span>]]} />
          <h3 className="dxk-h3">{tr('Detail')}</h3>
          <pre className="dxk-pre">{JSON.stringify(open.detail, null, 2)}</pre>
        </>}
      </Drawer>
    </div>
  )
}
