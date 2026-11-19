import { useEffect, useMemo, useState } from 'react'
import { useMdm, Status, Badge } from './shared'
import { fmtDate } from './labels'
import { inviteToApply } from '../../mdmApi'
import { tr } from '../../i18n/lang'
import { Stats, DataTable, FilterSelect, DateRange, Banner, EmptyState } from '../dx/dxKit'

// Where a person is in the scholarship consent, for the Turning 18 list.
const CONSENT_LABEL = {
  none: ['Not asked', 'neutral'],
  parent_asked: ['Parent asked', 'warn'],
  parent_allowed: ['Parent allowed', 'ok'],
  handover_pending: ['Waiting for the student (now 18)', 'warn'],
  student_allowed: ['Student allowed', 'ok'],
  refused: ['Not allowed', 'bad'],
  ended: ['Ended', 'neutral'],
}

const INCOME_TONE = { valid: 'ok', expired: 'warn', none: 'bad' }
const INCOME_LABEL = { valid: 'Valid', expired: 'Expired', none: 'None on file' }

const EMPTY_T18 = {
  q: '', district: '', identity: '', income_state: '', on_portal: '', consent: '',
  invited: '', turns_from: '', turns_to: '',
}

/** Preview, then confirm. An invitation is a notice to apply, not a consent request; each person is invited once. */
function InviteDialog({ ids, filter, onClose, onDone }) {
  const [state, setState] = useState({ step: 'loading' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    inviteToApply(ids, true, filter).then(
      (p) => live && setState({ step: 'preview', p }),
      (e) => live && setState({ step: 'error', msg: e.message }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function send() {
    setBusy(true)
    try {
      const r = await inviteToApply(ids, false, filter)
      setState({ step: 'done', r }); onDone?.(r)
    } catch (e) { setState({ step: 'error', msg: e.message }) } finally { setBusy(false) }
  }
  const { step, p, r, msg } = state
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={tr('Invite to apply')} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2>{tr('Invite to apply')}</h2>
        {step === 'loading' && <p className="mdm-note" role="status">{tr('Loading…')}</p>}
        {step === 'error' && <p className="mdm-error" role="alert">{msg}</p>}
        {step === 'preview' && (
          <>
            <p data-testid="invite-preview">{tr('{n} people will get a notice inviting them to apply for a scholarship.', { n: p.would_invite })}</p>
            {p.skipped > 0 && <p className="mdm-note">{tr('{n} are left out: already invited, or already on the portal.', { n: p.skipped })}</p>}
            <p className="mdm-note">{tr('The notice is only an invitation. It asks for no consent and enrols nobody.')}</p>
            {p.would_invite === 0 && <p className="mdm-note" role="status">{tr('Everyone chosen has already been invited or is already on the portal.')}</p>}
          </>
        )}
        {step === 'done' && (
          <>
            <p role="status" data-testid="invite-done">{tr('{invited} invited, {notified} notified, {skipped} left out.', { invited: r.invited, notified: r.notified, skipped: r.skipped })}</p>
            {r.not_reached > 0 && <p className="mdm-note" role="status" data-testid="invite-not-reached">{tr('{n} could not be notified, because they have no sign-in on the citizen portal. Nothing was recorded for them, so they can be invited again later.', { n: r.not_reached })}</p>}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {step === 'preview' && p.would_invite > 0 && <button type="button" className="btn-primary" disabled={busy} onClick={send}>{tr('Send invitations')}</button>}
          <button type="button" className="btn-secondary" onClick={onClose}>{step === 'done' ? tr('Done') : tr('Cancel')}</button>
        </div>
      </div>
    </div>
  )
}

function activeFilter(f) {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v != null))
}

export function Turning18({ openPerson }) {
  const [f, setF] = useState(EMPTY_T18)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(25)
  const [sort, setSort] = useState({ key: 'turns_18', dir: 'asc' })
  const [picked, setPicked] = useState({})
  const [inviting, setInviting] = useState(null) // { ids } | { filter }
  const set = (k) => (v) => { setF((p) => ({ ...p, [k]: v })); setOffset(0) }
  const params = {
    ...activeFilter(f),
    limit, offset, sort: sort.key, dir: sort.dir,
  }
  const { data, error, loading, reload } = useMdm('/worklists/turning-18', params, [JSON.stringify(params)])
  const any = Object.values(f).some(Boolean)
  const reset = () => { setF(EMPTY_T18); setOffset(0) }

  const canInvite = (r) => !r.invited && !r.on_scholarship_portal
  const items = data?.items || []
  const chosen = items.filter((r) => picked[r.id] && canInvite(r)).map((r) => r.id)
  const open = items.filter(canInvite)
  const districts = useMemo(
    () => [...new Set(items.map((r) => r.district).filter(Boolean))].sort(),
    [items],
  )
  const st = data?.stats || {}

  if (error && !data) {
    return (
      <EmptyState title={tr('Could not load the list')} hint={error}
        action={<button type="button" className="btn-secondary" onClick={reload}>{tr('Retry')}</button>} />
    )
  }

  return (
    <div className="mdm-stack">
      <p className="mdm-note">{tr('People born in the three years up to {v} minus 17 years: about to turn 18 or just turned. For each, what they would need to claim a scholarship or other adult entitlements.', { v: fmtDate(data?.as_of) })}</p>
      <Stats items={[
        { label: tr('Turning 18 in the next 30 days'), value: (st.turning_30 ?? '—').toLocaleString?.('en-IN') ?? st.turning_30 ?? '—' },
        { label: tr('Already 18'), value: (st.already_18 ?? '—').toLocaleString?.('en-IN') ?? st.already_18 ?? '—' },
        { label: tr('Not on the scholarship portal'), value: (st.not_on_portal ?? '—').toLocaleString?.('en-IN') ?? st.not_on_portal ?? '—' },
        { label: tr('Invited'), value: (st.invited ?? '—').toLocaleString?.('en-IN') ?? st.invited ?? '—' },
        { label: tr('Income certificate expired or none'), value: (st.income_expired_or_none ?? '—').toLocaleString?.('en-IN') ?? st.income_expired_or_none ?? '—' },
      ]} />
      <Status loading={loading && !data} error={null} />
      {error && data && <Banner tone="bad">{error} <button type="button" className="dxk-link" onClick={reload}>{tr('Retry')}</button></Banner>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className="btn-primary small" disabled={!chosen.length} onClick={() => setInviting({ ids: chosen })}>
          {tr('Invite to apply')}{chosen.length ? ` (${chosen.length})` : ''}
        </button>
        <button type="button" className="dxk-link" onClick={() => setInviting({ filter: activeFilter(f) })}>
          {tr('Select all that match the filter')}
        </button>
        <span className="mdm-sub">{tr('Choose people, check the count, then confirm. Someone already invited cannot be chosen again.')}</span>
        <span className="mdm-sub">{tr('Choose everyone on this page applies to this page only.')}</span>
      </div>
      <DataTable
        rows={items} rowKey="id"
        server={{
          total: data?.total ?? 0, limit, offset, onPage: setOffset,
          onLimit: (n) => { setLimit(n); setOffset(0) }, pageSizes: [10, 25, 50, 100],
          sort, onSort: (key, dir) => { setSort({ key, dir }); setOffset(0) },
        }}
        searchValue={f.q} onSearch={set('q')} searchDelay={300}
        search={{ placeholder: tr('Search name, ministry id or district') }}
        canClear={any} onClear={reset}
        filters={<>
          <FilterSelect label={tr('District')} value={f.district} all={tr('Any district')} onChange={set('district')}
            options={districts.map((d) => [d, d])} />
          <FilterSelect label={tr('Identity reference')} value={f.identity} all={tr('Any')} onChange={set('identity')}
            options={[['yes', tr('Yes')], ['no', tr('No')]]} />
          <FilterSelect label={tr('Income certificate')} value={f.income_state} all={tr('Any')} onChange={set('income_state')}
            options={[['valid', tr('Valid')], ['expired', tr('Expired')], ['none', tr('None on file')]]} />
          <FilterSelect label={tr('Scholarship portal')} value={f.on_portal} all={tr('Any')} onChange={set('on_portal')}
            options={[['yes', tr('On')], ['no', tr('Not there')]]} />
          <FilterSelect label={tr('Consent')} value={f.consent} all={tr('Any')} onChange={set('consent')}
            options={[
              ['none', tr('Not asked')], ['parent_asked', tr('Parent asked')], ['parent_allowed', tr('Parent allowed')],
              ['handover_pending', tr('Waiting for the student (now 18)')], ['student_allowed', tr('Student allowed')],
              ['refused', tr('Not allowed')], ['ended', tr('Ended')],
            ]} />
          <FilterSelect label={tr('Invited')} value={f.invited} all={tr('Any')} onChange={set('invited')}
            options={[['yes', tr('Yes')], ['no', tr('No')]]} />
          <DateRange label={tr('Turns 18')} from={f.turns_from} to={f.turns_to}
            onFrom={set('turns_from')} onTo={set('turns_to')} />
        </>}
        empty={tr('Nobody in this age band.')}
        emptyHint={any ? tr('Try a different search or clear the filters.') : undefined}
        columns={[
          { key: 'sel', label: '', sort: false, render: (r) => (
            <input type="checkbox" aria-label={tr('Choose {name}', { name: r.name })}
              disabled={!canInvite(r)} checked={canInvite(r) && !!picked[r.id]}
              onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.checked }))} />
          ) },
          { key: 'name', sortKey: 'person', label: tr('Person'), render: (r) => (
            <><button type="button" className="mdm-link strong" onClick={() => openPerson(r.id)}>{r.name}</button>
              <div className="mdm-sub">{r.district}</div></>
          ) },
          { key: 'dob', sortKey: 'born', label: tr('Born') },
          { key: 'turns_18', sortKey: 'turns_18', label: tr('Turns 18'), render: (r) => (
            <>{fmtDate(r.turns_18)}{r.already_adult && <div className="mdm-sub">{tr('already 18')}</div>}</>
          ) },
          { key: 'income_state', sortKey: 'income', label: tr('Income certificate'), render: (r) => (
            <Badge tone={INCOME_TONE[r.income_state]}>{INCOME_LABEL[r.income_state] || r.income_state}</Badge>
          ) },
          { key: 'consent_status', sortKey: 'consent', label: tr('Consent'), render: (r) => {
            const [l, t] = CONSENT_LABEL[r.consent_status] || CONSENT_LABEL.none
            return <span data-testid={`consent-${r.id}`}><Badge tone={t}>{l}</Badge>{r.invited && <div className="mdm-sub">{tr('Invited')}</div>}</span>
          } },
          { key: 'on_scholarship_portal', sortKey: 'portal', label: tr('Scholarship portal'), render: (r) => (
            r.on_scholarship_portal ? <span>{r.course || tr('Yes')}</span> : <span className="mdm-sub">{tr('Not there')}</span>
          ) },
          { key: 'next_step', label: tr('Next step'), sort: false, render: (r) => <span className="dxk-muted">{r.next_step || (r.next_steps || [])[0] || '—'}</span> },
        ]}
        toolbarRight={
          <label className="dxk-check">
            <input type="checkbox" aria-label={tr('Choose everyone on this page')} disabled={!open.length}
              checked={!!open.length && open.every((r) => picked[r.id])}
              onChange={(e) => setPicked((p) => ({ ...p, ...Object.fromEntries(open.map((r) => [r.id, e.target.checked])) }))} />
            <span>{tr('Choose everyone on this page')}</span>
          </label>
        }
      />
      {inviting && (
        <InviteDialog
          ids={inviting.ids}
          filter={inviting.filter}
          onClose={() => setInviting(null)}
          onDone={() => { setPicked({}); reload() }}
        />
      )}
    </div>
  )
}

const HH_KIND = {
  housing: 'Housing applications',
  dead_active: 'Deceased but still on a ration card',
  multi_card: 'On more than one ration card',
}

export function Households({ openPerson }) {
  const { data, error, loading, reload } = useMdm('/worklists/household')
  const [same, setSame] = useState('')
  const [kind, setKind] = useState('')

  const rows = useMemo(() => {
    if (!data) return []
    const out = []
    for (const d of data.duplicate_benefit || []) {
      out.push({
        id: `h-${d.first}-${d.second}`,
        kind: 'housing',
        same_person: !!d.same_person,
        summary: `${d.first_name} and ${d.second_name}`,
        detail: `${d.first} · ${d.first_status} · ${d.second} · ${d.second_status}`,
        first_person: d.first_person, second_person: d.second_person,
        first_name: d.first_name, second_name: d.second_name,
      })
    }
    for (const i of data.dead_active?.items || []) {
      out.push({
        id: `d-${i.id}`, kind: 'dead_active', same_person: false,
        summary: i.name, detail: i.detail, person_id: i.person_id, name: i.name,
      })
    }
    for (const i of data.multi_card?.items || []) {
      out.push({
        id: `m-${i.id}`, kind: 'multi_card', same_person: false,
        summary: i.name, detail: i.detail, person_id: i.person_id, name: i.name,
      })
    }
    return out
  }, [data])

  const filtered = useMemo(() => {
    let list = rows
    if (kind) list = list.filter((r) => r.kind === kind)
    if (same === 'yes') list = list.filter((r) => r.same_person)
    if (same === 'no') list = list.filter((r) => r.kind === 'housing' && !r.same_person)
    return list
  }, [rows, kind, same])

  if (error && !data) {
    return (
      <EmptyState title={tr('Could not load the list')} hint={error}
        action={<button type="button" className="btn-secondary" onClick={reload}>{tr('Retry')}</button>} />
    )
  }
  if (!data) return <Status loading={loading} error={error} />

  return (
    <DataTable
      rows={filtered} rowKey="id"
      search={{ placeholder: tr('Search person or detail'), text: (r) => `${r.summary} ${r.detail}` }}
      canClear={!!(same || kind)} onClear={() => { setSame(''); setKind('') }}
      filters={<>
        <FilterSelect label={tr('Same person')} value={same} all={tr('Any')} onChange={setSame}
          options={[['yes', tr('Yes')], ['no', tr('No')]]} />
        <FilterSelect label={tr('Kind of overlap')} value={kind} all={tr('Any kind')} onChange={setKind}
          options={Object.entries(HH_KIND).map(([k, l]) => [k, tr(l)])} />
      </>}
      empty={tr('None found.')}
      columns={[
        { key: 'kind', label: tr('Kind'), render: (r) => tr(HH_KIND[r.kind] || r.kind) },
        { key: 'summary', label: tr('People'), render: (r) => (
          r.kind === 'housing' ? (
            <>
              <button type="button" className="mdm-link" onClick={() => openPerson(r.first_person)}>{r.first_name}</button>
              {' and '}
              <button type="button" className="mdm-link" onClick={() => openPerson(r.second_person)}>{r.second_name}</button>
              {r.same_person && <> <Badge tone="bad">{tr('same person')}</Badge></>}
            </>
          ) : (
            <button type="button" className="mdm-link" onClick={() => openPerson(r.person_id)}>{r.name}</button>
          )
        ) },
        { key: 'detail', label: tr('Detail'), render: (r) => <span className="dxk-muted">{r.detail}</span> },
        { key: 'same_person', label: tr('Same person'), render: (r) => (r.kind === 'housing' ? (r.same_person ? tr('Yes') : tr('No')) : '—') },
      ]}
    />
  )
}
