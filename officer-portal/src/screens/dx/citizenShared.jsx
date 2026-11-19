import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { mdm } from '../../mdmApi'
import { useMdm, Status } from '../mdm/shared'
import { PersonPicker } from './dxShared'
import { PageHeader, Card, Banner } from './dxKit'
import { tr } from '../../i18n/lang'

/** The identity reference token stands in for the citizen's own sign-in in this demonstration. */
export function useCitizenParams() {
  const [params, setParams] = useSearchParams()
  const token = params.get('token') || ''
  const operator = params.get('operator') || ''
  const mode = operator ? { channel: 'ASSISTED', operator } : { channel: 'PORTAL', operator: null }
  const set = (t) => setParams(operator ? { token: t, operator } : { token: t })
  return { token, operator, mode, set }
}

export function TokenPicker({ onToken, current }) {
  const [typed, setTyped] = useState(current || '')
  const [err, setErr] = useState(null)
  const pick = async (p) => {
    setErr(null)
    try {
      const x = await mdm(`/x/persons/${p.id}/exchange`)
      const t = x.identity?.tokens?.[0]?.token
      t ? onToken(t) : setErr('This person has no identity reference, so there is no citizen view for them.')
    } catch (e) { setErr(e.message) }
  }
  return (
    <Card title={tr('Choose the citizen')} hint={tr('In production the citizen signs in and their identity reference is known. Here, pick the person or type the reference.')}>
      <div aria-label={tr('Choose the citizen')} className="dxk-stackform">
        <PersonPicker onPick={pick} label={tr('Find the citizen')} />
        <form className="dxk-form" onSubmit={(e) => { e.preventDefault(); typed.trim() && onToken(typed.trim()) }}>
          <label className="dxk-field"><span>{tr('Or identity reference')}</span><input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <div><button type="submit" className="btn-secondary">{tr('Open')}</button></div>
        </form>
        {err && <Banner tone="bad">{err}</Banner>}
      </div>
    </Card>
  )
}

export function useCitizen(token, deps = []) {
  return useMdm(token ? `/x/citizen/${encodeURIComponent(token)}` : '/x/purposes', undefined, [token, ...deps])
}

export function Frame({ title, intro, children, token, operator, onToken }) {
  return (
    <div className="mdm-hub">
      <PageHeader icon="🧑" title={title} subtitle={intro} />
      {operator && <Banner tone="warn">{tr('Assisted visit: you are acting with operator')} <strong>{operator}</strong> {tr('present. Everything you record is marked as assisted.')}</Banner>}
      {!token ? <TokenPicker onToken={onToken} /> : children}
    </div>
  )
}

export { Status }
