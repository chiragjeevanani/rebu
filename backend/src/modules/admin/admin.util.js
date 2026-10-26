// Small helpers shared by the admin routers.
import mongoose from 'mongoose'
import { z } from 'zod'
import { User } from '../users/user.model.js'
import { Earning, Withdrawal } from '../earnings/earnings.models.js'
import { ApiError } from '../../core/errors.js'
import { toUser } from '../../core/realtime.js'

export const DAY = 24 * 3600 * 1000
export const TZ = 'Asia/Kolkata'
export const round2 = n => Math.round(n * 100) / 100
export const oid = id => new mongoose.Types.ObjectId(String(id))

/** Case-insensitive "contains" regex from a user search string. */
export const rx = q => new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

/** Lean doc → plain object with `id`. */
export const withId = o => (o ? { ...o, id: String(o._id) } : o)

/** { id, name, avatar } for a user or host, as the panel's <Who> expects. */
export function who(u) {
  if (!u) return null
  const h = u.host?.approved ? u.host : null
  return { id: String(u._id), name: h?.displayName || u.name || '', avatar: h?.photos?.[0] || u.photos?.[0] || null }
}

/** Sorting from ?sort=field&dir=asc|desc limited to an allow-list. */
export function sorting(query, allowed, fallback) {
  const field = allowed[query.sort]
  if (!field) return fallback
  return { [field]: query.dir === 'asc' ? 1 : -1, _id: -1 }
}

/** Another module's model, or null if it isn't loaded (built in parallel). */
export const optModel = name => mongoose.models[name] || null

export const notReady = what => new ApiError(503, 'not_ready', `${what} isn’t available yet.`)

/** Lazily import an export from another module; null if the file/export doesn't exist yet. */
export async function optImport(paths, name) {
  for (const p of paths) {
    try {
      const m = await import(p)
      if (typeof m[name] === 'function') return m[name]
    } catch (e) {
      if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e
    }
  }
  return null
}

export const endLiveFn = () =>
  optImport(['../lives/lives.service.js', '../lives/live.service.js', '../lives/lives.routes.js'], 'endLiveByAdmin')

/** Users by id for decorating rows: Map(id → who()). */
export async function whoMap(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))]
  if (!uniq.length) return new Map()
  const rows = await User.find({ _id: { $in: uniq } }, { name: 1, photos: 1, 'host.approved': 1, 'host.displayName': 1, 'host.photos': 1 }).lean()
  return new Map(rows.map(u => [String(u._id), who(u)]))
}

/** Same numbers as economy.hostBalance(), for many hosts in two aggregates. */
export async function balancesFor(ids) {
  const oids = ids.map(oid)
  const [earn, wd] = await Promise.all([
    Earning.aggregate([
      { $match: { host: { $in: oids }, status: { $ne: 'reversed' } } },
      { $group: { _id: '$host', lifetime: { $sum: '$net' }, onHold: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, '$net', 0] } } } },
    ]),
    Withdrawal.aggregate([
      { $match: { host: { $in: oids }, status: { $ne: 'rejected' } } },
      {
        $group: {
          _id: '$host',
          withdrawn: { $sum: '$amount' },
          pending: { $sum: { $cond: [{ $in: ['$status', ['requested', 'processing']] }, '$amount', 0] } },
        },
      },
    ]),
  ])
  const e = new Map(earn.map(x => [String(x._id), x]))
  const w = new Map(wd.map(x => [String(x._id), x]))
  return new Map(
    ids.map(id => {
      const a = e.get(String(id)) || {}
      const b = w.get(String(id)) || {}
      const lifetime = round2(a.lifetime || 0)
      const onHold = round2(a.onHold || 0)
      const withdrawn = round2(b.withdrawn || 0)
      return [String(id), { lifetime, onHold, withdrawn, pendingPayout: round2(b.pending || 0), available: Math.max(0, round2(lifetime - onHold - withdrawn)) }]
    }),
  )
}

export const statusBody = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
  reason: z.string().trim().max(500).optional().default(''),
  days: z.coerce.number().int().min(1).max(3650).optional(),
})

/**
 * Account status for a user (and, with asHost, the host block too).
 * Suspended with `days` expires on its own; without, it lasts until lifted.
 * Returns the $set that was applied.
 */
export async function applyStatus(userId, { status, reason = '', days }, { asHost = false } = {}) {
  const set = {
    status,
    statusReason: status === 'active' ? '' : reason,
    suspendedUntil: status === 'suspended' && days ? new Date(Date.now() + days * DAY) : null,
  }
  if (asHost) {
    set['host.status'] = status
    if (status !== 'active') set['host.online'] = false
  } else if (status !== 'active') {
    set['host.online'] = false
  }
  const u = await User.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after', projection: { name: 1, status: 1 } })
  if (!u) return null
  if (status !== 'active') toUser(userId, 'account:status', { status, reason, until: set.suspendedUntil })
  return set
}

export const statusText = ({ status, reason, days }) =>
  (status === 'active' ? 'Reactivated' : status === 'banned' ? 'Banned' : days ? `Suspended ${days} days` : 'Suspended') +
  (reason ? ` — ${reason}` : '')

/** YYYY-MM-DD in IST. */
export const dayKey = t => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })
/** Start of the IST day `back` days before today. */
export const istDayStart = (back = 0) => new Date(Date.parse(`${dayKey(Date.now())}T00:00:00+05:30`) - back * DAY)
export const dayExpr = field => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: TZ } })
/** Day keys from `from` up to today. */
export function dayKeys(days) {
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) out.push(dayKey(istDayStart(i).getTime() + 3600 * 1000))
  return out
}
