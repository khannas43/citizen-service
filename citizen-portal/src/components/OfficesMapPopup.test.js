import { describe, it, expect } from 'vitest'
import { buildOfficePopup } from './OfficesMap'

describe('buildOfficePopup', () => {
  const base = { latitude: 23.03, longitude: 72.58, phone: '079-0000 0001' }

  it('renders office text as text, never as HTML', () => {
    const node = buildOfficePopup(
      { ...base, name: '<img src=x onerror=alert(1)>Evil JSK', phone: '<script>alert(2)</script>' },
      { typeLabel: '<b>Type</b>', directionsLabel: 'Get directions', origin: null },
    )
    expect(node.querySelector('img')).toBeNull()
    expect(node.querySelector('script')).toBeNull()
    expect(node.querySelector('b')).toBeNull()
    expect(node.textContent).toContain('<img src=x onerror=alert(1)>Evil JSK')
  })

  it('links to directions from the starting point and opens safely in a new tab', () => {
    const node = buildOfficePopup(
      { ...base, name: 'Demo JSK' },
      { typeLabel: 'Jan Seva Kendra', directionsLabel: 'Get directions', origin: { lat: 22.3, lng: 70.8 } },
    )
    const a = node.querySelector('a')
    expect(a.getAttribute('href')).toContain('origin=22.3%2C70.8')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.getAttribute('target')).toBe('_blank')
  })
})
