import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import gu from './locales/gu.json'

const saved = localStorage.getItem('lang') || 'en'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, gu: { translation: gu } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

function syncLang(lng) {
  document.documentElement.lang = lng
  document.body.classList.toggle('dg-gu', lng === 'gu')
}

syncLang(saved)
i18n.on('languageChanged', syncLang)

export default i18n
