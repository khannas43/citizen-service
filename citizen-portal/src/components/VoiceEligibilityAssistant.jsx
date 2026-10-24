import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { extractVoiceProfile, fetchGuestEligibility } from '../api'
import {
  buildPayloadFromSlots,
  CASTE_OPTIONS,
  DISTRICTS,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  EMPLOYMENT_OPTIONS,
} from '../guestEligibility/eligibilityShared'
import {
  buildEligibilitySpeechSummary,
  containsLongDigitSequence,
  formToVoiceSlots,
  mergeVoiceSlots,
  missingRequiredFromSlots,
  nextRequiredField,
  slotsToFormPatch,
} from '../guestEligibility/voiceConversation'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import './VoiceEligibilityAssistant.css'

const CHIP_FIELDS = [
  { key: 'age', labelKey: 'age' },
  { key: 'gender', labelKey: 'gender' },
  { key: 'casteCategory', labelKey: 'caste' },
  { key: 'district', labelKey: 'district' },
  { key: 'maritalStatus', labelKey: 'maritalStatus' },
  { key: 'employmentStatus', labelKey: 'employment' },
  { key: 'annualIncome', labelKey: 'income' },
  { key: 'village', labelKey: 'village' },
]

export default function VoiceEligibilityAssistant({
  form,
  setForm,
  onResult,
  onCheckStart,
  onCheckEnd,
  onReset,
}) {
  const { t } = useTranslation()
  const lang = i18n.language === 'gu' ? 'gu' : 'en'
  const [open, setOpen] = useState(false)
  const [privacyOk, setPrivacyOk] = useState(false)
  const [slots, setSlots] = useState(() => formToVoiceSlots(form))
  const [transcript, setTranscript] = useState('')
  const [assistantMsg, setAssistantMsg] = useState('')
  const [phase, setPhase] = useState('idle')
  const [speakReplies, setSpeakReplies] = useState(true)
  const [guardrailSpoken, setGuardrailSpoken] = useState(false)
  const [refineOffered, setRefineOffered] = useState(false)
  // Age and income are read back for a click before the check runs: speech recognition can mishear a number
  // and still look confident. `confirmedRef` holds the values the user has approved or typed themselves.
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const confirmedRef = useRef({})
  // Bumped on reset: anything still in flight from before the reset must not touch the new session.
  const runIdRef = useRef(0)

  const {
    listening,
    voiceBusy,
    voiceError,
    setVoiceError,
    speakText,
    startListening,
    stopListening,
    cancel,
    isMediaSupported,
  } = useVoiceRecorder({ language: lang, speakEnabled: speakReplies })

  useEffect(() => {
    setSlots((prev) => mergeVoiceSlots(prev, formToVoiceSlots(form)))
  }, [form.gender, form.casteCategory, form.district, form.age, form.dob, form.maritalStatus, form.employmentStatus, form.annualIncome, form.village])

  const missing = useMemo(() => missingRequiredFromSlots(slots), [slots])

  const applySlotsToForm = useCallback((nextSlots) => {
    const patch = slotsToFormPatch(nextSlots)
    if (Object.keys(patch).length) {
      setForm((f) => ({ ...f, ...patch }))
    }
  }, [setForm])

  const say = useCallback(async (text) => {
    if (!text) return
    setAssistantMsg(text)
    await speakText(text)
  }, [speakText])

  const runEligibility = useCallback(async (nextSlots) => {
    const runId = runIdRef.current
    setPhase('thinking')
    onCheckStart?.()
    try {
      const data = await fetchGuestEligibility(buildPayloadFromSlots(nextSlots))
      if (runId !== runIdRef.current) return // reset while we were waiting
      onResult?.(data)
      setPhase('speaking')
      let speech = buildEligibilitySpeechSummary(data, lang, t)
      if (!guardrailSpoken) {
        speech = `${t('voiceEligibility.guardrail')} ${speech}`
        setGuardrailSpoken(true)
      }
      await say(speech)
      if (!refineOffered && (data.possibleCount ?? 0) > 0) {
        setRefineOffered(true)
        await say(t('voiceEligibility.refineOnce'))
      }
    } catch (err) {
      setAssistantMsg(err.message || t('voiceEligibility.errorGeneric'))
    } finally {
      setPhase('idle')
      onCheckEnd?.()
    }
  }, [guardrailSpoken, lang, onCheckEnd, onCheckStart, onResult, refineOffered, say, t])

  const confirmIfNeeded = useCallback(async (nextSlots) => {
    const heard = {}
    if (nextSlots.age != null && nextSlots.age !== confirmedRef.current.age) heard.age = nextSlots.age
    if (nextSlots.annualIncome != null && nextSlots.annualIncome !== confirmedRef.current.annualIncome) {
      heard.annualIncome = nextSlots.annualIncome
    }
    if (!Object.keys(heard).length) return false
    setPendingConfirm(heard)
    const what = [
      heard.age != null ? t('voiceEligibility.confirmAge', { age: heard.age }) : null,
      heard.annualIncome != null
        ? t('voiceEligibility.confirmIncome', { income: Number(heard.annualIncome).toLocaleString('en-IN') })
        : null,
    ].filter(Boolean).join(', ')
    setPhase('speaking')
    await say(t('voiceEligibility.confirmPrompt', { what }))
    setPhase('idle')
    return true
  }, [say, t])

  const processTranscript = useCallback(async (text) => {
    const runId = runIdRef.current
    setTranscript(text)
    setVoiceError(null)
    if (containsLongDigitSequence(text)) {
      await say(t('voiceEligibility.noSensitiveNumbers'))
      return
    }
    setPhase('thinking')
    try {
      const res = await extractVoiceProfile({ transcript: text, language: lang, priorSlots: slots })
      if (runId !== runIdRef.current) return // reset while we were waiting
      if (res.blocked) {
        await say(t('voiceEligibility.noSensitiveNumbers'))
        setPhase('idle')
        return
      }
      const merged = mergeVoiceSlots(slots, res.slots || {})
      setSlots(merged)
      applySlotsToForm(merged)
      const miss = missingRequiredFromSlots(merged)
      if (miss.length) {
        const field = nextRequiredField(miss)
        const promptKey = `voiceEligibility.ask.${field}`
        setPhase('speaking')
        await say(t(promptKey))
        setPhase('idle')
        return
      }
      if (await confirmIfNeeded(merged)) return
      await runEligibility(merged)
    } catch (err) {
      const status = err.status
      if (status === 429) {
        setAssistantMsg(t('voiceEligibility.rateLimit'))
      } else {
        setAssistantMsg(err.message || t('voiceEligibility.errorGeneric'))
      }
      setPhase('idle')
    }
  }, [applySlotsToForm, confirmIfNeeded, lang, runEligibility, say, setVoiceError, slots, t])

  async function onMicClick() {
    if (!privacyOk || !isMediaSupported || phase === 'thinking' || voiceBusy) return
    if (listening) {
      stopListening()
      return
    }
    setPhase('listening')
    try {
      await startListening({
        onTranscript: async (text) => {
          setPhase('transcribing')
          await processTranscript(text)
        },
      })
    } catch {
      setPhase('idle')
    }
  }

  function updateChip(key, value) {
    const next = mergeVoiceSlots(slots, { [key]: value === '' ? undefined : value })
    if (key === 'annualIncome' && value !== '') {
      const digits = String(value).replace(/[^\d]/g, '')
      next.annualIncome = digits ? Number(digits) : undefined
    }
    if (key === 'age' && value !== '') next.age = Number(value)
    setSlots(next)
    applySlotsToForm(next)
    if (key === 'age' || key === 'annualIncome') {
      confirmedRef.current = { ...confirmedRef.current, [key]: next[key] }   // typed by the user: no need to ask again
      setPendingConfirm((p) => {
        if (!p) return p
        const { [key]: _gone, ...rest } = p
        return Object.keys(rest).length ? rest : null
      })
    }
  }

  function onConfirm() {
    confirmedRef.current = { age: slots.age, annualIncome: slots.annualIncome }
    setPendingConfirm(null)
    runEligibility(slots)
  }

  const hasActivity = Boolean(
    transcript || assistantMsg || voiceError || listening || voiceBusy || phase !== 'idle'
    || Object.values(slots || {}).some((v) => v !== undefined && v !== null && v !== ''),
  )

  function handleReset() {
    runIdRef.current += 1
    cancel() // stop recording / transcription / spoken reply without processing them
    setTranscript('')
    setAssistantMsg('')
    setSlots({})
    setPhase('idle')
    setGuardrailSpoken(false)
    setRefineOffered(false)
    setPendingConfirm(null)
    confirmedRef.current = {}
    onCheckEnd?.()
    onReset?.() // the page clears the form, the results and the saved session
  }

  const statusLabel = listening
    ? t('voiceEligibility.statusListening')
    : voiceBusy || phase === 'transcribing'
      ? t('voiceEligibility.statusTranscribing')
      : phase === 'thinking'
        ? t('voiceEligibility.statusThinking')
        : phase === 'speaking'
          ? t('voiceEligibility.statusSpeaking')
          : ''

  return (
    <section className="voice-eligibility card" aria-label={t('voiceEligibility.title')}>
      <button type="button" className="voice-eligibility-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="voice-eligibility-icon" aria-hidden="true">🎤</span>
        <span className="voice-eligibility-heading">
          <span className="voice-eligibility-title">{t('voiceEligibility.title')}</span>
          <span className="voice-eligibility-hint">{t('voiceEligibility.subtitle')}</span>
        </span>
        <span className="voice-eligibility-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="voice-eligibility-body">
          {!privacyOk && (
            <div className="voice-privacy-notice" role="dialog">
              <p>{t('voiceEligibility.privacyNotice')}</p>
              <button type="button" className="btn-primary" onClick={() => setPrivacyOk(true)}>
                {t('voiceEligibility.privacyContinue')}
              </button>
            </div>
          )}

          {privacyOk && !isMediaSupported && (
            <p className="voice-error" role="alert">{t('voiceEligibility.unsupportedBrowser')}</p>
          )}

          {privacyOk && isMediaSupported && (
            <>
              <div className="voice-controls">
                <button
                  type="button"
                  className={`voice-mic-btn ${listening ? 'active' : ''}`}
                  onClick={onMicClick}
                  disabled={phase === 'thinking'}
                  aria-pressed={listening}
                >
                  {listening ? '⏹' : '🎤'}
                </button>
                <span className="voice-status">{statusLabel}</span>
                <button
                  type="button"
                  className="voice-reset-btn"
                  onClick={handleReset}
                  disabled={!hasActivity}
                  title={t('voiceEligibility.resetHint')}
                >
                  <span aria-hidden="true">↺</span> {t('voiceEligibility.reset')}
                </button>
                <label className="voice-mute">
                  <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
                  {t('voiceEligibility.speakReplies')}
                </label>
              </div>

              {(voiceError || assistantMsg) && (
                <p className={voiceError ? 'voice-error' : 'voice-assistant-msg'} role="status">
                  {voiceError || assistantMsg}
                </p>
              )}

              {transcript && (
                <p className="voice-transcript">
                  <span className="small muted">{t('voiceEligibility.lastHeard')}</span> {transcript}
                </p>
              )}

              <div className="voice-slots">
                <span className="small muted">{t('voiceEligibility.extractedProfile')}</span>
                <div className="voice-chips">
                  {CHIP_FIELDS.map(({ key, labelKey }) => (
                    <label key={key} className="voice-chip">
                      <span>{t(`eligibilityCheck.${labelKey}`, { defaultValue: key })}</span>
                      {key === 'gender' && (
                        <select value={slots.gender || ''} onChange={(e) => updateChip('gender', e.target.value)}>
                          <option value="">—</option>
                          {GENDER_OPTIONS.map((g) => (
                            <option key={g.value} value={g.value}>{t(`eligibilityCheck.${g.labelKey}`)}</option>
                          ))}
                        </select>
                      )}
                      {key === 'casteCategory' && (
                        <select value={slots.casteCategory || ''} onChange={(e) => updateChip('casteCategory', e.target.value)}>
                          <option value="">—</option>
                          {CASTE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      {key === 'district' && (
                        <select value={slots.district || ''} onChange={(e) => updateChip('district', e.target.value)}>
                          <option value="">—</option>
                          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                      {key === 'maritalStatus' && (
                        <select value={slots.maritalStatus || ''} onChange={(e) => updateChip('maritalStatus', e.target.value)}>
                          <option value="">—</option>
                          {MARITAL_OPTIONS.map((v) => (
                            <option key={v} value={v}>{t(`eligibilityCheck.marital.${v}`, { defaultValue: v })}</option>
                          ))}
                        </select>
                      )}
                      {key === 'employmentStatus' && (
                        <select value={slots.employmentStatus || ''} onChange={(e) => updateChip('employmentStatus', e.target.value)}>
                          <option value="">—</option>
                          {EMPLOYMENT_OPTIONS.map((v) => (
                            <option key={v} value={v}>{t(`eligibilityCheck.employmentOpt.${v}`, { defaultValue: v })}</option>
                          ))}
                        </select>
                      )}
                      {!['gender', 'casteCategory', 'district', 'maritalStatus', 'employmentStatus'].includes(key) && (
                        <input
                          type="text"
                          value={key === 'annualIncome' && slots.annualIncome != null ? String(slots.annualIncome) : (slots[key] ?? '')}
                          onChange={(e) => updateChip(key, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
                {missing.length > 0 && (
                  <p className="small muted">{t('voiceEligibility.missingRequired', { count: missing.length })}</p>
                )}
                {pendingConfirm && missing.length === 0 && (
                  <div className="voice-confirm" role="alert">
                    <p>
                      {t('voiceEligibility.confirmPrompt', {
                        what: [
                          slots.age != null && pendingConfirm.age != null ? t('voiceEligibility.confirmAge', { age: slots.age }) : null,
                          slots.annualIncome != null && pendingConfirm.annualIncome != null
                            ? t('voiceEligibility.confirmIncome', { income: Number(slots.annualIncome).toLocaleString('en-IN') })
                            : null,
                        ].filter(Boolean).join(', '),
                      })}
                    </p>
                    <button type="button" className="btn-primary small" onClick={onConfirm} disabled={phase === 'thinking'}>
                      {t('voiceEligibility.confirmButton')}
                    </button>
                  </div>
                )}
                {missing.length === 0 && !pendingConfirm && (
                  <button
                    type="button"
                    className="btn-secondary small voice-run-check"
                    onClick={() => { confirmedRef.current = { age: slots.age, annualIncome: slots.annualIncome }; runEligibility(slots) }}
                    disabled={phase === 'thinking'}
                  >
                    {t('voiceEligibility.runCheck')}
                  </button>
                )}
              </div>

              <p className="muted small">{t('voiceEligibility.fallbackForm')}</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
