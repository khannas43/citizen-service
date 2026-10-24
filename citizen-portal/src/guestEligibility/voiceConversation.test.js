import { describe, expect, it } from 'vitest'
import {
  mergeVoiceSlots,
  missingRequiredFromSlots,
  nextRequiredField,
} from './voiceConversation'

describe('voiceConversation', () => {
  it('merges newer slot values over prior', () => {
    const merged = mergeVoiceSlots({ age: 30, district: 'Surat' }, { age: 40, gender: 'F' })
    expect(merged.age).toBe(40)
    expect(merged.gender).toBe('F')
    expect(merged.district).toBe('Surat')
  })

  it('orders next required field', () => {
    expect(nextRequiredField(['gender', 'district', 'ageOrDob'])).toBe('ageOrDob')
    expect(nextRequiredField(['district', 'casteCategory'])).toBe('casteCategory')
    expect(missingRequiredFromSlots({ age: 40 })).toEqual(['gender', 'casteCategory', 'district'])
  })
})
