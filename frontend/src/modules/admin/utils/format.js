// Formatting + status helpers shared by every admin page.

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')

/** Indian digit grouping: 12,34,567 */
export function num(value) {
  const n = Math.round(Number(value) || 0)
  const s = String(Math.abs(n))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${n < 0 ? '-' : ''}${rest ? `${rest},${last3}` : last3}`
}

/** ₹ with paise only when needed. */
export function inr(value) {
  const v = Math.round((Number(value) || 0) * 100) / 100
  const whole = Math.trunc(v)
  const paise = Math.round(Math.abs(v - whole) * 100)
  return `${v < 0 ? '−' : ''}₹${num(Math.abs(whole))}${
    paise ? `.${String(paise).padStart(2, '0')}` : ''
  }`
}

/** Compact: 1.2K, 3.4M, 1.1Cr-style kept simple (K/M). */
export function compact(value) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return String(Math.round(n))
}

export const pct = (v, digits = 0) => `${(Number(v) || 0).toFixed(digits)}%`

export function date(ts) {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function dateTime(ts) {
  const d = new Date(ts)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${m} ${
    h < 12 ? 'AM' : 'PM'
  }`
}

export function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return date(ts)
}

export function duration(secs) {
  const s = Math.round(secs || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${String(r).padStart(2, '0')}s`
  return `${r}s`
}

export const initials = name =>
  String(name || '?')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

/** Status string → badge tone. One place so every page colours the same. */
const TONES = {
  active: 'success',
  approved: 'success',
  success: 'success',
  completed: 'success',
  paid: 'success',
  published: 'success',
  resolved: 'success',
  online: 'success',
  live: 'brand',
  sent: 'success',
  closed: 'neutral',
  ended: 'neutral',
  scheduled: 'info',
  draft: 'neutral',
  pending: 'warning',
  requested: 'warning',
  processing: 'info',
  review: 'warning',
  open: 'warning',
  flagged: 'warning',
  missed: 'neutral',
  declined: 'neutral',
  dismissed: 'neutral',
  inactive: 'neutral',
  offline: 'neutral',
  adjusted: 'info',
  refunded: 'violet',
  suspended: 'danger',
  banned: 'danger',
  rejected: 'danger',
  failed: 'danger',
  removed: 'danger',
  urgent: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}
export const tone = status => TONES[String(status).toLowerCase()] || 'neutral'
export const label = status =>
  String(status || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())

/** Download rows as CSV (used by every "Export" button). */
export function exportCsv(filename, rows, columns) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map(c => esc(c.label)).join(',')
  const body = rows
    .map(r => columns.map(c => esc(c.value(r))).join(','))
    .join('\n')
  const blob = new Blob([`${head}\n${body}`], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
