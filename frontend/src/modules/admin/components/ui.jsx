// REBU admin UI kit. Every page builds from these so the panel stays consistent.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { initials, label as labelOf, tone } from '../utils/format'

/* ---------- Buttons & badges ---------- */

/** variant: primary | secondary | ghost | dark | danger | soft-danger | success */
export function Button({
  variant = 'secondary',
  size,
  icon: Icon,
  iconOnly,
  block,
  children,
  className = '',
  ...rest
}) {
  const cls = ['a-btn', variant, size, iconOnly && 'icon', block && 'block', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  )
}

/** tone: neutral | success | warning | danger | info | brand | violet | ink */
export function Badge({ tone: t = 'neutral', dot, children }) {
  return <span className={`a-badge ${t} ${dot ? 'dot' : ''}`}>{children}</span>
}

/** Badge coloured by a status string (active, pending, rejected, …). */
export function Status({ value, children }) {
  return (
    <Badge tone={tone(value)} dot>
      {children || labelOf(value)}
    </Badge>
  )
}

/* ---------- Layout blocks ---------- */

export function PageHeader({ title, subtitle, crumbs, actions }) {
  return (
    <div className="a-page-head">
      <div>
        {crumbs ? (
          <div className="a-crumbs">
            {crumbs.map((c, i) => (
              <span key={c.label} className="a-row" style={{ gap: 6 }}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 ? <ChevronRight size={13} /> : null}
              </span>
            ))}
          </div>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="a-row wrap">{actions}</div> : null}
    </div>
  )
}

export function Card({ title, subtitle, actions, children, padded = true, footer, style, className = '' }) {
  return (
    <section className={`a-card ${className}`} style={style}>
      {title || actions ? (
        <div className="a-card-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {padded ? <div className="a-card-body">{children}</div> : children}
      {footer ? <div className="a-card-foot">{footer}</div> : null}
    </section>
  )
}

export function Stat({ label, value, sub, icon: Icon, trend }) {
  return (
    <div className="a-card a-stat">
      <div className="a-stat-top">
        <span className="a-stat-label">{label}</span>
        {Icon ? (
          <span className="a-stat-icon">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="a-stat-value">{value}</div>
      {sub || trend != null ? (
        <div className="a-stat-sub">
          {trend != null ? (
            <span className={trend >= 0 ? 'a-success a-row' : 'a-danger a-row'} style={{ gap: 2 }}>
              {trend >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          ) : null}
          {sub}
        </div>
      ) : null}
    </div>
  )
}

export function Empty({ icon: Icon = Inbox, title = 'Nothing here', text }) {
  return (
    <div className="a-empty">
      <Icon size={34} />
      <b>{title}</b>
      {text ? <div>{text}</div> : null}
    </div>
  )
}

export function Progress({ value }) {
  return (
    <div className="a-progress">
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

/* ---------- People ---------- */

export function Avatar({ src, name, size = 36, radius }) {
  const style = { width: size, height: size, fontSize: size * 0.36, borderRadius: radius }
  return src ? (
    <img className="a-avatar" src={src} alt="" style={style} loading="lazy" />
  ) : (
    <span className="a-avatar" style={style}>
      {initials(name)}
    </span>
  )
}

/** Avatar + name + secondary line; optional link. */
export function Who({ src, name, sub, size = 36, to }) {
  const body = (
    <div className="a-who">
      <Avatar src={src} name={name} size={size} />
      <div style={{ minWidth: 0 }}>
        <b>{name}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  )
  return to ? (
    <Link to={to} onClick={e => e.stopPropagation()}>
      {body}
    </Link>
  ) : (
    body
  )
}

/* ---------- Forms ---------- */

export function Field({ label, hint, error, children, style }) {
  return (
    <label className="a-field" style={style}>
      {label ? <span className="a-label">{label}</span> : null}
      {children}
      {error ? <span className="a-error">{error}</span> : hint ? <span className="a-hint">{hint}</span> : null}
    </label>
  )
}

export function Input({ icon: Icon, affix, className = '', ...rest }) {
  if (!Icon && !affix) return <input className={`a-input ${className}`} {...rest} />
  return (
    <span className="a-input-wrap">
      {Icon ? <Icon size={16} /> : null}
      <input className={`a-input ${className}`} style={affix ? { paddingRight: 48 } : undefined} {...rest} />
      {affix ? <span className="a-input-affix">{affix}</span> : null}
    </span>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search' }) {
  return (
    <Input
      icon={Search}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  )
}

/** options: array of strings or { value, label } */
export function Select({ options, className = '', ...rest }) {
  return (
    <select className={`a-select ${className}`} {...rest}>
      {options.map(o =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  )
}

export function Textarea(props) {
  return <textarea className="a-textarea" {...props} />
}

export function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={`a-switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

/** A settings row: title + description on the left, control on the right. */
export function Setting({ title, description, children }) {
  return (
    <div className="a-setting">
      <div className="a-setting-text">
        <b>{title}</b>
        {description ? <span>{description}</span> : null}
      </div>
      {children}
    </div>
  )
}

/** Segmented control. options: [{ value, label }] */
export function Seg({ options, value, onChange }) {
  return (
    <div className="a-seg">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** tabs: [{ value, label, count? }] */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="a-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          className={`a-tab ${t.value === value ? 'on' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count ? <span className="a-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

/* ---------- Loading & errors ---------- */

/** Placeholder while a request is in flight. */
export function Loading({ title = 'Loading…', text }) {
  return <Empty icon={Loader2} title={title} text={text} />
}

/** A failed request, with an optional retry. */
export function ErrorState({ error, onRetry, title = 'Couldn’t load this' }) {
  return (
    <div className="a-empty">
      <CloudOff size={34} />
      <b>{title}</b>
      <div>{error?.message || String(error || 'Something went wrong.')}</div>
      {onRetry ? (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Full-card wrapper for pages that need data before they can render. */
export function Pending({ res, children, title }) {
  if (res.error && res.data === undefined) {
    return (
      <div className="a-card">
        <ErrorState error={res.error} onRetry={res.reload} title={title} />
      </div>
    )
  }
  if (res.data === undefined) {
    return (
      <div className="a-card">
        <Loading />
      </div>
    )
  }
  return children(res.data)
}

/* ---------- Data table ---------- */

/**
 * columns: [{ key, label, render?(row), sort?: (row) => value, serverSort?: 'field', align?: 'right', width? }]
 * Sorting + pagination are built in; search/filters live in `toolbar`.
 * selectable + bulk(selectedIds, clear) renders a bulk-action bar.
 *
 * Server mode (`server`): `rows` is one page; pass total, page (1-based),
 * onPageChange, sort/onSortChange ({ key, dir } with key = column.serverSort),
 * loading, error, onRetry. See serverTable() in hooks/useApi.js.
 */
const NO_ROWS = []

export function DataTable({
  columns,
  rows: rowsProp,
  rowKey = r => r.id,
  onRowClick,
  pageSize = 12,
  toolbar,
  empty,
  selectable,
  bulk,
  initialSort,
  server,
  total,
  page: serverPage,
  onPageChange,
  sort: serverSortState,
  onSortChange,
  loading,
  error,
  onRetry,
}) {
  const [localSort, setLocalSort] = useState(initialSort || null) // { key, dir }
  const [rawPage, setPage] = useState(0)
  const [selected, setSelected] = useState([])
  const rows = rowsProp || NO_ROWS

  const sorted = useMemo(() => {
    if (server || !localSort) return rows
    const col = columns.find(c => c.key === localSort.key)
    if (!col?.sort) return rows
    return [...rows].sort((a, b) => {
      const x = col.sort(a)
      const y = col.sort(b)
      const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y
      return localSort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, localSort, columns, server])

  const count = server ? total || 0 : sorted.length
  const pages = Math.max(1, Math.ceil(count / pageSize))
  // Filters can shrink the list under the current page; clamp instead of resetting.
  const page = server ? Math.max(0, (serverPage || 1) - 1) : Math.min(rawPage, pages - 1)
  const view = server ? rows : sorted.slice(page * pageSize, page * pageSize + pageSize)
  const goPage = p => (server ? onPageChange?.(p + 1) : setPage(p))
  const ids = view.map(rowKey)
  const allOn = ids.length > 0 && ids.every(id => selected.includes(id))

  const sortKeyOf = col => (server ? col.serverSort : col.sort ? col.key : null)
  const sort = server ? serverSortState : localSort
  const toggleSort = col => {
    const key = sortKeyOf(col)
    if (!key) return
    const next = sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    if (server) onSortChange?.(next)
    else setLocalSort(next)
  }

  let body
  if (rows.length === 0 && error) body = <ErrorState error={error} onRetry={onRetry} />
  else if (rows.length === 0 && loading) body = <Loading />
  else if (rows.length === 0) body = empty || <Empty title="No results" text="Try a different search or filter." />
  else
    body = (
      <div className="a-table-wrap" style={loading ? { opacity: 0.55, transition: 'opacity .15s' } : undefined} aria-busy={loading || undefined}>
        <table className="a-table">
          <thead>
            <tr>
              {selectable ? (
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    className="a-check"
                    checked={allOn}
                    onChange={() =>
                      setSelected(s =>
                        allOn ? s.filter(x => !ids.includes(x)) : Array.from(new Set([...s, ...ids])),
                      )
                    }
                    aria-label="Select page"
                  />
                </th>
              ) : null}
              {columns.map(c => (
                <th
                  key={c.key}
                  className={`${sortKeyOf(c) ? 'sortable' : ''} ${c.align === 'right' ? 'right' : ''}`}
                  style={{ width: c.width }}
                  onClick={() => toggleSort(c)}
                >
                  {c.label}
                  {sort && sort.key === sortKeyOf(c) ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map(row => {
              const k = rowKey(row)
              return (
                <tr
                  key={k}
                  className={`${onRowClick ? 'clickable' : ''} ${selected.includes(k) ? 'selected' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable ? (
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="a-check"
                        checked={selected.includes(k)}
                        onChange={() =>
                          setSelected(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]))
                        }
                        aria-label="Select row"
                      />
                    </td>
                  ) : null}
                  {columns.map(c => (
                    <td key={c.key} className={c.align === 'right' ? 'right' : ''}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )

  return (
    <>
      {toolbar ? <div className="a-toolbar">{toolbar}</div> : null}
      {selectable && selected.length ? (
        <div className="a-bulk">
          {selected.length} selected
          <span className="a-spacer" />
          {bulk?.(selected, () => setSelected([]))}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}
      {error && rows.length ? (
        <div className="a-bulk" style={{ color: 'var(--danger)' }}>
          {error.message || 'Couldn’t refresh this list.'}
          <span className="a-spacer" />
          {onRetry ? (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {body}
      {count > pageSize ? (
        <div className="a-pager">
          <span>
            {page * pageSize + 1}–{Math.min(count, (page + 1) * pageSize)} of {count}
          </span>
          <span className="a-spacer" />
          <Button size="sm" iconOnly icon={ChevronLeft} disabled={page === 0} onClick={() => goPage(page - 1)} aria-label="Previous page" />
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button size="sm" iconOnly icon={ChevronRight} disabled={page >= pages - 1} onClick={() => goPage(page + 1)} aria-label="Next page" />
        </div>
      ) : null}
    </>
  )
}

/* ---------- Overlays ---------- */

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const h = e => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="a-overlay" onMouseDown={onClose}>
      <div
        className={`a-modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="a-modal-head">
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="a-modal-body">{children}</div>
        {footer ? <div className="a-modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Drawer({ open, title, onClose, children, footer }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <>
      <div className="a-drawer-overlay" onClick={onClose} />
      <aside className="a-drawer" role="dialog" aria-modal="true">
        <div className="a-modal-head" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="a-modal-body" style={{ flex: 1, paddingTop: 16 }}>
          {children}
        </div>
        {footer ? <div className="a-modal-foot">{footer}</div> : null}
      </aside>
    </>
  )
}

/**
 * Confirmation dialog. `reason` adds a required text box (passed to onConfirm).
 */
export function Confirm(props) {
  // Mounting the body only while open gives every opening a fresh reason box.
  return props.open ? <ConfirmBody {...props} /> : null
}

function ConfirmBody({ open, title, message, confirmLabel = 'Confirm', danger, reason, reasonLabel = 'Reason', onConfirm, onClose }) {
  const [text, setText] = useState('')
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={reason && !text.trim()}
            onClick={() => onConfirm(text.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <p className="a-muted" style={{ marginBottom: reason ? 14 : 0 }}>{message}</p> : null}
      {reason ? (
        <Field label={reasonLabel}>
          <Textarea value={text} onChange={e => setText(e.target.value)} autoFocus />
        </Field>
      ) : null}
    </Modal>
  )
}
