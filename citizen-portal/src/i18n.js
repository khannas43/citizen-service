import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import te from './locales/te.json'
import hi from './locales/hi.json'
import { LOCAL_LANG } from './lang'

const saved = localStorage.getItem('lang') || 'en'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, [LOCAL_LANG]: { translation: te }, hi: { translation: hi } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

function syncLang(lng) {
  document.documentElement.lang = lng
  if (!document.body) return
  document.body.classList.toggle('dg-gu', lng === LOCAL_LANG)
  document.body.classList.toggle('dg-hi', lng === 'hi')
}

syncLang(saved)
i18n.on('languageChanged', syncLang)

export default i18n
