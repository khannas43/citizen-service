import { Badge } from '../mdm/shared'
import { tr } from '../../i18n/lang'

/** Why a check failed, what was found, and what to do about it, with the department contact. */
export default function Reasons({ r, contact, more, onMore }) {
  const f = r.found || {}
  const ex = f.examples || []
  const shown = more ? ex : ex.slice(0, 5)
  return (
    <div className="fq-why">
      <section><h3 className="fq-why-h">{tr('Why it failed')}</h3><p>{r.explain.why}</p></section>
      {(f.breakdown?.length > 0 || f.districts?.length > 0 || ex.length > 0) && (
        <section>
          <h3 className="fq-why-h">{tr('What we found')}</h3>
          {f.breakdown?.length > 0 && <div className="fq-chips" aria-label={tr('Kinds of problem')}>{f.breakdown.map((b) => <Badge key={b.label} tone="warn">{b.label} · {b.count.toLocaleString('en-IN')}</Badge>)}</div>}
          {f.districts?.length > 0 && <p className="fq-found-line"><strong>{tr('Where:')}</strong> {f.districts.map((d) => `${d.label} (${d.count.toLocaleString('en-IN')})`).join(', ')}</p>}
          {ex.length > 0 && (
            <>
              <div className="fq-ex-scroll"><table className="mdm-table fq-ex"><thead><tr><th>{tr('Record key')}</th>{ex.some((e) => e.received_day) && <th>{tr('Received')}</th>}<th>{tr('Value found')}</th></tr></thead>
                <tbody>{shown.map((e, i) => <tr key={`${e.source_rid}-${i}`}><td>{e.source_rid ?? '—'}</td>{ex.some((x) => x.received_day) && <td>{e.received_day ?? '—'}</td>}<td>{e.value === null || e.value === undefined || e.value === '' ? <span className="lin-meta">{tr('(blank)')}</span> : String(e.value)}</td></tr>)}</tbody></table></div>
              <p className="fq-found-line lin-meta">
                {tr('Showing {length} of {v} affected records', { length: shown.length, v: (f.affected ?? ex.length).toLocaleString('en-IN') })}
                {!more && ex.length > 5 && <> · <button type="button" className="fq-link" onClick={onMore}>{tr('Show up to {length}', { length: ex.length })}</button></>}
                {more && f.affected > ex.length && ` (the first ${ex.length} are kept)`}
              </p>
            </>
          )}
        </section>
      )}
      <section>
        <h3 className="fq-why-h">{tr('What to do')}</h3>
        <p>{r.explain.action}</p>
        {contact && (
          <p className="fq-contact"><strong>{tr('Contact:')}</strong> {contact.name}{contact.role ? `, ${contact.role}` : ''}
            {contact.email && <> · <a href={`mailto:${contact.email}`}>{contact.email}</a></>}{contact.phone && <> · {contact.phone}</>}
            {contact.placeholder && <span className="lin-meta"> {tr('(placeholder: set the real contact under Department contacts)')}</span>}</p>
        )}
      </section>
    </div>
  )
}
