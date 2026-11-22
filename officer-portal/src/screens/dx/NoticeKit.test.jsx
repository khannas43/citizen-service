import { describe, it, expect } from 'vitest'
import { canAnswer } from './NoticeKit'

describe('canAnswer', () => {
  it('lets a notice be answered, and an accepted or acknowledged one be marked applied', () => {
    expect(canAnswer({ outcome: null })).toBe(true)
    expect(canAnswer({ outcome: 'ACCEPTED' })).toBe(true)
    expect(canAnswer({ outcome: 'ACKNOWLEDGED' })).toBe(true)
  })
  it('closes the notice once it is applied or rejected', () => {
    expect(canAnswer({ outcome: 'APPLIED' })).toBe(false)
    expect(canAnswer({ outcome: 'REJECTED' })).toBe(false)
  })
})
