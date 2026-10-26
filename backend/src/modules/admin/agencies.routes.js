import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { Agency } from '../hosts/hosts.models.js'
import { Earning } from '../earnings/earnings.models.js'
import { round2, rx, sorting, withId } from './admin.util.js'

export const agenciesAdmin = Router()
agenciesAdmin.use(requireAdmin(Admin, 'agencies'))

const agencyBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    code: z.string().trim().transform(s => s.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{4,12}$/, 'Code must be 4–12 letters or digits')),
    owner: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    email: z.union([z.literal(''), z.string().trim().email()]).optional(),
    city: z.string().trim().max(60).optional(),
    cut: z.number().min(0).max(30).optional(),
  })
  .strict()

/** Host count and this month's agency share per agency. */
async function statsFor(ids) {
  const month = new Date()
  month.setDate(1)
  month.setHours(0, 0, 0, 0)
  const [hosts, earn] = await Promise.all([
    User.aggregate([{ $match: { 'host.approved': true, 'host.agencyId': { $in: ids } } }, { $group: { _id: '$host.agencyId', n: { $sum: 1 }, online: { $sum: { $cond: ['$host.online', 1, 0] } } } }]),
    Earning.aggregate([
      { $match: { agencyId: { $in: ids }, status: { $ne: 'reversed' }, createdAt: { $gte: month } } },
      { $group: { _id: '$agencyId', agency: { $sum: '$agency' }, net: { $sum: '$net' } } },
    ]),
  ])
  const h = new Map(hosts.map(x => [String(x._id), x]))
  const e = new Map(earn.map(x => [String(x._id), x]))
  return a => ({
    ...withId(a),
    created: a.createdAt,
    hosts: h.get(String(a._id))?.n || 0,
    hostsOnline: h.get(String(a._id))?.online || 0,
    monthEarnings: round2(e.get(String(a._id))?.agency || 0),
    monthHostNet: round2(e.get(String(a._id))?.net || 0),
  })
}

agenciesAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const f = {}
    if (q.status === 'active' || q.status === 'suspended') f.status = q.status
    if (q.q) {
      const r = rx(q.q)
      f.$or = [{ name: r }, { code: r }, { owner: r }, { city: r }]
    }
    const sort = sorting(q, { name: 'name', code: 'code', created: 'createdAt', cut: 'cut' }, { createdAt: -1 })
    const [rows, total] = await Promise.all([Agency.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(), Agency.countDocuments(f)])
    const row = await statsFor(rows.map(a => a._id))
    res.json(paged(rows.map(row), total, pg))
  }),
)

agenciesAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const a = await Agency.findById(req.params.id).lean()
    if (!a) throw notFound('Agency')
    const row = await statsFor([a._id])
    const hosts = await User.find({ 'host.approved': true, 'host.agencyId': a._id }, { name: 1, photos: 1, host: 1 }).limit(200).lean()
    res.json({
      agency: row(a),
      hosts: hosts.map(u => ({ id: String(u._id), name: u.host.displayName || u.name, avatar: u.host.photos?.[0] || u.photos?.[0] || null, level: u.host.levelOverride || u.host.level, status: u.host.status, online: u.host.online })),
    })
  }),
)

agenciesAdmin.post(
  '/',
  ah(async (req, res) => {
    const body = parse(agencyBody, req.body)
    if (await Agency.exists({ code: body.code })) throw conflict(`Code ${body.code} is already used.`, 'duplicate')
    const a = await Agency.create(body)
    await audit(req, `Created agency ${a.name} (${a.code})`, a._id)
    const row = await statsFor([a._id])
    res.status(201).json({ agency: row(a.toObject()) })
  }),
)

agenciesAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    const body = parse(agencyBody.partial(), req.body)
    if (!Object.keys(body).length) throw badRequest('Nothing to update.')
    if (body.code && (await Agency.exists({ code: body.code, _id: { $ne: req.params.id } }))) throw conflict(`Code ${body.code} is already used.`, 'duplicate')
    const a = await Agency.findByIdAndUpdate(req.params.id, { $set: body }, { returnDocument: 'after', runValidators: true }).lean()
    if (!a) throw notFound('Agency')
    await audit(req, `Updated agency ${a.name} (${a.code}): ${Object.keys(body).join(', ')}`, a._id)
    const row = await statsFor([a._id])
    res.json({ agency: row(a) })
  }),
)

agenciesAdmin.post(
  '/:id/status',
  ah(async (req, res) => {
    const { status, reason } = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().max(300).optional().default('') }), req.body)
    if (status === 'suspended' && !reason) throw badRequest('Give a reason.')
    const a = await Agency.findByIdAndUpdate(req.params.id, { $set: { status } }, { returnDocument: 'after' }).lean()
    if (!a) throw notFound('Agency')
    await audit(req, `${status === 'active' ? 'Activated' : 'Suspended'} agency ${a.name} (${a.code})${reason ? ` — ${reason}` : ''}`, a._id)
    const row = await statsFor([a._id])
    res.json({ agency: row(a) })
  }),
)

agenciesAdmin.delete(
  '/:id',
  ah(async (req, res) => {
    const a = await Agency.findById(req.params.id).lean()
    if (!a) throw notFound('Agency')
    const n = await User.countDocuments({ 'host.agencyId': a._id })
    if (n) throw conflict(`${n} host(s) still belong to this agency. Move them first.`, 'agency_has_hosts')
    await Agency.deleteOne({ _id: a._id })
    await audit(req, `Deleted agency ${a.name} (${a.code})`, a._id)
    res.json({ ok: true })
  }),
)
