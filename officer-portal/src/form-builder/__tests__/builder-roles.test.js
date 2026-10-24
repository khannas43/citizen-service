import { beforeEach, describe, expect, it } from 'vitest'

import { BUILDER_UX_ROLES, officerHasBuilderUxAccess } from '../builder-roles.js'

function b64url(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Synthetic JWT-shaped placeholder — not a real credential. */
function syntheticToken({ roles = [], expOffsetSec = 3600, corruptPayload = false } = {}) {
  const header = b64url({ alg: 'none', typ: 'JWT' })
  if (corruptPayload) return `${header}.%%%not-json%%%.sig`
  const payload = b64url({
    sub: 'e543a-synthetic-officer',
    exp: Math.floor(Date.now() / 1000) + expOffsetSec,
    realm_access: { roles },
  })
  return `${header}.${payload}.sig`
}

describe('FB-E5.4.3A Builder UX role admission', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it.each(BUILDER_UX_ROLES)('admits when token includes %s alone', (role) => {
    const token = syntheticToken({ roles: [role] })
    localStorage.setItem('officer_token', token)
    expect(officerHasBuilderUxAccess()).toBe(true)
    expect(officerHasBuilderUxAccess(token)).toBe(true)
  })

  it('admits when any one approved Builder role is present with unrelated roles', () => {
    const token = syntheticToken({
      roles: ['IT_ADMIN', 'FDS_GOVERNANCE_READER', 'FDS_DRAFT_CREATOR'],
    })
    expect(officerHasBuilderUxAccess(token)).toBe(true)
  })

  it('denies governance-only roles', () => {
    const token = syntheticToken({
      roles: ['FDS_GOVERNANCE_READER', 'FDS_FORM_APPROVER', 'FDS_FORM_PUBLISHER'],
    })
    expect(officerHasBuilderUxAccess(token)).toBe(false)
  })

  it('denies IT_ADMIN without Builder roles', () => {
    const token = syntheticToken({ roles: ['IT_ADMIN'] })
    expect(officerHasBuilderUxAccess(token)).toBe(false)
  })

  it('fails closed for missing, malformed, or expired tokens', () => {
    expect(officerHasBuilderUxAccess(null)).toBe(false)
    expect(officerHasBuilderUxAccess('')).toBe(false)
    expect(officerHasBuilderUxAccess('not-a-jwt')).toBe(false)
    expect(officerHasBuilderUxAccess(syntheticToken({ corruptPayload: true }))).toBe(false)
    expect(officerHasBuilderUxAccess(syntheticToken({ roles: ['FDS_DRAFT_CREATOR'], expOffsetSec: -10 }))).toBe(
      false,
    )
    expect(officerHasBuilderUxAccess(syntheticToken({ roles: { not: 'array' } }))).toBe(false)
  })

  it('does not write storage keys', () => {
    const before = Object.keys(localStorage)
    officerHasBuilderUxAccess(syntheticToken({ roles: ['FDS_VERSION_READER'] }))
    expect(Object.keys(localStorage)).toEqual(before)
  })
})
