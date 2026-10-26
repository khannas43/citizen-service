// The state's "local language" slot (second UI language besides English).
// Telangana = 'te'. A different state sets VITE_LOCAL_LANG at build time (e.g. 'ta').
export const LOCAL_LANG = (import.meta.env && import.meta.env.VITE_LOCAL_LANG) || 'te'
export const isLocal = (lng) => typeof lng === 'string' && lng.startsWith(LOCAL_LANG)
