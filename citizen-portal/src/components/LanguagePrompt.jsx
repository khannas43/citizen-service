import i18n from '../i18n'
import { markLanguagePreferenceSet } from '../langPref'

const LANGUAGES = [
  { code: 'en', native: 'English', hint: 'Continue in English' },
  { code: 'gu', native: 'ગુજરાતી', hint: 'ગુજરાતીમાં ચાલુ રાખો' },
  { code: 'hi', native: 'हिन्दी', hint: 'हिन्दी में जारी रखें' },
]

export default function LanguagePrompt({ onDone }) {
  function choose(code) {
    localStorage.setItem('lang', code)
    markLanguagePreferenceSet()
    i18n.changeLanguage(code)
    onDone()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card lang-prompt-card">
        <h2 className="lang-prompt-title">
          Choose your language <span className="lang-prompt-title-sub">ભાષા પસંદ કરો · भाषा चुनें</span>
        </h2>
        <p className="muted lang-prompt-sub">
          You can change this anytime from the language switch in the header.
        </p>
        <div className="lang-prompt-options">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className="lang-prompt-option"
              onClick={() => choose(l.code)}
            >
              <span className="lang-prompt-native">{l.native}</span>
              <span className="lang-prompt-hint">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
