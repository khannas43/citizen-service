import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resolveTechnicalFormServiceId } from '../published-form/technical-service-id.js'

const SERVICE_TILES = [
  { key: 'caste', icon: '📜', path: '/apply/caste' },
  { key: 'marriage', icon: '💒', path: '/apply/marriage' },
  { key: 'pension', icon: '🧓', path: '/apply/pension' },
  { key: 'familyMb', icon: '👨‍👩‍👧', path: '/apply/family-member' },
  { key: 'scheme', icon: '🏛', path: '/apply/scheme' },
]

export default function ApplyPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const technicalServiceId = resolveTechnicalFormServiceId()

  const filtered = SERVICE_TILES.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const name = t(`services.${s.key}`, s.key).toLowerCase()
    const desc = t(`descriptions.${s.key}`, '').toLowerCase()
    return name.includes(q) || desc.includes(q)
  })

  return (
    <div className="apply-page">
      <div className="apply-page-header">
        <button type="button" className="btn-ghost small" onClick={() => navigate('/')}>
          ← {t('applyPage.backHome')}
        </button>
        <h1 className="apply-page-title">{t('applyPage.title')}</h1>
        <p className="muted apply-page-sub">
          {t('applyPage.subtitle')}
        </p>
      </div>

      <div className="caf-promo-banner card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
          <div>
            <strong>📋 {t('applyPage.cafTitle')}</strong>
            <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
              {t('applyPage.cafDesc')}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => navigate('/apply/caf')}>
            {t('applyPage.openCaf')}
          </button>
        </div>
      </div>

      {technicalServiceId ? (
        <div
          className="caf-promo-banner card"
          data-testid="technical-published-form-tile"
          style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
            <div>
              <strong>{t('publishedForm.technicalTileTitle')}</strong>
              <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
                {t('publishedForm.technicalTileDesc')}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate(`/apply/${encodeURIComponent(technicalServiceId)}`)}
            >
              {t('publishedForm.technicalTileOpen')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="apply-page-search-wrap">
        <span className="apps-search-icon">🔍</span>
        <input
          type="text"
          className="apps-search"
          placeholder={t('applyPage.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {search && (
          <button type="button" className="apps-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '2rem 0' }}>
          {t('applyPage.noMatch')} &ldquo;{search}&rdquo;
        </p>
      )}

      <div className="apply-page-grid">
        {filtered.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className="apply-page-tile"
            onClick={() => navigate(tile.path)}
          >
            <span className="apply-page-tile-icon">{tile.icon}</span>
            <div className="apply-page-tile-body">
              <strong className="apply-page-tile-name">{t(`services.${tile.key}`)}</strong>
              <span className="apply-page-tile-desc">{t(`descriptions.${tile.key}`)}</span>
            </div>
            <span className="apply-page-tile-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}
