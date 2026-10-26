import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { sendChatMessage } from '../api'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import i18n from '../i18n'
import './ChatWidget.css'
import { LOCAL_LANG } from '../lang'

const MAX_RECORD_MS = 60000

const WELCOME_INTRO = {
  en: 'Welcome to Citizen Services! I can help you:',
  [LOCAL_LANG]: 'పౌర సేవలకు స్వాగతం! నేను మీకు సహాయం చేయగలను:',
}

const WELCOME_BULLETS = {
  en: [
    'Track applications & payment status',
    'Find schemes your family qualifies for',
    'Access certificates, consents & grievances',
  ],
  [LOCAL_LANG]: [
    'దరఖాస్తులు & చెల్లింపుల స్థితిని ట్రాక్ చేయండి',
    'మీ కుటుంబానికి అర్హత ఉన్న పథకాలు కనుగొనండి',
    'సర్టిఫికెట్లు, సమ్మతులు & ఫిర్యాదులు',
  ],
}

const WELCOME_FOOTER = {
  en: 'Type a message, or hold the mic to speak.',
  [LOCAL_LANG]: 'సందేశం టైప్ చేయండి, లేదా మైక్ నొక్కి మాట్లాడండి.',
}

const RESET_LABEL = {
  en: 'Reset',
  [LOCAL_LANG]: 'రీసెట్',
}

const QUICK_ACTIONS = {
  en: [
    { label: 'Check application status', send: 'Check application status' },
    { label: 'Find eligible schemes', send: 'What schemes am I eligible for' },
    { label: 'Apply for Caste Certificate', send: 'Apply for Caste Certificate' },
    { label: 'Check my payments & benefits', send: 'Show my payments and benefits' },
    { label: 'Download my certificates', send: 'Show my certificates' },
    { label: 'Submit a complaint / grievance', send: 'I want to file a grievance' },
  ],
  [LOCAL_LANG]: [
    { label: 'దరఖాస్తు స్థితి తనిఖీ', send: 'Check application status' },
    { label: 'అర్హత ఉన్న పథకాలు', send: 'What schemes am I eligible for' },
    { label: 'కుల ధృవీకరణ దరఖాస్తు', send: 'Apply for Caste Certificate' },
    { label: 'చెల్లింపులు & ప్రయోజనాలు', send: 'Show my payments and benefits' },
    { label: 'నా సర్టిఫికెట్లు', send: 'Show my certificates' },
    { label: 'ఫిర్యాదు నమోదు', send: 'I want to file a grievance' },
  ],
}

const NAVIGATE_INTENTS = [
  // Scheme / CAF applications (before generic apply routes)
  ['apply bpl', '/apply/caf'],
  ['bpl ration', '/apply/caf'],
  ['ration card', '/apply/caf'],
  ['apply ration', '/apply/caf'],
  ['common application form', '/apply/caf'],
  ['apply for scheme', '/apply/caf'],
  ['welfare scheme', '/apply/caf'],
  ['apply caste', '/apply/caste'],
  ['apply pension', '/apply/pension'],
  ['apply marriage', '/apply/marriage'],
  ['apply scheme', '/apply/scheme'],
  ['apply family member', '/apply/family-member'],
  ['go to payments', '/payments'],
  ['payments & benefits', '/payments'],
  ['payments page', '/payments'],
  ['go to certificates', '/certificates'],
  ['certificates section', '/certificates'],
  ['my certificates page', '/certificates'],
  ['certificates page', '/certificates'],
  ['go to notifications', '/notifications'],
  ['go to grievances', '/grievances'],
  ['file a grievance', '/grievances'],
  ['grievances page', '/grievances'],
  ['go to my family', '/my-family'],
  ['family registry', '/my-family'],
  ['go to contact', '/contact'],
  ['my data & consent', '/my-consents'],
  ['data export', '/my-consents'],
]

const NAV_LABELS = {
  en: {
    '/payments': 'Go to Payments →',
    '/certificates': 'Go to Certificates →',
    '/notifications': 'Go to Notifications →',
    '/contact': 'Go to Contact Centre →',
    '/my-consents': 'Go to My Data & Consent →',
    '/grievances': 'Go to Grievances →',
    '/apply/caste': 'Apply for Caste Certificate →',
    '/apply/pension': 'Apply for Pension →',
    '/apply/marriage': 'Apply for Marriage Certificate →',
    '/apply/scheme': 'Apply for Scheme →',
    '/apply/caf': 'Apply via Common Application Form →',
    '/apply/family-member': 'Apply for Family Member Change →',
    '/my-family': 'Go to My Family →',
  },
  [LOCAL_LANG]: {
    '/payments': 'చెల్లింపులు & ప్రయోజనాలు →',
    '/certificates': 'సర్టిఫికెట్లు →',
    '/notifications': 'నోటిఫికేషన్లు →',
    '/contact': 'సంప్రదింపు కేంద్రం →',
    '/my-consents': 'నా డేటా & సమ్మతి →',
    '/grievances': 'ఫిర్యాదులు →',
    '/apply/caste': 'కుల ధృవీకరణ దరఖాస్తు →',
    '/apply/pension': 'పింఛన్ దరఖాస్తు →',
    '/apply/marriage': 'వివాహ ధృవీకరణ దరఖాస్తు →',
    '/apply/scheme': 'పథకం దరఖాస్తు →',
    '/apply/caf': 'CAF దరఖాస్తు ఫారం →',
    '/apply/family-member': 'కుటుంబ సభ్యుల మార్పు దరఖాస్తు →',
    '/my-family': 'నా కుటుంబం →',
  },
}

function detectNavigateIntent(replyText) {
  const trimmed = replyText.trim()
  // Generic welcome / menu replies should not offer navigation buttons
  if (/^welcome to citizen services/i.test(trimmed)) return null
  if (/^(పౌర సేవలకు స్వాగతం|ડિજિટલ ગુજરાતમાં સ્વાગત)/i.test(trimmed)) return null
  const lower = replyText.toLowerCase()
  for (const [keyword, route] of NAVIGATE_INTENTS) {
    if (lower.includes(keyword)) return route
  }
  return null
}

function BotMessage({ message, lang, onNavigate, onSpeak }) {
  if (message.kind === 'welcome') {
    return (
      <span className={`chat-bubble-msg ${lang === LOCAL_LANG ? 'dg-gu' : ''}`}>
        {WELCOME_INTRO[lang]}
        <ul className="chat-welcome-actions" style={{ listStyle: 'disc', paddingLeft: '1.25rem' }}>
          {WELCOME_BULLETS[lang].map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        {WELCOME_FOOTER[lang]}
      </span>
    )
  }

  if (message.kind === 'navigate') {
    return (
      <span className={`chat-bubble-msg ${lang === LOCAL_LANG ? 'dg-gu' : ''}`}>
        <button
          type="button"
          className="chat-nav-btn"
          onClick={() => onNavigate(message.route)}
        >
          {message.label}
        </button>
      </span>
    )
  }

  const navRoute = message.route
  const navLabel = message.label

  return (
    <span className={`chat-bubble-msg ${lang === LOCAL_LANG ? 'dg-gu' : ''}`}>
      {message.text.split('\n').map((line, j) => (
        <span key={j}>{line}<br /></span>
      ))}
      <span className="chat-msg-actions">
        {onSpeak && (
          <button
            type="button"
            className="chat-speak-btn"
            onClick={onSpeak}
            aria-label={lang === LOCAL_LANG ? 'వినండి' : 'Listen'}
            title={lang === LOCAL_LANG ? 'వినండి' : 'Listen'}
          >
            🔊
          </button>
        )}
        {navRoute && navLabel && (
          <button
            type="button"
            className="chat-nav-btn"
            onClick={() => onNavigate(navRoute)}
          >
            {navLabel}
          </button>
        )}
      </span>
    </span>
  )
}

export default function ChatWidget() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = JSON.parse(localStorage.getItem('citizen_profile') || 'null')
  const aadhaarRef = profile?.aadhaarRef || null

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [unread, setUnread] = useState(0)
  const [speakReplies, setSpeakReplies] = useState(true)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const recordTimeoutRef = useRef(null)

  const lang = i18n.language === LOCAL_LANG ? LOCAL_LANG : 'en'
  const {
    listening,
    voiceBusy,
    voiceError,
    setVoiceError,
    speakText,
    startListening: captureVoice,
    stopListening: endVoiceCapture,
    stopPlayback,
  } = useVoiceRecorder({ language: lang, speakEnabled: speakReplies })

  useEffect(() => {
    setMessages([{ role: 'bot', kind: 'welcome' }])
  }, [lang])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => () => {
    clearTimeout(recordTimeoutRef.current)
    stopPlayback()
  }, [stopPlayback])

  async function startListening() {
    if (sending || voiceBusy || listening) return
    setVoiceError(null)
    try {
      await captureVoice({
        onTranscript: (text) => setInput(text),
      })
      recordTimeoutRef.current = setTimeout(endVoiceCapture, MAX_RECORD_MS)
    } catch {
      /* hook sets voiceError */
    }
  }

  function stopListening() {
    endVoiceCapture()
  }

  function handleNavigate(route) {
    navigate(route)
    setOpen(false)
  }

  function toggleOpen() {
    setOpen((prev) => {
      if (!prev) setUnread(0)
      return !prev
    })
    if (!open) setTimeout(() => inputRef.current?.focus(), 100)
  }

  function handleReset() {
    if (sending) return
    stopPlayback()
    setSessionId(crypto.randomUUID())
    setMessages([{ role: 'bot', kind: 'welcome' }])
    setInput('')
    setUnread(0)
    setVoiceError(null)
  }

  async function handleSend(textOverride) {
    const text = (textOverride ?? input).trim()
    if (!text || sending) return
    setInput('')
    setVoiceError(null)
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', text }])
    try {
      const res = await sendChatMessage(sessionId, text, lang, aadhaarRef, location.pathname)
      const route = res.navigateTo || detectNavigateIntent(res.reply)
      const botMessage = { role: 'bot', text: res.reply }
      if (route) {
        botMessage.route = route
        botMessage.label = NAV_LABELS[lang][route]
      }
      setMessages((prev) => [...prev, botMessage])
      if (!open) setUnread((n) => n + 1)
      speakText(res.reply)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: lang === LOCAL_LANG
            ? 'కనెక్ట్ కాలేకపోయాము. మళ్లీ ప్రయత్నించండి.'
            : 'Could not connect. Please try again.',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const showQuickChips = messages.length <= 1 && !sending
  const micDisabled = sending || voiceBusy

  return (
    <>
      <button className="chat-bubble" onClick={toggleOpen} type="button" aria-label="Chat assistant">
        {open ? '✕' : '💬'}
        {!open && unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>

      {open && (
        <div className="chat-panel dg-slide-right">
          <div className="chat-panel-header">
            <span className="chat-panel-title">
              {lang === LOCAL_LANG ? '🤖 పౌర సేవల సహాయకుడు' : '🤖 Citizen Services Assistant'}
            </span>
            <div className="chat-header-actions">
              <button
                type="button"
                className={`chat-tts-toggle${speakReplies ? ' on' : ''}`}
                onClick={() => setSpeakReplies((v) => !v)}
                title={lang === LOCAL_LANG ? 'సమాధానాలు చదివి వినిపించు' : 'Speak replies'}
              >
                {speakReplies ? '🔊' : '🔇'}
              </button>
              <button
                type="button"
                className="chat-reset-btn"
                onClick={handleReset}
                disabled={sending}
                aria-label={RESET_LABEL[lang]}
              >
                ↺ {RESET_LABEL[lang]}
              </button>
              <span className="chat-live">
                <span className="dg-live-dot" />
                {lang === LOCAL_LANG ? 'ఆన్‌లైన్' : 'Online'}
              </span>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                {m.role === 'bot' ? (
                  <BotMessage
                    message={m}
                    lang={lang}
                    onNavigate={handleNavigate}
                    onSpeak={m.text?.trim() ? () => speakText(m.text, { force: true }) : undefined}
                  />
                ) : (
                  <span className={`chat-bubble-msg ${lang === LOCAL_LANG ? 'dg-gu' : ''}`}>{m.text}</span>
                )}
              </div>
            ))}
            {sending && (
              <div className="chat-msg chat-msg-bot">
                <span className="chat-typing"><span /><span /><span /></span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {showQuickChips && (
            <div className="chat-quick-chips">
              {QUICK_ACTIONS[lang].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="chat-chip"
                  onClick={() => handleSend(action.send)}
                >
                  <span className={lang === LOCAL_LANG ? 'dg-gu' : undefined}>{action.label}</span>
                </button>
              ))}
            </div>
          )}

          {(listening || voiceBusy || voiceError) && (
            <div className={`chat-voice-status${listening ? ' listening' : ''}`}>
              {listening && (lang === LOCAL_LANG ? '🎙 వింటున్నాము… ఆపడానికి వదలండి' : '🎙 Listening… release to stop')}
              {voiceBusy && (lang === LOCAL_LANG ? '⏳ గొంతును అర్థం చేసుకుంటున్నాము…' : '⏳ Transcribing…')}
              {voiceError && <span className="chat-voice-error">{voiceError}</span>}
            </div>
          )}

          <div className="chat-input-row">
            <button
              type="button"
              className={`chat-mic-btn${listening ? ' listening' : ''}`}
              disabled={micDisabled}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={() => { if (listening) stopListening() }}
              onTouchStart={(e) => { e.preventDefault(); startListening() }}
              onTouchEnd={(e) => { e.preventDefault(); stopListening() }}
              aria-label={lang === LOCAL_LANG ? 'వాయిస్' : 'Voice'}
              title={lang === LOCAL_LANG ? 'నొక్కి పట్టి మాట్లాడండి' : 'Hold to speak'}
            >
              {listening ? '⏹' : '🎤'}
            </button>
            <input
              ref={inputRef}
              className={`chat-input ${lang === LOCAL_LANG ? 'dg-gu' : ''}`}
              placeholder={lang === LOCAL_LANG ? 'సందేశం రాయండి…' : 'Type a message…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending}
            />
            <button
              type="button"
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}
