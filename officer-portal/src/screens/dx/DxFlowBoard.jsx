import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMdm, Status } from '../mdm/shared'
import { PageHeader, Card, Drawer, Banner } from './dxKit'
import { tr } from '../../i18n/lang'
import { departmentLabel, isDeptOfficerRole, isAdminRole } from '../../auth'
import { DailyChecks, EducationOutcomes } from './DxDaily'
import DxHousing from './DxHousing'

function Num({ n, to, warn, bad }) {
  const cls = bad ? 'dxk-bad' : warn ? 'dxk-muted' : 'dxk-main'
  if (!to) return <span className={cls}>{n?.toLocaleString?.('en-IN') ?? n}</span>
  return <Link className={cls} to={to} style={{ textDecoration: 'underline' }}>{n?.toLocaleString?.('en-IN') ?? n}</Link>
}

const IDENTITY_REASONS = 'LINK_NEAR,LINK_AMBIGUOUS,LINK_LOW_SEPARATE,SOURCE_CONFLICT'
const IDENTITY_LINKS = [
  ['LINK_NEAR', 'Probably the same person'],
  ['LINK_AMBIGUOUS', 'More than one possible person'],
  ['LINK_LOW_SEPARATE', 'Unlikely to be the same person'],
  ['SOURCE_CONFLICT', 'Two departments disagree'],
]
const IDENTITY_DEF_LABELS = {
  'identity.received_24h': 'Identity linkage: received',
  'identity.linked_automatically': 'Identity linkage: linked automatically',
  'identity.in_review': 'Identity linkage: in review',
  'identity.decided_today': 'Identity linkage: decided today',
  'identity.oldest_waiting_hours': 'Identity linkage: oldest waiting',
  'identity.on_time_pct': 'Identity linkage: on time',
}

/** Flow board: one row per department, counts that open the Work queue or Notices. */
export default function DxFlowBoard() {
  const nav = useNavigate()
  const [tick, setTick] = useState(0)
  const [help, setHelp] = useState(false)
  const [updated, setUpdated] = useState(new Date())
  const { data, error, loading, reload } = useMdm('/x/flow-board', undefined, [tick])

  useEffect(() => {
    const id = setInterval(() => { setTick((n) => n + 1); setUpdated(new Date()) }, 30000)
    return () => clearInterval(id)
  }, [])

  const allRows = data?.rows || []
  // The steward's own row ("Identity linkage (MDM)") has its own table; the departments follow.
  const identityRow = allRows.find((r) => r.kind === 'IDENTITY' || (r.system === 'mdm' && r.in_review != null))
  const identity = data?.identity || identityRow || null
  const rows = allRows.filter((r) => r !== identityRow && r.kind !== 'IDENTITY')
  const totals = data?.totals
  const defs = data?.definitions || {}
  const officerRole = localStorage.getItem('officer_role')
  const deptName = departmentLabel(officerRole)
  const deptOnly = isDeptOfficerRole(officerRole)

  return (
    <div className="mdm-hub">
      <PageHeader icon="🗼" title={deptName ? `${tr('Flow board')} · ${tr(deptName)}` : tr('Flow board')}
        subtitle={deptName
          ? tr('What {dept} has received, delivered, is waiting on citizens for, and needs a person for.', { dept: tr(deptName) })
          : tr('What each department has received, delivered, is waiting on citizens for, and needs a person for.')}
        actions={<>
          <button type="button" className="btn-secondary small" onClick={() => setHelp(true)}>{tr('What the numbers mean')}</button>
          <button type="button" className="btn-secondary small" onClick={() => { reload(); setUpdated(new Date()) }}>{tr('Refresh')}</button>
        </>} />
      <p className="dxk-muted" style={{ marginTop: 0 }}>{tr('Last updated')} {updated.toLocaleTimeString()}</p>
      <Status loading={loading && !data} error={error} />
      {!loading && !rows.length && !identity && <Banner>{tr('No department activity yet. Seed a volume day to fill the board.')}</Banner>}
      {identity && (
        <Card flush>
          <div className="dxk-table-wrap">
            <table className="mdm-table dxk-table" aria-label={tr('Identity linkage (MDM)')}>
              <thead>
                <tr>
                  <th>{tr('Identity linkage (MDM)')}</th>
                  <th className="num">{tr('Received')}</th>
                  <th className="num">{tr('Linked automatically')}</th>
                  <th className="num">{tr('In review')}</th>
                  <th className="num">{tr('Decided today')}</th>
                  <th className="num">{tr('Oldest waiting')}</th>
                  <th className="num">{tr('On time')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className={identity.overdue ? 'dx-off' : ''} data-testid="identity-row">
                  <td><span className="dxk-main">{tr('Identity linkage (MDM)')}</span>{identity.overdue ? <span className="dxk-bad"> · {tr('Overdue')}</span> : null}</td>
                  <td className="num"><Num n={identity.received_24h ?? 0} /></td>
                  <td className="num"><Num n={identity.linked_automatically ?? 0} /></td>
                  <td className="num"><Num n={identity.in_review ?? 0} to={`/dx/work?reasons=${IDENTITY_REASONS}`} warn={!!identity.in_review} bad={!!identity.overdue} /></td>
                  <td className="num"><Num n={identity.decided_today ?? 0} /></td>
                  <td className="num">{identity.oldest_waiting_hours ? `${identity.oldest_waiting_hours}h` : '—'}</td>
                  <td className="num">{identity.on_time_pct ?? 100}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="dxk-muted" style={{ margin: '8px 12px' }}>
            {tr('Open the work for')}{' '}
            {IDENTITY_LINKS.map(([code, label], i) => (
              <span key={code}>{i > 0 ? ' · ' : ''}<Link to={`/dx/work/${code}`}>{tr(label)}</Link></span>
            ))}
          </p>
        </Card>
      )}
      {!!rows.length && (
        <Card flush>
          <div className="dxk-table-wrap">
            <table className="mdm-table dxk-table">
              <thead>
                <tr>
                  <th>{tr('Department')}</th>
                  <th className="num">{tr('Received')}</th>
                  <th className="num">{tr('Delivered')}</th>
                  <th className="num">{tr('Waiting for the citizen')}</th>
                  <th className="num">{tr('Retrying')}</th>
                  <th className="num">{tr('Failed')}</th>
                  <th className="num">{tr('Stopped')}</th>
                  <th className="num">{tr('Needs a person')}</th>
                  <th className="num">{tr('Routine')}</th>
                  <th className="num">{tr('Decision')}</th>
                  <th className="num">{tr('Oldest waiting')}</th>
                  <th className="num">{tr('On time')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.system} className={r.overdue || r.failed ? 'dx-off' : ''}>
                    <td><span className="dxk-main">{r.name}</span>{r.overdue ? <span className="dxk-bad"> · {tr('Overdue')}</span> : null}</td>
                    <td className="num"><Num n={r.received_24h} /></td>
                    <td className="num"><Num n={r.delivered} /></td>
                    <td className="num"><Num n={r.waiting_citizen} to="/dx/notices" warn={!!r.waiting_citizen} /></td>
                    <td className="num"><Num n={r.retrying} to="/dx/notices" warn={!!r.retrying} /></td>
                    <td className="num"><Num n={r.failed} to="/dx/notices" bad={!!r.failed} /></td>
                    <td className="num"><Num n={r.stopped} to="/dx/notices" warn={!!r.stopped} /></td>
                    <td className="num">
                      <Num n={r.needs_person} to={`/dx/work?system=${encodeURIComponent(r.system)}`} warn={!!r.needs_person} bad={!!r.overdue} />
                    </td>
                    <td className="num">
                      <Num n={r.routine} to={`/dx/work?system=${encodeURIComponent(r.system)}&risk_class=B`} warn={!!r.routine} />
                    </td>
                    <td className="num">
                      <Num n={r.decision} to={`/dx/work?system=${encodeURIComponent(r.system)}&risk_class=C`} warn={!!r.decision} bad={!!r.decision} />
                    </td>
                    <td className="num">{r.oldest_waiting_hours ? `${r.oldest_waiting_hours}h` : '—'}</td>
                    <td className="num">{r.on_time_pct}%</td>
                  </tr>
                ))}
                {totals && (
                  <tr>
                    <td><strong>{tr('All departments')}</strong></td>
                    <td className="num"><strong>{totals.received_24h}</strong></td>
                    <td className="num"><strong>{totals.delivered}</strong></td>
                    <td className="num"><strong>{totals.waiting_citizen}</strong></td>
                    <td className="num"><strong>{totals.retrying}</strong></td>
                    <td className="num"><strong>{totals.failed}</strong></td>
                    <td className="num"><strong>{totals.stopped}</strong></td>
                    <td className="num"><strong><Link to="/dx/work">{totals.needs_person}</Link></strong></td>
                    <td className="num"><strong><Link to="/dx/work?risk_class=B">{totals.routine}</Link></strong></td>
                    <td className="num"><strong><Link to="/dx/work?risk_class=C">{totals.decision}</Link></strong></td>
                    <td className="num"><strong>{totals.oldest_waiting_hours ? `${totals.oldest_waiting_hours}h` : '—'}</strong></td>
                    <td className="num"><strong>{totals.on_time_pct}%</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {!deptOnly && <EducationOutcomes />}
      {!deptOnly && <DxHousing />}
      {isAdminRole(officerRole) && <DailyChecks />}
      <Drawer open={help} onClose={() => setHelp(false)} title={tr('What the numbers mean')}>
        <ul>
          {Object.entries(defs).map(([k, v]) => (
            <li key={k}><strong>{IDENTITY_DEF_LABELS[k] ? tr(IDENTITY_DEF_LABELS[k]) : tr(k)}</strong>: {tr(v)}</li>
          ))}
        </ul>
        <button type="button" className="btn-secondary" onClick={() => nav('/dx/control?tab=overview')}>{tr('Open the overview')}</button>
      </Drawer>
    </div>
  )
}
