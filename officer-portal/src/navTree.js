/** Where each screen sits in the side menu: [group] or [group, sub-group]. Screens not listed stand alone at the top. */
export const GROUP_ORDER = ['Operations', 'Schemes', 'Reports & Dashboards', 'Data Exchange', 'Demo']

export const GROUP_ICONS = {
  Operations: '🎛', Schemes: '🏛', 'Reports & Dashboards': '📊', 'Data Exchange': '🔄', Demo: '🎬',
}

export const SUB_ORDER = ['Operate', 'Identity & Family', 'Govern', 'Connect & reference']

export const NAV_TREE = {
  '/tasks': ['Operations'], '/grievances': ['Operations'], '/beneficiaries': ['Operations'], '/families': ['Operations'], '/form-builder': ['Operations'],
  '/schemes': ['Schemes'], '/scheme-content': ['Schemes'], '/scheme-simulator': ['Schemes'], '/fraud-signals/legacy': ['Schemes'], '/coverage': ['Schemes'],
  '/ops-dashboard': ['Reports & Dashboards'], '/analytics': ['Reports & Dashboards'], '/money-overview': ['Reports & Dashboards'],
  '/expenditure-integrity': ['Reports & Dashboards'], '/reports': ['Reports & Dashboards'],
  '/dx/control': ['Data Exchange', 'Operate'], '/dx/events': ['Data Exchange', 'Operate'], '/dx/work': ['Data Exchange', 'Operate'], '/dx/approvals': ['Data Exchange', 'Operate'], '/dx/consent': ['Data Exchange', 'Operate'],
  '/dx/notices': ['Data Exchange', 'Operate'], '/dx/response-times': ['Data Exchange', 'Operate'], '/dx/keys': ['Data Exchange', 'Operate'], '/dx/lineage': ['Data Exchange', 'Operate'],
  '/dx/discrepancies': ['Data Exchange', 'Operate'], '/dx/quality': ['Data Exchange', 'Operate'], '/dx/checks': ['Data Exchange', 'Operate'], '/dx/assisted': ['Data Exchange', 'Operate'],
  '/mdm': ['Data Exchange', 'Identity & Family'],
  '/dx/policy': ['Data Exchange', 'Govern'], '/dx/retention': ['Data Exchange', 'Govern'], '/dx/ledger': ['Data Exchange', 'Govern'], '/dx/audit': ['Data Exchange', 'Govern'],
  '/dx/query': ['Data Exchange', 'Connect & reference'], '/dx/verify': ['Data Exchange', 'Connect & reference'], '/dx/catalogue': ['Data Exchange', 'Connect & reference'],
  '/dx/registry': ['Data Exchange', 'Connect & reference'], '/dx/standards': ['Data Exchange', 'Connect & reference'], '/dx/api': ['Data Exchange', 'Connect & reference'],
  '/dx/connectors': ['Data Exchange', 'Connect & reference'], '/dx/access': ['Data Exchange', 'Connect & reference'],
  '/dx/story': ['Demo'], '/dx/scenarios': ['Demo'], '/dx/inject': ['Demo'], '/dx/evidence': ['Demo'],
}

/** Screens that belong together share one menu entry and a row of tabs above the page. Each tab is still its own address, so links and bookmarks keep working. */
export const HUBS = [
  { id: 'events', label: '📡 Events', path: ['Data Exchange', 'Operate'], tabs: [['/dx/events', 'Events'], ['/dx/lineage', 'Trail']] },
  { id: 'decisions', label: '✅ Decisions', path: ['Data Exchange', 'Operate'], tabs: [['/dx/work', 'Work queue'], ['/dx/approvals', 'Approvals'], ['/dx/consent', 'Consent'], ['/dx/notices', 'Notices']] },
  { id: 'departments', label: '📨 Departments', path: ['Data Exchange', 'Operate'], tabs: [['/dx/response-times', 'Response times and channels'], ['/dx/keys', 'Keys']] },
  { id: 'reviews', label: '⚠️ Reviews and quality', path: ['Data Exchange', 'Operate'], tabs: [['/dx/discrepancies', 'Discrepancies'], ['/dx/quality', 'Feed quality'], ['/dx/checks', 'Eligibility checks']] },
  { id: 'governance', label: '📜 Rules and records', path: ['Data Exchange', 'Govern'], tabs: [['/dx/policy', 'Policy'], ['/dx/retention', 'Retention and purge'], ['/dx/ledger', 'Clearing house'], ['/dx/audit', 'Audit']] },
  { id: 'ask', label: '🔎 Ask and verify', path: ['Data Exchange', 'Connect & reference'], tabs: [['/dx/query', 'Query builder'], ['/dx/verify', 'Verification']] },
  { id: 'reference', label: '📚 Reference', path: ['Data Exchange', 'Connect & reference'], tabs: [['/dx/catalogue', 'Catalogue'], ['/dx/registry', 'Registry'], ['/dx/standards', 'Data standards'], ['/dx/api', 'API explorer']] },
  { id: 'connect', label: '🔌 Connect and secure', path: ['Data Exchange', 'Connect & reference'], tabs: [['/dx/connectors', 'Connectors'], ['/dx/access', 'Access and misuse']] },
  { id: 'demo', label: '🎬 Demo', path: ['Demo'], tabs: [['/dx/scenarios', 'Scenario runner'], ['/dx/inject', 'Unscripted events'], ['/dx/evidence', 'Evidence pack'], ['/dx/story', 'How the pieces fit']] },
]

/** Demo journeys: one entry per use case (opens the scenario page), with its steps below. `who` is the person acting; `citizen: true` opens the citizen portal in a new tab. */
export const DEMO_JOURNEYS = [
  {
    id: 'uc1', label: 'UC1 One citizen across departments', to: '/dx/scenarios?uc=uc1',
    steps: [
      { label: 'Clear records and check the department feeds', who: 'Officer', to: '/dx/quality' },
      { label: 'Find and open one person', who: 'Officer', to: '/mdm' },
      { label: 'Review possible matches', who: 'Officer', to: '/mdm?tab=review' },
      { label: 'Approve groups in the work queue', who: 'Officer', to: '/dx/work' },
      { label: 'See where each value came from', who: 'Officer', to: '/dx/lineage?tab=person' },
      { label: 'See a disagreement and report a wrong detail', who: 'Rajender', to: 'notifications', citizen: true },
      { label: 'See the correction routed', who: 'Officer', to: '/dx/discrepancies' },
    ],
  },
  {
    id: 'uc2', label: 'UC2 Birth of a child', to: '/dx/scenarios?uc=uc2',
    prep: 'Before you start: Clear demo records, then Run the UC2 group. Where a step says run, press that entry in the Scenario runner when the story reaches it.',
    steps: [
      { label: 'Civil registration publishes the birth', who: 'Officer', to: '/dx/events', run: '2.1' },
      { label: 'Who is subscribed, and what each may receive', who: 'Officer', to: '/dx/registry' },
      { label: 'The parents are recognised and linked', who: 'Officer', to: '/mdm?tab=people' },
      { label: 'Four consent questions asked, nothing sent', who: 'Officer', to: '/dx/consent' },
      { label: 'The Health system goes down while the parent decides', who: 'Officer', to: '/dx/lineage?tab=event', run: '2.4' },
      { label: 'Allow some uses, refuse the girl scheme', who: 'Suma', to: 'approvals', citizen: true, run: '2.2' },
      { label: 'See her answer, read-only', who: 'Rajender', to: 'approvals', citizen: true },
      { label: 'Health is back: the wait ends', who: 'Officer, Suma', to: '/dx/lineage?tab=event', run: '2.5' },
      { label: 'Departments answer their notices', who: 'Officer', to: '/dx/notices' },
      { label: 'A late birth with no name is held; the name arrives', who: 'Officer', to: '/dx/events', run: '2.8, 2.9' },
      { label: 'Parent details disagree: flagged, not guessed', who: 'Officer', to: '/dx/work', run: '2.10' },
      { label: 'A third child: no answer, and the time runs out', who: 'Suma, Officer', to: '/dx/consent', run: '2.12, 2.13' },
      { label: 'Withdraw one use', who: 'Suma', to: 'approvals', citizen: true },
      { label: 'Follow one datum from Civil registration to every department', who: 'Officer', to: '/dx/lineage?tab=overview' },
    ],
  },
  {
    id: 'uc3', label: 'UC3 Death of a family member', to: '/dx/scenarios?uc=uc3',
    steps: [
      { label: 'Clear records and run the UC3 group', who: 'Officer', to: '/dx/scenarios' },
      { label: 'See the pensioner and household', who: 'Officer', to: '/beneficiaries' },
      { label: 'Confirm the death and approve the stop', who: 'Officer', to: '/dx/approvals' },
      { label: 'Send the pension department its notice', who: 'Officer', to: '/dx/notices' },
      { label: 'Read the notice about Ramaiah', who: 'Sarojini', to: 'approvals', citizen: true },
      { label: 'Check a death with no record', who: 'Officer', to: '/dx/verify' },
    ],
  },
  {
    id: 'uc4', label: 'UC4 Higher education and turning 18', to: '/dx/scenarios?uc=uc4',
    steps: [
      { label: 'Clear records and run the UC4 group', who: 'Officer', to: '/dx/scenarios' },
      { label: 'Find who qualifies', who: 'Officer', to: '/scheme-simulator' },
      { label: 'Invite Kavya to apply', who: 'Officer', to: '/dx/checks?tab=turning18' },
      { label: 'See the invitation', who: 'Kavya', to: 'approvals', citizen: true },
      { label: 'Allow some data for Kavya and Sai', who: 'Lakshmi', to: 'approvals', citizen: true },
      { label: 'Check income without moving documents', who: 'Officer', to: '/dx/verify' },
      { label: 'Resolve certificate cases', who: 'Officer', to: '/dx/work' },
      { label: 'Check enrolment and the family view', who: 'Officer', to: '/beneficiaries' },
      { label: 'Kavya turns 18', who: 'Officer', to: '/dx/control' },
      { label: 'Take over consent, then withdraw', who: 'Kavya', to: 'approvals', citizen: true },
      { label: 'See the withdrawal on record', who: 'Officer', to: '/dx/ledger' },
    ],
  },
  {
    id: 'uc5', label: 'UC5 Household and housing', to: '/dx/scenarios?uc=uc5',
    steps: [
      { label: 'Plant the housing cases (step 5.7)', who: 'Officer', to: '/dx/scenarios' },
      { label: 'Review the housing groups', who: 'Officer', to: '/dx/work' },
      { label: 'Check housing without seeing figures', who: 'Officer', to: '/dx/verify' },
      { label: 'See the housing row', who: 'Officer', to: '/dx/control' },
      { label: 'Answer the housing consent', who: 'Meena', to: 'approvals', citizen: true },
    ],
  },
]

const under = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`)

/** The hub a screen belongs to, if any. */
export const hubOf = (pathname) => HUBS.find((h) => h.tabs.some(([to]) => under(pathname, to))) || null

/** The tabs to show on this screen, limited to the screens the signed-in role may open. */
export function hubTabs(pathname, links) {
  const hub = hubOf(pathname)
  if (!hub) return null
  const allowed = new Set(links.map((l) => l.to))
  const tabs = hub.tabs.filter(([to]) => allowed.has(to)).map(([to, label]) => ({ to, label, active: under(pathname, to) }))
  return tabs.length > 1 ? { hub, tabs } : null
}

/** One entry for each hub, opening on its first screen the role may use; the rest stay reachable as tabs. */
export function collapseHubs(links) {
  const used = new Set()
  const out = []
  links.forEach((l) => {
    const hub = HUBS.find((h) => h.tabs.some(([to]) => to === l.to))
    if (!hub) return out.push(l)
    if (used.has(hub.id)) return
    used.add(hub.id)
    const members = hub.tabs.map(([to]) => to).filter((to) => links.some((x) => x.to === to))
    out.push({ to: members[0], label: hub.label, members, hub: hub.id })
  })
  return out
}

/** Turns a flat list of allowed links into top-level entries: lone links first, then groups in a fixed order, each holding links and sub-groups. */
export function buildNav(flat) {
  const links = collapseHubs(flat)
  const lone = []
  const groups = new Map()
  links.forEach((l) => {
    const path = l.hub ? HUBS.find((h) => h.id === l.hub).path : NAV_TREE[l.to]
    if (!path) return lone.push({ item: l })
    const [g, s] = path
    if (!groups.has(g)) groups.set(g, { group: g, icon: GROUP_ICONS[g] ?? '📁', items: [], subs: new Map() })
    const grp = groups.get(g)
    if (!s) return grp.items.push(l)
    if (!grp.subs.has(s)) grp.subs.set(s, [])
    grp.subs.get(s).push(l)
  })
  const ordered = [...groups.values()].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  ordered.forEach((g) => {
    g.subs = [...g.subs.entries()].sort((a, b) => SUB_ORDER.indexOf(a[0]) - SUB_ORDER.indexOf(b[0])).map(([name, items]) => ({ name, items }))
    g.all = [...g.items, ...g.subs.flatMap((s) => s.items)]
    if (g.group === 'Demo') {
      const allowed = new Set(flat.map((l) => l.to))
      // officer steps only where the role may open the page; citizen steps always
      g.journeys = DEMO_JOURNEYS.map((j) => ({ ...j, steps: j.steps.filter((st) => st.citizen || allowed.has(st.to.split('?')[0])) })).filter((j) => allowed.has(j.to.split('?')[0]))
    }
  })
  return [...lone, ...ordered]
}
