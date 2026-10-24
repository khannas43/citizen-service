import { useEffect, useRef, useState } from 'react'

const AI_BASE = import.meta.env.VITE_AI_BASE ?? '/ai-intelligence-service'
const MAX_RECORD_MS = 60000

/**
 * Shared mic + STT + TTS helpers (ChatWidget hold-to-talk + tap-to-toggle callers).
 */
export function useVoiceRecorder({ language = 'en', speakEnabled = true } = {}) {
  const lang = language === 'gu' ? 'gu' : 'en'
  const [listening, setListening] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceError, setVoiceError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const audioRef = useRef(null)
  const recordTimeoutRef = useRef(null)
  const onStopRef = useRef(null)
  // Bumped by cancel(): results of anything started earlier (recording, STT, TTS) are then discarded.
  const generationRef = useRef(0)
  const cancelledRef = useRef(false)

  useEffect(() => () => {
    clearTimeout(recordTimeoutRef.current)
    mediaRecorderRef.current?.stream?.getTracks()?.forEach((t) => t.stop())
    audioRef.current?.pause()
  }, [])

  async function speakText(text, { force = false } = {}) {
    if ((!force && !speakEnabled) || !text?.trim()) return
    const generation = generationRef.current
    try {
      if (audioRef.current) {
        audioRef.current.pause()
        if (audioRef.current.src) URL.revokeObjectURL(audioRef.current.src)
        audioRef.current = null
      }
      const res = await fetch(`${AI_BASE}/v1/speech/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang }),
      })
      if (!res.ok || generation !== generationRef.current) return
      const blob = await res.blob()
      if (generation !== generationRef.current) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch {
      /* TTS optional */
    }
  }

  async function transcribeBlob(blob) {
    const form = new FormData()
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    form.append('audio', blob, `voice.${ext}`)
    form.append('language', lang)
    const res = await fetch(`${AI_BASE}/v1/speech/stt`, { method: 'POST', body: form })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      const msg = detail.detail || `STT failed (${res.status})`
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      throw err
    }
    const data = await res.json()
    return (data.text || '').trim()
  }

  function stopListening() {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else setListening(false)
  }

  async function startListening({ onTranscript } = {}) {
    if (voiceBusy || listening) return
    setVoiceError(null)
    onStopRef.current = onTranscript || null
    cancelledRef.current = false
    const generation = generationRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        clearTimeout(recordTimeoutRef.current)
        stream.getTracks().forEach((t) => t.stop())
        setListening(false)
        if (cancelledRef.current) {
          cancelledRef.current = false
          chunksRef.current = []
          return
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < 500) {
          setVoiceError(lang === 'gu' ? 'કંઈ સંભળાયું નહીં — ફરી પ્રયાસ કરો.' : 'No speech captured — try again.')
          return
        }
        setVoiceBusy(true)
        try {
          const text = await transcribeBlob(blob)
          if (generation !== generationRef.current) return undefined // cancelled while transcribing
          if (!text) {
            setVoiceError(lang === 'gu' ? 'સમજી શક્યા નહીં — ફરી બોલો.' : 'Could not understand — please speak again.')
            return
          }
          if (onStopRef.current) await onStopRef.current(text)
          return text
        } catch (err) {
          setVoiceError(err.message || (lang === 'gu' ? 'વૉઇસ સેવા ઉપલબ્ધ નથી.' : 'Voice service unavailable.'))
          throw err
        } finally {
          setVoiceBusy(false)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
      recordTimeoutRef.current = setTimeout(stopListening, MAX_RECORD_MS)
    } catch {
      setVoiceError(lang === 'gu' ? 'માઇક્રોફોનની પરવાનગી આપો.' : 'Please allow microphone access.')
      throw new Error('mic_denied')
    }
  }

  function toggleRecording(onTranscript) {
    if (listening) stopListening()
    else startListening({ onTranscript })
  }

  const isMediaSupported = typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'

  function stopPlayback() {
    audioRef.current?.pause()
  }

  /** Abort everything in progress without transcribing: recording, speech-to-text, spoken reply. */
  function cancel() {
    generationRef.current += 1
    clearTimeout(recordTimeoutRef.current)
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      cancelledRef.current = true
      rec.stop()
    } else {
      setListening(false)
    }
    audioRef.current?.pause()
    setVoiceBusy(false)
    setVoiceError(null)
  }

  return {
    lang,
    listening,
    voiceBusy,
    voiceError,
    setVoiceError,
    speakText,
    transcribeBlob,
    startListening,
    stopListening,
    toggleRecording,
    stopPlayback,
    cancel,
    isMediaSupported,
  }
}

export { AI_BASE as VOICE_AI_BASE }
