import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NearbyOffices from './NearbyOffices'
import '../i18n'

vi.mock('../components/OfficesMap', () => ({
  default: () => <div data-testid="offices-map-stub" />,
}))

vi.mock('../components/LandingChromeHeader', () => ({
  default: () => <div data-testid="landing-header" />,
}))

vi.mock('../api', () => ({
  fetchActiveSchemes: vi.fn(),
  fetchOfficeFilters: vi.fn(),
  fetchNearbyOffices: vi.fn(),
  fetchTalukasForDistrict: vi.fn().mockResolvedValue([]),
  fetchVillagesForTaluka: vi.fn().mockResolvedValue([]),
}))

import { fetchActiveSchemes, fetchOfficeFilters, fetchNearbyOffices } from '../api'

const filters = {
  districts: ['Ahmedabad', 'Surat'],
  talukasByDistrict: { Ahmedabad: ['City', 'Daskroi'] },
  officeTypes: ['JAN_SEVA_KENDRA'],
}

const sampleOffice = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Demo JSK',
  nameGujarati: null,
  officeType: 'JAN_SEVA_KENDRA',
  address: 'Demo address',
  district: 'Ahmedabad',
  taluka: 'City',
  latitude: 23.03,
  longitude: 72.58,
  phone: '0000-000000',
  distanceKm: 2.4,
  isOpenNow: true,
  workingHours: 'Mon–Sat 10:30–18:10',
  dataSource: 'DEMO_SEED',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NearbyOffices guestShell />
    </MemoryRouter>,
  )
}

describe('NearbyOffices', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('901'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.mocked(fetchActiveSchemes).mockResolvedValue([{ id: 's1', name: 'Widow Pension', isActive: true }])
    vi.mocked(fetchOfficeFilters).mockResolvedValue(filters)
    vi.mocked(fetchNearbyOffices).mockResolvedValue({
      offices: [sampleOffice],
      widened: false,
      demoData: true,
    })
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call geolocation on mount', async () => {
    renderPage()
    await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('shows fallback when geolocation permission denied', async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_ok, err) => {
      err({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 })
    })
    renderPage()
    await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/permission|district/i)
    })
  })

  it('fetches offices when district is selected', async () => {
    renderPage()
    await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
    const districtSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(districtSelect, { target: { value: 'Ahmedabad' } })
    await waitFor(() => expect(fetchNearbyOffices).toHaveBeenCalled())
    expect(fetchNearbyOffices.mock.calls.at(-1)[0].district).toBe('Ahmedabad')
  })

  it('renders distance and directions link', async () => {
    renderPage()
    await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
    const districtSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(districtSelect, { target: { value: 'Ahmedabad' } })
    await waitFor(() => expect(screen.getByText('Demo JSK')).toBeInTheDocument())
    expect(screen.getByText(/2\.4 km/i)).toBeInTheDocument()
    const dir = screen.getByRole('link', { name: /get directions/i })
    expect(dir).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir'))
    expect(dir).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows widened message when API widens search', async () => {
    vi.mocked(fetchNearbyOffices).mockResolvedValue({
      offices: [sampleOffice],
      widened: true,
      widenedDistrict: 'Ahmedabad',
      demoData: true,
    })
    renderPage()
    await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
    const districtSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(districtSelect, { target: { value: 'Ahmedabad' } })
    await waitFor(() => {
      expect(screen.getByText(/showing offices in ahmedabad/i)).toBeInTheDocument()
    })
  })
})
