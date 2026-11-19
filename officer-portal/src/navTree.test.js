import { describe, it, expect } from 'vitest'
import { buildNav, hubTabs, hubOf, HUBS } from './navTree'

const link = (to, label = to) => ({ to, label, feature: 'mdm' })
const ALL = HUBS.flatMap((h) => h.tabs.map(([to]) => link(to))).concat([link('/dx/control'), link('/mdm'), link('/dx/assisted'), link('/tasks')])

describe('menu with tabbed pages', () => {
  it('shows one entry for screens that belong together and opens on the first the role may use', () => {
    const entries = buildNav(ALL)
    const dx = entries.find((e) => e.group === 'Data Exchange')
    const labels = dx.all.map((i) => i.label)
    expect(labels).toContain('📨 Departments')
    expect(labels).not.toContain('/dx/notices')
    expect(labels).toContain('✅ Decisions')
    expect(labels).toContain('📜 Rules and records')
    const dep = dx.all.find((i) => i.hub === 'departments')
    expect(dep.to).toBe('/dx/response-times')
    expect(dep.members).toEqual(['/dx/response-times', '/dx/keys'])
    expect(dx.all.find((i) => i.hub === 'decisions').members).toEqual(['/dx/work', '/dx/approvals', '/dx/consent', '/dx/notices'])
    expect(dx.all.length).toBeLessThanOrEqual(11)               // was 28
  })

  it('keeps a hub together when a role may open only some of its screens', () => {
    const entries = buildNav([link('/dx/response-times'), link('/dx/keys'), link('/dx/events')])
    const all = entries.find((e) => e.group === 'Data Exchange').all
    expect(all.find((i) => i.hub === 'departments').to).toBe('/dx/response-times')
    expect(hubTabs('/dx/keys', [link('/dx/response-times'), link('/dx/keys')]).tabs.map((t) => t.to)).toEqual(['/dx/response-times', '/dx/keys'])
  })

  it('shows no tabs for a lone screen or a screen outside a hub', () => {
    expect(hubTabs('/dx/control', ALL)).toBeNull()
    expect(hubTabs('/dx/notices', [link('/dx/notices')])).toBeNull()      // a single permitted screen needs no tabs
    expect(hubOf('/mdm')).toBeNull()
  })

  it('keeps the assisted channel in the Data Exchange menu and no longer lists the officer-side citizen screens', async () => {
    const { officerNavItems } = await import('./auth')
    const paths = officerNavItems('IT_ADMIN').map((i) => i.to)
    expect(paths).toContain('/dx/assisted')
    expect(paths).toContain('/dx/checks')
    ;['/dx/citizen', '/dx/citizen/consents', '/dx/citizen/report'].forEach((p) => expect(paths).not.toContain(p))
    const entries = buildNav(officerNavItems('IT_ADMIN'))
    expect(entries.some((e) => e.group === 'Citizen & Assisted')).toBe(false)
    expect(entries.find((e) => e.group === 'Data Exchange').all.some((i) => i.to === '/dx/assisted')).toBe(true)
  })

  it('department roles see only Control Tower and Decisions under Data Exchange', async () => {
    const { officerNavItems } = await import('./auth')
    for (const role of ['PDS_OFFICER', 'HEALTH_OFFICER']) {
      const entries = buildNav(officerNavItems(role))
      expect(entries.every((e) => !e.group || e.group === 'Data Exchange')).toBe(true)
      const dx = entries.find((e) => e.group === 'Data Exchange')
      const labels = (dx?.all || []).map((i) => i.label)
      expect(labels.some((l) => /Control Tower/i.test(l))).toBe(true)
      expect(labels.some((l) => /Decisions/i.test(l))).toBe(true)
      expect(labels.some((l) => /Master Data|Rules|Demo|Events/i.test(l))).toBe(false)
    }
  })

  it('marks the open tab and knows every old address', () => {
    const set = hubTabs('/dx/ledger', ALL)
    expect(set.tabs.find((t) => t.active).to).toBe('/dx/ledger')
    expect(set.tabs.map((t) => t.to)).toEqual(['/dx/policy', '/dx/retention', '/dx/ledger', '/dx/audit'])
    ;['/dx/notices', '/dx/control', '/dx/lineage', '/dx/story', '/dx/api'].forEach((p) => expect(p === '/dx/control' ? hubOf(p) : hubOf(p)).toBeDefined())
  })
})
