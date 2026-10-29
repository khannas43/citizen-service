import { useEffect, useMemo, useRef, useState } from 'react'
import { Pager } from '../mdm/shared'
import '../mdm/mdm.css'
import './dx.css'
import './dxKit.css'

/* Shared building blocks for the exchange screens: one look, one set of behaviours (search, filter, sort, page, export). */

export function PageHeader({ icon, title, subtitle, actions, children }) {
  return (
    <header className="dxk-head">
      <div className="dxk-head-main">
        {icon && <span className="dxk-head-icon" aria-hidden="true">{icon}</span>}
        <div>
          <h1 className="page-title dxk-title">{title}</h1>
          {subtitle && <p className="dxk-sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="dxk-head-actions">{actions}</div>}
      {children}
    </header>
  )
}

export function Card({ title, hint, actions, flush, tone, className = '', children }) {
  return (
    <section className={`dxk-card${flush ? ' flush' : ''}${tone ? ` tone-${tone}` : ''} ${className}`.trim()}>
      {(title || actions) && (
        <div className="dxk-card-head">
          <div>
            {title && <h2 className="dxk-card-title">{title}</h2>}
            {hint && <p className="dxk-card-hint">{hint}</p>}
          </div>
          {actions && <div className="dxk-card-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'dxk-card-body'}>{children}</div>
    </section>
  )
}

/** A row of figures. A tile with `onClick` works as a quick filter; `active` marks the one in force. */
export function Stats({ items }) {
  return (
    <div className="dxk-stats">
      {items.filter(Boolean).map((s) => {
        const body = (
          <>
            <span className="dxk-stat-value">{s.value}</span>
            <span className="dxk-stat-label">{s.label}</span>
            {s.hint && <span className="dxk-stat-hint">{s.hint}</span>}
          </>
        )
        const cls = `dxk-stat${s.tone ? ` tone-${s.tone}` : ''}${s.active ? ' active' : ''}`
        return s.onClick
          ? <button key={s.label} type="button" className={cls} onClick={s.onClick} aria-pressed={!!s.active}>{body}</button>
          : <div key={s.label} className={cls}>{body}</div>
      })}
    </div>
  )
}

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    if (!delay) { setV(value); return undefined }
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function SearchBox({ value, onChange, placeholder = 'Search', label = 'Search', delay = 0, grow = true }) {
  const [text, setText] = useState(value || '')
  const first = useRef(true)
  useEffect(() => { if (value !== undefined && value !== text && first.current === false) setText(value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    first.current = false
    if (!delay) return undefined
    const t = setTimeout(() => { if (text !== value) onChange(text) }, delay)
    return () => clearTimeout(t)
  }, [text, delay]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v) => { setText(v); if (!delay) onChange(v) }
  return (
    <label className={`dxk-search${grow ? ' grow' : ''}`}>
      <span className="dxk-sr">{label}</span>
      <span className="dxk-search-icon" aria-hidden="true">⌕</span>
      <input type="search" value={text} placeholder={placeholder} onChange={(e) => set(e.target.value)} aria-label={label} />
      {text && <button type="button" className="dxk-search-clear" aria-label="Clear search" onClick={() => set('')}>×</button>}
    </label>
  )
}

export function FilterSelect({ label, value, onChange, options, all = 'All' }) {
  return (
    <label className="dxk-filter">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => {
          const [v, t] = Array.isArray(o) ? o : [o, o]
          return <option key={v} value={v}>{t}</option>
        })}
      </select>
    </label>
  )
}

/** Pill buttons for a short, mutually exclusive choice, optionally with counts. */
export function Segmented({ label, value, onChange, options }) {
  return (
    <div className="dxk-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="dxk-seg-n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  return (
    <nav className="dxk-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="dxk-seg-n">{t.count}</span>}
        </button>
      ))}
    </nav>
  )
}

export function Toolbar({ children, onClear, canClear, right }) {
  return (
    <div className="dxk-toolbar" role="search">
      <div className="dxk-toolbar-main">{children}</div>
      <div className="dxk-toolbar-right">
        {canClear && onClear && <button type="button" className="dxk-link" onClick={onClear}>Clear filters</button>}
        {right}
      </div>
    </div>
  )
}

export function EmptyState({ title = 'Nothing here', hint, action, icon = '🗂' }) {
  return (
    <div className="dxk-empty">
      <span className="dxk-empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  )
}

export function Banner({ tone = 'info', children }) {
  return <div className={`dxk-banner tone-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>
}

/** A panel that slides in from the right for reviewing or editing one item without leaving the list. */
export function Drawer({ open, title, subtitle, onClose, children, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dxk-drawer-wrap">
      <div className="dxk-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className={`dxk-drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="dxk-drawer-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="dxk-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dxk-drawer-body">{children}</div>
      </aside>
    </div>
  )
}

/** Label and value pairs, laid out two to a row on wide screens. */
export function Facts({ items }) {
  return (
    <dl className="dxk-facts">
      {items.filter((i) => i && i[1] !== undefined && i[1] !== null && i[1] !== '').map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function downloadCsv(name, header, rows) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const cmp = (a, b) => {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * A table that searches, sorts, pages and exports.
 *  columns: [{ key, label, render?(row), sort?: (row) => value | true, csv?(row), align?: 'num', width? }]
 *  search:  { placeholder, text(row) }            built-in search across loaded rows
 *  filters: extra controls shown beside the search box;  canClear / onClear: reset them
 *  server:  { total, limit, offset, onPage }      rows are one page of a longer list: paging comes from the server, no client sort
 */
export function DataTable({
  columns, rows, rowKey = 'id', search, filters, canClear, onClear, onRowClick, initialSort, pageSize = 15, pageSizes = [10, 15, 25, 50],
  empty = 'Nothing matches.', emptyHint, csv, server, searchValue, onSearch, searchDelay = 0, caption, dense, rowClass, toolbarRight,
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort || null)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize)
  const needle = (search && !server ? q : '').trim().toLowerCase()
  useEffect(() => { setPage(0) }, [needle, rows])

  const filtered = useMemo(() => (needle ? rows.filter((r) => search.text(r).toLowerCase().includes(needle)) : rows), [rows, needle, search])
  const sorted = useMemo(() => {
    if (!sort || server) return filtered
    const col = columns.find((c) => c.key === sort.key)
    const get = typeof col?.sort === 'function' ? col.sort : (r) => r[sort.key]
    return [...filtered].sort((a, b) => (sort.dir === 'desc' ? -1 : 1) * cmp(get(a), get(b)))
  }, [filtered, sort, columns, server])

  const total = server ? server.total : sorted.length
  const visible = server ? rows : sorted.slice(page * size, page * size + size)
  const toggle = (c) => setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))

  const exportCsv = () => {
    const cols = columns.filter((c) => c.label)
    downloadCsv(csv.name, cols.map((c) => c.label), sorted.map((r) => cols.map((c) => (c.csv ? c.csv(r) : typeof c.sort === 'function' ? c.sort(r) : r[c.key]))))
  }
  const hasBar = search || filters || csv || onSearch || toolbarRight
  return (
    <div className="dxk-tablecard">
      {hasBar && (
        <Toolbar onClear={() => { setQ(''); onClear?.() }} canClear={canClear || !!q}
          right={<>{toolbarRight}{csv && rows.length > 0 && <button type="button" className="btn-secondary small" onClick={exportCsv}>Export CSV</button>}</>}>
          {onSearch
            ? <SearchBox value={searchValue} onChange={onSearch} placeholder={search?.placeholder || 'Search'} delay={searchDelay} />
            : search && <SearchBox value={q} onChange={setQ} placeholder={search.placeholder} />}
          {filters}
        </Toolbar>
      )}
      <div className="dxk-table-wrap">
        <table className={`mdm-table dxk-table${dense ? ' tight' : ''}`}>
          {caption && <caption className="dxk-sr">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => {
                const can = !server && c.sort
                const dir = sort?.key === c.key ? sort.dir : null
                return (
                  <th key={c.key} scope="col" className={c.align === 'num' ? 'num' : ''} style={c.width ? { width: c.width } : undefined}
                    aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {can
                      ? <button type="button" className="dxk-sortbtn" onClick={() => toggle(c)}>{c.label}<span aria-hidden="true">{dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ' ↕'}</span></button>
                      : c.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r[rowKey] ?? i} className={`${onRowClick ? 'clickable' : ''} ${rowClass ? rowClass(r) : ''}`.trim()}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined} tabIndex={onRowClick ? 0 : undefined}>
                {columns.map((c) => <td key={c.key} className={c.align === 'num' ? 'num' : ''}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <EmptyState title={empty} hint={emptyHint || (needle || canClear ? 'Try a different search or clear the filters.' : undefined)} />}
      </div>
      {server ? (
        <Pager total={server.total} limit={server.limit} offset={server.offset} onChange={server.onPage} />
      ) : total > 0 && (
        <div className="dxk-foot">
          <span className="dxk-count" role="status">
            {page * size + 1}–{Math.min((page + 1) * size, total)} of {total.toLocaleString('en-IN')}{needle && rows.length !== total ? ` (filtered from ${rows.length.toLocaleString('en-IN')})` : ''}
          </span>
          <label className="dxk-size">Rows
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}>
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="dxk-pages">
            <button type="button" className="btn-secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="btn-secondary small" disabled={(page + 1) * size >= total} onClick={() => setPage(page + 1)}>Next</button>
          </span>
        </div>
      )}
    </div>
  )
}
