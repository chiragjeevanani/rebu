import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { toUser } from '../../core/realtime.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User, hostCategoryOf } from '../users/user.model.js'
import { Agency, HostApplication, PayoutMethod } from '../hosts/hosts.models.js'
import { Earning, Withdrawal } from '../earnings/earnings.models.js'
import { adjustEarnings, hostBalance, levelForGifts } from '../wallet/economy.service.js'
import { getConfig } from '../config/config.service.js'
import { Report } from '../reports/reports.models.js'
import { applyStatus, balancesFor, oid, optModel, round2, rx, sorting, statusBody, statusText, withId, whoMap } from './admin.util.js'

export const hostsAdmin = Router()
hostsAdmin.use(requireAdmin(Admin, 'hosts'))

const age = dob => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null)

function hostRow(u, bal) {
  const h = u.host || {}
  return {
    id: String(u._id),
    name: h.displayName || u.name,
    phone: u.phone,
    avatar: h.photos?.[0] || u.photos?.[0] || null,
    photos: h.photos || [],
    gender: u.gender,
    age: age(u.dob),
    city: u.city,
    languages: h.languages || [],
    bio: h.bio || '',
    level: h.levelOverride || h.level,
    autoLevel: h.level,
    levelOverride: h.levelOverride ?? null,
    category: hostCategoryOf(h.levelOverride || h.level),
    giftCoins: h.giftCoins || 0,
    rates: h.rates,
    status: h.status,
    accountStatus: u.status,
    statusReason: u.statusReason || '',
    online: !!h.online,
    busy: !!h.busy,
    rating: h.rating,
    ratingCount: h.ratingCount,
    agencyId: h.agencyId ? String(h.agencyId) : null,
    joined: h.approvedAt || u.createdAt,
    callMinutes: h.callMinutes || 0,
    verified: u.verified,
    lifetime: bal?.lifetime ?? null,
    available: bal?.available ?? null,
    balance: bal || null,
  }
}

hostsAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const f = { 'host.approved': true }
    if (['active', 'suspended', 'banned'].includes(q.status)) f['host.status'] = q.status
    if (q.online === 'true' || q.online === 'online') f['host.online'] = true
    if (q.online === 'false' || q.online === 'offline') f['host.online'] = { $ne: true }
    if (q.agency === 'none') f['host.agencyId'] = null
    else if (q.agency && q.agency !== 'any') f['host.agencyId'] = q.agency
    const and = []
    if (q.level && q.level !== 'any') {
      const L = Number(q.level)
      and.push({ $or: [{ 'host.levelOverride': L }, { 'host.levelOverride': null, 'host.level': L }] })
    }
    if (q.q) {
      const r = rx(q.q)
      and.push({ $or: [{ name: r }, { 'host.displayName': r }, { phone: r }, ...(/^[a-f\d]{24}$/i.test(q.q.trim()) ? [{ _id: q.q.trim() }] : [])] })
    }
    if (and.length) f.$and = and
    const sort = sorting(q, { name: 'host.displayName', joined: 'host.approvedAt', minutes: 'host.callMinutes', rating: 'host.rating', level: 'host.level' }, { 'host.approvedAt': -1 })
    // Money sorts need every matching host's balance; others page in the database.
    const money = q.sort === 'lifetime' || q.sort === 'available'
    if (money) {
      const all = await User.find(f, { _id: 1 }).limit(5000).lean()
      const bals = await balancesFor(all.map(u => u._id))
      const dir = q.dir === 'asc' ? 1 : -1
      const ids = all
        .map(u => String(u._id))
        .sort((a, b) => dir * ((bals.get(a)?.[q.sort] || 0) - (bals.get(b)?.[q.sort] || 0)))
        .slice(pg.skip, pg.skip + pg.limit)
      const page = await User.find({ _id: { $in: ids } }).lean()
      const byId = new Map(page.map(u => [String(u._id), u]))
      return res.json(paged(ids.map(i => hostRow(byId.get(i), bals.get(i))), all.length, pg))
    }
    const [rows, total] = await Promise.all([User.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(), User.countDocuments(f)])
    // Balances for this page only, in two aggregates.
    const bals = await balancesFor(rows.map(u => u._id))
    res.json(paged(rows.map(u => hostRow(u, bals.get(String(u._id)))), total, pg))
  }),
)

hostsAdmin.post(
  '/bulk-status',
  ah(async (req, res) => {
    const body = parse(statusBody.extend({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(200) }), req.body)
    let n = 0
    for (const id of body.ids) {
      const ok = await User.exists({ _id: id, 'host.approved': true })
      if (ok && (await applyStatus(id, body, { asHost: true }))) {
        n += 1
        await audit(req, `${statusText(body)} (host, bulk)`, id)
      }
    }
    res.json({ updated: n })
  }),
)

async function loadHost(id) {
  const u = await User.findOne({ _id: id, 'host.approved': true }).lean()
  if (!u) throw notFound('Host')
  return u
}

/** How many hosts sit at each level and price (Host levels page). */
hostsAdmin.get(
  '/stats',
  ah(async (req, res) => {
    const base = { 'host.approved': true, 'host.status': 'active' }
    const level = { $ifNull: ['$host.levelOverride', '$host.level'] }
    const [total, byLevel, video, voice] = await Promise.all([
      User.countDocuments(base),
      User.aggregate([{ $match: base }, { $group: { _id: level, n: { $sum: 1 } } }]),
      User.aggregate([{ $match: base }, { $group: { _id: '$host.rates.video', n: { $sum: 1 } } }]),
      User.aggregate([{ $match: base }, { $group: { _id: '$host.rates.voice', n: { $sum: 1 } } }]),
    ])
    const obj = rows => Object.fromEntries(rows.filter(r => r._id != null).map(r => [r._id, r.n]))
    res.json({ total, byLevel: obj(byLevel), byRate: { video: obj(video), voice: obj(voice) } })
  }),
)

/** ID type and last 4 digits from the host's approved application. */
export async function idInfo(userId) {
  const app = await HostApplication.findOne({ user: userId, status: 'approved' }, { id: 1 }).sort({ createdAt: -1 }).lean()
  return { idType: app?.id?.type || null, idLast4: app?.id?.last4 || null }
}

hostsAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const u = await loadHost(req.params.id)
    const id = u._id
    const id_ = id
    const Call = optModel('Call')
    const Live = optModel('Live')
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const [balance, calls, lives, withdrawals, reports, bySource, recent, agency, methods] = await Promise.all([
      hostBalance(id),
      Call ? Call.find({ host: id }).sort({ createdAt: -1 }).limit(50).lean() : [],
      Live ? Live.find({ owner: id }, { chat: 0, viewerIds: 0, uniqueViewers: 0, ticketHolders: 0 }).sort({ createdAt: -1 }).limit(30).lean() : [],
      Withdrawal.find({ host: id }).sort({ createdAt: -1 }).limit(30).lean(),
      Report.find({ targetId: String(id) }).sort({ createdAt: -1 }).limit(30).lean(),
      Earning.aggregate([
        { $match: { host: id, status: { $ne: 'reversed' } } },
        {
          $group: {
            _id: '$source',
            net: { $sum: '$net' },
            gross: { $sum: '$gross' },
            count: { $sum: 1 },
            net30: { $sum: { $cond: [{ $gte: ['$createdAt', since30] }, '$net', 0] } },
          },
        },
      ]),
      Earning.find({ host: id }).sort({ createdAt: -1 }).limit(30).lean(),
      u.host.agencyId ? Agency.findById(u.host.agencyId).lean() : null,
      PayoutMethod.find({ host: id }).lean(),
    ])
    const users = await whoMap(calls.map(c => c.caller))
    // Answer rate: calls the host picked up out of those that rang them (30 days).
    const [rang, answered, ident] = await Promise.all([
      Call ? Call.countDocuments({ host: id_, createdAt: { $gte: since30 }, status: { $in: ['ended', 'missed', 'declined', 'connected'] } }) : 0,
      Call ? Call.countDocuments({ host: id_, createdAt: { $gte: since30 }, connectedAt: { $ne: null } }) : 0,
      idInfo(id_),
    ])
    res.json({
      host: {
        ...hostRow(u, balance),
        notes: u.notes || '',
        answerRate: rang ? Math.round((answered / rang) * 100) : null,
        followers: u.followersCount || 0,
        ...ident,
      },
      balance,
      earnings: {
        bySource: Object.fromEntries(bySource.map(s => [s._id, { net: round2(s.net), gross: round2(s.gross), count: s.count, last30: round2(s.net30) }])),
        last30: round2(bySource.reduce((n, s) => n + s.net30, 0)),
        recent: recent.map(withId),
      },
      agency: agency ? withId(agency) : null,
      payoutMethods: methods.map(m => ({ ...withId(m), account: m.account ? `••••${m.account.slice(-4)}` : undefined })),
      calls: calls.map(c => ({ ...withId(c), user: users.get(String(c.caller)) || { id: String(c.caller) } })),
      lives: lives.map(withId),
      withdrawals: withdrawals.map(withId),
      reports: reports.map(withId),
      callsAvailable: !!Call,
      livesAvailable: !!Live,
    })
  }),
)

const rateField = z.number().int().positive()

hostsAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    const body = parse(
      z
        .object({
          rates: z.object({ video: rateField, voice: rateField }).partial().optional(),
          levelOverride: z.number().int().positive().nullable().optional(),
          agencyId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
        })
        .strict(),
      req.body,
    )
    if (!Object.keys(body).length) throw badRequest('Nothing to update.')
    const u = await loadHost(req.params.id)
    const { hostLevels, rateTiers } = getConfig()
    const set = {}
    const what = []

    // Effective level after this change (null override = automatic from minutes).
    let override = u.host.levelOverride ?? null
    if ('levelOverride' in body) {
      if (body.levelOverride !== null && !hostLevels.some(l => l.level === body.levelOverride)) throw badRequest('Unknown level.')
      override = body.levelOverride
      set['host.levelOverride'] = override
      const auto = levelForGifts(u.host.giftCoins || 0)
      set['host.level'] = auto
      what.push(override ? `Set level to ${override} (manual)` : `Set level to automatic (${auto})`)
    }
    const level = override || set['host.level'] || u.host.level
    const cap = hostLevels.find(l => l.level === level)?.maxRate ?? Infinity

    const rates = { ...u.host.rates, ...(body.rates || {}) }
    for (const type of ['video', 'voice']) {
      const r = rates[type]
      const explicit = body.rates?.[type] !== undefined
      if (explicit && !rateTiers[type].includes(r)) throw badRequest(`${type} rate must be one of ${rateTiers[type].join(', ')}.`)
      if (explicit && r > cap) throw badRequest(`Level ${level} hosts can charge at most ${cap} coins/min.`)
      // A level drop pulls existing prices down to the highest allowed tier.
      if (!explicit && r > cap) rates[type] = [...rateTiers[type]].filter(t => t <= cap).pop() ?? rateTiers[type][0]
    }
    if (rates.video !== u.host.rates.video || rates.voice !== u.host.rates.voice) {
      set['host.rates'] = { video: rates.video, voice: rates.voice }
      what.push(`Changed call prices to video ${rates.video} / voice ${rates.voice} coins/min (was ${u.host.rates.video} / ${u.host.rates.voice})`)
    }

    if ('agencyId' in body) {
      if (body.agencyId) {
        const a = await Agency.findById(body.agencyId).lean()
        if (!a) throw notFound('Agency')
        if (a.status !== 'active') throw badRequest('That agency is suspended.')
        what.push(`Moved host to agency ${a.name} (${a.code})`)
      } else what.push('Made host independent')
      set['host.agencyId'] = body.agencyId ? oid(body.agencyId) : null
    }

    const updated = await User.findByIdAndUpdate(u._id, { $set: set }, { returnDocument: 'after' }).lean()
    if (what.length) await audit(req, what.join('; '), u._id)
    res.json({ host: hostRow(updated) })
  }),
)

hostsAdmin.post(
  '/:id/status',
  ah(async (req, res) => {
    const body = parse(statusBody, req.body)
    if (body.status !== 'active' && !body.reason) throw badRequest('Give a reason.')
    await loadHost(req.params.id)
    const set = await applyStatus(req.params.id, body, { asHost: true })
    await audit(req, `${statusText(body)} (host)`, req.params.id)
    res.json({ ok: true, status: body.status, suspendedUntil: set.suspendedUntil })
  }),
)

hostsAdmin.post(
  '/:id/force-offline',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body || {})
    await loadHost(req.params.id)
    await User.updateOne({ _id: req.params.id }, { $set: { 'host.online': false } })
    toUser(req.params.id, 'host:force_offline', { reason: reason || '' })
    await audit(req, `Forced host offline${reason ? ` — ${reason}` : ''}`, req.params.id)
    res.json({ ok: true })
  }),
)

hostsAdmin.post(
  '/:id/earnings',
  ah(async (req, res) => {
    const { amount, reason } = parse(
      z.object({
        amount: z.number().refine(n => n !== 0, 'Must not be 0').refine(n => Math.abs(n) <= 1_000_000, 'Too large'),
        reason: z.string().trim().min(2).max(200),
      }),
      req.body,
    )
    await loadHost(req.params.id)
    const amt = round2(amount)
    if (amt < 0) {
      const { available } = await hostBalance(req.params.id)
      if (-amt > available) throw badRequest(`Can’t deduct more than the available ₹${available}.`)
    }
    const earning = await adjustEarnings(req.params.id, amt, `Admin adjustment: ${reason}`)
    const balance = await hostBalance(req.params.id)
    await audit(req, `${amt > 0 ? 'Credited' : 'Debited'} ₹${Math.abs(amt)} earnings — ${reason}`, req.params.id, { amount: amt })
    res.json({ earning: withId(earning.toObject()), balance })
  }),
)
