import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { AUDIENCES, Banner, bannerStatus, Notification, Page, PLACEMENTS } from './content.models.js'
import { DAY, rx, withId } from './admin.util.js'
import { deliverBroadcast } from '../notifications/notifications.js'

export const contentAdmin = Router()
contentAdmin.use(requireAdmin(Admin, 'content'))

const deeplink = z.string().trim().regex(/^rebu:\/\/\S+$/, 'Deeplinks start with rebu://')
const httpUrl = z.string().trim().regex(/^https?:\/\/\S+$/, 'Use a full http(s) URL')
const date = z.coerce.date()

// ── Banners ──────────────────────────────────────────────────────────────
const bannerRow = b => ({ ...withId(b), status: bannerStatus(b) })
const bannerFields = {
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160),
  image: z.union([z.literal(''), httpUrl]),
  cta: z.string().trim().max(30),
  link: z.union([z.literal(''), deeplink]),
  placement: z.enum(PLACEMENTS),
  color: z.string().trim().max(30),
  startsAt: date,
  endsAt: date,
  // The panel sends status; only "draft" vs anything else matters.
  status: z.enum(['draft', 'live', 'scheduled', 'published']),
  draft: z.boolean(),
}
const toBanner = ({ status, ...b }) => (status ? { ...b, draft: status === 'draft' } : b)
const datesOk = b => !(b.startsAt && b.endsAt && b.endsAt < b.startsAt)

const BANNER_TABS = {
  live: now => ({ draft: false, startsAt: { $lte: now }, endsAt: { $gte: now } }),
  scheduled: now => ({ draft: false, startsAt: { $gt: now } }),
  ended: now => ({ draft: false, endsAt: { $lt: now } }),
  draft: () => ({ draft: true }),
}

contentAdmin.get(
  '/banners',
  ah(async (req, res) => {
    const pg = paging(req.query)
    const now = new Date()
    const f = BANNER_TABS[req.query.status]?.(now) || {}
    if (req.query.placement) f.placement = req.query.placement
    if (req.query.q) f.title = rx(req.query.q)
    const [rows, total] = await Promise.all([Banner.find(f).sort({ startsAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Banner.countDocuments(f)])
    const counts = Object.fromEntries(await Promise.all(Object.entries(BANNER_TABS).map(async ([k, fn]) => [k, await Banner.countDocuments(fn(now))])))
    res.json({ ...paged(rows.map(bannerRow), total, pg), counts })
  }),
)

contentAdmin.post(
  '/banners',
  ah(async (req, res) => {
    const body = toBanner(parse(z.object(bannerFields).partial({ subtitle: true, image: true, cta: true, link: true, color: true, status: true, draft: true }).refine(datesOk, 'End date is before the start date'), req.body))
    const b = await Banner.create({ ...body, updatedBy: req.admin.name })
    await audit(req, `Created banner “${b.title}”${b.draft ? ' (draft)' : ''}`, b._id)
    res.status(201).json({ banner: bannerRow(b.toObject()) })
  }),
)

contentAdmin.patch(
  '/banners/:id',
  ah(async (req, res) => {
    const body = toBanner(parse(z.object(bannerFields).partial(), req.body))
    if (!Object.keys(body).length) throw badRequest('Nothing to update.')
    const cur = await Banner.findById(req.params.id).lean()
    if (!cur) throw notFound('Banner')
    if (!datesOk({ ...cur, ...body })) throw badRequest('End date is before the start date')
    const b = await Banner.findByIdAndUpdate(cur._id, { $set: { ...body, updatedBy: req.admin.name } }, { returnDocument: 'after' }).lean()
    const action =
      'draft' in body && Object.keys(body).length === 1
        ? body.draft ? 'Unpublished banner' : 'Published banner'
        : `Updated banner “${b.title}”${b.draft ? ' (draft)' : ''}`
    await audit(req, action, b._id)
    res.json({ banner: bannerRow(b) })
  }),
)

contentAdmin.delete(
  '/banners/:id',
  ah(async (req, res) => {
    const b = await Banner.findByIdAndDelete(req.params.id).lean()
    if (!b) throw notFound('Banner')
    await audit(req, `Deleted banner “${b.title}”`, b._id)
    res.json({ ok: true })
  }),
)

// ── Push notifications ───────────────────────────────────────────────────
/** Rough reach per audience (what the send would target). */
async function reachOf(audience) {
  const now = Date.now()
  const users = { 'host.approved': { $ne: true }, status: 'active' }
  const hosts = { 'host.approved': true, 'host.status': 'active' }
  switch (audience) {
    case 'Paying users': return User.countDocuments({ ...users, spent: { $gt: 0 } })
    case 'VIP members': return User.countDocuments({ ...users, 'vip.level': { $gt: 0 }, 'vip.until': { $gt: new Date() } })
    case 'Inactive 14+ days': return User.countDocuments({ ...users, lastActive: { $lt: new Date(now - 14 * DAY) } })
    case 'New users (7 days)': return User.countDocuments({ ...users, createdAt: { $gte: new Date(now - 7 * DAY) } })
    case 'All hosts': return User.countDocuments(hosts)
    case 'Hosts offline today': return User.countDocuments({ ...hosts, 'host.online': { $ne: true } })
    case 'Followers of live hosts': {
      const live = (await User.find({ ...hosts, 'host.online': true }, { _id: 1 }).lean()).map(u => u._id)
      return live.length ? User.countDocuments({ status: 'active', following: { $in: live } }) : 0
    }
    default: return User.countDocuments(users)
  }
}

const notifBody = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(300),
    audience: z.enum(AUDIENCES),
    deeplink: z.union([z.literal(''), deeplink]).optional(),
    sendNow: z.boolean().optional(),
    scheduledAt: date.optional(),
    draft: z.boolean().optional(),
  })
  .strict()

contentAdmin.get(
  '/notifications',
  ah(async (req, res) => {
    const pg = paging(req.query)
    const f = {}
    if (['sent', 'scheduled', 'draft', 'cancelled'].includes(req.query.status)) f.status = req.query.status
    if (req.query.q) f.$or = [{ title: rx(req.query.q) }, { body: rx(req.query.q) }]
    const [rows, total] = await Promise.all([Notification.find(f).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Notification.countDocuments(f)])
    res.json(paged(rows.map(withId), total, pg))
  }),
)

contentAdmin.get(
  '/notifications/reach',
  ah(async (req, res) => {
    const { audience } = parse(z.object({ audience: z.enum(AUDIENCES) }), req.query)
    res.json({ audience, reach: await reachOf(audience) })
  }),
)

contentAdmin.post(
  '/notifications',
  ah(async (req, res) => {
    const b = parse(notifBody.partial({ audience: true }), req.body)
    b.audience ||= 'All users'
    const now = new Date()
    let doc
    if (b.sendNow) {
      const reach = await reachOf(b.audience)
      // Delivered (inbox + push) right after the response; see deliverBroadcast().
      doc = { status: 'sent', sentAt: now, audienceCount: reach }
    } else if (b.scheduledAt && !b.draft) {
      if (b.scheduledAt <= now) throw badRequest('Pick a time in the future.')
      // The notifications module's scheduler sends it at scheduledAt.
      doc = { status: 'scheduled', scheduledAt: b.scheduledAt }
    } else doc = { status: 'draft', scheduledAt: b.scheduledAt }
    const n = await Notification.create({ title: b.title, body: b.body, audience: b.audience, deeplink: b.deeplink || '', ...doc, createdBy: req.admin.name })
    const verb = { sent: 'Sent', scheduled: 'Scheduled', draft: 'Saved draft' }[n.status]
    await audit(req, `${verb} push “${n.title}” to ${n.audience}`, n._id, { audienceCount: n.audienceCount })
    if (n.status === 'sent') deliverBroadcast(n.toObject()).catch(e => console.error('[broadcast]', e.message))
    res.status(201).json({ notification: withId(n.toObject()) })
  }),
)

contentAdmin.patch(
  '/notifications/:id',
  ah(async (req, res) => {
    const b = parse(notifBody.omit({ sendNow: true, draft: true }).partial(), req.body)
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, status: { $in: ['draft', 'scheduled'] } }, { $set: b }, { returnDocument: 'after' }).lean()
    if (!n) {
      if (!(await Notification.exists({ _id: req.params.id }))) throw notFound('Notification')
      throw conflict('Only drafts and scheduled pushes can be edited.')
    }
    await audit(req, `Updated push “${n.title}”`, n._id)
    res.json({ notification: withId(n) })
  }),
)

contentAdmin.post(
  '/notifications/:id/cancel',
  ah(async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, status: 'scheduled' }, { $set: { status: 'cancelled' } }, { returnDocument: 'after' }).lean()
    if (!n) {
      if (!(await Notification.exists({ _id: req.params.id }))) throw notFound('Notification')
      throw conflict('Only scheduled pushes can be cancelled.')
    }
    await audit(req, `Cancelled scheduled push “${n.title}”`, n._id)
    res.json({ notification: withId(n) })
  }),
)

contentAdmin.delete(
  '/notifications/:id',
  ah(async (req, res) => {
    const n = await Notification.findOneAndDelete({ _id: req.params.id, status: { $ne: 'sent' } }).lean()
    if (!n) {
      if (!(await Notification.exists({ _id: req.params.id }))) throw notFound('Notification')
      throw conflict('Sent pushes are kept for the record.')
    }
    await audit(req, `Deleted push “${n.title}”`, n._id)
    res.json({ ok: true })
  }),
)

// ── Pages & policies ─────────────────────────────────────────────────────
const pageRow = p => ({ ...withId(p), updated: p.updatedAt })
const pageFields = {
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Use lowercase letters, digits and dashes'),
  title: z.string().trim().min(1).max(120),
  body: z.string().max(100_000),
  published: z.boolean(),
}

contentAdmin.get(
  '/pages',
  ah(async (req, res) => {
    const rows = await Page.find(req.query.q ? { $or: [{ title: rx(req.query.q) }, { slug: rx(req.query.q) }] } : {}).sort({ title: 1 }).lean()
    res.json({ items: rows.map(pageRow), total: rows.length })
  }),
)

contentAdmin.get(
  '/pages/:id',
  ah(async (req, res) => {
    const p = await Page.findById(req.params.id).lean()
    if (!p) throw notFound('Page')
    res.json({ page: pageRow(p) })
  }),
)

contentAdmin.post(
  '/pages',
  ah(async (req, res) => {
    const b = parse(z.object(pageFields).partial({ body: true, published: true }), req.body)
    if (await Page.exists({ slug: b.slug })) throw conflict(`A page with slug “${b.slug}” already exists.`, 'duplicate')
    const p = await Page.create({ ...b, updatedBy: req.admin.name })
    await audit(req, `Created page “${p.title}”`, p._id)
    res.status(201).json({ page: pageRow(p.toObject()) })
  }),
)

contentAdmin.patch(
  '/pages/:id',
  ah(async (req, res) => {
    const b = parse(z.object(pageFields).partial(), req.body)
    if (!Object.keys(b).length) throw badRequest('Nothing to update.')
    if (b.slug && (await Page.exists({ slug: b.slug, _id: { $ne: req.params.id } }))) throw conflict(`A page with slug “${b.slug}” already exists.`, 'duplicate')
    const p = await Page.findByIdAndUpdate(req.params.id, { $set: { ...b, updatedBy: req.admin.name } }, { returnDocument: 'after' }).lean()
    if (!p) throw notFound('Page')
    await audit(req, `Updated page “${p.title}”`, p._id)
    res.json({ page: pageRow(p) })
  }),
)

contentAdmin.delete(
  '/pages/:id',
  ah(async (req, res) => {
    const p = await Page.findByIdAndDelete(req.params.id).lean()
    if (!p) throw notFound('Page')
    await audit(req, `Deleted page “${p.title}”`, p._id)
    res.json({ ok: true })
  }),
)

// ── Public (app) content — mount in app.js, e.g. api.use('/content', publicContentRoutes) ──
export const publicContentRoutes = Router()

publicContentRoutes.get(
  '/banners',
  ah(async (req, res) => {
    const now = new Date()
    const f = { draft: false, startsAt: { $lte: now }, endsAt: { $gte: now } }
    if (req.query.placement) f.placement = String(req.query.placement)
    const rows = await Banner.find(f, { title: 1, subtitle: 1, image: 1, cta: 1, link: 1, placement: 1, color: 1, endsAt: 1 }).sort({ startsAt: -1 }).limit(20).lean()
    res.json({ items: rows.map(b => ({ ...withId(b), _id: undefined })) })
  }),
)

publicContentRoutes.get(
  '/pages/:slug',
  ah(async (req, res) => {
    const p = await Page.findOne({ slug: String(req.params.slug).toLowerCase(), published: { $ne: false } }, { slug: 1, title: 1, body: 1, updatedAt: 1 }).lean()
    if (!p) throw notFound('Page')
    res.json({ page: { slug: p.slug, title: p.title, body: p.body, updated: p.updatedAt } })
  }),
)
