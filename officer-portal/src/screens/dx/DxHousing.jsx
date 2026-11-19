import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMdm } from '../mdm/shared'
import { Card, Banner, Segmented, EmptyState } from './dxKit'
import { tr } from '../../i18n/lang'

const OUTCOMES = [
  ['answered', 'ANSWERED', 'Answered'],
  ['no_consent', 'DENIED_NO_CONSENT', 'Not answered: no consent'],
  ['denied_policy', 'DENIED_POLICY', 'Not answered: policy'],
  ['expired', 'EXPIRED_SOURCE', 'Certificate expired'],
  ['conflict', 'CONFLICT', 'Sources disagree'],
  ['no_record', 'NO_RECORD', 'No record'],
]

const OPEN = [
  ['DUPLICATE_BENEFIT', 'Duplicate housing benefit'],
  ['CARD_DEAD_ACTIVE', 'Deceased still on ration card'],
  ['HOUSEHOLD_CONFLICT', 'Household records disagree'],
  ['NO_HOUSEHOLD', 'No household on record'],
]

/** Housing row: household eligibility checks by outcome over the last N days. Counts only. Each number opens the ledger or work queue. */
export default function DxHousing({ days: initialDays = 7 }) {
  const [days, setDays] = useState(initialDays)
  const { data, error, loading, reload } = useMdm('/x/housing/outcomes', { days }, [days])

  if (error && !data) {
    return (
      <Card flush>
        <EmptyState title={tr('Could not load housing checks')} hint={error}
          action={<button type="button" className="btn-secondary" onClick={reload}>{tr('Retry')}</button>} />
      </Card>
    )
  }
  if (loading && !data) {
    return <Card flush><p className="dxk-muted" role="status" style={{ margin: '12px' }}>{tr('Loading…')}</p></Card>
  }
  if (!data) return null

  const filt = (key) => {
    const f = data.ledger_filters?.[key]
    if (!f) return '/dx/ledger'
    const q = new URLSearchParams({ kind: f.kind || 'VERIFY', outcome: f.outcome || '', q: f.q || data.purpose || 'HOUSEHOLD_BENEFIT' })
    return `/dx/ledger?${q.toString()}`
  }
  const empty = !(data.total > 0) && !(Object.values(data.open_items || {}).some((n) => n > 0)) && !(data.duplicates_found > 0)

  return (
    <Card flush>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 12px 0' }}>
        <span className="dxk-main">{tr('Housing: household checks')}</span>
        <div className="dxk-filter"><span>{tr('Last')}</span>
          <Segmented label={tr('Days')} value={String(days)} onChange={(v) => setDays(Number(v))}
            options={[{ value: '7', label: tr('7 days') }, { value: '30', label: tr('30 days') }]} />
        </div>
      </div>
      {error && <div style={{ padding: '0 12px' }}><Banner tone="bad">{error} <button type="button" className="dxk-link" onClick={reload}>{tr('Retry')}</button></Banner></div>}
      {empty ? (
        <EmptyState title={tr('No housing checks in this period')} hint={tr('Counts only. No household value is shown here.')} />
      ) : (
        <div className="dxk-table-wrap">
          <table className="mdm-table dxk-table" aria-label={tr('Housing: household checks')} data-testid="housing-row">
            <thead>
              <tr>
                <th>{tr('Housing: household checks')}</th>
                {OUTCOMES.map(([, , label]) => <th key={label} className="num">{tr(label)}</th>)}
                <th className="num">{tr('Duplicates found')}</th>
                {OPEN.map(([, label]) => <th key={label} className="num">{tr('Open: {what}', { what: tr(label) })}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="dxk-main">{tr('Last {n} days', { n: data.days || days })}</span></td>
                {OUTCOMES.map(([key]) => {
                  const n = data.by_outcome?.[key] ?? data[key] ?? 0
                  return (
                    <td key={key} className="num">
                      {n ? <Link className="dxk-main" to={filt(key)} style={{ textDecoration: 'underline' }}>{n.toLocaleString('en-IN')}</Link> : <span className="dxk-muted">0</span>}
                    </td>
                  )
                })}
                <td className="num">
                  {(data.duplicates_found || 0)
                    ? <span className="dxk-main">{(data.duplicates_found || 0).toLocaleString('en-IN')}</span>
                    : <span className="dxk-muted">0</span>}
                </td>
                {OPEN.map(([code]) => {
                  const n = data.open_items?.[code] || 0
                  return (
                    <td key={code} className="num">
                      {n ? <Link className="dxk-main" to={`/dx/work/${code}`} style={{ textDecoration: 'underline' }}>{n.toLocaleString('en-IN')}</Link> : <span className="dxk-muted">0</span>}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="dxk-muted" style={{ margin: '8px 12px' }}>{tr('Counts only. No household value is shown here.')}</p>
    </Card>
  )
}
