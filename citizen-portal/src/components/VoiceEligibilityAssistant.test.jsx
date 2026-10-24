import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import VoiceEligibilityAssistant from './VoiceEligibilityAssistant'
import '../i18n'

const recorder = {
  listening: false,
  voiceBusy: false,
  voiceError: null,
  setVoiceError: vi.fn(),
  speakText: vi.fn().mockResolvedValue(undefined),
  startListening: vi.fn(),
  stopListening: vi.fn(),
  cancel: vi.fn(),
  isMediaSupported: true,
}

vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: () => recorder }))
vi.mock('../api', () => ({
  extractVoiceProfile: vi.fn(),
  fetchGuestEligibility: vi.fn(),
}))

import { extractVoiceProfile, fetchGuestEligibility } from '../api'

const emptyForm = { dob: '', age: '', gender: '', casteCategory: '', district: '', maritalStatus: '', employmentStatus: '', annualIncome: '', village: '' }

function renderAssistant(props = {}) {
  const onReset = vi.fn()
  const setForm = vi.fn()
  const onResult = vi.fn()
  render(
    <VoiceEligibilityAssistant
      form={emptyForm}
      setForm={setForm}
      onResult={onResult}
      onCheckStart={vi.fn()}
      onCheckEnd={vi.fn()}
      onReset={onReset}
      {...props}
    />,
  )
  return { onReset, setForm, onResult }
}

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /voice eligibility assistant/i }))
  fireEvent.click(await screen.findByRole('button', { name: /continue/i }))
}

describe('VoiceEligibilityAssistant reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recorder.startListening.mockReset()
    extractVoiceProfile.mockReset()
    fetchGuestEligibility.mockReset()
  })

  it('has a Reset button that is disabled until there is something to reset', async () => {
    renderAssistant()
    await openPanel()
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled()
  })

  it('clears what was heard, cancels recording and tells the page to start over', async () => {
    recorder.startListening.mockImplementation(async ({ onTranscript }) => { await onTranscript('I am 40 years old') })
    extractVoiceProfile.mockResolvedValue({ slots: { age: 40 }, missing: ['gender', 'casteCategory', 'district'] })
    const { onReset } = renderAssistant()
    await openPanel()

    fireEvent.click(screen.getByRole('button', { name: /^🎤$|🎤/ }))
    expect(await screen.findByText('I am 40 years old')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))

    await waitFor(() => expect(screen.queryByText('I am 40 years old')).toBeNull())
    expect(recorder.cancel).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled()
  })

  it('ignores a reply that arrives after the user pressed Reset', async () => {
    let resolveExtract
    extractVoiceProfile.mockImplementation(() => new Promise((resolve) => { resolveExtract = resolve }))
    recorder.startListening.mockImplementation(async ({ onTranscript }) => { await onTranscript('I am a widow, OBC, Ahmedabad, 40 years') })
    const { setForm, onResult } = renderAssistant()
    await openPanel()

    const mic = screen.getByRole('button', { name: /🎤/ })
    // the recording callback awaits the extract call, so do not await the click
    act(() => { fireEvent.click(mic) })
    await waitFor(() => expect(extractVoiceProfile).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    setForm.mockClear()

    await act(async () => {
      resolveExtract({ slots: { age: 40, gender: 'F', casteCategory: 'OBC', district: 'Ahmedabad' }, missing: [] })
    })

    expect(setForm).not.toHaveBeenCalled()
    expect(fetchGuestEligibility).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
  })
})

describe('VoiceEligibilityAssistant age and income confirmation', () => {
  const full = { age: 36, gender: 'F', casteCategory: 'OBC', district: 'Ahmedabad', annualIncome: 120000 }

  beforeEach(() => {
    vi.clearAllMocks()
    recorder.startListening.mockReset()
    extractVoiceProfile.mockReset()
    fetchGuestEligibility.mockReset()
    fetchGuestEligibility.mockResolvedValue({ possibleCount: 0, eligibleCount: 0, results: [] })
    recorder.startListening.mockImplementation(async ({ onTranscript }) => { await onTranscript('spoken profile') })
    extractVoiceProfile.mockResolvedValue({ slots: full, missing: [] })
  })

  it('reads age and income back and waits for a click before checking eligibility', async () => {
    renderAssistant()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('age 36 years')
    expect(alert).toHaveTextContent('1,20,000')
    expect(fetchGuestEligibility).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /confirm and check/i }))
    await waitFor(() => expect(fetchGuestEligibility).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not ask again for values already confirmed', async () => {
    renderAssistant()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm and check/i }))
    await waitFor(() => expect(fetchGuestEligibility).toHaveBeenCalledTimes(1))

    extractVoiceProfile.mockResolvedValue({ slots: { maritalStatus: 'WIDOWED' }, missing: [] })
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))
    await waitFor(() => expect(fetchGuestEligibility).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: /confirm and check/i })).toBeNull()
  })

  it('asks again when a later utterance changes the age', async () => {
    renderAssistant()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm and check/i }))
    await waitFor(() => expect(fetchGuestEligibility).toHaveBeenCalledTimes(1))

    extractVoiceProfile.mockResolvedValue({ slots: { age: 40 }, missing: [] })
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('age 40 years')
    expect(fetchGuestEligibility).toHaveBeenCalledTimes(1)
  })

  it('clears the confirmation on Reset', async () => {
    renderAssistant()
    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: /🎤/ }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
