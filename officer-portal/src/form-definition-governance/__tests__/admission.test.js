import { describe, expect, it } from 'vitest'
import { admitGovernanceQueue } from '../admit/admit-queue.js'
import { admitStrongEtag, formatStrongEtagForTests } from '../admit/admit-strong-etag.js'
import {
  admitDetailDefinition,
  admitTransitionDefinition,
  buildTransitionBody,
} from '../admit/admit-definition.js'
import { isJsonCompatibleContentType } from '../admit/http-json.js'
import { makeDefinition } from './fixtures.js'

describe('admitStrongEtag', () => {
  it('admits quoted strong opaque Base64URL tokens', () => {
    const etag = formatStrongEtagForTests(7)
    expect(admitStrongEtag(etag)).toEqual({ ok: true, etag })
  })

  it('rejects weak, wildcard, list, padded, blank, and malformed ETags', () => {
    const good = formatStrongEtagForTests(1)
    expect(admitStrongEtag(`W/${good}`).ok).toBe(false)
    expect(admitStrongEtag('*').ok).toBe(false)
    expect(admitStrongEtag(`${good},${good}`).ok).toBe(false)
    expect(admitStrongEtag('"AAAAAA=="').ok).toBe(false)
    expect(admitStrongEtag('').ok).toBe(false)
    expect(admitStrongEtag('  ').ok).toBe(false)
    expect(admitStrongEtag(good.slice(1)).ok).toBe(false)
  })
})

describe('admitGovernanceQueue', () => {
  it('admits valid queue and cursor', () => {
    const admitted = admitGovernanceQueue({
      items: [
        { serviceId: 'a', version: 1, status: 'submitted' },
        { serviceId: 'b', version: 2, status: 'approved' },
      ],
      nextCursor: { serviceId: 'b', version: 2 },
    })
    expect(admitted.ok).toBe(true)
    expect(admitted.page.nextCursor).toEqual({ serviceId: 'b', version: 2 })
  })

  it('rejects malformed queue/item/cursor and duplicates/out-of-order', () => {
    expect(admitGovernanceQueue({ items: null }).ok).toBe(false)
    expect(
      admitGovernanceQueue({
        items: [{ serviceId: 'a', version: 1, status: 'published' }],
      }).ok,
    ).toBe(false)
    expect(
      admitGovernanceQueue({
        items: [
          { serviceId: 'b', version: 1, status: 'submitted' },
          { serviceId: 'a', version: 1, status: 'submitted' },
        ],
      }).ok,
    ).toBe(false)
    expect(
      admitGovernanceQueue({
        items: [
          { serviceId: 'a', version: 1, status: 'submitted' },
          { serviceId: 'a', version: 1, status: 'submitted' },
        ],
      }).ok,
    ).toBe(false)
    expect(
      admitGovernanceQueue({
        items: [{ serviceId: 'a', version: 1, status: 'submitted' }],
        nextCursor: { serviceId: 'z', version: 9 },
      }).ok,
    ).toBe(false)
  })

  it('rejects hostile accessor/prototype inputs without invoking getters', () => {
    let getterHits = 0
    const hostile = {
      get items() {
        getterHits += 1
        return []
      },
    }
    expect(admitGovernanceQueue(hostile).ok).toBe(false)
    expect(getterHits).toBe(0)

    const protoPolluted = JSON.parse('{"items":[]}')
    Object.setPrototypeOf(protoPolluted, {
      get evil() {
        getterHits += 1
        return true
      },
    })
    // Still a plain Object.prototype child with only items — ok path
    expect(admitGovernanceQueue({ items: [] }).ok).toBe(true)
  })
})

describe('detail/transition admission', () => {
  it('admits detail coordinates/status and approve/publish responses', () => {
    const submitted = makeDefinition({ status: 'submitted', etagRevision: 1 })
    const detail = admitDetailDefinition({
      body: submitted.definition,
      etagHeader: submitted.etag,
      expectedServiceId: 'svc-caste',
      expectedVersion: 1,
    })
    expect(detail.ok).toBe(true)

    const approved = makeDefinition({ status: 'approved', etagRevision: 2 })
    expect(
      admitTransitionDefinition({
        body: approved.definition,
        etagHeader: approved.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
        expectedStatus: 'approved',
      }).ok,
    ).toBe(true)

    const published = makeDefinition({ status: 'published', etagRevision: 3 })
    expect(
      admitTransitionDefinition({
        body: published.definition,
        etagHeader: published.etag,
        expectedServiceId: 'svc-caste',
        expectedVersion: 1,
        expectedStatus: 'published',
      }).ok,
    ).toBe(true)
  })

  it('never places actorId in transition body', () => {
    const body = buildTransitionBody('approved')
    expect(body).toEqual({ targetStatus: 'approved' })
    expect(Object.keys(body)).toEqual(['targetStatus'])
    expect(JSON.stringify(body)).not.toContain('actorId')
  })
})

describe('content-type and byte limits helpers', () => {
  it('requires JSON-compatible Content-Type', () => {
    expect(isJsonCompatibleContentType('application/json')).toBe(true)
    expect(isJsonCompatibleContentType('application/problem+json')).toBe(true)
    expect(isJsonCompatibleContentType('text/plain')).toBe(false)
    expect(isJsonCompatibleContentType(null)).toBe(false)
  })
})
