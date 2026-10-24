import { describe, it, expect } from 'vitest'
import { directionsUrl, haversineKm } from './officeRouting'

describe('directionsUrl', () => {
  it('sets only the destination when there is no starting point', () => {
    const url = new URL(directionsUrl({ lat: 23.03, lng: 72.58 }))
    expect(url.searchParams.get('destination')).toBe('23.03,72.58')
    expect(url.searchParams.has('origin')).toBe(false)
    expect(url.searchParams.get('travelmode')).toBe('driving')
  })

  it('includes the starting point as origin', () => {
    const url = new URL(directionsUrl({ lat: 23.03, lng: 72.58 }, { lat: 22.3, lng: 70.8 }))
    expect(url.searchParams.get('origin')).toBe('22.3,70.8')
  })
})

describe('haversineKm', () => {
  it('is roughly 180 km between Ahmedabad and Rajkot', () => {
    const km = haversineKm({ lat: 23.0225, lng: 72.5714 }, { lat: 22.3039, lng: 70.8022 })
    expect(km).toBeGreaterThan(170)
    expect(km).toBeLessThan(200)
  })

  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 23, lng: 72 }, { lat: 23, lng: 72 })).toBeCloseTo(0, 5)
  })
})
