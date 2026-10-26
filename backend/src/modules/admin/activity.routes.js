import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { toUser } from '../../core/realtime.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { CoinTxn } from '../wallet/wallet.models.js'
import { Earning } from '../earnings/earnings.models.js'
import { creditCoins, withTxn } from '../wallet/economy.service.js'
import { endCall } from '../calls/calls.service.js'
import { endLiveFn, notReady, optModel, round2, rx, sorting, withId, whoMap } from './admin.util.js'

// The Call and Live models belong to modules built in parallel; they're looked
// up at request time so this file loads even before they exist.
const CallModel = () => optModel('Call') || (() => { throw notReady('Calls') })()
const LiveModel = () => optModel('Live') || (() => { throw notReady('Lives') })()

// ── Calls ────────────────────────────────────────────────────────────────
export const callsAdmin = Router()
callsAdmin.use(requireAdmin(Admin, 'calls'))

const CALL_TABS = {
  ongoing: { status: { $in: ['ringing', 'connected'] } },
  completed: { status: { $in: ['ended', 'completed'] } },
  missed: { status: { $in: ['missed', 'declined'] } },
  failed: { status: 'cancelled' },
  flagged: { flagged: true },
  refunded: { refunded: true },
}

async function userIdsMatching(q) {
  const r = rx(q)
  const rows = await User.find({ $or: [{ name: r }, { 'host.displayName': r }, { phone: r }] }, { _id: 1 }).limit(500).lean()
  return rows.map(u => u._id)
}

async function decorateCalls(calls) {
  const ids = calls.flatMap(c => [c.caller, c.host])
  const [people, net] = await Promise.all([
    whoMap(ids),
    Earning.aggregate([{ $match: { 'ref.id': { $in: calls.map(c => c._id) }, status: { $ne: 'reversed' } } }, { $group: { _id: '$ref.id', net: { $sum: '$net' } } }]),
  ])
  const n = new Map(net.map(x => [String(x._id), x]))
  return calls.map(c => {
    const u = people.get(String(c.caller))
    const h = people.get(String(c.host))
    const end = c.endedAt ? new Date(c.endedAt) : c.status === 'connected' ? new Date() : null
    return {
      ...withId(c),
      userId: String(c.caller),
      userName: u?.name,
      userAvatar: u?.avatar,
      hostId: String(c.host),
      hostName: h?.name,
      hostAvatar: h?.avatar,
      ts: c.connectedAt || c.createdAt,
      // Panel vocabulary: ended → completed, ringing/connected → ongoing.
      status: c.status === 'ended' ? 'completed' : c.status === 'connected' || c.status === 'ringing' ? 'ongoing' : c.status,
      rawStatus: c.status,
      duration: c.status === 'connected' && c.connectedAt ? Math.round((end - new Date(c.connectedAt)) / 1000) : c.duration || 0,
      coins: c.chargedCoins || 0,
      // Live earnings rows for the call (minutes + in-call gifts); reversed rows excluded.
      hostNet: round2(n.get(String(c._id))?.net ?? 0),
      flagged: !!c.flagged,
      refunded: !!c.refunded,
    }
  })
}

callsAdmin.get(
  '/',
  ah(async (req, res) => {
    const Call = CallModel()
    const q = req.query
    const pg = paging(q)
    const f = { ...(CALL_TABS[q.tab] || {}) }
    if (q.type === 'video' || q.type === 'voice') f.type = q.type
    if (q.user) f.caller = q.user
    if (q.host) f.host = q.host
    if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) }
    if (q.q) {
      const term = q.q.trim()
      const ids = await userIdsMatching(term)
      f.$or = [{ caller: { $in: ids } }, { host: { $in: ids } }, ...(/^[a-f\d]{24}$/i.test(term) ? [{ _id: term }, { caller: term }, { host: term }] : [])]
    }
    const sort = sorting(q, { ts: 'createdAt', coins: 'chargedCoins', rate: 'rate', minutes: 'minutes', status: 'status' }, { createdAt: -1 })
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Tab counts use the same filters minus the tab itself.
    const base = { ...f }
    for (const k of Object.keys(CALL_TABS[q.tab] || {})) delete base[k]
    const [rows, total, live, todayCount, ...tabCounts] = await Promise.all([
      Call.find(f).setOptions({ strictQuery: false }).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      Call.countDocuments(f).setOptions({ strictQuery: false }),
      Call.countDocuments({ status: 'connected' }),
      Call.countDocuments({ createdAt: { $gte: today } }),
      ...Object.values(CALL_TABS).map(t => Call.countDocuments({ ...base, ...t }).setOptions({ strictQuery: false })),
    ])
    const counts = Object.fromEntries(Object.keys(CALL_TABS).map((k, i) => [k, tabCounts[i]]))
    res.json({ ...paged(await decorateCalls(rows), total, pg), stats: { live, today: todayCount }, counts })
  }),
)

callsAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const Call = CallModel()
    const c = await Call.findById(req.params.id).lean()
    if (!c) throw notFound('Call')
    const [[call], earnings, txns] = await Promise.all([
      decorateCalls([c]),
      Earning.find({ 'ref.id': c._id }).lean(),
      CoinTxn.find({ 'ref.id': c._id }).sort({ createdAt: 1 }).lean(),
    ])
    res.json({ call, earnings: earnings.map(withId), coinTxns: txns.map(withId) })
  }),
)

callsAdmin.post(
  '/:id/refund',
  ah(async (req, res) => {
    const Call = CallModel()
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(300) }), req.body)
    const result = await withTxn(async s => {
      // Conditional update → a call can only be refunded once.
      const c = await Call.findOneAndUpdate(
        { _id: req.params.id, refunded: { $ne: true }, status: { $nin: ['ringing', 'connected'] } },
        { $set: { refunded: true, refundReason: reason, refundedAt: new Date(), refundedBy: req.admin.name } },
        { returnDocument: 'before', session: s, strict: false, strictQuery: false },
      ).lean()
      if (!c) {
        const cur = await Call.findById(req.params.id, { status: 1, refunded: 1 }).session(s).lean()
        if (!cur) throw notFound('Call')
        throw conflict(cur.refunded ? 'This call was already refunded.' : 'This call is still in progress.')
      }
      const coins = c.chargedCoins || 0
      await Call.updateOne({ _id: c._id }, { $set: { refundCoins: coins } }, { session: s, strict: false })
      let balance = null
      if (coins > 0) {
        balance = await creditCoins(c.caller, coins, { type: 'refund', title: 'Call refund', ref: { kind: 'Call', id: c._id }, meta: { reason, by: req.admin.name } }, s)
      }
      const rev = await Earning.updateMany({ 'ref.id': c._id, status: { $ne: 'reversed' } }, { $set: { status: 'reversed' } }, { session: s })
      return { call: c, coins, balance, reversed: rev.modifiedCount }
    })
    if (result.coins > 0) toUser(result.call.caller, 'wallet:update', { balance: result.balance, reason: 'refund' })
    await audit(req, `Refunded ${result.coins} coins for call — ${reason}`, req.params.id, { user: String(result.call.caller), host: String(result.call.host), reversedEarnings: result.reversed })
    res.json({ ok: true, coins: result.coins, balance: result.balance, reversedEarnings: result.reversed })
  }),
)

callsAdmin.post(
  '/:id/flag',
  ah(async (req, res) => {
    const Call = CallModel()
    const { flagged = true, note } = parse(z.object({ flagged: z.boolean().optional(), note: z.string().trim().max(300).optional() }), req.body || {})
    const c = await Call.findByIdAndUpdate(req.params.id, { $set: { flagged, flagNote: note || '' } }, { returnDocument: 'after', strict: false }).lean()
    if (!c) throw notFound('Call')
    await audit(req, `${flagged ? 'Flagged' : 'Unflagged'} call${note ? ` — ${note}` : ''}`, c._id)
    res.json({ ok: true, flagged })
  }),
)

// ── Lives ────────────────────────────────────────────────────────────────
/** End a ringing or connected call now. Minutes so far are billed as usual. */
callsAdmin.post(
  '/:id/end',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(200) }), req.body)
    const Call = CallModel()
    const cur = await Call.findById(req.params.id, { status: 1 }).lean()
    if (!cur) throw notFound('Call')
    if (!['ringing', 'connected'].includes(cur.status)) throw conflict('This call has already ended.')
    await endCall(req.params.id, { reason: 'admin' })
    const fresh = await Call.findById(req.params.id).lean()
    await audit(req, `Ended call — ${reason}`, fresh._id, { caller: String(fresh.caller), host: String(fresh.host) })
    const [call] = await decorateCalls([fresh])
    res.json({ ok: true, call })
  }),
)

export const livesAdmin = Router()
livesAdmin.use(requireAdmin(Admin, 'lives'))

const liveOwner = l => l.owner || l.host

livesAdmin.get(
  '/',
  ah(async (req, res) => {
    const Live = LiveModel()
    const q = req.query
    const pg = paging(q)
    const f = q.tab === 'history' ? { status: { $ne: 'live' } } : { status: 'live' }
    if (['live', 'premium', 'party', 'audio'].includes(q.mode)) f.mode = q.mode
    if (q.host) f.owner = q.host
    if (q.q) {
      const ids = await userIdsMatching(q.q.trim())
      f.$or = [{ owner: { $in: ids } }, { title: rx(q.q) }]
    }
    const sort = sorting(q, { started: 'startedAt', viewers: 'viewers', peak: 'peak' }, q.tab === 'history' ? { endedAt: -1, createdAt: -1 } : { createdAt: -1 })
    const [rows, total, live] = await Promise.all([Live.find(f, { chat: 0, viewerIds: 0, uniqueViewers: 0, ticketHolders: 0, requests: 0 }).sort(sort).skip(pg.skip).limit(pg.limit).lean(), Live.countDocuments(f), Live.countDocuments({ status: 'live' })])
    const people = await whoMap(rows.map(liveOwner))
    const items = rows.map(l => {
      const h = people.get(String(liveOwner(l)))
      return { ...withId(l), hostId: String(liveOwner(l)), hostName: h?.name, hostAvatar: h?.avatar, startedAt: l.startedAt || l.createdAt }
    })
    res.json({ ...paged(items, total, pg), stats: { live } })
  }),
)

livesAdmin.post(
  '/:id/end',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(300) }), req.body)
    const endLive = await endLiveFn()
    if (!endLive) throw notReady('Ending lives')
    const result = await endLive(req.params.id, reason, req.admin.name)
    await audit(req, `Ended live stream — ${reason}`, req.params.id)
    res.json({ ok: true, result: result ?? null })
  }),
)

livesAdmin.post(
  '/:id/warn',
  ah(async (req, res) => {
    const Live = LiveModel()
    const { message } = parse(z.object({ message: z.string().trim().min(2).max(500) }), req.body)
    const l = await Live.findById(req.params.id).lean()
    if (!l) throw notFound('Live')
    if (l.status !== 'live') throw badRequest('This live has already ended.')
    const owner = liveOwner(l)
    toUser(owner, 'live:warning', { liveId: String(l._id), message, from: 'REBU team' })
    await Live.updateOne({ _id: l._id }, { $push: { warnings: { message, by: req.admin.name, ts: new Date() } } }, { strict: false })
    await audit(req, `Warned host in live — ${message}`, l._id, { host: String(owner) })
    res.json({ ok: true })
  }),
)
