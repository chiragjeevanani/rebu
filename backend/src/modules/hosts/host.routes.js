import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { requireHost } from '../../core/auth.js'
import { User } from '../users/user.model.js'
import { Live } from '../lives/live.model.js'
import { Agency, HostApplication, PayoutMethod } from './hosts.models.js'
import { Dispute, Earning, Withdrawal } from '../earnings/earnings.models.js'
import { hostBalance, withTxn } from '../wallet/economy.service.js'
import { getConfig } from '../config/config.service.js'
import {
  activeAgency,
  ageOn,
  applicationFlags,
  approveApplication,
  hostLevel,
  istDayKey,
  istDayStart,
  levelCap,
  maskAccount,
} from './hosts.service.js'

export const hostRoutes = Router()

const round2 = n => Math.round(n * 100) / 100
const oid = id => new mongoose.Types.ObjectId(String(id))
const SOURCES = ['video', 'voice', 'chat', 'gift', 'ticket', 'bonus']

/** Throws 400 unless both rates are listed tiers within the level's cap. */
function checkRates(rates, level) {
  const { rateTiers } = getConfig()
  const cap = levelCap(level)
  const errs = []
  for (const k of ['video', 'voice']) {
    if (rates[k] === undefined) continue
    if (!rateTiers[k].includes(rates[k])) errs.push({ path: `rates.${k}`, message: `Choose one of ${rateTiers[k].join(', ')}` })
    else if (rates[k] > cap) errs.push({ path: `rates.${k}`, message: `Level ${level} hosts can charge up to ${cap} coins/min` })
  }
  if (errs.length) throw badRequest('Some prices are not allowed.', errs)
}

// ---- Application ------------------------------------------------------------

const appOut = a =>
  a && {
    id: String(a._id),
    status: a.status,
    reasons: a.reasons,
    name: a.name,
    gender: a.gender,
    dob: a.dob,
    languages: a.languages,
    bio: a.bio,
    photos: a.photos,
    idType: a.get('id.type'),
    idLast4: a.get('id.last4'),
    agencyCode: a.agencyCode,
    rates: a.rates,
    reviewedAt: a.reviewedAt,
    createdAt: a.createdAt,
  }

function applicationSchema() {
  const { hostApply } = getConfig().settings
  const url = z.string().trim().url()
  return z.object({
    name: z.string().trim().min(2).max(40),
    gender: z.enum(['Female', 'Male', 'Other']),
    dob: z.coerce.date().refine(d => !Number.isNaN(d.getTime()), 'Invalid date'),
    languages: z.array(z.string().trim().min(2).max(20)).min(1).max(6),
    bio: z.string().trim().max(300).optional().default(''),
    photos: z.array(url).min(1).max(4),
    selfie: hostApply.requireSelfie ? url : url.optional(),
    id: hostApply.requireId
      ? z.object({
          type: z.enum(hostApply.idTypes),
          last4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/, 'Last 4 characters of the ID'),
          photo: url,
        })
      : z.object({ type: z.enum(hostApply.idTypes), last4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/), photo: url.optional() }).optional(),
    agencyCode: z.string().trim().toUpperCase().max(20).optional().nullable(),
    rates: z.object({ video: z.number().int(), voice: z.number().int() }),
  })
}

hostRoutes.post(
  '/application',
  ah(async (req, res) => {
    const { settings } = getConfig()
    if (settings.features?.hostApplications === false) throw forbidden('Host applications are closed right now.')
    // The app currently sends `agency`; accept it as an alias.
    const body = { ...req.body, agencyCode: req.body?.agencyCode ?? req.body?.agency }
    const data = parse(applicationSchema(), body)
    if (ageOn(data.dob) < settings.hostApply.minAge) throw badRequest(`You must be ${settings.hostApply.minAge} or older to host.`)
    checkRates(data.rates, 1)

    if (req.user.host?.approved) throw conflict('You are already a host.')
    if (await HostApplication.exists({ user: req.user._id, status: 'pending' })) {
      throw conflict('Your application is already under review.')
    }
    const agencyCode = data.agencyCode || undefined
    const flags = await applicationFlags({ agencyCode, bio: data.bio, dob: data.dob })
    let app = await HostApplication.create({ ...data, agencyCode, user: req.user._id, flags, status: 'pending' })

    if (settings.hostApply.autoApprove) app = await approveApplication(app, 'Auto-approve')
    res.status(201).json({ application: appOut(app) })
  }),
)

hostRoutes.get(
  '/application',
  ah(async (req, res) => {
    const app = await HostApplication.findOne({ user: req.user._id }).sort({ createdAt: -1 })
    res.json({ application: appOut(app) || null, isHost: !!req.user.host?.approved })
  }),
)

// Everything below is the approved host's own center.
hostRoutes.use(requireHost)

// ---- Host center --------------------------------------------------------------

const agencyOut = a => a && { id: String(a._id), name: a.name, code: a.code, cut: getConfig().economy.agencyCut }

hostRoutes.get(
  '/me',
  ah(async (req, res) => {
    const u = req.user
    const { hostLevels } = getConfig()
    const level = hostLevel(u.host)
    // Keep the stored level (used by toPublic) in step with minutes.
    if (!u.host.levelOverride && u.host.level !== level) {
      await User.updateOne({ _id: u._id }, { $set: { 'host.level': level } })
      u.host.level = level
    }
    const minutes = u.host.callMinutes || 0
    const nextL = hostLevels.find(l => l.level > level)
    const curL = hostLevels.find(l => l.level === level) || hostLevels[0]

    const since = istDayStart(0)
    const [rows, balance, agency] = await Promise.all([
      Earning.aggregate([
        { $match: { host: u._id, createdAt: { $gte: since }, status: { $ne: 'reversed' } } },
        {
          $group: {
            _id: '$source',
            net: { $sum: '$net' },
            minutes: { $sum: { $ifNull: ['$minutes', 0] } },
            // A call may bill in several rows; count distinct calls by ref.
            refs: { $addToSet: { $ifNull: ['$ref.id', '$_id'] } },
          },
        },
      ]),
      hostBalance(u._id),
      u.host.agencyId ? Agency.findById(u.host.agencyId) : null,
    ])
    const bySource = Object.fromEntries(rows.map(r => [r._id, round2(r.net)]))
    // Today's time live (a live that started before midnight counts from midnight).
    const lives = await Live.find({ owner: u._id, $or: [{ status: 'live' }, { endedAt: { $gte: since } }] }, { startedAt: 1, endedAt: 1 }).lean()
    const liveMinutes = Math.floor(
      lives.reduce((n, l) => n + Math.max(0, ((l.endedAt ? l.endedAt.getTime() : Date.now()) - Math.max(l.startedAt.getTime(), since.getTime())) / 1000), 0) / 60,
    )
    const calls = rows.filter(r => r._id === 'video' || r._id === 'voice')

    res.json({
      host: { ...u.host.toObject(), level },
      name: u.host.displayName || u.name,
      agency: agencyOut(agency),
      level,
      levels: hostLevels.map(l => ({ ...l, reached: minutes >= l.minutes || l.level <= level, current: l.level === level })),
      maxRate: curL.maxRate,
      next: nextL
        ? {
            level: nextL.level,
            minutes: nextL.minutes,
            remaining: Math.max(0, nextL.minutes - minutes),
            progress: Math.min(1, (minutes - curL.minutes) / Math.max(1, nextL.minutes - curL.minutes)),
            maxRate: nextL.maxRate,
          }
        : null,
      callMinutes: minutes,
      balance,
      today: {
        net: round2(rows.reduce((n, r) => n + r.net, 0)),
        bySource,
        calls: calls.reduce((n, r) => n + r.refs.length, 0),
        callMinutes: calls.reduce((n, r) => n + r.minutes, 0),
        liveMinutes,
      },
    })
  }),
)

hostRoutes.patch(
  '/me',
  ah(async (req, res) => {
    const patch = parse(
      z.object({
        online: z.boolean().optional(),
        rates: z.object({ video: z.number().int().optional(), voice: z.number().int().optional() }).optional(),
        bio: z.string().trim().max(300).optional(),
        languages: z.array(z.string().trim().min(2).max(20)).min(1).max(6).optional(),
      }),
      req.body,
    )
    const h = req.user.host
    if (patch.rates) {
      checkRates(patch.rates, hostLevel(h))
      if (patch.rates.video !== undefined) h.rates.video = patch.rates.video
      if (patch.rates.voice !== undefined) h.rates.voice = patch.rates.voice
    }
    if (patch.online !== undefined) h.online = patch.online
    if (patch.bio !== undefined) h.bio = patch.bio
    if (patch.languages) h.languages = patch.languages
    await req.user.save()
    res.json({ host: h.toObject(), user: req.user.toPublic() })
  }),
)

// ---- Agency -------------------------------------------------------------------

hostRoutes.post(
  '/agency',
  ah(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().trim().min(2).max(20) }), req.body)
    const agency = await activeAgency(code)
    if (!agency) throw badRequest('That agency code isn’t valid.')
    if (req.user.host.agencyId?.equals(agency._id)) throw conflict('You are already with this agency.')
    if (req.user.host.agencyId) throw conflict('Leave your current agency first.')
    req.user.host.agencyId = agency._id
    await req.user.save()
    res.json({ agency: agencyOut(agency) })
  }),
)

hostRoutes.delete(
  '/agency',
  ah(async (req, res) => {
    req.user.host.agencyId = null
    await req.user.save()
    res.json({ agency: null })
  }),
)

// ---- Earnings -----------------------------------------------------------------

const RANGES = { today: 0, '7d': 6, week: 6, '30d': 29, month: 29, all: null }
const rangeStart = r => (RANGES[r] === null ? null : istDayStart(RANGES[r]))

const earningOut = e => ({
  id: String(e._id),
  source: e.source,
  from: e.from ? String(e.from) : null,
  fromName: e.fromName || (e.source === 'bonus' ? 'REBU' : null),
  coins: e.coins,
  gross: e.gross,
  commission: e.commission,
  commissionPct: e.commissionPct,
  agency: e.agency,
  net: e.net,
  minutes: e.minutes,
  detail: e.detail,
  status: e.status,
  createdAt: e.createdAt,
  ts: new Date(e.createdAt).getTime(),
})

hostRoutes.get(
  '/earnings',
  ah(async (req, res) => {
    const f = parse(
      z.object({ range: z.enum(Object.keys(RANGES)).default('7d'), source: z.enum(SOURCES).optional() }),
      req.query,
    )
    const p = paging(req.query)
    const q = { host: req.user._id }
    const since = rangeStart(f.range)
    if (since) q.createdAt = { $gte: since }
    const listQ = f.source ? { ...q, source: f.source } : q

    const [items, total, rows] = await Promise.all([
      Earning.find(listQ).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      Earning.countDocuments(listQ),
      // Summary covers the whole range (all sources) so the breakdown stays put while filtering.
      Earning.aggregate([
        { $match: { ...q, status: { $ne: 'reversed' } } },
        {
          $group: {
            _id: '$source',
            gross: { $sum: '$gross' },
            commission: { $sum: '$commission' },
            agency: { $sum: '$agency' },
            net: { $sum: '$net' },
            count: { $sum: 1 },
            qty: { $sum: { $ifNull: ['$minutes', { $cond: [{ $eq: ['$source', 'chat'] }, 1, 0] }] } },
          },
        },
      ]),
    ])
    const sum = k => round2(rows.reduce((n, r) => n + r[k], 0))
    const summary = {
      gross: sum('gross'),
      commission: sum('commission'),
      agency: sum('agency'),
      net: sum('net'),
      bySource: Object.fromEntries(rows.map(r => [r._id, { net: round2(r.net), count: r.count, qty: r.qty }])),
    }
    res.json({ range: f.range, summary, ...paged(items.map(earningOut), total, p) })
  }),
)

hostRoutes.get(
  '/earnings/daily',
  ah(async (req, res) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }), req.query)
    const rows = await Earning.aggregate([
      { $match: { host: req.user._id, createdAt: { $gte: istDayStart(days - 1) }, status: { $ne: 'reversed' } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } },
          net: { $sum: '$net' },
          count: { $sum: 1 },
        },
      },
    ])
    const byDay = Object.fromEntries(rows.map(r => [r._id, r]))
    const out = Array.from({ length: days }, (_, i) => {
      const date = istDayKey(istDayStart(days - 1 - i))
      return { date, ago: days - 1 - i, net: round2(byDay[date]?.net || 0), count: byDay[date]?.count || 0 }
    })
    res.json({ days: out })
  }),
)

hostRoutes.post(
  '/earnings/:id/report',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body)
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Earning')
    const out = await withTxn(async s => {
      // settled → review is the lock: a second report finds nothing to update.
      const e = await Earning.findOneAndUpdate(
        { _id: req.params.id, host: req.user._id, status: 'settled' },
        { status: 'review' },
        { returnDocument: 'after', session: s },
      )
      if (!e) {
        const cur = await Earning.findOne({ _id: req.params.id, host: req.user._id }).session(s)
        if (!cur) throw notFound('Earning')
        throw conflict(cur.status === 'review' ? 'You already reported this earning.' : 'This earning can’t be reported.')
      }
      if (await Dispute.exists({ earning: e._id, status: 'open' }).session(s)) throw conflict('You already reported this earning.')
      const [d] = await Dispute.create([{ host: req.user._id, earning: e._id, reason }], { session: s })
      return { earning: e, dispute: d }
    })
    res.status(201).json({ earning: earningOut(out.earning), dispute: out.dispute })
  }),
)

// ---- Payout methods -----------------------------------------------------------

const MAX_METHODS = 5
const holderName = u => u.host.displayName || u.name

const methodOut = m => ({
  id: String(m._id),
  kind: m.kind,
  holder: m.holder,
  label: m.label,
  detail: m.kind === 'upi' ? 'Usually instant' : `IFSC ${m.ifsc}`,
  upi: m.upi,
  account: maskAccount(m.account),
  ifsc: m.ifsc,
  createdAt: m.createdAt,
})

hostRoutes.get(
  '/payout-methods',
  ah(async (req, res) => {
    const items = await PayoutMethod.find({ host: req.user._id }).sort({ createdAt: 1 })
    res.json({ items: items.map(methodOut), holder: holderName(req.user) })
  }),
)

const methodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upi'), upi: z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID') }),
  z.object({
    kind: z.literal('bank'),
    account: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits'),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC'),
  }),
])

hostRoutes.post(
  '/payout-methods',
  ah(async (req, res) => {
    const m = parse(methodSchema, req.body)
    const host = req.user._id
    if ((await PayoutMethod.countDocuments({ host })) >= MAX_METHODS) throw conflict(`You can save up to ${MAX_METHODS} payout accounts.`)
    const dupe = m.kind === 'upi' ? { host, kind: 'upi', upi: m.upi } : { host, kind: 'bank', account: m.account, ifsc: m.ifsc }
    if (await PayoutMethod.exists(dupe)) throw conflict('This account is already saved.')
    const doc = await PayoutMethod.create({
      ...m,
      host,
      holder: holderName(req.user),
      label: m.kind === 'upi' ? `UPI · ${m.upi}` : `Bank ${maskAccount(m.account)}`,
    })
    res.status(201).json({ method: methodOut(doc) })
  }),
)

hostRoutes.delete(
  '/payout-methods/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Payout account')
    const r = await PayoutMethod.deleteOne({ _id: req.params.id, host: req.user._id })
    if (!r.deletedCount) throw notFound('Payout account')
    res.json({ ok: true })
  }),
)

// ---- Withdrawals --------------------------------------------------------------

const withdrawalOut = w => ({
  id: String(w._id),
  amount: w.amount,
  fee: w.fee,
  net: w.net,
  method: w.method,
  status: w.status,
  utr: w.utr,
  note: w.note,
  createdAt: w.createdAt,
  ts: new Date(w.createdAt).getTime(),
  paidAt: w.paidAt,
  rejectedAt: w.rejectedAt,
})

hostRoutes.post(
  '/withdrawals',
  ah(async (req, res) => {
    const { amount: raw, methodId } = parse(
      z.object({ amount: z.number().positive(), methodId: z.string().refine(mongoose.isValidObjectId, 'Invalid account') }),
      req.body,
    )
    const amount = round2(raw)
    const { economy } = getConfig()
    if (amount < economy.minWithdraw) throw badRequest(`The minimum withdrawal is ₹${economy.minWithdraw}.`)
    const m = await PayoutMethod.findOne({ _id: methodId, host: req.user._id })
    if (!m) throw notFound('Payout account')
    const hostId = req.user._id

    const w = await withTxn(async s => {
      // Touch the host's user doc first: concurrent withdrawals then hit a write
      // conflict and retry, so each one sees the others before checking balance.
      await User.updateOne({ _id: hostId }, { $currentDate: { updatedAt: true } }, { session: s, timestamps: false })
      const bal = await hostBalance(hostId)
      if (amount > bal.available) throw badRequest('Amount is more than your available balance.', { available: bal.available })
      const [t] = await Withdrawal.aggregate([
        { $match: { host: oid(hostId), status: { $ne: 'rejected' }, createdAt: { $gte: istDayStart(0) } } },
        { $group: { _id: null, sum: { $sum: '$amount' } } },
      ]).session(s)
      const today = t?.sum || 0
      if (today + amount > economy.maxWithdrawPerDay) {
        throw badRequest(`You can withdraw up to ₹${economy.maxWithdrawPerDay} a day.`, { left: round2(Math.max(0, economy.maxWithdrawPerDay - today)) })
      }
      const fee = round2((amount * economy.withdrawFee) / 100)
      const [doc] = await Withdrawal.create(
        [
          {
            host: hostId,
            amount,
            fee,
            net: round2(amount - fee),
            method: { methodId: m._id, kind: m.kind, label: m.label, holder: m.holder, upi: m.upi, account: maskAccount(m.account), ifsc: m.ifsc },
          },
        ],
        { session: s },
      )
      return doc
    })
    res.status(201).json({ withdrawal: withdrawalOut(w), balance: await hostBalance(hostId) })
  }),
)

hostRoutes.get(
  '/withdrawals',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { host: req.user._id }
    const [items, total, balance] = await Promise.all([
      Withdrawal.find(q).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      Withdrawal.countDocuments(q),
      hostBalance(req.user._id),
    ])
    res.json({ balance, ...paged(items.map(withdrawalOut), total, p) })
  }),
)
