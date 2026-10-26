import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { CoinTxn, Payment } from '../wallet/wallet.models.js'
import { creditCoins, debitCoins } from '../wallet/economy.service.js'
import { Report } from '../reports/reports.models.js'
import { applyStatus, optModel, rx, sorting, statusBody, statusText, withId, whoMap } from './admin.util.js'
import { notify } from '../notifications/notifications.js'

export const usersAdmin = Router()
usersAdmin.use(requireAdmin(Admin, 'users'))

const LIST_FIELDS = { phone: 1, email: 1, name: 1, gender: 1, dob: 1, city: 1, photos: 1, coins: 1, spent: 1, vip: 1, verified: 1, verification: 1, status: 1, statusReason: 1, suspendedUntil: 1, device: 1, lastActive: 1, createdAt: 1, 'host.approved': 1 }

const age = dob => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null)
const userRow = u => ({ ...withId(u), avatar: u.photos?.[0] || null, age: age(u.dob), joined: u.createdAt, vip: u.vip?.level || 0, isHost: !!u.host?.approved })

/** Per-user counts for a page of rows. */
async function countsFor(ids) {
  const Call = optModel('Call')
  const [reports, calls] = await Promise.all([
    Report.aggregate([{ $match: { targetId: { $in: ids.map(String) } } }, { $group: { _id: '$targetId', n: { $sum: 1 } } }]),
    Call ? Call.aggregate([{ $match: { caller: { $in: ids } } }, { $group: { _id: '$caller', n: { $sum: 1 } } }]) : [],
  ])
  return { reports: new Map(reports.map(r => [String(r._id), r.n])), calls: new Map(calls.map(r => [String(r._id), r.n])) }
}

usersAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const f = {}
    if (q.hosts !== 'include') f['host.approved'] = { $ne: true }
    if (['active', 'suspended', 'banned'].includes(q.status)) f.status = q.status
    if (q.vip === 'vip') f['vip.level'] = { $gt: 0 }
    else if (q.vip !== undefined && q.vip !== 'any' && /^\d$/.test(q.vip)) f['vip.level'] = Number(q.vip)
    if (q.device && q.device !== 'any') f['device.platform'] = rx(q.device)
    if (q.paying === 'yes') f.spent = { $gt: 0 }
    if (q.paying === 'no') f.spent = { $lte: 0 }
    if (q.verified === 'true' || q.verified === 'false') f.verified = q.verified === 'true'
    if (q.verification === 'pending') f['verification.status'] = 'pending'
    if (q.q) {
      const r = rx(q.q)
      f.$or = [{ name: r }, { phone: r }, { email: r }, ...(/^[a-f\d]{24}$/i.test(q.q.trim()) ? [{ _id: q.q.trim() }] : [])]
    }
    const sort = sorting(q, { name: 'name', joined: 'createdAt', lastActive: 'lastActive', coins: 'coins', spent: 'spent' }, { createdAt: -1 })
    const [rows, total] = await Promise.all([User.find(f, LIST_FIELDS).sort(sort).skip(pg.skip).limit(pg.limit).lean(), User.countDocuments(f)])
    const c = await countsFor(rows.map(u => u._id))
    const items = rows.map(u => ({ ...userRow(u), calls: c.calls.get(String(u._id)) || 0, reports: c.reports.get(String(u._id)) || 0 }))
    res.json(paged(items, total, pg))
  }),
)

usersAdmin.post(
  '/bulk-status',
  ah(async (req, res) => {
    const body = parse(statusBody.extend({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(200) }), req.body)
    let n = 0
    for (const id of body.ids) {
      if (await applyStatus(id, body)) {
        n += 1
        await audit(req, `${statusText(body)} (bulk)`, id)
      }
    }
    res.json({ updated: n })
  }),
)

usersAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const u = await User.findById(req.params.id).lean()
    if (!u) throw notFound('User')
    const Call = optModel('Call')
    const id = u._id
    const [calls, payments, reportsAgainst, reportsBy, txns] = await Promise.all([
      Call ? Call.find({ caller: id }).sort({ createdAt: -1 }).limit(50).lean() : [],
      Payment.find({ user: id }).sort({ createdAt: -1 }).limit(50).lean(),
      Report.find({ targetId: String(id) }).sort({ createdAt: -1 }).limit(50).lean(),
      Report.find({ reporter: id }).sort({ createdAt: -1 }).limit(20).lean(),
      CoinTxn.find({ user: id }).sort({ createdAt: -1 }).limit(100).lean(),
    ])
    const hosts = await whoMap(calls.map(c => c.host))
    delete u.blocked
    res.json({
      user: { ...userRow(u), notes: u.notes || '', following: u.following?.length || 0 },
      calls: calls.map(c => ({ ...withId(c), host: hosts.get(String(c.host)) || { id: String(c.host) } })),
      payments: payments.map(withId),
      reports: reportsAgainst.map(withId),
      reportsFiled: reportsBy.map(withId),
      coinTxns: txns.map(withId),
      callsAvailable: !!Call,
    })
  }),
)

usersAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    const body = parse(z.object({ notes: z.string().max(5000).optional(), verified: z.boolean().optional() }).strict(), req.body)
    if (!Object.keys(body).length) throw badRequest('Nothing to update.')
    const set = { ...body }
    // Deciding on the blue tick closes any pending selfie request.
    if ('verified' in body) set['verification.status'] = body.verified ? 'none' : 'rejected'
    const u = await User.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after', projection: LIST_FIELDS }).lean()
    if (!u) throw notFound('User')
    const what = []
    if ('notes' in body) what.push('Updated notes')
    if ('verified' in body) what.push(body.verified ? 'Verified profile' : 'Removed verification')
    await audit(req, what.join(', '), u._id)
    if ('verified' in body) {
      notify(u._id, body.verified
        ? { kind: 'safety', title: 'You’re verified ✅', body: 'Your profile now shows the blue tick.' }
        : { kind: 'safety', title: 'Verification not approved', body: 'Your selfie didn’t clearly match your photos. You can try again.' })
    }
    res.json({ user: userRow(u) })
  }),
)

usersAdmin.post(
  '/:id/status',
  ah(async (req, res) => {
    const body = parse(statusBody, req.body)
    if (body.status !== 'active' && !body.reason) throw badRequest('Give a reason.')
    const set = await applyStatus(req.params.id, body)
    if (!set) throw notFound('User')
    await audit(req, statusText(body), req.params.id)
    res.json({ ok: true, status: body.status, suspendedUntil: set.suspendedUntil })
  }),
)

usersAdmin.post(
  '/:id/coins',
  ah(async (req, res) => {
    const { delta, reason } = parse(
      z.object({ delta: z.number().int().refine(n => n !== 0, 'Must not be 0').refine(n => Math.abs(n) <= 1_000_000, 'Too large'), reason: z.string().trim().min(2).max(200) }),
      req.body,
    )
    const opts = { type: 'admin_adjust', title: reason, meta: { by: req.admin.name, adminId: String(req.admin._id) } }
    const balance = delta > 0 ? await creditCoins(req.params.id, delta, opts) : await debitCoins(req.params.id, -delta, opts)
    await audit(req, `${delta > 0 ? 'Added' : 'Deducted'} ${Math.abs(delta)} coins — ${reason}`, req.params.id, { delta, balance })
    res.json({ balance })
  }),
)
