import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { toUser } from '../../core/realtime.js'
import { notify } from '../notifications/notifications.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { Report, SupportTicket } from '../reports/reports.models.js'
import { applyStatus, endLiveFn, notReady, optModel, rx, sorting, withId, whoMap } from './admin.util.js'

// ── Reports ──────────────────────────────────────────────────────────────
export const reportsAdmin = Router()
reportsAdmin.use(requireAdmin(Admin, 'reports'))

async function decorateReports(rows) {
  const people = await whoMap(rows.flatMap(r => [r.reporter, mongoose.isValidObjectId(r.targetId) ? r.targetId : null]))
  return rows.map(r => {
    const t = people.get(String(r.targetId))
    return {
      ...withId(r),
      ts: r.createdAt,
      reporter: people.get(String(r.reporter)) || { id: String(r.reporter), name: r.reporterName },
      target: { type: r.targetType, id: r.targetId, name: t?.name || r.targetName || '', avatar: t?.avatar || null, owner: r.targetOwner ? String(r.targetOwner) : null },
    }
  })
}

reportsAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const status = ['open', 'resolved', 'dismissed'].includes(q.status) ? q.status : 'open'
    const base = {}
    if (['low', 'medium', 'high'].includes(q.priority)) base.priority = q.priority
    if (q.type && q.type !== 'all') base.targetType = q.type
    if (q.target) base.targetId = String(q.target)
    if (q.q) {
      const r = rx(q.q)
      base.$or = [{ reason: r }, { targetName: r }, { reporterName: r }, { targetId: q.q.trim() }, ...(/^[a-f\d]{24}$/i.test(q.q.trim()) ? [{ _id: q.q.trim() }] : [])]
    }
    const f = { ...base, status }
    // Open queue: high priority first, then oldest. Closed tabs: newest handled first.
    const sort = sorting(q, { ts: 'createdAt', priority: 'rank' }, status === 'open' ? { rank: 1, createdAt: 1 } : { handledAt: -1, createdAt: -1 })
    const [rows, total, counts] = await Promise.all([
      Report.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      Report.countDocuments(f),
      Report.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    res.json({ ...paged(await decorateReports(rows), total, pg), counts: Object.fromEntries(counts.map(c => [c._id, c.n])) })
  }),
)

reportsAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const r = await Report.findById(req.params.id).lean()
    if (!r) throw notFound('Report')
    const others = await Report.find({ targetType: r.targetType, targetId: r.targetId, _id: { $ne: r._id } }).sort({ createdAt: -1 }).limit(50).lean()
    const [report] = await decorateReports([r])
    res.json({ report, otherReports: await decorateReports(others) })
  }),
)

const ACTIONS = {
  dismiss: { status: 'dismissed', text: () => 'No violation' },
  warn: { status: 'resolved', text: r => `Warned ${r.targetType}` },
  remove: { status: 'resolved', text: r => `Removed ${r.targetType}` },
  suspend: { status: 'resolved', text: r => `Suspended ${r.targetType === 'host' ? 'host' : 'account'} 7 days` },
  ban: { status: 'resolved', text: r => `Banned ${r.targetType === 'host' ? 'host' : 'account'}` },
}

/** The account a report's action lands on: the user/host, or the owner of the content. */
function accountOf(r) {
  if (r.targetType === 'user' || r.targetType === 'host') return r.targetId
  return r.targetOwner ? String(r.targetOwner) : null
}

reportsAdmin.post(
  '/:id/resolve',
  ah(async (req, res) => {
    const { action, note } = parse(
      z.object({ action: z.enum(Object.keys(ACTIONS)), note: z.string().trim().max(1000).optional().default('') }),
      req.body,
    )
    const r = await Report.findById(req.params.id).lean()
    if (!r) throw notFound('Report')
    if (r.status !== 'open') throw conflict(`This report was already ${r.status}.`)
    const a = ACTIONS[action]
    const account = accountOf(r)
    const reasonText = note ? ` — ${note}` : ''
    const effects = []

    if (action === 'warn') {
      if (!account) throw badRequest('No account to warn for this target.')
      toUser(account, 'moderation:warning', { reason: r.reason, message: note || 'Please follow the REBU community rules.' })
      notify(account, { kind: 'safety', title: 'Warning from REBU', body: note || 'Please follow the REBU community rules.', push: 'always' })
      effects.push('warning sent')
    }
    if (action === 'remove') {
      if (r.targetType === 'live' || r.targetType === 'room') {
        const endLive = await endLiveFn()
        if (!endLive) throw notReady('Ending lives')
        await endLive(r.targetId, note || `Removed after report: ${r.reason}`, req.admin.name)
        effects.push(`${r.targetType} ended`)
      } else if (r.targetType === 'moment' && optModel('Moment')) {
        await optModel('Moment').updateOne({ _id: r.targetId }, { $set: { status: 'removed', removedReason: note } }, { strict: false })
        effects.push('moment removed')
      } else if (r.targetType === 'message' && optModel('Message')) {
        await optModel('Message').updateOne({ _id: r.targetId }, { $set: { removed: true, removedReason: note } }, { strict: false })
        effects.push('message removed')
      } else {
        throw badRequest(`Can’t remove a ${r.targetType} from here. Use suspend or ban on the account instead.`)
      }
    }
    if (action === 'suspend' || action === 'ban') {
      if (!account) throw badRequest('No account to act on for this target.')
      // Content owners (live/moment/message) who are hosts get their host block suspended too.
      const asHost = r.targetType === 'host' || (r.targetType !== 'user' && !!(await User.exists({ _id: account, 'host.approved': true })))
      const set = await applyStatus(
        account,
        { status: action === 'ban' ? 'banned' : 'suspended', reason: note || r.reason, days: action === 'suspend' ? 7 : undefined },
        { asHost },
      )
      if (!set) throw notFound('Account')
      await audit(req, `${action === 'ban' ? 'Banned' : 'Suspended 7 days'} ${r.targetType} (report ${r._id})${reasonText}`, account)
      effects.push(action === 'ban' ? 'account banned' : 'account suspended 7 days')
    }

    const updated = await Report.findOneAndUpdate(
      { _id: r._id, status: 'open' },
      { $set: { status: a.status, action: a.text(r), note, handledBy: req.admin.name, handledAt: new Date() } },
      { returnDocument: 'after' },
    ).lean()
    if (!updated) throw conflict('This report was handled by someone else.')
    await audit(req, `${a.status === 'dismissed' ? 'Dismissed' : 'Resolved'} report: ${a.text(r)}${reasonText}`, r._id, { effects })
    const [report] = await decorateReports([updated])
    res.json({ report, effects })
  }),
)

// ── Support tickets ──────────────────────────────────────────────────────
export const supportAdmin = Router()
supportAdmin.use(requireAdmin(Admin, 'support'))

const ticketRow = (t, people) => {
  const u = people.get(String(t.user))
  return { ...withId(t), ts: t.createdAt, updated: t.updatedAt, from: { type: t.fromType, id: String(t.user), name: u?.name || t.fromName, avatar: u?.avatar || null } }
}

supportAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const base = {}
    if (q.category && q.category !== 'all') base.category = q.category
    if (['low', 'medium', 'high'].includes(q.priority)) base.priority = q.priority
    if (q.assignee === 'me') base.assignee = req.admin.name
    else if (q.assignee === 'none') base.assignee = null
    if (q.q) {
      const r = rx(q.q)
      base.$or = [{ subject: r }, { fromName: r }, { 'messages.text': r }, ...(/^[a-f\d]{24}$/i.test(q.q.trim()) ? [{ _id: q.q.trim() }, { user: q.q.trim() }] : [])]
    }
    const f = { ...base }
    if (['open', 'pending', 'closed'].includes(q.status)) f.status = q.status
    const sort = sorting(q, { updated: 'updatedAt', created: 'createdAt' }, { updatedAt: -1 })
    const [rows, total, counts, categories] = await Promise.all([
      SupportTicket.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      SupportTicket.countDocuments(f),
      SupportTicket.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      SupportTicket.distinct('category'),
    ])
    const people = await whoMap(rows.map(t => t.user))
    res.json({ ...paged(rows.map(t => ticketRow(t, people)), total, pg), counts: Object.fromEntries(counts.map(c => [c._id, c.n])), categories })
  }),
)

async function loadTicket(id) {
  const t = await SupportTicket.findById(id).lean()
  if (!t) throw notFound('Ticket')
  return t
}

supportAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const t = await loadTicket(req.params.id)
    const [people, others] = await Promise.all([
      whoMap([t.user]),
      SupportTicket.find({ user: t.user, _id: { $ne: t._id } }, { subject: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(10).lean(),
    ])
    res.json({ ticket: ticketRow(t, people), otherTickets: others.map(withId) })
  }),
)

async function patchTicket(req, update, action) {
  const t = await SupportTicket.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).lean()
  if (!t) throw notFound('Ticket')
  await audit(req, action, t._id)
  return ticketRow(t, await whoMap([t.user]))
}

supportAdmin.post(
  '/:id/reply',
  ah(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body)
    const t = await loadTicket(req.params.id)
    const ticket = await patchTicket(
      req,
      { $push: { messages: { by: 'admin', name: req.admin.name, text } }, $set: { status: 'pending', closedAt: null, ...(t.assignee ? {} : { assignee: req.admin.name }) } },
      'Replied to ticket',
    )
    toUser(t.user, 'support:reply', { ticketId: String(t._id), text })
    notify(t.user, { kind: 'support', title: 'REBU support replied', body: text.slice(0, 120), deeplink: `rebu://support/${t._id}` })
    res.json({ ticket })
  }),
)

supportAdmin.post(
  '/:id/assign',
  ah(async (req, res) => {
    const { assignee } = parse(z.object({ assignee: z.string().trim().max(80).nullable().optional() }), req.body || {})
    const name = assignee === undefined ? req.admin.name : assignee
    const ticket = await patchTicket(req, { $set: { assignee: name || null } }, name ? `Assigned ticket to ${name === req.admin.name ? 'self' : name}` : 'Unassigned ticket')
    res.json({ ticket })
  }),
)

supportAdmin.patch(
  '/:id',
  ah(async (req, res) => {
    const { priority } = parse(z.object({ priority: z.enum(['low', 'medium', 'high']) }).strict(), req.body)
    const ticket = await patchTicket(req, { $set: { priority } }, `Set ticket priority to ${priority}`)
    res.json({ ticket })
  }),
)

supportAdmin.post(
  '/:id/close',
  ah(async (req, res) => {
    const ticket = await patchTicket(req, { $set: { status: 'closed', closedAt: new Date() } }, 'Closed ticket')
    res.json({ ticket })
  }),
)

supportAdmin.post(
  '/:id/pending',
  ah(async (req, res) => {
    const ticket = await patchTicket(req, { $set: { status: 'pending', closedAt: null } }, 'Marked ticket pending')
    res.json({ ticket })
  }),
)

supportAdmin.post(
  '/:id/reopen',
  ah(async (req, res) => {
    const ticket = await patchTicket(req, { $set: { status: 'open', closedAt: null } }, 'Reopened ticket')
    res.json({ ticket })
  }),
)
