import { useMdm, Status, Tile, Badge, Bar } from './shared'
import { dqLabel, fmtDate, fmtFresh, pct } from './labels'
import { Card, DataTable } from '../dx/dxKit'
import { tr } from '../../i18n/lang'

export default function Overview({ goto }) {
  const { data: d, error, loading } = useMdm('/dashboard')
  if (!d) return <Status loading={loading} error={error} />
  const t = d.totals
  const open = d.reviews.OPEN || 0
  const maxCov = Math.max(...d.coverage.map((c) => c.n), 1)
  const highOpen = d.dq.filter((x) => x.severity === 'HIGH' && x.status === 'OPEN').reduce((a, x) => a + x.n, 0)
  const last = d.loads[0]
  // one row per kind of problem and severity, with how many are open, awaiting a department, or settled
  const byIssue = {}
  d.dq.forEach((x) => {
    const r = (byIssue[x.code + x.severity] ||= { id: x.code + x.severity, code: x.code, severity: x.severity, open: 0, requested: 0, resolved: 0 })
    if (x.status === 'OPEN') r.open += x.n; else if (x.status === 'CORRECTION_REQUESTED') r.requested += x.n; else r.resolved += x.n
  })
  const dqRows = Object.values(byIssue)
  const totalOpen = dqRows.reduce((a, r) => a + r.open, 0)
  const maxOpen = Math.max(...dqRows.map((r) => r.open), 1)
  const SEV_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  const key = last?.stats?.answer_key
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">
        {tr('One view of each person across departments. Departments stay the source of truth: this service only links their records, shows where they agree or differ, and asks stewards to settle doubtful matches.')}
      </p>
      <div className="mdm-tiles">
        <Tile label={tr('People (golden records)')} value={t.persons.toLocaleString('en-IN')} hint={`built from ${t.records.toLocaleString('en-IN')} department records`} />
        <Tile label={tr('Seen in 3 or more systems')} value={t.well_linked.toLocaleString('en-IN')} hint={`${pct(t.well_linked, t.persons)}% of people`} />
        <Tile label={tr('Waiting for a steward')} value={open.toLocaleString('en-IN')} tone={open ? 'warn' : 'ok'} hint={tr('possible matches to confirm')} />
        <Tile label={tr('High-severity data issues')} value={highOpen.toLocaleString('en-IN')} tone={highOpen ? 'bad' : 'ok'} hint={tr('open, across all departments')} />
        <Tile label={tr('Deaths registered')} value={t.deceased.toLocaleString('en-IN')} hint={tr('from civil registration')} />
      </div>

      <section className="mdm-card">
        <h2>{tr('Department systems')}</h2>
        <p className="mdm-note">{tr('How current each feed is, how much of it could be tied to a person, and what is still open.')}</p>
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>{tr('System')}</th><th>{tr('How we read it')}</th><th>{tr('Freshness')}</th><th className="num">{tr('Records')}</th><th>{tr('Tied to a person')}</th><th className="num">{tr('With a steward')}</th><th className="num">{tr('Open issues')}</th><th>{tr('Latest record')}</th></tr></thead>
            <tbody>
              {d.sources.map((s) => (
                <tr key={s.source}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.interface}</td>
                  <td>{fmtFresh(s.freshness_hours)}</td>
                  <td className="num">{s.records.toLocaleString('en-IN')}</td>
                  <td><Bar value={s.linked} max={s.records} tone="ok" /> <span className="mdm-bar-text">{pct(s.linked, s.records)}%</span></td>
                  <td className="num">{s.in_review ? <button type="button" className="mdm-link" onClick={() => goto('review', { source: s.source })}>{s.in_review}</button> : 0}</td>
                  <td className="num">{s.open_issues ? <button type="button" className="mdm-link" onClick={() => goto('quality', { source: s.source })}>{s.open_issues}</button> : 0}</td>
                  <td>{s.latest ? fmtDate(s.latest) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mdm-grid-2">
        <section className="mdm-card">
          <h2>{tr('Where doubtful matches stand')}</h2>
          <ul className="mdm-plain">
            <li><Badge tone="ok">{tr('Linked automatically')}</Badge> {(d.links.AUTO_LINKED || 0).toLocaleString('en-IN')}</li>
            <li><Badge tone="warn">{tr('Waiting for a steward')}</Badge> {(d.links.IN_REVIEW || 0).toLocaleString('en-IN')}</li>
            <li><Badge>{tr('First or single record of a person')}</Badge> {((d.links.ANCHOR || 0) + (d.links.NEW || 0)).toLocaleString('en-IN')}</li>
            <li><Badge tone="info">{tr('Decided by a steward')}</Badge> {((d.links.STEWARD_LINKED || 0) + (d.links.STEWARD_SEPARATE || 0)).toLocaleString('en-IN')}</li>
          </ul>
          <button type="button" className="btn-primary small" onClick={() => goto('review')}>{tr('Open the review queue')}</button>
        </section>
        <section className="mdm-card">
          <h2>{tr('How many systems know each person')}</h2>
          <ul className="mdm-plain">
            {d.coverage.map((c) => (
              <li key={c.source_count}><span className="mdm-cov-label">{tr('{source_count} system{v}', { source_count: c.source_count, v: c.source_count === 1 ? '' : 's' })}</span> <Bar value={c.n} max={maxCov} /> {c.n.toLocaleString('en-IN')}</li>
            ))}
          </ul>
        </section>
      </div>

      <Card title={tr('Data quality at a glance')} flush
        hint={tr('What the departments disagree on, grouped by kind of problem. Click a row to see the people affected.')}
        actions={<button type="button" className="btn-secondary small" onClick={() => goto('quality')}>{tr('Open data quality')}</button>}>
        <DataTable rows={dqRows} dense pageSize={8} pageSizes={[8, 15, 30]}
          initialSort={{ key: 'severity', dir: 'asc' }}
          onRowClick={(r) => goto('quality', { code: r.code })} empty={tr('No data issues recorded.')}
          search={{ placeholder: 'Search a kind of problem', text: (r) => `${dqLabel(r.code)} ${r.severity}` }}
          columns={[
            { key: 'code', label: 'Issue', sort: (r) => dqLabel(r.code), render: (r) => <button type="button" className="mdm-link strong" onClick={(e) => { e.stopPropagation(); goto('quality', { code: r.code }) }}>{dqLabel(r.code)}</button> },
            { key: 'severity', label: 'Severity', sort: (r) => SEV_ORDER[r.severity] ?? 9, render: (r) => <Badge tone={r.severity === 'HIGH' ? 'bad' : r.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{r.severity === 'HIGH' ? 'High' : r.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge> },
            { key: 'open', label: 'Open', align: 'num', render: (r) => r.open.toLocaleString('en-IN') },
            { key: 'requested', label: 'Correction requested', align: 'num', render: (r) => r.requested.toLocaleString('en-IN') },
            { key: 'resolved', label: 'Resolved', align: 'num', render: (r) => r.resolved.toLocaleString('en-IN') },
            { key: 'share', label: 'Share of all open', sort: (r) => r.open, render: (r) => <><Bar value={r.open} max={maxOpen} tone={r.severity === 'HIGH' ? 'bad' : 'warn'} /> <span className="mdm-bar-text">{pct(r.open, totalOpen)}%</span></> },
          ]} />
      </Card>

      {last && (
        <p className="mdm-note">
          {tr('Last load {v}: {v2} records into {v3} people. {v4}', { v: fmtDate(last.finished_at || last.started_at), v2: last.stats?.records?.toLocaleString('en-IN'), v3: last.stats?.persons?.toLocaleString('en-IN'), v4: key && ` Against the known answers for this synthetic data, ${(key.precision * 100).toFixed(1)}% of links made are correct and ${(key.recall * 100).toFixed(1)}% of true links are found.` })}
        </p>
      )}
    </div>
  )
}
