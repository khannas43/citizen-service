import { useNavigate } from 'react-router-dom'
import { useMdm, Status, Badge } from '../mdm/shared'
import { Tag, CONSENT, OUTCOME, fmtTime } from './dxShared'

/** On the person screen: the identity link, the consents this person has given or been asked for, and who has asked about them. */
export default function ExchangePanel({ id }) {
  const nav = useNavigate()
  const { data, error, loading } = useMdm(`/x/persons/${id}/exchange`, undefined, [id])
  if (!data) return <Status loading={loading} error={error} />
  const { identity: idn, consents, exchanges } = data
  return (
    <section className="mdm-card">
      <h3>Identity link and consent</h3>
      <h4>Identity reference</h4>
      {idn.linked ? (
        <ul className="mdm-plain">
          {idn.tokens.map((t) => (
            <li key={t.token}><code>{t.token}</code> {t.assurance && <Badge tone={t.assurance === 'HIGH' ? 'ok' : 'info'}>{t.assurance.toLowerCase()} assurance</Badge>}
              <span className="mdm-sub"> · {t.basis || 'linked'}{t.score != null ? ` · strength ${Math.round(t.score * 100)}%` : ''}</span></li>
          ))}
        </ul>
      ) : <p className="mdm-note">{idn.note}</p>}
      {idn.linked && <p className="mdm-sub">{idn.note}</p>}
      <h4>Consent</h4>
      {consents.length ? (
        <ul className="mdm-plain">
          {consents.map((c) => (
            <li key={c.id}><Tag map={CONSENT} value={c.status} /> {c.purpose_name} <span className="mdm-sub">· {c.system_name}</span>{' '}
              <button type="button" className="mdm-link" onClick={() => nav(`/dx/consent`)}>Open consent screen</button></li>
          ))}
        </ul>
      ) : <p className="mdm-note">No consent has been asked of, or given by, this person.</p>}
      <h4>Who has asked about this person</h4>
      {exchanges.length ? (
        <ul className="mdm-plain">
          {exchanges.map((x) => <li key={x.id}>{fmtTime(x.ts)} · {x.requester} · {x.question || x.kind.toLowerCase()} · <Tag map={OUTCOME} value={x.outcome} /></li>)}
        </ul>
      ) : <p className="mdm-note">Nobody has asked yet.</p>}
      <div className="mdm-actions">
        <button type="button" className="mdm-link" onClick={() => nav(`/dx/discrepancies?person=${id}`)}>Report a wrong value</button>
        <button type="button" className="mdm-link" onClick={() => nav(`/dx/household?person=${id}`)}>Open the household</button>
      </div>
    </section>
  )
}
