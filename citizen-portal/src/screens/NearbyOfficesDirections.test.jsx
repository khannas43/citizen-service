import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NearbyOffices from './NearbyOffices'
import '../i18n'

vi.mock('../components/OfficesMap', () => ({
  default: ({ origin, route }) => (
    <div data-testid="offices-map-stub" data-origin={origin ? `${origin.lat},${origin.lng}` : ''} data-route={route?.kind || ''} />
  ),
}))
vi.mock('../components/LandingChromeHeader', () => ({ default: () => <div /> }))
vi.mock('../api', () => ({
  fetchActiveSchemes: vi.fn(),
  fetchOfficeFilters: vi.fn(),
  fetchNearbyOffices: vi.fn(),
  fetchTalukasForDistrict: vi.fn().mockResolvedValue([]),
  fetchVillagesForTaluka: vi.fn().mockResolvedValue([]),
}))
vi.mock('../utils/officeRouting', async (importOriginal) => ({
  ...(await importOriginal()),
  geocodePlace: vi.fn(),
  fetchRoadRoute: vi.fn(),
}))

import {
  fetchActiveSchemes, fetchOfficeFilters, fetchNearbyOffices, fetchTalukasForDistrict, fetchVillagesForTaluka,
} from '../api'
import { geocodePlace, fetchRoadRoute } from '../utils/officeRouting'

const office = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Ahmedabad Jan Seva Kendra',
  nameGujarati: null,
  officeType: 'JAN_SEVA_KENDRA',
  address: 'Jan Seva Kendra, Civic Centre, Ahmedabad (sample address)',
  district: 'Ahmedabad',
  taluka: 'Ahmedabad City',
  latitude: 23.0165,
  longitude: 72.5634,
  phone: '079-0000 0002',
  email: 'jsk.ahmedabad@example.invalid',
  workingHours: 'Mon–Sat 09:00–17:00',
  weeklyOff: 'Sunday',
  isOpenNow: true,
  distanceKm: null,
  dataSource: 'DEMO_SEED',
}

function renderPage() {
  return render(<MemoryRouter><NearbyOffices guestShell /></MemoryRouter>)
}

async function loadAhmedabad() {
  await waitFor(() => expect(fetchOfficeFilters).toHaveBeenCalled())
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Ahmedabad' } })
  await waitFor(() => expect(screen.getAllByText('Ahmedabad Jan Seva Kendra').length).toBeGreaterThan(0))
}

describe('NearbyOffices table and directions', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('901'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    vi.mocked(fetchActiveSchemes).mockResolvedValue([])
    vi.mocked(fetchOfficeFilters).mockResolvedValue({
      districts: ['Ahmedabad'], talukasByDistrict: { Ahmedabad: ['Ahmedabad City'] }, officeTypes: [],
    })
    vi.mocked(fetchNearbyOffices).mockResolvedValue({ offices: [office], widened: false, demoData: true })
    vi.mocked(geocodePlace).mockResolvedValue([{ label: 'Navrangpura, Ahmedabad', lat: 23.04, lng: 72.56 }])
    vi.mocked(fetchRoadRoute).mockResolvedValue({
      coords: [[23.04, 72.56], [23.0165, 72.5634]], distanceKm: 3.4, durationMin: 9,
    })
    Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn() } })
  })

  afterEach(() => vi.restoreAllMocks())

  it('shows contact details in a table', async () => {
    renderPage()
    await loadAhmedabad()
    fireEvent.click(screen.getByRole('button', { name: /^table$/i }))
    const table = await screen.findByRole('table')
    for (const header of [/office/i, /address/i, /phone/i, /email/i, /working hours/i, /distance/i, /directions/i]) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    expect(within(table).getByRole('link', { name: '079-0000 0002' })).toHaveAttribute('href', 'tel:079-00000002')
    expect(within(table).getByRole('link', { name: 'jsk.ahmedabad@example.invalid' }))
      .toHaveAttribute('href', 'mailto:jsk.ahmedabad@example.invalid')
  })

  it('uses an entered place as the starting point for directions and the route', async () => {
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/or enter your location/i), { target: { value: 'Navrangpura' } })
    fireEvent.click(screen.getByRole('button', { name: /search place/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Navrangpura, Ahmedabad' }))

    await waitFor(() => expect(screen.getByTestId('offices-map-stub')).toHaveAttribute('data-origin', '23.04,72.56'))
    const nearbyCall = fetchNearbyOffices.mock.calls.at(-1)[0]
    expect(nearbyCall.lat).toBe(23.04)
    expect(nearbyCall.lng).toBe(72.56)

    const link = (await screen.findAllByRole('link', { name: /get directions/i }))[0]
    expect(link.getAttribute('href')).toContain('origin=23.04%2C72.56')

    await waitFor(() => expect(screen.getByText(/by road to Ahmedabad Jan Seva Kendra: 3\.4 km/i)).toBeInTheDocument())
    expect(screen.getByTestId('offices-map-stub')).toHaveAttribute('data-route', 'road')
  })

  it('falls back to straight-line distance when road routing fails', async () => {
    vi.mocked(fetchRoadRoute).mockRejectedValue(new Error('down'))
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/or enter your location/i), { target: { value: 'Navrangpura' } })
    fireEvent.click(screen.getByRole('button', { name: /search place/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Navrangpura, Ahmedabad' }))
    await waitFor(() => expect(screen.getByText(/straight-line distance to Ahmedabad Jan Seva Kendra/i)).toBeInTheDocument())
    expect(screen.getByTestId('offices-map-stub')).toHaveAttribute('data-route', 'straight')
  })

  it('tells the user when the place is not found', async () => {
    vi.mocked(geocodePlace).mockResolvedValue([])
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/or enter your location/i), { target: { value: 'Nowhere land' } })
    fireEvent.click(screen.getByRole('button', { name: /search place/i }))
    expect(await screen.findByText(/no matching place found/i)).toBeInTheDocument()
  })

  it('offers villages for the chosen taluka and sends the village to the search', async () => {
    vi.mocked(fetchTalukasForDistrict).mockResolvedValue(['Dholka', 'Sanand', 'Viramgam'])
    vi.mocked(fetchVillagesForTaluka).mockResolvedValue(['Bol', 'Chandrala', 'Itola'])
    renderPage()
    await loadAhmedabad()

    // Taluka list merges office talukas with the registry's.
    const talukaSelect = screen.getByLabelText(/^taluka/i)
    await waitFor(() => expect(within(talukaSelect).getByRole('option', { name: 'Dholka' })).toBeInTheDocument())
    expect(within(talukaSelect).getByRole('option', { name: 'Ahmedabad City' })).toBeInTheDocument()

    // Village stays disabled until a taluka is picked.
    expect(screen.getByLabelText(/^village/i)).toBeDisabled()

    fireEvent.change(talukaSelect, { target: { value: 'Sanand' } })
    await waitFor(() => expect(fetchVillagesForTaluka).toHaveBeenCalledWith('Ahmedabad', 'Sanand'))
    const villageSelect = await screen.findByLabelText(/^village/i)
    await waitFor(() => expect(within(villageSelect).getByRole('option', { name: 'Bol' })).toBeInTheDocument())

    fireEvent.change(villageSelect, { target: { value: 'Bol' } })
    await waitFor(() => expect(fetchNearbyOffices.mock.calls.at(-1)[0].village).toBe('Bol'))

    // Changing the taluka clears the village.
    fireEvent.change(talukaSelect, { target: { value: 'Dholka' } })
    await waitFor(() => expect(fetchVillagesForTaluka).toHaveBeenCalledWith('Ahmedabad', 'Dholka'))
    await waitFor(() => expect(fetchNearbyOffices.mock.calls.at(-1)[0].village).toBeUndefined())
  })

  it('falls back to a text box when a taluka has no village list', async () => {
    vi.mocked(fetchVillagesForTaluka).mockResolvedValue([])
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/^taluka/i), { target: { value: 'Ahmedabad City' } })
    expect(await screen.findByPlaceholderText(/no list for this taluka/i)).toBeInTheDocument()
  })

  it('explains when a taluka has no office and the district is shown instead', async () => {
    vi.mocked(fetchNearbyOffices).mockResolvedValue({
      offices: [office], widened: true, widenedDistrict: 'Ahmedabad', demoData: true,
    })
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/^taluka/i), { target: { value: 'Ahmedabad City' } })
    expect(await screen.findByText(/no office is listed in Ahmedabad City taluka yet/i)).toBeInTheDocument()
  })

  it('lists villages and city areas that come from the office master when the registry has none', async () => {
    vi.mocked(fetchOfficeFilters).mockResolvedValue({
      districts: ['Ahmedabad'],
      talukasByDistrict: { Ahmedabad: ['Ahmedabad City'] },
      villagesByTaluka: { Ahmedabad: { 'Ahmedabad City': ['Navrangpura', 'Maninagar'] } },
      officeTypes: [],
    })
    vi.mocked(fetchVillagesForTaluka).mockResolvedValue([])
    renderPage()
    await loadAhmedabad()
    fireEvent.change(screen.getByLabelText(/^taluka/i), { target: { value: 'Ahmedabad City' } })
    const villageSelect = await screen.findByLabelText(/^village/i)
    await waitFor(() => expect(within(villageSelect).getByRole('option', { name: 'Navrangpura' })).toBeInTheDocument())
    expect(within(villageSelect).getByRole('option', { name: 'Maninagar' })).toBeInTheDocument()
    expect(within(villageSelect).getByRole('option', { name: /all villages/i })).toBeInTheDocument()
  })
})
