import { useEffect, useState } from 'react'
import { mdm } from '../mdmApi'
import { getLang, useLang, tr } from './lang'
import { placeTe } from './places.te'

// Machine translation of free text that arrives from departments (a rejection reason, a note). Only in Telugu, only when the service
// is switched on, and marked unless a reviewer has checked that sentence (reviewed text is shown plainly). If anything is missing or slow, the original English text stays on screen.
let statusP = null
const done = new Map()           // English text -> { v: Telugu text, machine: bool }
const waiting = new Map()        // English text -> callbacks
let timer = null

export const machineTranslationOn = () => {
  statusP = statusP || mdm('/x/translate/status').then((s) => !!s?.enabled, () => false)
  return statusP
}

function flush() {
  timer = null
  const batch = [...waiting.keys()].slice(0, 30)
  if (!batch.length) return
  const cbs = batch.map((t) => [t, waiting.get(t)])
  batch.forEach((t) => waiting.delete(t))
  mdm('/x/translate', { method: 'POST', body: { texts: batch, target: 'te' } })
    .then((r) => cbs.forEach(([t, fns], i) => { const it = r.items[i]; const v = (it?.machine || it?.reviewed) ? { v: it.translated, machine: !!it.machine } : null; done.set(t, v); fns.forEach((f) => f(v)) }))
    .catch(() => cbs.forEach(([t, fns]) => { done.set(t, null); fns.forEach((f) => f(null)) }))
  if (waiting.size) timer = setTimeout(flush, 20)
}

function request(text) {
  return new Promise((resolve) => {
    if (done.has(text)) return resolve(done.get(text))
    waiting.set(text, [...(waiting.get(text) || []), resolve])
    if (!timer) timer = setTimeout(flush, 20)
  })
}

/** Department free text. In English, or when machine translation is off, it is shown as is. In Telugu it is replaced by the machine translation, marked. */
export function Mt({ text }) {
  const lang = useLang()
  const [out, setOut] = useState(() => (done.get(text) ?? null))
  useEffect(() => {
    let live = true
    if (lang !== 'te' || !text) { setOut(null); return }
    machineTranslationOn().then((on) => { if (on && live) request(text).then((v) => live && setOut(v)) })
    return () => { live = false }
  }, [lang, text])
  if (lang !== 'te' || !out) return text ?? null
  if (!out.machine) return <span title={text}>{out.v}</span>
  return <>{out.v}<span className="mt-mark" title={text} style={{ fontSize: '0.75em', opacity: 0.7, marginLeft: '0.4em', whiteSpace: 'nowrap' }}>({tr('machine translated')})</span></>
}

// Telugu letters for a name or place. Districts come from a fixed list; everything else is transliterated by the translation service, in the Telugu view only.
// Nothing is shown unless a Telugu form exists, so in English (or when the service is off) these render nothing or the original text.
function useTelugu(text) {
  const lang = useLang()
  const [out, setOut] = useState(() => (done.get(text) ?? null))
  useEffect(() => {
    let live = true
    if (lang !== 'te' || !text || placeTe(text)) { setOut(null); return }
    machineTranslationOn().then((on) => { if (on && live) request(text).then((v) => live && setOut(v)) })
    return () => { live = false }
  }, [lang, text])
  if (lang !== 'te' || !text) return null
  const fixed = placeTe(text)
  if (fixed) return { v: fixed, machine: false }
  return out
}

const NAME_MARK = { borderBottom: '1px dotted currentColor', cursor: 'help' }

/** The Telugu form of a name, to sit beside the English one. A Telugu name already on the record wins. Renders nothing when there is none. */
export function Tel({ text, local, lead = ' · ', className = 'mdm-local' }) {
  const t = useTelugu(local ? null : text)
  if (local) return <span className={className}>{lead}{local}</span>
  if (!t) return null
  return <span className={className}>{lead}<span style={t.machine ? NAME_MARK : undefined} title={t.machine ? tr('Machine-written Telugu spelling of {name}', { name: text }) : text}>{t.v}</span></span>
}

/** A name for the Telugu view: the Telugu spelling first, the English name after it so records can still be matched by eye. English view: the name as given. */
export function Name({ text, local }) {
  const t = useTelugu(local ? null : text)
  if (!text) return null
  const v = local ? { v: local, machine: false } : t
  if (!v) return text
  return <><span style={v.machine ? NAME_MARK : undefined} title={v.machine ? tr('Machine-written Telugu spelling of {name}', { name: text }) : text}>{v.v}</span><span className="mdm-local"> · {text}</span></>
}

/** A place or address in Telugu letters when available, otherwise exactly as given. */
export function Nm({ text }) {
  const t = useTelugu(text)
  if (!text) return null
  if (!t) return text
  return <span style={t.machine ? NAME_MARK : undefined} title={text}>{t.v}</span>
}

/** Parts of a place (village, mandal, district) joined with commas, each in Telugu letters when available. */
export function Pl({ parts, sep = ', ', empty = null }) {
  const p = (parts || []).filter(Boolean)
  if (!p.length) return empty
  return <>{p.map((x, i) => <span key={i}>{i > 0 && sep}<Nm text={x} /></span>)}</>
}

export const _resetForTests = () => { statusP = null; done.clear(); waiting.clear() }
