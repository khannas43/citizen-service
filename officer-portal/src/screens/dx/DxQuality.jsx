import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Card, DataTable, FilterSelect, Segmented, Drawer, Facts, Banner, Tabs } from './dxKit'
import { Spark } from './QualityCharts'
import { fmtTime } from './dxShared'
import FeedQualityRange from './FeedQualityRange'
import FeedQualityRules from './FeedQualityRules'
import FeedQualityContacts from './FeedQualityContacts'
import Reasons from './QualityReasons'
import './dxLineage.css'
import { tr } from '../../i18n/lang'

const STATUS = { PASS: ['Passed', 'ok'], WARN: ['Passed with warnings', 'warn'], FAIL: ['Failed', 'bad'] }
const CLS = { PASS: '', WARN: 'warn', FAIL: 'bad' }
const SEV = { critical: ['Must hold', 'bad'], advisory: ['Worth chasing', 'warn'] }
const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(v >= 10 || v === 0 ? 0 : 1)}%`)
const DIMENSIONS = [
  ['Record keys', (r) => r.column_name === 'source_rid' || r.expectation === 'expect_table_row_count_to_be_between'],
  ['Names', (r) => r.column_name === 'name'],
  ['Valid values', (r) => ['gender', 'dob_year', 'age', 'birth_year', 'as_of'].includes(r.column_name)],
  ['Completeness', (r) => r.severity === 'advisory' && r.expectation === 'expect_column_values_to_not_be_null'],
  ['Freshness', (r) => r.expectation === 'expect_column_max_to_be_between'],
  ['Repeats', (r) => r.expectation === 'expect_compound_columns_to_be_unique'],
]
const RING = { PASS: '#1a7a4a', WARN: '#b45309', FAIL: '#b91c1c' }

function Ring({ value, color, size = 64, stroke = 7, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className="fq-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value)} percent`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,.28)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fq-ring-t">{label ?? `${Math.round(value)}%`}</text>
    </svg>
  )
}

const expName = (e) => (e || '').replace(/^expect_/, '').replace(/_/g, ' ')

export default function DxQuality() {
  const [params, setParams] = useSearchParams()
  const feed = params.get('feed') || ''
  const tab = ['overview', 'received', 'checks', 'settings'].includes(params.get('tab')) ? params.get('tab') : 'overview'
  const [copied, setCopied] = useState(false)
  const [result, setResult] = useState('')
  const [sev, setSev] = useState('')
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [sel, setSel] = useState(null)
  const [more, setMore] = useState(false)
  const { data, error, loading } = useMdm('/x/quality/latest', {}, [tick])
  const hist = useMdm('/x/quality/runs', { limit: 8 }, [tick])
  const go = (patch) => { const n = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setParams(n) }
  const setFeed = (v) => go({ feed: v })
  const setTab = (t) => go({ tab: t === 'overview' ? '' : t })

  const run = async () => {
    setBusy(true); setMsg(null)
    try { const r = await mdm('/x/quality/run', { method: 'POST' }); setMsg({ tone: 'ok', text: tr('Checked {a} feeds: {b} passed, {c} with warnings, {d} failed.', { a: r.totals.feeds, b: r.totals.pass, c: r.totals.warn, d: r.totals.fail }) }); setTick((x) => x + 1) } catch (e) { setMsg({ tone: 'bad', text: e.message }) }
    setBusy(false)
  }

  const order = { FAIL: 0, WARN: 1, PASS: 2 }
  const feeds = Object.entries(data?.summary?.feeds || {}).sort((a, b) => order[a[1].status] - order[b[1].status])
  const t = data?.summary?.totals
  const all = data?.results || []
  const rows = all.filter((r) => (!feed || r.source === feed) && (!result || (result === 'failed' ? !r.success : r.success)) && (!sev || r.severity === sev))
  const failedAll = all.filter((r) => !r.success)
  const idx = sel ? failedAll.findIndex((r) => r.id === sel.id) : -1
  const step = (d) => { const n = failedAll[idx + d]; if (n) { setSel(n); setMore(false); setCopied(false) } }
  const copyMessage = async () => {
    const c = data.contacts?.[sel.source]
    const f = sel.found || {}
    const text = [`Feed quality: ${data.summary.feeds[sel.source]?.name || sel.source}`, `Check: ${sel.description}`, '',
      `Why it failed: ${sel.explain?.why}`,
      ...(f.breakdown?.length ? [`Kinds of problem: ${f.breakdown.map((b) => `${b.label} (${b.count})`).join(', ')}`] : []),
      ...(f.examples?.length ? [`Example record keys: ${f.examples.slice(0, 5).map((e) => e.source_rid).filter(Boolean).join(', ')}`] : []),
      '', `What we would like: ${sel.explain?.action}`, ...(c ? ['', `To: ${c.name}${c.role ? `, ${c.role}` : ''}${c.email ? ` <${c.email}>` : ''}`] : [])].join('\n')
    try { await navigator.clipboard.writeText(text) } catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="mdm-hub">
      <header className="fq-hero">
        <div className="fq-hero-main">
          <span className="fq-eyebrow">{tr('Data trust · Department feeds')}</span>
          <h1 className="page-title fq-hero-title">{tr('Feed quality')}</h1>
          <p className="fq-hero-text">{tr('Each department feed is checked against its own contract with Great Expectations: are the record keys present and well formed, are the values possible, and are the expected fields filled in and current. This looks at a feed on its own, before records are compared across departments.')}</p>
          <div className="fq-hero-actions">
            <button type="button" className="fq-run" onClick={run} disabled={busy} aria-label={tr('Run checks now')}>{busy ? 'Checking…' : '▶  Run checks now'}</button>
            {data?.run && <span className="fq-hero-meta">{tr('Last run {v} · run {id} · Great Expectations {gx_version} · {v2}', { v: fmtTime(data.run.finished_at), id: data.run.id, gx_version: data.run.gx_version, v2: data.run.trigger === 'JOB' ? 'scheduled job' : `started by ${data.run.actor}` })}</span>}
          </div>
        </div>
        {data?.run && (() => {
          const ok = data.results.filter((r) => r.success).length
          const share = data.results.length ? (ok / data.results.length) * 100 : 0
          return (
            <div className="fq-hero-score">
              <Ring value={share} size={116} stroke={11} color={share >= 95 ? '#4ade80' : share >= 80 ? '#fbbf24' : '#f87171'} />
              <div><strong>{tr('{ok} of {length}', { ok, length: data.results.length })}</strong><span>{tr('individual checks passed')}</span>
                <span className="fq-hero-split">{tr('Across {feeds} feeds: {pass} passed · {warn} with warnings · {fail} failed', { feeds: t.feeds, pass: t.pass, warn: t.warn, fail: t.fail })}</span></div>
            </div>
          )
        })()}
      </header>
      {msg && <Banner tone={msg.tone === 'bad' ? 'warn' : 'info'}>{msg.text}</Banner>}
      <Status loading={loading && !data} error={error} />
      {data && !data.run && <Banner tone="info">{tr('No check has been run yet. Select “Run checks now”. The same checks run on a schedule in production.')}</Banner>}
      {data?.run && (
        <>
          <Tabs label={tr('Feed quality sections')} value={tab} onChange={setTab} tabs={[
            { id: 'overview', label: 'Overview' }, { id: 'received', label: 'Records received' },
            { id: 'checks', label: 'Checks', count: failedAll.length }, { id: 'settings', label: 'Settings' }]} />

          {tab === 'overview' && (
            <>
              <div className="fq-tiles">
                {[['Feeds checked', t.feeds, 'info'], ['Passed', t.pass, 'ok'], ['Passed with warnings', t.warn, t.warn ? 'warn' : 'ok'], ['Failed', t.fail, t.fail ? 'bad' : 'ok']].map(([l, v, tone]) => (
                  <div key={l} className={`fq-tile ${tone}`}><span className="fq-tile-v">{v}</span><span className="fq-tile-l">{l}</span></div>
                ))}
              </div>

              <Card title={tr('Health by kind of check')} hint={tr('Share of checks that passed across all feeds. Select a bar to see those checks that failed.')} >
                <div className="fq-dims">
                  {DIMENSIONS.map(([name, test]) => {
                    const mine = all.filter(test)
                    const ok = mine.filter((r) => r.success).length
                    const share = mine.length ? (ok / mine.length) * 100 : 100
                    return (
                      <button key={name} type="button" className="fq-dim" onClick={() => { setResult(ok < mine.length ? 'failed' : ''); setTab('checks') }} aria-label={`${name}: ${ok} of ${mine.length} passed`}>
                        <span className="fq-dim-n">{name}</span>
                        <span className="fq-bar big"><i style={{ width: `${share}%`, background: share === 100 ? '#1a7a4a' : share >= 80 ? '#b45309' : '#b91c1c' }} /></span>
                        <span className="fq-dim-v">{ok}/{mine.length}</span>
                      </button>
                    )
                  })}
                </div>
              </Card>

              <div className="fq-feeds" role="list">
                {feeds.map(([k, f]) => {
                  const share = f.expectations ? (f.passed / f.expectations) * 100 : 0
                  const moved = f.previous_status && f.previous_status !== f.status
                  return (
                    <button key={k} role="listitem" type="button" className={`fq-feed ${CLS[f.status]}${feed === k ? ' active' : ''}`} aria-pressed={feed === k} onClick={() => { if (feed === k) setFeed(''); else go({ feed: k, tab: 'checks' }) }}>
                      <Ring value={share} color={RING[f.status]} />
                      <span className="fq-feed-body">
                        <strong>{f.name}</strong>
                        <Badge tone={STATUS[f.status][1]}>{STATUS[f.status][0]}</Badge>
                        <span className="lin-meta">{tr('{passed} of {expectations} checks · {records} records', { passed: f.passed, expectations: f.expectations, records: f.records.toLocaleString('en-IN') })}</span>
                        {(f.critical_failed > 0 || f.advisory_failed > 0) && <span className="lin-meta">{f.critical_failed > 0 ? `${f.critical_failed} must-hold failed` : ''}{f.critical_failed > 0 && f.advisory_failed > 0 ? ' · ' : ''}{f.advisory_failed > 0 ? `${f.advisory_failed} to chase` : ''}</span>}
                        <Spark values={data.trend?.[k]} label={tr('{name} pass rate', { name: f.name })} />
                        {moved && <span className="fq-delta">{tr('Was: {v}', { v: STATUS[f.previous_status]?.[0].toLowerCase() })}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>

              <Card title={tr('Earlier runs')} hint={tr('Each run is kept, so a feed that gets worse is visible.')} flush>
                {hist.data?.items && (
                  <table className="mdm-table">
                    <thead><tr><th>{tr('Run')}</th><th>{tr('When')}</th><th>{tr('Started by')}</th><th>{tr('Passed')}</th><th>{tr('Warnings')}</th><th>{tr('Failed')}</th></tr></thead>
                    <tbody>
                      {hist.data.items.map((h) => (
                        <tr key={h.id}><td>{h.id}</td><td>{fmtTime(h.finished_at || h.started_at)}</td><td>{h.trigger === 'JOB' ? tr('Scheduled job') : h.actor}</td>
                          <td>{h.summary?.totals?.pass ?? '—'}</td><td>{h.summary?.totals?.warn ?? '—'}</td><td>{h.summary?.totals?.fail ?? '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          )}

          {tab === 'received' && <FeedQualityRange results={all} feeds={feeds.map(([k, f]) => [k, f.name])} tick={tick} feed={feed} setFeed={setFeed} />}

          {tab === 'checks' && (
            <>
              <h2 className="dxk-h2 fq-sec">{tr('Latest run, check by check')}</h2>
              <p className="fq-tab-intro">{tr('What failed in the last run, whatever date the records arrived. Select a check to see why it failed, the records and values behind it, and who to contact.')}</p>
              <DataTable rows={rows} rowKey="id" pageSize={15} onRowClick={(r) => { setMore(false); setSel(r) }} initialSort={{ key: "success", dir: "asc" }} csv={{ name: "feed-quality" }}
                search={{ placeholder: 'Search a check, field or feed', text: (r) => `${r.source} ${r.description} ${r.column_name} ${r.expectation}` }}
                canClear={!!(feed || result || sev)} onClear={() => { setFeed(''); setResult(''); setSev('') }}
                filters={<>
                  <FilterSelect label={tr('Feed')} value={feed} onChange={setFeed} options={feeds.map(([k, f]) => [k, f.name])} />
                  <Segmented label={tr('Result')} value={result} onChange={setResult} options={[{ value: '', label: 'All', count: all.length }, { value: 'failed', label: 'Failed', count: failedAll.length }, { value: 'passed', label: 'Passed' }]} />
                  <FilterSelect label={tr('Importance')} value={sev} onChange={setSev} options={Object.entries(SEV).map(([k, v]) => [k, v[0]])} />
                </>}
                empty={tr('No checks match')} emptyHint={tr('Clear a filter to see more.')}
                columns={[
                  { key: 'source', label: 'Feed', render: (r) => data.summary.feeds[r.source]?.name || r.source, sort: (r) => r.source },
                  { key: 'description', label: 'Check', render: (r) => <>{r.description}<div className="lin-meta">{expName(r.expectation)}{r.column_name ? ` · ${r.column_name}` : ''}</div></> },
                  { key: 'severity', label: 'Importance', render: (r) => <Badge tone={SEV[r.severity]?.[1]}>{SEV[r.severity]?.[0] || r.severity}</Badge> },
                  { key: 'success', label: 'Result', render: (r) => <Badge tone={r.success ? 'ok' : SEV[r.severity]?.[1] || 'warn'}>{r.success ? 'Passed' : 'Failed'}</Badge>, sort: (r) => (r.success ? 1 : 0) },
                  { key: 'unexpected_count', label: 'Records affected', align: 'num', render: (r) => (r.unexpected_count != null ? `${r.unexpected_count.toLocaleString('en-IN')} (${pct(r.unexpected_percent)})` : '—'), sort: (r) => r.unexpected_count },
                ]} />
            </>
          )}

          {tab === 'settings' && (
            <>
              <p className="fq-tab-intro">{tr('How the checks are set up: the rules that apply to every feed, and who to contact in each department when a check fails.')}</p>
              <FeedQualityRules onSaved={() => setTick((x) => x + 1)} />
              <FeedQualityContacts onSaved={() => setTick((x) => x + 1)} />
            </>
          )}
        </>
      )}

      <Drawer open={!!sel} onClose={() => { setSel(null); setMore(false); setCopied(false) }} title={tr('Check details')} subtitle={sel ? `${data.summary.feeds[sel.source]?.name || sel.source} · ${sel.success ? tr('passed') : tr('failed')}` : ''}>
        {sel && (
          <>
            {failedAll.length > 0 && (
              <div className="fq-nav">
                <button type="button" className="btn-secondary small" disabled={idx <= 0} onClick={() => step(-1)} aria-label={tr('Previous failed check')}>{tr('◀ Previous')}</button>
                <span className="fq-nav-pos">{idx >= 0 ? `Failed check ${idx + 1} of ${failedAll.length}` : `${failedAll.length} failed checks`}</span>
                <button type="button" className="btn-secondary small" disabled={idx < 0 || idx >= failedAll.length - 1} onClick={() => step(1)} aria-label={tr('Next failed check')}>{tr('Next ▶')}</button>
                <span className="spacer" />
                {!sel.success && <button type="button" className="btn-secondary small" onClick={copyMessage}>{copied ? 'Copied ✓' : 'Copy message for the department'}</button>}
              </div>
            )}
            <Facts items={[['Check', sel.description], ['Field', sel.column_name || tr('whole feed')], ['Importance', SEV[sel.severity]?.[0]], ['Records looked at', sel.element_count?.toLocaleString('en-IN')],
              ['Records affected', sel.unexpected_count != null ? `${sel.unexpected_count.toLocaleString('en-IN')} (${pct(sel.unexpected_percent)})` : undefined], ['Great Expectations rule', expName(sel.expectation)]]} />
            {sel.explain ? <Reasons r={sel} contact={data.contacts?.[sel.source]} more={more} onMore={() => setMore(true)} /> : <p className="mdm-note">{tr('This check passed.')}</p>}
          </>
        )}
      </Drawer>
    </div>
  )
}
