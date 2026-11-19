import { createElement, Fragment, useSyncExternalStore } from 'react'
import te from './te'

// The officer portal's language: English or Telugu. English text is the key, so a string with no Telugu yet simply stays in English.
const KEY = 'officer_lang'
const listeners = new Set()

export function getLang() {
  try { return localStorage.getItem(KEY) === 'te' ? 'te' : 'en' } catch { return 'en' }
}

function applyDocLang(lang) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.body?.classList.toggle('lang-te', lang === 'te')
}

export function setLang(lang) {
  const next = lang === 'te' ? 'te' : 'en'
  try { localStorage.setItem(KEY, next) } catch { /* private window: the choice lasts until reload */ }
  applyDocLang(next)
  listeners.forEach((f) => f())
}

applyDocLang(getLang())

/** Re-renders the component when the language changes. */
export function useLang() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, getLang)
}

/** Translate an English string; {name} placeholders are filled from vars. A var may be a React element, in which case the result is a fragment. */
export function tr(en, vars) {
  const s = getLang() === 'te' && te[en] !== undefined ? te[en] : en
  if (!vars) return s
  const hasNode = Object.values(vars).some((v) => v !== null && typeof v === 'object')
  if (!hasNode) return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return createElement(Fragment, null, ...s.split(/\{(\w+)\}/).map((p, i) => (i % 2 ? createElement(Fragment, { key: i }, vars[p] ?? `{${p}}`) : p)))
}

/** The same function, for components that must redraw when the language changes. */
export function useTr() {
  useLang()
  return tr
}

/** Translate a value only when it is plain text; elements and numbers pass through. For props that screens give as strings. */
export function T(v) {
  return typeof v === 'string' ? tr(v) : v
}

/** A lookup table of English labels whose values are translated as they are read. */
export const tObj = (o) => new Proxy(o, { get: (t, k) => (typeof t[k] === 'string' ? tr(t[k]) : t[k]) })
