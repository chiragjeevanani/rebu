import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { toAdmins } from '../../core/realtime.js'
import { User } from '../users/user.model.js'
import { Report, REPORT_TARGETS, PRIORITY_RANK, SupportTicket } from './reports.models.js'
import { priorityFor, maybeAutoSuspend } from './reports.service.js'
import { flagMoment } from '../moments/moments.js'

// Mounted at /api/reports behind requireUser.
export const reportsRoutes = Router()

const displayName = u => u?.host?.approved ? u.host.displayName || u.name : u?.name

/** Name + owner of the reported thing, when we can find it. */
async function resolveTarget(type, id) {
  if (type === 'user' || type === 'host') {
    if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid targetId')
    const u = await User.findById(id, { name: 1, host: 1 }).lean()
    if (!u) throw notFound('User')
    if (type === 'host' && !u.host?.approved) throw badRequest('That account is not a host.')
    return { targetName: displayName(u), targetOwner: u._id }
  }
  if (type === 'moment') {
    const hit = await flagMoment(id)
    if (!hit) throw notFound('Moment')
    return hit
  }
  if ((type === 'live' || type === 'room') && mongoose.models.Live && mongoose.isValidObjectId(id)) {
    const l = await mongoose.models.Live.findById(id).lean()
    if (l) return { targetName: l.title || 'Live', targetOwner: l.host || l.owner || null }
  }
  return { targetName: '', targetOwner: null }
}

reportsRoutes.post(
  '/',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        targetType: z.enum(REPORT_TARGETS),
        targetId: z.string().trim().min(1).max(64),
        reason: z.string().trim().min(2).max(120),
        details: z.string().trim().max(2000).optional(),
      }),
      req.body,
    )
    if (String(req.user._id) === body.targetId) throw badRequest('You can’t report yourself.')
    // One open report per reporter per target, so a single user can't trigger auto-suspend.
    const dup = await Report.exists({ reporter: req.user._id, targetType: body.targetType, targetId: body.targetId, status: 'open' })
    if (dup) throw conflict('You already reported this. Our team is reviewing it.', 'already_reported')

    const target = await resolveTarget(body.targetType, body.targetId)
    const priority = priorityFor(body.reason, body.details)
    const report = await Report.create({
      ...body,
      ...target,
      reporter: req.user._id,
      reporterName: displayName(req.user),
      priority,
      rank: PRIORITY_RANK[priority],
    })
    toAdmins('report:new', { id: String(report._id), priority })
    const autoSuspended = await maybeAutoSuspend(body.targetType, body.targetId)
    res.status(201).json({ report: { id: String(report._id), status: report.status, priority }, autoSuspended })
  }),
)

// ── Support tickets ──────────────────────────────────────────────────────
const ticketOut = t => ({ ...t, id: String(t._id) })

reportsRoutes.post(
  '/support',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        subject: z.string().trim().min(3).max(140),
        category: z.string().trim().min(2).max(40),
        message: z.string().trim().min(1).max(4000),
      }),
      req.body,
    )
    const isHost = !!req.user.host?.approved
    const name = displayName(req.user)
    const t = await SupportTicket.create({
      user: req.user._id,
      fromType: isHost ? 'host' : 'user',
      fromName: name,
      subject: body.subject,
      category: body.category,
      priority: /payment|refund|withdraw|coin/i.test(body.category) ? 'high' : 'medium',
      messages: [{ by: 'user', name, text: body.message }],
    })
    toAdmins('support:new', { id: String(t._id) })
    res.status(201).json({ ticket: ticketOut(t.toObject()) })
  }),
)

reportsRoutes.get(
  '/support',
  ah(async (req, res) => {
    const pg = paging(req.query)
    const filter = { user: req.user._id }
    const [items, total] = await Promise.all([
      SupportTicket.find(filter).sort({ updatedAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
      SupportTicket.countDocuments(filter),
    ])
    res.json(paged(items.map(ticketOut), total, pg))
  }),
)

reportsRoutes.get(
  '/support/:id',
  ah(async (req, res) => {
    const t = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id }).lean()
    if (!t) throw notFound('Ticket')
    res.json({ ticket: ticketOut(t) })
  }),
)

reportsRoutes.post(
  '/support/:id/messages',
  ah(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body)
    // A user reply always puts the ticket back in the open queue.
    const t = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { messages: { by: 'user', name: displayName(req.user), text } }, $set: { status: 'open', closedAt: null } },
      { returnDocument: 'after' },
    ).lean()
    if (!t) throw notFound('Ticket')
    toAdmins('support:message', { id: String(t._id) })
    res.json({ ticket: ticketOut(t) })
  }),
)
