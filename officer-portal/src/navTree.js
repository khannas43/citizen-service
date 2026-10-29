/** Where each screen sits in the side menu: [group] or [group, sub-group]. Screens not listed stand alone at the top. */
export const GROUP_ORDER = ['Operations', 'Schemes', 'Reports & Dashboards', 'Data Exchange', 'Citizen & Assisted', 'Demo']

export const GROUP_ICONS = {
  Operations: '🎛', Schemes: '🏛', 'Reports & Dashboards': '📊', 'Data Exchange': '🔄', 'Citizen & Assisted': '👥', Demo: '🎬',
}

export const SUB_ORDER = ['Operate', 'Identity & Family', 'Exchange', 'Govern', 'Connect & secure']

export const NAV_TREE = {
  '/tasks': ['Operations'], '/grievances': ['Operations'], '/beneficiaries': ['Operations'], '/families': ['Operations'], '/form-builder': ['Operations'],
  '/schemes': ['Schemes'], '/scheme-content': ['Schemes'], '/scheme-simulator': ['Schemes'], '/fraud-signals/legacy': ['Schemes'], '/coverage': ['Schemes'],
  '/ops-dashboard': ['Reports & Dashboards'], '/analytics': ['Reports & Dashboards'], '/money-overview': ['Reports & Dashboards'],
  '/expenditure-integrity': ['Reports & Dashboards'], '/reports': ['Reports & Dashboards'],
  '/dx/control': ['Data Exchange', 'Operate'], '/dx/events': ['Data Exchange', 'Operate'], '/dx/approvals': ['Data Exchange', 'Operate'], '/dx/discrepancies': ['Data Exchange', 'Operate'],
  '/mdm': ['Data Exchange', 'Identity & Family'], '/dx/household': ['Data Exchange', 'Identity & Family'],
  '/dx/query': ['Data Exchange', 'Exchange'], '/dx/verify': ['Data Exchange', 'Exchange'], '/dx/ledger': ['Data Exchange', 'Exchange'],
  '/dx/catalogue': ['Data Exchange', 'Exchange'], '/dx/registry': ['Data Exchange', 'Exchange'], '/dx/standards': ['Data Exchange', 'Exchange'],
  '/dx/consent': ['Data Exchange', 'Govern'], '/dx/policy': ['Data Exchange', 'Govern'], '/dx/audit': ['Data Exchange', 'Govern'], '/dx/retention': ['Data Exchange', 'Govern'],
  '/dx/connectors': ['Data Exchange', 'Connect & secure'], '/dx/keys': ['Data Exchange', 'Connect & secure'], '/dx/access': ['Data Exchange', 'Connect & secure'], '/dx/api': ['Data Exchange', 'Connect & secure'],
  '/dx/citizen': ['Citizen & Assisted'], '/dx/citizen/consents': ['Citizen & Assisted'], '/dx/citizen/report': ['Citizen & Assisted'], '/dx/assisted': ['Citizen & Assisted'],
  '/dx/scenarios': ['Demo'], '/dx/inject': ['Demo'], '/dx/evidence': ['Demo'],
}

/** Turns a flat list of allowed links into top-level entries: lone links first, then groups in a fixed order, each holding links and sub-groups. */
export function buildNav(links) {
  const lone = []
  const groups = new Map()
  links.forEach((l) => {
    const path = NAV_TREE[l.to]
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
  })
  return [...lone, ...ordered]
}
