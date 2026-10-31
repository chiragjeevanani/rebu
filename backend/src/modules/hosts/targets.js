// Host targets: admins set weekly and/or monthly goals with a coin reward.
// Progress is counted from the host's earnings ledger; when a target is met
// the host claims the reward, which lands as a bonus earning (₹ at coinInr,
// no commission) and is withdrawn together with everything else.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, parse } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { Earning } from '../earnings/earnings.models.js'
import { recordEarning, withTxn } from '../wallet/economy.service.js'
import { notify } from '../notifications/notifications.js'

const { Schema } = mongoose
const DAY = 86400000
const IST = 330 * 60000

export const METRICS = {
  gift_coins: { label: 'Gift coins received', unit: 'coins' },
  coins: { label: 'Coins earned (calls, chat, gifts)', unit: 'coins' },
  call_minutes: { label: 'Call minutes', unit: 'min' },
}

const targetSchema = new Schema(
  {
    title: { type: String, required: true },
    period: { type: String, enum: ['weekly', 'monthly'], required: true },
    metric: { type: String, enum: Object.keys(METRICS), required: true },
    goal: { type: Number, required: true },
    reward: { type: Number, required: true }, // coins
    host: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = every host
    active: { type: Boolean, default: true },
    createdBy: String,
  },
  { timestamps: true },
)
targetSchema.index({ active: 1, host: 1 })
export const HostTarget = mongoose.models.HostTarget || mongoose.model('HostTarget', targetSchema)

const claimSchema = new Schema(
  {
    target: { type: Schema.Types.ObjectId, required: true },
    host: { type: Schema.Types.ObjectId, required: true },
    period: { type: String, required: true }, // e.g. 2026-W44 or 2026-10
    reward: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
claimSchema.index({ target: 1, host: 1, period: 1 }, { unique: true })
export const TargetClaim = mongoose.models.TargetClaim || mongoose.model('TargetClaim', claimSchema)

/** Current IST window for a period: { key, start, end }. Weeks start Monday. */
export function windowOf(period, now = Date.now()) {
  const ist = new Date(now + IST)
  if (period === 'monthly') {
    const y = ist.getUTCFullYear()
    const m = ist.getUTCMonth()
    const start = new Date(Date.UTC(y, m, 1) - IST)
    const end = new Date(Date.UTC(y, m + 1, 1) - IST)
    return { key: `${y}-${String(m + 1).padStart(2, '0')}`, start, end }
  }
  const dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
  const back = (ist.getUTCDay() + 6) % 7
  const start = new Date(dayStart - back * DAY - IST)
  const end = new Date(start.getTime() + 7 * DAY)
  return { key: `W${new Date(start.getTime() + IST).toISOString().slice(0, 10)}`, start, end }
}

/** Progress of one host on one metric within [start, end). */
async function progressOf(hostId, metric, { start, end }) {
  const match = { host: new mongoose.Types.ObjectId(String(hostId)), createdAt: { $gte: start, $lt: end }, status: { $ne: 'reversed' } }
  if (metric === 'gift_coins') match.source = 'gift'
  else match.source = { $ne: 'bonus' }
  const [r] = await Earning.aggregate([
    { $match: match },
    { $group: { _id: null, coins: { $sum: '$coins' }, minutes: { $sum: { $ifNull: ['$minutes', 0] } } } },
  ])
  return metric === 'call_minutes' ? r?.minutes || 0 : r?.coins || 0
}

/** Every active target for this host, with progress in the current window. */
export async function targetsFor(hostId) {
  const list = await HostTarget.find({ active: true, $or: [{ host: null }, { host: hostId }] }).sort({ period: -1, goal: 1 }).lean()
  return Promise.all(
    list.map(async t => {
      const w = windowOf(t.period)
      const [done, claimed] = await Promise.all([progressOf(hostId, t.metric, w), TargetClaim.exists({ target: t._id, host: hostId, period: w.key })])
      return {
        id: String(t._id),
        title: t.title,
        period: t.period,
        metric: t.metric,
        metricLabel: METRICS[t.metric].label,
        unit: METRICS[t.metric].unit,
        goal: t.goal,
        reward: t.reward,
        progress: Math.min(done, t.goal),
        done: done >= t.goal,
        claimed: !!claimed,
        endsAt: w.end,
      }
    }),
  )
}

// ---- Host routes (mounted under /api/host, behind requireHost) -------------------

export const hostTargetRoutes = Router()

hostTargetRoutes.get(
  '/targets',
  ah(async (req, res) => res.json({ items: await targetsFor(req.user._id) })),
)

hostTargetRoutes.post(
  '/targets/:id/claim',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Target')
    const t = await HostTarget.findOne({ _id: req.params.id, active: true, $or: [{ host: null }, { host: req.user._id }] }).lean()
    if (!t) throw notFound('Target')
    const w = windowOf(t.period)
    if ((await progressOf(req.user._id, t.metric, w)) < t.goal) throw badRequest('This target isn’t complete yet.')
    try {
      const earning = await withTxn(async s => {
        await TargetClaim.create([{ target: t._id, host: req.user._id, period: w.key, reward: t.reward }], { session: s })
        return recordEarning(req.user._id, { source: 'bonus', coins: t.reward, fromName: 'REBU', detail: `Target reward: ${t.title}` }, s)
      })
      res.status(201).json({ reward: t.reward, earned: earning.net })
    } catch (e) {
      if (e?.code === 11000) throw conflict('You’ve already claimed this target.', 'already_claimed')
      throw e
    }
  }),
)

// ---- Admin routes (mounted at /api/admin/targets) --------------------------------

export const targetsAdmin = Router()
targetsAdmin.use(requireAdmin(Admin, 'hosts'))

const targetBody = z
  .object({
    title: z.string().trim().min(2).max(60),
    period: z.enum(['weekly', 'monthly']),
    metric: z.enum(Object.keys(METRICS)),
    goal: z.number().int().positive(),
    reward: z.number().int().positive().max(1_000_000),
    hostId: z.string().refine(mongoose.isValidObjectId, 'Invalid host').nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()

async function adminRow(t) {
  const w = windowOf(t.period)
  const [claims, host] = await Promise.all([
    TargetClaim.countDocuments({ target: t._id, period: w.key }),
    t.host ? User.findById(t.host, { name: 1, host: 1 }).lean() : null,
  ])
  return {
    ...t,
    id: String(t._id),
    hostId: t.host ? String(t.host) : null,
    hostName: host ? host.host?.displayName || host.name : null,
    metricLabel: METRICS[t.metric].label,
    periodKey: w.key,
    endsAt: w.end,
    claimedThisPeriod: claims,
  }
}

targetsAdmin.get(
  '/',
  ah(async (req, res) => {
    const list = await HostTarget.find({}).sort({ active: -1, createdAt: -1 }).lean()
    res.json({ items: await Promise.all(list.map(adminRow)), metrics: METRICS })
  }),
)

/** One target's progress across hosts (current window). */
targetsAdmin.get(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Target')
    const t = await HostTarget.findById(req.params.id).lean()
    if (!t) throw notFound('Target')
    const w = windowOf(t.period)
    const hosts = await User.find({ 'host.approved': true, 'host.status': 'active', ...(t.host && { _id: t.host }) }, { name: 1, host: 1, photos: 1 }).limit(500).lean()
    const claims = new Set((await TargetClaim.find({ target: t._id, period: w.key }, { host: 1 }).lean()).map(c => String(c.host)))
    const rows = await Promise.all(
      hosts.map(async h => {
        const done = await progressOf(h._id, t.metric, w)
        return { id: String(h._id), name: h.host.displayName || h.name, avatar: h.host.photos?.[0] || h.photos?.[0] || null, progress: done, done: done >= t.goal, claimed: claims.has(String(h._id)) }
      }),
    )
    rows.sort((a, b) => b.progress - a.progress)
    res.json({ target: await adminRow(t), hosts: rows })
  }),
)

targetsAdmin.post(
  '/',
  ah(async (req, res) => {
    const b = parse(targetBody, req.body)
    if (b.hostId && !(await User.exists({ _id: b.hostId, 'host.approved': true }))) throw notFound('Host')
    const t = await HostTarget.create({ ...b, host: b.hostId || null, createdBy: req.admin.name })
    await audit(req, `Created ${b.period} target “${b.title}” (${b.goal} ${METRICS[b.metric].unit}, reward ${b.reward} coins)`, t._id)
    // Tell the host(s) about the new target.
    const ids = b.hostId ? [b.hostId] : (await User.find({ 'host.approved': true, 'host.status': 'active' }, { _id: 1 }).lean()).map(h => h._id)
    for (const id of ids) notify(id, { kind: 'reward', title: `New ${b.period} target 🎯`, body: `${b.title} — earn ${b.reward} bonus coins`, deeplink: 'rebu://host' })
    res.status(201).json({ target: await adminRow(t.toObject()) })
  }),
)

targetsAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Target')
    const b = parse(targetBody.partial(), req.body)
    const set = { ...b }
    if ('hostId' in b) {
      set.host = b.hostId || null
      delete set.hostId
    }
    const t = await HostTarget.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after' }).lean()
    if (!t) throw notFound('Target')
    await audit(req, `Updated target “${t.title}”`, t._id)
    res.json({ target: await adminRow(t) })
  }),
)

targetsAdmin.delete(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Target')
    const t = await HostTarget.findByIdAndDelete(req.params.id).lean()
    if (!t) throw notFound('Target')
    await audit(req, `Deleted target “${t.title}”`, t._id)
    res.json({ ok: true })
  }),
)
