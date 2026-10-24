import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import gu from './locales/gu.json'
import hi from './locales/hi.json'

const saved = localStorage.getItem('lang') || 'en'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, gu: { translation: gu }, hi: { translation: hi } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

function syncLang(lng) {
  document.documentElement.lang = lng
  if (!document.body) return
  document.body.classList.toggle('dg-gu', lng === 'gu')
  document.body.classList.toggle('dg-hi', lng === 'hi')
}

syncLang(saved)
i18n.on('languageChanged', syncLang)

export default i18n
