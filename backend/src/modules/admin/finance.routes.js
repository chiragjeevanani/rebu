import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { toUser } from '../../core/realtime.js'
import { notify } from '../notifications/notifications.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { Payment } from '../wallet/wallet.models.js'
import { Dispute, Earning, Withdrawal } from '../earnings/earnings.models.js'
import { adjustEarnings, creditCoins, debitCoins, hostBalance, withTxn } from '../wallet/economy.service.js'
import { DAY, dayExpr, dayKeys, istDayStart, round2, rx, sorting, withId, whoMap } from './admin.util.js'

export const financeAdmin = Router()
financeAdmin.use(requireAdmin(Admin, 'finance'))

const idList = z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(200)
const since = days => (days ? new Date(Date.now() - Number(days) * DAY) : null)

async function idsByName(q) {
  const r = rx(q)
  return (await User.find({ $or: [{ name: r }, { 'host.displayName': r }, { phone: r }] }, { _id: 1 }).limit(500).lean()).map(u => u._id)
}

// ── Transactions (coin-pack payments) ────────────────────────────────────
const txRow = (p, people) => {
  const u = people.get(String(p.user))
  // Gateway "created" reads as "pending" in the panel.
  return { ...withId(p), userId: String(p.user), userName: u?.name, userAvatar: u?.avatar, gatewayRef: p.gatewayPaymentId || p.gatewayOrderId, ts: p.createdAt, status: p.status === 'created' ? 'pending' : p.status, rawStatus: p.status }
}

financeAdmin.get(
  '/transactions',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const base = {}
    if (q.method && q.method !== 'all') base.method = q.method
    if (q.gateway && q.gateway !== 'all') base.gateway = q.gateway
    if (q.user) base.user = q.user
    const from = since(q.days || (q.range !== 'all' ? q.range : null))
    if (from) base.createdAt = { $gte: from }
    if (q.q) {
      const term = q.q.trim()
      base.$or = [{ user: { $in: await idsByName(term) } }, { gatewayOrderId: term }, { gatewayPaymentId: term }, { packId: term }, ...(/^[a-f\d]{24}$/i.test(term) ? [{ _id: term }] : [])]
    }
    const f = { ...base }
    const status = q.status === 'pending' ? 'created' : q.status
    if (['created', 'success', 'failed', 'refunded'].includes(status)) f.status = status
    const sort = sorting(q, { ts: 'createdAt', amount: 'amount', coins: 'coins' }, { createdAt: -1 })
    const [rows, total, totals, methods] = await Promise.all([
      Payment.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      Payment.countDocuments(f),
      Payment.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      Payment.distinct('method'),
    ])
    const people = await whoMap(rows.map(p => p.user))
    res.json({
      ...paged(rows.map(p => txRow(p, people)), total, pg),
      totals: Object.fromEntries(totals.map(t => [t._id === 'created' ? 'pending' : t._id, { count: t.n, amount: round2(t.amount) }])),
      methods: methods.filter(Boolean),
    })
  }),
)

financeAdmin.get(
  '/transactions/:id',
  ah(async (req, res) => {
    const p = await Payment.findById(req.params.id).lean()
    if (!p) throw notFound('Payment')
    res.json({ transaction: txRow(p, await whoMap([p.user])) })
  }),
)

/**
 * created → success, crediting coins+bonus once. The conditional status
 * update is the idempotency guard (same pattern as the gateway webhook).
 */
export async function markPaymentSuccess(paymentId, meta = {}) {
  return withTxn(async s => {
    const p = await Payment.findOneAndUpdate(
      { _id: paymentId, status: 'created' },
      { $set: { status: 'success', ...meta } },
      { returnDocument: 'after', session: s, strict: false },
    ).lean()
    if (!p) return null
    const coins = p.coins + (p.bonus || 0)
    const balance = await creditCoins(p.user, coins, { type: 'purchase', title: `Bought ${p.coins}${p.bonus ? ` + ${p.bonus} bonus` : ''} coins`, ref: { kind: 'Payment', id: p._id } }, s)
    await User.updateOne({ _id: p.user }, { $inc: { spent: p.amount } }, { session: s })
    return { payment: p, balance, coins }
  })
}

financeAdmin.post(
  '/transactions/:id/success',
  ah(async (req, res) => {
    const { note } = parse(z.object({ note: z.string().trim().max(300).optional() }), req.body || {})
    const r = await markPaymentSuccess(req.params.id, { handledBy: req.admin.name, resolvedAt: new Date(), note: note || '' })
    if (!r) {
      const p = await Payment.findById(req.params.id, { status: 1 }).lean()
      if (!p) throw notFound('Payment')
      throw conflict(`Only pending payments can be marked successful (this one is ${p.status}).`)
    }
    toUser(r.payment.user, 'wallet:update', { balance: r.balance, reason: 'purchase' })
    await audit(req, `Marked payment successful — credited ${r.coins} coins (₹${r.payment.amount})`, r.payment._id, { user: String(r.payment.user) })
    res.json({ ok: true, coins: r.coins, balance: r.balance })
  }),
)

financeAdmin.post(
  '/transactions/:id/failed',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body || {})
    const p = await Payment.findOneAndUpdate(
      { _id: req.params.id, status: 'created' },
      { $set: { status: 'failed', failureReason: reason || 'Marked failed by admin', handledBy: req.admin.name, resolvedAt: new Date() } },
      { returnDocument: 'after', strict: false },
    ).lean()
    if (!p) {
      if (!(await Payment.exists({ _id: req.params.id }))) throw notFound('Payment')
      throw conflict('Only pending payments can be marked failed.')
    }
    await audit(req, `Marked payment failed${reason ? ` — ${reason}` : ''}`, p._id)
    res.json({ ok: true })
  }),
)

financeAdmin.post(
  '/transactions/:id/refund',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(300) }), req.body)
    const r = await withTxn(async s => {
      const p = await Payment.findOneAndUpdate(
        { _id: req.params.id, status: 'success' },
        { $set: { status: 'refunded', refundReason: reason, refundedAt: new Date(), handledBy: req.admin.name } },
        { returnDocument: 'after', session: s, strict: false },
      ).lean()
      if (!p) {
        const cur = await Payment.findById(req.params.id, { status: 1 }).session(s).lean()
        if (!cur) throw notFound('Payment')
        throw conflict(`Only successful payments can be refunded (this one is ${cur.status}).`)
      }
      // Take back what the pack gave, but never push the balance below 0.
      const wanted = p.coins + (p.bonus || 0)
      const u = await User.findById(p.user, { coins: 1 }).session(s).lean()
      const deducted = Math.min(wanted, u?.coins || 0)
      let balance = u?.coins || 0
      if (deducted > 0) {
        balance = await debitCoins(p.user, deducted, { type: 'refund', title: 'Coin pack refunded', ref: { kind: 'Payment', id: p._id }, meta: { reason, wanted } }, s)
      }
      await Payment.updateOne({ _id: p._id }, { $set: { refundedCoins: deducted } }, { session: s, strict: false })
      await User.updateOne({ _id: p.user }, { $inc: { spent: -p.amount } }, { session: s })
      return { p, wanted, deducted, balance }
    })
    // TODO: call the gateway's refund API here once a real gateway is wired (Razorpay refunds).
    toUser(r.p.user, 'wallet:update', { balance: r.balance, reason: 'refund' })
    await audit(req, `Refunded payment ₹${r.p.amount} — deducted ${r.deducted}/${r.wanted} coins — ${reason}`, r.p._id, { user: String(r.p.user), deducted: r.deducted })
    res.json({ ok: true, deductedCoins: r.deducted, wantedCoins: r.wanted, balance: r.balance })
  }),
)

// ── Withdrawals ──────────────────────────────────────────────────────────
const wdRow = (w, people) => {
  const h = people.get(String(w.host))
  const m = w.method || {}
  return {
    ...withId(w),
    hostId: String(w.host),
    hostName: h?.name,
    hostAvatar: h?.avatar,
    ts: w.createdAt,
    method: { kind: m.kind, label: m.label, holder: m.holder, upi: m.upi, account: m.account ? `••••${String(m.account).slice(-4)}` : undefined, ifsc: m.ifsc },
  }
}

financeAdmin.get(
  '/withdrawals',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const base = {}
    if (q.kind === 'upi' || q.kind === 'bank') base['method.kind'] = q.kind
    if (q.host) base.host = q.host
    if (q.q) {
      const term = q.q.trim()
      base.$or = [{ host: { $in: await idsByName(term) } }, { utr: term }, ...(/^[a-f\d]{24}$/i.test(term) ? [{ _id: term }] : [])]
    }
    const status = ['requested', 'processing', 'paid', 'rejected'].includes(q.status) ? q.status : null
    const f = status ? { ...base, status } : base
    const sort = sorting(q, { ts: 'createdAt', amount: 'amount' }, status === 'requested' ? { createdAt: 1 } : { createdAt: -1 })
    const [rows, total, totals] = await Promise.all([
      Withdrawal.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      Withdrawal.countDocuments(f),
      Withdrawal.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' }, net: { $sum: '$net' } } }]),
    ])
    const people = await whoMap(rows.map(w => w.host))
    res.json({
      ...paged(rows.map(w => wdRow(w, people)), total, pg),
      totals: Object.fromEntries(totals.map(t => [t._id, { count: t.count, amount: round2(t.amount), net: round2(t.net) }])),
    })
  }),
)

financeAdmin.get(
  '/withdrawals/:id',
  ah(async (req, res) => {
    const w = await Withdrawal.findById(req.params.id).lean()
    if (!w) throw notFound('Withdrawal')
    const [people, balance, history] = await Promise.all([
      whoMap([w.host]),
      hostBalance(w.host),
      Withdrawal.find({ host: w.host, _id: { $ne: w._id } }).sort({ createdAt: -1 }).limit(10).lean(),
    ])
    res.json({ withdrawal: wdRow(w, people), balance, history: history.map(x => wdRow(x, people)) })
  }),
)

/** Conditional status move; 409 if it's no longer in `from`. */
async function moveWithdrawal(req, id, from, set) {
  const w = await Withdrawal.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { ...set, handledBy: req.admin.name } }, { returnDocument: 'after' }).lean()
  if (!w) {
    const cur = await Withdrawal.findById(id, { status: 1 }).lean()
    if (!cur) throw notFound('Withdrawal')
    throw conflict(`This withdrawal is already ${cur.status}.`)
  }
  toUser(w.host, 'withdrawal:update', { id: String(w._id), status: w.status })
  notifyPayout(w)
  return w
}

const PAYOUT_TEXT = {
  processing: w => ['Payout approved', `₹${w.net} is on its way to ${w.method?.label || 'your account'}.`],
  paid: w => ['Payout sent 🎉', `₹${w.net} was paid${w.utr ? ` (UTR ${w.utr})` : ''}.`],
  rejected: w => ['Payout rejected', w.note || `₹${w.amount} is back in your available balance.`],
}
function notifyPayout(w) {
  const t = PAYOUT_TEXT[w.status]?.(w)
  if (t) notify(w.host, { kind: 'payout', title: t[0], body: t[1], deeplink: 'rebu://host/earnings', push: 'always' })
}

financeAdmin.post(
  '/withdrawals/bulk-approve',
  ah(async (req, res) => {
    const { ids } = parse(z.object({ ids: idList }), req.body)
    const done = []
    for (const id of ids) {
      const w = await Withdrawal.findOneAndUpdate({ _id: id, status: 'requested' }, { $set: { status: 'processing', approvedAt: new Date(), handledBy: req.admin.name } }, { returnDocument: 'after' }).lean()
      if (!w) continue
      done.push(String(w._id))
      toUser(w.host, 'withdrawal:update', { id: String(w._id), status: w.status })
      notifyPayout(w)
      await audit(req, `Approved withdrawal ₹${w.amount} (bulk)`, w._id)
    }
    res.json({ approved: done.length, ids: done, skipped: ids.length - done.length })
  }),
)

financeAdmin.post(
  '/withdrawals/:id/approve',
  ah(async (req, res) => {
    const w = await moveWithdrawal(req, req.params.id, ['requested'], { status: 'processing', approvedAt: new Date() })
    await audit(req, `Approved withdrawal ₹${w.amount}`, w._id)
    res.json({ withdrawal: wdRow(w, await whoMap([w.host])) })
  }),
)

financeAdmin.post(
  '/withdrawals/:id/paid',
  ah(async (req, res) => {
    const { utr } = parse(z.object({ utr: z.string().trim().regex(/^[A-Za-z0-9]{6,30}$/, 'Enter the bank UTR / reference') }), req.body)
    const w = await moveWithdrawal(req, req.params.id, ['processing'], { status: 'paid', utr, paidAt: new Date() })
    await audit(req, `Marked withdrawal paid · UTR ${utr}`, w._id)
    res.json({ withdrawal: wdRow(w, await whoMap([w.host])) })
  }),
)

financeAdmin.post(
  '/withdrawals/:id/reject',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(300) }), req.body)
    // Rejected withdrawals drop out of hostBalance(), so the amount is available again.
    const w = await moveWithdrawal(req, req.params.id, ['requested', 'processing'], { status: 'rejected', note: reason, rejectedAt: new Date() })
    await audit(req, `Rejected withdrawal ₹${w.amount} · ${reason}`, w._id)
    res.json({ withdrawal: wdRow(w, await whoMap([w.host])), balance: await hostBalance(w.host) })
  }),
)

// ── Earning disputes ─────────────────────────────────────────────────────
async function disputeRows(rows) {
  const [people, earnings] = await Promise.all([whoMap(rows.map(d => d.host)), Earning.find({ _id: { $in: rows.map(d => d.earning) } }).lean()])
  const e = new Map(earnings.map(x => [String(x._id), x]))
  return rows.map(d => {
    const h = people.get(String(d.host))
    const x = e.get(String(d.earning))
    return {
      ...withId(d),
      hostId: String(d.host),
      hostName: h?.name,
      hostAvatar: h?.avatar,
      ts: d.createdAt,
      earning: x ? { id: String(x._id), source: x.source, from: x.fromName, coins: x.coins, net: x.net, status: x.status, ts: x.createdAt, detail: x.detail } : null,
    }
  })
}

financeAdmin.get(
  '/disputes',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const base = {}
    if (q.host) base.host = q.host
    if (q.q) base.$or = [{ host: { $in: await idsByName(q.q.trim()) } }, { reason: rx(q.q) }]
    const status = ['open', 'adjusted', 'rejected'].includes(q.status) ? q.status : null
    const f = status ? { ...base, status } : base
    const [rows, total, counts] = await Promise.all([
      Dispute.find(f).sort(status === 'open' ? { createdAt: 1 } : { createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      Dispute.countDocuments(f),
      Dispute.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    res.json({ ...paged(await disputeRows(rows), total, pg), counts: Object.fromEntries(counts.map(c => [c._id, c.n])) })
  }),
)

financeAdmin.post(
  '/disputes/:id/adjust',
  ah(async (req, res) => {
    const { amount, note } = parse(
      z.object({ amount: z.number().refine(n => Math.abs(n) <= 1_000_000, 'Too large'), note: z.string().trim().min(2).max(500) }),
      req.body,
    )
    const amt = round2(amount)
    const d0 = await Dispute.findById(req.params.id).lean()
    if (!d0) throw notFound('Dispute')
    if (amt < 0) {
      const { available } = await hostBalance(d0.host)
      if (-amt > available) throw badRequest(`Can’t deduct more than the available ₹${available}.`)
    }
    const d = await withTxn(async s => {
      const x = await Dispute.findOneAndUpdate(
        { _id: req.params.id, status: 'open' },
        { $set: { status: 'adjusted', resolution: note, adjustment: amt, handledBy: req.admin.name, resolvedAt: new Date() } },
        { returnDocument: 'after', session: s },
      ).lean()
      if (!x) throw conflict('This dispute was already resolved.')
      if (amt !== 0) await adjustEarnings(x.host, amt, `Dispute adjustment: ${note}`, s)
      // Release any hold on the disputed earning.
      await Earning.updateOne({ _id: x.earning, status: 'review' }, { $set: { status: 'settled' } }, { session: s })
      return x
    })
    toUser(d.host, 'dispute:update', { id: String(d._id), status: d.status, adjustment: amt })
    await audit(req, `Adjusted earning dispute by ₹${amt} · ${note}`, d._id, { host: String(d.host) })
    const [row] = await disputeRows([d])
    res.json({ dispute: row, balance: await hostBalance(d.host) })
  }),
)

financeAdmin.post(
  '/disputes/:id/reject',
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(500) }), req.body)
    const d = await withTxn(async s => {
      const x = await Dispute.findOneAndUpdate(
        { _id: req.params.id, status: 'open' },
        { $set: { status: 'rejected', resolution: reason, handledBy: req.admin.name, resolvedAt: new Date() } },
        { returnDocument: 'after', session: s },
      ).lean()
      if (!x) {
        if (!(await Dispute.exists({ _id: req.params.id }).session(s))) throw notFound('Dispute')
        throw conflict('This dispute was already resolved.')
      }
      await Earning.updateOne({ _id: x.earning, status: 'review' }, { $set: { status: 'settled' } }, { session: s })
      return x
    })
    toUser(d.host, 'dispute:update', { id: String(d._id), status: d.status })
    await audit(req, `Rejected earning dispute · ${reason}`, d._id)
    const [row] = await disputeRows([d])
    res.json({ dispute: row })
  }),
)

// ── Revenue ──────────────────────────────────────────────────────────────
financeAdmin.get(
  '/revenue',
  ah(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const from = istDayStart(days - 1)
    const prevFrom = new Date(from.getTime() - days * DAY)
    const ok = { status: 'success', createdAt: { $gte: from } }
    const [byDay, byPack, byMethod, prev, refunds, payouts, payoutDays, take] = await Promise.all([
      Payment.aggregate([{ $match: ok }, { $group: { _id: dayExpr('$createdAt'), revenue: { $sum: '$amount' }, count: { $sum: 1 }, coins: { $sum: { $add: ['$coins', '$bonus'] } } } }]),
      Payment.aggregate([{ $match: ok }, { $group: { _id: '$packId', revenue: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { revenue: -1 } }]),
      Payment.aggregate([{ $match: ok }, { $group: { _id: { $ifNull: ['$method', 'unknown'] }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { revenue: -1 } }]),
      Payment.aggregate([{ $match: { status: 'success', createdAt: { $gte: prevFrom, $lt: from } } }, { $group: { _id: null, revenue: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { status: 'refunded', refundedAt: { $gte: from } } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Withdrawal.aggregate([
        { $match: { $or: [{ status: 'paid', paidAt: { $gte: from } }, { status: { $in: ['requested', 'processing'] } }] } },
        { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Withdrawal.aggregate([{ $match: { status: 'paid', paidAt: { $gte: from } } }, { $group: { _id: dayExpr('$paidAt'), amount: { $sum: '$amount' } } }]),
      Earning.aggregate([
        { $match: { createdAt: { $gte: from }, status: { $ne: 'reversed' }, source: { $ne: 'bonus' } } },
        { $group: { _id: null, gross: { $sum: '$gross' }, commission: { $sum: '$commission' }, agency: { $sum: '$agency' }, net: { $sum: '$net' } } },
      ]),
    ])
    const d = new Map(byDay.map(x => [x._id, x]))
    const pd = new Map(payoutDays.map(x => [x._id, x.amount]))
    const series = dayKeys(days).map(k => ({ day: k, revenue: round2(d.get(k)?.revenue || 0), payments: d.get(k)?.count || 0, coinsSold: d.get(k)?.coins || 0, payouts: round2(pd.get(k) || 0) }))
    const revenue = round2(series.reduce((n, x) => n + x.revenue, 0))
    const p = Object.fromEntries(payouts.map(x => [x._id, { amount: round2(x.amount), count: x.count }]))
    const t = take[0] || { gross: 0, commission: 0, agency: 0, net: 0 }
    res.json({
      days,
      revenue,
      previousRevenue: round2(prev[0]?.revenue || 0),
      refunds: { amount: round2(refunds[0]?.amount || 0), count: refunds[0]?.count || 0 },
      byDay: series,
      byPack: byPack.map(x => ({ packId: x._id, revenue: round2(x.revenue), count: x.count })),
      byMethod: byMethod.map(x => ({ method: x._id, revenue: round2(x.revenue), count: x.count })),
      payouts: { paid: p.paid || { amount: 0, count: 0 }, requested: p.requested || { amount: 0, count: 0 }, processing: p.processing || { amount: 0, count: 0 } },
      // Take rate: REBU commission as a share of what users spent on hosts (₹ gross).
      earnings: { gross: round2(t.gross), commission: round2(t.commission), agency: round2(t.agency), hostNet: round2(t.net) },
      takeRate: t.gross ? round2((t.commission / t.gross) * 100) : 0,
    })
  }),
)
