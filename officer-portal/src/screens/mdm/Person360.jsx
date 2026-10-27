import { useState } from 'react'
import { mdm } from '../../mdmApi'
import { useMdm, Status, Badge } from './shared'
import { dqLabel, fmtDate, lifeLabel, linkLabel, RELATION_TEXT, COMPONENT_LABELS } from './labels'

const ATTR_LABEL = { name: 'Name', dob: 'Date of birth', birth_year: 'Year of birth', gender: 'Gender', address: 'Address', date_of_death: 'Date of death' }

function Evidence({ ev }) {
  const comps = ev?.components
  if (!comps) return null
  return (
    <details className="mdm-evidence">
      <summary>Why this match</summary>
      <table className="mdm-table tight">
        <tbody>
          {Object.entries(comps).map(([k, c]) => (
            <tr key={k}>
              <td>{COMPONENT_LABELS[k] || k}</td>
              <td className="num">{c.score == null ? 'not compared' : `${Math.round(c.score * 100)}%`}</td>
              <td className="mdm-sub">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ev.penalties?.length > 0 && <p className="mdm-sub">Reduced because: {ev.penalties.join(', ')}.</p>}
    </details>
  )
}

export default function Person360({ id, back, openPerson }) {
  const { data: d, error, loading, reload } = useMdm(`/persons/${id}`, undefined, [id])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!d) return <Status loading={loading} error={error} />
  const p = d.person

  const unlink = async (r) => {
    if (!window.confirm(`Separate "${r.name}" from ${p.name}? It becomes its own person and the audit log records you as the author.`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await mdm(`/records/${r.id}/unlink`, { method: 'POST', body: {} })
      setMsg({ ok: true, text: 'The record is now a separate person.' })
      if (res.new_person_id) setTimeout(() => openPerson(res.new_person_id), 600)
      reload()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const bySource = {}
  d.records.forEach((r) => { (bySource[r.source_name] ||= []).push(r) })

  return (
    <div className="mdm-stack">
      <button type="button" className="mdm-link" onClick={back}>← Back to the list</button>
      <header className="mdm-person-head">
        <div>
          <h2>{p.name}{p.name_local ? <span className="mdm-local"> · {p.name_local}</span> : null}</h2>
          <div className="mdm-sub"><code>{p.mdm_id}</code> · {p.gender === 'F' ? 'Female' : p.gender === 'M' ? 'Male' : 'Gender not stated'} · born {p.dob || p.birth_year || 'unknown'} · {[p.village, p.mandal, p.district].filter(Boolean).join(', ') || 'place unknown'}</div>
        </div>
        <div className="mdm-head-badges">
          {p.life_status === 'DECEASED' ? <Badge tone="bad">{lifeLabel(p.life_status)}</Badge> : <Badge>{lifeLabel(p.life_status)}</Badge>}
          <Badge tone="info">{p.source_count} of 10 systems</Badge>
          <Badge tone={Number(p.confidence) >= 0.85 ? 'ok' : 'warn'}>Match confidence {Math.round(Number(p.confidence) * 100)}%</Badge>
        </div>
      </header>
      {msg && <p className={msg.ok ? 'mdm-ok' : 'mdm-error'} role="status">{msg.text}</p>}

      {d.issues.length > 0 && (
        <section className="mdm-card">
          <h3>Data issues</h3>
          <ul className="mdm-plain">
            {d.issues.map((i) => (
              <li key={i.id}>
                <Badge tone={i.severity === 'HIGH' ? 'bad' : i.severity === 'MEDIUM' ? 'warn' : 'neutral'}>{i.severity === 'HIGH' ? 'High' : i.severity === 'MEDIUM' ? 'Medium' : 'Low'}</Badge>{' '}
                <strong>{dqLabel(i.code)}.</strong> {i.detail} {i.status === 'CORRECTION_REQUESTED' && <Badge tone="info">Correction requested</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mdm-card">
        <h3>The golden record</h3>
        <p className="mdm-note">Each value below was chosen by a visible rule. Where departments differ, the other values are listed so nothing is hidden.</p>
        <table className="mdm-table">
          <thead><tr><th>Field</th><th>Value</th><th>Taken from</th><th>Rule</th></tr></thead>
          <tbody>
            {d.attributes.map((a) => (
              <tr key={a.attribute}>
                <td>{ATTR_LABEL[a.attribute] || a.attribute}</td>
                <td><strong>{a.value || '—'}</strong>{a.conflict && <> <Badge tone="warn">Departments differ</Badge></>}
                  {a.alternatives.length > 1 && (
                    <details className="mdm-evidence"><summary>All values seen ({a.alternatives.length})</summary>
                      <ul className="mdm-plain">{a.alternatives.map((x, i) => <li key={i}>{x.value || '—'} <span className="mdm-sub">({x.source.replace(/_/g, ' ')})</span></li>)}</ul>
                    </details>)}
                </td>
                <td>{a.chosen_source?.replace(/_/g, ' ')}</td>
                <td className="mdm-sub">{a.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mdm-card">
        <h3>Family and household</h3>
        {d.relationships.length ? (
          <ul className="mdm-plain">
            {d.relationships.map((r, i) => (
              <li key={i}>
                <strong>{RELATION_TEXT[r.role_of_other]}:</strong>{' '}
                <button type="button" className="mdm-link" onClick={() => openPerson(r.other.id)}>{r.other.name}</button>
                {r.other.life_status === 'DECEASED' && <> <Badge tone="bad">Death registered</Badge></>}
                <span className="mdm-sub"> · {r.basis}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mdm-note">No family links found. This means none of the systems connect this person to anyone else, which is different from having no family.</p>}
      </section>

      <section className="mdm-card">
        <h3>Department records ({d.records.length})</h3>
        {Object.entries(bySource).map(([name, recs]) => (
          <div key={name} className="mdm-src-block">
            <h4>{name}</h4>
            {recs.map((r) => (
              <div key={r.id} className="mdm-rec">
                <div>
                  <strong>{r.name}</strong> <span className="mdm-sub">{r.rtype.replace(/_/g, ' ').toLowerCase()} · {r.source_rid}</span>
                  <div className="mdm-sub">{[r.dob && `born ${r.dob}`, r.age != null && `age ${r.age}`, r.gender, r.address, r.village, r.mandal, r.district].filter(Boolean).join(' · ')}</div>
                  <div><Badge tone={r.link_status === 'IN_REVIEW' ? 'warn' : r.link_status.startsWith('STEWARD') ? 'info' : 'neutral'}>{linkLabel(r.link_status)}</Badge>
                    {r.link_status === 'AUTO_LINKED' && <span className="mdm-sub"> match strength {Math.round(Number(r.score) * 100)}%</span>}</div>
                  {r.link_status === 'AUTO_LINKED' && <Evidence ev={r.evidence} />}
                </div>
                {d.records.length > 1 && (
                  <button type="button" className="btn-secondary small" disabled={busy} onClick={() => unlink(r)}>Not this person</button>
                )}
              </div>
            ))}
          </div>
        ))}
        {d.missing_sources.length > 0 && (
          <details className="mdm-evidence">
            <summary>Systems with no record for this person ({d.missing_sources.length})</summary>
            <p className="mdm-note">“No record” only means the system holds nothing that links here. It does not mean the person is not married, not entitled, or alive.</p>
            <ul className="mdm-plain">{d.missing_sources.map((m) => <li key={m.source}>{m.name}</li>)}</ul>
          </details>
        )}
      </section>

      {d.audit.length > 0 && (
        <section className="mdm-card">
          <h3>Decisions about this person</h3>
          <ul className="mdm-plain">{d.audit.map((a) => <li key={a.seq}>{fmtDate(a.ts)} · {a.actor} · {a.action.replace(/_/g, ' ').toLowerCase()}{a.detail?.note ? ` — ${a.detail.note}` : ''}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
