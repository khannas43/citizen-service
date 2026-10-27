import { useMdm, Status, Tile, Badge, Bar } from './shared'
import { dqLabel, fmtDate, fmtFresh, pct } from './labels'

export default function Overview({ goto }) {
  const { data: d, error, loading } = useMdm('/dashboard')
  if (!d) return <Status loading={loading} error={error} />
  const t = d.totals
  const open = d.reviews.OPEN || 0
  const maxCov = Math.max(...d.coverage.map((c) => c.n), 1)
  const highOpen = d.dq.filter((x) => x.severity === 'HIGH' && x.status === 'OPEN').reduce((a, x) => a + x.n, 0)
  const last = d.loads[0]
  const key = last?.stats?.answer_key
  return (
    <div className="mdm-stack">
      <p className="mdm-intro">
        One view of each person across departments. Departments stay the source of truth: this service only links their records,
        shows where they agree or differ, and asks stewards to settle doubtful matches.
      </p>
      <div className="mdm-tiles">
        <Tile label="People (golden records)" value={t.persons.toLocaleString('en-IN')} hint={`built from ${t.records.toLocaleString('en-IN')} department records`} />
        <Tile label="Seen in 3 or more systems" value={t.well_linked.toLocaleString('en-IN')} hint={`${pct(t.well_linked, t.persons)}% of people`} />
        <Tile label="Waiting for a steward" value={open.toLocaleString('en-IN')} tone={open ? 'warn' : 'ok'} hint="possible matches to confirm" />
        <Tile label="High-severity data issues" value={highOpen.toLocaleString('en-IN')} tone={highOpen ? 'bad' : 'ok'} hint="open, across all departments" />
        <Tile label="Deaths registered" value={t.deceased.toLocaleString('en-IN')} hint="from civil registration" />
      </div>

      <section className="mdm-card">
        <h2>Department systems</h2>
        <p className="mdm-note">How current each feed is, how much of it could be tied to a person, and what is still open.</p>
        <div className="mdm-table-wrap">
          <table className="mdm-table">
            <thead><tr><th>System</th><th>How we read it</th><th>Freshness</th><th className="num">Records</th><th>Tied to a person</th><th className="num">With a steward</th><th className="num">Open issues</th><th>Latest record</th></tr></thead>
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
          <h2>Where doubtful matches stand</h2>
          <ul className="mdm-plain">
            <li><Badge tone="ok">Linked automatically</Badge> {(d.links.AUTO_LINKED || 0).toLocaleString('en-IN')}</li>
            <li><Badge tone="warn">Waiting for a steward</Badge> {(d.links.IN_REVIEW || 0).toLocaleString('en-IN')}</li>
            <li><Badge>First or single record of a person</Badge> {((d.links.ANCHOR || 0) + (d.links.NEW || 0)).toLocaleString('en-IN')}</li>
            <li><Badge tone="info">Decided by a steward</Badge> {((d.links.STEWARD_LINKED || 0) + (d.links.STEWARD_SEPARATE || 0)).toLocaleString('en-IN')}</li>
          </ul>
          <button type="button" className="btn-primary small" onClick={() => goto('review')}>Open the review queue</button>
        </section>
        <section className="mdm-card">
          <h2>How many systems know each person</h2>
          <ul className="mdm-plain">
            {d.coverage.map((c) => (
              <li key={c.source_count}><span className="mdm-cov-label">{c.source_count} system{c.source_count === 1 ? '' : 's'}</span> <Bar value={c.n} max={maxCov} /> {c.n.toLocaleString('en-IN')}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mdm-card">
        <h2>Data quality at a glance</h2>
        <ul className="mdm-plain">
          {d.dq.filter((x) => x.status === 'OPEN').slice(0, 8).map((x) => (
            <li key={x.code + x.severity}>
              <Badge tone={x.severity === 'HIGH' ? 'bad' : x.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{x.severity === 'HIGH' ? 'High' : x.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge>{' '}
              <button type="button" className="mdm-link" onClick={() => goto('quality', { code: x.code })}>{dqLabel(x.code)}</button> {x.n.toLocaleString('en-IN')}
            </li>
          ))}
        </ul>
      </section>

      {last && (
        <p className="mdm-note">
          Last load {fmtDate(last.finished_at || last.started_at)}: {last.stats?.records?.toLocaleString('en-IN')} records into {last.stats?.persons?.toLocaleString('en-IN')} people.
          {key && ` Against the known answers for this synthetic data, ${(key.precision * 100).toFixed(1)}% of links made are correct and ${(key.recall * 100).toFixed(1)}% of true links are found.`}
        </p>
      )}
    </div>
  )
}
