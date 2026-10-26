import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin, ROLES } from '../admins/admin.model.js'
import { AuditLog, audit } from '../audit/audit.model.js'
import { rx, withId } from './admin.util.js'

// ── Admins & roles (only super_admin has the 'admins' section) ───────────
export const adminsAdmin = Router()
adminsAdmin.use(requireAdmin(Admin, 'admins'))

const roleEnum = z.enum(Object.keys(ROLES))
const label = r => r.replace('_', ' ')

/** Load a target admin; you can't change your own account from here. */
async function target(req) {
  if (String(req.admin._id) === req.params.id) throw forbidden('You can’t change your own admin account.')
  const a = await Admin.findById(req.params.id)
  if (!a) throw notFound('Admin')
  return a
}

/** Throws unless another active super_admin remains after `a` stops being one. */
async function keepOneSuper(a) {
  if (a.role !== 'super_admin' || a.status !== 'active') return
  const others = await Admin.countDocuments({ _id: { $ne: a._id }, role: 'super_admin', status: 'active' })
  if (!others) throw conflict('There must always be at least one active super admin.', 'last_super_admin')
}

adminsAdmin.get(
  '/',
  ah(async (req, res) => {
    const rows = await Admin.find({}, { passwordHash: 0 }).sort({ createdAt: 1 }).lean()
    res.json({ items: rows.map(withId), total: rows.length, roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v])) })
  }),
)

adminsAdmin.post(
  '/',
  ah(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().toLowerCase().email(), role: roleEnum }).strict(), req.body)
    if (await Admin.exists({ email: b.email })) throw conflict('An admin with that email already exists.', 'duplicate')
    // Shown once; only the hash is stored. They should change it after first login.
    const tempPassword = crypto.randomBytes(9).toString('base64url')
    const a = await Admin.create({ ...b, passwordHash: await Admin.hash(tempPassword) })
    await audit(req, `Invited admin ${a.name} (${label(a.role)})`, a._id)
    res.status(201).json({ admin: a.toJSON(), tempPassword })
  }),
)

adminsAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    const { role } = parse(z.object({ role: roleEnum }).strict(), req.body)
    const a = await target(req)
    if (a.role === role) return res.json({ admin: a.toJSON() })
    if (role !== 'super_admin') await keepOneSuper(a)
    const from = a.role
    a.role = role
    await a.save()
    await audit(req, `Changed role ${label(from)} → ${label(role)} for ${a.name}`, a._id)
    res.json({ admin: a.toJSON() })
  }),
)

adminsAdmin.post(
  '/:id/status',
  ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body)
    const a = await target(req)
    if (status === 'disabled') await keepOneSuper(a)
    a.status = status
    await a.save()
    await audit(req, `${status === 'active' ? 'Enabled' : 'Disabled'} admin ${a.name}`, a._id)
    res.json({ admin: a.toJSON() })
  }),
)

adminsAdmin.delete(
  '/:id',
  ah(async (req, res) => {
    const a = await target(req)
    await keepOneSuper(a)
    await a.deleteOne()
    await audit(req, `Removed admin ${a.name} (${label(a.role)})`, a._id)
    res.json({ ok: true })
  }),
)

// ── Audit log ────────────────────────────────────────────────────────────
export const auditAdmin = Router()
auditAdmin.use(requireAdmin(Admin, 'audit'))

auditAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const f = {}
    if (q.admin && q.admin !== 'all') f[/^[a-f\d]{24}$/i.test(q.admin) ? 'admin' : 'adminName'] = q.admin
    const range = {}
    if (q.days) range.$gte = new Date(Date.now() - Number(q.days) * 24 * 3600 * 1000)
    if (q.from) range.$gte = new Date(q.from)
    if (q.to) range.$lte = new Date(q.to)
    if (Object.values(range).some(d => Number.isNaN(d.getTime()))) throw badRequest('Invalid date')
    if (Object.keys(range).length) f.createdAt = range
    if (q.target) f.target = String(q.target)
    if (q.q) f.$or = [{ action: rx(q.q) }, { target: rx(q.q) }, { adminName: rx(q.q) }]
    const [rows, total, admins] = await Promise.all([
      AuditLog.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      AuditLog.countDocuments(f),
      AuditLog.distinct('adminName'),
    ])
    res.json({ ...paged(rows.map(r => ({ ...withId(r), ts: r.createdAt, admin: r.adminName, adminId: r.admin ? String(r.admin) : null })), total, pg), admins })
  }),
)
