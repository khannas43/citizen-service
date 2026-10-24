import { describe, expect, it } from 'vitest'
import { applicationRefsOf, clarificationMatchesApp } from './api.js'

describe('application correspondence matching', () => {
  const task = {
    engineRef: 'FLW-abc123',
    applicationNo: 'CAS-2608-000001',
  }

  it('collects both the engine ref and display number', () => {
    expect([...applicationRefsOf(task)]).toEqual(['FLW-abc123', 'CAS-2608-000001'])
  })

  it('matches officer info requests stored against the engine ref', () => {
    expect(clarificationMatchesApp({
      applicationRef: 'FLW-abc123',
      displayRef: 'CAS-2608-000001',
    }, task)).toBe(true)
  })

  it('matches citizen questions stored against the display number', () => {
    expect(clarificationMatchesApp({
      applicationRef: 'CAS-2608-000001',
    }, task)).toBe(true)
  })

  it('ignores correspondence for a different application', () => {
    expect(clarificationMatchesApp({
      applicationRef: 'FLW-other',
      displayRef: 'CAS-2608-000002',
    }, task)).toBe(false)
  })
})
