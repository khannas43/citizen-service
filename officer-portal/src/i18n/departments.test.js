import { describe, it, expect, afterEach } from 'vitest'
import { localizeDepartments, deptTe } from './departments.te'
import { setLang } from './lang'

afterEach(() => setLang('en'))

describe('Department names in the Telugu view', () => {
  it('leaves everything alone in English', () => {
    const d = { source_name: 'Civil registration (CRS)', n: 3 }
    expect(localizeDepartments(d)).toBe(d)
    expect(deptTe('Housing')).toBe('Housing')
  })
  it('replaces exact department names anywhere in an answer, and nothing else', () => {
    setLang('te')
    const out = localizeDepartments({ by_source: [{ source: 'crs', name: 'Civil registration (CRS)' }], note: 'Housing grant approved', list: ['Housing'] })
    expect(out.by_source[0]).toEqual({ source: 'crs', name: 'పౌర నమోదు (CRS)' })
    expect(out.note).toBe('Housing grant approved')
    expect(out.list).toEqual(['గృహనిర్మాణం'])
  })
})
