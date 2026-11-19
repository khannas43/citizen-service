import { describe, it, expect, beforeEach } from 'vitest'
import te from './te'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { tr, setLang, getLang } from './lang'
import { HUBS, GROUP_ORDER, SUB_ORDER } from '../navTree'
import { officerNavItems } from '../auth'

const text = (label) => label.replace(/^\S+\s/, '')

describe('officer portal language', () => {
  beforeEach(() => setLang('en'))

  it('shows English until Telugu is chosen, then Telugu, and keeps unknown text in English', () => {
    expect(tr('Approvals')).toBe('Approvals')
    setLang('te')
    expect(getLang()).toBe('te')
    expect(tr('Approvals')).toBe(te.Approvals)
    expect(tr('Something not translated yet')).toBe('Something not translated yet')
    expect(tr('The request failed ({status}).', { status: 500 })).toContain('500')
  })

  it('has Telugu for every menu entry, group, sub-group and hub tab', () => {
    const missing = []
    const need = (s) => { if (!te[s]) missing.push(s) }
    GROUP_ORDER.forEach(need); SUB_ORDER.forEach(need)
    HUBS.forEach((h) => { need(text(h.label)); h.tabs.forEach(([, l]) => need(l)) })
    ;['ADMIN', 'MDM_ADMIN', 'MDM_STEWARD'].forEach((r) => officerNavItems(r).forEach((l) => need(text(l.label))))
    expect([...new Set(missing)]).toEqual([])
  })

  it('places a React element inside a sentence instead of printing it as text', () => {
    const { container } = render(createElement('p', null, tr('Score: {v}.', { v: createElement('b', null, '87%') })))
    expect(container.querySelector('b').textContent).toBe('87%')
    expect(container.textContent).toBe('Score: 87%.')
  })
})
