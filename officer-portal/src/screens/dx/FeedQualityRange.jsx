import { useEffect, useMemo, useState } from 'react'
import { mdm, mdmDownload } from '../../mdmApi'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Card, Collapse, DataTable, FilterSelect, Segmented, DateRange, Stats, Banner, Drawer, Facts } from './dxKit'
import Reasons from './QualityReasons'
import { fmtTime } from './dxShared'
import { DayChart, RuleBars } from './QualityCharts'
import { tr } from '../../i18n/lang'

const OUT = { passed: ['Passed', 'ok'], failed: ['Failed', 'bad'] }
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - (n - 1)); return iso(d) }
const QUICK = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['60', 'Last 60 days']]

export default function FeedQualityRange({ results, feeds, tick, feed = '', setFeed = () => {} }) {
  const [from, setFrom] = useState(back(30))
  const [to, setTo] = useState(iso(new Date()))
  const [rule, setRule] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [t2, setT2] = useState(0)
  const [drill, setDrill] = useState(null)
  const [detail, setDetail] = useState(null)
  const [dErr, setDErr] = useState('')
  const [district, setDistrict] = useState('')
  const [districts, setDistricts] = useState([])
  const [more, setMore] = useState(false)
  const span = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1
  const short = span >= 1 && span <= 7
  useEffect(() => {
    if (!drill || !short) { setDetail(null); return undefined }
    let live = true
    setDetail(null); setDErr('')
    mdm('/x/quality/range/detail', { params: { source: drill.source, rule: drill.rule_key, date_from: from, date_to: to, district } })
      .then((d) => { if (live) { setDetail(d); if (!district) setDistricts((d.found?.districts || []).map((x) => x.label)) } }).catch((e) => { if (live) setDErr(e.message) })
    return () => { live = false }
  }, [drill, from, to, district, short])
  const openRule = (r) => { if (r.scope === 'feed') return; setDistrict(''); setDistricts([]); setMore(false); setDrill(r) }
  const pickDay = (d) => { setFrom(d); setTo(d) }
  const last7 = () => { setFrom(back(7)); setTo(iso(new Date())) }
  const quick = QUICK.find(([n]) => back(+n) === from && to === iso(new Date()))?.[0] || 'custom'
  const { data, error, loading } = useMdm('/x/quality/range', { date_from: from, date_to: to, source: feed, rule }, [tick, t2])
  const ruleOptions = useMemo(() => {
    const m = new Map()
    results.forEach((r) => { if (r.rule_key && r.scope !== 'feed' && !m.has(r.rule_key)) m.set(r.rule_key, r.rule_key.startsWith('complete:') ? `Field filled in: ${r.column_name}` : r.description.replace(/\d+%/g, 'N%')) })
    return [...m.entries()]
  }, [results])

  const download = async (kind) => {
    setBusy(kind); setMsg(null)
    try { const n = await mdmDownload('/x/quality/range.csv', { kind, date_from: from, date_to: to, source: feed, rule }); setMsg({ tone: 'info', text: `Saved ${n}` }) } catch (e) { setMsg({ tone: 'warn', text: e.message }) }
    setBusy('')
  }
  const chase = async () => {
    setBusy('chase'); setMsg(null)
    try { const n = await mdmDownload('/x/quality/range/chase.csv', { date_from: from, date_to: to, source: feed, rule }); setMsg({ tone: 'info', text: `Saved ${n}` }) } catch (e) { setMsg({ tone: 'warn', text: e.message }) }
    setBusy('')
  }
  const demo = async () => {
    setBusy('demo'); setMsg(null)
    try { const r = await mdm('/x/quality/demo-history', { method: 'POST', params: { days: 60 } }); setMsg({ tone: 'info', text: `Received dates spread over the last ${r.days} days for ${r.records.toLocaleString('en-IN')} demo records. Select “Run checks now” to count them by day.` }) } catch (e) { setMsg({ tone: 'warn', text: e.message }) }
    setBusy('')
  }

  const rules = data?.rules || []
  const rec = rules.filter((r) => r.scope === 'record')
  const worst = rec.filter((r) => r.failed > 0).sort((a, b) => b.percent_failed - a.percent_failed).slice(0, 6)
  const tl = data?.tiles
  const rangeLabel = data ? `${data.from} to ${data.to}` : ''

  return (
    <Card title={tr('Records received')} hint={tr('What came in during a period, judged by today’s rules. Counts only: no person’s details appear here or in the downloads.')}
      actions={<>
        <button type="button" className="btn-secondary small" onClick={() => download('summary')} disabled={!!busy || !data?.has_daily}>{busy === 'summary' ? 'Preparing…' : '⬇ Summary by rule (CSV)'}</button>
        <button type="button" className="btn-secondary small" onClick={() => download('daily')} disabled={!!busy || !data?.has_daily}>{busy === 'daily' ? 'Preparing…' : '⬇ Day by day (CSV)'}</button>
        <button type="button" className="btn-secondary small" onClick={chase} disabled={!!busy || !data?.has_daily || !short} title={short ? 'One row per failing record, with the value found and who to contact' : 'Choose 7 days or fewer to list the records'}>{busy === 'chase' ? 'Preparing…' : '⬇ Records to chase (CSV)'}</button>
      </>}>
      <div className="fq-range-filters">
        <Segmented label={tr('Period')} value={quick} onChange={(v) => { if (v !== 'custom') { setFrom(back(+v)); setTo(iso(new Date())) } }}
          options={[...QUICK.map(([v, l]) => ({ value: v, label: l })), { value: 'custom', label: 'Custom' }]} />
        <DateRange label={tr('Received between')} from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <FilterSelect label={tr('Feed')} value={feed} onChange={setFeed} options={feeds} />
        <FilterSelect label={tr('Check')} value={rule} onChange={setRule} options={ruleOptions} />
      </div>
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
      <Status loading={loading && !data} error={error} />
      {data && !data.has_daily && <Banner tone="info">{tr('Counts by day are recorded from the next run. Select “Run checks now” to produce them for the records already in the system.')}</Banner>}
      {data?.has_daily && (
        <>
          <p className="fq-range-meta">{tr('Based on run {id} ({v}) · rule settings version {rule_version} · records received {from} to {to}', { id: data.run.id, v: fmtTime(data.run.finished_at), rule_version: data.run.rule_version, from: data.available.from, to: data.available.to })}</p>
          <Stats items={[
            { label: 'Records received', value: tl.records.toLocaleString('en-IN'), hint: rangeLabel },
            { label: 'Feeds with records', value: tl.feeds },
            { label: 'Checks that failed', value: `${tl.rules_failed} of ${tl.rules_checked}`, tone: tl.rules_failed ? 'warn' : 'ok', hint: 'a check fails when more records break it than it allows' },
            { label: 'Share of record checks failed', value: tl.checks ? `${((100 * tl.failed_checks) / tl.checks).toFixed(1)}%` : '—', hint: `${tl.failed_checks.toLocaleString('en-IN')} of ${tl.checks.toLocaleString('en-IN')}` },
          ]} />
          <FeedSummary data={data} feed={feed} onFeed={setFeed} />
          <div className="fq-charts">
            <DayChart title={tr('Records received each day')} days={data.days} value={(d) => d.records} onPick={pickDay} />
            <DayChart title={tr('Share of record checks failed each day')} days={data.days} value={(d) => d.percent_failed || 0} unit="%" kind="line" format={(v) => (+v).toFixed(v < 10 ? 1 : 0)}
              reference={data.allowed_percent} referenceLabel={`What the rules allow (${data.allowed_percent}%)`} flag={(d) => (d.percent_failed || 0) > (data.allowed_percent ?? Infinity)} flagLabel="Day above what the rules allow" onPick={pickDay} />
            <RuleBars title={tr('Checks that failed most')} rows={worst} />
          </div>
          <p className="fq-tab-intro">{short ? 'Select a check to see the records behind it, with their values.' : 'To see the records themselves, narrow the dates to 7 days or fewer, or select a day on a chart.'}</p>
          <DataTable onRowClick={openRule} rows={rules.map((r) => ({ ...r, id: `${r.source}-${r.rule_key}` }))} rowKey="id" pageSize={15} csv={{ name: 'feed-quality-range' }} initialSort={{ key: 'percent_failed', dir: 'desc' }}
            search={{ placeholder: 'Search a feed or check', text: (r) => `${r.feed} ${r.description}` }} empty={tr('No checks match')} emptyHint={tr('Change the feed or check filter.')}
            columns={[
              { key: 'feed', label: 'Feed', render: (r) => r.feed, sort: (r) => r.feed },
              { key: 'description', label: 'Check', render: (r) => <>{r.description}{r.scope === 'feed' && <div className="lin-meta">{tr('Judged on the whole feed, not record by record')}</div>}</> },
              { key: 'severity', label: 'Importance', render: (r) => <Badge tone={r.severity === 'critical' ? 'bad' : 'warn'}>{r.severity === 'critical' ? 'Must hold' : 'Worth chasing'}</Badge> },
              { key: 'checked', label: 'Records checked', align: 'num', render: (r) => (r.checked === null ? '—' : r.checked.toLocaleString('en-IN')), sort: (r) => r.checked ?? -1 },
              { key: 'passed', label: 'Passed', align: 'num', render: (r) => (r.passed === null ? '—' : r.passed.toLocaleString('en-IN')), sort: (r) => r.passed ?? -1 },
              { key: 'failed', label: 'Failed', align: 'num', render: (r) => (r.failed === null ? '—' : r.failed.toLocaleString('en-IN')), sort: (r) => r.failed ?? -1 },
              { key: 'percent_failed', label: '% failed (allowed)', align: 'num', render: (r) => (r.percent_failed === null ? '—' : `${r.percent_failed}% (${r.tolerance}%)`), sort: (r) => r.percent_failed ?? -1 },
              { key: 'outcome', label: 'Result', render: (r) => (r.outcome ? <Badge tone={r.outcome === 'passed' ? 'ok' : r.severity === 'critical' ? 'bad' : 'warn'}>{OUT[r.outcome][0]}</Badge> : <span className="lin-meta">{tr('No records')}</span>), sort: (r) => r.outcome || 'z' },
            ]} />
        </>
      )}
      <Drawer open={!!drill} onClose={() => setDrill(null)} title={tr('Records behind this check')} subtitle={drill ? `${drill.feed} · ${from === to ? from : `${from} to ${to}`}` : ''}>
        {drill && !short && (
          <>
            <Banner tone="info">{tr('Values are shown for windows of 7 days or fewer. The window is now {span} days.', { span })}</Banner>
            <button type="button" className="btn-primary" onClick={last7}>{tr('Use the last 7 days')}</button>
          </>
        )}
        {drill && short && (
          <>
            <Facts items={[['Check', drill.description], ['Window', `${from}${from === to ? '' : ` to ${to}`}`], ['Records received in the window', detail?.checked?.toLocaleString('en-IN')],
              ['Records that failed', detail ? `${detail.failed.toLocaleString('en-IN')}${detail.checked ? ` (${((100 * detail.failed) / detail.checked).toFixed(1)}%)` : ''}` : undefined]]} />
            {districts.length > 1 && <div className="fq-drill-filter"><FilterSelect label={tr('District')} value={district} onChange={(v) => { setDistrict(v); setMore(false) }} options={districts} /></div>}
            <Status loading={!detail && !dErr} error={dErr} />
            {detail && !detail.failed && <p className="mdm-note">{tr('No record received in this window failed this check{v}.', { v: district ? ` in ${district}` : '' })}</p>}
            {detail?.failed > 0 && <Reasons r={detail} contact={detail.contact} more={more} onMore={() => setMore(true)} />}
            {detail && <p className="mdm-note">{tr('Opening this list is recorded in the audit log.')}</p>}
          </>
        )}
      </Drawer>

      <Collapse title={tr('Demo data helper')} summary={tr('Synthetic data only. Spreads the received dates over the last 60 days so a date range and a trend can be shown.')} id="fq-demo">
        <p className="mdm-note">{tr('The demo records all arrived in one load, so they share one received date. This sets their received dates across the last 60 days using a fixed pattern. It changes no other field, and is recorded in the audit log. Not for use with real department data.')}</p>
        <button type="button" className="btn-secondary small" onClick={demo} disabled={!!busy}>{busy === 'demo' ? 'Working…' : 'Spread demo received dates'}</button>
      </Collapse>
    </Card>
  )
}


const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const sign = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}%`)

/** What a feed (or every feed) sent in the window: how much, against the previous period, and the days it sent nothing. */
function FeedSummary({ data, feed, onFeed }) {
  const list = data.feed_summary || []
  if (!list.length) return null
  const f = list.find((x) => x.source === feed)
  if (f) {
    return (
      <div className="fq-fsum">
        <Stats items={[
          { label: `Received from ${f.feed}`, value: f.records.toLocaleString('en-IN'), hint: f.change_percent === null ? `no earlier ${f.window_days} days to compare` : `${sign(f.change_percent)} on the previous ${f.window_days} days (${f.previous_records.toLocaleString('en-IN')})` },
          { label: 'Days with records', value: `${f.active_days} of ${f.window_days}`, hint: `about ${f.average_per_day} a day` },
          { label: 'Busiest day', value: f.busiest_day ? dayLabel(f.busiest_day.day) : '—', hint: f.busiest_day ? `${f.busiest_day.records.toLocaleString('en-IN')} records` : undefined },
          { label: 'Days with nothing received', value: f.silent_days.length, tone: f.silent_days.length ? 'warn' : 'ok', hint: 'weekdays, for a feed expected daily' },
        ]} />
        {f.silent_days.length > 0 && <Banner tone="warn">{tr('Nothing was received from {feed} on: {v}. Ask the department whether the feed was paused.', { feed: f.feed, v: f.silent_days.map(dayLabel).join(', ') })}</Banner>}
      </div>
    )
  }
  return (
    <DataTable rows={list.map((x) => ({ ...x, id: x.source }))} rowKey="id" pageSize={10} pageSizes={[10]} onRowClick={(r) => onFeed(r.source)} initialSort={{ key: 'records', dir: 'desc' }}
      empty={tr('No feed sent records in this window')} columns={[
        { key: 'feed', label: 'Feed (select to focus)', render: (r) => r.feed, sort: (r) => r.feed },
        { key: 'records', label: 'Received', align: 'num', render: (r) => r.records.toLocaleString('en-IN'), sort: (r) => r.records },
        { key: 'change_percent', label: 'On the previous period', align: 'num', render: (r) => sign(r.change_percent), sort: (r) => r.change_percent ?? -999 },
        { key: 'active_days', label: 'Days with records', align: 'num', render: (r) => `${r.active_days} of ${r.window_days}`, sort: (r) => r.active_days },
        { key: 'silent', label: 'Days with nothing', align: 'num', render: (r) => (r.silent_days.length ? <Badge tone="warn">{r.silent_days.length}</Badge> : 0), sort: (r) => r.silent_days.length },
        { key: 'failed_checks', label: 'Checks failed', align: 'num', render: (r) => r.failed_checks, sort: (r) => r.failed_checks },
      ]} />
  )
}
